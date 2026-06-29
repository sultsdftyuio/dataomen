import logging
import os
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Dict, Optional, Tuple

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)


# ==========================================
# UTC HELPERS (centralized)
# ==========================================

def utc_now() -> datetime:
    """Return current UTC datetime."""
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    """Return current UTC datetime as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


# ==========================================
# METRICS (Tenant cardinality intentionally removed)
# ==========================================

class MetricsSink:
    """
    Metrics without tenant tags to prevent cardinality explosion in
    Prometheus / Datadog / New Relic. Per-tenant observability lives
    exclusively in structured logs.
    """

    def increment(self, name: str, value: int = 1, tags: Optional[Dict[str, str]] = None) -> None:
        logger.info("metric_increment name=%s value=%s tags=%s", name, value, tags)

    def timing(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        logger.info("metric_timing name=%s value=%s tags=%s", name, round(value, 6), tags)


METRICS = MetricsSink()


# ==========================================
# CONFIGURATION
# ==========================================

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("RECOVERY_EMAIL_FROM", "Arcli <noreply@arcli.tech>")
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://arcli.tech")

RECOVERY_EMAIL_TABLE = os.getenv("RECOVERY_EMAIL_TABLE", "recovery_email")
RECOVERY_DLQ_TABLE = os.getenv("RECOVERY_DLQ_TABLE", "recovery_email_dlq")
RECOVERY_EMAIL_EVENTS_TABLE = os.getenv("RECOVERY_EMAIL_EVENTS_TABLE", "recovery_email_events")

RECOVERY_DISPATCH_TOKEN_RPC = os.getenv("RECOVERY_DISPATCH_TOKEN_RPC", "claim_dispatch_token")
RECOVERY_ATTEMPT_RESERVATION_RPC = os.getenv("RECOVERY_ATTEMPT_RESERVATION_RPC", "reserve_recovery_attempt")
RECOVERY_UNIFIED_RESERVE_RPC = os.getenv("RECOVERY_UNIFIED_RESERVE_RPC", "reserve_email_dispatch")

MAX_SEND_ATTEMPTS = int(os.getenv("RECOVERY_MAX_SEND_ATTEMPTS", "5"))
RETRY_BACKOFF_SECONDS = int(os.getenv("RECOVERY_RETRY_BACKOFF_SECONDS", "300"))

# Circuit breaker configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD = int(os.getenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5"))
CIRCUIT_BREAKER_TIMEOUT_SECONDS = int(os.getenv("CIRCUIT_BREAKER_TIMEOUT_SECONDS", "60"))
CIRCUIT_BREAKER_REDIS_KEY = os.getenv("CIRCUIT_BREAKER_REDIS_KEY", "circuit_breaker:resend")
CIRCUIT_BREAKER_HALF_OPEN_LOCK_TTL = int(os.getenv("CIRCUIT_BREAKER_HALF_OPEN_LOCK_TTL", "30"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_TIMEOUT_SEC = float(os.getenv("SUPABASE_TIMEOUT_SEC", "15.0"))


# ==========================================
# ENUMS
# ==========================================

class RecoveryStatus(StrEnum):
    PENDING_DISPATCH = "pending_dispatch"
    DISPATCHING = "dispatching"
    PROVIDER_ACCEPTED = "provider_accepted"
    DELIVERED = "delivered"
    DISPATCH_FAILED = "dispatch_failed"
    DEAD_LETTERED = "dead_lettered"


class FailureStage(StrEnum):
    DISPATCH = "dispatch"
    COOLDOWN = "cooldown"
    PROVIDER = "provider"
    PERSISTENCE = "persistence"


class ProviderSendStatus(StrEnum):
    ACCEPTED = "accepted"
    FAILED_TRANSIENT = "failed_transient"
    FAILED_PERMANENT = "failed_permanent"


class CircuitBreakerState(StrEnum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


# ==========================================
# PYDANTIC MODELS
# ==========================================

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


class UnifiedReserveResponse(BaseModel):
    """
    Returned by the unified reserve_email_dispatch RPC.
    """
    record: Optional[RecoverySendRecord] = None
    claim_status: Optional[str] = None          # "claimed", "duplicate", "missing", "invalid"
    cooldown_status: Optional[str] = None       # "ok", "global_cap", "template_cooldown", "max_attempts", "terminal"
    attempt_count: Optional[int] = None
    error: Optional[str] = None


def safe_model_validate(model_class: type, data: Any, context: str = "") -> Optional[Any]:
    """
    Safely validate Supabase response data into a Pydantic model.
    Handles the various shapes Supabase returns: {}, [], None.
    """
    if data is None:
        return None

    if isinstance(data, list):
        data = data[0] if data else None

    if not data or not isinstance(data, dict):
        return None

    try:
        return model_class.model_validate(data)
    except ValidationError:
        logger.exception("model_validation_failed context=%s data=%s", context, data)
        return None


# ==========================================
# TEMPLATE RENDERER (Singleton)
# ==========================================

class TemplateRenderer:
    _TEMPLATES: Dict[str, Tuple[str, str]] = {
        "billing_failed": (
            "Update your billing to keep Arcli running",
            (
                "<h2>Your payment did not go through</h2>"
                "<p>Please update your billing details to avoid service interruption.</p>"
                f'<p><a href="{APP_BASE_URL}/settings/billing">Update billing</a></p>'
            ),
        ),
        "cancellation_followup": (
            "We would love to win you back",
            (
                "<h2>We noticed you cancelled</h2>"
                "<p>If you are open to it, we would love to learn why and offer help.</p>"
                f'<p><a href="{APP_BASE_URL}/support">Talk to support</a></p>'
            ),
        ),
        "feedback_recovery": (
            "We heard your feedback",
            (
                "<h2>Thanks for letting us know</h2>"
                "<p>We are addressing the issues you reported and want to help.</p>"
                f'<p><a href="{APP_BASE_URL}/support">Get help</a></p>'
            ),
        ),
    }

    _DEFAULT_SUBJECT = "We miss you at Arcli"
    _DEFAULT_HTML = (
        "<h2>We have not seen you in a while</h2>"
        "<p>Come back to Arcli to see what's new and keep your data healthy.</p>"
        f'<p><a href="{APP_BASE_URL}/login">Sign in</a></p>'
    )

    def render(self, campaign_type: str) -> Tuple[str, str]:
        return self._TEMPLATES.get(campaign_type, (self._DEFAULT_SUBJECT, self._DEFAULT_HTML))


# Module-level singleton
_TEMPLATE_RENDERER = TemplateRenderer()


def get_template_renderer() -> TemplateRenderer:
    """Return the module-level template renderer singleton."""
    return _TEMPLATE_RENDERER


# ==========================================
# HELPERS (centralized, zero dependencies)
# ==========================================

def _extract_message_id(response: Any) -> Optional[str]:
    """Extract message ID from Resend API response."""
    if isinstance(response, dict):
        if response.get("id"):
            return str(response["id"])
        data = response.get("data")
        if isinstance(data, dict) and data.get("id"):
            return str(data["id"])
    return None


def _extract_status_code(exc: Exception) -> Optional[int]:
    """Extract HTTP status code from an exception using multiple fallback strategies."""
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


def _is_retryable_status(status_code: Optional[int]) -> bool:
    """Determine if an HTTP status code indicates a retryable error."""
    if status_code is None:
        return True  # Unknown error — default to retryable.
    if status_code == 429:
        return True  # Rate limited.
    if status_code in (401, 403, 422):
        return False  # Auth, forbidden, unprocessable — permanent.
    return status_code >= 500  # Server errors are retryable.


def _is_retryable_error(exc: Exception) -> bool:
    """Backwards-compatible helper that delegates to _is_retryable_status."""
    status_code = _extract_status_code(exc)
    return _is_retryable_status(status_code)


def _provider_backoff_seconds(attempt: int) -> int:
    """
    Exponential backoff with jitter to prevent thundering herd on provider recovery.
    Uses multiplicative jitter only (0.8–1.2x) for cleaner exponential spacing.
    """
    import random
    base = RETRY_BACKOFF_SECONDS
    backoff = base * (2 ** max(0, attempt - 1))
    capped = min(backoff, 3600)
    jitter_factor = random.uniform(0.8, 1.2)
    return int(capped * jitter_factor)