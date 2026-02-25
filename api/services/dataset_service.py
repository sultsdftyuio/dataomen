import uuid
from pathlib import Path
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException, status
import shutil
import os

from models import Dataset, DatasetStatus, User

class DatasetService:
    def __init__(self, db: Session, current_user: User):
        self.db = db
        self.current_user = current_user

    async def accept_upload(self, file: UploadFile, dataset_name: str) -> Dataset:
        """
        Validates the file, saves it to a temporary location, and creates a database record.
        """
        if not file.filename.endswith(".csv"):
             raise HTTPException(status_code=400, detail="Only CSV files are currently supported.")

        # Create DB Record
        dataset = Dataset(
            id=uuid.uuid4(),
            user_id=self.current_user.id,
            name=dataset_name,
            status=DatasetStatus.PENDING
        )
        self.db.add(dataset)
        self.db.commit()
        self.db.refresh(dataset)

        # Stage the file locally
        os.makedirs("/tmp/dataomen_uploads", exist_ok=True)
        file_path = f"/tmp/dataomen_uploads/{dataset.id}.csv"
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return dataset

    def process_file_background(self, dataset_id: uuid.UUID, file_path: str):
        """
        The master Phase 1 pipeline: Clean -> Compress -> Upload -> Validate -> Ready.
        """
        from api.database import SessionLocal 
        db = SessionLocal()
        
        try:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if not dataset: return

            dataset.status = DatasetStatus.PROCESSING
            db.commit()

            # 1. Clean (Pandas)
            from api.services.data_sanitizer import DataSanitizer
            sanitizer = DataSanitizer(Path(file_path))
            clean_df = sanitizer.clean()

            # 2. Upload (Parquet to S3/R2)
            from api.services.storage_manager import S3StorageManager
            storage = S3StorageManager()
            s3_uri = storage.upload_dataframe(clean_df, str(dataset.user_id), str(dataset.id))

            # 3. Validate (DuckDB)
            from api.services.duckdb_validator import DuckDBValidator
            validator = DuckDBValidator()
            row_count = validator.validate_and_count(s3_uri)

            # 4. Finalize Metadata
            dataset.storage_uri = s3_uri
            dataset.row_count = row_count
            dataset.status = DatasetStatus.READY
            db.commit()
            
        except Exception as e:
            db.rollback()
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = DatasetStatus.FAILED
                db.commit()
            print(f"❌ Phase 1 Pipeline Failed: {e}")
        finally:
            db.close()
            # Cleanup temp file
            if os.path.exists(file_path):
                os.remove(file_path)