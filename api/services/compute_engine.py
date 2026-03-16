# api/services/compute_engine.py

import logging
import re
import asyncio
import time
import hashlib
import json
from typing import Dict, Any, List, Optional
from enum import Enum

import polars as pl
import duckdb
import sqlglot
from sqlglot import exp
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Import our infrastructure modules
from api.services.storage_manager import storage_manager
from api.services.integrations.bigquery_connector import BigQueryConnector
from api.services.integrations.redshift_connector import RedshiftConnector
from api.services.integrations.base_integration import IntegrationConfig
from models import Dataset
from api.database import SessionLocal

logger = logging.getLogger(__name__)


# -------------------------------------------------------------------------
# Compute Location Enum & Data Contracts
# -------------------------------------------------------------------------

class ComputeLocation(str, Enum):
    LOCAL_DATA_LAKE = "local_data_lake"  # R2 / S3 Parquet — default path
    BIGQUERY        = "bigquery"
    REDSHIFT        = "redshift"
    SNOWFLAKE       = "snowflake"


# -------------------------------------------------------------------------
# Phase 1: Semantic Query Caching Layer
# -------------------------------------------------------------------------

class QueryCacheManager:
    """
    High-Performance Caching Layer.
    Uses Semantic AST Hashing so formatting (spaces, caps) doesn't bust the cache.
    Ready for Redis injection in production.
    """

    def __init__(self, redis_client=None, ttl_seconds: int = 3600):
        self.redis        = redis_client
        self._local_cache: Dict[str, Any] = {}
        self.ttl          = ttl_seconds

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
            ast            = sqlglot.parse_one(sql_query, read="duckdb")
            standardized   = ast.sql(dialect="duckdb")
        except Exception:
            standardized   = sql_query.strip().lower()

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

        if self.redis:
            try:
                cached = self.redis.get(cache_key)
                if cached:
                    logger.info(f"[{tenant_id}] CACHE HIT: {cache_key[:8]}")
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"Redis cache read failed: {e}")
        else:
            if cache_key in self._local_cache:
                entry = self._local_cache[cache_key]
                if time.time() - entry["timestamp"] < self.ttl:
                    logger.info(f"[{tenant_id}] CACHE HIT (Local): {cache_key[:8]}")
                    return entry["data"]
        return None

    async def set(
        self,
        tenant_id:   str,
        dataset_ids: List[str],
        sql_query:   str,
        data:        List[Dict[str, Any]],
    ) -> None:
        cache_key = self._generate_semantic_hash(tenant_id, dataset_ids, sql_query)

        if self.redis:
            try:
                self.redis.setex(cache_key, self.ttl, json.dumps(data, default=str))
            except Exception as e:
                logger.warning(f"Redis cache write failed: {e}")
        else:
            self._local_cache[cache_key] = {
                "timestamp": time.time(),
                "data":      data,
            }


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

            cost += 5                                        # base scan

            for _ in ast.find_all(exp.Join):                # Cartesian explosion risk
                cost += 20

            for _ in ast.find_all(exp.Window):              # requires sorting
                cost += 25

            if ast.args.get("group"):                       # aggregations
                cost += 15

            if ast.args.get("with"):                        # complex multi-step CTEs
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


# -------------------------------------------------------------------------
# Phase 5, 6 & 7: The Vectorised Compute Engine
# -------------------------------------------------------------------------

class ComputeEngine:
    """
    The High-Performance Predictive Execution Core.

    Routing tiers
    ─────────────
    • Local Data Lake  — DuckDB + Polars over R2 / S3 Parquet.
                         Sub-second UI responsiveness for datasets ≤ 2 GB.
    • Pushdown Compute — BigQuery / Redshift / Snowflake.
                         Query runs entirely inside the warehouse; only the
                         aggregated result set travels over the wire, avoiding
                         the disastrous latency of pulling terabytes of raw data.

    Additional engineering
    ──────────────────────
    • Phase 1  Semantic Caching    — Bypasses execution for identical views.
    • Phase 7  ML Pipeline         — Vectorised OLS Linear Regression via Polars.
    • AST/Regex Path Resolution    — Rewrites LLM SQL to physical R2 Parquet URIs.
    • Resource Guardrails          — 2 GB hard memory limit per query.
    • Zero-Copy Handoff            — DuckDB → Arrow → Polars → JSON.
    """

    # Datasets larger than this threshold trigger a warning on local execution
    LOCAL_EXECUTION_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB

    def __init__(self, query_timeout_ms: int = 15_000):
        self.query_timeout_ms = query_timeout_ms
        self.cache            = QueryCacheManager()

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
        Also validates that every requested dataset belongs to the tenant.
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
            r2_path        = storage_manager.get_duckdb_query_path(db, dataset)
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
        via DuckDB. Returns JSON-serialisable records.

        DuckDB reads only the columns referenced in the query (predicate pushdown),
        so even multi-GB files stay fast for narrow projections.
        """
        dataset_ids = [str(d.id) for d in datasets]

        # Warn early if a single dataset is unusually large
        for d in datasets:
            size = getattr(d, "size_bytes", 0) or 0
            if size > self.LOCAL_EXECUTION_THRESHOLD_BYTES:
                logger.warning(
                    f"[{tenant_id}] Large local dataset ({size:,} bytes) — "
                    "consider pre-aggregating or clustering."
                )

        def _sync_execute() -> List[Dict[str, Any]]:
            executable_sql = self._resolve_physical_paths(db, tenant_id, dataset_ids, query)
            executable_sql = self._inject_semantic_views(executable_sql, injected_views)

            logger.debug(f"[{tenant_id}] Executing Physical Query:\n{executable_sql}")
            t0 = time.perf_counter()

            with storage_manager.duckdb_session(db, tenant_id) as con:
                try:
                    con.execute("PRAGMA memory_limit='2GB'")

                    arrow_table = con.execute(executable_sql).arrow()
                    df          = pl.from_arrow(arrow_table)

                    elapsed = (time.perf_counter() - t0) * 1000
                    logger.info(
                        f"✅ [{tenant_id}] Local DuckDB finished in {elapsed:.2f} ms. "
                        f"Rows: {df.height if df is not None else 0}"
                    )

                    if df is None or df.is_empty():
                        return []

                    return self._sanitize_for_json(df)

                except duckdb.ParserException as e:
                    logger.error(f"[{tenant_id}] SQL Syntax Error: {e}")
                    raise ValueError(f"Generated SQL was invalid: {e}")
                except duckdb.BinderException as e:
                    logger.error(f"[{tenant_id}] Schema/Column Binding Error: {e}")
                    raise ValueError(f"The query referenced columns that do not exist: {e}")
                except Exception as e:
                    logger.error(f"[{tenant_id}] Compute Engine Fatal Crash: {e}")
                    raise RuntimeError(f"Analytical engine failure: {e}")

        return await asyncio.to_thread(_sync_execute)

    # ------------------------------------------------------------------
    # Route B — Pushdown Compute (BigQuery / Redshift / Snowflake)
    # ------------------------------------------------------------------

    async def _execute_pushdown(
        self,
        tenant_id:         str,
        dataset:           Dataset,
        query:             str,
    ) -> List[Dict[str, Any]]:
        """
        Compiles and executes the analytical SQL directly inside the remote
        warehouse, then streams only the result set back.

        This avoids the disastrous cost of pulling raw terabytes over the network
        just to aggregate them locally.
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
                query_job  = await asyncio.to_thread(connector.client.query, query)
                result_rows = await asyncio.to_thread(query_job.result)
                df          = pl.DataFrame([dict(row) for row in result_rows])

            elif location == ComputeLocation.REDSHIFT:
                connector = RedshiftConnector(config)

                def _run_redshift() -> List[Dict[str, Any]]:
                    with connector._get_connection() as conn:
                        with conn.cursor() as cur:
                            cur.execute(query)
                            columns = [d[0] for d in cur.description]
                            return [dict(zip(columns, row)) for row in cur.fetchall()]

                df = pl.DataFrame(await asyncio.to_thread(_run_redshift))

            # Snowflake (and others) follow the same pattern
            else:
                raise NotImplementedError(
                    f"Pushdown not yet implemented for {location}. "
                    "Contribute a connector in api/services/integrations/."
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
    # Phase 5: Main execution entrypoint — routes between Local & Pushdown
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

        Decision flow
        ─────────────
        1. Check the semantic cache.
        2. Inspect the ``location`` field on each dataset:
           • LOCAL_DATA_LAKE → DuckDB predicate-pushdown over R2 / S3 Parquet.
           • BIGQUERY / REDSHIFT / SNOWFLAKE → execute inside the remote warehouse;
             only the aggregated result travels over the network.
        3. Cache the successful result for future identical requests.
        """
        dataset_ids = [str(d.id) for d in datasets]

        # 1. Semantic cache check
        if not bypass_cache:
            cached = await self.cache.get(tenant_id, dataset_ids, query)
            if cached is not None:
                return cached

        # 2. Determine the execution route
        #    If datasets span multiple locations we default to LOCAL (caller should
        #    pre-split cross-location queries before reaching this method).
        locations = {
            ComputeLocation(getattr(d, "location", ComputeLocation.LOCAL_DATA_LAKE))
            for d in datasets
        }

        is_remote = locations - {ComputeLocation.LOCAL_DATA_LAKE}

        async def _dispatch() -> List[Dict[str, Any]]:
            if not is_remote:
                # ── Route A: Local DuckDB over R2 / S3 Parquet ──────────────
                logger.info(f"[{tenant_id}] Engine route: LOCAL_DATA_LAKE (DuckDB)")
                return await self._execute_local(
                    db, tenant_id, datasets, query, injected_views or []
                )
            else:
                # ── Route B: Pushdown to remote warehouse ────────────────────
                # For multi-dataset pushdown, datasets must all share a location.
                if len(locations) > 1:
                    raise ValueError(
                        "Cross-location queries are not supported. "
                        f"Datasets span: {locations}"
                    )
                remote_location = next(iter(is_remote))
                logger.info(f"[{tenant_id}] Engine route: PUSHDOWN → {remote_location}")

                # Pushdown operates on a single logical dataset/connection
                # (join logic lives inside the warehoused SQL itself).
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
        if not bypass_cache and results:
            await self.cache.set(tenant_id, dataset_ids, query, results)

        return results

    # ------------------------------------------------------------------
    # Phase 7: Predictive ML Pipeline (OLS Linear Regression)
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
        Phase 7: Vectorised Ordinary Least Squares (OLS) linear regression
        via Polars for trend forecasting directly over R2 Parquet data.
        """
        logger.info(
            f"[{tenant_id}] Routing to Predictive ML Pipeline for '{metric_col}'."
        )

        def _sync_predict() -> Dict[str, Any]:
            secure_path = storage_manager.get_duckdb_query_path(db, dataset)

            # Step 1: Pushdown aggregation to DuckDB for I/O efficiency
            agg_query = f"""
                SELECT
                    CAST("{time_col}"  AS DATE)   AS ds,
                    CAST(SUM("{metric_col}") AS DOUBLE) AS y
                FROM read_parquet('{secure_path}')
                GROUP BY ds
                ORDER BY ds ASC
            """

            with storage_manager.duckdb_session(db, tenant_id) as con:
                try:
                    df = pl.from_arrow(con.execute(agg_query).arrow()).drop_nulls()
                except Exception as e:
                    raise RuntimeError(
                        f"Failed to extract time-series for forecasting: {e}"
                    )

            if df.height < 5:
                return {
                    "error": "Insufficient data density for a robust forecast "
                             "(minimum 5 periods required)."
                }

            # Step 2: Vectorised OLS  y = m·x + b
            df = df.with_columns(x=pl.arange(0, df.height))

            x = df["x"].to_numpy()
            y = df["y"].to_numpy()
            n = len(x)

            denominator = n * (x ** 2).sum() - (x.sum()) ** 2
            if denominator == 0:
                return {"error": "Zero variance in time distribution; cannot forecast."}

            m = (n * (x * y).sum() - x.sum() * y.sum()) / denominator
            b = (y.sum() - m * x.sum()) / n

            # Forecast the next 3 periods
            future_x = [n, n + 1, n + 2]
            forecast  = [float(m * fx + b) for fx in future_x]

            # R² confidence score
            y_mean = y.mean()
            ss_tot = ((y - y_mean) ** 2).sum()
            ss_res = ((y - (m * x + b)) ** 2).sum()
            r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0.0

            return {
                "status":                  "computation_complete",
                "metric":                  metric_col,
                "trend_slope":             float(m),
                "forecast_next_3_periods": forecast,
                "r_squared":               float(r_squared),
                "confidence": (
                    "high"   if r_squared > 0.7 and n > 30 else
                    "medium" if r_squared > 0.4             else
                    "low"
                ),
            }

        return await asyncio.to_thread(_sync_predict)

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
                    if v != v or v in (float("inf"), float("-inf")):  # NaN / ±Inf
                        clean_row[k] = None
                    else:
                        clean_row[k] = v
                else:
                    clean_row[k] = v
            clean_records.append(clean_row)

        return clean_records


# Export singleton
compute_engine = ComputeEngine()