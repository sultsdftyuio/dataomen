import os
import boto3
from botocore.exceptions import ClientError
from botocore.client import Config
import logging
from typing import BinaryIO, Dict, Any
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

class StorageManager:
    """
    A modular, swappable storage interface. 
    Currently configured for Cloudflare R2 (S3 compatible) to guarantee 
    $0 egress bandwidth when pulling heavy analytics files into Render.
    """
    def __init__(self):
        # 1. Load credentials from environment variables securely
        self.account_id = os.getenv("R2_ACCOUNT_ID")
        self.access_key = os.getenv("R2_ACCESS_KEY_ID")
        self.secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("R2_BUCKET_NAME", "dataomen-datasets")

        if not all([self.account_id, self.access_key, self.secret_key]):
            logger.warning("StorageManager: R2 Credentials are not fully set in the environment.")

        # 2. Cloudflare R2 uses the standard S3 API, but requires a specific endpoint
        endpoint_url = f"https://{self.account_id}.r2.cloudflarestorage.com"
        
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            config=Config(signature_version="s3v4"),
            region_name="auto"  # R2 typically uses 'auto' for region routing
        )

    def generate_presigned_upload_url(self, tenant_id: str, filename: str, expiration: int = 3600) -> Dict[str, Any]:
        """
        Security by Design: Generates a secure, temporary URL for the Next.js frontend
        to upload directly to Cloudflare R2, bypassing Render memory limits.
        """
        # Enforce multi-tenant partitioning in the storage bucket
        safe_filename = filename.replace(" ", "_")
        object_name = f"{tenant_id}/{safe_filename}"
        
        try:
            response = self.s3_client.generate_presigned_post(
                Bucket=self.bucket_name,
                Key=object_name,
                # Force the upload to match our tenant partition
                Conditions=[
                    ["starts-with", "$key", f"{tenant_id}/"]
                ],
                ExpiresIn=expiration
            )
            return {
                "url": response["url"],
                "fields": response["fields"],
                "storage_path": object_name
            }
        except ClientError as e:
            logger.error(f"Failed to generate R2 presigned URL: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not securely provision storage allocation."
            )

    def download_to_stream(self, storage_path: str, file_obj: BinaryIO) -> None:
        """
        Pulls the dataset from R2 into memory (or a SpooledTemporaryFile) 
        for DuckDB/Pandas to vectorize. Cloudflare to Render transfer is free.
        """
        try:
            self.s3_client.download_fileobj(self.bucket_name, storage_path, file_obj)
            # Reset pointer to the beginning of the file so DuckDB/Pandas can read it
            file_obj.seek(0)
        except ClientError as e:
            logger.error(f"Failed to fetch {storage_path} from R2: {e}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dataset not found or corrupted."
            )
            
    def get_presigned_download_url(self, storage_path: str, expiration: int = 3600) -> str:
        """
        Generates a URL if you need the frontend to download a processed 
        Parquet file directly from Cloudflare edge nodes.
        """
        try:
            response = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': storage_path},
                ExpiresIn=expiration
            )
            return response
        except ClientError as e:
            logger.error(f"Failed to generate R2 download URL: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not generate download link."
            )


# Dependency Injection Provider for FastAPI Routes
def get_storage_manager() -> StorageManager:
    return StorageManager()