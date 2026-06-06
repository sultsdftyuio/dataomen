import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy import (
    create_engine, Column, String, Float, DateTime, Integer, 
    Index, text, insert, update, select
)
from sqlalchemy.orm import declarative_base, Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# GLOBAL CONFIG
# ---------------------------------------------------------
DEFAULT_ALERT_THRESHOLD = 20.0
DEFAULT_RESOLVE_THRESHOLD = 10.0
DEFAULT_COOLDOWN_MINUTES = 60
DEFAULT_ALERT_EXPIRY_DAYS = 7  # Issue #7: Alert expiration

Base = declarative_base()


class Alert(Base):
    """SQLAlchemy model for the alerts table."""
    __tablename__ = "alerts"

    id = Column(String, primary_key=True)
    tenant_id = Column(String, nullable=False, index=True)
    metric_name = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True)  # active, resolved, expired
    severity = Column(Float, nullable=False)
    direction = Column(String, nullable=True)
    first_seen = Column(DateTime(timezone=True), nullable=False)
    last_seen = Column(DateTime(timezone=True), nullable=False)
    last_notified = Column(DateTime(timezone=True), nullable=True)
    occurrence_count = Column(Integer, nullable=False, default=1)
    anomaly_details = Column(String, nullable=True)  # JSON blob

    __table_args__ = (
        # Issue #3: Unique partial index prevents duplicate active alerts
        Index(
            "uq_active_alert",
            "tenant_id", "metric_name",
            unique=True,
            postgresql_where=text("status = 'active'")
        ),
    )


class AlertEngine:
    """
    Production-grade Alert Engine with atomic operations, transaction safety,
    race-condition prevention, and proper batch processing.
    """

    def __init__(self, session_factory):
        self.session_factory = session_factory

    # ---------------------------------------------------------
    # BATCH ENTRY (Issue #8: Single commit for batch)
    # ---------------------------------------------------------
    def process_batch_and_dispatch(self, tenant_id: str, anomalies: List[Dict[str, Any]]) -> None:
        """Processes a batch atomically under a single transaction."""
        if not anomalies:
            return

        logger.info(f"Evaluating {len(anomalies)} anomalies for dispatch. [Tenant: {tenant_id}]")

        notifiable_events = []
        
        # Issue #2 & #8: Single transaction for entire batch
        session = self.session_factory()
        try:
            with session.begin():
                for anomaly in anomalies:
                    event = self._process_anomaly_atomic(
                        session, tenant_id, anomaly, send_immediate=False
                    )
                    if event:
                        notifiable_events.append(event)
                        
            # Commit happens here when context manager exits successfully
        except Exception:
            # Issue #2: Rollback is automatic on exception with session.begin()
            logger.exception(f"Batch transaction failed. [Tenant: {tenant_id}]")
            raise
        finally:
            session.close()

        if not notifiable_events:
            logger.info(f"All anomalies normal or on cooldown. No alerts dispatched. [Tenant: {tenant_id}]")
            return

        payload = self._format_digest_payload(notifiable_events)
        self._dispatch_to_tenant_channels(tenant_id, payload)

    # ---------------------------------------------------------
    # SINGLE ENTRY (Issue #2: Proper transaction boundaries)
    # ---------------------------------------------------------
    def process_anomaly(
        self,
        tenant_id: str,
        anomaly: Dict[str, Any],
        send_immediate: bool = True
    ) -> Optional[Dict[str, Any]]:
        """Processes a single anomaly with full transaction safety."""
        session = self.session_factory()
        try:
            with session.begin():
                event = self._process_anomaly_atomic(session, tenant_id, anomaly, send_immediate)
            return event
        except Exception:
            logger.exception(f"Single anomaly processing failed. [Tenant: {tenant_id}]")
            raise
        finally:
            session.close()

    # ---------------------------------------------------------
    # ATOMIC CORE LOGIC (No side effects, session passed in)
    # ---------------------------------------------------------
    def _process_anomaly_atomic(
        self,
        session: Session,
        tenant_id: str,
        anomaly: Dict[str, Any],
        send_immediate: bool
    ) -> Optional[Dict[str, Any]]:
        """
        Core state machine. All DB operations use the same session.
        Must be called inside an active transaction (session.begin()).
        """
        metric = anomaly.get("metric_name")
        is_anomaly = anomaly.get("is_anomaly", False)
        severity = float(anomaly.get("deviation_pct", 0.0))

        if not metric:
            logger.error("missing_metric_name", extra={"tenant": tenant_id})
            return None

        now = datetime.now(timezone.utc)  # Issue #5: Native datetime object

        # Fetch existing active alert
        stmt = select(Alert).where(
            Alert.tenant_id == tenant_id,
            Alert.metric_name == metric,
            Alert.status == "active"
        )
        existing = session.execute(stmt).scalar_one_or_none()

        event_type = None
        alert_id = None

        # =====================================================
        # CASE 1: NEW ANOMALY (Issue #3: Race-safe via ON CONFLICT)
        # =====================================================
        if is_anomaly and not existing:
            if severity < DEFAULT_ALERT_THRESHOLD:
                return None

            # Issue #3: Use INSERT ... ON CONFLICT DO UPDATE for atomic upsert
            # This handles the race condition where two workers insert simultaneously
            upsert_stmt = pg_insert(Alert).values(
                id=self._generate_alert_id(),
                tenant_id=tenant_id,
                metric_name=metric,
                status="active",
                severity=severity,
                direction=anomaly.get("direction"),
                first_seen=now,  # Issue #5: Pass datetime directly
                last_seen=now,
                last_notified=now,
                occurrence_count=1,
                anomaly_details=str(anomaly)
            ).on_conflict_do_update(
                index_elements=["tenant_id", "metric_name"],
                index_where=text("status = 'active'"),
                set_={
                    "severity": severity,
                    "direction": anomaly.get("direction"),
                    "last_seen": now,
                    "last_notified": now,
                    "occurrence_count": Alert.occurrence_count + 1,  # Issue #4: Atomic increment
                    "anomaly_details": str(anomaly)
                }
            ).returning(Alert.id)

            result = session.execute(upsert_stmt)
            alert_id = result.scalar()  # Issue #1: Fetch ID BEFORE commit
            event_type = "TRIGGERED"

        # =====================================================
        # CASE 2: ONGOING ANOMALY (Issue #4: Atomic increment)
        # =====================================================
        elif is_anomaly and existing:
            alert_id = existing.id
            should_notify = self._should_notify(existing, now)

            # Issue #4: Atomic occurrence_count increment via SQL
            update_stmt = (
                update(Alert)
                .where(Alert.id == alert_id)
                .values(
                    last_seen=now,
                    severity=severity,
                    direction=anomaly.get("direction"),
                    anomaly_details=str(anomaly),
                    occurrence_count=Alert.occurrence_count + 1  # Atomic
                )
            )
            session.execute(update_stmt)

            if should_notify:
                # Update last_notified separately to track notification timing
                session.execute(
                    update(Alert)
                    .where(Alert.id == alert_id)
                    .values(last_notified=now)
                )
                event_type = "ONGOING"

        # =====================================================
        # CASE 3: RESOLVED (Issue #6: Fix resolution logic)
        # =====================================================
        elif not is_anomaly and existing:
            alert_id = existing.id
            
            # Issue #6: Resolve purely based on anomaly state, not severity threshold
            # If the detector says it's not an anomaly, we resolve it.
            # The detector is the source of truth for anomaly state.
            session.execute(
                update(Alert)
                .where(Alert.id == alert_id)
                .values(status="resolved", last_seen=now)
            )
            event_type = "RESOLVED"

        # =====================================================
        # CASE 4: EXPIRATION CHECK (Issue #7: Stale alert cleanup)
        # =====================================================
        # If an existing alert is very old, mark expired even if still "active"
        if existing and existing.last_seen:
            age = now - existing.last_seen
            if age > timedelta(days=DEFAULT_ALERT_EXPIRY_DAYS):
                session.execute(
                    update(Alert)
                    .where(Alert.id == existing.id)
                    .values(status="expired", last_seen=now)
                )
                logger.warning(
                    f"Alert expired due to staleness. [Tenant: {tenant_id}, Metric: {metric}]"
                )
                # Don't return event for expired alerts unless you want notifications

        # =====================================================
        # DISPATCH & RETURN
        # =====================================================
        if event_type:
            event_data = {
                "tenant_id": tenant_id,
                "alert_id": alert_id,
                "event_type": event_type,
                "anomaly": anomaly,
                "timestamp": now.isoformat()
            }

            if send_immediate:
                payload = self._format_digest_payload([event_data])
                # Issue #9: No print statements; dispatch is non-blocking
                self._dispatch_to_tenant_channels(tenant_id, payload)

            return event_data

        return None

    # ---------------------------------------------------------
    # UTILITIES
    # ---------------------------------------------------------
    def _should_notify(self, existing: Alert, now: datetime) -> bool:
        """Evaluates if an ongoing alert has passed the cooldown period."""
        last_notified = existing.last_notified
        if not last_notified:
            return True

        # Both are timezone-aware datetime objects (Issue #5)
        return now - last_notified > timedelta(minutes=DEFAULT_COOLDOWN_MINUTES)

    @staticmethod
    def _generate_alert_id() -> str:
        """Generate a unique alert ID."""
        return f"alt_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"

    @staticmethod
    def _format_digest_payload(events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Converts events into a structured digest format."""
        icons = {"TRIGGERED": "🚨", "ONGOING": "🔁", "RESOLVED": "✅", "EXPIRED": "⌛"}

        events.sort(
            key=lambda x: float(x["anomaly"].get("deviation_pct", 0)), 
            reverse=True
        )

        blocks = []
        for e in events:
            anomaly = e["anomaly"]
            evt_type = e["event_type"]
            icon = icons.get(evt_type, "ℹ️")
            explanation = anomaly.get("explanation", "No context provided.")

            text = (
                f"{icon} *[{evt_type}] {anomaly.get('metric_name')}*\n"
                f"> *Deviation:* {anomaly.get('deviation_pct')}% "
                f"({anomaly.get('direction', 'N/A')})\n"
                f"> *Values:* Current: {anomaly.get('current_value')} | "
                f"Baseline: {anomaly.get('baseline')}\n"
                f"> *Context:* {explanation}"
            )
            blocks.append({"type": "section", "text": text})

        return {
            "title": f"Dataomen Insights: {len(events)} Alert Updates",
            "blocks": blocks,
            "raw_data": events
        }

    def _dispatch_to_tenant_channels(self, tenant_id: str, payload: Dict[str, Any]) -> None:
        """Looks up tenant integration settings and routes the payload."""
        # Issue #9: Structured logging only, no print()
        logger.info(
            f"Dispatched alert digest ({len(payload['blocks'])} items). "
            f"[Tenant: {tenant_id}]"
        )
        
        # Integration routing (commented until connectors are available)
        # integrations = get_tenant_integrations(tenant_id)
        # if integrations.get("slack"):
        #     SlackConnector.send_digest(integrations["slack"]["webhook_url"], payload)
        # if integrations.get("email"):
        #     EmailConnector.send_digest(integrations["email"]["target"], payload)

    # ---------------------------------------------------------
    # BACKGROUND JOB: STALE ALERT EXPIRATION (Issue #7)
    # ---------------------------------------------------------
    def expire_stale_alerts(self, max_age_days: int = DEFAULT_ALERT_EXPIRY_DAYS) -> int:
        """
        Background job to mark stale active alerts as expired.
        Call this from a cron job or scheduled task.
        Returns number of expired alerts.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        session = self.session_factory()
        
        try:
            with session.begin():
                stmt = (
                    update(Alert)
                    .where(
                        Alert.status == "active",
                        Alert.last_seen < cutoff
                    )
                    .values(status="expired")
                    .returning(Alert.id)
                )
                result = session.execute(stmt)
                expired_ids = result.scalars().all()
                
            count = len(expired_ids)
            if count > 0:
                logger.warning(
                    f"Expired {count} stale alerts older than {max_age_days} days."
                )
            return count
        except Exception:
            logger.exception("Failed to expire stale alerts")
            raise
        finally:
            session.close()