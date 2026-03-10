"""
api/services/usage_synchronizer.py
Objective: Synchronize real-time usage metrics and quotas between the backend and frontend.
Methodology: Hybrid Performance Paradigm (Supabase Realtime) and Security by Design.
"""

from typing import Dict, Any, Optional
from datetime import datetime
from api.database import get_db_client #
from api.services.subscription_manager import SubscriptionManager, UsageMetric #
from api.services.audit_logger import AuditLogger #

class UsageSynchronizer:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.db = get_db_client() #
        self.sub_manager = SubscriptionManager(tenant_id) #
        self.logger = AuditLogger() #

    async def sync_usage_to_client(self, metric: UsageMetric, current_value: int):
        """
        Pushes usage updates to the 'tenant_usage_sync' table.
        Supabase Realtime listeners on the frontend will catch this change.
        """
        # 1. Fetch Plan Limits for context
        sub = await self.sub_manager.get_current_subscription()
        tier = sub.get("tier", "free")
        
        # 2. Update the sync table (Optimized for Frontend Consumption)
        # This table should have Row Level Security (RLS) enabled so users 
        # can only see their own tenant_id.
        sync_payload = {
            "tenant_id": self.tenant_id,
            "metric_name": metric.value,
            "current_usage": current_value,
            "last_updated": datetime.utcnow().isoformat(),
            "tier_context": tier
        }

        try:
            # Upsert the usage state so the frontend always has the 'latest' snapshot
            self.db.table("tenant_usage_sync").upsert(
                sync_payload, on_conflict="tenant_id, metric_name"
            ).execute()
            
            # 3. Analytics: Check if we should trigger a 'Limit Warning'
            await self._evaluate_threshold_triggers(metric, current_value, sub)
            
        except Exception as e:
            self.logger.log_query_execution(
                tenant_id=self.tenant_id,
                user_id="SYSTEM",
                natural_query=f"Sync usage: {metric.value}",
                generated_sql="N/A",
                execution_time_ms=0,
                status="error",
                error_message=str(e)
            ) #

    async def _evaluate_threshold_triggers(self, metric: UsageMetric, value: int, sub_data: Dict):
        """
        Business Logic: Detects if a user is nearing their SaaS tier limits.
        If threshold > 90%, we push a notification payload to the frontend.
        """
        # Logic to compare 'value' against 'TIER_CONFIGS' from SubscriptionManager
        # This can trigger a record in a 'notifications' table which the 
        # NotificationRouter (api/services/notification_router.py) handles.
        pass

    def get_frontend_subscription_snapshot(self) -> Dict[str, Any]:
        """
        Provides a comprehensive 'Entitlement Manifest' for the frontend 
        to use during initial app boot.
        """
        res = self.db.table("tenant_usage_sync").select("*").eq("tenant_id", self.tenant_id).execute()
        
        # Transform into a dictionary for easy frontend mapping
        return {item['metric_name']: item['current_usage'] for item in res.data}

# Example Integration in an API Route (e.g., api/routes/query.py):
# After running a DuckDB query:
# usage_sync = UsageSynchronizer(tenant_id)
# await usage_sync.sync_usage_to_client(UsageMetric.COMPUTE_SECONDS, new_total)