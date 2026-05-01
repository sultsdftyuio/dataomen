from datetime import datetime, date, timedelta
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from api.database import Event, MetricValue


# ---------------------------------------------------------
# DAILY AGGREGATION
# ---------------------------------------------------------

def aggregate_daily_metrics(db: Session, tenant_id: str, target_date: date) -> dict:
    """
    Rolls up raw events into daily metric values.
    Deterministic + idempotent.

    Assumptions:
    - All timestamps are stored in UTC
    - Event names are normalized at ingestion (lowercase)
    """

    if not tenant_id:
        raise ValueError("tenant_id is required for aggregation")

    start_of_day = datetime.combine(target_date, datetime.min.time())
    next_day = start_of_day + timedelta(days=1)

    try:
        # ------------------------
        # BASE FILTER
        # ------------------------
        base_filter = [
            Event.tenant_id == tenant_id,
            Event.timestamp >= start_of_day,
            Event.timestamp < next_day
        ]

        # ------------------------
        # 1. SIGNUPS
        # ------------------------
        signups_count = db.query(func.count(Event.id)).filter(
            *base_filter,
            Event.event_name == "signup"
        ).scalar() or 0

        # ------------------------
        # 2. LOGINS
        # ------------------------
        logins_count = db.query(func.count(Event.id)).filter(
            *base_filter,
            Event.event_name == "login"
        ).scalar() or 0

        # ------------------------
        # 3. ACTIVE USERS
        # ------------------------
        active_users_count = db.query(func.count(distinct(Event.user_id))).filter(
            *base_filter
        ).scalar() or 0

        # ------------------------
        # 4. VISITORS
        # ------------------------
        visitors_count = db.query(func.count(distinct(Event.user_id))).filter(
            *base_filter,
            Event.event_name == "pageview"
        ).scalar() or 0

        conversion_rate = (
            (signups_count / visitors_count)
            if visitors_count > 0 else 0.0
        )

        # ------------------------
        # 5. REVENUE (SAFE)
        # ------------------------
        # Requires Event.value column to exist
        try:
            revenue_sum = db.query(func.sum(Event.value)).filter(
                *base_filter,
                Event.event_name == "revenue"
            ).scalar() or 0.0
        except Exception:
            # Safe fallback if column doesn't exist yet
            revenue_sum = 0.0

        # ------------------------
        # UPSERT METRICS
        # ------------------------
        metrics_to_upsert = [
            ("revenue", float(revenue_sum)),
            ("signups", float(signups_count)),
            ("logins", float(logins_count)),
            ("active_users", float(active_users_count)),
            ("conversion_rate", float(conversion_rate))
        ]

        for metric_name, value in metrics_to_upsert:
            _upsert_metric_value(db, tenant_id, metric_name, target_date, value)

        db.commit()

        return {
            "status": "success",
            "tenant_id": tenant_id,
            "date": target_date.isoformat(),
            "metrics_computed": len(metrics_to_upsert)
        }

    except Exception as e:
        db.rollback()
        raise RuntimeError(f"Aggregation failed: {str(e)}")


# ---------------------------------------------------------
# UPSERT HELPER (IDEMPOTENT)
# ---------------------------------------------------------

def _upsert_metric_value(
    db: Session,
    tenant_id: str,
    metric_name: str,
    target_date: date,
    value: float
) -> None:
    """
    Ensures one row per (tenant_id, metric_name, date)
    """

    existing = db.query(MetricValue).filter(
        MetricValue.tenant_id == tenant_id,
        MetricValue.metric_name == metric_name,
        MetricValue.date == target_date
    ).first()

    if existing:
        existing.value = value
    else:
        db.add(MetricValue(
            tenant_id=tenant_id,
            metric_name=metric_name,
            date=target_date,
            value=value
        ))


# ---------------------------------------------------------
# FETCH CURRENT VALUE
# ---------------------------------------------------------

def fetch_current_metric(
    db: Session,
    tenant_id: str,
    metric_name: str
) -> float:
    """
    Returns today's value for a metric.
    """

    if not tenant_id:
        raise ValueError("tenant_id required")

    today = date.today()

    record = db.query(MetricValue.value).filter(
        MetricValue.tenant_id == tenant_id,
        MetricValue.metric_name == metric_name,
        MetricValue.date == today
    ).first()

    return float(record[0]) if record else 0.0


# ---------------------------------------------------------
# FETCH LAST N DAYS HISTORY
# ---------------------------------------------------------

def fetch_metric_history(
    db: Session,
    tenant_id: str,
    metric_name: str,
    days: int = 7
) -> List[float]:
    """
    Returns historical values (oldest → newest).
    Excludes today (used for anomaly baseline).
    """

    if not tenant_id:
        raise ValueError("tenant_id required")

    records = db.query(MetricValue.value).filter(
        MetricValue.tenant_id == tenant_id,
        MetricValue.metric_name == metric_name,
        MetricValue.date < date.today()
    ).order_by(MetricValue.date.desc()).limit(days).all()

    return [float(r[0]) for r in reversed(records)]