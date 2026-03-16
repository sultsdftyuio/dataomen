import os
import json
import logging
import hashlib
from typing import Optional, Any, Dict
from pydantic import BaseModel

# Standard async Redis client (Compatible with Vercel KV and Upstash)
import redis.asyncio as redis
from redis.exceptions import RedisError

# Import our data contracts so we can serialize/deserialize them
from api.services.query_planner import QueryPlan
from api.services.insight_orchestrator import InsightPayload

logger = logging.getLogger(__name__)

class CacheManager:
    """
    Phase 4: Enterprise Scale & Caching.
    
    Handles high-speed retrieval of previously computed SQL and Mathematical Insights.
    Enforces strict tenant isolation via Redis key prefixing and implements 
    graceful degradation if the KV store is unreachable.
    """

    def __init__(self):
        # Initialize connection to Vercel KV / Upstash Redis securely via environment variables
        redis_url = os.getenv("KV_URL") or os.getenv("UPSTASH_REDIS_REST_URL")
        
        self.enabled = bool(redis_url)
        if not self.enabled:
            logger.warning("No Redis URL found in environment. Caching is globally disabled.")
            self.redis = None
        else:
            # Using connection pooling to handle massive concurrent dashboard loads
            self.redis = redis.from_url(
                redis_url, 
                encoding="utf-8", 
                decode_responses=True,
                socket_timeout=2.0 # Fast fail to avoid blocking the API if Redis hangs
            )
            
        # Default Time-To-Live for analytical queries (e.g., 24 hours)
        self.DEFAULT_TTL_SECONDS = 60 * 60 * 24

    # -------------------------------------------------------------------------
    # Core Caching Logic
    # -------------------------------------------------------------------------

    def _generate_cache_key(self, tenant_id: str, dataset_id: str, prompt: str) -> str:
        """
        Creates a deterministic, tenant-isolated SHA-256 hash for the query.
        Format: dataomen:cache:{tenant_id}:{dataset_id}:{hash}
        """
        # Lowercase and strip to ensure "What is MRR?" and "what is mrr? " hit the same cache
        normalized_prompt = prompt.strip().lower()
        query_hash = hashlib.sha256(normalized_prompt.encode()).hexdigest()
        return f"dataomen:cache:{tenant_id}:{dataset_id}:{query_hash}"

    async def get_cached_insight(self, tenant_id: str, dataset_id: str, prompt: str) -> Optional[Dict[str, Any]]:
        """
        Action 4.1: Retrieve the entire execution pipeline (SQL + Data + Insight) in O(1) time.
        """
        if not self.enabled:
            return None

        key = self._generate_cache_key(tenant_id, dataset_id, prompt)
        
        try:
            cached_data = await self.redis.get(key)
            if cached_data:
                logger.info(f"[{tenant_id}] Cache HIT for query on dataset {dataset_id}")
                return json.loads(cached_data)
                
            logger.info(f"[{tenant_id}] Cache MISS for query on dataset {dataset_id}")
            return None
            
        except RedisError as e:
            # Graceful Degradation: Log and bypass the cache without failing the user request
            logger.error(f"[{tenant_id}] Redis cache retrieval failed: {str(e)}")
            return None

    async def set_cached_insight(
        self, 
        tenant_id: str, 
        dataset_id: str, 
        prompt: str, 
        sql_query: str,
        chart_spec: Optional[Dict[str, Any]],
        insight_payload: InsightPayload,
        narrative: Dict[str, Any]
    ) -> None:
        """
        Stores the final results of the multi-step AI pipeline so subsequent exact 
        questions instantly render the dashboard without hitting the LLM or Warehouse.
        """
        if not self.enabled:
            return

        key = self._generate_cache_key(tenant_id, dataset_id, prompt)
        
        # Package the entire response state
        cache_payload = {
            "sql_query": sql_query,
            "chart_spec": chart_spec,
            "insight_payload": insight_payload.model_dump(),
            "narrative": narrative,
            "is_cached": True
        }
        
        try:
            # Store in Redis with an expiration to ensure data freshness
            await self.redis.setex(
                name=key,
                time=self.DEFAULT_TTL_SECONDS,
                value=json.dumps(cache_payload)
            )
            logger.info(f"[{tenant_id}] Successfully cached pipeline output for dataset {dataset_id}")
        except RedisError as e:
            logger.error(f"[{tenant_id}] Redis cache write failed: {str(e)}")

    # -------------------------------------------------------------------------
    # Cache Invalidation (Webhooks)
    # -------------------------------------------------------------------------

    async def invalidate_dataset_cache(self, tenant_id: str, dataset_id: str) -> int:
        """
        Action 4.2: The Cache Buster.
        When a background sync (e.g., Fivetran or DataOmen SyncEngine) completes a daily load,
        we MUST purge all cached queries for that dataset so the UI doesn't show stale data.
        """
        if not self.enabled:
            return 0

        # Pattern to find all queries related to this specific dataset and tenant
        pattern = f"dataomen:cache:{tenant_id}:{dataset_id}:*"
        
        try:
            # SCAN is non-blocking in Redis, whereas KEYS can freeze the cluster on massive instances
            cursor = '0'
            keys_to_delete = []
            
            while cursor != 0:
                cursor, keys = await self.redis.scan(cursor=cursor, match=pattern, count=100)
                keys_to_delete.extend(keys)
                
            if keys_to_delete:
                # Delete all found keys in a single pipeline transaction
                await self.redis.delete(*keys_to_delete)
                logger.info(f"[{tenant_id}] Cache Invalidation: Busted {len(keys_to_delete)} stale queries for dataset {dataset_id}")
                
            return len(keys_to_delete)
            
        except RedisError as e:
            logger.error(f"[{tenant_id}] Cache invalidation failed for dataset {dataset_id}: {str(e)}")
            return 0

# Global Singleton to manage connection pooling across the ASGI app
cache_manager = CacheManager()