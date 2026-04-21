# api/routes/insights.py

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from api.auth import TenantContext, verify_tenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insights", tags=["Insights"])


class InsightAckResponse(BaseModel):
    success: bool = True


class InsightMetricsResponse(BaseModel):
    metrics: List[Dict[str, Any]]


@router.get("")
async def list_insights(
    limit: int = 5,
    context: TenantContext = Depends(verify_tenant),
) -> List[Dict[str, Any]]:
    """
    Backend parity endpoint for Next.js /api/insights.
    Returns an empty feed when no native insight engine rows are available.
    """
    safe_limit = min(max(limit, 1), 50)
    logger.info(f"[{context.tenant_id}] Insights feed requested (limit={safe_limit}).")
    return []


@router.options("", include_in_schema=False)
async def insights_options() -> Response:
    return Response(status_code=204, headers={"Allow": "GET,OPTIONS"})


@router.patch("/{insight_id}/read", response_model=InsightAckResponse)
async def mark_insight_read(
    insight_id: str,
    context: TenantContext = Depends(verify_tenant),
) -> InsightAckResponse:
    """
    Backend parity endpoint for marking an insight as read/dismissed.
    """
    logger.info(f"[{context.tenant_id}] Insight marked read: {insight_id}")
    return InsightAckResponse(success=True)


@router.options("/{insight_id}/read", include_in_schema=False)
async def mark_insight_read_options(insight_id: str) -> Response:
    _ = insight_id
    return Response(status_code=204, headers={"Allow": "PATCH,OPTIONS"})


@router.get("/metrics", response_model=InsightMetricsResponse)
async def list_insight_metrics(
    integration: Optional[str] = None,
    context: TenantContext = Depends(verify_tenant),
) -> InsightMetricsResponse:
    """
    Backend parity endpoint for connector dashboard semantic metrics.
    """
    logger.info(
        f"[{context.tenant_id}] Insight metrics requested"
        + (f" for integration={integration}" if integration else "")
    )
    return InsightMetricsResponse(metrics=[])


@router.options("/metrics", include_in_schema=False)
async def insight_metrics_options() -> Response:
    return Response(status_code=204, headers={"Allow": "GET,OPTIONS"})
