# api/services/storage_manager.py
import os
import uuid
import logging
from dataclasses import dataclass
from typing import Optional, Any, Dict, List
import boto3
import duckdb
import fsspec
from botocore.config import Config
from sqlalchemy.orm import Session

# Import modern models
from models import Dataset, TenantSettings, StorageTier

# Optional imports for type hinting Vectorized engines & pyarrow for partitioned data lake writes
try:
    import pandas as pd
    import polars as pl
    import pyarrow as pa
    import pyarrow.dataset as ds
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
    Now supercharged with PyArrow Dataset API for Hive-partitioned Data Lake writes.
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
            config=Config(s3={'addressing_style': 'path'}, signature_version='s3v4')
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

    # --------------------------------------------------------------------------
    # Phase 2: Ingestion & Parquet Pipeline Operations
    # --------------------------------------------------------------------------

    def generate_presigned_url(self, db: Session, tenant_id: str, file_name: str) -> Dict[str, str]:
        """
        Direct-to-Object Storage: Generates an upload URL allowing the frontend 
        to bypass the backend API. Enforces Security by Design via tenant_id prefix.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        if config.tier == StorageTier.EPHEMERAL:
            raise ValueError("Ephemeral storage does not support direct browser uploads via Presigned URLs.")

        s3_client = self.get_s3_client(db, tenant_id)
        
        # Security: Unique ID to prevent overwrites, strip unsafe characters
        unique_id = str(uuid.uuid4())[:8]
        clean_name = "".join(c for c in file_name if c.isalnum() or c in ".-_")
        
        object_key = f"{config.prefix}raw/{unique_id}_{clean_name}"

        try:
            url = s3_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': config.bucket,
                    'Key': object_key,
                    'ContentType': 'application/octet-stream'
                },
                ExpiresIn=3600
            )
            return {"upload_url": url, "object_key": object_key}
        except Exception as e:
            logger.error(f"Failed to generate presigned URL for tenant {tenant_id}: {e}")
            raise Exception("Storage error generating presigned URL")

    def convert_to_parquet_and_profile(self, db: Session, tenant_id: str, raw_object_key: str) -> Dict[str, Any]:
        """
        Event-Driven Profiling Worker:
        Uses DuckDB HTTPFS to stream the raw S3 object, auto-sanitize names, 
        rewrite to S3 as ZSTD Parquet, and extract RAG Context Metadata.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        if config.tier == StorageTier.EPHEMERAL:
            raise ValueError("Ephemeral storage does not support persistent background workers.")

        # Determine output path
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

        # Utilize existing secure, isolated DuckDB setup
        con = self.setup_duckdb_connection(db, tenant_id)
        
        try:
            # 1. Vectorized Conversion (Memory Efficient Streaming)
            if raw_object_key.lower().endswith('.csv'):
                read_query = f"read_csv_auto('{raw_s3_path}', normalize_names=True)"
            elif raw_object_key.lower().endswith(('.xlsx', '.xls')):
                con.execute("INSTALL spatial; LOAD spatial;")
                read_query = f"st_read('{raw_s3_path}')"
            elif raw_object_key.lower().endswith('.json'):
                 read_query = f"read_json_auto('{raw_s3_path}')"
            else:
                read_query = f"read_csv_auto('{raw_s3_path}', normalize_names=True)"

            con.execute(f"""
                COPY (SELECT * FROM {read_query}) 
                TO '{parquet_s3_path}' (FORMAT PARQUET, COMPRESSION 'ZSTD');
            """)

            # 2. Schema Extraction (Zero-Dependency RAG Prep)
            metadata_rows = con.execute(f"DESCRIBE SELECT * FROM '{parquet_s3_path}';").fetchall()
            columns_info = [{"name": row[0], "type": row[1]} for row in metadata_rows]
            
            # Extract sample rows
            sample_query = con.execute(f"SELECT * FROM '{parquet_s3_path}' LIMIT 3;")
            sample_data = sample_query.fetchall()
            col_names = [col[0] for col in sample_query.description]
            sample_rows = [dict(zip(col_names, row)) for row in sample_data]

            return {
                "parquet_path": parquet_key,
                "columns": columns_info,
                "sample": sample_rows
            }

        except Exception as e:
            logger.error(f"Parquet pipeline failed for {raw_object_key}: {e}")
            raise Exception(f"Failed to process dataset pipeline: {str(e)}")
        finally:
            con.close()

    # --------------------------------------------------------------------------
    # The Upgraded Computation Layer: Hive-Partitioned Write Engine
    # --------------------------------------------------------------------------

    def write_dataframe(self, db: Session, df: Any, tenant_id: str, dataset_id: str, 
                        format: str = "parquet", partition_cols: Optional[List[str]] = None) -> str:
        """
        Vectorized Write Engine with Hive Partitioning. 
        Streams a Pandas or Polars dataframe directly to Cloudflare R2.
        If partition_cols are provided (e.g., ["year", "month"]), it writes a directory structure 
        optimized for DuckDB predicate pushdown.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        base_uri = f"s3://{config.bucket}/{config.prefix}datasets/{dataset_id}"
        
        if config.tier == StorageTier.EPHEMERAL:
            base_uri = f"/tmp/{config.prefix}datasets/{dataset_id}"
            os.makedirs(base_uri, exist_ok=True)

        try:
            if format == "parquet":
                # Convert Polars to PyArrow Table for zero-copy partitioned writing
                if hasattr(df, "to_arrow"):
                    arrow_table = df.to_arrow()
                elif hasattr(df, "to_parquet"): # Pandas fallback
                    import pyarrow as pa
                    arrow_table = pa.Table.from_pandas(df)
                else:
                    raise TypeError("Compute Error: Provided object is not a supported DataFrame type.")

                if config.tier == StorageTier.EPHEMERAL:
                    ds.write_dataset(
                        arrow_table, 
                        base_uri, 
                        format="parquet", 
                        partitioning=partition_cols,
                        existing_data_behavior="overwrite_or_ignore"
                    )
                else:
                    fs = self.get_fsspec_fs(db, tenant_id)
                    # Use PyArrow dataset writer over the fsspec filesystem interface
                    ds.write_dataset(
                        arrow_table, 
                        base_uri, 
                        filesystem=fs, 
                        format="parquet", 
                        partitioning=partition_cols,
                        existing_data_behavior="overwrite_or_ignore"
                    )
                    
            else:
                raise NotImplementedError(f"Table format '{format}' writes are not active in this pipeline phase.")
            
            logger.info(f"Successfully wrote partitioned dataset '{dataset_id}' for tenant '{tenant_id}' to {base_uri}")
            return base_uri
            
        except Exception as e:
            logger.error(f"Storage Write Exception (Tenant: {tenant_id}, Dataset: {dataset_id}): {str(e)}")
            raise e

    def get_duckdb_query_path(self, db: Session, dataset: Dataset, local_tmp_path: Optional[str] = None) -> str:
        """
        Calculates the optimal zero-copy path for DuckDB to execute against.
        Now supports glob-based directory reading (/**/*.parquet) for Hive-partitioned folders.
        """
        if dataset.is_sample and dataset.sample_uri:
            return f"'{dataset.sample_uri}'"

        config = self._resolve_tenant_config(db, dataset.tenant_id)

        # Check if the file_path is a directory (partitioned) or a single file
        path_suffix = "/**/*.parquet" if not dataset.file_path.endswith(".parquet") else ""

        if config.tier == StorageTier.EPHEMERAL:
            if not local_tmp_path:
                local_path = f"/tmp/{config.prefix}{dataset.file_path}"
            else:
                local_path = local_tmp_path
                
            if not os.path.exists(local_path.replace('/**/*.parquet', '')):
                raise FileNotFoundError("Ephemeral dataset missing from session. File must be re-uploaded.")
            
            return f"'{local_path}{path_suffix}'" 

        # DuckDB natively reads partitioned s3:// URIs and extracts partition columns automatically
        return f"'s3://{config.bucket}/{config.prefix}{dataset.file_path}{path_suffix}'"

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