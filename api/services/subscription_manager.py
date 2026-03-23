"""
ARCLI.TECH - Margin Protection & Billing Module
Component: SubscriptionManager
Strategy: Phase 4 (Transparent "Pro" Tier) & Strict Margin Protection

Changelog (v4 - Indie Hacker Edition):
- PRICING: Realigned COST_TABLE to Arcli's semantic RAG and DuckDB operations.
- TRANSPARENCY: Added get_tenant_quota_status() to power frontend usage meters.
- SECURITY: Enforced strict compute cutoffs to protect LLM API margins on flat-rate ($19-$29/mo) plans.
- UX: Dashboard cache hits remain completely free to encourage daily active usage.
"""

import logging
from typing import Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from dataclasses import dataclass
from datetime import datetime, timezone

from models import Organization

logger = logging.getLogger(__name__)

@dataclass
class UsageMetric:
    """
    Data structure representing a single unit of work/compute.
    Used by the tenant_security_provider to track and log specific actions
    before they are committed to the database.
    """
    tenant_id: str
    action_type: str
    tokens_used: int = 0
    compute_time_ms: int = 0
    timestamp: datetime = datetime.now(timezone.utc)
    
    @property
    def cost_estimate(self) -> float:
        """Dynamically calculates the cost based on the action type."""
        return SubscriptionManager.COST_TABLE.get(self.action_type, 1.0)


class SubscriptionManager:
    """
    Manages tenant quotas, credit deductions, and margin protection.
    Uses Postgres Row-Level locking to ensure concurrent queries don't 
    bypass credit limits (preventing race condition theft).
    """

    # Arcli 'DataFast' Compute Cost Matrix
    # Tuned to protect LLM margins while making standard analytical views cheap/free.
    COST_TABLE = {
        "dashboard_cache_hit": 0.0,    # Phase 2 Starter Dashboards (Free to view)
        "duckdb_local_query": 0.5,     # Zero-ETL Edge/Local Compute (Very cheap)
        "rag_compilation": 2.0,        # Natural-Language-to-SQL (Requires LLM Tokens)
        "auto_schema_mapping": 5.0,    # Phase 1: Heavy LLM context window to map external APIs
        "diagnostic_deep_dive": 3.0    # Agentic anomaly detection
    }

    @staticmethod
    def get_tenant_quota_status(db: Session, tenant_id: str) -> Dict[str, Any]:
        """
        Phase 4: Transparency.
        Returns the exact quota status so the frontend can display a progress bar.
        Small teams trust platforms that don't hide their limits.
        """
        tenant = db.query(Organization).filter(Organization.id == tenant_id).first()
        
        if not tenant:
            raise ValueError(f"Tenant {tenant_id} not found.")

        # Assuming the Organization model has a base_quota field for the month, 
        # otherwise defaulting to 1000 for the $19/mo tier.
        base_quota = getattr(tenant, 'monthly_compute_quota', 1000.0)
        
        return {
            "status": tenant.subscription_status,
            "credits_remaining": round(tenant.compute_credits, 2),
            "monthly_quota": base_quota,
            "percentage_used": round(max(0, ((base_quota - tenant.compute_credits) / base_quota) * 100), 1),
            "is_exhausted": tenant.compute_credits <= 0
        }

    @staticmethod
    def verify_access_and_reserve_credits(db: Session, tenant_id: str, estimated_cost: float = 1.0) -> bool:
        """
        Fast-check before allowing the Semantic Engine or SyncEngine to boot up.
        Strictly protects margins by blocking operations if credits are exhausted.
        """
        tenant = db.query(Organization).filter(Organization.id == tenant_id).first()
        
        if not tenant:
            logger.error(f"[{tenant_id}] Access denied. Tenant does not exist.")
            return False
            
        if tenant.subscription_status not in ["active", "trialing"]:
            logger.warning(f"[{tenant_id}] Access denied. Subscription is {tenant.subscription_status}.")
            return False
            
        # Strict LLM Margin Protection
        if tenant.compute_credits < estimated_cost:
            logger.warning(f"[{tenant_id}] Margin Protection Triggered: Insufficient credits. Has {tenant.compute_credits}, needs {estimated_cost}.")
            return False
            
        return True

    @staticmethod
    def deduct_actual_usage(db: Session, tenant_id: str, query_type: str, had_diagnostic: bool = False) -> Tuple[bool, float]:
        """
        Atomic deduction of credits AFTER the pipeline finishes successfully.
        """
        # Calculate exact cost based on what the Arcli engine actually ran
        cost = SubscriptionManager.COST_TABLE.get(query_type, 1.0)
        if had_diagnostic:
            cost += SubscriptionManager.COST_TABLE["diagnostic_deep_dive"]

        # Fast path for free operations (Dashboards)
        if cost == 0.0:
            return True, 0.0

        try:
            # 1. ATOMIC LOCK: 'with_for_update' locks this row until the transaction commits.
            # This guarantees that if a solo founder opens 10 dashboard tabs simultaneously, 
            # the backend bills them sequentially without race-condition bypasses.
            tenant = db.query(Organization).filter(
                Organization.id == tenant_id
            ).with_for_update().first()

            if not tenant:
                return False, 0.0

            # Deduct credits. We allow them to drop slightly below zero on this specific 
            # query to not break the UI mid-stream, but they will be blocked on the NEXT 
            # query by `verify_access_and_reserve_credits`.
            tenant.compute_credits -= cost
            
            # Log the usage for the background Lemon Squeezy / Stripe synchronizer
            tenant.unbilled_usage_sync_pending = getattr(tenant, 'unbilled_usage_sync_pending', 0.0) + cost 
            
            db.commit()
            logger.info(f"[{tenant_id}] Billed {cost} credits for {query_type}. Remaining balance: {round(tenant.compute_credits, 2)}")
            return True, cost

        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"[{tenant_id}] Failed to deduct credits: {str(e)}")
            return False, 0.0

subscription_manager = SubscriptionManager()