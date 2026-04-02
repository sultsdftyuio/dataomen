"""
ARCLI.TECH - The Zero-ETL Omni-Graph Execution Engine
Component: Multi-Tiered DuckDB Compute Node
Strategy: Priority Queueing, Progressive Hydration, & Vectorized Extraction
"""

import os
import json
import logging
import time
import hashlib
import asyncio
from enum import Enum
from typing import Any, Dict, List, Optional, Union

import polars as pl
import duckdb
from pydantic import BaseModel
import redis.asyncio as redis

# Arcli Infrastructure Services
from api.services.llm_client import llm_client

logger = logging.getLogger(__name__)

# =====================================================================
# TYPE DEFINITIONS & MODELS
# =====================================================================

class QueryPriority(str, Enum):
    P0_INTERACTIVE = "P0"   # Bypasses queue. Sub-second SLA for UI (Caching + Fast Path).
    P1_USER_HEAVY = "P1"    # Enters queue. Omni-Graph joins. Streams partials/skeleton loaders.
    P2_BACKGROUND = "P2"    # Throttled. Autonomous AI Agents & Pulse watchdogs.

class ExecutionResult(BaseModel):
    status: str
    execution_time_ms: float
    row_count: int
    data: List[Dict[str, Any]]
    chart_spec: Optional[Dict[str, Any]] = None
    is_cached: bool = False
    error: Optional[str] = None

# =====================================================================
# EXECUTION ENGINE (Phase 1 Omni-Graph Core)
# =====================================================================

class ExecutionEngine:
    """
    Phase 1: The Zero-ETL Omni-Graph & Phase 0 Priority Queue.
    
    Provides ephemeral compute nodes that query partitioned Parquet files 
    directly from Cloudflare R2. Utilizes Polars for zero-copy vectorized 
    data transfer to the JSON API layer.
    """

    def __init__(self):
        # Cloud Storage Configuration (Cloudflare R2 Optimized)
        self.s3_endpoint = os.environ.get("S3_ENDPOINT", "s3.amazonaws.com").replace("https://", "")
        self.s3_access_key = os.environ.get("AWS_ACCESS_KEY_ID", "")
        self.s3_secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
        self.s3_region = os.environ.get("AWS_REGION", "auto")
        self.is_r2 = "r2.cloudflarestorage" in self.s3_endpoint

        # Redis for Progressive Hydration (Caching) & Queue State
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        self.redis = redis.from_url(redis_url, decode_responses=True)
        
        # Concurrency Semaphores (Multi-Tenant Node Protection)
        self._p1_semaphore = asyncio.Semaphore(5)  # Max 5 concurrent heavy joins per worker
        self._p2_semaphore = asyncio.Semaphore(2)  # Heavily restrict background agents

    def _get_secure_connection(self, tenant_id: str, priority: QueryPriority) -> duckdb.DuckDBPyConnection:
        """
        Initializes an ephemeral, sandboxed DuckDB connection.
        Applies dynamic resource limits based on Query Priority.
        """
        conn = duckdb.connect(database=':memory:', read_only=False)
        
        # Resource Governance based on Tier
        if priority == QueryPriority.P0_INTERACTIVE:
            conn.execute("PRAGMA memory_limit='512MB'")
            conn.execute("PRAGMA threads=1")
        elif priority == QueryPriority.P1_USER_HEAVY:
            conn.execute("PRAGMA memory_limit='2GB'")
            conn.execute("PRAGMA threads=4")
        else: # P2
            conn.execute("PRAGMA memory_limit='256MB'")
            conn.execute("PRAGMA threads=1")
        
        # The Zero-ETL Omni-Graph Magic (httpfs)
        conn.execute("INSTALL httpfs; LOAD httpfs;")
        conn.execute(f"SET s3_region='{self.s3_region}'")
        conn.execute(f"SET s3_access_key_id='{self.s3_access_key}'")
        conn.execute(f"SET s3_secret_access_key='{self.s3_secret_key}'")
        conn.execute(f"SET s3_endpoint='{self.s3_endpoint}'")
        
        if self.is_r2:
            conn.execute("SET s3_url_style='path'")
            
        return conn

    # -----------------------------------------------------------------
    # PROGRESSIVE HYDRATION (Redis Caching Layer)
    # -----------------------------------------------------------------

    def _generate_cache_key(self, tenant_id: str, sql_query: str) -> str:
        """Creates a deterministic hash for query snapshots."""
        sig = f"{tenant_id}_v1_{sql_query}"
        return f"arcli:query_cache:{hashlib.sha256(sig.encode()).hexdigest()}"

    async def _check_cache(self, cache_key: str) -> Optional[ExecutionResult]:
        cached = await self.redis.get(cache_key)
        if cached:
            return ExecutionResult.parse_raw(cached)
        return None

    # -----------------------------------------------------------------
    # MULTI-TIER EXECUTION ROUTER
    # -----------------------------------------------------------------

    async def execute_query(
        self, 
        tenant_id: str, 
        sql_query: str, 
        priority: QueryPriority = QueryPriority.P0_INTERACTIVE,
        chart_spec: Optional[Dict[str, Any]] = None,
        bypass_cache: bool = False
    ) -> ExecutionResult:
        """
        The Master Router. Determines execution path based on Priority Tier.
        """
        cache_key = self._generate_cache_key(tenant_id, sql_query)
        
        # 1. Progressive Hydration (Fast Win)
        if not bypass_cache and priority in (QueryPriority.P0_INTERACTIVE, QueryPriority.P1_USER_HEAVY):
            cached_result = await self._check_cache(cache_key)
            if cached_result:
                logger.info(f"⚡ [{tenant_id}] Cache Hit. Omni-Graph hydration immediate.")
                return cached_result

        # 2. Priority Routing
        if priority == QueryPriority.P0_INTERACTIVE:
            # Sub-second SLA, execute immediately
            result = await self._run_physical_compute(tenant_id, sql_query, priority, chart_spec)
            
        elif priority == QueryPriority.P1_USER_HEAVY:
            # User triggered a heavy cross-join (Omni-Graph). Regulate via Semaphore.
            async with self._p1_semaphore:
                logger.info(f"⏳ [{tenant_id}] P1 Queue cleared. Initiating heavy Omni-Graph join.")
                result = await self._run_physical_compute(tenant_id, sql_query, priority, chart_spec)
                
        elif priority == QueryPriority.P2_BACKGROUND:
            # Pulse agents and LLM background tasks. Throttled to prevent UI starvation.
            async with self._p2_semaphore:
                logger.info(f"🤖 [{tenant_id}] P2 Background agent compute starting.")
                result = await self._run_physical_compute(tenant_id, sql_query, priority, chart_spec)

        # 3. Snapshotting / State Freeze
        if result.status == "success" and priority != QueryPriority.P2_BACKGROUND:
            # Cache UI metrics for 15 minutes to preserve layout stability 
            # and enable Narrative Synthesis snapshots (Phase 2).
            await self.redis.setex(cache_key, 900, result.json())

        return result

    # -----------------------------------------------------------------
    # THE PHYSICAL COMPUTE ENGINE (Polars + DuckDB)
    # -----------------------------------------------------------------

    async def _run_physical_compute(
        self, 
        tenant_id: str, 
        sql_query: str, 
        priority: QueryPriority,
        chart_spec: Optional[Dict[str, Any]]
    ) -> ExecutionResult:
        """
        Executes the raw DuckDB compute and vectorizes outputs directly via Polars 
        to maximize CPU efficiency over standard loops/Pandas.
        """
        start_time = time.perf_counter()
        conn = None
        
        try:
            # DuckDB runs in a thread-pool via asyncio to prevent blocking the FastAPI event loop
            conn = self._get_secure_connection(tenant_id, priority)
            
            # Hybrid Performance Paradigm: 
            # Execute in DuckDB (C++) -> Zero-Copy to Polars (Rust) -> Python Dict
            def _sync_execute():
                return conn.execute(sql_query).pl()

            df = await asyncio.to_thread(_sync_execute)
            
            execution_time = round((time.perf_counter() - start_time) * 1000, 2)
            
            return ExecutionResult(
                status="success",
                execution_time_ms=execution_time,
                row_count=df.height,
                data=df.to_dicts(), # Polars native JSON-ready dictionary output
                chart_spec=chart_spec,
                is_cached=False
            )
            
        except duckdb.Error as e:
            logger.error(f"❌ [{tenant_id}] Omni-Graph Join Error: {str(e)}")
            return ExecutionResult(
                status="error",
                execution_time_ms=round((time.perf_counter() - start_time) * 1000, 2),
                row_count=0,
                data=[],
                error=f"Analytical Engine Error: {str(e)}"
            )
        except Exception as e:
            logger.error(f"❌ [{tenant_id}] System Error: {str(e)}")
            return ExecutionResult(
                status="error",
                execution_time_ms=round((time.perf_counter() - start_time) * 1000, 2),
                row_count=0,
                data=[],
                error="Internal execution fault."
            )
        finally:
            if conn:
                conn.close() # Absolute multi-tenant isolation requirement

# Global Singleton Orchestrator
execution_engine = ExecutionEngine()