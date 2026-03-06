import os
import logging
from dataclasses import dataclass
from typing import Optional, Any, Union
import boto3
import duckdb
import fsspec
from botocore.config import Config
from sqlalchemy.orm import Session

# Import modern models
from models import Dataset, TenantSettings, StorageTier

# Optional imports for type hinting Vectorized engines (Phase 2 Readiness)
try:
    import pandas as pd
    import polars as pl
    DATAFRAME_TYPE = Union[pd.DataFrame, pl.DataFrame, Any]
except ImportError:
    DATAFRAME_TYPE = Any

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
    Now supercharged with fsspec for zero-copy Polars/Pandas transit.
    """
    def __init__(self):
        # 1. Cloudflare R2 (Pro Tier)
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
        Applies mathematical tenant_id jailing to strictly isolate data.
        """
        if not tenant_id:
            raise ValueError("Security Violation: tenant_id strictly required for storage resolution.")

        settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
        
        # Default to Supabase if no setting exists yet
        tier = settings.storage_tier if settings else StorageTier.SUPABASE
        
        # 1.2 STRICT PHYSICAL PARTITIONING: DuckDB and Boto3/fsspec will ONLY ever see this folder
        prefix = f"tenants/tenant_id={tenant_id}/"

        if tier == StorageTier.EPHEMERAL:
            # Ephemeral needs no S3 credentials
            return ResolvedStorage("", "", "", "", prefix, tier)

        elif tier == StorageTier.R2_PRO:
            return ResolvedStorage(
                self.r2_endpoint, self.r2_bucket, self.r2_access, self.r2_secret, prefix, tier
            )

        elif tier == StorageTier.BYOS and settings:
            # Note: BYOS Keys should ideally be decrypted here if encrypted at rest in Postgres
            return ResolvedStorage(
                settings.byos_endpoint, settings.byos_bucket, 
                settings.byos_access_key, settings.byos_secret_key, 
                prefix, tier
            )

        # Fallback to Supabase S3
        return ResolvedStorage(
            self.supa_endpoint, self.supa_bucket, self.supa_access, self.supa_secret, prefix, tier
        )

    def get_fsspec_fs(self, db: Session, tenant_id: str) -> fsspec.AbstractFileSystem:
        """
        1.1 Data Modularity: Returns a zero-copy filesystem interface.
        Allows Polars/Pandas to stream bytes directly to/from object storage without local files.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        if config.tier == StorageTier.EPHEMERAL:
            return fsspec.filesystem('memory')

        storage_options = {
            "key": config.access_key,
            "secret": config.secret_key,
            "client_kwargs": {"endpoint_url": config.endpoint}
        }
        return fsspec.filesystem('s3', **storage_options)

    def write_dataframe(self, db: Session, df: DATAFRAME_TYPE, tenant_id: str, dataset_id: str, format: str = "parquet") -> str:
        """
        Vectorized Write Engine. Streams a Pandas or Polars dataframe directly 
        to the modular storage vector in columnar format. 
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        # Format routing prepares the directory structure for Apache Iceberg / Delta Lake
        base_uri = f"s3://{config.bucket}/{config.prefix}datasets/{dataset_id}"
        file_path = f"{base_uri}/" if format in ["delta", "iceberg"] else f"{base_uri}/data.parquet"

        if config.tier == StorageTier.EPHEMERAL:
            # For ephemeral, we write to the local tmp mount so DuckDB can read it transiently
            file_path = f"/tmp/{config.prefix}datasets/{dataset_id}/data.parquet"
            os.makedirs(os.path.dirname(file_path), exist_ok=True)

        try:
            if format == "parquet":
                # Polars Vectorized Engine (Fastest)
                if hasattr(df, "write_parquet"):
                    if config.tier == StorageTier.EPHEMERAL:
                        df.write_parquet(file_path)
                    else:
                        fs = self.get_fsspec_fs(db, tenant_id)
                        with fs.open(file_path, mode='wb') as f:
                            df.write_parquet(f)
                            
                # Pandas DataFrame (Fallback)
                elif hasattr(df, "to_parquet"):
                    if config.tier == StorageTier.EPHEMERAL:
                        df.to_parquet(file_path, engine='pyarrow', index=False)
                    else:
                        storage_options = {
                            "key": config.access_key,
                            "secret": config.secret_key,
                            "client_kwargs": {"endpoint_url": config.endpoint}
                        }
                        df.to_parquet(file_path, storage_options=storage_options, engine='pyarrow', index=False)
                else:
                    raise TypeError("Compute Error: Provided object is not a supported DataFrame type (Pandas/Polars).")
                    
            else:
                raise NotImplementedError(f"Table format '{format}' writes are not active in this pipeline phase.")
            
            logger.info(f"Successfully wrote dataset '{dataset_id}' for tenant '{tenant_id}' to {file_path}")
            return file_path
            
        except Exception as e:
            logger.error(f"Storage Write Exception (Tenant: {tenant_id}, Dataset: {dataset_id}): {str(e)}")
            raise e

    def get_s3_client(self, db: Session, tenant_id: str):
        """
        Returns a Boto3 client pointing to the user's resolved storage tier.
        Maintained for generating presigned URLs or low-level API operations.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        if config.tier == StorageTier.EPHEMERAL:
            raise ValueError("Ephemeral tier does not support persistent S3 access.")

        return boto3.client(
            's3',
            endpoint_url=config.endpoint,
            aws_access_key_id=config.access_key,
            aws_secret_access_key=config.secret_key,
            region_name="auto", 
            config=Config(s3={'addressing_style': 'path'})
        )

    def get_duckdb_query_path(self, db: Session, dataset: Dataset, local_tmp_path: Optional[str] = None) -> str:
        """
        Calculates the optimal zero-copy path for DuckDB to execute against.
        Returns HTTP URLs for samples, Local /tmp/ for Ephemeral, or s3:// for persistent.
        """
        if dataset.is_sample and dataset.sample_uri:
            return dataset.sample_uri

        config = self._resolve_tenant_config(db, dataset.tenant_id)

        if config.tier == StorageTier.EPHEMERAL:
            if not local_tmp_path or not os.path.exists(local_tmp_path):
                raise FileNotFoundError("Ephemeral dataset missing from Vercel/Lambda session. File must be re-uploaded.")
            return f"'{local_tmp_path}'" 

        # DuckDB natively reads s3:// URIs when the httpfs and aws extensions are loaded
        return f"s3://{config.bucket}/{config.prefix}{dataset.file_path}"

    def setup_duckdb_connection(self, db: Session, tenant_id: str) -> duckdb.DuckDBPyConnection:
        """
        1.3 Programmatic RLS Environment:
        Spins up an ephemeral, in-memory DuckDB connection.
        Dynamically installs extensions and injects the user's isolated tier credentials.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        # Hybrid Performance Paradigm: Always entirely in-memory compute
        con = duckdb.connect(database=':memory:')
        
        if config.tier == StorageTier.EPHEMERAL:
            return con

        # Load zero-copy networking layers
        con.execute("INSTALL httpfs; LOAD httpfs;")
        con.execute("INSTALL aws; LOAD aws;")
        
        endpoint_clean = config.endpoint.replace('https://', '').replace('http://', '')
        
        # Inject the jailed credentials
        con.execute(f"SET s3_endpoint='{endpoint_clean}'")
        con.execute(f"SET s3_access_key_id='{config.access_key}'")
        con.execute(f"SET s3_secret_access_key='{config.secret_key}'")
        con.execute("SET s3_region='auto'")
        con.execute("SET s3_url_style='path'") 
        
        return con

# Export singleton instance for easy dependency injection
storage_manager = AdaptiveStorageManager()