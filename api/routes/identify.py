import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from api.services.security.api_key_cache import resolve_cached_api_key_tenant
from api.worker.identify import process_identify_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["Identify"])


class IdentifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(..., min_length=1, max_length=256)
    email: EmailStr
    name: Optional[str] = Field(default=None, max_length=256)
    plan: Optional[str] = Field(default=None, max_length=128)

    @field_validator("user_id", "name", "plan", mode="before")
    @classmethod
    def strip_strings(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class IdentifyResponse(BaseModel):
    status: str


@router.post(
    "/identify",
    response_model=IdentifyResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def identify_user(
    payload: IdentifyRequest,
    tenant_id: str = Depends(resolve_cached_api_key_tenant),
) -> IdentifyResponse:
    """Accept a user identity heartbeat without querying PostgreSQL.

    The request path validates JSON, authenticates from Redis, enqueues a
    Dramatiq job, and returns.  All database writes happen in the worker.
    """
    try:
        process_identify_payload.send(
            tenant_id=tenant_id,
            user_id=payload.user_id,
            email=str(payload.email),
            name=payload.name,
            plan=payload.plan,
        )
    except Exception:
        logger.exception("identify_enqueue_failed tenant=%s", tenant_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identify ingestion queue unavailable",
        )

    return IdentifyResponse(status="accepted")
