import os
import logging
from typing import List, Optional
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from botocore.config import Config

logger = logging.getLogger(__name__)

class StorageManager:
    """
    Modular Strategy:
    Encapsulates all blob storage interactions. 
    Defensively validates configuration on startup to prevent silent 500 errors.
    """
    def __init__(self):
        self.bucket_name = os.getenv("STORAGE_BUCKET_NAME")
        endpoint_url = os.getenv("STORAGE_ENDPOINT_URL")
        access_key = os.getenv("STORAGE_ACCESS_KEY")
        secret_key = os.getenv("STORAGE_SECRET_KEY")
        region = os.getenv("STORAGE_REGION", "auto")

        # Validation: Catch missing environment variables instantly
        missing_vars = []
        if not self.bucket_name: missing_vars.append("STORAGE_BUCKET_NAME")
        if not endpoint_url: missing_vars.append("STORAGE_ENDPOINT_URL")
        if not access_key: missing_vars.append("STORAGE_ACCESS_KEY")
        if not secret_key: missing_vars.append("STORAGE_SECRET_KEY")

        if missing_vars:
            error_msg = f"StorageManager Initialization Failed. Missing Environment Variables: {', '.join(missing_vars)}"
            logger.error(error_msg)
            # We raise a ValueError so the FastAPI router catches it and we can see it in Render Logs
            raise ValueError(error_msg)
        
        # Configure boto3 to use path-style addressing which is safer for R2/Custom S3
        boto_config = Config(
            signature_version='s3v4',
            retries={'max_attempts': 3, 'mode': 'standard'}
        )
        
        try:
            self.s3_client = boto3.client(
                's3',
                endpoint_url=endpoint_url,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name=region,
                config=boto_config
            )
            logger.info(f"StorageManager successfully connected to endpoint: {endpoint_url}")
        except Exception as e:
            logger.error(f"Failed to initialize boto3 S3 client: {str(e)}")
            raise e

    def generate_presigned_upload_url(self, file_key: str, expiration_seconds: int = 3600) -> str:
        """
        Security by Design:
        Grants a temporary, scoped write-access URL specifically for the frontend.
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
        except NoCredentialsError:
            logger.error("Boto3 could not find valid AWS/R2 credentials.")
            raise Exception("Cloud storage credentials missing or invalid.")
        except ClientError as e:
            logger.error(f"ClientError generating upload URL for {file_key}: {e}")
            raise Exception(f"Cloud storage handshake failed: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error in generate_presigned_upload_url: {e}")
            raise Exception(f"Failed to generate upload URL: {str(e)}")

    def generate_presigned_download_url(self, file_key: str, expiration_seconds: int = 3600) -> str:
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
        except Exception as e:
            logger.error(f"Failed to generate download URL for {file_key}: {e}")
            raise Exception(f"Failed to retrieve secure data stream: {str(e)}")

    def list_files(self, prefix: str) -> List[str]:
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            if 'Contents' not in response:
                return []
            return [obj['Key'] for obj in response['Contents']]
        except Exception as e:
            logger.error(f"Failed to list files for prefix {prefix}: {e}")
            raise Exception("Failed to retrieve dataset listing.")

    def delete_file(self, file_key: str) -> bool:
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=file_key
            )
            return True
        except Exception as e:
            logger.error(f"Failed to delete file {file_key}: {e}")
            return False