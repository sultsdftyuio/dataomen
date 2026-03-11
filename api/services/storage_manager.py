# api/services/storage_manager.py

import os
import uuid
import logging
import contextlib
import polars as pl
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Optional, Any, Dict, List, Union

import boto3
import duckdb
import fsspec
from botocore.config import Config
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

# Import modern models
from models import Dataset, TenantSettings, StorageTier

logger = logging.getLogger(__name__)

@dataclass
class ResolvedStorage:
    """Immutable data container holding the dynamically resolved storage layer config."""
    endpoint: str
    bucket: str
    access_key: str
    secret_key: str
    prefix: str
    tier: StorageTier


class AdaptiveStorageManager:
    """
    Core infrastructure router. Dynamically shifts multi-tenant operations between 
    Ephemeral memory, Supabase free-tier storage, Cloudflare R2 Pro, and BYOS.
    Supercharged with Native Polars Streaming and DuckDB Secure Secrets.
    """
    def __init__(self):
        # 1. Cloudflare R2 (Pro Tier - Highly Optimized for DuckDB)
        self.r2_endpoint = os.getenv("R2_ENDPOINT_URL")
        self.r2_bucket = os.getenv("R2_BUCKET_NAME", "dataomen-pro-data")
        self.r2_access = os.getenv("R2_ACCESS_KEY_ID")
        self.r2_secret = os.getenv("R2_SECRET_ACCESS_KEY")

        # 2. Supabase Storage (Free Tier - S3 Compatible API)
        self.supa_endpoint = os.getenv("SUPABASE_S3_ENDPOINT")
        self.supa_bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "default-datasets")
        self.supa_access = os.getenv("SUPABASE_S3_ACCESS_KEY")
        self.supa_secret = os.getenv("SUPABASE_S3_SECRET_KEY")

    def _resolve_tenant_config(self, db: Session, tenant_id: str) -> ResolvedStorage:
        """
        Interrogates the database to find the user's current billing/storage tier.
        Applies strict physical tenant_id isolation.
        """
        if not tenant_id:
            raise ValueError("Security Violation: tenant_id strictly required for storage resolution.")

        try:
            settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
            tier = settings.storage_tier if settings else StorageTier.SUPABASE
        except SQLAlchemyError as e:
            logger.error(f"Database error resolving tenant storage: {e}")
            tier = StorageTier.SUPABASE # Safe fallback

        # STRICT PHYSICAL PARTITIONING: The compute layers ONLY see this directory
        prefix = f"tenants/tenant_id={tenant_id}/"

        if tier == StorageTier.EPHEMERAL:
            return ResolvedStorage("", "", "", "", prefix, tier)
        elif tier == StorageTier.R2_PRO and self.r2_endpoint:
            return ResolvedStorage(self.r2_endpoint, self.r2_bucket, self.r2_access, self.r2_secret, prefix, tier)

        return ResolvedStorage(self.supa_endpoint, self.supa_bucket, self.supa_access, self.supa_secret, prefix, tier)

    def get_s3_client(self, db: Session, tenant_id: str):
        """Returns an optimized Boto3 client pointing to the user's resolved storage tier."""
        config = self._resolve_tenant_config(db, tenant_id)
        if config.tier == StorageTier.EPHEMERAL:
            raise ValueError("Ephemeral tier does not support persistent S3 access.")

        # High-concurrency tuning for serverless architectures
        boto_config = Config(
            s3={'addressing_style': 'path'}, 
            signature_version='s3v4',
            max_pool_connections=100,
            retries={'max_attempts': 3}
        )

        return boto3.client(
            's3',
            endpoint_url=config.endpoint,
            aws_access_key_id=config.access_key,
            aws_secret_access_key=config.secret_key,
            region_name="auto", 
            config=boto_config
        )

    def write_dataframe(self, db: Session, df: pl.DataFrame, tenant_id: str, dataset_id: str) -> str:
        """
        The Upgraded Computation Layer: Rust-Native Streaming Sink.
        Bypasses Python memory buffers to stream Polars directly to R2/S3.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        # Build deterministic Parquet key
        if not dataset_id.endswith(".parquet"):
            batch_id = uuid.uuid4().hex[:8]
            timestamp = int(datetime.now(timezone.utc).timestamp())
            object_key = f"{dataset_id}/batch_{timestamp}_{batch_id}.parquet"
        else:
            object_key = dataset_id

        full_s3_uri = f"s3://{config.bucket}/{config.prefix}datasets/{object_key}"
        
        try:
            # Hybrid Performance: Use Polars' native object_store (Rust)
            if config.tier != StorageTier.EPHEMERAL:
                storage_options = {
                    "aws_access_key_id": config.access_key,
                    "aws_secret_access_key": config.secret_key,
                    "aws_endpoint_url": config.endpoint,
                    "aws_region": "auto"
                }
                # use_pyarrow=False ensures we stay in Rust/C++ for the network IO
                df.write_parquet(full_s3_uri, compression="zstd", storage_options=storage_options, use_pyarrow=False)
            else:
                # Ephemeral memory write
                fs = fsspec.filesystem('memory')
                with fs.open(full_s3_uri, "wb") as f:
                    df.write_parquet(f, compression="zstd")
            
            logger.info(f"[{tenant_id}] Streamed optimized dataset -> {full_s3_uri}")
            return full_s3_uri

        except Exception as e:
            logger.error(f"Storage Write Exception (Tenant: {tenant_id}): {str(e)}")
            raise

    def get_duckdb_query_path(self, db: Session, dataset: Dataset) -> str:
        """Calculates the optimal zero-copy path for DuckDB, handles Hive-style partitioning."""
        if dataset.is_sample and dataset.sample_uri:
            return f"'{dataset.sample_uri}'"

        if dataset.file_path.startswith("s3://"):
            base_path = dataset.file_path
        else:
            config = self._resolve_tenant_config(db, dataset.tenant_id)
            base_path = f"s3://{config.bucket}/{config.prefix}{dataset.file_path.lstrip('/')}"
            
        # Support directory-based datasets for massive scale
        path_suffix = "/**/*.parquet" if not base_path.endswith(".parquet") else ""
        return f"'{base_path}{path_suffix}'"

    @contextlib.contextmanager
    def duckdb_session(self, db: Session, tenant_id: str):
        """
        SaaS Memory Management: Scoped connection with connection-level secrets and metadata caching.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        con = duckdb.connect(database=':memory:')
        
        try:
            if config.tier != StorageTier.EPHEMERAL:
                con.execute("INSTALL httpfs; LOAD httpfs;")
                # Analytical Efficiency: Cache parquet metadata to speed up frequent queries
                con.execute("PRAGMA parquet_metadata_cache=true;")
                
                endpoint_clean = config.endpoint.replace('https://', '').replace('http://', '')
                
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
        Streams raw S3 to Parquet natively inside DuckDB.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        if config.tier == StorageTier.EPHEMERAL:
            raise ValueError("Ephemeral storage does not support persistent background workers.")

        parquet_key = raw_object_key.replace('/raw/', '/analytical/')
        if not parquet_key.endswith('.parquet'):
            parquet_key = os.path.splitext(parquet_key)[0] + '.parquet'

        raw_s3_path = f"s3://{config.bucket}/{raw_object_key}"
        parquet_s3_path = f"s3://{config.bucket}/{parquet_key}"

        with self.duckdb_session(db, tenant_id) as con:
            try:
                # 1. Direct stream: Cloud -> Compute -> Cloud (no local disk overhead)
                if raw_object_key.lower().endswith('.csv'):
                    read_query = f"read_csv_auto('{raw_s3_path}', normalize_names=True)"
                elif raw_object_key.lower().endswith('.json'):
                    read_query = f"read_json_auto('{raw_s3_path}')"
                else:
                    read_query = f"read_csv_auto('{raw_s3_path}', normalize_names=True)"

                con.execute(f"COPY (SELECT * FROM {read_query}) TO '{parquet_s3_path}' (FORMAT PARQUET, COMPRESSION 'ZSTD');")

                # 2. Vectorized Schema & Sample Extraction via Polars
                metadata = con.execute(f"DESCRIBE SELECT * FROM '{parquet_s3_path}';").pl()
                columns_info = [{"name": row["column_name"], "type": row["column_type"]} for row in metadata.to_dicts()]
                
                sample_df = con.execute(f"SELECT * FROM '{parquet_s3_path}' LIMIT 3;").pl()

                return {
                    "parquet_path": parquet_key,
                    "columns": columns_info,
                    "sample": sample_df.to_dicts()
                }

            except Exception as e:
                logger.error(f"Parquet pipeline failed for {raw_object_key}: {e}")
                raise

# Export singleton instance
storage_manager = AdaptiveStorageManager()