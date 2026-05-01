from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any

from api.database import get_db
from api.services.metrics_service import (
    fetch_current_metric,
    fetch_metric_history
)
from api.services.anomaly_detector import check_anomaly
from api.services.explanation_engine import generate_explanation
from api.services.alert_engine import handle_anomaly_alert

router = APIRouter()


# ---------------------------------------------------------
# REQUEST SCHEMA
# ---------------------------------------------------------

class MetricRunRequest(BaseModel):
    tenant_id: str = Field(..., min_length=1)
    metric_name: str = Field(..., min_length=1)


# ---------------------------------------------------------
# RESPONSE SHAPE (CONSISTENT)
# ---------------------------------------------------------

def _build_response(
    anomaly: Dict[str, Any],
    explanation: Dict[str, Any],
    current_value: float
) -> Dict[str, Any]:
    return {
        "metric": anomaly.get("metric_name"),
        "is_anomaly": anomaly.get("is_anomaly", False),
        "severity": anomaly.get("deviation_pct"),
        "current_value": current_value,
        "baseline": anomaly.get("baseline"),
        "direction": anomaly.get("direction"),
        "explanation": explanation
    }


# ---------------------------------------------------------
# CORE ROUTE
# ---------------------------------------------------------

@router.post("/metrics/run")
def run_metric_detection(
    payload: MetricRunRequest,
    db: Session = Depends(get_db)
):
    """
    Runs anomaly detection on a single metric.

    Flow:
    metric_values → anomaly_engine → explanation_engine → alert_engine
    """

    try:
        tenant_id = payload.tenant_id.strip()
        metric_name = payload.metric_name.strip().lower()

        # ------------------------
        # FETCH DATA
        # ------------------------
        current_value = fetch_current_metric(
            db,
            tenant_id,
            metric_name
        )

        history = fetch_metric_history(
            db,
            tenant_id,
            metric_name,
            days=7
        )

        # ------------------------
        # NO DATA CASE
        # ------------------------
        if current_value == 0 and not history:
            return {
                "metric": metric_name,
                "is_anomaly": False,
                "message": "No data available for this metric yet."
            }

        # ------------------------
        # ANOMALY DETECTION
        # ------------------------
        anomaly = check_anomaly(
            metric_name,
            current_value,
            history
        )

        # ------------------------
        # EXPLANATION
        # ------------------------
        explanation = generate_explanation(anomaly)

        # ------------------------
        # 🔥 ALERT ENGINE (NEW)
        # ------------------------
        if anomaly.get("is_anomaly"):
            handle_anomaly_alert(db, tenant_id, anomaly)

        # ------------------------
        # FINAL RESPONSE
        # ------------------------
        return _build_response(
            anomaly,
            explanation,
            current_value
        )

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    except Exception as e:
        # log internally if you have logging
        raise HTTPException(
            status_code=500,
            detail="Metric detection failed"
        )