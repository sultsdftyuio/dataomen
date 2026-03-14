import os
import uuid
import logging
import asyncio
import httpx
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta

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
        # We fetch the webhook securely during initialization
        self.webhook_url = self._fetch_tenant_slack_webhook()

    def _fetch_tenant_slack_webhook(self) -> Optional[str]:
        """
        Security by Design: Retrieve the Webhook URL for this specific tenant_id.
        This runs synchronously but is called from within a thread-pool by the Router.
        """
        try:
            query = text("""
                SELECT slack_webhook_url 
                FROM tenant_integrations 
                WHERE tenant_id = :tenant_id
            """)
            result = self.db.execute(query, {"tenant_id": self.tenant_id}).fetchone()
            
            return result[0] if result and result[0] else None
            
        except SQLAlchemyError as e:
            logger.error(f"[{self.tenant_id}] Failed to fetch Slack config: {e}")
            return None

    async def send_alert(self, tenant_name: str, agent_name: str, insight_summary: str, deep_link: str) -> bool:
        """Sends a Slack message using the upgraded Block Kit UI."""
        if not self.webhook_url:
            logger.debug(f"[{self.tenant_id}] No active Slack integration found. Skipping payload.")
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
                        {"type": "mrkdwn", "text": f"*Workspace:*\n{tenant_name}"},
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
                                "text": "🔍 Investigate in Dashboard",
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
            # High-performance async HTTP request with strict timeouts
            async with httpx.AsyncClient() as client:
                res = await client.post(self.webhook_url, json=slack_payload, timeout=5.0)
                res.raise_for_status()
                
            logger.info(f"✅ [{self.tenant_id}] Slack alert dispatched successfully.")
            return True
            
        except httpx.HTTPError as e:
            logger.error(f"❌ [{self.tenant_id}] Slack network/API failure: {e}")
            return False

# ---------------------------------------------------------
# Orchestration Engine: The Notification Router
# ---------------------------------------------------------

class NotificationRouter:
    """
    Phase 4+: Enterprise Action Space for AI Agents. 
    Orchestrates state management, multi-channel routing, and intelligent throttling.
    """
    def __init__(self):
        # Fallback to localhost for development, but expect Vercel/Render URL in prod
        self.frontend_base_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")
        # Alert Fatigue Guard: Cooldown period in seconds (e.g., 1 hour)
        self.cooldown_seconds = 3600 

    def _sync_db_operations(self, tenant_id: str, agent_name: str, insight_summary: str) -> Optional[Dict[str, Any]]:
        """
        Groups all synchronous SQLAlchemy calls into a single function.
        Designed to be executed in a background thread to protect the async event loop.
        """
        from api.database import SessionLocal
        db = SessionLocal()
        
        try:
            now = datetime.now(timezone.utc)
            
            # 1. Intelligent Throttling (Volatility Guard)
            # Check when the last alert was sent for this specific agent & tenant
            throttle_query = text("""
                SELECT created_at FROM anomaly_logs 
                WHERE tenant_id = :tenant_id AND agent_name = :agent_name 
                ORDER BY created_at DESC LIMIT 1
            """)
            last_alert = db.execute(throttle_query, {
                "tenant_id": tenant_id, 
                "agent_name": agent_name
            }).fetchone()

            if last_alert and last_alert[0]:
                last_time = last_alert[0].replace(tzinfo=timezone.utc) if last_alert[0].tzinfo is None else last_alert[0]
                if (now - last_time).total_seconds() < self.cooldown_seconds:
                    logger.info(f"[{tenant_id}] Alert suppressed due to active cooldown period for {agent_name}.")
                    return None # Signals the router to abort dispatch

            # 2. Persist the Anomaly State
            anomaly_id = str(uuid.uuid4())
            
            insert_query = text("""
                INSERT INTO anomaly_logs (id, tenant_id, agent_name, summary, created_at)
                VALUES (:id, :tenant_id, :agent_name, :summary, :now)
            """)
            db.execute(insert_query, {
                "id": anomaly_id,
                "tenant_id": tenant_id,
                "agent_name": agent_name,
                "summary": insight_summary,
                "now": now
            })

            # 3. Fetch Tenant Name for UI context
            name_query = text("SELECT name FROM organizations WHERE id = :tid")
            name_result = db.execute(name_query, {"tid": tenant_id}).fetchone()
            tenant_name = name_result[0] if name_result else "Enterprise Workspace"

            db.commit()
            
            # 4. Initialize Notifiers within the DB context to fetch webhooks safely
            slack_notifier = SlackNotifier(db=db, tenant_id=tenant_id)
            
            return {
                "anomaly_id": anomaly_id,
                "tenant_name": tenant_name,
                "slack_notifier": slack_notifier
            }

        except Exception as e:
            db.rollback()
            logger.error(f"[{tenant_id}] Database transaction failed in NotificationRouter: {e}")
            return None
        finally:
            db.close()

    async def dispatch_alert(self, tenant_id: str, agent_name: str, insight_summary: str) -> Optional[str]:
        """
        Main entry point for agent notifications. 
        Asynchronously persists the incident and routes to active channels.
        """
        # 1. Offload blocking DB checks & writes to a thread pool
        db_context = await asyncio.to_thread(
            self._sync_db_operations, 
            tenant_id, 
            agent_name, 
            insight_summary
        )

        # Alert was suppressed by cooldown or failed DB insertion
        if not db_context:
            return None 

        anomaly_id = db_context["anomaly_id"]
        tenant_name = db_context["tenant_name"]
        slack: SlackNotifier = db_context["slack_notifier"]

        # 2. Construct Deep Link for the Frontend
        deep_link = f"{self.frontend_base_url}/dashboard/investigate/{anomaly_id}"

        # 3. Multi-Channel Async Routing (Fire & Forget)
        # Using create_task so the API response isn't delayed by third-party webhook latency
        asyncio.create_task(
            slack.send_alert(
                tenant_name=tenant_name,
                agent_name=agent_name,
                insight_summary=insight_summary,
                deep_link=deep_link
            )
        )

        logger.debug(f"[{tenant_id}] Alert {anomaly_id} queued for background dispatch.")
        return anomaly_id

# Export singleton instance
notification_router = NotificationRouter()