"""
api/services/tenant_security_provider.py
Phase 6+: Enterprise Security Router & API Gateway
Objective: Enforce tenant isolation, manage API keys, and provide secure execution contexts.
Methodology: Security by Design, Zero-Trust Architecture, and Async Non-Blocking I/O.
"""

import secrets
import hashlib
import logging
import asyncio
from typing import Optional, Any, Dict, Tuple
from datetime import datetime, timezone, timedelta

from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text

# Import the modernized SaaS billing manager and Organization model
from api.services.subscription_manager import SubscriptionManager,UsageMetric
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
    
    Upgraded Engineering:
    - SOC2 Compliant: Removed MD5 pathing, strictly SHA-256.
    - TTLCache Layer: Prevents database DDoS from high-frequency API polling.
    - Async I/O Offloading: Prevents GIL/Event-Loop blocking on SQLAlchemy commits.
    """

    def __init__(self):
        # Enterprise L1 Memory Cache: Maps hashed_key -> (TenantContext, expires_at)
        # Prevents hitting the DB for every single API request.
        self._key_cache: Dict[str, Tuple[TenantContext, datetime]] = {}
        self._cache_ttl_seconds = 300 # 5 minutes

    def generate_api_key(self, db: Session, tenant_id: str, label: str = "Default Key") -> str:
        """
        Generates a secure, prefixed API key.
        Stores only the SHA-256 hash in the database to prevent leak exposure.
        """
        prefix = "sk_omen_"
        raw_key = secrets.token_urlsafe(32)
        full_key = f"{prefix}{raw_key}"
        
        # Hash immediately. The raw key is NEVER stored in memory longer than this function.
        key_hash = hashlib.sha256(full_key.encode()).hexdigest()
        
        try:
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
            
            logger.info(f"[{tenant_id}] Generated new secure API key.")
            return full_key
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"[{tenant_id}] Failed to generate API key: {e}")
            raise RuntimeError("Could not generate secure API key.")

    def _update_last_used_sync(self, db: Session, key_hash: str) -> None:
        """Synchronous DB operation meant to be run in a thread pool."""
        try:
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
        except SQLAlchemyError as e:
            db.rollback()
            logger.warning(f"Non-critical: Failed to update last_used timestamp: {e}")

    async def validate_api_key(self, db: Session, api_key: str) -> Optional[TenantContext]:
        """
        Validates an incoming request's API key via L1 Cache -> L2 Database.
        """
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        now = datetime.now(timezone.utc)
        
        # 1. Check ultra-fast memory cache (bypasses DB entirely)
        if key_hash in self._key_cache:
            context, expires_at = self._key_cache[key_hash]
            if now < expires_at:
                return context
            else:
                del self._key_cache[key_hash]

        try:
            # 2. Cache Miss: Execute DB query in a separate thread to prevent Event Loop blocking
            query = text("""
                SELECT k.tenant_id, o.subscription_tier, o.name 
                FROM tenant_api_keys k
                JOIN organizations o ON k.tenant_id = o.id
                WHERE k.key_hash = :key_hash
            """)
            
            def _fetch():
                return db.execute(query, {"key_hash": key_hash}).fetchone()
                
            result = await asyncio.to_thread(_fetch)
            
            if not result:
                return None

            context = TenantContext(
                tenant_id=result.tenant_id,
                subscription_tier=result.subscription_tier,
                workspace_name=result.name,
                is_active=True
            )

            # 3. Populate L1 Cache
            self._key_cache[key_hash] = (context, now + timedelta(seconds=self._cache_ttl_seconds))

            # 4. Fire-and-forget: Update analytics timestamp without blocking the response
            asyncio.create_task(asyncio.to_thread(self._update_last_used_sync, db, key_hash))

            return context
            
        except Exception as e:
            logger.error(f"API Key validation critical failure: {e}")
            return None

    def get_isolated_storage_path(self, tenant_id: str, resource_type: str) -> str:
        """
        Enforces a strict directory structure for Cloudflare R2 / AWS S3.
        SOC2 Compliance: Upgraded from MD5 to SHA-256 for path hashing.
        """
        safe_id = hashlib.sha256(tenant_id.encode()).hexdigest()
        return f"tenants/{safe_id}/{resource_type}/"

    async def execute_in_context(self, db: Session, tenant_id: str, operation_name: str, func, *args, **kwargs) -> Any:
        """
        A high-order wrapper that ensures any analytical operation is metered
        and executed strictly within the tenant's security boundaries.
        """
        sub_manager = SubscriptionManager(db, tenant_id)
        
        # 1. Pre-execution entitlement check
        if not sub_manager.check_entitlement(operation_name):
            logger.warning(f"[{tenant_id}] Operation blocked: '{operation_name}' quota exceeded.")
            raise PermissionError(f"Operation '{operation_name}' not allowed or quota exceeded on current plan.")

        start_time = datetime.now(timezone.utc)
        
        try:
            # 2. Functional execution of the compute task
            result = await func(*args, **kwargs)
            
            # 3. Post-execution metering (Hybrid Performance Paradigm)
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()
            
            # Asynchronously track usage to prevent execution blocking
            await sub_manager.track_usage(UsageMetric.COMPUTE_SECONDS, duration)
            await sub_manager.track_usage(UsageMetric.QUERIES, 1)
            
            return result
            
        except Exception as e:
            # 4. Asynchronous Error Logging
            # Offload the blocking SQLAlchemy commit to a thread
            def _log_error():
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
                    logger.error(f"[{tenant_id}] Failed to write to tenant_error_logs")

            asyncio.create_task(asyncio.to_thread(_log_error))
            
            logger.error(f"[{tenant_id}] Contextual execution failed on '{operation_name}': {str(e)}")
            raise e

# Global singleton
tenant_security = TenantSecurityProvider()