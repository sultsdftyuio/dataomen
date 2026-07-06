import uuid
import logging
import time
import redis.asyncio as redis
import os
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, Optional, List, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Security, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from supabase import create_client, Client

from api.services.ingestion_service import IngestionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/track", tags=["Events"])
security = HTTPBearer()

API_KEY_PEPPER = os.getenv("API_KEY_PEPPER")

# 2. Dynamic, environment-driven prefixes
LIVE_PREFIX = os.getenv("API_KEY_LIVE_PREFIX", "arcli_live_")
TEST_PREFIX = os.getenv("API_KEY_TEST_PREFIX", "arcli_test_")

_supabase_client: Optional[Client] = None

# ---------------------------------------------------------
# RATE LIMITING (PLACEHOLDER)
# ---------------------------------------------------------


# ---------------------------------------------------------
# TENANT RESOLUTION
# ---------------------------------------------------------

def _get_supabase_client() -> Client:
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        raise RuntimeError("CRITICAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.")

    _supabase_client = create_client(supabase_url, supabase_key)
    return _supabase_client


def _parse_api_key(raw: str) -> Optional[Tuple[str, str]]:
    if not raw:
        return None

    if raw.startswith(LIVE_PREFIX):
        prefix_len = len(LIVE_PREFIX)
    elif raw.startswith(TEST_PREFIX):
        prefix_len = len(TEST_PREFIX)
    else:
        return None

    trimmed = raw[prefix_len:]
    if "_" not in trimmed:
        return None

    key_id, secret = trimmed.split("_", 1)
    if not key_id or not secret:
        return None

    return key_id, secret

# ---------------------------------------------------------
# RATE LIMITING (REDIS SLIDING WINDOW)
# ---------------------------------------------------------

import os
import time
import uuid
import logging

import redis.asyncio as redis

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None


def get_redis_client() -> redis.Redis:
    """
    Lazily creates a shared async Redis client.
    """

    global _redis_client

    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")

        _redis_client = redis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=2,
            socket_connect_timeout=2,
            health_check_interval=30,
        )

    return _redis_client


WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "10"))
IP_LIMIT = int(os.getenv("RATE_LIMIT_IP_LIMIT", "50"))
API_KEY_LIMIT = int(os.getenv("RATE_LIMIT_API_KEY_LIMIT", "200"))


async def rate_limit_check(request: Request) -> None:
    """
    Sliding-window Redis rate limiter.

    Limits:
        • Per IP
        • Per API Key

    Uses Redis sorted sets (ZSET).

    Redis failures DO NOT block ingestion.
    """

    redis_client = get_redis_client()

    now = time.time()
    request_id = str(uuid.uuid4())

    client_ip = (
        request.client.host
        if request.client
        else "unknown"
    )

    key_id: str | None = None

    auth_header = request.headers.get("Authorization")

    if auth_header and auth_header.startswith("Bearer "):
        parsed = _parse_api_key(auth_header[7:])
        if parsed:
            key_id = parsed[0]

    ip_key = f"ratelimit:ip:{client_ip}"

    try:

        async with redis_client.pipeline(transaction=True) as pipe:

            #
            # ------------------------
            # IP LIMIT
            # ------------------------
            #

            pipe.zremrangebyscore(
                ip_key,
                0,
                now - WINDOW_SECONDS,
            )

            pipe.zadd(
                ip_key,
                {f"{now}:{request_id}": now},
            )

            pipe.zcard(ip_key)

            pipe.expire(
                ip_key,
                WINDOW_SECONDS,
            )

            #
            # ------------------------
            # API KEY LIMIT
            # ------------------------
            #

            if key_id:

                api_key = f"ratelimit:key:{key_id}"

                pipe.zremrangebyscore(
                    api_key,
                    0,
                    now - WINDOW_SECONDS,
                )

                pipe.zadd(
                    api_key,
                    {f"{now}:{request_id}": now},
                )

                pipe.zcard(api_key)

                pipe.expire(
                    api_key,
                    WINDOW_SECONDS,
                )

            results = await pipe.execute()

    except redis.RedisError:
        logger.exception("redis_rate_limit_failed")

        #
        # Fail OPEN.
        #
        # Don't take down your tracking API because Redis
        # had a temporary outage.
        #
        return

    #
    # ------------------------
    # Parse Results
    # ------------------------
    #

    ip_count = results[2]

    key_count = None

    if key_id:
        key_count = results[6]

    #
    # ------------------------
    # Enforce IP Limit
    # ------------------------
    #

    if ip_count > IP_LIMIT:

        logger.warning(
            "ip_rate_limit_exceeded",
            extra={
                "ip": client_ip,
                "count": ip_count,
            },
        )

        raise HTTPException(
            status_code=429,
            detail="Too Many Requests",
            headers={
                "Retry-After": str(WINDOW_SECONDS),
            },
        )

    #
    # ------------------------
    # Enforce API Key Limit
    # ------------------------
    #

    if key_count is not None and key_count > API_KEY_LIMIT:

        logger.warning(
            "api_key_rate_limit_exceeded",
            extra={
                "key_id": key_id,
                "count": key_count,
            },
        )

        raise HTTPException(
            status_code=429,
            detail="API Key Rate Limit Exceeded",
            headers={
                "Retry-After": str(WINDOW_SECONDS),
            },
        )
    
def _hash_secret(secret: str) -> str:
    if not API_KEY_PEPPER:
        raise RuntimeError("API_KEY_PEPPER is not configured")

    return hmac.new(
        API_KEY_PEPPER.encode("utf-8"),
        secret.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.new(
        API_KEY_PEPPER.encode("utf-8"),
        secret.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def update_last_used_at(key_id: str):
    """Async task to update the last_used_at timestamp without blocking the HTTP request."""
    try:
        client = _get_supabase_client()
        client.table("api_keys").update({
            "last_used_at": datetime.now(timezone.utc).isoformat()
        }).eq("key_id", key_id).execute()
    except Exception:
        logger.warning("api_key_last_used_update_failed", exc_info=True)


# 1. Dependency upgraded to `async`
async def resolve_tenant(
    request: Request, 
    credentials: HTTPAuthorizationCredentials = Security(security),
    _rate_limit: None = Depends(rate_limit_check)
) -> Tuple[str, str]:
    """
    Validates API key and resolves the tenant.
    5. Returns (tenant_id, key_id) so the route handles background tasks natively.
    """
    token = credentials.credentials

    parsed = _parse_api_key(token)
    if not parsed:
        logger.warning("invalid_api_key_format")
        raise HTTPException(status_code=401, detail="Invalid API Key")

    key_id, secret = parsed
    key_hash = _hash_secret(secret)
    
    if not key_hash:
        raise HTTPException(status_code=500, detail="Server configuration error")

    client = _get_supabase_client()

    try:
        # 4. Use `.maybe_single()` to strictly return 0 or 1 dict, avoiding 
        # the PostgrestAPIError thrown by `.single()` when a row isn't found.
        response = (
            client
            .table("api_keys")
            .select("tenant_id, key_hash, revoked_at, expires_at")
            .eq("key_id", key_id)
            .maybe_single()
            .execute()
        )
    except Exception:
        logger.exception("api_key_db_lookup_failed")
        raise HTTPException(status_code=500, detail="Internal Server Error")

    row = response.data
    
    if not row:
        logger.warning("invalid_api_key", extra={"key_id": key_id})
        raise HTTPException(status_code=401, detail="Invalid API Key")

    if row.get("revoked_at"):
        logger.warning("revoked_api_key_attempt", extra={"key_id": key_id})
        raise HTTPException(status_code=401, detail="Invalid API Key")

    if row.get("expires_at"):
        expires_at_str = row["expires_at"].replace("Z", "+00:00")
        expires_at = datetime.fromisoformat(expires_at_str)
        if datetime.now(timezone.utc) > expires_at:
            logger.warning("expired_api_key_attempt", extra={"key_id": key_id})
            raise HTTPException(status_code=401, detail="API Key expired")

    stored_hash = row.get("key_hash") or ""
    if not hmac.compare_digest(key_hash, stored_hash):
        logger.warning("invalid_api_key_secret", extra={"key_id": key_id})
        raise HTTPException(status_code=401, detail="Invalid API Key")

    # 3. Explicitly verify the tenant exists to catch DB corruption
    tenant_id = row.get("tenant_id")
    if not tenant_id:
        logger.error("api_key_missing_tenant", extra={"key_id": key_id})
        raise HTTPException(status_code=500, detail="Invalid API key configuration")

    return tenant_id, key_id


def safe_process_raw_event_sync(ingestion_service: IngestionService, **payload):
    """
    7. Wrapped background executor: prevents hidden pipeline exceptions 
    from silently failing and dropping payloads out of memory.
    """
    try:
        ingestion_service.process_raw_event_sync(**payload)
    except Exception:
        logger.exception(
            "background_ingestion_failed", 
            extra={
                "tenant_id": payload.get("tenant_id"),
                "event_name": payload.get("event_name"),
                "idempotency_key": payload.get("idempotency_key")
            }
        )


# ---------------------------------------------------------
# SCHEMAS 
# ---------------------------------------------------------

class EventProperties(BaseModel):
    device: Optional[str] = None
    country: Optional[str] = None
    user_type: Optional[str] = None
    plan_tier: Optional[str] = None

    reason: Optional[str] = None
    feedback_text: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)

    metadata: Dict[str, Any] = Field(default_factory=dict)


SIGNAL_EVENT_ALIASES = {
    "stripe.invoice.payment_failed": "invoice_payment_failed",
    "invoice.payment_failed": "invoice_payment_failed",
    "payment_failed": "invoice_payment_failed",
    "subscription.cancelled": "subscription_cancelled",
    "subscription.canceled": "subscription_cancelled",
    "customer.subscription.deleted": "subscription_cancelled",
    "trial.expired": "trial_expired",
    "downgrade.requested": "downgrade_requested",
    "cancellation.intent_detected": "cancellation_intent_detected",
    "feedback": "feedback_submitted",
    "invoice.paid": "invoice_paid",
    "stripe.invoice.paid": "invoice_paid",
    "charge.succeeded": "charge_succeeded",
    "stripe.charge.succeeded": "charge_succeeded",
}

ALLOWED_SIGNAL_EVENTS = frozenset({
    "invoice_payment_failed",
    "subscription_cancelled",
    "trial_expired",
    "downgrade_requested",
    "cancellation_intent_detected",
    "feedback_submitted",
    "user_activity",
    "login",
    "session_started",
    "feature_used",
    "user_returned",
    "subscription_restored",
    "revenue_recovered",
    "email_sent",
    "invoice_paid",
    "charge_succeeded",
    "subscription_payment_success",
})


def canonical_track_event_name(value: str) -> str:
    normalized = value.strip().lower()
    return SIGNAL_EVENT_ALIASES.get(normalized, normalized.replace(".", "_"))


class TrackEventRequest(BaseModel):
    event_name: str = Field(..., min_length=1, max_length=100)
    user_id: Optional[str] = None

    idempotency_key: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    properties: EventProperties = Field(default_factory=EventProperties)

    @field_validator("event_name", mode="before")
    @classmethod
    def normalize_event_name(cls, v: Any):
        if isinstance(v, str):
            return canonical_track_event_name(v)
        return v

    @field_validator("user_id", mode="before")
    @classmethod
    def normalize_user_id(cls, v: Any):
        if isinstance(v, str):
            return v.strip() if v.strip() else None
        return v


class TrackEventResponse(BaseModel):
    status: str
    idempotency_key: str
    anomalies: List[Dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------
# API ROUTE (SINGLE SOURCE OF TRUTH)
# ---------------------------------------------------------

@router.post("/", response_model=TrackEventResponse, status_code=status.HTTP_202_ACCEPTED)
async def track_event(
    request: TrackEventRequest,
    background_tasks: BackgroundTasks,
    sync: bool = Query(False, description="Run ingestion + pipeline synchronously (debug only)"),
    auth_data: Tuple[str, str] = Depends(resolve_tenant),
    ingestion_service: IngestionService = Depends()
):
    """
    Unified ingestion endpoint:
    - Idempotent
    - Async by default
    - Optional sync mode for debugging
    """
    
    tenant_id, key_id = auth_data

    # 5. Background task assignment pulled out of the auth dependency
    background_tasks.add_task(update_last_used_at, key_id)

    # ------------------------
    # VALIDATION (HIGH SIGNAL)
    # ------------------------
    if request.event_name not in ALLOWED_SIGNAL_EVENTS:
        logger.info(
            "track_event_rejected_non_signal",
            extra={"tenant_id": tenant_id, "event_name": request.event_name},
        )
        raise HTTPException(
            status_code=422,
            detail="Event is not an approved churn or recovery signal."
        )

    if request.event_name == "feedback_submitted":
        if not (
            request.properties.reason or
            request.properties.feedback_text or
            request.properties.rating
        ):
            raise HTTPException(
                status_code=422,
                detail="feedback_submitted requires signal"
            )

    try:
        payload = {
            "tenant_id": tenant_id,
            "event_name": request.event_name,
            "user_id": request.user_id,
            "idempotency_key": request.idempotency_key,
            "timestamp": request.timestamp,
            "properties": request.properties.model_dump(exclude_none=True)
        }

        # ---------------------------------------------------------
        # SYNC MODE (DEBUG / INTERNAL TOOLS)
        # ---------------------------------------------------------
        if sync:
            result = await ingestion_service.process_raw_event(**payload)

            return {
                "status": result.get("status", "processed_sync"),
                "idempotency_key": request.idempotency_key,
                "anomalies": result.get("anomalies", [])
            }

        # ---------------------------------------------------------
        # ASYNC MODE (PRODUCTION PATH)
        # ---------------------------------------------------------
        
        # 7. Dispatched using the safe wrapper
        background_tasks.add_task(
            safe_process_raw_event_sync,
            ingestion_service,
            **payload
        )

        return {
            "status": "accepted",
            "idempotency_key": request.idempotency_key
        }

    except Exception:
        logger.error("track_event_failed", exc_info=True)

        raise HTTPException(
            status_code=500,
            detail="Failed to ingest event"
        )
