# api/services/subscription_manager.py

import logging
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from models import Organization, SubscriptionTier

logger = logging.getLogger(__name__)

class UsageMetric(str, Enum):
    COMPUTE_SECONDS = "COMPUTE_SECONDS"
    QUERIES = "QUERIES"
    STORAGE_MB = "STORAGE_MB"

class SubscriptionManager:
    """
    Enforces usage guardrails and SaaS entitlements based on the Organization's tier.
    Uses SQLAlchemy for atomic transaction management.
    """
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id

    def check_entitlement(self, operation_name: str) -> bool:
        """
        Validates if the tenant has enough quota to perform the requested operation.
        """
        org = self.db.query(Organization).filter(Organization.id == self.tenant_id).first()
        
        if not org:
            logger.error(f"Entitlement check failed: Organization {self.tenant_id} not found.")
            return False

        # Enterprise ignores standard limits
        if org.subscription_tier == SubscriptionTier.ENTERPRISE:
            return True

        # Example metric routing based on operation
        if operation_name in ["run_query", "ml_pipeline"]:
            return org.current_month_queries < org.monthly_query_limit
            
        return True

    async def track_usage(self, metric: UsageMetric, amount: float = 1.0):
        """
        Atomically updates the organization's usage metrics in the database.
        """
        try:
            org = self.db.query(Organization).filter(Organization.id == self.tenant_id).first()
            if not org:
                raise ValueError("Organization not found.")

            if metric == UsageMetric.QUERIES:
                org.current_month_queries += int(amount)
            elif metric == UsageMetric.STORAGE_MB:
                org.current_storage_mb += amount

            self.db.commit()
            logger.debug(f"[{self.tenant_id}] Usage tracked: {metric.value} += {amount}")

        except SQLAlchemyError as e:
            self.db.rollback()
            logger.error(f"Failed to track usage for {self.tenant_id}: {e}")
            raise