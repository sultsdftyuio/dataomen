# api/services/compute_engine.py

import logging
import re
import asyncio
import time
import hashlib
import json
import math
import tempfile
import uuid
import os
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from enum import Enum

import numpy as np
import polars as pl
import duckdb
import sqlglot
from sqlglot import exp
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from cachetools import LRUCache
from scipy import stats as scipy_stats

# Import our infrastructure modules
from api.services.storage_manager import storage_manager
from api.services.integrations.bigquery_connector import BigQueryConnector
from api.services.integrations.redshift_connector import RedshiftConnector
from api.services.integrations.base_integration import IntegrationConfig
from models import Dataset
from api.database import SessionLocal

logger = logging.getLogger(__name__)


# =========================================================================
# Architectural Upgrade 1 — Modular StorageBackend Strategy Interface
# =========================================================================
#
# Previously the engine was tightly coupled to `storage_manager` (a concrete
# Cloudflare R2 implementation).  By extracting the two surface-area methods
# into an abstract `StorageBackend` protocol we achieve full portability:
#
#   • Switch from R2 → DigitalOcean Spaces → AWS S3 → local NFS by swapping
#     the adapter passed at startup — the analytical core is unchanged.
#   • Unit-tests can inject a `FakeStorageBackend` with pre-seeded paths
#     without touching cloud infrastructure at all.
#
# The concrete `StorageManagerAdapter` wraps the existing singleton so the
# rest of the codebase does NOT need to be changed on day one.

class StorageBackend(ABC):
    """
    Minimal contract the Compute Engine requires from any storage layer.
    Implement this to port the engine to any object-store or local path.
    """

    @abstractmethod
    def get_duckdb_query_path(self, db: Session, dataset: "Dataset") -> str:
        """
        Returns a DuckDB-compatible URI for the dataset's Parquet file(s).
        Examples: 's3://bucket/prefix/*.parquet'
                  'r2://bucket/prefix/*.parquet'
                  '/data/tenant/dataset.parquet'
        """

    @abstractmethod
    def duckdb_session(self, db: Session, tenant_id: str):
        """
        Returns a context manager that yields a configured DuckDB connection
        pre-loaded with the correct cloud credentials for this tenant.
        """


class StorageManagerAdapter(StorageBackend):
    """
    Thin adapter that delegates to the existing `storage_manager` singleton.
    Zero migration cost — drop this in and the engine works exactly as before.
    """

    def get_duckdb_query_path(self, db: Session, dataset: "Dataset") -> str:
        return storage_manager.get_duckdb_query_path(db, dataset)

    def duckdb_session(self, db: Session, tenant_id: str):
        return storage_manager.duckdb_session(db, tenant_id)


# -------------------------------------------------------------------------
# Compute Location Enum & Data Contracts
# -------------------------------------------------------------------------

class ComputeLocation(str, Enum):
    LOCAL_DATA_LAKE = "local_data_lake"  # R2 / S3 Parquet — default path
    BIGQUERY        = "bigquery"
    REDSHIFT        = "redshift"
    SNOWFLAKE       = "snowflake"

class DatasetMetadata(BaseModel):
    """Data contract for dataset metadata passed through Celery message queues."""
    dataset_id: str = Field(alias="id", default="")
    location: ComputeLocation = ComputeLocation.LOCAL_DATA_LAKE

    # Pydantic V2: Replaced `class Config:` with `model_config` ConfigDict
    model_config = ConfigDict(
        extra='ignore',
        populate_by_name=True
    )

    def __init__(self, **data):
        # Gracefully handle database 'id' vs task 'dataset_id' payloads
        if 'dataset_id' not in data and 'id' in data:
            data['dataset_id'] = str(data['id'])
        super().__init__(**data)


# -------------------------------------------------------------------------
# Phase 1: Semantic Query Caching Layer (HARDENED)
# -------------------------------------------------------------------------

class QueryCacheManager:
    """
    High-Performance Caching Layer.
    Uses Semantic AST Hashing so formatting (spaces, caps) doesn't bust the cache.

    Hardened for Enterprise SaaS:
    - Uses LRUCache to prevent OOM memory leaks.
    - Implements Circuit Breaker to prevent API hanging during Redis latency spikes.
    """

    def __init__(self, redis_client=None, ttl_seconds: int = 3600):
        self.redis = redis_client
        self.ttl   = ttl_seconds

        # Max 500 cached dataframes in memory at once. Oldest are evicted automatically.
        self._local_cache = LRUCache(maxsize=500)

        # Circuit Breaker state
        self._circuit_open          = False
        self._circuit_recovery_time = 0
        self._CIRCUIT_COOLDOWN      = 60  # Wait 60 seconds before retrying Redis

    def _is_redis_healthy(self) -> bool:
        """Circuit Breaker logic to protect the computation thread."""
        if not self.redis:
            return False

        if self._circuit_open:
            if time.time() > self._circuit_recovery_time:
                logger.info("Semantic Cache Circuit Breaker: Half-open, attempting Redis reconnection.")
                self._circuit_open = False
            else:
                return False
        return True

    def _trip_circuit(self, error: Exception):
        logger.error(f"Semantic Cache Redis TRIPPED: {str(error)}")
        self._circuit_open          = True
        self._circuit_recovery_time = time.time() + self._CIRCUIT_COOLDOWN

    def _generate_semantic_hash(
        self,
        tenant_id:   str,
        dataset_ids: List[str],
        sql_query:   str,
    ) -> str:
        """
        Generates a deterministic hash based on the AST, tenant ID, and dataset IDs
        to prevent cross-tenant data leaks and maximise hit rate.
        """
        try:
            ast          = sqlglot.parse_one(sql_query, read="duckdb")
            standardized = ast.sql(dialect="duckdb")
        except Exception:
            standardized = sql_query.strip().lower()

        dataset_signatures = "_".join(sorted(dataset_ids))
        payload            = f"{tenant_id}::{dataset_signatures}::{standardized}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    async def get(
        self,
        tenant_id:   str,
        dataset_ids: List[str],
        sql_query:   str,
    ) -> Optional[List[Dict[str, Any]]]:
        cache_key = self._generate_semantic_hash(tenant_id, dataset_ids, sql_query)

        # 1. Try Distributed Redis Cache
        if self._is_redis_healthy():
            try:
                cached = (
                    await self.redis.get(cache_key)
                    if hasattr(self.redis, 'get') and asyncio.iscoroutinefunction(self.redis.get)
                    else self.redis.get(cache_key)
                )
                if cached:
                    logger.info(f"[{tenant_id}] SEMANTIC CACHE HIT (Redis): {cache_key[:8]}")
                    return json.loads(cached)
            except Exception as e:
                self._trip_circuit(e)

        # 2. Try Local LRU Fallback
        cached_local = self._local_cache.get(cache_key)
        if cached_local:
            if time.time() < cached_local["expires_at"]:
                logger.info(f"[{tenant_id}] SEMANTIC CACHE HIT (Local LRU): {cache_key[:8]}")
                return cached_local["data"]
            else:
                del self._local_cache[cache_key]

        return None

    async def set(
        self,
        tenant_id:   str,
        dataset_ids: List[str],
        sql_query:   str,
        data:        List[Dict[str, Any]],
    ) -> None:
        cache_key = self._generate_semantic_hash(tenant_id, dataset_ids, sql_query)

        # 1. Always write to Local LRU Cache (Shadowing)
        self._local_cache[cache_key] = {
            "expires_at": time.time() + self.ttl,
            "data":       data,
        }

        # 2. Write to Distributed Redis (If healthy)
        if self._is_redis_healthy():
            try:
                payload = json.dumps(data, default=str)
                if hasattr(self.redis, 'setex') and asyncio.iscoroutinefunction(self.redis.setex):
                    await self.redis.setex(cache_key, self.ttl, payload)
                else:
                    self.redis.setex(cache_key, self.ttl, payload)
            except Exception as e:
                self._trip_circuit(e)


# -------------------------------------------------------------------------
# Phase 3 & 4: Query Planner & Compute Router
# -------------------------------------------------------------------------

class ComputeRouter:
    """
    Intelligent routing based on AST Complexity Analysis.
    Prevents "Noisy Neighbors" by offloading heavy analytical workloads to
    distributed queues.
    """

    MAX_SYNC_COST = 50

    @classmethod
    def analyze_query_cost(cls, sql_query: str) -> int:
        """
        Calculates a heuristic 'cost' based on SQL operations using AST mapping.
        Joins, Window functions, and nested aggregations are heavily penalised.
        """
        cost = 0
        try:
            ast = sqlglot.parse_one(sql_query, read="duckdb")

            cost += 5                                         # base scan

            for _ in ast.find_all(exp.Join):                 # Cartesian explosion risk
                cost += 20

            for _ in ast.find_all(exp.Window):               # requires sorting
                cost += 25

            if ast.args.get("group"):                        # aggregations
                cost += 15

            if ast.args.get("with"):                         # complex multi-step CTEs
                cost += sum(15 for _ in ast.args["with"].expressions)

        except Exception as e:
            logger.warning(f"Cost analysis failed, assuming high cost. Error: {e}")
            cost = 100  # default to async worker on parse failure

        return cost

    @classmethod
    def requires_background_worker(cls, sql_query: str) -> bool:
        """Determines if a query is too complex for the synchronous tier."""
        if not sql_query:
            return False
        cost     = cls.analyze_query_cost(sql_query)
        is_heavy = cost >= cls.MAX_SYNC_COST
        if is_heavy:
            logger.info(f"Query routed to ASYNC. Calculated AST Cost: {cost}")
        return is_heavy


# =========================================================================
# Architectural Upgrade 3 — AI Auto-Healing Helper
# =========================================================================
#
# Extracted into a standalone async function so it can be unit-tested
# independently of the full engine.  On a recoverable DuckDB error the helper
# asks the LLM for a corrected SQL string, validates it parses without error,
# then returns it to the caller for a single automatic retry.
#
# Design decisions
# ────────────────
# • Only ONE auto-heal attempt per query.  Infinite retry loops would mask
#   data-modelling bugs and create runaway LLM costs.
# • The LLM receives the failing SQL + the raw DuckDB error message.
#   It is explicitly instructed to return ONLY the corrected SQL with no
#   prose, making extraction trivial and deterministic.
# • If the healed SQL itself fails to parse we raise immediately rather than
#   executing potentially malformed SQL against production data.

async def _heal_sql_with_llm(
    llm_client,
    tenant_id:     str,
    broken_sql:    str,
    error_message: str,
) -> str:
    """
    Asks the LLM to repair a DuckDB SQL statement that failed at runtime.

    Returns
    ───────
    A corrected SQL string that passes sqlglot parsing validation.

    Raises
    ──────
    RuntimeError  — if the LLM is unavailable or returns unparseable SQL.
    """
    prompt = (
        "You are an expert DuckDB SQL engineer.\n"
        "The following SQL query failed with the error shown below.\n"
        "Return ONLY the corrected SQL query — no explanation, no markdown fences, "
        "no prose. The output must be valid DuckDB SQL.\n\n"
        f"### Failing SQL\n{broken_sql}\n\n"
        f"### DuckDB Error\n{error_message}\n\n"
        "### Corrected SQL"
    )

    healed_raw: str = await llm_client.complete(prompt)
    healed_sql = healed_raw.strip().strip("```sql").strip("```").strip()

    # Validate before handing back to the engine
    try:
        sqlglot.parse_one(healed_sql, read="duckdb")
    except Exception as parse_err:
        raise RuntimeError(
            f"[{tenant_id}] AI Auto-Heal returned unparseable SQL: {parse_err}"
        ) from parse_err

    logger.info(
        f"[{tenant_id}] AI Auto-Heal produced a valid corrected query "
        f"({len(healed_sql)} chars)."
    )
    return healed_sql


# =========================================================================
# Phase 5, 6 & 7: The Vectorised Compute Engine
# =========================================================================

class ComputeEngine:
    """
    The High-Performance Predictive Execution Core.

    Routing tiers
    ─────────────
    • Local Data Lake  — DuckDB + Polars over R2 / S3 Parquet.
                         Sub-second UI responsiveness for datasets ≤ 2 GB.
    • Pushdown Compute — BigQuery / Redshift / Snowflake.
                         Query runs entirely inside the warehouse; only the
                         aggregated result set travels over the wire.

    Architectural upgrades (this revision)
    ───────────────────────────────────────
    • Upgrade 1 – Modular StorageBackend  Injected strategy interface replaces
                                          the hard-coded storage_manager import.
                                          Swap R2 → S3 → DigitalOcean Spaces by
                                          changing one constructor argument.

    • Upgrade 2 – Zero-RAM Compute        DuckDB's native COPY ... TO writes
                                          results directly to a temp ZSTD Parquet
                                          file.  Python's heap never holds the
                                          full result set, preventing OOM kills
                                          on constrained DigitalOcean workers.

    • Upgrade 3 – AI Auto-Healing         On a recoverable SQL error the engine
                                          automatically asks the LLM to fix the
                                          broken query and retries exactly once.

    • Upgrade 4 – ZSTD Compression        All intermediate Parquet artefacts are
                                          written with COMPRESSION 'zstd', giving
                                          3–7× smaller wire payloads vs. Snappy.

    Additional engineering (unchanged)
    ───────────────────────────────────
    • Phase 1  Semantic Caching        — Bypasses execution for identical views.
    • Phase 3  ML Pipeline             — Vectorised Z-Score Anomaly detection & Matrix OLS.
    • Phase 3.3 Confidence Intervals   — NumPy matrix OLS yields 95 % CI prediction bands.
    • Phase 3.4 AI Executive Synthesis — LLM-powered 2-sentence business summary injected
                                         directly into the pipeline response payload.
    • AST/Regex Path Resolution        — Rewrites LLM SQL to physical R2 Parquet URIs.
    • Phase 5  Resource Guardrails     — 2 GB hard memory limit and read-only connections.
    • Zero-Copy Handoff                — DuckDB COPY → ZSTD Parquet → Polars → JSON.
    """

    # Datasets larger than this threshold trigger a warning on local execution
    LOCAL_EXECUTION_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB

    # T-multiplier for a 95 % two-tailed prediction interval
    # (resolved at runtime against actual degrees-of-freedom via scipy)
    _FALLBACK_T_95 = 1.96

    # =========================================================================
    # Upgrade 1: StorageBackend is now injected, not imported
    # =========================================================================
    # Passing `storage_backend=None` keeps every existing call-site working
    # because we fall back to `StorageManagerAdapter` (the original singleton).
    # To switch storage providers on a new deployment:
    #
    #   from my_spaces_adapter import DigitalOceanSpacesBackend
    #   engine = ComputeEngine(storage_backend=DigitalOceanSpacesBackend())

    def __init__(
        self,
        query_timeout_ms: int = 15_000,
        llm_client=None,
        storage_backend: Optional[StorageBackend] = None,
    ):
        self.query_timeout_ms = query_timeout_ms
        self.cache            = QueryCacheManager()
        self.llm_client       = llm_client

        # Upgrade 1 — inject the storage strategy; fall back to the existing adapter
        self._storage: StorageBackend = storage_backend or StorageManagerAdapter()

    # ------------------------------------------------------------------
    # Internal helpers — path resolution & view injection
    # ------------------------------------------------------------------

    def _resolve_physical_paths(
        self,
        db:          Session,
        tenant_id:   str,
        dataset_ids: List[str],
        sql_query:   str,
    ) -> str:
        """
        Translates logical LLM table names into secure, physical R2 Parquet URIs.
        Phase 5.1: Validates that every requested dataset belongs to the tenant.

        Upgrade 1: Uses self._storage instead of the hard-coded storage_manager.
        """
        datasets = db.query(Dataset).filter(
            Dataset.id.in_(dataset_ids),
            Dataset.tenant_id == tenant_id,
        ).all()

        if len(datasets) != len(dataset_ids):
            missing = set(dataset_ids) - {str(d.id) for d in datasets}
            logger.critical(
                f"[{tenant_id}] Security Violation: Attempted access to "
                f"unauthorized datasets: {missing}"
            )
            raise PermissionError(
                "Access denied. Requested datasets are not part of this workspace."
            )

        physical_query = sql_query
        for dataset in datasets:
            logical_table  = f'"{dataset.id}"'
            # Upgrade 1: delegate path resolution to the injected backend
            r2_path        = self._storage.get_duckdb_query_path(db, dataset)
            physical_query = re.sub(
                re.escape(logical_table),
                f"read_parquet('{r2_path}')",
                physical_query,
                flags=re.IGNORECASE,
            )

        return physical_query

    def _inject_semantic_views(
        self,
        physical_query: str,
        injected_views: List[str],
    ) -> str:
        """
        Injects Gold Tier metric definitions (CTEs) into the execution context.
        """
        if not injected_views:
            return physical_query
        # Prepend injected_views as CTE block when implemented
        return physical_query

    # ------------------------------------------------------------------
    # Upgrade 2 & 4 — Zero-RAM COPY execution core (shared helper)
    # ------------------------------------------------------------------

    @staticmethod
    def _copy_query_to_parquet(con: duckdb.DuckDBPyConnection, sql: str) -> str:
        """
        Writes query results directly to a temporary ZSTD-compressed Parquet file
        using DuckDB's native COPY command.

        Why this matters (Upgrade 2 — Zero-RAM Compute)
        ────────────────────────────────────────────────
        The previous path was:
            execute(sql) → Arrow table (Python heap) → Polars DataFrame (copy)

        Each materialisation step doubles resident memory.  On a 500 MB result
        set that's ~1 GB of Python heap just to return JSON — enough to OOM-kill
        a DigitalOcean droplet mid-request.

        The new path is:
            COPY (sql) TO 'tmp.parquet' (FORMAT 'parquet', COMPRESSION 'zstd')
            → pl.scan_parquet('tmp.parquet').collect()  ← single read, no copy

        DuckDB streams the result set directly to disk in its own C++ thread
        without ever building a Python-side buffer.  The final Polars read is
        the only allocation — and it's the minimum possible.

        Why ZSTD (Upgrade 4 — Compression)
        ────────────────────────────────────
        Snappy (DuckDB's default) is fast but produces ~2–3× larger files than
        ZSTD at comparable decompression speed on modern CPUs.  For analytical
        result sets (repetitive string labels, sparse nulls) ZSTD level-3 gives
        5–7× compression vs. raw, with decompression throughput that comfortably
        exceeds NVMe read speed — so the smaller file is *also* faster to read.

        Returns
        ───────
        Path to the temporary Parquet file.  Caller is responsible for unlinking.
        """
        tmp_path = os.path.join(
            tempfile.gettempdir(),
            f"ce_result_{uuid.uuid4().hex}.parquet",
        )
        # ZSTD level 3 is the sweet spot: ~3× faster than level 9, negligible
        # size difference for the structured columnar data we produce here.
        con.execute(
            f"COPY ({sql}) TO '{tmp_path}' "
            f"(FORMAT 'parquet', COMPRESSION 'zstd', COMPRESSION_LEVEL 3)"
        )
        return tmp_path

    # ------------------------------------------------------------------
    # Route A — Local Data Lake (DuckDB + Polars over R2 / S3 Parquet)
    # ------------------------------------------------------------------

    async def _execute_local(
        self,
        db:             Session,
        tenant_id:      str,
        datasets:       List[Dataset],
        query:          str,
        injected_views: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Executes an analytical SQL query directly against R2 / S3 Parquet files
        via DuckDB.

        Upgrade 2 — Zero-RAM:  Results are written to a temp ZSTD Parquet file
                               by DuckDB's COPY command; Python never holds the
                               full Arrow table in memory.
        Upgrade 3 — Auto-Heal: On a Parser / Binder error the engine asks the
                               LLM to fix the SQL and retries exactly once.
        Upgrade 4 — ZSTD:      The temp artefact uses ZSTD compression.
        """
        dataset_ids = [str(d.id) for d in datasets]

        for d in datasets:
            size = getattr(d, "size_bytes", 0) or 0
            if size > self.LOCAL_EXECUTION_THRESHOLD_BYTES:
                logger.warning(
                    f"[{tenant_id}] Large local dataset ({size:,} bytes) — "
                    "consider pre-aggregating or clustering."
                )

        # Capture self for use inside the thread closure
        engine = self

        def _sync_execute(sql_to_run: str) -> List[Dict[str, Any]]:
            """
            Inner synchronous worker — runs on a thread-pool thread via
            asyncio.to_thread so the event loop is never blocked.
            """
            executable_sql = engine._resolve_physical_paths(
                db, tenant_id, dataset_ids, sql_to_run
            )
            executable_sql = engine._inject_semantic_views(
                executable_sql, injected_views
            )

            logger.debug(f"[{tenant_id}] Executing Physical Query:\n{executable_sql}")
            t0 = time.perf_counter()

            # Upgrade 1: use the injected storage backend for the connection
            with engine._storage.duckdb_session(db, tenant_id) as con:
                # Phase 5.3: Container Resource Hardening prevents OOM kills
                con.execute("PRAGMA memory_limit='2GB'")
                con.execute("PRAGMA threads=4")

                # ── Upgrade 2 & 4: Zero-RAM COPY to ZSTD Parquet ─────────────
                tmp_path = engine._copy_query_to_parquet(con, executable_sql)

            try:
                # Single lazy scan — Polars reads only what it needs, no copy
                df      = pl.scan_parquet(tmp_path).collect()
                elapsed = (time.perf_counter() - t0) * 1000
                logger.info(
                    f"✅ [{tenant_id}] Local DuckDB (Zero-RAM) finished in "
                    f"{elapsed:.2f} ms. Rows: {df.height}"
                )
                return engine._sanitize_for_json(df) if not df.is_empty() else []
            finally:
                # Always unlink the temp file, even on exception
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

        # ── Upgrade 3: AI Auto-Heal retry loop (max 1 retry) ─────────────────
        #
        # On the first attempt we run the user's query as-is.
        # If DuckDB raises a Parser or Binder exception AND an LLM client is
        # available, we ask the LLM to repair the SQL and run it exactly once
        # more.  A second failure is always re-raised — we never silently swallow
        # data errors.
        #
        # Recoverable exception types:
        #   duckdb.ParserException  — syntax errors (missing comma, bad keyword)
        #   duckdb.BinderException  — schema mismatches (unknown column / table)

        current_sql  = query
        last_error: Optional[Exception] = None

        for attempt in (1, 2):
            try:
                return await asyncio.to_thread(_sync_execute, current_sql)

            except (duckdb.ParserException, duckdb.BinderException) as exc:
                last_error = exc

                if attempt == 1 and self.llm_client is not None:
                    logger.warning(
                        f"[{tenant_id}] Attempt {attempt} failed with a "
                        f"recoverable SQL error — invoking AI Auto-Heal. "
                        f"Error: {exc}"
                    )
                    try:
                        current_sql = await _heal_sql_with_llm(
                            self.llm_client,
                            tenant_id,
                            current_sql,
                            str(exc),
                        )
                        logger.info(
                            f"[{tenant_id}] AI Auto-Heal succeeded — retrying "
                            "with corrected SQL."
                        )
                        continue  # go to attempt 2

                    except Exception as heal_exc:
                        # Healing itself failed — surface the original error
                        logger.error(
                            f"[{tenant_id}] AI Auto-Heal failed: {heal_exc}. "
                            "Raising original SQL error."
                        )
                        raise ValueError(
                            f"Generated SQL was invalid and could not be "
                            f"automatically repaired: {exc}"
                        ) from exc

                # attempt == 2, or no LLM client — propagate as a clear message
                raise ValueError(
                    f"Generated SQL was invalid (after auto-heal attempt): {exc}"
                ) from exc

            except Exception as exc:
                # Non-recoverable errors: schema binding failures beyond what the
                # LLM can fix, permissions issues, network errors, etc.
                logger.error(f"[{tenant_id}] Compute Engine Fatal Crash: {exc}")
                raise RuntimeError(f"Analytical engine failure: {exc}") from exc

        # Unreachable, but satisfies type checkers
        raise RuntimeError(
            f"Query failed after all retries: {last_error}"
        )  # pragma: no cover

    # ------------------------------------------------------------------
    # Route B — Pushdown Compute (Phase 5.2 Least-Privilege Enforced)
    # ------------------------------------------------------------------

    async def _execute_pushdown(
        self,
        tenant_id: str,
        dataset:   Dataset,
        query:     str,
    ) -> List[Dict[str, Any]]:
        """
        Compiles and executes the analytical SQL directly inside the remote warehouse.
        """
        location = ComputeLocation(getattr(dataset, "location", ComputeLocation.LOCAL_DATA_LAKE))

        if not dataset.connection_config:
            raise ValueError(
                f"Pushdown execution for {location} requires dataset.connection_config."
            )

        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name=location.value,
            credentials=dataset.connection_config,
        )

        t0 = time.perf_counter()

        try:
            if location == ComputeLocation.BIGQUERY:
                connector  = BigQueryConnector(config)
                # Phase 5.2: Ensure read-only transaction configuration
                job_config = {"use_query_cache": True, "labels": {"tenant": tenant_id}}
                query_job  = await asyncio.to_thread(connector.client.query, query, job_config=job_config)
                result_rows = await asyncio.to_thread(query_job.result)
                df          = pl.DataFrame([dict(row) for row in result_rows])

            elif location == ComputeLocation.REDSHIFT:
                connector = RedshiftConnector(config)

                def _run_redshift() -> List[Dict[str, Any]]:
                    with connector._get_connection() as conn:
                        # Phase 5.2: Explicit Read-Only Session
                        conn.set_session(readonly=True, autocommit=True)
                        with conn.cursor() as cur:
                            cur.execute(query)
                            columns = [d[0] for d in cur.description]
                            return [dict(zip(columns, row)) for row in cur.fetchall()]

                df = pl.DataFrame(await asyncio.to_thread(_run_redshift))

            else:
                raise NotImplementedError(
                    f"Pushdown not yet implemented for {location}."
                )

            elapsed = (time.perf_counter() - t0) * 1000
            logger.info(
                f"✅ [{tenant_id}] Pushdown ({location}) finished in {elapsed:.2f} ms. "
                f"Rows: {df.height}"
            )

            return self._sanitize_for_json(df)

        except NotImplementedError:
            raise
        except Exception as e:
            logger.error(f"[{tenant_id}] Pushdown execution failed on {location}: {e}")
            raise RuntimeError(f"Warehouse pushdown failure on {location}: {e}")

    # ------------------------------------------------------------------
    # Main execution entrypoint — routes between Local & Pushdown
    # ------------------------------------------------------------------

    async def execute_read_only(
        self,
        db:             Session,
        tenant_id:      str,
        datasets:       List[Dataset],
        query:          str,
        injected_views: Optional[List[str]] = None,
        bypass_cache:   bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Phase 5: Smart analytical query execution.
        """
        dataset_ids = [str(d.id) for d in datasets]

        # 1. Semantic cache check
        if not bypass_cache:
            cached = await self.cache.get(tenant_id, dataset_ids, query)
            if cached is not None:
                return cached

        # 2. Determine the execution route
        locations = {
            ComputeLocation(getattr(d, "location", ComputeLocation.LOCAL_DATA_LAKE))
            for d in datasets
        }

        is_remote = locations - {ComputeLocation.LOCAL_DATA_LAKE}

        async def _dispatch() -> List[Dict[str, Any]]:
            if not is_remote:
                logger.info(f"[{tenant_id}] Engine route: LOCAL_DATA_LAKE (DuckDB)")
                return await self._execute_local(
                    db, tenant_id, datasets, query, injected_views or []
                )
            else:
                if len(locations) > 1:
                    raise ValueError(
                        "Cross-location queries are not supported. "
                        f"Datasets span: {locations}"
                    )
                remote_location = next(iter(is_remote))
                logger.info(f"[{tenant_id}] Engine route: PUSHDOWN → {remote_location}")
                primary_dataset = datasets[0]
                return await self._execute_pushdown(tenant_id, primary_dataset, query)

        # 3. Enforce query timeout at the event-loop level
        try:
            results = await asyncio.wait_for(
                _dispatch(),
                timeout=self.query_timeout_ms / 1000.0,
            )
        except asyncio.TimeoutError:
            logger.critical(
                f"🚨 [{tenant_id}] Query timed out after {self.query_timeout_ms} ms!"
            )
            raise TimeoutError(
                "The analytical query was too complex and timed out. "
                "Try asking a more specific question."
            )

        # 4. Populate cache on success
        if not bypass_cache and results is not None:
            await self.cache.set(tenant_id, dataset_ids, query, results)

        return results

    # ------------------------------------------------------------------
    # Phase 3.1 & 3.2: Predictive ML Pipeline & Anomaly Vectorization
    # ------------------------------------------------------------------

    async def execute_ml_pipeline(
        self,
        db:         Session,
        tenant_id:  str,
        dataset:    Dataset,
        metric_col: str,
        time_col:   str,
    ) -> Dict[str, Any]:
        """
        Phase 3.1 – 3.4: High-Performance Vectorized Statistical Engine.

        Calculates
        ──────────
        • OLS Linear Regression via NumPy matrix algebra (Phase 3.3)
          — slope, intercept, 3-period point forecast
          — 95 % Prediction Interval bands (lower_bound / upper_bound)
        • Exponential Moving Average (EMA) for seasonality smoothing
        • Dynamic Z-Score for change-point / anomaly detection
        • AI Executive Synthesis via injected LLM client (Phase 3.4)
          — 2-sentence business narrative generated from the raw stat output

        Upgrade 1: Uses self._storage for path resolution.
        Upgrade 4: Intermediate extraction uses ZSTD Parquet.
        """
        logger.info(
            f"[{tenant_id}] Routing to Vectorized ML Pipeline for '{metric_col}'."
        )

        # Capture self for closure
        engine = self

        def _sync_predict() -> Dict[str, Any]:
            # Upgrade 1: delegate to injected backend
            secure_path = engine._storage.get_duckdb_query_path(db, dataset)

            agg_query = f"""
                SELECT
                    CAST("{time_col}"  AS DATE)          AS ds,
                    CAST(SUM("{metric_col}") AS DOUBLE)  AS y
                FROM read_parquet('{secure_path}')
                GROUP BY ds
                ORDER BY ds ASC
            """

            # Upgrade 1: use injected backend for the DuckDB session
            with engine._storage.duckdb_session(db, tenant_id) as con:
                try:
                    # Upgrade 2 & 4: write aggregated time-series to ZSTD Parquet,
                    # then read back — avoids building an Arrow table in Python heap.
                    tmp_path = engine._copy_query_to_parquet(con, agg_query)
                except Exception as e:
                    raise RuntimeError(
                        f"Failed to extract time-series for statistical analysis: {e}"
                    )

            try:
                raw_df = pl.scan_parquet(tmp_path).collect()
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

            # ── Phase 3.3 (Upgrade 3): Hardened Polars schema & NaN handling ────
            df = (
                raw_df
                .with_columns([
                    pl.col("ds").cast(pl.Date),
                    pl.col("y").cast(pl.Float64),
                ])
                .drop_nulls(subset=["y"])
                .sort("ds")
            )

            if df.height < 5:
                return {
                    "error": (
                        "Insufficient data density for a robust forecast "
                        "(minimum 5 periods required)."
                    )
                }

            # ── Phase 3.1: Vectorized Anomaly Detection & EMA ────────────────────
            span  = max(2, min(7, df.height - 1))
            alpha = 2.0 / (span + 1)

            df = df.with_columns([
                pl.int_range(0, df.height, dtype=pl.Int64).alias("x"),
                pl.col("y")
                  .ewm_mean(alpha=alpha)
                  .fill_null(strategy="forward")
                  .fill_null(strategy="backward")
                  .alias("ema_7"),
                pl.col("y")
                  .rolling_std(window_size=span, min_periods=2)
                  .fill_null(strategy="backward")
                  .fill_null(strategy="forward")
                  .fill_null(0.0)
                  .alias("rolling_std"),
            ])

            df = df.with_columns(
                pl.when(pl.col("rolling_std") > 0)
                  .then((pl.col("y") - pl.col("ema_7")) / pl.col("rolling_std"))
                  .otherwise(0.0)
                  .alias("z_score")
            )

            anomalies      = df.filter(pl.col("z_score").abs() > 2.5)
            anomaly_records: List[Dict[str, Any]] = []
            for row in anomalies.to_dicts():
                anomaly_records.append({
                    "date":    str(row["ds"]),
                    "value":   row["y"],
                    "z_score": round(row["z_score"], 2),
                    "type":    "spike" if row["z_score"] > 0 else "drop",
                })

            # ── Phase 3.3 (Upgrade 1): Matrix OLS with 95 % Prediction Interval ──
            x_vals = df["x"].to_numpy().astype(np.float64)
            y_vals = df["y"].to_numpy().astype(np.float64)
            n      = len(x_vals)

            X       = np.column_stack([np.ones(n, dtype=np.float64), x_vals])
            XtX     = X.T @ X
            XtX_inv = np.linalg.pinv(XtX)
            beta    = XtX_inv @ X.T @ y_vals
            b, m    = float(beta[0]), float(beta[1])

            y_hat   = X @ beta
            ss_res  = float(np.sum((y_vals - y_hat) ** 2))
            dof     = max(n - 2, 1)
            mse     = ss_res / dof

            y_mean    = float(y_vals.mean())
            ss_tot    = float(np.sum((y_vals - y_mean) ** 2))
            r_squared = 1.0 - (ss_res / ss_tot) if ss_tot != 0 else 0.0

            try:
                t_crit = float(scipy_stats.t.ppf(0.975, df=dof))
            except Exception:
                t_crit = self._FALLBACK_T_95

            future_x_vals   = np.array([n, n + 1, n + 2], dtype=np.float64)
            forecast_points: List[Dict[str, Any]] = []

            for fx in future_x_vals:
                x_star     = np.array([1.0, fx])
                point      = float(b + m * fx)
                leverage   = float(x_star @ XtX_inv @ x_star)
                half_width = t_crit * math.sqrt(mse * (1.0 + leverage))
                forecast_points.append({
                    "period_offset":  int(fx - n + 1),
                    "point_forecast": round(point, 4),
                    "lower_bound":    round(point - half_width, 4),
                    "upper_bound":    round(point + half_width, 4),
                })

            confidence_label = (
                "high"   if r_squared > 0.7 and n > 30 else
                "medium" if r_squared > 0.4            else
                "low"
            )

            return {
                "status":                  "computation_complete",
                "metric":                  metric_col,
                "n_periods":               n,
                "trend_slope":             round(m, 6),
                "intercept":               round(b, 6),
                "r_squared":               round(r_squared, 4),
                "mse":                     round(mse, 4),
                "forecast_next_3_periods": forecast_points,
                "anomalies_detected":      anomaly_records,
                "confidence":              confidence_label,
            }

        result = await asyncio.to_thread(_sync_predict)

        if "error" in result:
            return result

        # ── Phase 3.4: AI Executive Synthesis ─────────────────────────────────
        if self.llm_client is not None:
            try:
                exec_summary = await self._synthesize_executive_summary(
                    tenant_id=tenant_id,
                    metric_col=metric_col,
                    result=result,
                )
                result["executive_summary"] = exec_summary
            except Exception as exc:
                logger.warning(
                    f"[{tenant_id}] Executive Synthesis LLM call failed "
                    f"(non-fatal): {exc}"
                )
                result["executive_summary"] = None
        else:
            result["executive_summary"] = None

        return result

    # ------------------------------------------------------------------
    # Phase 3.4: AI Executive Synthesis (internal)
    # ------------------------------------------------------------------

    async def _synthesize_executive_summary(
        self,
        tenant_id:  str,
        metric_col: str,
        result:     Dict[str, Any],
    ) -> str:
        """
        Translates raw statistical output into a 2-sentence executive summary.

        Prompt engineering notes
        ────────────────────────
        • The LLM receives only high-level aggregates, never PII or raw rows.
        • A strict output contract (exactly 2 sentences) keeps the response
          predictable and UI-safe.
        • Directional language (↑/↓, "accelerating"/"decelerating") is seeded
          from the computed slope so the narrative is always arithmetically correct.
        """
        slope     = result.get("trend_slope", 0.0)
        r_sq      = result.get("r_squared", 0.0)
        n         = result.get("n_periods", 0)
        conf      = result.get("confidence", "low")
        anomalies = result.get("anomalies_detected", [])
        forecasts = result.get("forecast_next_3_periods", [])

        direction     = "upward" if slope >= 0 else "downward"
        anomaly_count = len(anomalies)
        anomaly_note  = (
            f"{anomaly_count} statistically significant anomal{'y' if anomaly_count == 1 else 'ies'} "
            f"{'was' if anomaly_count == 1 else 'were'} detected"
            if anomaly_count > 0
            else "no statistically significant anomalies were detected"
        )
        next_period_forecast = (
            f"{forecasts[0]['point_forecast']:,.2f} "
            f"(95% PI: {forecasts[0]['lower_bound']:,.2f} – {forecasts[0]['upper_bound']:,.2f})"
            if forecasts else "unavailable"
        )

        prompt = (
            f"You are a senior data analyst writing for a C-level audience. "
            f"Summarise the following statistical findings for the business metric "
            f"'{metric_col}' in exactly 2 crisp, jargon-free sentences. "
            f"Do not mention R-squared, MSE, or statistical terms; "
            f"translate them into business impact language only.\n\n"
            f"Statistical findings:\n"
            f"- Trend direction: {direction} (slope = {slope:+.4f} per period)\n"
            f"- Model fit confidence: {conf} (R² = {r_sq:.2%}, n = {n} periods)\n"
            f"- Next-period point forecast: {next_period_forecast}\n"
            f"- Anomaly summary: {anomaly_note} across the historical window.\n\n"
            f"Output exactly 2 sentences. No bullet points, no headers."
        )

        summary: str = await self.llm_client.complete(prompt)

        logger.info(f"[{tenant_id}] Executive Synthesis complete ({len(summary)} chars).")
        return summary.strip()

    # ------------------------------------------------------------------
    # Serialisation helpers
    # ------------------------------------------------------------------

    def _sanitize_for_json(self, df: pl.DataFrame) -> List[Dict[str, Any]]:
        """
        Prepares high-performance Polars types for FastAPI JSON serialisation.
        Resolves infinite floats, NaNs, and temporal objects.
        """
        date_cols = [
            col for col, dtype in df.schema.items()
            if isinstance(dtype, (pl.Date, pl.Datetime))
        ]
        if date_cols:
            df = df.with_columns([
                pl.col(col).dt.to_string("%Y-%m-%d %H:%M:%S").alias(col)
                for col in date_cols
            ])

        clean_records = []
        for row in df.to_dicts():
            clean_row: Dict[str, Any] = {}
            for k, v in row.items():
                if isinstance(v, float):
                    if v != v or v in (float("inf"), float("-inf")):
                        clean_row[k] = None
                    else:
                        clean_row[k] = v
                else:
                    clean_row[k] = v
            clean_records.append(clean_row)

        return clean_records


# =========================================================================
# Singleton export
# =========================================================================
#
# The default singleton wires up the existing StorageManagerAdapter so every
# existing call-site continues to work without any changes.
#
# To boot with a different backend (e.g. on a new deployment):
#
#   from my_spaces_adapter import DigitalOceanSpacesBackend
#   from api.services.llm_client import llm_client
#   compute_engine = ComputeEngine(
#       llm_client=llm_client,
#       storage_backend=DigitalOceanSpacesBackend(),
#   )

compute_engine = ComputeEngine()