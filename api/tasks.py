import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple, Iterable

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from pydantic import BaseModel, ValidationError
import resend
from supabase import create_client, Client

logger = logging.getLogger(__name__)

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

RECOVERY_EMAIL_TABLE = os.getenv("RECOVERY_EMAIL_TABLE", "recovery_emails")
RECOVERY_DLQ_TABLE = os.getenv("RECOVERY_DLQ_TABLE", "recovery_email_dlq")
RECOVERY_EMAIL_EVENTS_TABLE = os.getenv("RECOVERY_EMAIL_EVENTS_TABLE", "recovery_email_events")

MAX_SEND_ATTEMPTS = int(os.getenv("RECOVERY_MAX_SEND_ATTEMPTS", "5"))
RETRY_BACKOFF_SECONDS = int(os.getenv("RECOVERY_RETRY_BACKOFF_SECONDS", "300"))

# --- STATUS DEFINITIONS ---
STATUS_QUEUED = "queued"
STATUS_PROCESSING = "processing"       # Added: Set by the Outbox Poller
STATUS_SENDING = "sending"
STATUS_SENT = "sent"
STATUS_FAILED_TRANSIENT = "failed_transient"
STATUS_FAILED_PERMANENT = "failed_permanent"
STATUS_SKIPPED = "skipped_cooldown"    # Added: For JIT SaaS Safety 

_supabase_client: Optional[Client] = None


class RecoverySendRecord(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    email: str
    campaign_type: str
    message_key: Optional[str] = None
    status: str = STATUS_QUEUED
    attempt_count: int = 0
    next_retry_at: Optional[str] = None
    provider_message_id: Optional[str] = None
    last_error: Optional[str] = None
    created_at: Optional[str] = None


class SendResult(BaseModel):
    status: str
    provider_message_id: Optional[str] = None
    retryable: bool = False
    error: Optional[str] = None


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
        message_key: Optional[str] = None,
    ) -> SendResult:
        if not resend.api_key:
            return SendResult(
                status=STATUS_FAILED_PERMANENT,
                retryable=False,
                error="resend_api_key_missing",
            )

        try:
            payload: Dict[str, Any] = {
                "from": FROM_EMAIL,
                "to": [to_email],
                "subject": subject,
                "html": html,
            }
            if message_key:
                payload["headers"] = {"X-Message-Key": message_key}

            response = resend.Emails.send(payload)
        except Exception as exc:
            retryable = _is_retryable_error(exc)
            return SendResult(
                status=STATUS_FAILED_TRANSIENT if retryable else STATUS_FAILED_PERMANENT,
                retryable=retryable,
                error=str(exc),
            )

        message_id = _extract_message_id(response)
        return SendResult(
            status=STATUS_SENT,
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

    def fetch_send_by_id(
        self,
        tenant_id: str,
        send_id: str,
    ) -> Optional[RecoverySendRecord]:
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

    def fetch_latest_send(
        self,
        tenant_id: str,
        user_id: str,
        campaign_type: str,
        statuses: Optional[Iterable[str]] = None,
    ) -> Optional[RecoverySendRecord]:
        query = (
            self.client
            .table(RECOVERY_EMAIL_TABLE)
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("user_id", user_id)
            .eq("campaign_type", campaign_type)
        )

        if statuses:
            query = query.in_("status", list(statuses))

        resp = query.order("created_at", desc=True).limit(1).execute()
        if not resp.data:
            return None

        try:
            return RecoverySendRecord.model_validate(resp.data[0])
        except ValidationError:
            logger.exception(
                "recovery_send_record_invalid tenant=%s user_id=%s campaign=%s",
                tenant_id,
                user_id,
                campaign_type,
            )
            return None

    # ==========================================
    # SAAS SAFETY: JUST-IN-TIME (JIT) LIMITS
    # ==========================================

    def is_user_globally_capped(self, tenant_id: str, user_id: str) -> bool:
        """Global Cap: Max 1 email per 24 hours per user across all templates."""
        window_start = datetime.now(timezone.utc) - timedelta(hours=24)
        try:
            resp = (
                self.client.table(RECOVERY_EMAIL_TABLE)
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .eq("status", STATUS_SENT)
                .gte("sent_at", window_start.isoformat())
                .limit(1)
                .execute()
            )
            return len(resp.data or []) > 0
        except Exception:
            logger.exception("is_user_globally_capped_failed tenant=%s user=%s", tenant_id, user_id)
            return False

    def is_template_on_cooldown(self, tenant_id: str, user_id: str, campaign_type: str) -> bool:
        """Template Cooldown: Max 1 identical email per 7 days."""
        window_start = datetime.now(timezone.utc) - timedelta(days=7)
        try:
            resp = (
                self.client.table(RECOVERY_EMAIL_TABLE)
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .eq("campaign_type", campaign_type)
                .eq("status", STATUS_SENT)
                .gte("sent_at", window_start.isoformat())
                .limit(1)
                .execute()
            )
            return len(resp.data or []) > 0
        except Exception:
            logger.exception("is_template_on_cooldown_failed tenant=%s user=%s", tenant_id, user_id)
            return False

    def mark_skipped(self, send_id: str, reason: str) -> None:
        """Marks an intent as skipped due to spam protection limits."""
        payload = {
            "status": STATUS_SKIPPED,
            "skip_reason": reason,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
            self.write_event(send_id, "skipped", {"reason": reason})
        except Exception:
            logger.exception("mark_skipped_failed send_id=%s", send_id)

    # ==========================================
    # LIFECYCLE MANAGEMENT
    # ==========================================

    def mark_sending(self, send_id: str, attempt_count: int) -> None:
        payload = {
            "status": STATUS_SENDING,
            "attempt_count": attempt_count,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        self.write_event(send_id, "sending", {"attempt_count": attempt_count})

    def mark_sent(self, send_id: str, provider_message_id: Optional[str]) -> None:
        payload = {
            "status": STATUS_SENT,
            "provider_message_id": provider_message_id,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        self.write_event(send_id, "sent", {"provider_message_id": provider_message_id})

    def mark_failed_transient(self, send_id: str, error: str) -> None:
        payload = {
            "status": STATUS_FAILED_TRANSIENT,
            "last_error": error,
            "next_retry_at": (
                datetime.now(timezone.utc) + timedelta(seconds=RETRY_BACKOFF_SECONDS)
            ).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        self.write_event(send_id, "failed_transient", {"error": error})

    def mark_failed_permanent(self, send_id: str, error: str) -> None:
        payload = {
            "status": STATUS_FAILED_PERMANENT,
            "last_error": error,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
        self.write_event(send_id, "failed_permanent", {"error": error})

    def claim_for_sending(
        self,
        send_id: str,
        expected_statuses: Iterable[str],
        attempt_count: int,
    ) -> bool:
        payload = {
            "status": STATUS_SENDING,
            "attempt_count": attempt_count,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        resp = (
            self.client
            .table(RECOVERY_EMAIL_TABLE)
            .update(payload)
            .eq("id", send_id)
            .in_("status", list(expected_statuses))
            .execute()
        )
        claimed = bool(resp.data)
        if claimed:
            self.write_event(send_id, "sending", {"attempt_count": attempt_count})

        return claimed

    def write_dlq(self, send_id: str, tenant_id: str, user_id: str, campaign_type: str, error: str) -> None:
        payload: Dict[str, Any] = {
            "send_id": send_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "campaign_type": campaign_type,
            "last_error": error,
            "failed_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_DLQ_TABLE).insert(payload).execute()


def _get_supabase_client() -> Optional[Client]:
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        logger.error("supabase_credentials_missing")
        return None

    _supabase_client = create_client(supabase_url, supabase_key)
    return _supabase_client


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


@dramatiq.actor(max_retries=MAX_SEND_ATTEMPTS, min_backoff=5_000, max_backoff=120_000)
def send_recovery_email(
    tenant_id: str,
    send_id: str,
) -> None:
    """
    Consumes the job from Redis, verifies JIT SaaS safety limits, and fires Resend.
    """
    if not tenant_id or not send_id:
        logger.error(
            "recovery_email_missing_args tenant=%s send_id=%s",
            tenant_id,
            send_id,
        )
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
    record = repo.fetch_send_by_id(tenant_id, send_id)

    # Note the addition of STATUS_SKIPPED to the terminal states
    if not record:
        logger.warning("recovery_send_missing_record tenant=%s send_id=%s", tenant_id, send_id)
        return
    if record.status in (STATUS_SENT, STATUS_FAILED_PERMANENT, STATUS_SKIPPED):
        return

    if record.status == STATUS_SENDING:
        logger.info("recovery_send_already_claimed tenant=%s send_id=%s", tenant_id, send_id)
        return

    if record.attempt_count >= MAX_SEND_ATTEMPTS:
        error_message = "max_attempts_exceeded"
        repo.mark_failed_permanent(record.id, error_message)
        try:
            repo.write_dlq(record.id, tenant_id, record.user_id, record.campaign_type, error_message)
        except Exception:
            logger.exception("recovery_send_dlq_failed tenant=%s send_id=%s", tenant_id, send_id)
        return

    # ==========================================
    # JIT SAAS SAFETY CHECKS (Execute Right Before Claiming)
    # ==========================================
    
    # 1. Global Cap Check (Prevents stacking automation spam)
    if repo.is_user_globally_capped(tenant_id, record.user_id):
        logger.info("skipped_global_cap tenant=%s user=%s", tenant_id, record.user_id)
        repo.mark_skipped(record.id, "global_daily_cap_exceeded")
        return

    # 2. Template Cooldown Check (Prevents duplicate template spam)
    if repo.is_template_on_cooldown(tenant_id, record.user_id, record.campaign_type):
        logger.info("skipped_template_cooldown tenant=%s user=%s campaign=%s", tenant_id, record.user_id, record.campaign_type)
        repo.mark_skipped(record.id, "template_cooldown_active")
        return

    # ==========================================
    # EXECUTE CLAIM & SEND
    # ==========================================

    # Note: We now expect STATUS_PROCESSING (from Outbox Poller) or STATUS_FAILED_TRANSIENT (from Dramatiq Retry)
    claimed = repo.claim_for_sending(
        record.id,
        (STATUS_PROCESSING, STATUS_FAILED_TRANSIENT),
        record.attempt_count + 1,
    )
    
    if not claimed:
        return

    subject, html = TemplateRenderer().render(record.campaign_type)
    provider = ResendEmailProvider()
    result = provider.send(record.email, subject, html, record.message_key)

    if result.status == STATUS_SENT:
        try:
            repo.mark_sent(record.id, result.provider_message_id)
        except Exception:
            logger.exception("recovery_send_persist_failed tenant=%s send_id=%s", tenant_id, send_id)
            persist_recovery_status.send(
                record.id,
                STATUS_SENT,
                result.provider_message_id,
                None,
            )
        logger.info("recovery_send_sent tenant=%s send_id=%s", tenant_id, send_id)
        return

    error_message = result.error or "send_failed"

    if result.retryable:
        repo.mark_failed_transient(record.id, error_message)
        logger.warning("recovery_send_transient_failure tenant=%s send_id=%s", tenant_id, send_id)
        raise RuntimeError(error_message)

    repo.mark_failed_permanent(record.id, error_message)
    try:
        repo.write_dlq(record.id, tenant_id, record.user_id, record.campaign_type, error_message)
    except Exception:
        logger.exception("recovery_send_dlq_failed tenant=%s send_id=%s", tenant_id, send_id)


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

    if status == STATUS_SENT:
        payload["sent_at"] = datetime.now(timezone.utc).isoformat()

    try:
        client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()
    except Exception:
        logger.exception(
            "recovery_status_persist_failed send_id=%s status=%s",
            send_id,
            status,
        )
        raise