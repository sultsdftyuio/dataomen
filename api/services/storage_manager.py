import os
import logging
from dataclasses import dataclass
from typing import Optional
import boto3
import duckdb
from botocore.config import Config
from sqlalchemy.orm import Session

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
    """
    def __init__(self):
        # 1. Cloudflare R2 (Pro Tier)
        self.r2_endpoint = os.getenv("R2_ENDPOINT_URL")
        self.r2_bucket = os.getenv("R2_BUCKET_NAME", "dataomen-pro-data")
        self.r2_access = os.getenv("R2_ACCESS_KEY_ID")
        self.r2_secret = os.getenv("R2_SECRET_ACCESS_KEY")

        # 2. Supabase Storage (Free Tier - S3 Compatible API)
        # From Supabase Dashboard -> Storage -> Settings -> S3 Credentials
        self.supa_endpoint = os.getenv("SUPABASE_S3_ENDPOINT")
        self.supa_bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "default-datasets")
        self.supa_access = os.getenv("SUPABASE_S3_ACCESS_KEY")
        self.supa_secret = os.getenv("SUPABASE_S3_SECRET_KEY")

    def _resolve_tenant_config(self, db: Session, tenant_id: str) -> ResolvedStorage:
        """
        Interrogates the database to find the user's current billing/storage tier.
        Applies mathematical tenant_id jailing to strictly isolate data.
        """
        settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
        
        # Default to Supabase if no setting exists yet
        tier = settings.storage_tier if settings else StorageTier.SUPABASE
        
        # STRICT ISOLATION: DuckDB and Boto3 will ONLY ever see this folder
        prefix = f"tenants/{tenant_id}/"

        if tier == StorageTier.EPHEMERAL:
            # Ephemeral needs no S3 credentials
            return ResolvedStorage("", "", "", "", prefix, tier)

        elif tier == StorageTier.R2_PRO:
            return ResolvedStorage(
                self.r2_endpoint, self.r2_bucket, self.r2_access, self.r2_secret, prefix, tier
            )

        elif tier == StorageTier.BYOS and settings:
            # IMPORTANT: Add decryption logic here if keys are encrypted in Postgres
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
        Used primarily during the file upload/conversion phase.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        if config.tier == StorageTier.EPHEMERAL:
            raise ValueError("Ephemeral tier does not support persistent S3 uploads.")

        return boto3.client(
            's3',
            endpoint_url=config.endpoint,
            aws_access_key_id=config.access_key,
            aws_secret_access_key=config.secret_key,
            region_name="auto", # Required for R2 and Supabase
            config=Config(s3={'addressing_style': 'path'}) # Vital for Supabase compatibility
        )

    def get_duckdb_query_path(self, db: Session, dataset: Dataset, local_tmp_path: Optional[str] = None) -> str:
        """
        Calculates the optimal zero-copy path for DuckDB to execute against.
        Returns HTTP URLs for samples, Local /tmp/ for Ephemeral, or s3:// for persistent.
        """
        # 1. Zero-Copy Sample Data Pattern (Platform samples)
        if dataset.is_sample and dataset.sample_uri:
            return dataset.sample_uri

        # 2. Find their tier
        config = self._resolve_tenant_config(db, dataset.tenant_id)

        # 3. Ephemeral 'Try it now' Data (Lives only in Lambda/Vercel RAM)
        if config.tier == StorageTier.EPHEMERAL:
            if not local_tmp_path or not os.path.exists(local_tmp_path):
                raise FileNotFoundError("Ephemeral dataset missing from session. File must be re-uploaded.")
            return f"'{local_tmp_path}'" # Wrap in quotes for DuckDB SQL

        # 4. Persistent Data (S3 / R2 / BYOS)
        # duckdb expects the path without quotes when used via s3:// protocol
        return f"s3://{config.bucket}/{config.prefix}{dataset.file_path}"

    def setup_duckdb_connection(self, db: Session, tenant_id: str) -> duckdb.DuckDBPyConnection:
        """
        Spins up an ephemeral, in-memory DuckDB connection.
        Dynamically installs extensions and injects the user's specific tier credentials.
        """
        config = self._resolve_tenant_config(db, tenant_id)
        
        # Always launch entirely in-memory to prevent disk fragmentation on Vercel/Render
        con = duckdb.connect(database=':memory:')
        
        # If Ephemeral, we only need basic local CSV/Parquet reading capabilities
        if config.tier == StorageTier.EPHEMERAL:
            return con

        # Otherwise, load networking layers
        con.execute("INSTALL httpfs; LOAD httpfs;")
        con.execute("INSTALL aws; LOAD aws;")
        
        # DuckDB requires the protocol stripped from the endpoint
        endpoint_clean = config.endpoint.replace('https://', '').replace('http://', '')
        
        # Inject the correct credentials into the DuckDB session
        con.execute(f"SET s3_endpoint='{endpoint_clean}'")
        con.execute(f"SET s3_access_key_id='{config.access_key}'")
        con.execute(f"SET s3_secret_access_key='{config.secret_key}'")
        con.execute("SET s3_region='auto'")
        con.execute("SET s3_url_style='path'") # Ensures Supabase S3 compatibility
        
        return con

# Export singleton instance for easy dependency injection
storage_manager = AdaptiveStorageManager()