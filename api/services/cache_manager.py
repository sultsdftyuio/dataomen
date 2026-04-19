# api/services/cache_manager.py

import os
import json
import logging
import hashlib
import time
from typing import Optional, Any, Dict
from cachetools import LRUCache

# Standard async Redis client (Compatible with Vercel KV and Upstash)
import redis.asyncio as redis
from redis.exceptions import RedisError

# Import our data contracts so we can serialize/deserialize them
from api.services.query_planner import QueryPlan
from api.services.insight_orchestrator import InsightPayload

logger = logging.getLogger(__name__)

class CacheManager:
    """
    Enterprise Scale & Resilient Caching Layer.
    
    Features:
    - Feature-Flagged Redis functionality (Cost-saving mode for early stages)
    - Circuit Breaker Pattern for Graceful Degradation
    - LRU Local Memory Fallback (Prevents OOM Memory Leaks)
    - Strict Tenant Isolation via namespacing
    """

    def __init__(self):
        # EXPLICIT TOGGLE: Set USE_REDIS="true" in env to enable distributed caching.
        # Defaults to False to save connections/costs while user base is small.
        self.use_redis = os.getenv("USE_REDIS", "false").lower() in ("true", "1", "t", "yes")
        
        # Initialize connection to Vercel KV / Upstash Redis securely via environment variables
        redis_url = os.getenv("REDIS_URL") or os.getenv("KV_URL") or os.getenv("UPSTASH_REDIS_REST_URL")
        
        self.DEFAULT_TTL_SECONDS = 60 * 60 * 24  # 24 hours
        
        # Local LRU Fallback (Max 1000 items to prevent memory leaks in the ASGI worker)
        self._local_cache = LRUCache(maxsize=1000)
        
        # Circuit Breaker state
        self._circuit_open = False
        self._circuit_recovery_time = 0
        self._CIRCUIT_COOLDOWN = 60  # wait 60 seconds before retrying Redis
        
        self.enabled = self.use_redis and bool(redis_url)
        
        if not self.enabled:
            if not self.use_redis:
                logger.info("CACHE_MANAGER: Redis is explicitly disabled via USE_REDIS flag. Operating purely on Local LRU Cache.")
            else:
                logger.warning("CACHE_MANAGER: USE_REDIS is true, but no Redis URL found. Falling back to Local LRU Cache.")
            self.redis = None
        else:
            logger.info("CACHE_MANAGER: Initializing Distributed Redis Cache...")
            self.redis = redis.from_url(
                redis_url, 
                encoding="utf-8", 
                decode_responses=True,
                socket_timeout=1.5,  # Aggressive timeout to prevent API blocking
                socket_connect_timeout=1.5
            )

    def _is_redis_healthy(self) -> bool:
        """Implements the Circuit Breaker pattern to protect the API."""
        if not self.enabled:
            return False
            
        if self._circuit_open:
            if time.time() > self._circuit_recovery_time:
                logger.info("Circuit Breaker: Half-open, attempting Redis reconnection.")
                self._circuit_open = False
            else:
                return False
        return True

    def _trip_circuit(self, error: Exception):
        """Trips the circuit breaker, shifting all load to the LRU cache."""
        logger.error(f"Circuit Breaker TRIPPED due to Redis failure: {str(error)}")
        self._circuit_open = True
        self._circuit_recovery_time = time.time() + self._CIRCUIT_COOLDOWN

    def _generate_cache_key(self, tenant_id: str, dataset_id: str, prompt: str) -> str:
        """
        Creates a deterministic, tenant-isolated SHA-256 hash.
        Format: dataomen:cache:{tenant_id}:{dataset_id}:{hash}
        """
        normalized_prompt = prompt.strip().lower()
        query_hash = hashlib.sha256(normalized_prompt.encode()).hexdigest()
        return f"dataomen:cache:{tenant_id}:{dataset_id}:{query_hash}"

    def _generate_generic_key(self, key: str) -> str:
        """Namespaced key for generic router/state cache entries."""
        return f"dataomen:generic:{key}"

    async def get(self, key: str) -> Optional[Any]:
        """
        Generic cache get used by routing/state services.
        Returns deserialized JSON payload when available.
        """
        namespaced_key = self._generate_generic_key(key)

        if self._is_redis_healthy():
            try:
                cached_data = await self.redis.get(namespaced_key)
                if cached_data is not None:
                    try:
                        return json.loads(cached_data)
                    except Exception:
                        return cached_data
            except RedisError as e:
                self._trip_circuit(e)

        cached_local = self._local_cache.get(namespaced_key)
        if cached_local:
            if time.time() < cached_local["expires_at"]:
                return cached_local["data"]
            del self._local_cache[namespaced_key]

        return None

    async def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        """
        Generic cache set used by routing/state services.
        Defaults to global TTL when `ttl_seconds` is not provided.
        """
        ttl = ttl_seconds or self.DEFAULT_TTL_SECONDS
        namespaced_key = self._generate_generic_key(key)

        self._local_cache[namespaced_key] = {
            "expires_at": time.time() + ttl,
            "data": value,
        }

        if self._is_redis_healthy():
            try:
                await self.redis.setex(
                    name=namespaced_key,
                    time=ttl,
                    value=json.dumps(value, default=str),
                )
            except RedisError as e:
                self._trip_circuit(e)

    async def get_cached_insight(self, tenant_id: str, dataset_id: str, prompt: str) -> Optional[Dict[str, Any]]:
        """
        Action 4.1: Retrieve the entire execution pipeline in O(1) time.
        Falls back to local LRU if Redis is down or disabled.
        """
        key = self._generate_cache_key(tenant_id, dataset_id, prompt)
        
        # 1. Try Redis first (if enabled and healthy)
        if self._is_redis_healthy():
            try:
                cached_data = await self.redis.get(key)
                if cached_data:
                    logger.info(f"[{tenant_id}] Redis Cache HIT for dataset {dataset_id}")
                    return json.loads(cached_data)
            except RedisError as e:
                self._trip_circuit(e)
                
        # 2. Try Local LRU Fallback
        cached_local = self._local_cache.get(key)
        if cached_local:
            # Validate TTL manually for local cache
            if time.time() < cached_local["expires_at"]:
                logger.info(f"[{tenant_id}] Local LRU Cache HIT for dataset {dataset_id}")
                return cached_local["data"]
            else:
                del self._local_cache[key] # Evict expired

        logger.info(f"[{tenant_id}] Cache MISS for query on dataset {dataset_id}")
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
        Stores pipeline results. Defaults to Local LRU Cache, 
        shadowing to Redis only if it is enabled and healthy.
        """
        key = self._generate_cache_key(tenant_id, dataset_id, prompt)
        
        cache_payload = {
            "sql_query": sql_query,
            "chart_spec": chart_spec,
            "insight_payload": insight_payload.model_dump(),
            "narrative": narrative,
            "is_cached": True
        }
        
        # 1. Always write to Local LRU Cache (Fastest retrieval for the active worker)
        self._local_cache[key] = {
            "expires_at": time.time() + self.DEFAULT_TTL_SECONDS,
            "data": cache_payload
        }
        
        # 2. Write to Distributed Redis (if enabled and healthy)
        if self._is_redis_healthy():
            try:
                await self.redis.setex(
                    name=key,
                    time=self.DEFAULT_TTL_SECONDS,
                    value=json.dumps(cache_payload)
                )
            except RedisError as e:
                self._trip_circuit(e)

    async def invalidate_dataset_cache(self, tenant_id: str, dataset_id: str) -> int:
        """
        Action 4.2: The Cache Buster. Purges both Redis and Local caches.
        """
        pattern = f"dataomen:cache:{tenant_id}:{dataset_id}:*"
        keys_deleted = 0
        
        # 1. Clear Local LRU (O(N) search on small local dict)
        keys_to_remove = [k for k in self._local_cache.keys() if k.startswith(f"dataomen:cache:{tenant_id}:{dataset_id}:")]
        for k in keys_to_remove:
            del self._local_cache[k]
        keys_deleted += len(keys_to_remove)

        # 2. Clear Redis (if enabled)
        if self._is_redis_healthy():
            try:
                cursor = '0'
                redis_keys_to_delete = []
                
                while cursor != 0:
                    # using count=100 prevents blocking the event loop on huge datasets
                    cursor, keys = await self.redis.scan(cursor=cursor, match=pattern, count=100)
                    redis_keys_to_delete.extend(keys)
                    
                if redis_keys_to_delete:
                    await self.redis.delete(*redis_keys_to_delete)
                    keys_deleted += len(redis_keys_to_delete)
                    
            except RedisError as e:
                self._trip_circuit(e)

        logger.info(f"[{tenant_id}] Cache Invalidation: Busted {keys_deleted} queries for dataset {dataset_id}")
        return keys_deleted

# Global Singleton to manage connection pooling across the ASGI app
cache_manager = CacheManager()