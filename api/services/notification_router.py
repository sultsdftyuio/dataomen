# api/services/notification_router.py

import os
import uuid
import logging
import httpx
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

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
    async def send_alert(self, tenant_name: str, agent_name: str, insight_summary: str, deep_link: str) -> bool:
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
        self.webhook_url = self._fetch_tenant_slack_webhook()

    def _fetch_tenant_slack_webhook(self) -> Optional[str]:
        """
        Security by Design: Retrieve the Webhook URL for this specific tenant_id.
        """
        try:
            # Note: Ensure your schema has a 'tenant_integrations' table or similar
            query = text("""
                SELECT slack_webhook_url 
                FROM tenant_integrations 
                WHERE tenant_id = :tenant_id
            """)
            result = self.db.execute(query, {"tenant_id": self.tenant_id}).fetchone()
            
            return result[0] if result and result[0] else None
            
        except SQLAlchemyError as e:
            logger.error(f"Failed to fetch Slack config for tenant {self.tenant_id}: {e}")
            return None

    async def send_alert(self, tenant_name: str, agent_name: str, insight_summary: str, deep_link: str) -> bool:
        """Sends a Slack message using the upgraded Block Kit UI."""
        if not self.webhook_url:
            logger.warning(f"No Slack integration found for tenant {self.tenant_id}. Skipping.")
            return False

        # Professional SaaS Alert Payload
        slack_payload = {
            "text": f"🚨 Data Anomaly Detected by {agent_name}",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"🚨 Anomaly Alert: {agent_name}",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Tenant:*\n{tenant_name}"},
                        {"type": "mrkdwn", "text": f"*Time (UTC):*\n{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"}
                    ]
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*AI Root-Cause Analysis:*\n{insight_summary}"
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "🔍 View in Dashboard",
                                "emoji": True
                            },
                            "url": deep_link,
                            "style": "primary"
                        }
                    ]
                }
            ]
        }

        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(self.webhook_url, json=slack_payload, timeout=10.0)
                res.raise_for_status()
            logger.info(f"Slack alert sent successfully for tenant {self.tenant_id}")
            return True
        except httpx.HTTPError as e:
            logger.error(f"Failed to send Slack alert for tenant {self.tenant_id}: {e}")
            return False

# ---------------------------------------------------------
# Orchestration Engine: The Notification Router
# ---------------------------------------------------------

class NotificationRouter:
    """
    The 'Action Space' for AI Agents. 
    Orchestrates state management (Database) and multi-channel routing (Slack, Webhooks).
    """
    def __init__(self):
        # Fallback to localhost for development, but expect Vercel/Render URL in prod
        self.frontend_base_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")

    async def dispatch_alert(self, tenant_id: str, agent_name: str, insight_summary: str) -> Optional[str]:
        """
        Main entry point for agent notifications. 
        Persists the incident to the DB and routes to active channels.
        """
        # 1. Create a fresh session for the background task
        # Importing here to avoid circular dependency with AgentService
        from api.database import SessionLocal
        db = SessionLocal()

        try:
            # 2. Persist the Anomaly State (Stateful Memory foundation)
            anomaly_id = str(uuid.uuid4())
            tenant_name = self._get_tenant_name(db, tenant_id)
            
            # Record incident in the audit/anomaly log
            self._record_incident(db, anomaly_id, tenant_id, agent_name, insight_summary)
            
            # 3. Construct Deep Link for the Frontend (Vercel/Render compatible)
            deep_link = f"{self.frontend_base_url}/dashboard/investigate/{anomaly_id}"

            # 4. Multi-Channel Routing
            # Currently defaults to Slack; modular design allows adding EmailNotifier or WebhookNotifier easily
            slack = SlackNotifier(db=db, tenant_id=tenant_id)
            await slack.send_alert(
                tenant_name=tenant_name,
                agent_name=agent_name,
                insight_summary=insight_summary,
                deep_link=deep_link
            )

            db.commit()
            logger.info(f"Successfully dispatched alert {anomaly_id} for tenant {tenant_id}")
            return anomaly_id

        except Exception as e:
            db.rollback()
            logger.error(f"Notification Router failed to dispatch: {e}")
            return None
        finally:
            db.close()

    def _get_tenant_name(self, db: Session, tenant_id: str) -> str:
        """Utility to fetch tenant display name for the alert payload."""
        try:
            # Placeholder for your actual user/organization lookup
            query = text("SELECT email FROM auth.users WHERE id = :tid")
            result = db.execute(query, {"tid": tenant_id}).fetchone()
            return result[0] if result else "Unknown Tenant"
        except:
            return tenant_id

    def _record_incident(self, db: Session, incident_id: str, tenant_id: str, agent_name: str, summary: str):
        """Saves the anomaly to the DB for historical tracking and frontend display."""
        try:
            query = text("""
                INSERT INTO anomaly_logs (id, tenant_id, agent_name, summary, created_at)
                VALUES (:id, :tenant_id, :agent_name, :summary, :now)
            """)
            db.execute(query, {
                "id": incident_id,
                "tenant_id": tenant_id,
                "agent_name": agent_name,
                "summary": summary,
                "now": datetime.now(timezone.utc)
            })
        except SQLAlchemyError as e:
            logger.error(f"Failed to record incident {incident_id}: {e}")
            raise

# Export singleton instance
notification_router = NotificationRouter()