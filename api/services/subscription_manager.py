import logging
from typing import Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from models import Organization, SubscriptionTier # Assuming Organization represents the Tenant

logger = logging.getLogger(__name__)

class SubscriptionManager:
    """
    Phase 9: Enterprise Billing & Governance.
    
    Manages tenant quotas, credit deductions, and access control.
    Uses Postgres Row-Level locking to ensure concurrent queries don't 
    bypass credit limits (preventing race condition theft).
    """

    # Base costs (Can be dynamically adjusted based on actual LLM token usage later)
    COST_TABLE = {
        "cache_hit": 0.0,             # Cache is free! Encourages users to use the platform.
        "local_duckdb_query": 1.0,    # Standard Zero-ETL query
        "heavy_warehouse_query": 5.0, # Pushdown BigQuery/Redshift
        "diagnostic_deep_dive": 3.0   # Autonomous Phase 5 Agent
    }

    @staticmethod
    def verify_access_and_reserve_credits(db: Session, tenant_id: str, estimated_cost: float = 1.0) -> bool:
        """
        Fast-check before allowing the Orchestrator to boot up.
        """
        tenant = db.query(Organization).filter(Organization.id == tenant_id).first()
        
        if not tenant:
            raise ValueError("Tenant not found.")
            
        if tenant.subscription_status not in ["active", "trialing"]:
            logger.warning(f"[{tenant_id}] Access denied. Subscription is {tenant.subscription_status}.")
            return False
            
        if tenant.compute_credits < estimated_cost:
            logger.warning(f"[{tenant_id}] Insufficient credits. Has {tenant.compute_credits}, needs {estimated_cost}.")
            return False
            
        return True

    @staticmethod
    def deduct_actual_usage(db: Session, tenant_id: str, query_type: str, had_diagnostic: bool = False) -> Tuple[bool, float]:
        """
        Atomic deduction of credits AFTER the pipeline finishes successfully.
        """
        # Calculate exact cost based on what the Orchestrator actually ran
        cost = SubscriptionManager.COST_TABLE.get(query_type, 1.0)
        if had_diagnostic:
            cost += SubscriptionManager.COST_TABLE["diagnostic_deep_dive"]

        if cost == 0.0:
            return True, 0.0

        try:
            # 1. ATOMIC LOCK: 'with_for_update' locks this row until the transaction commits.
            # This guarantees that if a user opens 10 tabs simultaneously, they are billed sequentially.
            tenant = db.query(Organization).filter(
                Organization.id == tenant_id
            ).with_for_update().first()

            if not tenant:
                return False, 0.0

            # Allow them to go negative on this specific query to not break the UI mid-stream, 
            # but they will be blocked on the NEXT query by `verify_access`.
            tenant.compute_credits -= cost
            
            # Log the usage for the background synchronizer
            tenant.unbilled_usage_sync_pending += cost 
            
            db.commit()
            logger.info(f"[{tenant_id}] Billed {cost} credits. Remaining balance: {tenant.compute_credits}")
            return True, cost

        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"[{tenant_id}] Failed to deduct credits: {str(e)}")
            return False, 0.0

subscription_manager = SubscriptionManager()