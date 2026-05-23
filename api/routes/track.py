import uuid
import logging
import os
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, Optional, List, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Security, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, validator, constr

from api.services.ingestion_service import IngestionService
from supabase import create_client, Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/track", tags=["Events"])
security = HTTPBearer()

API_KEY_PREFIX = os.getenv("API_KEY_PREFIX", "arcli_live_")
API_KEY_PEPPER = os.getenv("API_KEY_PEPPER")
_supabase_client: Optional[Client] = None


# ---------------------------------------------------------
# TENANT RESOLUTION
# ---------------------------------------------------------

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


def _parse_api_key(raw: str) -> Optional[Tuple[str, str]]:
    if not raw or not raw.startswith(API_KEY_PREFIX):
        return None

    trimmed = raw[len(API_KEY_PREFIX):]
    if "_" not in trimmed:
        return None

    key_id, secret = trimmed.split("_", 1)
    if not key_id or not secret:
        return None

    return key_id, secret


def _hash_secret(secret: str) -> Optional[str]:
    if not API_KEY_PEPPER:
        logger.error("api_key_pepper_missing")
        return None

    return hmac.new(
        API_KEY_PEPPER.encode("utf-8"),
        secret.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _resolve_tenant_from_key(raw_key: str) -> Optional[str]:
    parsed = _parse_api_key(raw_key)
    if not parsed:
        return None

    key_id, secret = parsed
    key_hash = _hash_secret(secret)
    if not key_hash:
        return None

    client = _get_supabase_client()
    if not client:
        return None

    response = (
        client
        .table("api_keys")
        .select("tenant_id, key_hash, revoked_at")
        .eq("key_id", key_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        return None

    row = response.data[0]
    if row.get("revoked_at"):
        return None

    stored_hash = row.get("key_hash") or ""
    if not hmac.compare_digest(key_hash, stored_hash):
        return None

    try:
        client.table("api_keys").update({
            "last_used_at": datetime.now(timezone.utc).isoformat()
        }).eq("key_id", key_id).execute()
    except Exception:
        logger.warning("api_key_last_used_update_failed", exc_info=True)

    return row.get("tenant_id")


def resolve_tenant(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    token = credentials.credentials

    if not token:
        raise HTTPException(status_code=401, detail="Missing API Key")

    tenant_id = _resolve_tenant_from_key(token)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Invalid API Key")

    return tenant_id


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


class TrackEventRequest(BaseModel):
    event_name: constr(min_length=1, max_length=100)
    user_id: Optional[str] = None

    idempotency_key: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    properties: EventProperties = Field(default_factory=EventProperties)

    @validator("event_name")
    def normalize_event_name(cls, v: str):
        return v.lower().strip()

    @validator("user_id")
    def normalize_user_id(cls, v: Optional[str]):
        return v.strip() if v else v


class TrackEventResponse(BaseModel):
    status: str
    idempotency_key: str
    anomalies: Optional[List[Dict]] = None


# ---------------------------------------------------------
# API ROUTE (SINGLE SOURCE OF TRUTH)
# ---------------------------------------------------------

@router.post("/", response_model=TrackEventResponse, status_code=status.HTTP_202_ACCEPTED)
async def track_event(
    request: TrackEventRequest,
    background_tasks: BackgroundTasks,
    sync: bool = Query(False, description="Run ingestion + pipeline synchronously (debug only)"),
    tenant_id: str = Depends(resolve_tenant),
    ingestion_service: IngestionService = Depends()
):
    """
    Unified ingestion endpoint:
    - Idempotent
    - Async by default
    - Optional sync mode for debugging
    """

    # ------------------------
    # VALIDATION (HIGH SIGNAL)
    # ------------------------
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
            "properties": request.properties.dict(exclude_none=True)
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
        background_tasks.add_task(
            ingestion_service.process_raw_event_sync,
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