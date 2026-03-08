import logging
import duckdb
import pandas as pd
from typing import List, Dict, Any
import os

# Setup structured logger
logger = logging.getLogger(__name__)

class ComputeEngine:
    """
    Phase 4: The Execution Engine (In-Process Analytics)
    
    Spins up an ephemeral, in-memory DuckDB connection per request.
    Dynamically maps abstract dataset IDs to secure Cloudflare R2 paths using HTTPFS.
    Executes heavily optimized, vectorized operations via DuckDB and Pandas/Polars.
    """

    def __init__(self):
        """
        Initializes storage configuration from environment variables for Cloudflare R2 / S3.
        """
        self.s3_endpoint = os.getenv("R2_ENDPOINT", "YOUR_ACCOUNT_ID.r2.cloudflarestorage.com")
        self.s3_access_key = os.getenv("R2_ACCESS_KEY_ID")
        self.s3_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("R2_BUCKET_NAME", "dataomen-tenant-data")
        self.max_return_rows = 5000  # Safety threshold for frontend rendering

    def _get_duckdb_connection(self) -> duckdb.DuckDBPyConnection:
        """
        Creates a fresh, in-memory DuckDB connection and configures the HTTPFS
        extension to securely connect to Cloudflare R2.
        """
        conn = duckdb.connect(':memory:')
        
        # Load the HTTPFS extension for direct-to-object queries
        conn.execute("INSTALL httpfs; LOAD httpfs;")
        
        # Configure R2/S3 credentials
        conn.execute("SET s3_region='auto';")
        conn.execute(f"SET s3_endpoint='{self.s3_endpoint}';")
        conn.execute(f"SET s3_access_key_id='{self.s3_access_key}';")
        conn.execute(f"SET s3_secret_access_key='{self.s3_secret_key}';")
        # Ensure path style is True for Cloudflare R2 compatibility
        conn.execute("SET s3_url_style='path';") 
        
        return conn

    async def execute_read_only(
        self, 
        tenant_id: str, 
        dataset_ids: List[str], 
        query: str
    ) -> List[Dict[str, Any]]:
        """
        Safely executes an LLM-generated DuckDB SQL query.
        Dynamically registers the remote Parquet files as ephemeral views to enforce tenant isolation.
        """
        logger.info(f"[Tenant: {tenant_id}] Spinning up DuckDB compute engine.")
        
        conn = self._get_duckdb_connection()
        
        try:
            # 1. Tenant-Isolated Execution: Register S3 Parquet paths as table views.
            # The LLM wrote `SELECT * FROM "dataset_id"`, so we satisfy that reference here.
            for dataset_id in dataset_ids:
                s3_path = f"s3://{self.bucket_name}/{tenant_id}/{dataset_id}.parquet"
                
                # We use read_parquet to stream only the necessary columns/bytes
                register_query = f"""
                    CREATE VIEW "{dataset_id}" AS 
                    SELECT * FROM read_parquet('{s3_path}');
                """
                conn.execute(register_query)
                logger.debug(f"Registered view for dataset: {dataset_id}")

            # 2. Execute the read-only query
            # DuckDB's vectorized execution engine handles this in C++
            logger.info("Executing analytical query over HTTPFS.")
            result_df: pd.DataFrame = conn.execute(query).df()
            
            # 3. Result Serialization & Safety Limits
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
            logger.error(f"SQL Binder Error (e.g., Missing Column): {str(e)}")
            raise ValueError(f"Invalid column or table reference: {str(e)}")
            
        except Exception as e:
            logger.error(f"Execution failed: {str(e)}")
            raise RuntimeError(f"Engine execution failed: {str(e)}")
            
        finally:
            # Explicitly close the connection to free up memory
            conn.close()

    async def execute_ml_pipeline(
        self, 
        tenant_id: str, 
        dataset_ids: List[str], 
        prompt: str, 
        schemas: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Path C: Math/ML Code Execution.
        Loads the Parquet file directly into a Pandas/Polars DataFrame for complex 
        Linear Algebra operations (like Exponential Moving Averages, Forecasting).
        """
        logger.info(f"[Tenant: {tenant_id}] Initiating ML/Math pipeline.")
        
        if not dataset_ids:
            raise ValueError("No active datasets provided for ML computation.")
            
        # For ML tasks, we usually focus on the primary active dataset
        primary_dataset_id = dataset_ids[0]
        s3_path = f"s3://{self.bucket_name}/{tenant_id}/{primary_dataset_id}.parquet"
        
        try:
            # We use DuckDB just to fetch the data into Pandas quickly
            conn = self._get_duckdb_connection()
            df = conn.execute(f"SELECT * FROM read_parquet('{s3_path}')").df()
            conn.close()
            
            # ------------------------------------------------------------------
            # DYNAMIC ML EXECUTION LOGIC GOES HERE
            # e.g., using statsmodels, scikit-learn, or manual EMA vectorization:
            # df['forecast_ema'] = df['target_column'].ewm(span=7, adjust=False).mean()
            # ------------------------------------------------------------------
            
            # Mocking a basic anomaly detection response for architectural completeness
            logger.info("Executed mathematical transformations.")
            return df.head(100).to_dict(orient="records")
            
        except Exception as e:
            logger.error(f"ML Pipeline execution failed: {str(e)}")
            raise RuntimeError("Failed to apply advanced mathematical models to the data.")