# api/services/compute_engine.py

import logging
import duckdb
import pandas as pd
import numpy as np
from typing import List, Dict, Any
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
    Executes heavily optimized, vectorized operations via DuckDB and Arrow.
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
        query: str
    ) -> List[Dict[str, Any]]:
        """
        Safely executes an LLM-generated DuckDB SQL query.
        Applies Resource Governance (RAM/CPU limits) and strict Read-Only validation.
        """
        logger.info(f"[Tenant: {tenant_id}] Spinning up DuckDB compute engine.")

        # 1. Destructive Query Prevention (Security by Design)
        # Added keywords to prevent unauthorized DuckDB system manipulation
        forbidden_keywords = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE TABLE", "COPY", "INSTALL", "LOAD"]
        query_upper = query.upper()
        if any(keyword in query_upper for keyword in forbidden_keywords):
            raise ValueError("Security Violation: Only read-only SELECT queries are permitted.")

        try:
            # 2. Ephemeral Sandbox via StorageManager (Handles S3/R2 Secrets automatically)
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                
                # 3. Resource Governance (Noisy Neighbor Protection)
                # Cap the execution environment so it doesn't crash the container
                conn.execute("PRAGMA memory_limit='2GB';")
                conn.execute("PRAGMA threads=2;")
                
                # 4. Tenant-Isolated Execution: Register dynamically routed Parquet paths
                for dataset in datasets:
                    # Get the zero-copy remote URL (R2, Supabase, or Local Memory)
                    secure_path = storage_manager.get_duckdb_query_path(db, dataset)
                    
                    # LLM OPTIMIZATION: We register two views. 
                    # One for the UUID (system-safe) and one for a sanitized version of the human name.
                    # This ensures LLM-generated SQL queries like 'SELECT * FROM sales_data' work.
                    sanitized_name = self._sanitize_identifier(dataset.name)
                    
                    for alias in [str(dataset.id), sanitized_name]:
                        # Wrap alias in double quotes to handle reserved words or numbers
                        register_query = f'CREATE OR REPLACE VIEW "{alias}" AS SELECT * FROM read_parquet({secure_path});'
                        conn.execute(register_query)
                        
                    logger.debug(f"Registered secure views for dataset: {dataset.id} (alias: {sanitized_name})")

                # 5. Execute the query using Arrow for Zero-Copy performance
                logger.info("Executing analytical query over zero-copy network layer.")
                
                # SaaS Performance Upgrade: Fetch via Arrow instead of standard Pandas.
                # Arrow zero-copy memory mapping is significantly faster and prevents RAM spikes.
                arrow_table = conn.execute(query).arrow()
                result_df: pd.DataFrame = arrow_table.to_pandas()
                
                # 6. Result Serialization & Safety Limits
                if len(result_df) > self.max_return_rows:
                    logger.warning(f"Result set too large ({len(result_df)} rows). Truncating to {self.max_return_rows}.")
                    result_df = result_df.head(self.max_return_rows)
                    
                # PERFORMANCE UPGRADE: Handle NaNs without forcing object-type conversion.
                # We replace NaNs with None so they serialize to 'null' in JSON (cleaner for React).
                return result_df.replace({np.nan: None}).to_dict(orient="records")

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
        Prioritizes functional, vectorized operations (Pandas/NumPy) for complexity 
        SQL cannot handle easily (e.g., Linear Algebra).
        """
        logger.info(f"[Tenant: {tenant_id}] Initiating ML pipeline: {operation}")
        
        if not datasets:
            raise ValueError("No active datasets provided for ML computation.")
            
        primary_dataset = datasets[0]
        
        try:
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                secure_path = storage_manager.get_duckdb_query_path(db, primary_dataset)
                # Zero-copy load of a manageable subset for in-memory math
                df = conn.execute(f"SELECT * FROM read_parquet({secure_path}) LIMIT 100000").arrow().to_pandas()
            
            # Example Mathematical Precision: Exponential Moving Average
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            if not numeric_cols.empty and operation == "ema_forecast":
                col = numeric_cols[0]
                # Utilizing EMA for mathematical sensitivity to seasonality
                df[f'{col}_ema_7d'] = df[col].ewm(span=7, adjust=False).mean()
            
            # Safely serialize with performance-optimized NaN handling
            return df.head(self.max_return_rows).replace({np.nan: None}).to_dict(orient="records")
            
        except Exception as e:
            logger.error(f"ML Pipeline execution failed: {str(e)}")
            raise RuntimeError("Failed to apply advanced mathematical models to the data.")

# Export singleton instance for dependency injection
compute_engine = ComputeEngine()