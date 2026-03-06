# api/services/audit_logger.py
import os
import logging
import time
from typing import Optional
from supabase import create_client, Client

logger = logging.getLogger(__name__)

class AuditLogger:
    """
    1.4 Immutable Audit Logging:
    Logs every NL2SQL prompt, execution metric, and user interaction to a 
    cold-storage Supabase table for enterprise compliance.
    """
    def __init__(self):
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        # Ensure you use the Service Role Key for backend immutable inserts
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") 
        
        if not supabase_url or not supabase_key:
            logger.warning("Supabase credentials not found. Audit logging bypassed.")
            self.client: Optional[Client] = None
        else:
            self.client = create_client(supabase_url, supabase_key)

    def log_query_execution(
        self,
        tenant_id: str,
        user_id: str,
        natural_query: str,
        generated_sql: str,
        execution_time_ms: float,
        status: str,
        error_message: Optional[str] = None
    ):
        """
        Pushes payload to 'audit_logs' table without blocking main thread.
        """
        if not self.client:
            return

        payload = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "action_type": "nl2sql_query",
            "prompt": natural_query,
            "generated_sql": generated_sql,
            "execution_ms": execution_time_ms,
            "status": status,
            "error_details": error_message,
            "created_at": time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
        }

        try:
            self.client.table("audit_logs").insert(payload).execute()
        except Exception as e:
            # Swallow exceptions. An audit log failure should NEVER crash a user's prompt request.
            logger.error(f"Failed to push audit log to Supabase: {str(e)}")