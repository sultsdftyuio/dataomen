import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Security, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, validator, constr

from api.services.ingestion_service import IngestionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/track", tags=["Events"])
security = HTTPBearer()


# ---------------------------------------------------------
# TENANT RESOLUTION
# ---------------------------------------------------------

def resolve_tenant(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    token = credentials.credentials

    if not token:
        raise HTTPException(status_code=401, detail="Missing API Key")

    if token == "arcli_test_key_123":
        return "acme_tenant"

    raise HTTPException(status_code=401, detail="Invalid API Key")


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
                "status": "processed_sync",
                "idempotency_key": request.idempotency_key,
                "anomalies": result.get("anomalies", [])
            }

        # ---------------------------------------------------------
        # ASYNC MODE (PRODUCTION PATH)
        # ---------------------------------------------------------
        background_tasks.add_task(
            ingestion_service.process_raw_event,
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