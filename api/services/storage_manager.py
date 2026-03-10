# api/services/storage_manager.py

import os
import uuid
import logging
import contextlib
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, Any, Dict, List, Union

import boto3
import duckdb
import fsspec
from botocore.config import Config
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

# Import modern models (ensure these align with your schema)
from models import Dataset, TenantSettings, StorageTier

try:
    import pandas as pd
    import polars as pl
except ImportError:
    pass

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
        Applies strict mathematical tenant_id jailing to isolate data.
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

    def get_fsspec_fs(self, db: Session, tenant_id: str) -> fsspec.AbstractFileSystem:
        """Unified filesystem interface for generic operations or memory fallbacks."""
        config = self._resolve_tenant_config(db, tenant_id)
        if config.tier == StorageTier.EPHEMERAL:
            return fsspec.filesystem('memory')

        storage_options = {
            "key": config.access_key,
            "secret": config.secret_key,
            "client_kwargs": {"endpoint_url": config.endpoint}
        }
        return fsspec.filesystem('s3', **storage_options)

    # --------------------------------------------------------------------------
    # Phase 2: Ingestion & Parquet Pipeline Operations
    # --------------------------------------------------------------------------

    def write_dataframe(self, db: Session, df: Any, tenant_id: str, dataset_id: str, format: str = "parquet") -> str:
        """
        The Upgraded Computation Layer: Rust-Native Streaming Sink.
        Bypasses Python memory buffers to stream Polars directly to R2/S3.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        if not dataset_id.endswith(".parquet"):
            batch_id = uuid.uuid4().hex[:8]
            timestamp = int(datetime.utcnow().timestamp())
            object_key = f"{dataset_id}/batch_{timestamp}_{batch_id}.parquet"
        else:
            object_key = dataset_id

        full_s3_uri = f"s3://{config.bucket}/{config.prefix}datasets/{object_key}"
        
        try:
            if format == "parquet" and hasattr(df, "write_parquet"):
                # Hybrid Performance: Use Polars' native object_store (Rust) when hitting cloud storage
                if config.tier != StorageTier.EPHEMERAL:
                    storage_options = {
                        "aws_access_key_id": config.access_key,
                        "aws_secret_access_key": config.secret_key,
                        "aws_endpoint_url": config.endpoint,
                        "aws_region": "auto"
                    }
                    df.write_parquet(full_s3_uri, compression="zstd", storage_options=storage_options)
                else:
                    # Fallback to fsspec memory filesystem for ephemeral layer
                    fs = self.get_fsspec_fs(db, tenant_id)
                    with fs.open(full_s3_uri, "wb") as f:
                        df.write_parquet(f, compression="zstd")
            else:
                raise TypeError("Compute Error: Requires Polars/Pandas DataFrame and Parquet format.")
            
            logger.debug(f"[{tenant_id}] Wrote optimized dataset -> {full_s3_uri}")
            return full_s3_uri

        except Exception as e:
            logger.error(f"Storage Write Exception (Tenant: {tenant_id}): {str(e)}")
            raise

    def get_duckdb_query_path(self, db: Session, dataset: Dataset) -> str:
        """Calculates the optimal zero-copy path for DuckDB, gracefully handling absolute URIs."""
        if dataset.is_sample and dataset.sample_uri:
            return f"'{dataset.sample_uri}'"

        # Fix: Prevent double-prefixing if the DB already stores the absolute S3 URI
        if dataset.file_path.startswith("s3://"):
            base_path = dataset.file_path
        else:
            config = self._resolve_tenant_config(db, dataset.tenant_id)
            base_path = f"s3://{config.bucket}/{config.prefix}{dataset.file_path.lstrip('/')}"
            
        path_suffix = "/**/*.parquet" if not base_path.endswith(".parquet") else ""
        return f"'{base_path}{path_suffix}'"

    @contextlib.contextmanager
    def duckdb_session(self, db: Session, tenant_id: str):
        """
        SaaS Memory Management: Scoped connection with connection-level secrets.
        Ensures tenant isolation without polluting a global DuckDB instance.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        con = duckdb.connect(database=':memory:')
        
        try:
            if config.tier != StorageTier.EPHEMERAL:
                # Load HTTPFS (avoids slow network INSTALL if already cached/pre-installed in container)
                con.execute("INSTALL httpfs; LOAD httpfs;")
                
                endpoint_clean = config.endpoint.replace('https://', '').replace('http://', '')
                
                # Security by Design: Anonymous S3 secret mapped solely to this connection lifecycle
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
        Streams raw S3 to Parquet natively inside DuckDB, mapping Schema for Semantic Routing.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        if config.tier == StorageTier.EPHEMERAL:
            raise ValueError("Ephemeral storage does not support persistent background workers.")

        parquet_key = raw_object_key.replace('/raw/', '/analytical/')
        for ext in ['.csv', '.xlsx', '.xls', '.json']:
            if parquet_key.lower().endswith(ext):
                parquet_key = parquet_key[:parquet_key.rfind(ext)] + '.parquet'
                break
        else:
            if not parquet_key.endswith('.parquet'):
                parquet_key += '.parquet'

        raw_s3_path = f"s3://{config.bucket}/{raw_object_key}"
        parquet_s3_path = f"s3://{config.bucket}/{parquet_key}"

        with self.duckdb_session(db, tenant_id) as con:
            try:
                # 1. Vectorized Conversion via DuckDB Compute Engine
                if raw_object_key.lower().endswith('.csv'):
                    read_query = f"read_csv_auto('{raw_s3_path}', normalize_names=True)"
                elif raw_object_key.lower().endswith('.json'):
                    read_query = f"read_json_auto('{raw_s3_path}')"
                else:
                    read_query = f"read_csv_auto('{raw_s3_path}', normalize_names=True)"

                # Direct stream: Cloud -> Compute -> Cloud (no local disk overhead)
                con.execute(f"""
                    COPY (SELECT * FROM {read_query}) 
                    TO '{parquet_s3_path}' (FORMAT PARQUET, COMPRESSION 'ZSTD');
                """)

                # 2. Schema Extraction (Contextual RAG Prep)
                metadata_rows = con.execute(f"DESCRIBE SELECT * FROM '{parquet_s3_path}';").fetchall()
                columns_info = [{"name": row[0], "type": row[1]} for row in metadata_rows]
                
                sample_query = con.execute(f"SELECT * FROM '{parquet_s3_path}' LIMIT 3;")
                col_names = [col[0] for col in sample_query.description]
                sample_rows = [dict(zip(col_names, row)) for row in sample_query.fetchall()]

                return {
                    "parquet_path": parquet_key,
                    "columns": columns_info,
                    "sample": sample_rows
                }

            except Exception as e:
                logger.error(f"Parquet pipeline failed for {raw_object_key}: {e}")
                raise Exception(f"Failed to process dataset pipeline: {str(e)}")

# Export singleton instance for dependency injection
storage_manager = AdaptiveStorageManager()