# api/services/notification_router.py

import os
import uuid
import logging
import httpx  # Upgraded to httpx for non-blocking async HTTP calls
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# The Modular Strategy: Abstract Notification Interfaces
# ---------------------------------------------------------

class BaseNotifier(ABC):
    """Abstract interface for swappable notification channels."""
    
    @abstractmethod
    async def send_alert(self, anomaly_data: Dict[str, Any], deep_link: str) -> bool:
        """Sends the formatted alert to the target destination asynchronously."""
        pass

class SlackNotifier(BaseNotifier):
    """
    Implementation of Slack alerts using the Block Kit for high-quality SaaS UI.
    Uses async HTTP to prevent blocking the worker event loop.
    """
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        # We still fetch the webhook synchronously during init as it is a local DB call
        self.webhook_url = self._fetch_tenant_slack_webhook()

    def _fetch_tenant_slack_webhook(self) -> Optional[str]:
        """
        Security by Design: Retrieve the encrypted OAuth token or Webhook URL 
        for this specific tenant_id using secure SQLAlchemy execution.
        """
        try:
            query = text("""
                SELECT slack_webhook_url 
                FROM tenant_integrations 
                WHERE tenant_id = :tenant_id
            """)
            result = self.db.execute(query, {"tenant_id": self.tenant_id}).fetchone()
            
            if result and result.slack_webhook_url:
                return result.slack_webhook_url
            return None
            
        except SQLAlchemyError as e:
            logger.error(f"Failed to fetch Slack config for tenant {self.tenant_id}: {e}")
            return None

    async def send_alert(self, anomaly_data: Dict[str, Any], deep_link: str) -> bool:
        """
        Sends a Slack message using non-blocking I/O.
        """
        if not self.webhook_url:
            logger.warning(f"No Slack integration found for tenant {self.tenant_id}. Skipping.")
            return False

        metric = anomaly_data.get('metric', 'Unknown Metric')
        pct_change = anomaly_data.get('variance_pct', 0.0) 
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
                        "text": f"*AI Diagnostic Summary:*\n{anomaly_data.get('diagnostic_summary', 'Pending AI context generation.')}"
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
            # Using httpx for a non-blocking POST request
            async with httpx.AsyncClient() as client:
                res = await client.post(self.webhook_url, json=slack_payload, timeout=10.0)
                res.raise_for_status()
                
            logger.info(f"Slack alert sent successfully for tenant {self.tenant_id}")
            return True
        except httpx.HTTPError as e:
            logger.error(f"Failed to send Slack alert via httpx: {e}")
            return False


# ---------------------------------------------------------
# Orchestration Engine: The Notification Router
# ---------------------------------------------------------

class NotificationRouter:
    """
    Handles state generation and routes the payload to the active
    swappable notification modules via SQLAlchemy.
    """
    def __init__(self):
        self.frontend_base_url = os.getenv("FRONTEND_BASE_URL", "https://app.yourdomain.com")

    def _save_anomaly_state(self, db: Session, anomaly_data: Dict[str, Any]) -> str:
        """
        Saves the anomaly payload to generate a clean, short deep-link ID.
        """
        anomaly_id = str(uuid.uuid4())
        
        try:
            query = text("""
                INSERT INTO anomaly_states 
                (id, tenant_id, agent_id, metric, date, filters, diagnostic_summary, status)
                VALUES 
                (:id, :tenant_id, :agent_id, :metric, :date, :filters, :diagnostic_summary, :status)
            """)
            
            db.execute(query, {
                "id": anomaly_id,
                "tenant_id": anomaly_data.get('tenant_id'),
                "agent_id": anomaly_data.get('dataset_id'), 
                "metric": anomaly_data.get('metric'),
                "date": anomaly_data.get('date'),
                "filters": anomaly_data.get('top_variance_drivers', "{}"),
                "diagnostic_summary": anomaly_data.get('diagnostic_summary', ''),
                "status": "unresolved"
            })
            db.commit()
            return anomaly_id
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Failed to save anomaly state to database: {e}")
            raise RuntimeError("Database error during anomaly state persistence.")

    async def process_and_route(self, db: Session, anomaly_data: Dict[str, Any], channels: List[str] = ['slack']) -> None:
        """
        Unified workspace entry point. Orchestrates state persistence and async routing.
        """
        tenant_id = anomaly_data.get('tenant_id')
        if not tenant_id:
            logger.error("Cannot route notification: Missing tenant_id.")
            return

        # 1. State Management: Save to DB synchronously as it is a required transactional dependency
        try:
            anomaly_id = self._save_anomaly_state(db, anomaly_data)
        except Exception as e:
            logger.error(f"Routing aborted. Failed to save state: {e}")
            return

        # 2. Deep Linking: Construct the clean URL
        deep_link = f"{self.frontend_base_url}/dashboard/investigate?anomaly_id={anomaly_id}"

        # 3. Dynamic Routing: Execute swappable notification modules asynchronously
        if 'slack' in channels:
            slack = SlackNotifier(db=db, tenant_id=tenant_id)
            await slack.send_alert(anomaly_data, deep_link)

# Export singleton instance
notification_router = NotificationRouter()