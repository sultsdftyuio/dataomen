import logging
import os
import time
import threading
from datetime import datetime, timezone, timedelta
from enum import StrEnum
from typing import Dict, Any, Optional, Tuple

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from pydantic import BaseModel, ValidationError
import resend
from supabase import create_client, Client, ClientOptions

from api.recovery_common import FailureStage, RECOVERY_EMAIL_TABLE, RecoveryStatus

logger = logging.getLogger(__name__)


class MetricsSink:
    def increment(self, name: str, value: int = 1, tags: Optional[Dict[str, str]] = None) -> None:
        logger.info("metric_increment name=%s value=%s tags=%s", name, value, tags)

    def timing(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        logger.info("metric_timing name=%s value=%s tags=%s", name, round(value, 6), tags)


METRICS = MetricsSink()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

redis_broker = RedisBroker(url=REDIS_URL)
dramatiq.set_broker(redis_broker)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    logger.warning("resend_api_key_missing")

FROM_EMAIL = os.getenv("RECOVERY_EMAIL_FROM", "Arcli <noreply@arcli.tech>")
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://arcli.tech")

RECOVERY_DLQ_TABLE = os.getenv("RECOVERY_DLQ_TABLE", "recovery_email_dlq")
RECOVERY_EMAIL_EVENTS_TABLE = os.getenv("RECOVERY_EMAIL_EVENTS_TABLE", "recovery_email_events")
RECOVERY_DISPATCH_TOKEN_RPC = os.getenv(
    "RECOVERY_DISPATCH_TOKEN_RPC",
    "claim_dispatch_token",
)
RECOVERY_ATTEMPT_RESERVATION_RPC = os.getenv(
    "RECOVERY_ATTEMPT_RESERVATION_RPC",
    "reserve_recovery_attempt",
)

MAX_SEND_ATTEMPTS = int(os.getenv("RECOVERY_MAX_SEND_ATTEMPTS", "5"))
RETRY_BACKOFF_SECONDS = int(os.getenv("RECOVERY_RETRY_BACKOFF_SECONDS", "300"))


class ProviderSendStatus(StrEnum):
    ACCEPTED = "accepted"
    FAILED_TRANSIENT = "failed_transient"
    FAILED_PERMANENT = "failed_permanent"


_supabase_client: Optional[Client] = None
_thread_local = threading.local()


class RecoverySendRecord(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    email: str
    campaign_type: str
    status: RecoveryStatus = RecoveryStatus.PENDING_DISPATCH
    dispatch_token: Optional[str] = None
    dispatch_attempt: int = 0
    attempt_count: int = 0
    next_retry_at: Optional[str] = None
    provider_message_id: Optional[str] = None
    last_error: Optional[str] = None
    created_at: Optional[str] = None


class SendResult(BaseModel):
    status: ProviderSendStatus
    provider_message_id: Optional[str] = None
    retryable: bool = False
    error: Optional[str] = None


class DispatchTokenClaimResponse(BaseModel):
    claimed: bool
    state: Optional[str] = None


class TemplateRenderer:
    def render(self, campaign_type: str) -> Tuple[str, str]:
        if campaign_type == "billing_failed":
            subject = "Update your billing to keep Arcli running"
            html = (
                "<h2>Your payment did not go through</h2>"
                "<p>Please update your billing details to avoid service interruption.</p>"
                f"<p><a href=\"{APP_BASE_URL}/settings/billing\">Update billing</a></p>"
            )
            return subject, html

        if campaign_type == "cancellation_followup":
            subject = "We would love to win you back"
            html = (
                "<h2>We noticed you cancelled</h2>"
                "<p>If you are open to it, we would love to learn why and offer help.</p>"
                f"<p><a href=\"{APP_BASE_URL}/support\">Talk to support</a></p>"
            )
            return subject, html

        if campaign_type == "feedback_recovery":
            subject = "We heard your feedback"
            html = (
                "<h2>Thanks for letting us know</h2>"
                "<p>We are addressing the issues you reported and want to help.</p>"
                f"<p><a href=\"{APP_BASE_URL}/support\">Get help</a></p>"
            )
            return subject, html

        subject = "We miss you at Arcli"
        html = (
            "<h2>We have not seen you in a while</h2>"
            "<p>Come back to Arcli to see whats new and keep your data healthy.</p>"
            f"<p><a href=\"{APP_BASE_URL}/login\">Sign in</a></p>"
        )
        return subject, html


class ResendEmailProvider:
    def send(
        self,
        to_email: str,
        subject: str,
        html: str,
        dispatch_token: Optional[str] = None,
    ) -> SendResult:
        if not resend.api_key:
            return SendResult(
                status=ProviderSendStatus.FAILED_PERMANENT,
                retryable=False,
                error="resend_api_key_missing",
            )

        try:
            payload: Dict[str, Any] = {
                "from": FROM_EMAIL,
                "to": [to_email],
                "subject": subject,
                "html": html,
                "headers": {
                    "X-Dispatch-Token": dispatch_token or "",
                    "X-Idempotency-Key": dispatch_token or "",
                },
            }
            if not dispatch_token:
                payload.pop("headers", None)

            response = resend.Emails.send(payload)
        except Exception as exc:
            retryable = _is_retryable_error(exc)
            return SendResult(
                status=ProviderSendStatus.FAILED_TRANSIENT if retryable else ProviderSendStatus.FAILED_PERMANENT,
                retryable=retryable,
                error=str(exc),
            )

        message_id = _extract_message_id(response)
        return SendResult(
            status=ProviderSendStatus.ACCEPTED,
            provider_message_id=message_id,
            retryable=False,
        )


class RecoveryRepository:
    def __init__(self, client: Client):
        self.client = client

    def write_event(self, send_id: str, event_type: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        if not send_id or not event_type:
            return

        payload = {
            "send_id": send_id,
            "event_type": event_type,
            "metadata": metadata or {},
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            self.client.table(RECOVERY_EMAIL_EVENTS_TABLE).insert(payload).execute()
        except Exception:
            logger.exception(
                "recovery_email_event_write_failed send_id=%s event_type=%s",
                send_id,
                event_type,
            )

    def fetch_send_by_id(self, tenant_id: str, send_id: str) -> Optional[RecoverySendRecord]:
        resp = (
            self.client
            .table(RECOVERY_EMAIL_TABLE)
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("id", send_id)
            .limit(1)
            .execute()
        )

        if not resp.data:
            return None

        try:
            return RecoverySendRecord.model_validate(resp.data[0])
        except ValidationError:
            logger.exception(
                "recovery_send_record_invalid tenant=%s send_id=%s",
                tenant_id,
                send_id,
            )
            return None

    def claim_dispatch_token(self, dispatch_token: str, tenant_id: str, send_id: str) -> DispatchTokenClaimResponse:
        payload = {
            "p_dispatch_token": dispatch_token,
            "p_tenant_id": tenant_id,
            "p_send_id": send_id,
        }

        try:
            resp = self.client.rpc(RECOVERY_DISPATCH_TOKEN_RPC, payload).execute()
        except Exception:
            logger.exception("dispatch_token_claim_failed tenant=%s send_id=%s", tenant_id, send_id)
            return DispatchTokenClaimResponse(claimed=False, state="error")

        if not resp.data:
            return DispatchTokenClaimResponse(claimed=False, state="missing")

        payload = resp.data
        if isinstance(payload, list):
            payload = payload[0] if payload else None

        if not payload:
            return DispatchTokenClaimResponse(claimed=False, state="missing")

        try:
            return DispatchTokenClaimResponse.model_validate(payload)
        except ValidationError:
            logger.exception("dispatch_token_claim_invalid tenant=%s send_id=%s", tenant_id, send_id)
            return DispatchTokenClaimResponse(claimed=False, state="invalid")

    def reserve_provider_attempt(self, send_id: str) -> Optional[int]:
        payload = {"p_send_id": send_id}

        try:
            resp = self.client.rpc(RECOVERY_ATTEMPT_RESERVATION_RPC, payload).execute()
        except Exception:
            logger.exception("attempt_reservation_failed send_id=%s", send_id)
            raise

        if not resp.data:
            return None

        data = resp.data
        if isinstance(data, list):
            data = data[0] if data else None

        if not data or not isinstance(data, dict):
            return None

        attempt_value = data.get("attempt_count")
        if attempt_value is None:
            return None

        try:
            return int(attempt_value)
        except (TypeError, ValueError):
            logger.exception("attempt_reservation_invalid send_id=%s", send_id)
            return None

    def is_user_globally_capped(self, tenant_id: str, user_id: str) -> bool:
        window_start = datetime.now(timezone.utc) - timedelta(hours=24)
        try:
            resp = (
                self.client.table(RECOVERY_EMAIL_TABLE)
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .in_("status", [RecoveryStatus.PROVIDER_ACCEPTED.value, RecoveryStatus.DELIVERED.value])
                .gte("provider_accepted_at", window_start.isoformat())
                .limit(1)
                .execute()
            )
            return len(resp.data or []) > 0
        except Exception:
            logger.exception("is_user_globally_capped_failed tenant=%s user=%s", tenant_id, user_id)
            return True

    def is_template_on_cooldown(self, tenant_id: str, user_id: str, campaign_type: str) -> bool:
        window_start = datetime.now(timezone.utc) - timedelta(days=7)
        try:
            resp = (
                self.client.table(RECOVERY_EMAIL_TABLE)
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .eq("campaign_type", campaign_type)
                .in_("status", [RecoveryStatus.PROVIDER_ACCEPTED.value, RecoveryStatus.DELIVERED.value])
                .gte("provider_accepted_at", window_start.isoformat())
                .limit(1)
                .execute()
            )
            return len(resp.data or []) > 0
        except Exception:
            logger.exception("is_template_on_cooldown_failed tenant=%s user=%s", tenant_id, user_id)
            return False

    def mark_provider_accepted(self, send_id: str, provider_message_id: Optional[str]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        payload = {
            "status": RecoveryStatus.PROVIDER_ACCEPTED.value,
            "provider_message_id": provider_message_id,
            "provider_accepted_at": now,
            "sent_at": now,
            "updated_at": now,
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        self.write_event(send_id, "provider_accepted", {"provider_message_id": provider_message_id})

    def mark_delivered(self, send_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        payload = {
            "status": RecoveryStatus.DELIVERED.value,
            "delivered_at": now,
            "updated_at": now,
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        self.write_event(send_id, "delivered", {})

    def mark_dispatch_failed(
        self,
        send_id: str,
        error: str,
        failure_stage: FailureStage,
        next_retry_at: Optional[str],
    ) -> None:
        payload = {
            "status": RecoveryStatus.DISPATCH_FAILED.value,
            "failure_stage": failure_stage.value,
            "last_error": error[:500],
            "next_retry_at": next_retry_at,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        self.write_event(send_id, "dispatch_failed", {"error": error, "stage": failure_stage.value})

    def mark_dead_lettered(self, send_id: str, error: str, failure_stage: FailureStage) -> None:
        payload = {
            "status": RecoveryStatus.DEAD_LETTERED.value,
            "failure_stage": failure_stage.value,
            "last_error": error[:500],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        self.write_event(send_id, "dead_lettered", {"error": error, "stage": failure_stage.value})

    def write_dlq(
        self,
        send_id: str,
        tenant_id: str,
        user_id: str,
        campaign_type: str,
        error: str,
        dispatch_token: Optional[str],
    ) -> None:
        payload: Dict[str, Any] = {
            "send_id": send_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "campaign_type": campaign_type,
            "dispatch_token": dispatch_token,
            "last_error": error,
            "failed_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_DLQ_TABLE).insert(payload).execute()


def _get_supabase_client() -> Optional[Client]:
    if hasattr(_thread_local, "supabase_client"):
        return _thread_local.supabase_client

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        logger.critical("supabase_credentials_missing_service_role")
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY and URL are required for workers.")

    options = ClientOptions(postgrest_client_timeout=float(os.getenv("SUPABASE_TIMEOUT_SEC", "15.0")))
    client = create_client(supabase_url, supabase_key, options=options)
    _thread_local.supabase_client = client
    return client


def get_supabase_client() -> Optional[Client]:
    """Public helper for the shared Supabase client."""
    return _get_supabase_client()


def _extract_message_id(response: Any) -> Optional[str]:
    if isinstance(response, dict):
        if response.get("id"):
            return str(response["id"])
        data = response.get("data")
        if isinstance(data, dict) and data.get("id"):
            return str(data["id"])
    return None


def _extract_status_code(exc: Exception) -> Optional[int]:
    for attr in ("status_code", "status", "code"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)

    response = getattr(exc, "response", None)
    if response is not None:
        for attr in ("status_code", "status"):
            value = getattr(response, attr, None)
            if isinstance(value, int):
                return value
            if isinstance(value, str) and value.isdigit():
                return int(value)

    return None


def _is_retryable_error(exc: Exception) -> bool:
    status_code = _extract_status_code(exc)
    if status_code is None:
        return True
    if status_code == 429:
        return True
    return status_code >= 500


def _provider_backoff_seconds(attempt: int) -> int:
    base = RETRY_BACKOFF_SECONDS
    backoff = base * (2 ** max(0, attempt - 1))
    return min(backoff, 3600)


@dramatiq.actor(max_retries=MAX_SEND_ATTEMPTS, min_backoff=5_000, max_backoff=120_000)
def send_recovery_email(
    tenant_id: str,
    send_id: str,
    dispatch_token: str,
    dispatch_attempt: Optional[int] = None,
) -> None:
    """
    Consumes the job from Redis, verifies JIT SaaS safety limits, and fires Resend.
    """
    start_time = time.monotonic()

    if not tenant_id or not send_id or not dispatch_token:
        logger.error(
            "recovery_email_missing_args tenant=%s send_id=%s token_present=%s",
            tenant_id,
            send_id,
            bool(dispatch_token),
        )
        METRICS.increment("recovery.send.invalid_args", 1)
        return

    client = _get_supabase_client()
    if not client:
        logger.error(
            "recovery_email_no_db_client tenant=%s send_id=%s",
            tenant_id,
            send_id,
        )
        raise RuntimeError("Supabase client unavailable")

    repo = RecoveryRepository(client)
    claim = repo.claim_dispatch_token(dispatch_token, tenant_id, send_id)
    if not claim.claimed:
        logger.info(
            "recovery_dispatch_token_duplicate tenant=%s send_id=%s state=%s",
            tenant_id,
            send_id,
            claim.state,
        )
        METRICS.increment("recovery.dispatch.duplicate", 1, {"tenant": tenant_id})
        return

    record = repo.fetch_send_by_id(tenant_id, send_id)
    if not record:
        logger.warning("recovery_send_missing_record tenant=%s send_id=%s", tenant_id, send_id)
        METRICS.increment("recovery.send.missing_record", 1, {"tenant": tenant_id})
        return

    if record.dispatch_token and record.dispatch_token != dispatch_token:
        logger.warning(
            "recovery_dispatch_token_mismatch tenant=%s send_id=%s",
            tenant_id,
            send_id,
        )
        METRICS.increment("recovery.dispatch.token_mismatch", 1, {"tenant": tenant_id})
        return

    if record.status in (
        RecoveryStatus.PROVIDER_ACCEPTED,
        RecoveryStatus.DELIVERED,
        RecoveryStatus.DEAD_LETTERED,
    ):
        logger.info("recovery_send_terminal tenant=%s send_id=%s", tenant_id, send_id)
        return

    if record.attempt_count >= MAX_SEND_ATTEMPTS:
        error_message = "max_attempts_exceeded"
        repo.mark_dead_lettered(record.id, error_message, FailureStage.PROVIDER)
        try:
            repo.write_dlq(
                record.id,
                tenant_id,
                record.user_id,
                record.campaign_type,
                error_message,
                dispatch_token,
            )
        except Exception:
            logger.exception("recovery_send_dlq_failed tenant=%s send_id=%s", tenant_id, send_id)
        METRICS.increment("recovery.send.dead_lettered", 1, {"tenant": tenant_id})
        return

    # ==========================================
    # JIT SAAS SAFETY CHECKS (Execute Right Before Sending)
    # ==========================================

    if repo.is_user_globally_capped(tenant_id, record.user_id):
        logger.info("skipped_global_cap tenant=%s user=%s", tenant_id, record.user_id)
        retry_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        repo.mark_dispatch_failed(record.id, "global_daily_cap_exceeded", FailureStage.COOLDOWN, retry_at)
        METRICS.increment("recovery.send.cooldown", 1, {"tenant": tenant_id, "type": "global"})
        return

    if repo.is_template_on_cooldown(tenant_id, record.user_id, record.campaign_type):
        logger.info(
            "skipped_template_cooldown tenant=%s user=%s campaign=%s",
            tenant_id,
            record.user_id,
            record.campaign_type,
        )
        retry_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        repo.mark_dispatch_failed(record.id, "template_cooldown_active", FailureStage.COOLDOWN, retry_at)
        METRICS.increment("recovery.send.cooldown", 1, {"tenant": tenant_id, "type": "template"})
        return

    # ==========================================
    # EXECUTE SEND
    # ==========================================

    attempt_count = repo.reserve_provider_attempt(record.id)
    if attempt_count is None:
        logger.error("recovery_attempt_reservation_failed tenant=%s send_id=%s", tenant_id, send_id)
        raise RuntimeError("Attempt reservation failed")

    subject, html = TemplateRenderer().render(record.campaign_type)
    provider = ResendEmailProvider()
    result = provider.send(record.email, subject, html, dispatch_token)

    if result.status == ProviderSendStatus.ACCEPTED:
        try:
            repo.mark_provider_accepted(record.id, result.provider_message_id)
        except Exception:
            logger.exception("recovery_send_persist_failed tenant=%s send_id=%s", tenant_id, send_id)
            persist_recovery_status.send(
                send_id=record.id,
                status=RecoveryStatus.PROVIDER_ACCEPTED.value,
                provider_message_id=result.provider_message_id,
                last_error=None,
            )
        METRICS.increment("recovery.send.accepted", 1, {"tenant": tenant_id})
        logger.info("recovery_send_accepted tenant=%s send_id=%s", tenant_id, send_id)
        METRICS.timing("recovery.send.duration", time.monotonic() - start_time, {"tenant": tenant_id})
        return

    error_message = result.error or "send_failed"

    if result.retryable:
        retry_at = (datetime.now(timezone.utc) + timedelta(seconds=_provider_backoff_seconds(attempt_count))).isoformat()
        repo.mark_dispatch_failed(record.id, error_message, FailureStage.PROVIDER, retry_at)
        METRICS.increment("recovery.send.retryable_failure", 1, {"tenant": tenant_id})
        raise RuntimeError(error_message)

    repo.mark_dead_lettered(record.id, error_message, FailureStage.PROVIDER)
    try:
        repo.write_dlq(
            record.id,
            tenant_id,
            record.user_id,
            record.campaign_type,
            error_message,
            dispatch_token,
        )
    except Exception:
        logger.exception("recovery_send_dlq_failed tenant=%s send_id=%s", tenant_id, send_id)
    METRICS.increment("recovery.send.dead_lettered", 1, {"tenant": tenant_id})


@dramatiq.actor
def persist_recovery_status(
    send_id: str,
    status: str,
    provider_message_id: Optional[str],
    last_error: Optional[str],
) -> None:
    client = _get_supabase_client()
    if not client:
        logger.error(
            "recovery_status_persist_no_client send_id=%s status=%s",
            send_id,
            status,
        )
        raise RuntimeError("Supabase client unavailable")

    payload: Dict[str, Any] = {
        "status": status,
        "provider_message_id": provider_message_id,
        "last_error": last_error,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if status == RecoveryStatus.PROVIDER_ACCEPTED.value:
        payload["provider_accepted_at"] = datetime.now(timezone.utc).isoformat()

    try:
        client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
    except Exception:
        logger.exception(
            "recovery_status_persist_failed send_id=%s status=%s",
            send_id,
            status,
        )
        raise