# api/services/compute_engine.py

import logging
import re
import asyncio
import time
import hashlib
import json
import math
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

# Import our infrastructure modules
from api.services.storage_manager import storage_manager
from api.services.integrations.bigquery_connector import BigQueryConnector
from api.services.integrations.redshift_connector import RedshiftConnector
from api.services.integrations.base_integration import IntegrationConfig
from models import Dataset
from api.database import SessionLocal

# Phase 2: AI Synthesis Integration
from api.services.llm_client import llm_client

logger = logging.getLogger(__name__)


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
    """

    def __init__(self, redis_client=None, ttl_seconds: int = 3600):
        self.redis = redis_client
        self.ttl = ttl_seconds
        self._local_cache = LRUCache(maxsize=500)
        self._circuit_open = False
        self._circuit_recovery_time = 0
        self._CIRCUIT_COOLDOWN = 60  

    def _is_redis_healthy(self) -> bool:
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
        self._circuit_open = True
        self._circuit_recovery_time = time.time() + self._CIRCUIT_COOLDOWN

    def _generate_semantic_hash(
        self,
        tenant_id:   str,
        dataset_ids: List[str],
        sql_query:   str,
    ) -> str:
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

        if self._is_redis_healthy():
            try:
                cached = await self.redis.get(cache_key) if hasattr(self.redis, 'get') and asyncio.iscoroutinefunction(self.redis.get) else self.redis.get(cache_key)
                if cached:
                    logger.info(f"[{tenant_id}] SEMANTIC CACHE HIT (Redis): {cache_key[:8]}")
                    return json.loads(cached)
            except Exception as e:
                self._trip_circuit(e)

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

        self._local_cache[cache_key] = {
            "expires_at": time.time() + self.ttl,
            "data": data,
        }

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
        cost = 0
        try:
            ast = sqlglot.parse_one(sql_query, read="duckdb")
            cost += 5                                        

            for _ in ast.find_all(exp.Join):                
                cost += 20
            for _ in ast.find_all(exp.Window):              
                cost += 25
            if ast.args.get("group"):                       
                cost += 15
            if ast.args.get("with"):                        
                cost += sum(15 for _ in ast.args["with"].expressions)
        except Exception as e:
            logger.warning(f"Cost analysis failed, assuming high cost. Error: {e}")
            cost = 100 

        return cost

    @classmethod
    def requires_background_worker(cls, sql_query: str) -> bool:
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
    """

    LOCAL_EXECUTION_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB

    def __init__(self, query_timeout_ms: int = 15_000):
        self.query_timeout_ms = query_timeout_ms
        self.cache            = QueryCacheManager()

    def _resolve_physical_paths(
        self,
        db:          Session,
        tenant_id:   str,
        dataset_ids: List[str],
        sql_query:   str,
    ) -> str:
        datasets = db.query(Dataset).filter(
            Dataset.id.in_(dataset_ids),
            Dataset.tenant_id == tenant_id,
        ).all()

        if len(datasets) != len(dataset_ids):
            missing = set(dataset_ids) - {str(d.id) for d in datasets}
            logger.critical(f"[{tenant_id}] Security Violation: Attempted access to unauthorized datasets: {missing}")
            raise PermissionError("Access denied. Requested datasets are not part of this workspace.")

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

    def _inject_semantic_views(self, physical_query: str, injected_views: List[str]) -> str:
        if not injected_views:
            return physical_query
        return physical_query

    async def _execute_local(
        self,
        db:             Session,
        tenant_id:      str,
        datasets:       List[Dataset],
        query:          str,
        injected_views: List[str],
    ) -> List[Dict[str, Any]]:
        dataset_ids = [str(d.id) for d in datasets]

        def _sync_execute() -> List[Dict[str, Any]]:
            executable_sql = self._resolve_physical_paths(db, tenant_id, dataset_ids, query)
            executable_sql = self._inject_semantic_views(executable_sql, injected_views)

            t0 = time.perf_counter()
            with storage_manager.duckdb_session(db, tenant_id) as con:
                try:
                    con.execute("PRAGMA memory_limit='2GB'")
                    con.execute("PRAGMA threads=4")

                    arrow_table = con.execute(executable_sql).arrow()
                    df          = pl.from_arrow(arrow_table)

                    elapsed = (time.perf_counter() - t0) * 1000
                    if df is None or df.is_empty():
                        return []
                    return self._sanitize_for_json(df)

                except Exception as e:
                    logger.error(f"[{tenant_id}] Compute Engine Fatal Crash: {e}")
                    raise RuntimeError(f"Analytical engine failure: {e}")

        return await asyncio.to_thread(_sync_execute)

    async def _execute_pushdown(self, tenant_id: str, dataset: Dataset, query: str) -> List[Dict[str, Any]]:
        location = ComputeLocation(getattr(dataset, "location", ComputeLocation.LOCAL_DATA_LAKE))

        if not dataset.connection_config:
            raise ValueError(f"Pushdown execution for {location} requires dataset.connection_config.")

        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name=location.value,
            credentials=dataset.connection_config,
        )

        try:
            if location == ComputeLocation.BIGQUERY:
                connector  = BigQueryConnector(config)
                job_config = {"use_query_cache": True, "labels": {"tenant": tenant_id}}
                query_job  = await asyncio.to_thread(connector.client.query, query, job_config=job_config)
                result_rows = await asyncio.to_thread(query_job.result)
                df          = pl.DataFrame([dict(row) for row in result_rows])

            elif location == ComputeLocation.REDSHIFT:
                connector = RedshiftConnector(config)
                def _run_redshift() -> List[Dict[str, Any]]:
                    with connector._get_connection() as conn:
                        conn.set_session(readonly=True, autocommit=True)
                        with conn.cursor() as cur:
                            cur.execute(query)
                            columns = [d[0] for d in cur.description]
                            return [dict(zip(columns, row)) for row in cur.fetchall()]
                df = pl.DataFrame(await asyncio.to_thread(_run_redshift))
            else:
                raise NotImplementedError(f"Pushdown not yet implemented for {location}.")

            return self._sanitize_for_json(df)

        except Exception as e:
            logger.error(f"[{tenant_id}] Pushdown execution failed on {location}: {e}")
            raise RuntimeError(f"Warehouse pushdown failure on {location}: {e}")

    async def execute_read_only(
        self,
        db:             Session,
        tenant_id:      str,
        datasets:       List[Dataset],
        query:          str,
        injected_views: Optional[List[str]] = None,
        bypass_cache:   bool = False,
    ) -> List[Dict[str, Any]]:
        dataset_ids = [str(d.id) for d in datasets]

        if not bypass_cache:
            cached = await self.cache.get(tenant_id, dataset_ids, query)
            if cached is not None:
                return cached

        locations = {ComputeLocation(getattr(d, "location", ComputeLocation.LOCAL_DATA_LAKE)) for d in datasets}
        is_remote = locations - {ComputeLocation.LOCAL_DATA_LAKE}

        async def _dispatch() -> List[Dict[str, Any]]:
            if not is_remote:
                return await self._execute_local(db, tenant_id, datasets, query, injected_views or [])
            else:
                remote_location = next(iter(is_remote))
                return await self._execute_pushdown(tenant_id, datasets[0], query)

        try:
            results = await asyncio.wait_for(_dispatch(), timeout=self.query_timeout_ms / 1000.0)
        except asyncio.TimeoutError:
            raise TimeoutError("The analytical query was too complex and timed out.")

        if not bypass_cache and results is not None:
            await self.cache.set(tenant_id, dataset_ids, query, results)

        return results

    # ------------------------------------------------------------------
    # Phase 8: Predictive ML Pipeline & Anomaly Forecasting Engine
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
        The Vectorized Forecasting Engine.
        Uses pure Polars and NumPy math for zero-latency execution.
        Outputs a 95% Confidence Interval Forecast and triggers the LLM for an Executive Synthesis.
        """
        logger.info(f"[{tenant_id}] Routing to Predictive ML Engine for '{metric_col}'.")

        def _sync_statistical_compute() -> Dict[str, Any]:
            secure_path = storage_manager.get_duckdb_query_path(db, dataset)

            # 1. Aggregate Time Series via DuckDB Pushdown
            agg_query = f"""
                SELECT
                    CAST("{time_col}" AS DATE) AS ds,
                    CAST(SUM("{metric_col}") AS DOUBLE) AS y
                FROM read_parquet('{secure_path}')
                GROUP BY ds
                ORDER BY ds ASC
            """

            with storage_manager.duckdb_session(db, tenant_id) as con:
                try:
                    df = pl.from_arrow(con.execute(agg_query).arrow()).drop_nulls()
                except Exception as e:
                    raise RuntimeError(f"Failed to extract time-series: {e}")

            if df.height < 5:
                return {"error": "Insufficient data density for a robust forecast (minimum 5 periods required)."}

            # 2. Vectorized Anomaly Detection (Polars)
            span = min(7, df.height - 1)
            alpha = 2 / (span + 1)
            
            df = df.with_columns([
                pl.int_range(0, df.height).alias("x"),
                pl.col("y").ewm_mean(alpha=alpha).alias("ema_7"),
                pl.col("y").rolling_std(window_size=span).fill_null(strategy="backward").alias("rolling_std")
            ])
            
            df = df.with_columns(
                pl.when(pl.col("rolling_std") > 0)
                .then((pl.col("y") - pl.col("ema_7")) / pl.col("rolling_std"))
                .otherwise(0)
                .alias("z_score")
            )
            
            anomalies = df.filter(pl.col("z_score").abs() > 2.5)
            anomaly_records = [
                {
                    "date": str(row["ds"]),
                    "value": row["y"],
                    "z_score": round(row["z_score"], 2),
                    "type": "spike" if row["z_score"] > 0 else "drop"
                }
                for row in anomalies.to_dicts()
            ]

            # 3. Vectorized OLS Regression with 95% Confidence Intervals (NumPy)
            x = df["x"].to_numpy()
            y = df["y"].to_numpy()
            n = len(x)

            # Calculate Slope (m) and Intercept (b)
            denominator = n * (x ** 2).sum() - (x.sum()) ** 2
            if denominator == 0:
                return {"error": "Zero variance in time distribution; cannot forecast."}

            m = (n * (x * y).sum() - x.sum() * y.sum()) / denominator
            b = (y.sum() - m * x.sum()) / n

            # Calculate R-Squared
            y_mean = y.mean()
            ss_tot = ((y - y_mean) ** 2).sum()
            ss_res = ((y - (m * x + b)) ** 2).sum()
            r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0.0

            # Calculate Standard Error for Confidence Intervals
            df_resid = n - 2
            standard_error = np.sqrt(ss_res / df_resid) if df_resid > 0 else 0
            x_mean = x.mean()
            ssx = ((x - x_mean) ** 2).sum()

            # Predict next 5 periods
            future_x = np.array([n, n + 1, n + 2, n + 3, n + 4])
            forecast_y = m * future_x + b
            
            # 95% CI Multiplier (Approx T-Value = 1.96)
            margin_of_error = 1.96 * standard_error * np.sqrt(1 + 1/n + ((future_x - x_mean)**2 / ssx))
            y_lower = forecast_y - margin_of_error
            y_upper = forecast_y + margin_of_error

            forecast_records = []
            for i, fx in enumerate(future_x):
                forecast_records.append({
                    "period_offset": int(fx - n + 1),
                    "forecast_value": float(forecast_y[i]),
                    "lower_bound_95": float(y_lower[i]),
                    "upper_bound_95": float(y_upper[i])
                })

            return {
                "status": "computation_complete",
                "metric": metric_col,
                "trend_slope": float(m),
                "r_squared": float(r_squared),
                "anomalies_detected": anomaly_records,
                "forecast": forecast_records,
                "confidence_rating": (
                    "high" if r_squared > 0.7 and n > 30 else
                    "medium" if r_squared > 0.4 else "low"
                ),
            }

        # Step 1: Execute mathematical computations natively in Python thread
        stats_payload = await asyncio.to_thread(_sync_statistical_compute)
        
        if "error" in stats_payload:
            return stats_payload

        # Step 2: AI Executive Synthesis
        # We pass the pure math output to the LLM to generate a human-readable business narrative
        synthesis_prompt = f"""
        You are an expert Data Analyst reporting to the executive team. 
        Analyze the following statistical output for the metric '{metric_col}':
        - Trend Slope: {stats_payload['trend_slope']:.2f} (Positive = growing, Negative = shrinking)
        - Forecast Accuracy (R^2): {stats_payload['r_squared']:.2f}
        - Notable Anomalies: {stats_payload['anomalies_detected']}
        
        Provide a concise, 2-sentence executive summary. Do not use markdown. Just deliver the hard business truth based on the math.
        """

        try:
            executive_narrative = await llm_client.generate(
                system_prompt="You summarize complex statistics into crisp, C-level insights.",
                user_prompt=synthesis_prompt,
                temperature=0.3
            )
            stats_payload["executive_summary"] = executive_narrative.strip()
        except Exception as e:
            logger.warning(f"Failed to generate LLM synthesis for forecast: {e}")
            stats_payload["executive_summary"] = "Statistical forecast generated successfully. Awaiting narrative review."

        return stats_payload

    # ------------------------------------------------------------------
    # Serialisation helpers
    # ------------------------------------------------------------------

    def _sanitize_for_json(self, df: pl.DataFrame) -> List[Dict[str, Any]]:
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

# Export singleton
compute_engine = ComputeEngine()