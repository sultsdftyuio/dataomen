import logging
import json
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, text

from api.database import get_db, get_async_db
from api.auth import get_current_tenant_id, get_current_tenant
from api.models import ChurnRiskState, RecoveryAttribution, RecoveryEmail
from api.services.metrics_service import MetricsService
from api.services.anomaly_detector import AnomalyDetector
from api.services.alert_engine import handle_anomaly_alert

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/metrics", tags=["Insights"])

# ---------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------

class RecentRisk(BaseModel):
    id: str
    email: str
    signal: str
    mrr: float
    status: str
    cooldown: Optional[str] = None

class MetricsSummaryResponse(BaseModel):
    recoveredMrr: float
    atRiskMrr: float
    recoveryRate: float
    activeRisks: int
    recentRisks: List[RecentRisk]

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
# DASHBOARD SUMMARY ENDPOINT
# ---------------------------------------------------------

@router.get("/summary", response_model=MetricsSummaryResponse)
async def get_metrics_summary(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Returns the high-level ROI and Risk Queue overview for the dashboard.
    Strictly tenant-isolated using explicitly resolved workspace UUIDs.
    """
    try:
        # 1. Recovered MRR: Sum of revenue from successful attributions in the last 30 days
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        recovered_mrr = db.query(func.coalesce(func.sum(RecoveryAttribution.revenue), 0.0)) \
            .filter(RecoveryAttribution.tenant_id == tenant_id) \
            .filter(RecoveryAttribution.attributed_at >= thirty_days_ago) \
            .scalar()

        # 2. At-Risk MRR & Active Risks: From current unrecovered ChurnRiskState
        risk_stats = db.query(
            func.count(ChurnRiskState.id).label("active_risks"),
            func.coalesce(func.sum(ChurnRiskState.risk_score), 0.0).label("at_risk_mrr")
        ) \
        .filter(ChurnRiskState.tenant_id == tenant_id) \
        .filter(ChurnRiskState.risk_tier.in_(["high", "critical"])) \
        .first()

        active_risks = int(risk_stats.active_risks or 0) if risk_stats else 0
        at_risk_mrr = float(risk_stats.at_risk_mrr or 0.0) if risk_stats else 0.0

        # 3. Recovery Rate (Deterministic Logic)
        # Total distinct users intervened vs total users attributed to revenue
        total_interventions = db.query(func.count(func.distinct(RecoveryEmail.user_id))) \
            .filter(RecoveryEmail.tenant_id == tenant_id).scalar() or 0
        
        recovered_users = db.query(func.count(func.distinct(RecoveryAttribution.user_id))) \
            .filter(RecoveryAttribution.tenant_id == tenant_id).scalar() or 0

        recovery_rate = round((recovered_users / total_interventions * 100), 1) if total_interventions > 0 else 0.0

        # 4. Recent Live Risk Queue Preview (Top 5)
        recent_risks_query = db.query(ChurnRiskState).filter(
            ChurnRiskState.tenant_id == tenant_id,
            ChurnRiskState.risk_tier.in_(["high", "critical"])
        ).order_by(ChurnRiskState.updated_at.desc()).limit(5).all()

        recent_risks = []
        for risk in recent_risks_query:
            recent_risks.append(
                RecentRisk(
                    id=str(risk.id),
                    email=f"{risk.user_id}@placeholder.com",  # Replace with actual join to tenant_users if email is stored locally
                    signal="inactivity" if not risk.risk_tier else risk.risk_tier,
                    mrr=float(risk.risk_score or 0.0),
                    status="Pending Review",
                    cooldown=None
                )
            )

        return MetricsSummaryResponse(
            recoveredMrr=float(recovered_mrr or 0.0),
            atRiskMrr=at_risk_mrr,
            recoveryRate=recovery_rate,
            activeRisks=active_risks,
            recentRisks=recent_risks
        )

    except Exception:
        logger.exception("Failed to compile dashboard metrics summary for tenant=%s", tenant_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load dashboard summary metrics."
        )


# ---------------------------------------------------------
# CORE INSIGHTS ENDPOINT (DETERMINISTIC)
# ---------------------------------------------------------

@router.get("/{metric_name}/insights", response_model=MetricInsightResponse)
async def get_metric_insights(
    metric_name: str,
    force_run: bool = Query(False, description="Force recompute"),
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    async_db: AsyncSession = Depends(get_async_db)
):
    """
    Unified Insights Endpoint (Deterministic Rules Engine)
    Flow: metric_values → mathematical anomaly detection → rule-based explanation → alert
    """
    metric_name = metric_name.strip().lower()

    try:
        # -------------------------
        # FETCH DATA
        # -------------------------
        metrics_svc = MetricsService(db)
        
        current_value = metrics_svc.get_metric_latest(tenant_id, metric_name)
        history = metrics_svc.fetch_metric_history(tenant_id, metric_name, days=7)

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
        # STATISTICAL DETECTION
        # -------------------------
        detector = AnomalyDetector(db)

        anomaly = detector._analyze_single_metric(
            metric_name=metric_name,
            current_value=current_value,
            history=history,
            config={}  # Pass an empty config to use detector defaults
        )

        # -------------------------
        # DETERMINISTIC EXPLANATION
        # -------------------------
        # ARCLI v2.0 DIRECTIVE: No AI generation. We use strict rule-based formatting.
        explanation = {"message": "System nominal. No significant deviations detected."}
        
        if anomaly.get("is_anomaly"):
            direction = anomaly.get("direction", "shifted")
            deviation = anomaly.get("deviation_pct", 0)
            baseline = anomaly.get("baseline", 0)
            
            explanation = {
                "message": f"Deterministic Alert: {metric_name.capitalize()} has {direction} by {round(deviation, 1)}%. "
                           f"Current value ({current_value}) exceeds the historical baseline ({baseline}).",
                "type": "rule_based_threshold"
            }

        segments: List[SegmentImpact] = []

        # -------------------------
        # ROOT CAUSE (SEGMENTS)
        # -------------------------
        if anomaly.get("is_anomaly"):
            handle_anomaly_alert(db, tenant_id, anomaly)

            try:
                # Enforce UTC timezone to prevent cross-region drift
                current_time = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

                raw_segments = detector._analyze_segments(
                    tenant_id=tenant_id,
                    metric_name=metric_name,
                    target_date=current_time.strftime("%Y-%m-%d")
                )
                
                # Format segments safely into response schema objects
                for seg in (raw_segments or []):
                    if isinstance(seg, dict) and "segment" in seg and "impact" in seg:
                        segments.append(SegmentImpact(segment=str(seg["segment"]), impact=str(seg["impact"])))

            except Exception:
                logger.warning("Segment analysis failed for tenant=%s metric=%s", tenant_id, metric_name, exc_info=True)

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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    except Exception:
        logger.exception("Metric insights execution failed for tenant=%s metric=%s", tenant_id, metric_name)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute metric insights"
        )


# ---------------------------------------------------------
# FEEDBACK DRILLDOWN ENDPOINT (DETERMINISTIC QUERY)
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
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Drilldown endpoint:
    Returns exact reasons for churn/feedback using deterministic SQL, without AI summarization overhead.
    """
    try:
        # Enforce UTC timezone on incoming timestamp
        target_ts = timestamp.astimezone(timezone.utc) if timestamp.tzinfo else timestamp.replace(tzinfo=timezone.utc)
        start_ts = target_ts - timedelta(hours=2)
        end_ts = target_ts + timedelta(hours=2)

        # -------------------------
        # DETERMINISTIC DATA FETCH
        # -------------------------
        # Bypass the "ExplanationEngine" entirely and query the events table directly.
        sql = text("""
            SELECT properties
            FROM events
            WHERE tenant_id = :tenant_id
              AND event_name = 'feedback_submitted'
              AND timestamp >= :start_ts
              AND timestamp <= :end_ts
            LIMIT 50
        """)

        rows = db.execute(sql, {
            "tenant_id": tenant_id,
            "start_ts": start_ts.isoformat(),
            "end_ts": end_ts.isoformat()
        }).fetchall()

        feedback = []
        reason_counts: Dict[str, int] = {}

        # -------------------------
        # DETERMINISTIC SUMMARIZATION
        # -------------------------
        for row in rows:
            props = row._mapping.get("properties", {}) if hasattr(row, "_mapping") else (row[0] if row else {})
            if isinstance(props, str):
                try:
                    props = json.loads(props)
                except json.JSONDecodeError:
                    props = {}
            
            if isinstance(props, dict):
                feedback.append(props)
                
                # Extract standard categorical reason safely
                reason = str(props.get("reason") or "unspecified").strip().lower()
                reason_counts[reason] = reason_counts.get(reason, 0) + 1

        top_reasons = sorted(
            reason_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:3]

        return FeedbackResponse(
            anomaly_context={
                "metric": metric_name,
                "timestamp": target_ts.isoformat(),
                "segment": f"{dimension}={dimension_value}" if dimension else "global"
            },
            summary=FeedbackSummary(
                total_feedback_events=len(feedback),
                top_reasons=[list(x) for x in top_reasons]
            ),
            raw_feedback=feedback
        )

    except Exception:
        logger.exception("Feedback drilldown fetch failed for tenant=%s metric=%s", tenant_id, metric_name)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch deterministic anomaly feedback"
        )