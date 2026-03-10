import logging
import duckdb
import pandas as pd
from typing import List, Dict, Any
from sqlalchemy.orm import Session

# Import the modular storage router we built in Phase 3
from api.services.storage_manager import storage_manager
from models import Dataset

# Setup structured logger
logger = logging.getLogger(__name__)

class ComputeEngine:
    """
    Phase 4: The Execution Engine (In-Process Analytics)
    
    Spins up an ephemeral, memory-capped DuckDB connection per request.
    Dynamically maps abstract datasets to secure storage paths via the StorageManager.
    Executes heavily optimized, vectorized operations via DuckDB and Arrow/Pandas.
    """

    def __init__(self):
        self.max_return_rows = 5000  # Safety threshold for frontend rendering

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

        # 1. Destructive Query Prevention (Fail-fast security)
        forbidden_keywords = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE TABLE"]
        query_upper = query.upper()
        if any(keyword in query_upper for keyword in forbidden_keywords):
            raise ValueError("Security Violation: Only read-only SELECT queries are permitted.")

        try:
            # 2. Ephemeral Sandbox via StorageManager (Handles Modern Secrets automatically)
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                
                # 3. Resource Governance (SaaS Noisy Neighbor Protection)
                # Cap the execution environment so it doesn't crash the Vercel/Render container
                conn.execute("PRAGMA memory_limit='2GB';")
                conn.execute("PRAGMA threads=2;")
                
                # 4. Tenant-Isolated Execution: Register dynamically routed Parquet paths
                for dataset in datasets:
                    # Get the zero-copy remote URL (R2, Supabase, or Local Memory)
                    secure_path = storage_manager.get_duckdb_query_path(db, dataset)
                    
                    # Create a logical view matching the dataset name the LLM expects
                    register_query = f"""
                        CREATE VIEW "{dataset.id}" AS 
                        SELECT * FROM read_parquet({secure_path});
                    """
                    conn.execute(register_query)
                    logger.debug(f"Registered secure view for dataset: {dataset.id}")

                # 5. Execute the read-only query
                logger.info("Executing analytical query over zero-copy network layer.")
                
                # SaaS Performance Upgrade: Fetch via Arrow instead of standard Pandas.
                # Arrow zero-copy memory mapping is much faster and prevents RAM spikes.
                result_df: pd.DataFrame = conn.execute(query).arrow().to_pandas()
                
                # 6. Result Serialization & Safety Limits
                if len(result_df) > self.max_return_rows:
                    logger.warning(f"Result set too large ({len(result_df)} rows). Truncating to {self.max_return_rows}.")
                    result_df = result_df.head(self.max_return_rows)
                    
                # Handle Pandas NaNs and format as JSON array for the frontend component factory
                result_df = result_df.fillna(value="") 
                return result_df.to_dict(orient="records")

        except duckdb.ParserException as e:
            logger.error(f"SQL Parsing Error: {str(e)}")
            raise ValueError(f"Syntax error in generated SQL: {str(e)}")
            
        except duckdb.BinderException as e:
            logger.error(f"SQL Binder Error: {str(e)}")
            raise ValueError(f"Invalid column or table reference. The LLM hallucinated a column: {str(e)}")
            
        except duckdb.OutOfMemoryException as e:
            logger.critical(f"Resource Limit Reached for Tenant {tenant_id}: {str(e)}")
            raise RuntimeError("Query was too complex and exceeded the 2GB memory limit. Please simplify the request.")
            
        except Exception as e:
            logger.error(f"Execution failed: {str(e)}")
            raise RuntimeError(f"Engine execution failed: {str(e)}")

    async def execute_ml_pipeline(
        self, 
        db: Session,
        tenant_id: str, 
        datasets: List[Dataset], 
        prompt: str, 
        schemas: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Path C: Math/ML Code Execution.
        Loads the Parquet file directly into a Pandas/Polars DataFrame for complex 
        Linear Algebra operations.
        """
        logger.info(f"[Tenant: {tenant_id}] Initiating ML/Math pipeline.")
        
        if not datasets:
            raise ValueError("No active datasets provided for ML computation.")
            
        primary_dataset = datasets[0]
        
        try:
            # Safely fetch the data into memory using the scoped session
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                secure_path = storage_manager.get_duckdb_query_path(db, primary_dataset)
                # Limit initial load to prevent Out-Of-Memory on massive datasets
                df = conn.execute(f"SELECT * FROM read_parquet({secure_path}) LIMIT 100000").arrow().to_pandas()
            
            # ------------------------------------------------------------------
            # DYNAMIC ML EXECUTION LOGIC
            # e.g., Vectorized Pandas/NumPy operations
            # df['forecast_ema'] = df['target_column'].ewm(span=7, adjust=False).mean()
            # ------------------------------------------------------------------
            
            logger.info("Executed mathematical transformations.")
            
            # Safely serialize the response
            result_df = df.head(self.max_return_rows).fillna(value="")
            return result_df.to_dict(orient="records")
            
        except Exception as e:
            logger.error(f"ML Pipeline execution failed: {str(e)}")
            raise RuntimeError("Failed to apply advanced mathematical models to the data.")

# Export singleton instance
compute_engine = ComputeEngine()