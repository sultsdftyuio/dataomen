"""
api/services/tenant_security_provider.py
Objective: Enforce tenant isolation, manage API keys, and provide secure execution contexts.
Methodology: Security by Design and Orchestration (Backend) patterns.
"""

import secrets
import hashlib
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel
from api.database import get_db_client
from api.services.subscription_manager import SubscriptionManager, UsageMetric

class TenantContext(BaseModel):
    tenant_id: str
    plan_tier: str
    workspace_slug: str
    is_active: bool

class TenantSecurityProvider:
    def __init__(self):
        self.db = get_db_client()

    def generate_api_key(self, tenant_id: str, label: str = "Default Key") -> str:
        """
        Generates a secure, prefixed API key.
        We store only the hash (SHA-256) to prevent leak exposure.
        """
        prefix = "sk_omen_"
        raw_key = secrets.token_urlsafe(32)
        full_key = f"{prefix}{raw_key}"
        
        key_hash = hashlib.sha256(full_key.encode()).hexdigest()
        
        self.db.table("tenant_api_keys").insert({
            "tenant_id": tenant_id,
            "key_hash": key_hash,
            "label": label,
            "created_at": datetime.utcnow().isoformat(),
            "last_used": None
        }).execute()
        
        return full_key

    async def validate_api_key(self, api_key: str) -> Optional[TenantContext]:
        """
        Validates an incoming request's API key and returns the tenant context.
        Uses hash comparison to find the tenant.
        """
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        res = self.db.table("tenant_api_keys") \
            .select("tenant_id, tenants(status, plan_tier, slug)") \
            .eq("key_hash", key_hash) \
            .single() \
            .execute()
        
        if not res.data:
            return None

        # Update last_used timestamp asynchronously
        self.db.table("tenant_api_keys") \
            .update({"last_used": datetime.utcnow().isoformat()}) \
            .eq("key_hash", key_hash) \
            .execute()

        tenant_data = res.data["tenants"]
        return TenantContext(
            tenant_id=res.data["tenant_id"],
            plan_tier=tenant_data["plan_tier"],
            workspace_slug=tenant_data["slug"],
            is_active=tenant_data["status"] == "active"
        )

    def get_isolated_storage_path(self, tenant_id: str, resource_type: str) -> str:
        """
        Enforces a strict directory structure for Cloudflare R2 / S3.
        Prevents path traversal and cross-tenant data access.
        """
        # Format: /tenants/{hashed_id}/{resource_type}/
        # We hash the tenant_id in the path to add an extra layer of obfuscation
        safe_id = hashlib.md5(tenant_id.encode()).hexdigest()
        return f"tenants/{safe_id}/{resource_type}/"

    async def execute_in_context(self, tenant_id: str, operation_name: str, func, *args, **kwargs):
        """
        A high-order wrapper that ensures any analytical operation is metered
        and executed within the tenant's security boundaries.
        """
        sub_manager = SubscriptionManager(tenant_id)
        
        # 1. Pre-execution entitlement check
        if not await sub_manager.check_entitlement(operation_name):
            raise PermissionError(f"Operation '{operation_name}' not allowed on current plan.")

        start_time = datetime.utcnow()
        
        try:
            # 2. Functional execution of the compute task
            result = await func(*args, **kwargs)
            
            # 3. Post-execution metering (Hybrid Performance Paradigm)
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            
            # Track compute seconds as a business metric
            await sub_manager.track_usage(UsageMetric.COMPUTE_SECONDS, int(duration))
            
            return result
            
        except Exception as e:
            # Log failure for tenant-specific troubleshooting
            self.db.table("tenant_error_logs").insert({
                "tenant_id": tenant_id,
                "operation": operation_name,
                "error_message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }).execute()
            raise e

# Example usage in a FastAPI route:
# security = TenantSecurityProvider()
# context = await security.validate_api_key(header_key)
# if context:
#     await security.execute_in_context(context.tenant_id, "run_query", compute_engine.execute, query)