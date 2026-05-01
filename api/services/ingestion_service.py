from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session

from api.database import Event, get_db

# ---------------------------------------------------------
# Setup & Security
# ---------------------------------------------------------

router = APIRouter()
security = HTTPBearer()


def resolve_tenant(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """
    Validates the Bearer token and resolves it to a tenant_id.
    """
    token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API Key",
        )

    # MVP: static mapping
    if token == "arcli_test_key_123":
        return "acme_tenant"

    # ❌ REMOVE insecure fallback
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API Key",
    )


# ---------------------------------------------------------
# Schemas
# ---------------------------------------------------------

class TrackEventPayload(BaseModel):
    """
    Strict validation schema for incoming product events.
    """
    event_name: str = Field(..., min_length=1, max_length=100)
    user_id: str = Field(..., min_length=1, max_length=100)
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)

    @validator("event_name")
    def normalize_event_name(cls, v: str) -> str:
        return v.lower().strip()

    @validator("user_id")
    def normalize_user_id(cls, v: str) -> str:
        return v.strip()


# ---------------------------------------------------------
# Core Service Logic
# ---------------------------------------------------------

def process_incoming_event(
    db: Session,
    tenant_id: str,
    payload: TrackEventPayload,
) -> dict:
    """
    Inserts a normalized event with strict tenant isolation.
    """
    if not tenant_id:
        raise ValueError("tenant_id is required")

    new_event = Event(
        tenant_id=tenant_id,
        event_name=payload.event_name,
        user_id=payload.user_id,
        timestamp=payload.timestamp or datetime.utcnow(),
    )

    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    return {
        "status": "success",
        "event_id": new_event.id,
        "tenant_id": tenant_id,
        "event_name": payload.event_name,
    }


# ---------------------------------------------------------
# API Route
# ---------------------------------------------------------

@router.post("/track", status_code=status.HTTP_201_CREATED)
def track_event(
    payload: TrackEventPayload,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_tenant),
):
    """
    Ingestion endpoint for product analytics events.

    Example:
    POST /track
    Authorization: Bearer <api_key>

    {
      "event_name": "signup",
      "user_id": "usr_999"
    }
    """
    try:
        return process_incoming_event(db, tenant_id, payload)

    except ValueError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    except Exception:
        db.rollback()
        # ❌ do NOT leak internal errors
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to ingest event",
        )