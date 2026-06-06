import logging
import uuid
from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timezone, timedelta

from sqlalchemy import (
    Column, String, Float, DateTime, Integer,
    Index, text, update, select
)
from sqlalchemy.orm import declarative_base, Session
from sqlalchemy.dialects.postgresql import JSONB

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# GLOBAL CONFIG
# ---------------------------------------------------------
DEFAULT_ALERT_THRESHOLD = 20.0
DEFAULT_COOLDOWN_MINUTES = 60
DEFAULT_ALERT_EXPIRY_DAYS = 7

Base = declarative_base()


class Alert(Base):
    """SQLAlchemy model for the alerts table."""
    __tablename__ = "alerts"

    id = Column(String, primary_key=True)
    tenant_id = Column(String, nullable=False, index=True)
    metric_name = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True)  # active, resolved, expired
    severity = Column(Float, nullable=False)  # Always positive magnitude
    direction = Column(String, nullable=True)  # "up" or "down" — authoritative sign
    first_seen = Column(DateTime(timezone=True), nullable=False)
    last_seen = Column(DateTime(timezone=True), nullable=False)
    last_notified = Column(DateTime(timezone=True), nullable=True)
    occurrence_count = Column(Integer, nullable=False, default=1)
    anomaly_details = Column(JSONB, nullable=True)  # Native JSONB

    __table_args__ = (
        # Partial unique index prevents duplicate active alerts
        Index(
            "uq_active_alert",
            "tenant_id", "metric_name",
            unique=True,
            postgresql_where=text("status = 'active'")
        ),
        # Composite index for fast alert lookups
        Index(
            "idx_alert_lookup",
            "tenant_id", "metric_name", "status"
        ),
        # Index for background expiry job (status + last_seen)
        Index(
            "idx_alert_expiry",
            "status", "last_seen"
        ),
    )


class AlertEngine:
    """
    Production-grade Alert Engine.

    Responsibilities:
      - Atomic alert lifecycle (trigger / ongoing / resolve / expire)
      - Batch deduplication and transaction safety
      - Stateless event formatting (caller handles dispatch)

    session_factory may be None for stateless adapter usage,
    but methods that manage their own sessions will validate it.
    """

    def __init__(self, session_factory=None):
        self.session_factory = session_factory

    def _require_factory(self) -> None:
        """Guard against calling session-managed methods in stateless mode."""
        if self.session_factory is None:
            raise ValueError(
                "session_factory is required for this operation. "
                "Use stateless mode only for direct atomic operations."
            )

    # ---------------------------------------------------------
    # PUBLIC API: BATCH & SINGLE PROCESSING
    # ---------------------------------------------------------
    def process_batch(self, tenant_id: str, anomalies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Process a batch of anomalies atomically under a single transaction.
        Deduplicates by metric_name to prevent redundant DB writes.
        Returns list of events for external dispatch.
        """
        if not anomalies:
            return []

        # Deduplicate by metric_name (DB unique key is tenant+metric+active).
        # If multiple entries for same metric, first one wins.
        seen: Set[str] = set()
        deduped: List[Dict[str, Any]] = []
        for anomaly in anomalies:
            metric = anomaly.get("metric_name")
            if not metric:
                logger.warning(
                    "skipping_anomaly_without_metric",
                    extra={"tenant_id": tenant_id}
                )
                continue
            if metric in seen:
                logger.info(
                    "skipping_duplicate_metric_in_batch",
                    extra={"tenant_id": tenant_id, "metric": metric}
                )
                continue
            seen.add(metric)
            deduped.append(anomaly)

        if not deduped:
            return []

        logger.info(
            "evaluating_anomalies_for_dispatch",
            extra={"tenant_id": tenant_id, "count": len(deduped)}
        )

        self._require_factory()
        session = self.session_factory()
        events: List[Dict[str, Any]] = []

        try:
            with session.begin():
                for anomaly in deduped:
                    event = self._process_anomaly_atomic(session, tenant_id, anomaly)
                    if event:
                        events.append(event)
        except Exception:
            logger.exception(
                "batch_transaction_failed",
                extra={"tenant_id": tenant_id}
            )
            raise
        finally:
            session.close()

        return events

    def process_anomaly(
        self,
        tenant_id: str,
        anomaly: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Process a single anomaly with full transaction safety.
        Returns event for external dispatch.
        """
        self._require_factory()
        session = self.session_factory()
        try:
            with session.begin():
                event = self._process_anomaly_atomic(session, tenant_id, anomaly)
            return event
        except Exception:
            logger.exception(
                "single_anomaly_processing_failed",
                extra={"tenant_id": tenant_id}
            )
            raise
        finally:
            session.close()

    # ---------------------------------------------------------
    # DISPATCH (Decoupled from DB transaction)
    # ---------------------------------------------------------
    def dispatch_events(self, tenant_id: str, events: List[Dict[str, Any]]) -> None:
        """
        Stateless dispatch. Call ONLY after successful DB commit.
        """
        if not events:
            return

        payload = self._format_digest_payload(events)
        self._dispatch_to_tenant_channels(tenant_id, payload)

    # ---------------------------------------------------------
    # ATOMIC CORE LOGIC
    # ---------------------------------------------------------
    def _process_anomaly_atomic(
        self,
        session: Session,
        tenant_id: str,
        anomaly: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Core state machine. Must be called inside an active transaction.
        Uses SELECT FOR UPDATE with explicit lock scope for correctness.
        """
        metric = anomaly.get("metric_name")
        is_anomaly = anomaly.get("is_anomaly", False)

        # Severity model: magnitude is always positive.
        # Direction is the authoritative source for up/down semantics.
        raw_deviation = float(anomaly.get("deviation_pct", 0.0))
        severity = abs(raw_deviation)
        direction = anomaly.get("direction")

        # Validate consistency between signed deviation and explicit direction.
        # Epsilon-safe float comparison avoids -0.0 / 1e-16 edge cases.
        if direction and abs(raw_deviation) > 1e-9:
            expected_dir = "up" if raw_deviation > 0 else "down"
            if direction != expected_dir:
                logger.warning(
                    "direction_deviation_mismatch",
                    extra={
                        "tenant_id": tenant_id,
                        "metric": metric,
                        "direction": direction,
                        "deviation_pct": raw_deviation,
                        "expected_direction": expected_dir,
                    }
                )

        if not metric:
            logger.error(
                "missing_metric_name",
                extra={"tenant_id": tenant_id}
            )
            return None

        now = datetime.now(timezone.utc)

        # Race-safe fetch with explicit lock target (of=Alert).
        # Blocking lock preferred over skip_locked for correctness.
        stmt = (
            select(Alert)
            .where(
                Alert.tenant_id == tenant_id,
                Alert.metric_name == metric,
                Alert.status == "active"
            )
            .with_for_update(of=Alert)
        )
        existing = session.execute(stmt).scalar_one_or_none()

        event_type = None
        alert_id = None

        # =====================================================
        # CASE 1: NEW ANOMALY
        # =====================================================
        if is_anomaly and not existing:
            if severity < DEFAULT_ALERT_THRESHOLD:
                return None

            alert_id = self._generate_alert_id()
            new_alert = Alert(
                id=alert_id,
                tenant_id=tenant_id,
                metric_name=metric,
                status="active",
                severity=severity,
                direction=direction,
                first_seen=now,
                last_seen=now,
                last_notified=now,
                occurrence_count=1,
                anomaly_details=anomaly  # JSONB handles dict natively
            )
            session.add(new_alert)
            event_type = "TRIGGERED"

        # =====================================================
        # CASE 2: ONGOING ANOMALY
        # =====================================================
        elif is_anomaly and existing:
            alert_id = existing.id
            should_notify = self._should_notify(existing, now)

            # Core DML update; ORM object 'existing' becomes stale after this.
            # Do not reference 'existing' fields below this line without refresh.
            session.execute(
                update(Alert)
                .where(Alert.id == alert_id)
                .values(
                    last_seen=now,
                    severity=severity,
                    direction=direction,
                    anomaly_details=anomaly,
                    occurrence_count=Alert.occurrence_count + 1
                )
            )

            if should_notify:
                session.execute(
                    update(Alert)
                    .where(Alert.id == alert_id)
                    .values(last_notified=now)
                )
                event_type = "ONGOING"

        # =====================================================
        # CASE 3: RESOLVED
        # =====================================================
        elif not is_anomaly and existing:
            alert_id = existing.id
            session.execute(
                update(Alert)
                .where(Alert.id == alert_id)
                .values(status="resolved", last_seen=now)
            )
            event_type = "RESOLVED"

        # =====================================================
        # RETURN EVENT (NO DISPATCH — caller handles after commit)
        # =====================================================
        if event_type:
            return {
                "tenant_id": tenant_id,
                "alert_id": alert_id,
                "event_type": event_type,
                "anomaly": anomaly,
                "timestamp": now.isoformat()
            }

        return None

    # ---------------------------------------------------------
    # UTILITIES
    # ---------------------------------------------------------
    def _should_notify(self, existing: Alert, now: datetime) -> bool:
        """Evaluates if an ongoing alert has passed the cooldown period."""
        last_notified = existing.last_notified
        if not last_notified:
            return True
        return now - last_notified > timedelta(minutes=DEFAULT_COOLDOWN_MINUTES)

    @staticmethod
    def _generate_alert_id() -> str:
        """Collision-safe UUIDv4 alert ID."""
        return f"alt_{uuid.uuid4().hex}"

    @staticmethod
    def _format_digest_payload(events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Converts events into a structured digest format."""
        icons = {"TRIGGERED": "🚨", "ONGOING": "🔁", "RESOLVED": "✅", "EXPIRED": "⌛"}

        events.sort(
            key=lambda x: abs(float(x["anomaly"].get("deviation_pct", 0))),
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
        logger.info(
            "alert_digest_dispatched",
            extra={
                "tenant_id": tenant_id,
                "count": len(payload["blocks"])
            }
        )

        # Integration routing (outbox / background worker pattern recommended)
        # integrations = get_tenant_integrations(tenant_id)
        # if integrations.get("slack"):
        #     SlackConnector.send_digest(integrations["slack"]["webhook_url"], payload)
        # if integrations.get("email"):
        #     EmailConnector.send_digest(integrations["email"]["target"], payload)

    # ---------------------------------------------------------
    # BACKGROUND JOB: STALE ALERT EXPIRATION
    # ---------------------------------------------------------
    def expire_stale_alerts(self, max_age_days: int = DEFAULT_ALERT_EXPIRY_DAYS) -> List[Dict[str, Any]]:
        """
        Background job to mark stale active alerts as expired.
        Call this from a cron job — never inside anomaly processing.
        Leverages idx_alert_expiry (status, last_seen).
        Returns EXPIRED events for external dispatch.
        """
        self._require_factory()
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        session = self.session_factory()
        events: List[Dict[str, Any]] = []

        try:
            with session.begin():
                # Single UPDATE ... RETURNING query locks rows implicitly
                # and returns the expired ORM objects in one round-trip.
                update_stmt = (
                    update(Alert)
                    .where(
                        Alert.status == "active",
                        Alert.last_seen < cutoff
                    )
                    .values(status="expired")
                    .returning(Alert)
                )
                stale_alerts = session.execute(update_stmt).scalars().all()

                now = datetime.now(timezone.utc)
                for alert in stale_alerts:
                    events.append({
                        "tenant_id": alert.tenant_id,
                        "alert_id": alert.id,
                        "event_type": "EXPIRED",
                        "anomaly": alert.anomaly_details or {},
                        "timestamp": now.isoformat()
                    })

            if events:
                logger.warning(
                    "stale_alerts_expired",
                    extra={"count": len(events), "max_age_days": max_age_days}
                )
            return events
        except Exception:
            logger.exception("failed_to_expire_stale_alerts")
            raise
        finally:
            session.close()


# ---------------------------------------------------------
# API ROUTE ADAPTER
# ---------------------------------------------------------
def handle_anomaly_alert(
    session: Session,
    tenant_id: str,
    anomaly: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Stateless adapter for FastAPI / framework request handlers.

    Assumes the caller owns the session and its transaction boundary.
    The caller MUST commit/rollback as appropriate.
    """
    engine = AlertEngine(session_factory=None)
    return engine._process_anomaly_atomic(
        session=session,
        tenant_id=tenant_id,
        anomaly=anomaly
    )