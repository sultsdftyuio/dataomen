# api/services/compute_engine.py

import logging
import duckdb
import polars as pl
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

# Import modular orchestrators
from api.services.storage_manager import storage_manager
from models import Dataset

# Setup structured logger
logger = logging.getLogger(__name__)

class ComputeRouter:
    """
    Phase 2.2: Compute Routing Logic ("Noisy Neighbor" Defense).
    Determines whether a generated SQL query is lightweight enough for immediate 
    synchronous execution, or if it requires handoff to background workers.
    """
    @staticmethod
    def requires_background_worker(sql_query: str) -> bool:
        if not sql_query:
            return False
            
        query_upper = sql_query.upper()
        
        # Defensive Heuristics: Route heavy queries to background tasks
        if query_upper.count("JOIN") > 2:
            return True
        heavy_keywords = ["PERCENTILE_CONT", "APPROX_COUNT_DISTINCT", "CUBE", "ROLLUP", "STDDEV"]
        if any(keyword in query_upper for keyword in heavy_keywords):
            return True
        if query_upper.count("SELECT") > 3:
            return True
            
        return False


class ComputeEngine:
    """
    Phase 4: The Execution Engine (In-Process Analytics)
    
    Spins up ephemeral, memory-capped DuckDB connections per request.
    Dynamically maps abstract datasets to secure storage paths via the StorageManager.
    Executes heavily optimized, vectorized operations via DuckDB, Arrow, and Polars LazyFrames.
    """

    def __init__(self) -> None:
        self.max_return_rows: int = 5000  # Safety threshold for frontend rendering

    def _sanitize_identifier(self, name: str) -> str:
        """Ensures table/column names are safe for SQL identifiers."""
        return name.lower().replace(" ", "_").replace("-", "_").strip()

    async def execute_read_only(
        self, 
        db: Session,
        tenant_id: str, 
        datasets: List[Dataset], 
        query: str,
        injected_views: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Safely executes an LLM-generated DuckDB SQL query.
        Applies Resource Governance (RAM/CPU limits) and strict Read-Only validation.
        """
        logger.info(f"[Tenant: {tenant_id}] Spinning up DuckDB compute engine.")

        # 1. Destructive Query Prevention (Security by Design)
        forbidden_keywords = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE TABLE", "COPY", "INSTALL", "LOAD"]
        query_upper = query.upper()
        if any(keyword in query_upper for keyword in forbidden_keywords):
            raise ValueError("Security Violation: Only read-only SELECT queries are permitted.")

        try:
            # 2. Ephemeral Sandbox via StorageManager (Handles S3/R2 Secrets automatically)
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                
                # 3. Resource Governance (Noisy Neighbor Protection)
                conn.execute("PRAGMA memory_limit='2GB';")
                conn.execute("PRAGMA threads=2;")
                conn.execute("PRAGMA enable_object_cache=true;") # Optimization for repeated fast queries
                
                # 4. Tenant-Isolated Execution: Register dynamically routed Parquet paths
                for dataset in datasets:
                    secure_path = storage_manager.get_duckdb_query_path(db, dataset)
                    sanitized_name = self._sanitize_identifier(dataset.name)
                    
                    # Register both system UUID and friendly name for LLM mapping
                    for alias in [str(dataset.id), sanitized_name]:
                        register_query = f'CREATE OR REPLACE VIEW "{alias}" AS SELECT * FROM read_parquet({secure_path});'
                        conn.execute(register_query)
                        
                    logger.debug(f"Registered secure views for dataset: {dataset.id} (alias: {sanitized_name})")

                # 5. Lock Down Container Context
                conn.execute("PRAGMA disable_external_access;")

                # 6. Execute the query using Arrow for Zero-Copy performance
                logger.info("Executing analytical query over zero-copy network layer.")
                
                # Fetch via Arrow directly into Polars (Rust/C++)
                arrow_table = conn.execute(query).arrow()
                result_df = pl.from_arrow(arrow_table)
                
                # 7. Result Serialization & Safety Limits
                if result_df.height > self.max_return_rows:
                    logger.warning(f"Result set too large ({result_df.height} rows). Truncating to {self.max_return_rows}.")
                    result_df = result_df.head(self.max_return_rows)
                    
                return result_df.to_dicts()

        except duckdb.ParserException as e:
            logger.error(f"SQL Parsing Error: {str(e)}")
            raise ValueError(f"Syntax error in generated SQL: {str(e)}")
            
        except duckdb.BinderException as e:
            logger.error(f"SQL Binder Error: {str(e)}")
            raise ValueError(f"Invalid column or table reference. The LLM hallucinated a column: {str(e)}")
            
        except Exception as e:
            logger.error(f"Execution failed: {str(e)}")
            raise RuntimeError(f"Engine execution failed: {str(e)}")

    async def execute_ml_pipeline(
        self, 
        db: Session,
        tenant_id: str, 
        datasets: List[Dataset], 
        operation: str = "comprehensive_diagnostics",
        target_columns: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Path C: Advanced Mathematical & ML Code Execution.
        Utilizes Polars LazyFrames (`pl.LazyFrame`) to build an optimized Rust computation 
        graph for true multithreaded vectorization, preventing memory bloat on large datasets.
        """
        logger.info(f"[Tenant: {tenant_id}] Initiating Vectorized ML pipeline: {operation}")
        
        if not datasets:
            raise ValueError("No active datasets provided for ML computation.")
            
        primary_dataset = datasets[0]
        
        try:
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                secure_path = storage_manager.get_duckdb_query_path(db, primary_dataset)
                # Zero-copy load directly into a Polars LazyFrame
                arrow_table = conn.execute(f"SELECT * FROM read_parquet({secure_path})").arrow()
                
                # HYBRID PERFORMANCE PARADIGM: Shift to Lazy Evaluation
                lf = pl.from_arrow(arrow_table).lazy()
            
            # Extract schema to identify numeric targets
            schema = lf.collect_schema()
            numeric_cols = target_columns or [col for col, dtype in schema.items() if dtype in pl.NUMERIC_DTYPES]
            
            if not numeric_cols:
                raise ValueError("No numeric columns found for mathematical computation.")

            # MATHEMATICAL PRECISION: Build the vectorized computation graph
            exprs = []
            
            if operation in ["comprehensive_diagnostics", "anomaly_detection", "ema_forecast"]:
                for col in numeric_cols:
                    # 1. Exponential Moving Average (EMA) - Mathematically sensitive to recent trends
                    exprs.append(
                        pl.col(col).ewm_mean(span=7, adjust=False).alias(f"{col}_ema_7d")
                    )
                    # 2. Rolling Variance - Measures volatility
                    exprs.append(
                        pl.col(col).rolling_var(window_size=7).alias(f"{col}_variance_7d")
                    )
                    # 3. Z-Score Normalization - Real mathematical anomaly detection
                    exprs.append(
                        ((pl.col(col) - pl.col(col).mean()) / pl.col(col).std()).alias(f"{col}_zscore")
                    )
            
            # Apply all computations simultaneously at the C++/Rust level
            lf_computed = lf.with_columns(exprs)

            if operation == "anomaly_detection":
                # Vectorized filter: Keep only rows where ANY numeric column's Z-Score violates the 3-Sigma Rule
                anomaly_conditions = [
                    (pl.col(f"{col}_zscore").abs() > 3) for col in numeric_cols
                ]
                combined_condition = anomaly_conditions[0]
                for cond in anomaly_conditions[1:]:
                    combined_condition = combined_condition | cond
                    
                lf_computed = lf_computed.filter(combined_condition)

            # Execution triggers here (.collect()). Rust Engine optimizes the graph and multithreads the workload.
            result_df = lf_computed.collect()
            
            return result_df.head(self.max_return_rows).to_dicts()
            
        except Exception as e:
            logger.error(f"ML Pipeline execution failed: {str(e)}")
            raise RuntimeError(f"Failed to apply advanced mathematical models: {str(e)}")

# Export singleton instance for dependency injection
compute_engine = ComputeEngine()