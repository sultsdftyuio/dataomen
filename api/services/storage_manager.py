import os
import logging
from typing import List, Optional
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

logger = logging.getLogger(__name__)

class StorageManager:
    """
    Modular Strategy:
    Encapsulates all blob storage interactions. The rest of the application
    does not need to know if we are using Cloudflare R2, AWS S3, or MinIO.
    """
    def __init__(self):
        self.bucket_name = os.getenv("STORAGE_BUCKET_NAME", "dataomen-datasets")
        
        # Configure boto3 to use path-style addressing which is safer for R2/Custom S3
        boto_config = Config(
            signature_version='s3v4',
            retries={'max_attempts': 3, 'mode': 'standard'}
        )
        
        self.s3_client = boto3.client(
            's3',
            endpoint_url=os.getenv("STORAGE_ENDPOINT_URL"), # e.g., https://<id>.r2.cloudflarestorage.com
            aws_access_key_id=os.getenv("STORAGE_ACCESS_KEY"),
            aws_secret_access_key=os.getenv("STORAGE_SECRET_KEY"),
            region_name=os.getenv("STORAGE_REGION", "auto"),
            config=boto_config
        )

    def generate_presigned_upload_url(self, file_key: str, expiration_seconds: int = 3600) -> str:
        """
        Security by Design:
        Grants a temporary, scoped write-access URL specifically for the frontend.
        Prevents the FastAPI instance from running out of RAM by handling raw file bytes.
        """
        try:
            response = self.s3_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': file_key,
                    'ContentType': 'application/octet-stream'
                },
                ExpiresIn=expiration_seconds
            )
            return response
        except ClientError as e:
            logger.error(f"Failed to generate presigned upload URL for {file_key}: {e}")
            raise Exception(f"Cloud storage handshake failed: {str(e)}")

    def generate_presigned_download_url(self, file_key: str, expiration_seconds: int = 3600) -> str:
        """
        Analytical Efficiency:
        Used by DuckDB / in-process analytical engines to stream data via HTTPFS
        directly from cloud storage, minimizing memory overhead.
        """
        try:
            response = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': file_key
                },
                ExpiresIn=expiration_seconds
            )
            return response
        except ClientError as e:
            logger.error(f"Failed to generate presigned download URL for {file_key}: {e}")
            raise Exception(f"Failed to retrieve secure data stream: {str(e)}")

    def list_files(self, prefix: str) -> List[str]:
        """
        Security by Design:
        Enforces tenant isolation by specifically listing files under a tenant prefix.
        """
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            if 'Contents' not in response:
                return []
                
            return [obj['Key'] for obj in response['Contents']]
        except ClientError as e:
            logger.error(f"Failed to list files for prefix {prefix}: {e}")
            raise Exception("Failed to retrieve dataset listing.")

    def delete_file(self, file_key: str) -> bool:
        """
        Cleans up datasets when no longer needed by the tenant.
        """
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=file_key
            )
            return True
        except ClientError as e:
            logger.error(f"Failed to delete file {file_key}: {e}")
            return False