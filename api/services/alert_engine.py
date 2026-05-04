import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------
# GLOBAL CONFIG (Fallbacks)
# ---------------------------------------------------------

DEFAULT_ALERT_THRESHOLD = 20.0      # % deviation required
DEFAULT_RESOLVE_THRESHOLD = 10.0    # recovery threshold
DEFAULT_COOLDOWN_MINUTES = 60       # anti-spam


# ---------------------------------------------------------
# ALERT ENGINE
# ---------------------------------------------------------

class AlertEngine:
    def __init__(self, db_client):
        self.db = db_client

    # ---------------------------------------------------------
    # MAIN ENTRY
    # ---------------------------------------------------------
    def process_anomaly(
        self,
        tenant_id: str,
        anomaly: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:

        metric = anomaly.get("metric_name")
        is_anomaly = anomaly.get("is_anomaly", False)
        severity = float(anomaly.get("deviation_pct", 0.0))

        if not metric:
            logger.error("missing_metric_name", extra={"tenant": tenant_id})
            return None

        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        # ------------------------
        # FETCH EXISTING ACTIVE ALERT
        # ------------------------
        resp = self.db.table("alerts") \
            .select("*") \
            .eq("tenant_id", tenant_id) \
            .eq("metric_name", metric) \
            .eq("status", "active") \
            .execute()

        existing = resp.data[0] if resp.data else None

        # =====================================================
        # CASE 1: NEW ANOMALY (passes severity threshold)
        # =====================================================
        if is_anomaly and not existing:

            if severity < DEFAULT_ALERT_THRESHOLD:
                return {"status": "filtered_low_severity", "metric": metric}

            alert = {
                "tenant_id": tenant_id,
                "metric_name": metric,
                "status": "active",
                "severity": severity,
                "direction": anomaly.get("direction"),
                "first_seen": now_iso,
                "last_seen": now_iso,
                "last_notified": now_iso,
                "occurrence_count": 1,
                "anomaly_details": anomaly
            }

            resp = self.db.table("alerts").insert(alert).execute()
            alert_id = resp.data[0]["id"] if resp.data else "unknown"

            self._notify(tenant_id, anomaly, alert_id, "TRIGGERED")

            logger.info("alert_created", extra={"tenant": tenant_id, "metric": metric})

            return {"status": "created", "metric": metric}

        # =====================================================
        # CASE 2: ONGOING ANOMALY (DEDUP + COOLDOWN)
        # =====================================================
        if is_anomaly and existing:

            new_count = existing.get("occurrence_count", 1) + 1

            should_notify = self._should_notify(existing, now)

            update_payload = {
                "last_seen": now_iso,
                "occurrence_count": new_count,
                "severity": severity,
                "anomaly_details": anomaly
            }

            if should_notify:
                update_payload["last_notified"] = now_iso

            self.db.table("alerts") \
                .update(update_payload) \
                .eq("id", existing["id"]) \
                .execute()

            if should_notify:
                self._notify(tenant_id, anomaly, existing["id"], "ONGOING")

            logger.info("alert_updated", extra={
                "tenant": tenant_id,
                "metric": metric,
                "count": new_count,
                "notified": should_notify
            })

            return {"status": "updated", "notified": should_notify}

        # =====================================================
        # CASE 3: RESOLVED
        # =====================================================
        if not is_anomaly and existing:

            # Only resolve if truly recovered
            if severity >= DEFAULT_RESOLVE_THRESHOLD:
                return {"status": "still_anomalous", "metric": metric}

            self.db.table("alerts").update({
                "status": "resolved",
                "last_seen": now_iso
            }).eq("id", existing["id"]).execute()

            self._notify(tenant_id, anomaly, existing["id"], "RESOLVED")

            logger.info("alert_resolved", extra={
                "tenant": tenant_id,
                "metric": metric
            })

            return {"status": "resolved", "metric": metric}

        # =====================================================
        # CASE 4: NORMAL
        # =====================================================
        return {"status": "normal", "metric": metric}

    # ---------------------------------------------------------
    # COOLDOWN LOGIC
    # ---------------------------------------------------------
    def _should_notify(self, existing: Dict, now: datetime) -> bool:

        last_notified = existing.get("last_notified")
        if not last_notified:
            return True

        try:
            last_time = datetime.fromisoformat(last_notified)
        except Exception:
            return True

        return now - last_time > timedelta(minutes=DEFAULT_COOLDOWN_MINUTES)

    # ---------------------------------------------------------
    # NOTIFICATIONS
    # ---------------------------------------------------------
    def _notify(
        self,
        tenant_id: str,
        anomaly: Dict,
        alert_id: str,
        event_type: str
    ):
        try:
            icon = {
                "TRIGGERED": "🚨",
                "ONGOING": "🔁",
                "RESOLVED": "✅"
            }.get(event_type, "ℹ️")

            message = (
                f"{icon} [{event_type}] {anomaly.get('metric_name')}\n"
                f"Tenant: {tenant_id}\n"
                f"Current: {anomaly.get('current_value')}\n"
                f"Baseline: {anomaly.get('baseline')}\n"
                f"Deviation: {anomaly.get('deviation_pct')}%\n"
                f"Direction: {anomaly.get('direction')}\n"
                f"Alert ID: {alert_id}"
            )

            # MVP safe fallback
            print("\n--- ALERT ---")
            print(message)
            print("-------------\n")

            logger.info("notification_sent", extra={
                "tenant": tenant_id,
                "type": event_type
            })

        except Exception as e:
            logger.error("notification_failed", extra={
                "tenant": tenant_id,
                "error": str(e)
            }, exc_info=True)