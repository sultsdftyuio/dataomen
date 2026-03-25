# api/services/notification_router.py
import os
import uuid
import logging
import asyncio
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
        # We fetch the webhook securely during initialization
        self.webhook_url = self._fetch_tenant_slack_webhook()

    def _fetch_tenant_slack_webhook(self) -> Optional[str]:
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
        if not self.webhook_url:
            return False

        slack_payload = {
            "text": f"🚨 Data Anomaly Detected by {agent_name}",
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": f"🚨 Anomaly Alert: {agent_name}", "emoji": True}
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
                    "text": {"type": "mrkdwn", "text": f"*AI Root-Cause Analysis:*\n{insight_summary}"}
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "🔍 Investigate in Dashboard", "emoji": True},
                            "url": deep_link,
                            "style": "primary"
                        }
                    ]
                }
            ]
        }

        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(self.webhook_url, json=slack_payload, timeout=5.0)
                res.raise_for_status()
            logger.info(f"✅ [{self.tenant_id}] Slack alert dispatched successfully.")
            return True
        except httpx.HTTPError as e:
            logger.error(f"❌ [{self.tenant_id}] Slack network/API failure: {e}")
            return False

class EmailNotifier(BaseNotifier):
    """
    Implementation of Email alerts using Resend.
    Sends beautifully formatted HTML emails containing the AI Narrative.
    """
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.resend_api_key = os.getenv("RESEND_API_KEY")
        self.sender_email = os.getenv("RESEND_FROM_EMAIL", "alerts@arcli.tech")
        self.recipient_email = self._fetch_tenant_email()

    def _fetch_tenant_email(self) -> Optional[str]:
        """
        Security by Design: Resolves the appropriate email to alert for this tenant.
        Falls back to the user ID if they are a solo tenant without an organization.
        """
        try:
            query = text("""
                SELECT email 
                FROM users 
                WHERE organization_id = :tenant_id OR id = :tenant_id
                LIMIT 1
            """)
            result = self.db.execute(query, {"tenant_id": self.tenant_id}).fetchone()
            return result[0] if result and result[0] else None
        except SQLAlchemyError as e:
            logger.error(f"[{self.tenant_id}] Failed to fetch User Email config: {e}")
            return None

    async def send_alert(self, tenant_name: str, agent_name: str, insight_summary: str, deep_link: str) -> bool:
        if not self.resend_api_key or not self.recipient_email:
            logger.debug(f"[{self.tenant_id}] Missing Resend API Key or Recipient Email. Skipping email.")
            return False

        # Professional HTML SaaS Template
        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-w-2xl mx-auto p-6 bg-white border rounded-lg shadow-sm">
            <h2 style="color: #0f172a; margin-bottom: 8px;">🚨 Anomaly Detected: {agent_name}</h2>
            <p style="color: #64748b; font-size: 14px; margin-bottom: 24px;">Workspace: <strong>{tenant_name}</strong> | Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC</p>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <h3 style="color: #334155; font-size: 14px; margin-top: 0; text-transform: uppercase; letter-spacing: 0.05em;">AI Root-Cause Analysis</h3>
                <p style="color: #1e293b; line-height: 1.6; margin-bottom: 0;">{insight_summary.replace(chr(10), '<br>')}</p>
            </div>
            
            <a href="{deep_link}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 14px;">🔍 Investigate in Dashboard</a>
            
            <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                You are receiving this because you enabled Critical Anomalies in your DataOmen notification settings.<br>
                <a href="{os.getenv('FRONTEND_BASE_URL', 'https://arcli.tech')}/settings" style="color: #64748b;">Manage Notification Preferences</a>
            </p>
        </div>
        """

        payload = {
            "from": f"DataOmen Alerts <{self.sender_email}>",
            "to": [self.recipient_email],
            "subject": f"🚨 Action Required: Anomaly detected by {agent_name}",
            "html": html_content
        }

        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {self.resend_api_key}"},
                    json=payload,
                    timeout=5.0
                )
                res.raise_for_status()
            logger.info(f"✅ [{self.tenant_id}] Email alert dispatched successfully to {self.recipient_email}.")
            return True
        except httpx.HTTPError as e:
            logger.error(f"❌ [{self.tenant_id}] Resend API failure: {e}")
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
            throttle_query = text("""
                SELECT created_at FROM anomaly_logs 
                WHERE tenant_id = :tenant_id AND agent_name = :agent_name 
                ORDER BY created_at DESC LIMIT 1
            """)
            last_alert = db.execute(throttle_query, {"tenant_id": tenant_id, "agent_name": agent_name}).fetchone()

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
                "id": anomaly_id, "tenant_id": tenant_id, "agent_name": agent_name, "summary": insight_summary, "now": now
            })

            # 3. Fetch Tenant Name for UI context
            name_query = text("SELECT name FROM organizations WHERE id = :tid")
            name_result = db.execute(name_query, {"tid": tenant_id}).fetchone()
            tenant_name = name_result[0] if name_result else "Enterprise Workspace"

            db.commit()
            
            # 4. Initialize Notifiers within the DB context to fetch configs safely
            slack_notifier = SlackNotifier(db=db, tenant_id=tenant_id)
            email_notifier = EmailNotifier(db=db, tenant_id=tenant_id)
            
            return {
                "anomaly_id": anomaly_id,
                "tenant_name": tenant_name,
                "notifiers": [slack_notifier, email_notifier]
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
        Asynchronously persists the incident and routes to active channels concurrently.
        """
        # 1. Offload blocking DB checks & writes to a thread pool
        db_context = await asyncio.to_thread(
            self._sync_db_operations, tenant_id, agent_name, insight_summary
        )

        # Alert was suppressed by cooldown or failed DB insertion
        if not db_context:
            return None 

        anomaly_id = db_context["anomaly_id"]
        tenant_name = db_context["tenant_name"]
        notifiers: List[BaseNotifier] = db_context["notifiers"]

        # 2. Construct Deep Link for the Frontend
        deep_link = f"{self.frontend_base_url}/investigate/{anomaly_id}"

        # 3. Multi-Channel Async Routing (Fire & Forget concurrently)
        # Using asyncio.gather inside a background task ensures we hit Slack and Email in parallel
        async def run_notifiers():
            tasks = [
                notifier.send_alert(
                    tenant_name=tenant_name,
                    agent_name=agent_name,
                    insight_summary=insight_summary,
                    deep_link=deep_link
                )
                for notifier in notifiers
            ]
            await asyncio.gather(*tasks, return_exceptions=True)

        asyncio.create_task(run_notifiers())

        logger.debug(f"[{tenant_id}] Alert {anomaly_id} queued for multi-channel background dispatch.")
        return anomaly_id

# Export singleton instance
notification_router = NotificationRouter()