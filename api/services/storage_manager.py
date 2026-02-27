import os
import logging
from abc import ABC, abstractmethod
from typing import BinaryIO, Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class StorageProvider(ABC):
    """
    Abstract Base Class defining the contract for any storage backend.
    Ensures that business logic remains decoupled from the infrastructure layer.
    """
    @abstractmethod
    def upload_file(self, file_obj: BinaryIO, destination_path: str) -> str:
        """Uploads a binary stream to the storage provider and returns the URI."""
        pass

    @abstractmethod
    def delete_file(self, file_path: str) -> bool:
        """Deletes a file at the specified path. Returns True if successful."""
        pass

    @abstractmethod
    def get_download_url(self, file_path: str, expiration: int = 3600) -> str:
        """Generates a pre-signed URL for temporary, read-only access."""
        pass


class S3StorageProvider(StorageProvider):
    """
    AWS S3 / Cloudflare R2 Implementation.
    Compatible with any S3-API compliant storage system via endpoint_url.
    """
    def __init__(self):
        # By providing an endpoint_url, this seamlessly supports Cloudflare R2, MinIO, etc.
        self.client = boto3.client(
            's3',
            endpoint_url=os.getenv("S3_ENDPOINT_URL"), 
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION", "us-east-1")
        )
        self.bucket = os.getenv("S3_BUCKET_NAME", "dataomen-production")

    def upload_file(self, file_obj: BinaryIO, destination_path: str) -> str:
        try:
            self.client.upload_fileobj(file_obj, self.bucket, destination_path)
            return f"s3://{self.bucket}/{destination_path}"
        except ClientError as e:
            logger.error(f"Failed to upload file to S3: {e}")
            raise RuntimeError(f"Storage upload failed: {str(e)}")

    def delete_file(self, file_path: str) -> bool:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=file_path)
            return True
        except ClientError as e:
            logger.error(f"Failed to delete file from S3: {e}")
            return False

    def get_download_url(self, file_path: str, expiration: int = 3600) -> str:
        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket, 'Key': file_path},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            raise RuntimeError("Could not generate download link.")


class StorageManager:
    """
    Orchestrator for storage operations. 
    Enforces multi-tenant security by design, guaranteeing tenant isolation in paths.
    """
    def __init__(self, provider: Optional[StorageProvider] = None):
        # Dependency Injection for easy unit testing. Falls back to S3 by default.
        self.provider = provider or S3StorageProvider()

    def save_tenant_dataset(self, tenant_id: str, file_id: str, file_obj: BinaryIO, format: str = "parquet") -> str:
        """
        Saves a dataset securely within a tenant's isolated namespace.
        O(1) routing complexity.
        """
        if not tenant_id or not file_id:
            raise ValueError("tenant_id and file_id are required for strict isolation.")
            
        destination_path = f"tenants/{tenant_id}/datasets/{file_id}.{format}"
        return self.provider.upload_file(file_obj, destination_path)

    def delete_tenant_dataset(self, tenant_id: str, file_id: str, format: str = "parquet") -> bool:
        """Removes an isolated dataset from storage."""
        target_path = f"tenants/{tenant_id}/datasets/{file_id}.{format}"
        return self.provider.delete_file(target_path)
        
    def get_tenant_dataset_url(self, tenant_id: str, file_id: str, format: str = "parquet") -> str:
        """Provides temporary, read-only analytical access to a tenant's dataset."""
        target_path = f"tenants/{tenant_id}/datasets/{file_id}.{format}"
        return self.provider.get_download_url(target_path)