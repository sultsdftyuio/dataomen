import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.database import get_db, get_db_pool
from api.services.tenant_security_provider import get_current_tenant
from api.services.metrics_service import fetch_current_metric, fetch_metric_history
from api.services.anomaly_detector import AnomalyDetector, check_anomaly
from api.services.explanation_engine import ExplanationEngine
from api.services.alert_engine import handle_anomaly_alert

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/metrics", tags=["Insights"])


# ---------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------

class SegmentImpact(BaseModel):
    segment: str
    impact: str


class MetricInsightResponse(BaseModel):
    metric: str
    is_anomaly: bool
    severity: Optional[float]
    current_value: float
    baseline: Optional[float]
    direction: Optional[str]
    explanation: Optional[Dict[str, Any]]
    top_segments: List[SegmentImpact] = []


class FeedbackSummary(BaseModel):
    total_feedback_events: int
    top_reasons: List[List[Any]]


class FeedbackResponse(BaseModel):
    anomaly_context: Dict[str, Any]
    summary: FeedbackSummary
    raw_feedback: List[Dict[str, Any]]


# ---------------------------------------------------------
# CORE INSIGHTS ENDPOINT (PRIMARY ENTRY)
# ---------------------------------------------------------

@router.get("/{metric_name}/insights", response_model=MetricInsightResponse)
async def get_metric_insights(
    metric_name: str,
    force_run: bool = Query(False, description="Force recompute"),
    tenant_id: str = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    db_pool = Depends(get_db_pool)
):
    """
    Unified Insights Endpoint:

    Flow:
    metric_values → anomaly → explanation (AI) → alert → segment analysis
    """

    metric_name = metric_name.strip().lower()

    try:
        # -------------------------
        # FETCH DATA
        # -------------------------
        current_value = fetch_current_metric(db, tenant_id, metric_name)
        history = fetch_metric_history(db, tenant_id, metric_name, days=7)

        if current_value == 0 and not history:
            return MetricInsightResponse(
                metric=metric_name,
                is_anomaly=False,
                severity=None,
                current_value=0.0,
                baseline=None,
                direction=None,
                explanation={"message": "No data available yet."},
                top_segments=[]
            )

        # -------------------------
        # DETECTION
        # -------------------------
        anomaly = check_anomaly(metric_name, current_value, history)

        # -------------------------
        # EXPLANATION ENGINE (AI + RULES)
        # -------------------------
        explanation_engine = ExplanationEngine(db_pool)

        explanation = await explanation_engine.generate(
            tenant_id=tenant_id,
            anomaly=anomaly
        )

        segments: List[Dict[str, str]] = []

        # -------------------------
        # ROOT CAUSE (SEGMENTS)
        # -------------------------
        if anomaly.get("is_anomaly"):
            handle_anomaly_alert(db, tenant_id, anomaly)

            try:
                detector = AnomalyDetector(db_pool)

                current_time = datetime.now().replace(minute=0, second=0, microsecond=0)

                segment_data = await detector.detect_anomalies(
                    tenant_id,
                    metric_name,
                    current_time
                )

                if segment_data:
                    segments = segment_data.get("top_segments", [])

            except Exception:
                logger.warning("segment_analysis_failed", exc_info=True)

        return MetricInsightResponse(
            metric=metric_name,
            is_anomaly=anomaly.get("is_anomaly", False),
            severity=anomaly.get("deviation_pct"),
            current_value=current_value,
            baseline=anomaly.get("baseline"),
            direction=anomaly.get("direction"),
            explanation=explanation,
            top_segments=segments
        )

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    except Exception:
        logger.error("metric_insights_failed", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to compute metric insights"
        )


# ---------------------------------------------------------
# FEEDBACK DRILLDOWN ENDPOINT (POWER FEATURE)
# ---------------------------------------------------------

@router.get(
    "/{metric_name}/anomalies/{timestamp}/feedback",
    response_model=FeedbackResponse
)
async def get_anomaly_feedback(
    metric_name: str,
    timestamp: datetime,
    dimension: Optional[str] = Query(None),
    dimension_value: Optional[str] = Query(None),
    tenant_id: str = Depends(get_current_tenant),
    db_pool = Depends(get_db_pool)
):
    """
    Drilldown endpoint:
    Returns "WHY users are reacting" around an anomaly.
    """

    try:
        engine = ExplanationEngine(db_pool)

        feedback = await engine.fetch_contextual_feedback(
            tenant_id=tenant_id,
            anomaly_timestamp=timestamp,
            dimension=dimension,
            dimension_value=dimension_value,
            hours_radius=2,
            limit=50
        )

        # -------------------------
        # SUMMARIZATION (FAST)
        # -------------------------
        reason_counts: Dict[str, int] = {}

        for f in feedback:
            reason = f.get("reason") or "unspecified"
            reason_counts[reason] = reason_counts.get(reason, 0) + 1

        top_reasons = sorted(
            reason_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:3]

        return FeedbackResponse(
            anomaly_context={
                "metric": metric_name,
                "timestamp": timestamp,
                "segment": f"{dimension}={dimension_value}" if dimension else "global"
            },
            summary=FeedbackSummary(
                total_feedback_events=len(feedback),
                top_reasons=top_reasons
            ),
            raw_feedback=feedback
        )

    except Exception:
        logger.error("feedback_fetch_failed", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch anomaly feedback"
        )