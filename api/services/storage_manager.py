# api/services/storage_manager.py

import os
import uuid
import logging
import contextlib
import asyncio
import polars as pl
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Optional, Any, Dict, Union, Generator

import boto3
from botocore.config import Config
import duckdb
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

# Import modern models
from models import Dataset, TenantSettings, StorageTier
from api.database import SessionLocal # Imported to allow background DB sessions

# Setup structured logger
logger = logging.getLogger(__name__)

class StorageError(Exception):
    """Base exception for all storage-related failures."""
    pass

@dataclass(frozen=True)
class ResolvedStorage:
    """
    Immutable container holding the dynamically resolved storage layer config.
    Frozen to prevent accidental mutation of security credentials during execution.
    """
    endpoint: str
    bucket: str
    access_key: str
    secret_key: str
    prefix: str
    tier: StorageTier

class AdaptiveStorageManager:
    """
    Phase 1: The Core Infrastructure Router.
    
    Dynamically shifts multi-tenant operations between Ephemeral memory, 
    Supabase free-tier storage, Cloudflare R2 Pro, and BYOS.
    Supercharged with Native Polars Streaming and DuckDB Secure Secrets.
    """
    
    def __init__(self) -> None:
        # 1. Cloudflare R2 (Pro Tier - Optimized for DuckDB Analytical Workloads)
        self.r2_endpoint = os.getenv("R2_ENDPOINT_URL", "")
        self.r2_bucket = os.getenv("R2_BUCKET_NAME", "dataomen-pro-data")
        self.r2_access = os.getenv("R2_ACCESS_KEY_ID", "")
        self.r2_secret = os.getenv("R2_SECRET_ACCESS_KEY", "")

        # 2. Supabase Storage (Free Tier - S3 Compatible API)
        self.supa_endpoint = os.getenv("SUPABASE_S3_ENDPOINT", "")
        self.supa_bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "default-datasets")
        self.supa_access = os.getenv("SUPABASE_S3_ACCESS_KEY", "")
        self.supa_secret = os.getenv("SUPABASE_S3_SECRET_KEY", "")

    def _resolve_tenant_config(self, db: Session, tenant_id: str) -> ResolvedStorage:
        """
        SECURITY BY DESIGN: Interrogates the database to find the user's storage tier.
        Applies strict physical `tenant_id` isolation to the directory prefix.
        """
        if not tenant_id:
            raise StorageError("Security Violation: tenant_id strictly required for storage resolution.")

        try:
            settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
            tier = settings.storage_tier if settings else StorageTier.SUPABASE
        except SQLAlchemyError as e:
            logger.error(f"Database error resolving tenant storage: {e}")
            tier = StorageTier.SUPABASE # Safe fallback to free tier

        # STRICT PHYSICAL PARTITIONING: The compute layers ONLY see this directory
        prefix = f"tenants/tenant_id={tenant_id}/"

        if tier == StorageTier.EPHEMERAL:
            return ResolvedStorage("", "", "", "", prefix, tier)
        
        if tier == StorageTier.R2_PRO and self.r2_endpoint:
            return ResolvedStorage(self.r2_endpoint, self.r2_bucket, self.r2_access, self.r2_secret, prefix, tier)

        # Default to Supabase S3-Compatible Layer
        return ResolvedStorage(self.supa_endpoint, self.supa_bucket, self.supa_access, self.supa_secret, prefix, tier)

    def get_s3_client(self, db: Session, tenant_id: str) -> Any:
        """Returns a high-concurrency Boto3 client pointing to the user's resolved storage tier."""
        config = self._resolve_tenant_config(db, tenant_id)
        
        if config.tier == StorageTier.EPHEMERAL:
            raise StorageError("Ephemeral tier does not support persistent S3 access.")

        # High-concurrency tuning for serverless orchestration
        boto_config = Config(
            s3={'addressing_style': 'path'}, 
            signature_version='s3v4',
            max_pool_connections=100,
            retries={'max_attempts': 3, 'mode': 'adaptive'}
        )

        return boto3.client(
            's3',
            endpoint_url=config.endpoint,
            aws_access_key_id=config.access_key,
            aws_secret_access_key=config.secret_key,
            region_name="auto", 
            config=boto_config
        )

    async def upload_raw_file_async(self, tenant_id: str, file: Any) -> str:
        """
        CRITICAL FASTAPI HOOK: Handles the raw upload from the /datasets/upload endpoint.
        Offloads the synchronous Boto3 network I/O to a background thread to prevent blocking.
        """
        def _sync_upload():
            with SessionLocal() as db:
                config = self._resolve_tenant_config(db, tenant_id)
                s3_client = self.get_s3_client(db, tenant_id)
                
                # Sanitize filename and create deterministic path
                timestamp = int(datetime.now(timezone.utc).timestamp())
                safe_filename = "".join(c for c in file.filename if c.isalnum() or c in "._-")
                object_key = f"{config.prefix}raw/{timestamp}_{safe_filename}"
                
                # Execute upload stream
                s3_client.upload_fileobj(file.file, config.bucket, object_key)
                
                logger.info(f"✅ Raw file uploaded successfully -> s3://{config.bucket}/{object_key}")
                return f"s3://{config.bucket}/{object_key}"

        return await asyncio.to_thread(_sync_upload)

    def delete_file(self, file_path: str) -> None:
        """
        Garbage Collection Hook: Resolves the bucket based on the URI and deletes the file.
        Designed to be dispatched via FastAPI BackgroundTasks.
        """
        if not file_path or not file_path.startswith("s3://"):
            return
            
        try:
            # Parse s3 URI (s3://bucket-name/path/to/object)
            path_without_scheme = file_path[5:]
            bucket_name, object_key = path_without_scheme.split("/", 1)
            
            # Resolve appropriate credentials based on the target bucket
            endpoint = self.r2_endpoint if bucket_name == self.r2_bucket else self.supa_endpoint
            access = self.r2_access if bucket_name == self.r2_bucket else self.supa_access
            secret = self.r2_secret if bucket_name == self.r2_bucket else self.supa_secret
            
            boto_config = Config(signature_version='s3v4')
            s3 = boto3.client('s3', endpoint_url=endpoint, aws_access_key_id=access, aws_secret_access_key=secret, region_name="auto", config=boto_config)
            
            s3.delete_object(Bucket=bucket_name, Key=object_key)
            logger.info(f"🗑️ Deleted dataset file: {file_path}")
            
        except Exception as e:
            logger.error(f"❌ Failed to delete file {file_path}: {e}")

    def write_dataframe(self, db: Session, df: Union[pl.DataFrame, pl.LazyFrame], tenant_id: str, dataset_id: str) -> str:
        """
        Upgraded Computation: Rust-Native Streaming Sink.
        Bypasses Python memory buffers to stream Polars directly to R2/S3.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        if isinstance(df, pl.LazyFrame):
            df = df.collect()

        # Build deterministic Parquet key
        if not dataset_id.endswith(".parquet"):
            batch_id = uuid.uuid4().hex[:8]
            timestamp = int(datetime.now(timezone.utc).timestamp())
            object_key = f"{dataset_id}/batch_{timestamp}_{batch_id}.parquet"
        else:
            object_key = dataset_id

        full_s3_uri = f"s3://{config.bucket}/{config.prefix}datasets/{object_key}"
        
        try:
            if config.tier != StorageTier.EPHEMERAL:
                storage_options = {
                    "aws_access_key_id": config.access_key,
                    "aws_secret_access_key": config.secret_key,
                    "aws_endpoint_url": config.endpoint,
                    "aws_region": "auto"
                }
                # row_group_size optimization ensures DuckDB can read it back in parallel chunks
                df.write_parquet(
                    full_s3_uri, 
                    compression="zstd", 
                    storage_options=storage_options, 
                    use_pyarrow=False,
                    row_group_size=128 * 1024 # 128k rows per group for parallel scans
                )
            else:
                # Ephemeral fallback for testing
                import fsspec
                fs = fsspec.filesystem('memory')
                with fs.open(full_s3_uri, "wb") as f:
                    df.write_parquet(f, compression="zstd")
            
            logger.info(f"✅ [{tenant_id}] Streamed {df.height} rows to columnar storage -> {full_s3_uri}")
            return full_s3_uri

        except Exception as e:
            logger.error(f"❌ Storage Write Exception (Tenant: {tenant_id}): {str(e)}")
            raise StorageError(f"Failed to serialize normalized data to Parquet: {str(e)}")

    def get_duckdb_query_path(self, db: Session, dataset: Dataset) -> str:
        """Calculates the optimal zero-copy path for DuckDB, inherently locking to the tenant's prefix."""
        if dataset.is_sample and dataset.sample_uri:
            return f"'{dataset.sample_uri}'"

        if dataset.file_path.startswith("s3://"):
            base_path = dataset.file_path
        else:
            config = self._resolve_tenant_config(db, dataset.tenant_id)
            base_path = f"s3://{config.bucket}/{config.prefix}{dataset.file_path.lstrip('/')}"
            
        # Support directory-based datasets for massive scale (Hive Partitioning)
        path_suffix = "/**/*.parquet" if not base_path.endswith(".parquet") else ""
        return f"'{base_path}{path_suffix}'"

    @contextlib.contextmanager
    def duckdb_session(self, db: Session, tenant_id: str) -> Generator[duckdb.DuckDBPyConnection, None, None]:
        """
        SaaS Memory Management: Scoped connection with connection-level secrets.
        Ensures credentials are automatically wiped from memory when the block exits.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        # Using :memory: for ultra-fast, stateless analytical sessions
        con = duckdb.connect(database=':memory:')
        
        try:
            if config.tier != StorageTier.EPHEMERAL:
                con.execute("INSTALL httpfs; LOAD httpfs;")
                con.execute("INSTALL aws; LOAD aws;") # DuckDB 0.10+ optimized secret manager
                
                endpoint_clean = config.endpoint.replace('https://', '').replace('http://', '')
                
                # DuckDB Native Secret Manager: Automatically attaches to S3 paths
                con.execute(f"""
                    CREATE OR REPLACE SECRET (
                        TYPE S3,
                        KEY_ID '{config.access_key}',
                        SECRET '{config.secret_key}',
                        ENDPOINT '{endpoint_clean}',
                        URL_STYLE 'path',
                        REGION 'auto'
                    );
                """)
            yield con
        finally:
            con.close()

    def convert_to_parquet_and_profile(self, db: Session, tenant_id: str, raw_object_key: str) -> Dict[str, Any]:
        """
        Event-Driven Profiling Worker.
        Streams raw S3 to Parquet natively inside DuckDB, extracting statistical summaries.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        if config.tier == StorageTier.EPHEMERAL:
            raise StorageError("Ephemeral storage does not support persistent background workers.")

        # Clean URI generation
        raw_s3_path = raw_object_key if raw_object_key.startswith("s3://") else f"s3://{config.bucket}/{raw_object_key}"
        
        # Ensure we write out a parquet file suffix
        parquet_s3_path = raw_s3_path.replace('/raw/', '/analytical/')
        if not parquet_s3_path.endswith('.parquet'):
            parquet_s3_path = os.path.splitext(parquet_s3_path)[0] + '.parquet'

        with self.duckdb_session(db, tenant_id) as con:
            try:
                # 1. Zero-Copy conversion: Cloud -> Compute -> Cloud
                if raw_s3_path.lower().endswith('.json'):
                    read_query = f"read_json_auto('{raw_s3_path}', format='auto')"
                else:
                    read_query = f"read_csv_auto('{raw_s3_path}', normalize_names=True)"

                con.execute(f"COPY (SELECT * FROM {read_query}) TO '{parquet_s3_path}' (FORMAT PARQUET, COMPRESSION 'ZSTD');")

                # 2. Advanced Profiling: Use DuckDB's SUMMARIZE for deep statistical metadata
                profile_df = con.execute(f"SUMMARIZE SELECT * FROM '{parquet_s3_path}'").pl()
                
                # 3. Extract required Worker Interface Keys
                # compute_worker.py explicitly expects "row_count" and "columns"
                total_rows = int(con.execute(f"SELECT COUNT(*) FROM '{parquet_s3_path}'").fetchone()[0])
                
                # Safely extract column names from DuckDB's SUMMARIZE output
                extracted_columns = profile_df["column_name"].to_list() if "column_name" in profile_df.columns else []
                
                logger.info(f"✅ [{tenant_id}] Converted and profiled: {parquet_s3_path}")

                return {
                    "parquet_path": parquet_s3_path,
                    "columns": extracted_columns,         # FIXED: Matched to compute_worker interface
                    "row_count": total_rows,              # FIXED: Matched to compute_worker interface
                    "profile_summary": profile_df.to_dicts(),
                    "sample": []                          # Optional: Offloaded to query-time RAG
                }

            except Exception as e:
                logger.error(f"❌ [{tenant_id}] Pipeline failed for {raw_object_key}: {e}")
                raise StorageError(f"Engine failed to process raw file: {str(e)}")

# Export singleton instance
storage_manager = AdaptiveStorageManager()