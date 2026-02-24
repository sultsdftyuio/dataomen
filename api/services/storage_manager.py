import os
import boto3
import logging
import uuid
import pandas as pd
from botocore.exceptions import ClientError
from pathlib import Path

logger = logging.getLogger(__name__)

class S3StorageManager:
    """
    Handles secure, tenant-isolated uploading of analytical datasets 
    to Cloudflare R2 or AWS S3.
    """

    def __init__(self):
        # We use boto3 which works natively with both AWS S3 and Cloudflare R2.
        # For Cloudflare R2, you just provide the endpoint_url in your .env
        self.s3_client = boto3.client(
            's3',
            endpoint_url=os.getenv("S3_ENDPOINT_URL"),
            aws_access_key_id=os.getenv("S3_ACCESS_KEY"),
            aws_secret_access_key=os.getenv("S3_SECRET_KEY"),
            region_name=os.getenv("S3_REGION", "auto")
        )
        self.bucket_name = os.getenv("S3_BUCKET_NAME", "dataomen-analytics")

    def upload_dataframe(self, df: pd.DataFrame, tenant_id: uuid.UUID, dataset_id: uuid.UUID) -> str:
        """
        Converts a Pandas DataFrame to Parquet and uploads it to isolated tenant storage.
        Returns the s3:// URI for DuckDB to query later.
        """
        # 1. Define the strictly isolated storage path
        object_key = f"tenants/{tenant_id}/datasets/{dataset_id}.parquet"
        
        # 2. Write to a temporary Parquet file locally first.
        # We do this instead of in-memory (BytesIO) to prevent server RAM exhaustion on 50MB+ files.
        temp_parquet_path = Path(f"/tmp/{dataset_id}.parquet")
        
        try:
            # Convert to Parquet using the pyarrow engine (highly optimized)
            logger.info(f"Compressing DataFrame to Parquet for Dataset {dataset_id}")
            df.to_parquet(temp_parquet_path, engine='pyarrow', index=False)
            
            # 3. Stream the file to Object Storage
            logger.info(f"Uploading to Object Storage at {object_key}")
            self.s3_client.upload_file(
                Filename=str(temp_parquet_path),
                Bucket=self.bucket_name,
                Key=object_key
            )
            
            # The exact URI format DuckDB requires to read directly from S3/R2
            s3_uri = f"s3://{self.bucket_name}/{object_key}"
            return s3_uri

        except ClientError as e:
            logger.error(f"S3 Upload failed for {dataset_id}: {e}")
            raise Exception("Failed to upload dataset to cloud storage.")
            
        finally:
            # 4. Security & Cleanup: Always delete local temporary files
            if temp_parquet_path.exists():
                temp_parquet_path.unlink()
            
            original_csv = Path(f"/tmp/dataomen_uploads/{dataset_id}.csv")
            if original_csv.exists():
                original_csv.unlink()