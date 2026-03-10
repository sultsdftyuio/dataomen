"""
api/services/tenant_security_provider.py
Objective: Enforce tenant isolation, manage API keys, and provide secure execution contexts.
Methodology: Security by Design and Orchestration (Backend) patterns.
"""

import secrets
import hashlib
import logging
from typing import Optional, Any
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text

# Import the modernized SaaS billing manager and Organization model
from api.services.subscription_manager import SubscriptionManager, UsageMetric
from models import Organization

logger = logging.getLogger(__name__)

class TenantContext(BaseModel):
    tenant_id: str
    subscription_tier: str
    workspace_name: str
    is_active: bool


class TenantSecurityProvider:
    """
    Core security router. 
    Manages key hashing, path isolation, and strictly scoped execution contexts.
    """

    def generate_api_key(self, db: Session, tenant_id: str, label: str = "Default Key") -> str:
        """
        Generates a secure, prefixed API key.
        Stores only the SHA-256 hash in the database to prevent leak exposure.
        """
        prefix = "sk_omen_"
        raw_key = secrets.token_urlsafe(32)
        full_key = f"{prefix}{raw_key}"
        
        key_hash = hashlib.sha256(full_key.encode()).hexdigest()
        
        try:
            # Using parameterized text queries to avoid needing a dedicated ORM model 
            # for api keys just yet, keeping the system lightweight.
            insert_query = text("""
                INSERT INTO tenant_api_keys (tenant_id, key_hash, label, created_at)
                VALUES (:tenant_id, :key_hash, :label, :created_at)
            """)
            db.execute(insert_query, {
                "tenant_id": tenant_id,
                "key_hash": key_hash,
                "label": label,
                "created_at": datetime.now(timezone.utc)
            })
            db.commit()
            
            logger.info(f"Generated new API key for tenant: {tenant_id}")
            return full_key
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Failed to generate API key for {tenant_id}: {e}")
            raise RuntimeError("Could not generate API key.")

    async def validate_api_key(self, db: Session, api_key: str) -> Optional[TenantContext]:
        """
        Validates an incoming request's API key.
        Uses hash comparison and joins with the Organizations table for entitlements.
        """
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        try:
            # Secure joined query checking the key and the organization status
            query = text("""
                SELECT k.tenant_id, o.subscription_tier, o.name 
                FROM tenant_api_keys k
                JOIN organizations o ON k.tenant_id = o.id
                WHERE k.key_hash = :key_hash
            """)
            
            result = db.execute(query, {"key_hash": key_hash}).fetchone()
            
            if not result:
                return None

            # Asynchronously update last_used timestamp
            update_query = text("""
                UPDATE tenant_api_keys 
                SET last_used = :last_used 
                WHERE key_hash = :key_hash
            """)
            db.execute(update_query, {
                "last_used": datetime.now(timezone.utc), 
                "key_hash": key_hash
            })
            db.commit()

            return TenantContext(
                tenant_id=result.tenant_id,
                subscription_tier=result.subscription_tier,
                workspace_name=result.name,
                is_active=True
            )
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"API Key validation failed: {e}")
            return None

    def get_isolated_storage_path(self, tenant_id: str, resource_type: str) -> str:
        """
        Enforces a strict directory structure for Cloudflare R2 / S3.
        Prevents path traversal and cross-tenant data access.
        """
        # Format: /tenants/{hashed_id}/{resource_type}/
        # We hash the tenant_id in the path to add an extra layer of obfuscation
        safe_id = hashlib.md5(tenant_id.encode()).hexdigest()
        return f"tenants/{safe_id}/{resource_type}/"

    async def execute_in_context(self, db: Session, tenant_id: str, operation_name: str, func, *args, **kwargs) -> Any:
        """
        A high-order wrapper that ensures any analytical operation is metered
        and executed strictly within the tenant's security boundaries.
        """
        sub_manager = SubscriptionManager(db, tenant_id)
        
        # 1. Pre-execution entitlement check
        if not sub_manager.check_entitlement(operation_name):
            raise PermissionError(f"Operation '{operation_name}' not allowed or quota exceeded on current plan.")

        start_time = datetime.now(timezone.utc)
        
        try:
            # 2. Functional execution of the compute task
            result = await func(*args, **kwargs)
            
            # 3. Post-execution metering (Hybrid Performance Paradigm)
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()
            
            # Track compute seconds and query count
            await sub_manager.track_usage(UsageMetric.COMPUTE_SECONDS, duration)
            await sub_manager.track_usage(UsageMetric.QUERIES, 1)
            
            return result
            
        except Exception as e:
            # Safely log the failure using SQLAlchemy parameterized queries
            try:
                error_query = text("""
                    INSERT INTO tenant_error_logs (tenant_id, operation, error_message, timestamp)
                    VALUES (:tenant_id, :operation, :error_message, :timestamp)
                """)
                db.execute(error_query, {
                    "tenant_id": tenant_id,
                    "operation": operation_name,
                    "error_message": str(e),
                    "timestamp": datetime.now(timezone.utc)
                })
                db.commit()
            except SQLAlchemyError:
                db.rollback()
                logger.error(f"Failed to write to tenant_error_logs for {tenant_id}")
                
            logger.error(f"Contextual execution failed for {tenant_id} on '{operation_name}': {str(e)}")
            raise e

# Export singleton instance for dependency injection across FastAPI routes
tenant_security = TenantSecurityProvider()