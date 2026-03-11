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
        # 1. More than 2 JOINs usually indicates complex relational mapping
        if query_upper.count("JOIN") > 2:
            return True
        # 2. Complex window functions or heavy statistical aggregations
        heavy_keywords = ["PERCENTILE_CONT", "APPROX_COUNT_DISTINCT", "CUBE", "ROLLUP", "STDDEV"]
        if any(keyword in query_upper for keyword in heavy_keywords):
            return True
        # 3. Multiple subqueries / CTEs
        if query_upper.count("SELECT") > 3:
            return True
            
        return False


class ComputeEngine:
    """
    Phase 4: The Execution Engine (In-Process Analytics)
    
    Spins up ephemeral, memory-capped DuckDB connections per request.
    Dynamically maps abstract datasets to secure storage paths via the StorageManager.
    Executes heavily optimized, vectorized operations via DuckDB, Arrow, and Polars.
    """

    def __init__(self):
        self.max_return_rows = 5000  # Safety threshold for frontend rendering

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
                # Strictly prevent LLMs from querying arbitrary URLs or local container file systems
                conn.execute("PRAGMA disable_external_access;")

                # 6. Execute the query using Arrow for Zero-Copy performance
                logger.info("Executing analytical query over zero-copy network layer.")
                
                # Hybrid Performance Paradigm: Fetch via Arrow directly into Polars (Rust/C++)
                # Completely bypasses single-threaded Pandas dense memory copies
                arrow_table = conn.execute(query).arrow()
                result_df = pl.from_arrow(arrow_table)
                
                # 7. Result Serialization & Safety Limits
                if result_df.height > self.max_return_rows:
                    logger.warning(f"Result set too large ({result_df.height} rows). Truncating to {self.max_return_rows}.")
                    result_df = result_df.head(self.max_return_rows)
                    
                # PERFORMANCE UPGRADE: Polars naturally handles nulls and serializes directly to clean Python dicts instantly.
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
        operation: str = "ema_forecast"
    ) -> List[Dict[str, Any]]:
        """
        Path C: Math/ML Code Execution.
        Prioritizes functional, vectorized operations (Polars via Rust) for complexity 
        SQL cannot handle easily (e.g., Linear Algebra).
        """
        logger.info(f"[Tenant: {tenant_id}] Initiating ML pipeline: {operation}")
        
        if not datasets:
            raise ValueError("No active datasets provided for ML computation.")
            
        primary_dataset = datasets[0]
        
        try:
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                secure_path = storage_manager.get_duckdb_query_path(db, primary_dataset)
                # Zero-copy load of a manageable subset directly into Polars
                arrow_table = conn.execute(f"SELECT * FROM read_parquet({secure_path}) LIMIT 100000").arrow()
                df = pl.from_arrow(arrow_table)
            
            # Example Mathematical Precision: Exponential Moving Average
            # Filter columns to only those of numeric types
            numeric_cols = [col for col, dtype in df.schema.items() if dtype in pl.NUMERIC_DTYPES]
            
            if numeric_cols and operation == "ema_forecast":
                col = numeric_cols[0]
                # Utilizing EMA for mathematical sensitivity to seasonality natively in C++
                df = df.with_columns(
                    pl.col(col).ewm_mean(span=7, adjust=False).alias(f'{col}_ema_7d')
                )
            
            # Safely serialize utilizing Polars' inherent NaN/Null performance handling
            return df.head(self.max_return_rows).to_dicts()
            
        except Exception as e:
            logger.error(f"ML Pipeline execution failed: {str(e)}")
            raise RuntimeError("Failed to apply advanced mathematical models to the data.")

# Export singleton instance for dependency injection
compute_engine = ComputeEngine()