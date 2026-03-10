"""
api/services/subscription_manager.py
Objective: Manage multi-tenant entitlements, feature gating, and usage-based metering.
Methodology: Modular Strategy (provider-agnostic) and Security by Design.
"""

from typing import Dict, Any, Optional
from datetime import datetime
from enum import Enum
from pydantic import BaseModel
from api.database import get_db_client # Assuming supabase/postgres wrapper
from api.services.integrations.stripe_connector import StripeConnector
from api.services.audit_logger import AuditLogger

class PlanTier(Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"

class UsageMetric(Enum):
    ROWS_INGESTED = "rows_ingested"
    COMPUTE_SECONDS = "compute_seconds"
    AGENT_COUNT = "agent_count"
    LLM_TOKENS = "llm_tokens"

class PlanLimits(BaseModel):
    max_agents: int
    max_rows_per_dataset: int
    features: list[str]
    is_metered: bool

# Configuration for Tiers
TIER_CONFIGS = {
    PlanTier.FREE: PlanLimits(
        max_agents=2,
        max_rows_per_dataset=10000,
        features=["basic_chat"],
        is_metered=False
    ),
    PlanTier.PRO: PlanLimits(
        max_agents=20,
        max_rows_per_dataset=1000000,
        features=["basic_chat", "anomaly_detection", "ab_testing", "api_access"],
        is_metered=True
    ),
    PlanTier.ENTERPRISE: PlanLimits(
        max_agents=999,
        max_rows_per_dataset=1000000000,
        features=["all"],
        is_metered=True
    )
}

class SubscriptionManager:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.db = get_db_client()
        self.stripe = StripeConnector() # Modular: Can swap for Paddle/Chargebee
        self.logger = AuditLogger()

    async def get_current_subscription(self) -> Dict[str, Any]:
        """Retrieves the current subscription state for the tenant."""
        # Query Supabase for the cached subscription status
        res = self.db.table("subscriptions").select("*").eq("tenant_id", self.tenant_id).single().execute()
        
        if not res.data:
            return {"tier": PlanTier.FREE, "status": "active"}
        
        return res.data

    async def check_entitlement(self, feature: str) -> bool:
        """Determines if a tenant is allowed to use a specific feature."""
        sub = await self.get_current_subscription()
        tier = PlanTier(sub.get("tier", "free"))
        config = TIER_CONFIGS[tier]
        
        if "all" in config.features:
            return True
        return feature in config.features

    async def track_usage(self, metric: UsageMetric, amount: int):
        """
        Records consumption for usage-based billing.
        In a high-performance setup, this should be buffered/batched.
        """
        # 1. Update internal database for real-time dashboard feedback
        self.db.rpc("increment_tenant_usage", {
            "t_id": self.tenant_id,
            "m_name": metric.value,
            "inc_val": amount
        }).execute()

        # 2. Sync to Stripe if the plan is metered
        sub = await self.get_current_subscription()
        if sub.get("stripe_subscription_id") and TIER_CONFIGS[PlanTier(sub["tier"])].is_metered:
            # We map UsageMetric to Stripe Price IDs
            await self.stripe.report_usage(
                subscription_item_id=sub["stripe_item_id"],
                quantity=amount
            )
        
        self.logger.log_info(
            tenant_id=self.tenant_id,
            action=f"usage_tracked_{metric.value}",
            metadata={"amount": amount}
        )

    async def can_ingest_data(self, row_count: int) -> bool:
        """Validation logic before a heavy compute/storage operation."""
        sub = await self.get_current_subscription()
        tier = PlanTier(sub.get("tier", "free"))
        limit = TIER_CONFIGS[tier].max_rows_per_dataset
        
        # Check current row count across all datasets
        current_rows_res = self.db.table("datasets").select("row_count").eq("tenant_id", self.tenant_id).execute()
        total_rows = sum(d['row_count'] for d in current_rows_res.data)
        
        if total_rows + row_count > limit:
            return False
        return True

    async def upgrade_tenant(self, new_tier: PlanTier):
        """Programmatic upgrade (usually triggered by Stripe Webhook)."""
        self.db.table("subscriptions").update({
            "tier": new_tier.value,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("tenant_id", self.tenant_id).execute()
        
        self.logger.log_info(
            tenant_id=self.tenant_id,
            action="subscription_upgraded",
            metadata={"new_tier": new_tier.value}
        )