import logging
import os
import time
import threading
import random
from datetime import datetime, timezone, timedelta
from enum import StrEnum
from typing import Dict, Any, Optional, Tuple

import dramatiq
import redis
from dramatiq.brokers.redis import RedisBroker
from pydantic import BaseModel, ValidationError
import resend
from supabase import create_client, Client, ClientOptions

from api.recovery_common import FailureStage, RECOVERY_EMAIL_TABLE, RecoveryStatus

logger = logging.getLogger(__name__)


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
# BROKER & REDIS
# ==========================================

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

redis_broker = RedisBroker(url=REDIS_URL)
dramatiq.set_broker(redis_broker)

# Separate Redis client for circuit breaker (decoupled from Dramatiq internals)
_redis_client: Optional[redis.Redis] = None


def _get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(REDIS_URL, decode_responses=False)
    return _redis_client


# ==========================================
# RESEND
# ==========================================

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    logger.warning("resend_api_key_missing")

FROM_EMAIL = os.getenv("RECOVERY_EMAIL_FROM", "Arcli <noreply@arcli.tech>")
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://arcli.tech")

# ==========================================
# CONFIGURATION
# ==========================================

RECOVERY_DLQ_TABLE = os.getenv("RECOVERY_DLQ_TABLE", "recovery_email_dlq")
RECOVERY_EMAIL_EVENTS_TABLE = os.getenv("RECOVERY_EMAIL_EVENTS_TABLE", "recovery_email_events")
RECOVERY_DISPATCH_TOKEN_RPC = os.getenv("RECOVERY_DISPATCH_TOKEN_RPC", "claim_dispatch_token")
RECOVERY_ATTEMPT_RESERVATION_RPC = os.getenv("RECOVERY_ATTEMPT_RESERVATION_RPC", "reserve_recovery_attempt")

# Unified RPC: single round-trip for claim + fetch + cooldown + reserve
RECOVERY_UNIFIED_RESERVE_RPC = os.getenv("RECOVERY_UNIFIED_RESERVE_RPC", "reserve_email_dispatch")

MAX_SEND_ATTEMPTS = int(os.getenv("RECOVERY_MAX_SEND_ATTEMPTS", "5"))
RETRY_BACKOFF_SECONDS = int(os.getenv("RECOVERY_RETRY_BACKOFF_SECONDS", "300"))

# Circuit breaker configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD = int(os.getenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5"))
CIRCUIT_BREAKER_TIMEOUT_SECONDS = int(os.getenv("CIRCUIT_BREAKER_TIMEOUT_SECONDS", "60"))
CIRCUIT_BREAKER_REDIS_KEY = os.getenv("CIRCUIT_BREAKER_REDIS_KEY", "circuit_breaker:resend")

# ==========================================
# MODELS
# ==========================================

class ProviderSendStatus(StrEnum):
    ACCEPTED = "accepted"
    FAILED_TRANSIENT = "failed_transient"
    FAILED_PERMANENT = "failed_permanent"


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


# ==========================================
# SUPABASE CLIENT (Thread-local)
# ==========================================

_supabase_client: Optional[Client] = None
_thread_local = threading.local()


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


# ==========================================
# CIRCUIT BREAKER (Redis-backed)
# ==========================================

class CircuitBreaker:
    """
    Simple Redis-backed circuit breaker for the email provider.
    
    States:
        CLOSED   - Normal operation.
        OPEN     - Failure threshold reached; fail fast.
        HALF_OPEN - After timeout, one probe request is allowed.
    """

    def __init__(
        self,
        key: str,
        failure_threshold: int,
        timeout_seconds: int,
    ):
        self._redis = _get_redis_client()
        self._state_key = f"{key}:state"
        self._failures_key = f"{key}:failures"
        self._last_failure_key = f"{key}:last_failure"
        self._failure_threshold = failure_threshold
        self._timeout_seconds = timeout_seconds

    def is_open(self) -> bool:
        try:
            state = self._redis.get(self._state_key)
            if state == b"OPEN":
                last_failure = self._redis.get(self._last_failure_key)
                if last_failure:
                    last_failure_time = float(last_failure)
                    if time.time() - last_failure_time >= self._timeout_seconds:
                        self._redis.set(self._state_key, "HALF_OPEN")
                        return False
                return True
            return False
        except Exception as exc:
            # Fail-safe: if Redis is unreachable, allow the request through
            logger.warning("circuit_breaker_check_failed error=%s", exc)
            return False

    def record_success(self) -> None:
        try:
            pipe = self._redis.pipeline()
            pipe.set(self._state_key, "CLOSED")
            pipe.delete(self._failures_key)
            pipe.delete(self._last_failure_key)
            pipe.execute()
        except Exception as exc:
            logger.warning("circuit_breaker_success_record_failed error=%s", exc)

    def record_failure(self) -> None:
        try:
            pipe = self._redis.pipeline()
            pipe.incr(self._failures_key)
            pipe.set(self._last_failure_key, str(time.time()))
            results = pipe.execute()
            failures = results[0]
            if failures >= self._failure_threshold:
                self._redis.set(self._state_key, "OPEN")
                logger.warning("circuit_breaker_opened key=%s failures=%s", self._state_key, failures)
                METRICS.increment("recovery.circuit_breaker.opened")
        except Exception as exc:
            logger.warning("circuit_breaker_failure_record_failed error=%s", exc)


# Module-level singleton
_CIRCUIT_BREAKER = CircuitBreaker(
    key=CIRCUIT_BREAKER_REDIS_KEY,
    failure_threshold=CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    timeout_seconds=CIRCUIT_BREAKER_TIMEOUT_SECONDS,
)

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
        "<p>Come back to Arcli to see whats new and keep your data healthy.</p>"
        f'<p><a href="{APP_BASE_URL}/login">Sign in</a></p>'
    )

    def render(self, campaign_type: str) -> Tuple[str, str]:
        return self._TEMPLATES.get(campaign_type, (self._DEFAULT_SUBJECT, self._DEFAULT_HTML))


# Module-level singleton
_TEMPLATE_RENDERER = TemplateRenderer()

# ==========================================
# EMAIL PROVIDER (Singleton)
# ==========================================

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
            }
            if dispatch_token:
                payload["headers"] = {
                    "X-Dispatch-Token": dispatch_token,
                    "X-Idempotency-Key": dispatch_token,
                }

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


# Module-level singleton
_RESEND_PROVIDER = ResendEmailProvider()

# ==========================================
# RECOVERY REPOSITORY
# ==========================================

class RecoveryRepository:
    def __init__(self, client: Client):
        self.client = client

    # --- Event writing (audit trail; monitor storage growth at scale) ---
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

    # --- Unified reserve (single round-trip) ---
    def unified_reserve(
        self,
        dispatch_token: str,
        tenant_id: str,
        send_id: str,
    ) -> UnifiedReserveResponse:
        """
        Single RPC call that:
          1. Claims the dispatch token
          2. Fetches the send record
          3. Checks cooldowns (global cap + template cooldown)
          4. Reserves the provider attempt
        
        Returns everything needed to decide whether to send.
        Falls back to individual queries if the unified RPC is not yet deployed.
        """
        payload = {
            "p_dispatch_token": dispatch_token,
            "p_tenant_id": tenant_id,
            "p_send_id": send_id,
            "p_max_attempts": MAX_SEND_ATTEMPTS,
        }

        try:
            resp = self.client.rpc(RECOVERY_UNIFIED_RESERVE_RPC, payload).execute()
        except Exception as exc:
            logger.warning(
                "unified_reserve_rpc_unavailable tenant=%s send_id=%s error=%s",
                tenant_id,
                send_id,
                exc,
            )
            return self._fallback_reserve(dispatch_token, tenant_id, send_id)

        if not resp.data:
            return UnifiedReserveResponse(error="missing")

        data = resp.data
        if isinstance(data, list):
            data = data[0] if data else None

        if not data or not isinstance(data, dict):
            return UnifiedReserveResponse(error="invalid")

        try:
            return UnifiedReserveResponse.model_validate(data)
        except ValidationError:
            logger.exception("unified_reserve_invalid tenant=%s send_id=%s", tenant_id, send_id)
            return UnifiedReserveResponse(error="invalid")

    def _fallback_reserve(
        self,
        dispatch_token: str,
        tenant_id: str,
        send_id: str,
    ) -> UnifiedReserveResponse:
        """Graceful fallback to individual queries when unified RPC is unavailable."""
        # 1. Claim token
        claim = self.claim_dispatch_token(dispatch_token, tenant_id, send_id)
        if not claim.claimed:
            return UnifiedReserveResponse(claim_status=claim.state or "duplicate")

        # 2. Fetch record
        record = self.fetch_send_by_id(tenant_id, send_id)
        if not record:
            return UnifiedReserveResponse(claim_status="missing_record")

        # 3. Check terminal status
        if record.status in (
            RecoveryStatus.PROVIDER_ACCEPTED,
            RecoveryStatus.DELIVERED,
            RecoveryStatus.DEAD_LETTERED,
        ):
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                cooldown_status="terminal",
            )

        # 4. Check max attempts
        if record.attempt_count >= MAX_SEND_ATTEMPTS:
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                cooldown_status="max_attempts",
            )

        # 5. Check cooldowns
        if self.is_user_globally_capped(tenant_id, record.user_id):
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                cooldown_status="global_cap",
            )

        if self.is_template_on_cooldown(tenant_id, record.user_id, record.campaign_type):
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                cooldown_status="template_cooldown",
            )

        # 6. Reserve attempt
        attempt_count = self.reserve_provider_attempt(record.id)
        if attempt_count is None:
            return UnifiedReserveResponse(
                record=record,
                claim_status="claimed",
                error="reservation_failed",
            )

        return UnifiedReserveResponse(
            record=record,
            claim_status="claimed",
            cooldown_status="ok",
            attempt_count=attempt_count,
        )

    # --- Legacy individual methods (used by fallback and DLQ operations) ---
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


# ==========================================
# HELPERS
# ==========================================

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
    """
    Exponential backoff with jitter to prevent thundering herd on provider recovery.
    Adds ±20% jitter plus a random 0–60s offset to desynchronize retries.
    """
    base = RETRY_BACKOFF_SECONDS
    backoff = base * (2 ** max(0, attempt - 1))
    capped = min(backoff, 3600)

    jitter_factor = random.uniform(0.8, 1.2)
    jitter_offset = random.randint(0, 60)

    return int((capped * jitter_factor) + jitter_offset)


# ==========================================
# DRAMATIQ ACTORS
# ==========================================

@dramatiq.actor(max_retries=MAX_SEND_ATTEMPTS, min_backoff=5_000, max_backoff=120_000)
def send_recovery_email(
    tenant_id: str,
    send_id: str,
    dispatch_token: str,
    dispatch_attempt: Optional[int] = None,
) -> None:
    """
    Consumes the job from Redis, verifies JIT SaaS safety limits, and fires Resend.
    
    Key improvements:
    - Single unified DB reserve call (50-70% fewer round trips)
    - No tenant tags in metrics (prevents cardinality explosion)
    - Singleton TemplateRenderer and ResendEmailProvider
    - Jittered exponential backoff (prevents thundering herd)
    - Redis-backed circuit breaker (prevents hammering a down provider)
    """
    start_time = time.monotonic()

    if not tenant_id or not send_id or not dispatch_token:
        logger.error(
            "recovery_email_missing_args tenant=%s send_id=%s token_present=%s",
            tenant_id,
            send_id,
            bool(dispatch_token),
        )
        METRICS.increment("recovery.send.invalid_args")
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

    # ==========================================
    # SINGLE UNIFIED RESERVE (replaces 6-8 queries)
    # ==========================================
    reserve = repo.unified_reserve(dispatch_token, tenant_id, send_id)

    if reserve.error:
        logger.error(
            "recovery_reserve_failed tenant=%s send_id=%s error=%s",
            tenant_id,
            send_id,
            reserve.error,
        )
        METRICS.increment("recovery.send.reserve_failed")
        raise RuntimeError(f"Reserve failed: {reserve.error}")

    if reserve.claim_status != "claimed":
        logger.info(
            "recovery_dispatch_token_duplicate tenant=%s send_id=%s state=%s",
            tenant_id,
            send_id,
            reserve.claim_status,
        )
        METRICS.increment("recovery.dispatch.duplicate")
        return

    record = reserve.record
    if not record:
        logger.warning("recovery_send_missing_record tenant=%s send_id=%s", tenant_id, send_id)
        METRICS.increment("recovery.send.missing_record")
        return

    if record.dispatch_token and record.dispatch_token != dispatch_token:
        logger.warning(
            "recovery_dispatch_token_mismatch tenant=%s send_id=%s",
            tenant_id,
            send_id,
        )
        METRICS.increment("recovery.dispatch.token_mismatch")
        return

    if reserve.cooldown_status == "terminal":
        logger.info("recovery_send_terminal tenant=%s send_id=%s", tenant_id, send_id)
        return

    if reserve.cooldown_status == "max_attempts":
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
        METRICS.increment("recovery.send.dead_lettered")
        return

    # ==========================================
    # JIT SAAS SAFETY CHECKS (from unified reserve)
    # ==========================================
    if reserve.cooldown_status == "global_cap":
        logger.info("skipped_global_cap tenant=%s user=%s", tenant_id, record.user_id)
        retry_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        repo.mark_dispatch_failed(record.id, "global_daily_cap_exceeded", FailureStage.COOLDOWN, retry_at)
        METRICS.increment("recovery.send.cooldown", tags={"type": "global"})
        return

    if reserve.cooldown_status == "template_cooldown":
        logger.info(
            "skipped_template_cooldown tenant=%s user=%s campaign=%s",
            tenant_id,
            record.user_id,
            record.campaign_type,
        )
        retry_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        repo.mark_dispatch_failed(record.id, "template_cooldown_active", FailureStage.COOLDOWN, retry_at)
        METRICS.increment("recovery.send.cooldown", tags={"type": "template"})
        return

    # ==========================================
    # CIRCUIT BREAKER CHECK
    # ==========================================
    if _CIRCUIT_BREAKER.is_open():
        logger.warning(
            "recovery_send_circuit_open tenant=%s send_id=%s",
            tenant_id,
            send_id,
        )
        retry_at = (datetime.now(timezone.utc) + timedelta(seconds=CIRCUIT_BREAKER_TIMEOUT_SECONDS)).isoformat()
        repo.mark_dispatch_failed(record.id, "provider_circuit_open", FailureStage.PROVIDER, retry_at)
        METRICS.increment("recovery.send.circuit_open")
        raise RuntimeError("Provider circuit breaker is open")

    # ==========================================
    # EXECUTE SEND
    # ==========================================
    attempt_count = reserve.attempt_count
    if attempt_count is None:
        logger.error("recovery_attempt_reservation_failed tenant=%s send_id=%s", tenant_id, send_id)
        raise RuntimeError("Attempt reservation failed")

    subject, html = _TEMPLATE_RENDERER.render(record.campaign_type)
    result = _RESEND_PROVIDER.send(record.email, subject, html, dispatch_token)

    if result.status == ProviderSendStatus.ACCEPTED:
        _CIRCUIT_BREAKER.record_success()

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
        METRICS.increment("recovery.send.accepted")
        logger.info("recovery_send_accepted tenant=%s send_id=%s", tenant_id, send_id)
        METRICS.timing("recovery.send.duration", time.monotonic() - start_time)
        return

    # ==========================================
    # HANDLE FAILURE
    # ==========================================
    error_message = result.error or "send_failed"

    if result.status == ProviderSendStatus.FAILED_TRANSIENT:
        _CIRCUIT_BREAKER.record_failure()

    if result.retryable:
        retry_seconds = _provider_backoff_seconds(attempt_count)
        retry_at = (datetime.now(timezone.utc) + timedelta(seconds=retry_seconds)).isoformat()
        repo.mark_dispatch_failed(record.id, error_message, FailureStage.PROVIDER, retry_at)
        METRICS.increment("recovery.send.retryable_failure")
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
    METRICS.increment("recovery.send.dead_lettered")


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