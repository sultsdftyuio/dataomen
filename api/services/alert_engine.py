import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta

# Assuming external integrations are available
# from api.services.integrations.slack import SlackConnector
# from api.services.integrations.email import EmailConnector

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# GLOBAL CONFIG
# ---------------------------------------------------------
DEFAULT_ALERT_THRESHOLD = 20.0      # % deviation required to trigger
DEFAULT_RESOLVE_THRESHOLD = 10.0    # % deviation required to resolve
DEFAULT_COOLDOWN_MINUTES = 60       # Anti-spam cooldown for ongoing alerts


class AlertEngine:
    """
    Intelligent Alert Engine that tracks anomaly lifecycles (Triggered, Ongoing, Resolved).
    Supports both real-time individual processing and batch digest dispatching.
    """

    def __init__(self, db_client):
        # Assumes a DB client with a chainable interface (e.g., Supabase / PostgREST)
        self.db = db_client

    # ---------------------------------------------------------
    # BATCH ENTRY
    # ---------------------------------------------------------
    def process_batch_and_dispatch(self, tenant_id: str, anomalies: List[Dict[str, Any]]) -> None:
        """
        Processes a batch of anomalies, updates their DB states, and dispatches a 
        single digest if any anomalies require notification.
        """
        if not anomalies:
            return

        logger.info(f"Evaluating {len(anomalies)} anomalies for dispatch. [Tenant: {tenant_id}]")

        notifiable_events = []
        for anomaly in anomalies:
            # Process state without sending immediate individual alerts
            event = self.process_anomaly(tenant_id, anomaly, send_immediate=False)
            if event:
                notifiable_events.append(event)

        if not notifiable_events:
            logger.info(f"All anomalies normal or on cooldown. No alerts dispatched. [Tenant: {tenant_id}]")
            return

        # Format and dispatch the batch digest
        payload = self._format_digest_payload(notifiable_events)
        self._dispatch_to_tenant_channels(tenant_id, payload)

    # ---------------------------------------------------------
    # SINGLE ENTRY / STATE MANAGEMENT
    # ---------------------------------------------------------
    def process_anomaly(
        self,
        tenant_id: str,
        anomaly: Dict[str, Any],
        send_immediate: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Evaluates a single anomaly, tracks state (active/resolved), enforces cooldowns,
        and returns the event payload. Optionally dispatches immediately.
        """
        metric = anomaly.get("metric_name")
        is_anomaly = anomaly.get("is_anomaly", False)
        severity = float(anomaly.get("deviation_pct", 0.0))

        if not metric:
            logger.error("missing_metric_name", extra={"tenant": tenant_id})
            return None

        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        # Fetch existing active alert
        resp = self.db.table("alerts") \
            .select("*") \
            .eq("tenant_id", tenant_id) \
            .eq("metric_name", metric) \
            .eq("status", "active") \
            .execute()

        existing = resp.data[0] if resp.data else None
        event_type = None
        alert_id = "unknown"

        # =====================================================
        # CASE 1: NEW ANOMALY
        # =====================================================
        if is_anomaly and not existing:
            if severity < DEFAULT_ALERT_THRESHOLD:
                return None  # Filter out low severity

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
            event_type = "TRIGGERED"

        # =====================================================
        # CASE 2: ONGOING ANOMALY
        # =====================================================
        elif is_anomaly and existing:
            alert_id = existing["id"]
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
                event_type = "ONGOING"

            self.db.table("alerts").update(update_payload).eq("id", alert_id).execute()

        # =====================================================
        # CASE 3: RESOLVED
        # =====================================================
        elif not is_anomaly and existing:
            alert_id = existing["id"]
            
            # Only resolve if it has recovered past the resolve threshold
            if severity >= DEFAULT_RESOLVE_THRESHOLD:
                return None  

            self.db.table("alerts").update({
                "status": "resolved",
                "last_seen": now_iso
            }).eq("id", alert_id).execute()
            event_type = "RESOLVED"

        # =====================================================
        # DISPATCH & RETURN
        # =====================================================
        if event_type:
            event_data = {
                "tenant_id": tenant_id,
                "alert_id": alert_id,
                "event_type": event_type,
                "anomaly": anomaly
            }
            
            if send_immediate:
                payload = self._format_digest_payload([event_data])
                self._dispatch_to_tenant_channels(tenant_id, payload)
                
            return event_data

        return None

    # ---------------------------------------------------------
    # UTILITIES
    # ---------------------------------------------------------
    def _should_notify(self, existing: Dict, now: datetime) -> bool:
        """Evaluates if an ongoing alert has passed the cooldown period."""
        last_notified = existing.get("last_notified")
        if not last_notified:
            return True

        try:
            last_time = datetime.fromisoformat(last_notified)
            # Ensure timezone awareness for accurate comparison
            if last_time.tzinfo is None:
                last_time = last_time.replace(tzinfo=timezone.utc)
        except ValueError:
            return True

        return now - last_time > timedelta(minutes=DEFAULT_COOLDOWN_MINUTES)

    @staticmethod
    def _format_digest_payload(events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Converts events into a structured digest format.
        (Can be easily parsed into Slack Blocks, Teams cards, HTML emails, etc.)
        """
        icons = {"TRIGGERED": "🚨", "ONGOING": "🔁", "RESOLVED": "✅"}

        # Sort by severity (descending) so critical issues appear at the top
        events.sort(key=lambda x: float(x["anomaly"].get("deviation_pct", 0)), reverse=True)

        blocks = []
        for e in events:
            anomaly = e["anomaly"]
            evt_type = e["event_type"]
            icon = icons.get(evt_type, "ℹ️")
            explanation = anomaly.get('explanation', 'No context provided.')

            text = (
                f"{icon} *[{evt_type}] {anomaly.get('metric_name')}*\n"
                f"> *Deviation:* {anomaly.get('deviation_pct')}% ({anomaly.get('direction', 'N/A')})\n"
                f"> *Values:* Current: {anomaly.get('current_value')} | Baseline: {anomaly.get('baseline')}\n"
                f"> *Context:* {explanation}"
            )

            blocks.append({
                "type": "section",
                "text": text
            })

        return {
            "title": f"Dataomen Insights: {len(events)} Alert Updates",
            "blocks": blocks,
            "raw_data": events
        }

    @staticmethod
    def _dispatch_to_tenant_channels(tenant_id: str, payload: Dict[str, Any]) -> None:
        """Looks up tenant integration settings and routes the payload."""
        
        # 1. Look up configurations
        # integrations = get_tenant_integrations(tenant_id)
        
        # 2. Route payload
        # if integrations.get('slack'):
        #     SlackConnector.send_digest(integrations['slack']['webhook_url'], payload)
        # if integrations.get('email'):
        #     EmailConnector.send_digest(integrations['email']['target'], payload)

        logger.info(f"Dispatched alert digest ({len(payload['blocks'])} items). [Tenant: {tenant_id}]")

        # MVP Fallback to Console (for local testing visibility)
        print(f"\n=== {payload['title'].upper()} ===")
        for block in payload['blocks']:
            print(block['text'])
            print("-" * 40)
        print("=========================================\n")