import os
import uuid
import logging
import requests
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from supabase import create_client, Client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# The Modular Strategy: Abstract Notification Interfaces
# ---------------------------------------------------------

class BaseNotifier(ABC):
    """Abstract interface for swappable notification channels."""
    
    @abstractmethod
    def send_alert(self, anomaly_data: Dict[str, Any], deep_link: str) -> bool:
        """Sends the formatted alert to the target destination."""
        pass

class SlackNotifier(BaseNotifier):
    def __init__(self, tenant_id: str, db_client: Client):
        self.tenant_id = tenant_id
        self.db_client = db_client
        self.webhook_url = self._fetch_tenant_slack_webhook()

    def _fetch_tenant_slack_webhook(self) -> Optional[str]:
        """
        Security by Design: Retrieve the encrypted OAuth token or Webhook URL 
        for this specific tenant_id. 
        """
        # Note: In production, ensure this is a secure, encrypted column or vault lookup.
        try:
            response = self.db_client.table("tenant_integrations") \
                .select("slack_webhook_url") \
                .eq("tenant_id", self.tenant_id) \
                .execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0].get("slack_webhook_url")
            return None
        except Exception as e:
            logger.error(f"Failed to fetch Slack config for tenant {self.tenant_id}: {e}")
            return None

    def send_alert(self, anomaly_data: Dict[str, Any], deep_link: str) -> bool:
        if not self.webhook_url:
            logger.warning(f"No Slack integration found for tenant {self.tenant_id}. Skipping.")
            return False

        metric = anomaly_data.get('metric', 'Unknown Metric')
        pct_change = anomaly_data.get('percentage_change', 0.0)
        direction = "dropped" if pct_change < 0 else "spiked"
        emoji = "📉" if pct_change < 0 else "📈"

        # Slack Block Kit for high-quality SaaS UI
        slack_payload = {
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"{emoji} Anomaly Detected: {metric} {direction} by {abs(pct_change):.1f}%",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*AI Diagnostic Summary:*\n{anomaly_data.get('diagnostic_summary', 'No summary generated.')}"
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "🔍 Investigate in Dashboard",
                                "emoji": True
                            },
                            "value": "investigate_click",
                            "url": deep_link,
                            "style": "primary"
                        }
                    ]
                }
            ]
        }

        try:
            res = requests.post(self.webhook_url, json=slack_payload, timeout=10)
            res.raise_for_status()
            logger.info(f"Slack alert sent successfully for tenant {self.tenant_id}")
            return True
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send Slack alert: {e}")
            return False


# ---------------------------------------------------------
# Orchestration Engine: The Notification Router
# ---------------------------------------------------------

class NotificationRouter:
    """
    Handles state generation (Supabase) and routes the payload to the active
    swappable notification modules.
    """
    def __init__(self):
        # Instantiate Supabase client using Service Role for backend worker tasks
        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.db_client = create_client(supabase_url, supabase_key)
        self.frontend_base_url = os.getenv("FRONTEND_BASE_URL", "https://app.yourdomain.com")

    def _save_anomaly_state(self, anomaly_data: Dict[str, Any]) -> str:
        """
        Interaction (Frontend) methodology: 
        Saves the anomaly payload to generate a clean, short deep-link ID.
        """
        anomaly_id = str(uuid.uuid4())
        
        # We store the state so the React frontend can fetch and hydrate context
        payload = {
            "id": anomaly_id,
            "tenant_id": anomaly_data['tenant_id'],
            "agent_id": anomaly_data['agent_id'],
            "metric": anomaly_data['metric'],
            "date": anomaly_data['date'],
            "filters": anomaly_data['top_variance_drivers'], # Pass top drivers to auto-filter the UI
            "diagnostic_summary": anomaly_data['diagnostic_summary'],
            "status": "unresolved"
        }

        self.db_client.table("anomaly_states").insert(payload).execute()
        return anomaly_id

    def process_and_route(self, anomaly_data: Dict[str, Any], channels: List[str] = ['slack']) -> None:
        """
        The entry point for Phase 4. Called by watchdog_service after AI diagnostic completes.
        """
        tenant_id = anomaly_data.get('tenant_id')
        if not tenant_id:
            logger.error("Cannot route notification: Missing tenant_id.")
            return

        # 1. State Management: Save to DB and generate short ID
        try:
            anomaly_id = self._save_anomaly_state(anomaly_data)
        except Exception as e:
            logger.error(f"Failed to save anomaly state: {e}")
            return

        # 2. Deep Linking: Construct the clean URL
        deep_link = f"{self.frontend_base_url}/dashboard/investigate?anomaly_id={anomaly_id}"

        # 3. Dynamic Routing to requested channels
        if 'slack' in channels:
            slack = SlackNotifier(tenant_id=tenant_id, db_client=self.db_client)
            slack.send_alert(anomaly_data, deep_link)
            
        # Example of how easily we can extend later:
        # if 'teams' in channels:
        #     teams = TeamsNotifier(tenant_id=tenant_id, db_client=self.db_client)
        #     teams.send_alert(anomaly_data, deep_link)