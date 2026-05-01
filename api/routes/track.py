from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session

from api.database import Event, MetricValue, get_db
from api.services.metrics_service import (
    aggregate_daily_metrics,
    fetch_metric_history,
)
from api.services.anomaly_detector import check_anomaly
from api.services.explanation_engine import generate_explanation

# ---------------------------------------------------------
# Setup & Security
# ---------------------------------------------------------

router = APIRouter()
security = HTTPBearer()


def resolve_tenant(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API Key",
        )

    # MVP static mapping
    if token == "arcli_test_key_123":
        return "acme_tenant"

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API Key",
    )


# ---------------------------------------------------------
# Schemas
# ---------------------------------------------------------

class TrackEventPayload(BaseModel):
    event_name: str = Field(..., min_length=1, max_length=100)
    user_id: str = Field(..., min_length=1, max_length=100)
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)

    @validator("event_name")
    def normalize_event_name(cls, v: str) -> str:
        return v.lower().strip()

    @validator("user_id")
    def normalize_user_id(cls, v: str) -> str:
        return v.strip()


class TrackEventResponse(BaseModel):
    status: str
    event_id: int
    tenant_id: str
    event_name: str
    anomalies: Optional[List[dict]] = []


# ---------------------------------------------------------
# Core Logic
# ---------------------------------------------------------

def process_incoming_event(
    db: Session,
    tenant_id: str,
    payload: TrackEventPayload,
) -> Event:
    if not tenant_id:
        raise ValueError("tenant_id is required")

    event = Event(
        tenant_id=tenant_id,
        event_name=payload.event_name,
        user_id=payload.user_id,
        timestamp=payload.timestamp or datetime.utcnow(),
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    return event


def run_post_ingestion_pipeline(db: Session, tenant_id: str) -> List[dict]:
    """
    Runs aggregation + anomaly detection.
    Completely failure-safe (never breaks ingestion).
    """
    anomalies = []

    try:
        today = date.today()

        # 1. Aggregate today's metrics
        aggregate_daily_metrics(
            db=db,
            tenant_id=tenant_id,
            target_date=today,
        )

        # 2. Detect anomalies
        metrics = ["signups", "logins", "active_users", "conversion_rate"]

        for metric in metrics:
            history = fetch_metric_history(db, tenant_id, metric)

            today_record = (
                db.query(MetricValue.value)
                .filter(
                    MetricValue.tenant_id == tenant_id,
                    MetricValue.metric_name == metric,
                )
                .order_by(MetricValue.date.desc())
                .first()
            )

            if not today_record:
                continue

            anomaly = check_anomaly(metric, today_record[0], history)
            explanation = generate_explanation(anomaly)

            if explanation.get("isAnomaly"):
                anomalies.append(explanation)

    except Exception:
        # Never break ingestion pipeline
        return []

    return anomalies


# ---------------------------------------------------------
# API Route
# ---------------------------------------------------------

@router.post("/track", response_model=TrackEventResponse, status_code=status.HTTP_201_CREATED)
def track_event(
    payload: TrackEventPayload,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(resolve_tenant),
):
    try:
        event = process_incoming_event(db, tenant_id, payload)

        # Run analytics pipeline (safe)
        anomalies = run_post_ingestion_pipeline(db, tenant_id)

        return {
            "status": "success",
            "event_id": event.id,
            "tenant_id": tenant_id,
            "event_name": event.event_name,
            "anomalies": anomalies,
        }

    except ValueError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to ingest event",
        )