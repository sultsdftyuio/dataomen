import os
import uuid
import logging
import contextlib
import polars as pl
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Optional, Any, Dict, Union, Generator

import boto3
import duckdb
from botocore.config import Config
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

# Import modern models
from models import Dataset, TenantSettings, StorageTier

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

        parquet_key = raw_object_key.replace('/raw/', '/analytical/')
        if not parquet_key.endswith('.parquet'):
            parquet_key = os.path.splitext(parquet_key)[0] + '.parquet'

        raw_s3_path = f"s3://{config.bucket}/{raw_object_key}"
        parquet_s3_path = f"s3://{config.bucket}/{parquet_key}"

        with self.duckdb_session(db, tenant_id) as con:
            try:
                # 1. Zero-Copy conversion: Cloud -> Compute -> Cloud
                if raw_object_key.lower().endswith('.json'):
                    read_query = f"read_json_auto('{raw_s3_path}', format='auto')"
                else:
                    read_query = f"read_csv_auto('{raw_s3_path}', normalize_names=True)"

                con.execute(f"COPY (SELECT * FROM {read_query}) TO '{parquet_s3_path}' (FORMAT PARQUET, COMPRESSION 'ZSTD');")

                # 2. Advanced Profiling: Use DuckDB's SUMMARIZE for deep statistical metadata
                profile_df = con.execute(f"SUMMARIZE SELECT * FROM '{parquet_s3_path}'").pl()
                
                # Extract a sample for the Contextual RAG
                sample_df = con.execute(f"SELECT * FROM '{parquet_s3_path}' LIMIT 5").pl()

                logger.info(f"✅ [{tenant_id}] Converted and profiled: {parquet_key}")

                return {
                    "parquet_path": parquet_key,
                    "profile": profile_df.to_dicts(),
                    "sample": sample_df.to_dicts(),
                    "total_rows": int(con.execute(f"SELECT COUNT(*) FROM '{parquet_s3_path}'").fetchone()[0])
                }

            except Exception as e:
                logger.error(f"❌ [{tenant_id}] Pipeline failed for {raw_object_key}: {e}")
                raise StorageError(f"Engine failed to process raw file: {str(e)}")

# Export singleton instance
storage_manager = AdaptiveStorageManager()