import logging
import os
import boto3
from botocore.config import Config
import duckdb
import pandas as pd
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class IngestionPipeline:
    """
    Phase 2: Ingestion & Parquet Pipeline
    
    1. Generates Direct-to-R2 pre-signed URLs to bypass the API, saving bandwidth.
    2. Background worker processes the raw file using DuckDB HTTPFS.
    3. Converts raw CSV/Excel to compressed Parquet dynamically.
    4. Extracts a lightweight contextual profile (min/max/types) for the LLM router.
    """

    def __init__(self, db_client: Any):
        """
        Dependency injection for the Supabase client.
        Storage credentials pulled from environment for Cloudflare R2.
        """
        self.db = db_client
        self.bucket_name = os.getenv("R2_BUCKET_NAME", "dataomen-tenant-data")
        
        # Boto3 client configured for Cloudflare R2
        self.s3_client = boto3.client(
            's3',
            endpoint_url=f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
            aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
            config=Config(signature_version='s3v4'),
            region_name='auto'
        )

    def generate_presigned_upload(self, tenant_id: str, file_name: str, content_type: str) -> Dict[str, Any]:
        """
        Generates a secure, temporary URL for the React frontend to upload a file
        directly to Cloudflare R2. Path is strictly partitioned by tenant_id.
        """
        # Stage raw files in a temporary prefix before Parquet conversion
        object_key = f"{tenant_id}/raw/{file_name}"
        
        try:
            # Generate POST URL with strict conditions
            presigned_post = self.s3_client.generate_presigned_post(
                Bucket=self.bucket_name,
                Key=object_key,
                Fields={"Content-Type": content_type},
                Conditions=[
                    {"Content-Type": content_type},
                    ["content-length-range", 0, 104857600] # Max 100MB limit for raw uploads
                ],
                ExpiresIn=3600 # 1 hour expiration
            )
            logger.info(f"Generated pre-signed URL for tenant {tenant_id} | File: {file_name}")
            return {"url": presigned_post["url"], "fields": presigned_post["fields"], "object_key": object_key}
            
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {str(e)}")
            raise RuntimeError("Storage upload initialization failed.")

    def _get_duckdb_worker_connection(self) -> duckdb.DuckDBPyConnection:
        """Initializes a fresh DuckDB connection with HTTPFS loaded for worker tasks."""
        conn = duckdb.connect(':memory:')
        conn.execute("INSTALL httpfs; LOAD httpfs;")
        conn.execute("SET s3_region='auto';")
        conn.execute(f"SET s3_endpoint='{os.getenv('R2_ENDPOINT', 'YOUR_ACCOUNT_ID.r2.cloudflarestorage.com')}';")
        conn.execute(f"SET s3_access_key_id='{os.getenv('R2_ACCESS_KEY_ID')}';")
        conn.execute(f"SET s3_secret_access_key='{os.getenv('R2_SECRET_ACCESS_KEY')}';")
        conn.execute("SET s3_url_style='path';") 
        return conn

    async def process_raw_to_parquet(self, tenant_id: str, dataset_id: str, raw_object_key: str) -> Dict[str, Any]:
        """
        The Event-Driven Profiling Worker logic.
        Executed by a Render background worker once the upload to R2 completes.
        Converts to Parquet and profiles schema for Contextual RAG.
        """
        logger.info(f"[Worker] Processing dataset {dataset_id} for tenant {tenant_id}")
        
        raw_s3_path = f"s3://{self.bucket_name}/{raw_object_key}"
        parquet_s3_path = f"s3://{self.bucket_name}/{tenant_id}/parquet/{dataset_id}.parquet"
        
        conn = self._get_duckdb_worker_connection()
        
        try:
            # 1. Vectorized Conversion (CSV -> Parquet)
            # DuckDB streams the file from S3, compresses it, and writes it back without loading everything into RAM.
            logger.debug("Initiating zero-copy Parquet compression over HTTPFS.")
            conn.execute(f"""
                COPY (SELECT * FROM read_csv_auto('{raw_s3_path}', sample_size=-1)) 
                TO '{parquet_s3_path}' (FORMAT PARQUET, CODEC 'ZSTD');
            """)

            # 2. Schema Extraction (Contextual RAG Prep)
            # Using DuckDB's SUMMARIZE command is computationally brilliant here. It calculates 
            # min, max, null %, unique counts, and types in one vectorized pass.
            logger.debug("Extracting dataset summary profile for LLM context.")
            summary_df: pd.DataFrame = conn.execute(f"SUMMARIZE SELECT * FROM read_parquet('{parquet_s3_path}');").df()
            
            # Clean up the summary for the LLM (drop useless stats to save context tokens)
            profile_context = summary_df[['column_name', 'column_type', 'min', 'max', 'approx_unique']].to_dict(orient="records")

            # 3. Save Metadata to Supabase
            # This makes the metadata immediately available to our SemanticRouter
            self.db.table("datasets").update({
                "status": "READY",
                "storage_path": parquet_s3_path,
                "schema_metadata": profile_context
            }).eq("id", dataset_id).eq("tenant_id", tenant_id).execute()

            logger.info(f"[Worker] Successfully transformed and profiled {dataset_id}.")
            return {"status": "success", "schema": profile_context}

        except Exception as e:
            logger.error(f"[Worker] Failed to process dataset {dataset_id}: {str(e)}")
            self.db.table("datasets").update({"status": "FAILED"}).eq("id", dataset_id).execute()
            raise RuntimeError(f"Data processing worker failed: {str(e)}")
            
        finally:
            conn.close()
            # Optional: Delete the raw CSV from R2 to save storage costs
            # self.s3_client.delete_object(Bucket=self.bucket_name, Key=raw_object_key)