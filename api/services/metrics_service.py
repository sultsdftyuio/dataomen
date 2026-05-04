import logging
from datetime import datetime, date, timedelta, timezone
from typing import Dict, Any, Optional, List
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import func, distinct

from api.database import Event, MetricValue

logger = logging.getLogger(__name__)


class MetricsService:
    """
    Hybrid Metrics Engine:
    - Generic aggregation (event → metric)
    - Derived product metrics (conversion, revenue, etc.)
    - Works with SQLAlchemy session
    """

    def __init__(self, db: Session):
        self.db = db

    # ---------------------------------------------------------
    # ENTRY POINT
    # ---------------------------------------------------------
    def aggregate_daily_metrics(
        self,
        tenant_id: str,
        target_date_str: Optional[str] = None
    ) -> Dict[str, Any]:

        if not tenant_id:
            raise ValueError("tenant_id is required")

        # ------------------------
        # DATE HANDLING (UTC SAFE)
        # ------------------------
        try:
            if target_date_str:
                target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
            else:
                target_date = datetime.now(timezone.utc).date()

            start = datetime.combine(target_date, datetime.min.time())
            end = start + timedelta(days=1)

        except ValueError as e:
            logger.error("invalid_date_format", extra={"tenant_id": tenant_id})
            raise ValueError("Use YYYY-MM-DD format") from e

        logger.info("aggregation_started", extra={
            "tenant_id": tenant_id,
            "date": target_date.isoformat()
        })

        try:
            # ---------------------------------------------------------
            # 1. GENERIC EVENT AGGREGATION (SCALABLE BASE)
            # ---------------------------------------------------------
            raw_events = self.db.query(
                Event.event_name,
                func.coalesce(func.sum(Event.value), 0.0),
                func.count(Event.id)
            ).filter(
                Event.tenant_id == tenant_id,
                Event.timestamp >= start,
                Event.timestamp < end
            ).group_by(Event.event_name).all()

            aggregated = defaultdict(float)

            for event_name, value_sum, count in raw_events:
                # If value exists → use it, else count
                aggregated[event_name] = float(value_sum) if value_sum > 0 else float(count)

            # ---------------------------------------------------------
            # 2. PRODUCT METRICS (DERIVED INTELLIGENCE)
            # ---------------------------------------------------------

            signups = aggregated.get("signup", 0.0)
            logins = aggregated.get("login", 0.0)

            visitors = self.db.query(func.count(distinct(Event.user_id))).filter(
                Event.tenant_id == tenant_id,
                Event.timestamp >= start,
                Event.timestamp < end,
                Event.event_name == "pageview"
            ).scalar() or 0

            active_users = self.db.query(func.count(distinct(Event.user_id))).filter(
                Event.tenant_id == tenant_id,
                Event.timestamp >= start,
                Event.timestamp < end
            ).scalar() or 0

            revenue = aggregated.get("revenue", 0.0)

            conversion_rate = (signups / visitors) if visitors > 0 else 0.0

            # Inject derived metrics
            aggregated.update({
                "active_users": float(active_users),
                "conversion_rate": float(conversion_rate),
                "revenue": float(revenue),
                "signups": float(signups),
                "logins": float(logins),
            })

            # ---------------------------------------------------------
            # 3. ZERO-FILL (PREVENT ANOMALY DRIFT)
            # ---------------------------------------------------------
            expected_metrics = {
                "revenue",
                "signups",
                "logins",
                "active_users",
                "conversion_rate"
            }

            for metric in expected_metrics:
                aggregated.setdefault(metric, 0.0)

            if not aggregated:
                logger.info("no_data", extra={"tenant_id": tenant_id})
                return {"status": "success", "processed": 0}

            # ---------------------------------------------------------
            # 4. IDEMPOTENT UPSERT
            # ---------------------------------------------------------
            processed = 0

            for metric_name, value in aggregated.items():
                self._upsert_metric(
                    tenant_id,
                    metric_name,
                    target_date,
                    float(value)
                )
                processed += 1

            self.db.commit()

            logger.info("aggregation_completed", extra={
                "tenant_id": tenant_id,
                "date": target_date.isoformat(),
                "metrics": processed,
                "raw_events": len(raw_events)
            })

            return {
                "status": "success",
                "tenant_id": tenant_id,
                "date": target_date.isoformat(),
                "processed_metrics": processed
            }

        except Exception as e:
            self.db.rollback()
            logger.error("aggregation_failed", extra={
                "tenant_id": tenant_id,
                "error": str(e)
            }, exc_info=True)
            raise

    # ---------------------------------------------------------
    # UPSERT (IDEMPOTENT CORE)
    # ---------------------------------------------------------
    def _upsert_metric(
        self,
        tenant_id: str,
        metric_name: str,
        target_date: date,
        value: float
    ):
        existing = self.db.query(MetricValue).filter(
            MetricValue.tenant_id == tenant_id,
            MetricValue.metric_name == metric_name,
            MetricValue.date == target_date
        ).first()

        if existing:
            existing.value = value
            existing.updated_at = datetime.now(timezone.utc)
        else:
            self.db.add(MetricValue(
                tenant_id=tenant_id,
                metric_name=metric_name,
                date=target_date,
                value=value,
                updated_at=datetime.now(timezone.utc)
            ))

    # ---------------------------------------------------------
    # FETCH CURRENT
    # ---------------------------------------------------------
    def fetch_current_metric(
        self,
        tenant_id: str,
        metric_name: str
    ) -> float:

        today = date.today()

        record = self.db.query(MetricValue.value).filter(
            MetricValue.tenant_id == tenant_id,
            MetricValue.metric_name == metric_name,
            MetricValue.date == today
        ).first()

        return float(record[0]) if record else 0.0

    # ---------------------------------------------------------
    # FETCH HISTORY
    # ---------------------------------------------------------
    def fetch_metric_history(
        self,
        tenant_id: str,
        metric_name: str,
        days: int = 7
    ) -> List[float]:

        records = self.db.query(MetricValue.value).filter(
            MetricValue.tenant_id == tenant_id,
            MetricValue.metric_name == metric_name,
            MetricValue.date < date.today()
        ).order_by(MetricValue.date.desc()).limit(days).all()

        return [float(r[0]) for r in reversed(records)]