from datetime import datetime, timedelta
from typing import Optional, Dict

from sqlalchemy.orm import Session

from api.database import AnomalyAlert


# ---------------------------------------------------------
# CONFIG
# ---------------------------------------------------------

ALERT_THRESHOLD = 20.0          # Minimum % deviation to alert
ALERT_COOLDOWN_MINUTES = 60     # Prevent spam (per metric)
RESOLVE_THRESHOLD = 10.0        # If anomaly drops below this → resolve


# ---------------------------------------------------------
# CORE ALERT HANDLER
# ---------------------------------------------------------

def handle_anomaly_alert(
    db: Session,
    tenant_id: str,
    anomaly: Dict
) -> Optional[Dict]:
    """
    Production-ready alert handler:

    Responsibilities:
    - filters weak anomalies
    - persists anomaly state
    - handles lifecycle (new / ongoing / resolved)
    - enforces cooldown (anti-spam)
    - triggers notifications
    """

    if not anomaly.get("is_anomaly"):
        return None

    severity = float(anomaly.get("deviation_pct", 0.0))
    metric = anomaly.get("metric_name")
    direction = anomaly.get("direction")

    if not metric:
        return None

    # ------------------------
    # FILTER LOW SIGNAL
    # ------------------------
    if severity < ALERT_THRESHOLD:
        return None

    now = datetime.utcnow()
    today = now.date()

    # ------------------------
    # FETCH EXISTING ALERT
    # ------------------------
    existing: Optional[AnomalyAlert] = db.query(AnomalyAlert).filter(
        AnomalyAlert.tenant_id == tenant_id,
        AnomalyAlert.metric_name == metric,
        AnomalyAlert.date == today
    ).first()

    # ------------------------
    # UPDATE EXISTING
    # ------------------------
    if existing:
        existing.severity = severity
        existing.direction = direction
        existing.last_seen = now

        # ------------------------
        # COOLDOWN CHECK
        # ------------------------
        should_notify = _should_notify(existing, now)

        db.commit()

        if should_notify:
            _send_alert_notification(tenant_id, anomaly)

        return {
            "status": "updated",
            "metric": metric,
            "notified": should_notify
        }

    # ------------------------
    # CREATE NEW ALERT
    # ------------------------
    new_alert = AnomalyAlert(
        tenant_id=tenant_id,
        metric_name=metric,
        date=today,
        severity=severity,
        direction=direction,
        status="active",
        last_seen=now
    )

    db.add(new_alert)
    db.commit()

    # Always notify on first detection
    _send_alert_notification(tenant_id, anomaly)

    return {
        "status": "created",
        "metric": metric,
        "notified": True
    }


# ---------------------------------------------------------
# RESOLUTION HANDLER (IMPORTANT)
# ---------------------------------------------------------

def resolve_anomaly_if_recovered(
    db: Session,
    tenant_id: str,
    anomaly: Dict
) -> Optional[Dict]:
    """
    Marks anomaly as resolved if it falls below recovery threshold.
    """

    metric = anomaly.get("metric_name")
    severity = float(anomaly.get("deviation_pct", 0.0))

    if not metric:
        return None

    # If still strong anomaly → do nothing
    if severity >= RESOLVE_THRESHOLD:
        return None

    today = datetime.utcnow().date()

    existing = db.query(AnomalyAlert).filter(
        AnomalyAlert.tenant_id == tenant_id,
        AnomalyAlert.metric_name == metric,
        AnomalyAlert.date == today,
        AnomalyAlert.status == "active"
    ).first()

    if not existing:
        return None

    existing.status = "resolved"
    existing.last_seen = datetime.utcnow()

    db.commit()

    return {
        "status": "resolved",
        "metric": metric
    }


# ---------------------------------------------------------
# COOLDOWN LOGIC (ANTI-SPAM)
# ---------------------------------------------------------

def _should_notify(existing: AnomalyAlert, now: datetime) -> bool:
    """
    Prevents repeated alerts within cooldown window.
    """

    if not existing.last_seen:
        return True

    delta = now - existing.last_seen
    return delta > timedelta(minutes=ALERT_COOLDOWN_MINUTES)


# ---------------------------------------------------------
# NOTIFICATIONS
# ---------------------------------------------------------

def _send_alert_notification(tenant_id: str, anomaly: Dict):
    """
    Dispatch alerts (Slack / Email).
    Safe: never breaks pipeline.
    """

    try:
        message = (
            f"🚨 Anomaly Detected\n"
            f"Tenant: {tenant_id}\n"
            f"Metric: {anomaly.get('metric_name')}\n"
            f"Direction: {anomaly.get('direction')}\n"
            f"Deviation: {anomaly.get('deviation_pct')}%\n"
            f"Baseline: {anomaly.get('baseline')}\n"
            f"Current: {anomaly.get('current_value')}"
        )

        # MVP fallback (safe)
        print(message)

        # 👉 Later:
        # - Slack webhook
        # - Email (SendGrid)
        # - Webhooks per tenant

    except Exception:
        # Never break anomaly pipeline because of alerts
        pass