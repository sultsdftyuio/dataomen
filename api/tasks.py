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

MAX_SEND_ATTEMPTS = int(os.getenv("RECOVERY_MAX_SEND_ATTEMPTS", "5"))
RETRY_BACKOFF_SECONDS = int(os.getenv("RECOVERY_RETRY_BACKOFF_SECONDS", "300"))

STATUS_QUEUED = "queued"
STATUS_SENDING = "sending"
STATUS_SENT = "sent"
STATUS_FAILED_TRANSIENT = "failed_transient"
STATUS_FAILED_PERMANENT = "failed_permanent"

_supabase_client: Optional[Client] = None


class RecoverySendRecord(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    email: str
    campaign_type: str
    status: str = STATUS_QUEUED
    attempt_count: int = 0
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
    def send(self, to_email: str, subject: str, html: str) -> SendResult:
        if not resend.api_key:
            return SendResult(
                status=STATUS_FAILED_PERMANENT,
                retryable=False,
                error="resend_api_key_missing",
            )

        try:
            response = resend.Emails.send({
                "from": FROM_EMAIL,
                "to": [to_email],
                "subject": subject,
                "html": html,
            })
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

    def mark_sending(self, send_id: str, attempt_count: int) -> None:
        payload = {
            "status": STATUS_SENDING,
            "attempt_count": attempt_count,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()

    def mark_sent(self, send_id: str, provider_message_id: Optional[str]) -> None:
        payload = {
            "status": STATUS_SENT,
            "provider_message_id": provider_message_id,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()

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

    def mark_failed_permanent(self, send_id: str, error: str) -> None:
        payload = {
            "status": STATUS_FAILED_PERMANENT,
            "last_error": error,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.client.table(RECOVERY_EMAIL_TABLE).update(payload).eq("id", send_id).execute()

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


@dramatiq.actor
def send_recovery_email(
    tenant_id: str,
    user_id: str,
    email: str,
    campaign_type: str
) -> None:
    if not tenant_id or not user_id or not email or not campaign_type:
        logger.error(
            "recovery_email_missing_args tenant=%s user_id=%s email=%s campaign=%s",
            tenant_id,
            user_id,
            email,
            campaign_type,
        )
        return

    client = _get_supabase_client()
    if not client:
        logger.error(
            "recovery_email_no_db_client tenant=%s user_id=%s campaign=%s",
            tenant_id,
            user_id,
            campaign_type,
        )
        raise RuntimeError("Supabase client unavailable")

    repo = RecoveryRepository(client)
    record = repo.fetch_latest_send(
        tenant_id,
        user_id,
        campaign_type,
        statuses=(STATUS_QUEUED, STATUS_FAILED_TRANSIENT),
    )

    if not record:
        logger.warning(
            "recovery_send_missing_record tenant=%s user_id=%s campaign=%s",
            tenant_id,
            user_id,
            campaign_type,
        )
        return

    if record.attempt_count >= MAX_SEND_ATTEMPTS:
        error_message = "max_attempts_exceeded"
        repo.mark_failed_permanent(record.id, error_message)
        try:
            repo.write_dlq(record.id, tenant_id, user_id, campaign_type, error_message)
        except Exception:
            logger.exception(
                "recovery_send_dlq_failed tenant=%s user_id=%s campaign=%s",
                tenant_id,
                user_id,
                campaign_type,
            )
        return

    repo.mark_sending(record.id, record.attempt_count + 1)

    subject, html = TemplateRenderer().render(campaign_type)
    provider = ResendEmailProvider()
    result = provider.send(email, subject, html)

    if result.status == STATUS_SENT:
        try:
            repo.mark_sent(record.id, result.provider_message_id)
        except Exception:
            logger.exception(
                "recovery_send_persist_failed tenant=%s user_id=%s campaign=%s",
                tenant_id,
                user_id,
                campaign_type,
            )
            persist_recovery_status.send(
                record.id,
                STATUS_SENT,
                result.provider_message_id,
                None,
            )
        logger.info(
            "recovery_send_sent tenant=%s user_id=%s campaign=%s send_id=%s",
            tenant_id,
            user_id,
            campaign_type,
            record.id,
        )
        return

    error_message = result.error or "send_failed"

    if result.retryable:
        repo.mark_failed_transient(record.id, error_message)
        logger.warning(
            "recovery_send_transient_failure tenant=%s user_id=%s campaign=%s send_id=%s",
            tenant_id,
            user_id,
            campaign_type,
            record.id,
        )
        raise RuntimeError(error_message)

    repo.mark_failed_permanent(record.id, error_message)
    try:
        repo.write_dlq(record.id, tenant_id, user_id, campaign_type, error_message)
    except Exception:
        logger.exception(
            "recovery_send_dlq_failed tenant=%s user_id=%s campaign=%s",
            tenant_id,
            user_id,
            campaign_type,
        )


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
