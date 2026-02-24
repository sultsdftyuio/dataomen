import os
import shutil
import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from models import Dataset, DatasetStatus, User

# Secure temporary storage for Phase 1 processing
TEMP_UPLOAD_DIR = Path("/tmp/dataomen_uploads")
TEMP_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

class DatasetService:
    """
    Handles the business logic for dataset ingestion, ensuring
    strict tenant isolation and file security.
    """
    
    def __init__(self, db: Session, current_user: User):
        self.db = db
        self.current_user = current_user

    async def accept_upload(self, file: UploadFile, dataset_name: str) -> Dataset:
        """Validates and stages the uploaded CSV, creating a pending DB record."""
        
        # Security: Strict MIME type and extension validation
        if file.content_type not in ["text/csv", "application/vnd.ms-excel"] or not file.filename.endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Invalid file format. Strictly CSV files are allowed."
            )

        # Create the initial database record (Tenant Isolation enforced via user_id)
        new_dataset = Dataset(
            user_id=self.current_user.id,
            name=dataset_name,
            original_filename=file.filename,
            status=DatasetStatus.PENDING
        )
        self.db.add(new_dataset)
        self.db.commit()
        self.db.refresh(new_dataset)

        # Stage the file securely on disk using the Dataset UUID to prevent collisions
        secure_filename = f"{new_dataset.id}.csv"
        file_path = TEMP_UPLOAD_DIR / secure_filename
        
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            # If writing fails, rollback the database to maintain consistency
            self.db.delete(new_dataset)
            self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to securely stage the uploaded file."
            )
            
        return new_dataset

    def process_file_background(self, dataset_id: uuid.UUID, file_path: Path):
        """
        The master Phase 1 pipeline: Clean -> Compress -> Upload -> Validate -> Ready.
        """
        # 1. Fetch the database record (Using a fresh session for the background task)
        dataset = self.db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            return

        dataset.status = DatasetStatus.PROCESSING
        self.db.commit()

        try:
            # 2. Clean the Data (Pandas)
            from api.services.data_sanitizer import DataSanitizer
            sanitizer = DataSanitizer(file_path)
            clean_df = sanitizer.clean()

            # 3. Convert & Upload (Parquet to S3)
            from api.services.storage_manager import S3StorageManager
            storage = S3StorageManager()
            s3_uri = storage.upload_dataframe(clean_df, dataset.user_id, dataset.id)

            # 4. Validate (DuckDB)
            from api.services.duckdb_validator import DuckDBValidator
            validator = DuckDBValidator()
            row_count = validator.validate_and_count(s3_uri)

            # 5. Success! Update metadata
            dataset.storage_uri = s3_uri
            dataset.row_count = row_count
            dataset.status = DatasetStatus.READY
            self.db.commit()
            
            print(f"✅ Phase 1 Pipeline Complete for Dataset {dataset_id}")

        except Exception as e:
            # 6. Graceful Failure
            print(f"❌ Phase 1 Pipeline Failed for Dataset {dataset_id}: {e}")
            dataset.status = DatasetStatus.FAILED
            self.db.commit()