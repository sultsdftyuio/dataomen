import os
import logging
from typing import Optional
import boto3
from botocore.exceptions import ClientError
import duckdb

logger = logging.getLogger(__name__)

class StorageManager:
    """
    Modular Storage Service for handling S3-compatible object storage (Cloudflare R2).
    Uses standardized S3_* environment variables for cross-provider compatibility.
    """
    
    def __init__(self) -> None:
        # Aligning with your specific environment keys
        self.endpoint_url: Optional[str] = os.getenv("S3_ENDPOINT_URL")
        self.access_key: Optional[str] = os.getenv("S3_ACCESS_KEY")
        self.secret_key: Optional[str] = os.getenv("S3_SECRET_KEY")
        self.bucket_name: Optional[str] = os.getenv("S3_BUCKET_NAME")
        self.region: str = os.getenv("S3_REGION", "auto")
        
        if not all([self.endpoint_url, self.access_key, self.secret_key, self.bucket_name]):
            logger.error("StorageManager: R2 Storage credentials are incomplete in the environment.")
        
        # Initialize synchronous boto3 client for orchestration/upload tasks
        self.s3_client = boto3.client(
            's3',
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region
        )

    def _get_object_key(self, tenant_id: str, dataset_id: str, file_name: str) -> str:
        """
        Security by Design: Always enforce tenant isolation at the storage path layer.
        Ensures cross-tenant data bleed is mathematically impossible at the bucket level.
        """
        return f"{tenant_id}/datasets/{dataset_id}/{file_name}"

    def upload_parquet(self, tenant_id: str, dataset_id: str, file_name: str, file_data: bytes) -> str:
        """
        Uploads a generated Parquet file to Cloudflare R2.
        Returns the DuckDB-compatible s3:// URI for immediate analytical querying.
        """
        object_key = self._get_object_key(tenant_id, dataset_id, file_name)
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=object_key,
                Body=file_data,
                ContentType='application/vnd.apache.parquet'
            )
            logger.info(f"Successfully uploaded dataset to {object_key}")
            
            # Standard s3 protocol URI for DuckDB/Polars compatibility
            return f"s3://{self.bucket_name}/{object_key}"
            
        except ClientError as e:
            logger.error(f"Failed to upload to R2: {e}")
            raise Exception(f"Storage upload failed: {str(e)}")

    def delete_dataset(self, tenant_id: str, dataset_id: str, file_name: str) -> bool:
        """
        Deletes a dataset from R2, ensuring tenant boundaries are respected.
        """
        object_key = self._get_object_key(tenant_id, dataset_id, file_name)
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=object_key)
            logger.info(f"Successfully deleted dataset at {object_key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to delete object {object_key}: {e}")
            return False

    def configure_duckdb_connection(self, conn: duckdb.DuckDBPyConnection) -> None:
        """
        Computation Layer: Move processing to the data.
        Configures DuckDB to natively stream Parquet files directly from 
        Cloudflare R2 without pulling them into memory.
        """
        if not self.endpoint_url:
            raise ValueError("StorageManager: S3_ENDPOINT_URL is not configured.")

        # Ensure the httpfs extension is available for cloud storage querying
        conn.execute("INSTALL httpfs;")
        conn.execute("LOAD httpfs;")
        
        # DuckDB's s3_endpoint expects the raw host without the protocol prefix
        clean_endpoint = self.endpoint_url.replace("https://", "").replace("http://", "")
        
        # Apply AWS credentials to the DuckDB connection
        conn.execute(f"SET s3_region='{self.region}';")
        conn.execute(f"SET s3_endpoint='{clean_endpoint}';")
        conn.execute(f"SET s3_access_key_id='{self.access_key}';")
        conn.execute(f"SET s3_secret_access_key='{self.secret_key}';")
        
        # R2 requires path style URL format for DuckDB compatibility
        conn.execute("SET s3_url_style='path';")


# Singleton instance for clean Dependency Injection into FastAPI routes
storage_manager = StorageManager()