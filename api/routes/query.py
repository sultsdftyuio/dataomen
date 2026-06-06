import logging
import os
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from api.services.user_drilldown import UserDrilldownService

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ALLOW_DEV_TENANT_HEADER = os.getenv("ALLOW_DEV_TENANT_HEADER") == "true"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class AffectedUser(BaseModel):
    user_id: str
    user_email: str | None = None
    # Add whatever fields your service layer returns
    # e.g., impact_score: float
    # e.g., first_seen: datetime


class AffectedUsersResponse(BaseModel):
    users: list[AffectedUser]
    next_cursor: str | None


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
def require_tenant(request: Request) -> str:
    """
    Dependency to strictly enforce tenant isolation.
    Extracts tenant_id from the verified auth context attached by middleware.
    """
    tenant_id = getattr(request.state, "authenticated_tenant_id", None)

    # Dev-only override. Never enable this in production.
    if not tenant_id and ALLOW_DEV_TENANT_HEADER:
        tenant_id = request.headers.get("x-tenant-id")
        if tenant_id:
            logger.warning(
                "Dev header override used for tenant_id=%s from %s",
                tenant_id,
                request.client.host if request.client else "unknown",
            )

    if not tenant_id:
        logger.warning("Unauthorized access attempt: Missing authenticated_tenant_id")
        raise HTTPException(status_code=401, detail="Unauthorized")

    return tenant_id


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get(
    "/metrics/{event_name}/affected_users",
    response_model=AffectedUsersResponse,
)
async def get_affected_users(
    event_name: str,
    target_date: date = Query(..., description="The date of the anomaly."),
    segment_key: Optional[str] = Query(None),
    segment_value: Optional[str] = Query(None),
    cursor: Optional[str] = Query(
        None, description="The last_seen_user_id from the previous page."
    ),
    limit: int = Query(100, ge=1, le=1000),
    tenant_id: str = Depends(require_tenant),
):
    """
    Retrieves a paginated list of users affected by an anomaly for a specific metric.
    """
    try:
        result = await UserDrilldownService.get_affected_users_paginated(
            tenant_id=tenant_id,
            event_name=event_name,
            target_date=target_date.isoformat(),  # Pass as string to service if needed
            segment_key=segment_key,
            segment_value=segment_value,
            limit=limit,
            last_seen_user_id=cursor,
        )

        return result

    except HTTPException:
        # Re-raise intentional HTTP exceptions (404, 400, etc.) unchanged
        raise

    except Exception:
        logger.exception(
            "Failed drilldown lookup tenant=%s event=%s date=%s",
            tenant_id,
            event_name,
            target_date,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to process drilldown request.",
        )