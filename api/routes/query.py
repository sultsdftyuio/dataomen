# api/routes/query.py
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from api.auth import get_current_tenant_id
from api.services.user_drilldown import UserDrilldownService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Query & Drilldown"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AffectedUser(BaseModel):
    user_id: str
    last_seen_at: datetime
    user_email: Optional[str] = None


class SegmentContext(BaseModel):
    key: Optional[str] = None
    value: Optional[str] = None


class AffectedUsersResponse(BaseModel):
    tenant_id: str
    event_name: str
    target_date: str
    segment: SegmentContext
    users: List[AffectedUser]
    next_cursor: Optional[str] = Field(None, description="Next page user_id cursor")
    next_last_seen_at: Optional[datetime] = Field(None, description="Next page timestamp cursor")
    has_more: bool


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/metrics/{event_name}/affected_users",
    response_model=AffectedUsersResponse,
    status_code=status.HTTP_200_OK,
)
def get_affected_users(
    event_name: str,
    target_date: date = Query(..., description="The date of the anomaly (YYYY-MM-DD)."),
    segment_key: Optional[str] = Query(None, description="Property key to filter by (e.g., country, plan)."),
    segment_value: Optional[str] = Query(None, description="Value of the segment property."),
    cursor: Optional[str] = Query(
        None, description="The last_seen_user_id returned from the previous page."
    ),
    last_seen_at: Optional[datetime] = Query(
        None, description="The last_seen_at timestamp returned from the previous page."
    ),
    limit: int = Query(100, ge=1, le=500, description="Max records to return per page."),
    tenant_id: str = Depends(get_current_tenant_id),
):
    """
    Retrieves a paginated list of users affected by an anomaly for a specific metric.
    
    Uses composite keyset pagination (user_id + last_seen_at) to guarantee stable O(1) 
    performance on large datasets. Executed in threadpool to prevent DB blocking.
    """
    try:
        # Service runs sync engine operations; executed cleanly without `await`
        result = UserDrilldownService.get_affected_users_paginated(
            tenant_id=tenant_id,
            event_name=event_name,
            target_date=target_date,  # Passed as raw date object to satisfy validation guardrails
            segment_key=segment_key,
            segment_value=segment_value,
            limit=limit,
            last_seen_user_id=cursor,
            last_seen_at=last_seen_at,
        )

        return result

    except HTTPException:
        # Re-raise intentional HTTP exceptions (400 Bad Request, 403 Forbidden, etc.) unchanged
        raise

    except Exception:
        logger.exception(
            "Failed drilldown lookup for tenant_id=%s event_name=%s target_date=%s",
            tenant_id,
            event_name,
            target_date,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process drilldown request.",
        )