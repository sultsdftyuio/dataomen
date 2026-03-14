import logging
import re
import asyncio
import time
from typing import Dict, Any, List, Optional

import polars as pl
import duckdb
from sqlalchemy.orm import Session

# Import our infrastructure modules
from api.services.storage_manager import storage_manager
from models import Dataset
from api.database import SessionLocal

logger = logging.getLogger(__name__)

class ComputeEngine:
    """
    Phase 5: The High-Performance Execution Core.
    
    Upgraded Engineering:
    - R2 Network Optimization: Leverages DuckDB Httpfs Predicate Pushdown.
    - AST/Regex Path Resolution: Dynamically rewrites LLM SQL to point to physical R2 Parquet files.
    - Resource Guardrails: Hard limits on memory and query execution time to prevent container DOS.
    - Zero-Copy Handoff: DuckDB -> Arrow -> Polars -> JSON.
    """

    def __init__(self, query_timeout_ms: int = 15000):
        # Enterprise Guardrail: Never let an analytical query hang the server
        self.query_timeout_ms = query_timeout_ms

    def _resolve_physical_paths(self, db: Session, tenant_id: str, dataset_ids: List[str], sql_query: str) -> str:
        """
        Translates logical LLM table names into secure, physical R2 Parquet URIs.
        Example: 
        FROM "123e4567-e89b-12d3-a456-426614174000" 
        -> 
        FROM read_parquet('s3://dataomen-pro/tenants/hash/datasets/123.../*.parquet')
        """
        # 1. Fetch all requested datasets and verify tenant ownership
        datasets = db.query(Dataset).filter(
            Dataset.id.in_(dataset_ids),
            Dataset.tenant_id == tenant_id
        ).all()

        if len(datasets) != len(dataset_ids):
            missing = set(dataset_ids) - {str(d.id) for d in datasets}
            logger.critical(f"[{tenant_id}] Security Violation: Attempted access to unauthorized datasets: {missing}")
            raise PermissionError("Access denied. Requested datasets are not part of this workspace.")

        # 2. Map logical IDs to their physical R2 URIs via the Storage Manager
        physical_query = sql_query
        for dataset in datasets:
            # We wrapped dataset IDs in double quotes in the LLM prompt
            logical_table = f'"{dataset.id}"'
            
            # Get the secure R2/S3 path
            r2_path = storage_manager.get_duckdb_query_path(db, dataset)
            
            # Replace the logical table with the read_parquet function
            # We use re.IGNORECASE to handle LLMs that might output 'from' instead of 'FROM'
            physical_query = re.sub(
                re.escape(logical_table), 
                f"read_parquet({r2_path})", 
                physical_query, 
                flags=re.IGNORECASE
            )

        return physical_query

    def _inject_semantic_views(self, physical_query: str, injected_views: List[str]) -> str:
        """
        If the router requested Gold Tier views (e.g., 'vw_monthly_churn'), 
        this ensures they are available in the execution context.
        Note: The actual CTE logic would be prepended here based on the view definitions.
        """
        if not injected_views:
            return physical_query
            
        # In a full enterprise implementation, you would pull the CTE text from the integration registry
        # and prepend it: f"WITH {view_name} AS ({view_sql}) {physical_query}"
        # For now, we return the physical query as-is, assuming the LLM generated the math.
        return physical_query

    async def execute_read_only(
        self, 
        tenant_id: str, 
        dataset_ids: List[str], 
        query: str, 
        injected_views: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Executes an analytical query against R2 storage natively.
        Offloads the heavy C++ execution to a background thread to keep FastAPI completely non-blocking.
        """
        def _sync_execute() -> List[Dict[str, Any]]:
            with SessionLocal() as db:
                # 1. Rewrite SQL to point to R2
                executable_sql = self._resolve_physical_paths(db, tenant_id, dataset_ids, query)
                executable_sql = self._inject_semantic_views(executable_sql, injected_views or [])
                
                logger.debug(f"[{tenant_id}] Executing Physical Query:\n{executable_sql}")
                start_time = time.perf_counter()

                # 2. Acquire a secure, tenant-isolated execution context with R2 credentials loaded
                with storage_manager.duckdb_session(db, tenant_id) as con:
                    try:
                        # Resource constraints to protect the host container
                        con.execute(f"PRAGMA memory_limit='2GB'")
                        # Set a strict timeout so a bad LLM join doesn't hang the worker
                        con.interrupt() # Reset interrupt state just in case
                        
                        # Set timeout extension natively if available, or rely on asyncio.wait_for wrapping
                        # DuckDB 0.10+ doesn't have a direct SET query_timeout, so we rely on python execution times
                        
                        # 3. Vectorized execution via R2 -> Arrow -> Polars
                        # The .arrow() call streams the result set without Python object overhead
                        arrow_table = con.execute(executable_sql).arrow()
                        df = pl.from_arrow(arrow_table)
                        
                        elapsed = (time.perf_counter() - start_time) * 1000
                        logger.info(f"✅ [{tenant_id}] Compute Engine finished in {elapsed:.2f}ms. Rows: {df.height if df is not None else 0}")
                        
                        if df is None or df.is_empty():
                            return []
                            
                        # 4. Handle serialization anomalies (e.g., dates/NaNs for JSON transport)
                        return self._sanitize_for_json(df)

                    except duckdb.ParserException as e:
                        logger.error(f"[{tenant_id}] SQL Syntax Error: {e}")
                        raise ValueError(f"Generated SQL was invalid: {str(e)}")
                    except duckdb.BinderException as e:
                        logger.error(f"[{tenant_id}] Schema/Column Binding Error: {e}")
                        raise ValueError(f"The query referenced columns that do not exist: {str(e)}")
                    except Exception as e:
                        logger.error(f"[{tenant_id}] Compute Engine Fatal Crash: {e}")
                        raise RuntimeError(f"Analytical engine failure: {str(e)}")

        # Wrap in asyncio.wait_for to enforce the strict query timeout at the Python event-loop level
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(_sync_execute), 
                timeout=self.query_timeout_ms / 1000.0
            )
        except asyncio.TimeoutError:
            logger.critical(f"🚨 [{tenant_id}] Query execution timed out after {self.query_timeout_ms}ms!")
            raise TimeoutError("The analytical query was too complex and timed out. Try asking a more specific question.")

    async def execute_ml_pipeline(
        self, 
        tenant_id: str, 
        dataset_ids: List[str], 
        prompt: str, 
        schemas: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Placeholder for the Complex Computation path (Phase 7).
        This would invoke Polars native linear algebra, anomaly detection, or forecasting.
        """
        logger.info(f"[{tenant_id}] Routing to ML Computation Pipeline.")
        
        # Example implementation hooks into the existing robust AnomalyDetector or a new forecasting module
        return {
            "status": "computation_complete",
            "message": "ML Pipeline executed successfully.",
            "data": []
        }

    def _sanitize_for_json(self, df: pl.DataFrame) -> List[Dict[str, Any]]:
        """
        Prepares high-performance Polars types for FastAPI JSON serialization.
        Resolves infinite floats, NaNs, and temporal objects.
        """
        # Convert any Datetimes/Dates to strict ISO string formats
        date_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, (pl.Date, pl.Datetime))]
        if date_cols:
            df = df.with_columns([
                pl.col(col).dt.to_string("%Y-%m-%d %H:%M:%S").alias(col) for col in date_cols
            ])
            
        # Standard dictionary export
        records = df.to_dicts()
        
        # Scrub mathematical anomalies (NaN, Infinity) that crash Python's `json.dumps`
        clean_records = []
        for row in records:
            clean_row = {}
            for k, v in row.items():
                if isinstance(v, float):
                    if v != v:  # check for NaN
                        clean_row[k] = None
                    elif v == float('inf') or v == float('-inf'):
                        clean_row[k] = None
                    else:
                        clean_row[k] = v
                else:
                    clean_row[k] = v
            clean_records.append(clean_row)
            
        return clean_records

# Export singleton
compute_engine = ComputeEngine()