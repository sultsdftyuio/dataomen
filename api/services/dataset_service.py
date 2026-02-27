import os
import uuid
import shutil
from pathlib import Path
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session
import duckdb

from models import Dataset, DatasetStatus

# Modular Strategy: Externalize storage logic. For now, we use local partitioned storage.
# In a cloud environment, this path can be swapped to an S3/R2 mount or path.
STORAGE_DIR = Path("./storage")

class DatasetService:
    """
    Orchestration (Backend) Service handling dataset ingestion and analytical vectorization.
    Enforces Multi-Tenant Security at the storage and database layers.
    """
    def __init__(self, db: Session, tenant_id: str, user_id: str):
        self.db = db
        # Security by Design: strictly bound tenant context
        self.tenant_id = tenant_id
        self.user_id = user_id

    def _get_tenant_dir(self) -> Path:
        """Ensure tenant-specific isolated directory exists."""
        tenant_dir = STORAGE_DIR / self.tenant_id
        tenant_dir.mkdir(parents=True, exist_ok=True)
        return tenant_dir

    async def process_upload(self, file: UploadFile, description: Optional[str] = "") -> Dataset:
        """
        Ingests a CSV/Excel file and casts it directly into a highly-compressed Parquet file.
        """
        tenant_dir = self._get_tenant_dir()
        dataset_id = str(uuid.uuid4())
        
        # Temporary file for raw upload before vectorization
        temp_input_path = tenant_dir / f"temp_{dataset_id}_{file.filename}"
        final_parquet_path = tenant_dir / f"{dataset_id}.parquet"

        try:
            # 1. Stream the incoming file safely to disk
            with open(temp_input_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # 2. Analytical Efficiency: DuckDB Vectorized Ingestion
            # duckdb.connect() without a database file creates an in-memory instance
            with duckdb.connect() as conn:
                # read_csv_auto smartly handles headers, delimiters, and date parsing
                conn.execute(f"""
                    COPY (SELECT * FROM read_csv_auto('{temp_input_path}')) 
                    TO '{final_parquet_path}' (FORMAT PARQUET, COMPRESSION ZSTD);
                """)

            # 3. Create Database Record
            db_dataset = Dataset(
                id=dataset_id,
                filename=file.filename or "unknown.csv",
                status=DatasetStatus.READY,
                description=description,
                tenant_id=self.tenant_id,
                user_id=self.user_id
            )
            
            self.db.add(db_dataset)
            self.db.commit()
            self.db.refresh(db_dataset)

            return db_dataset

        except duckdb.Error as duck_err:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"Data parsing failed. Ensure it is a valid CSV. Error: {str(duck_err)}"
            )
        except Exception as e:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_SERVER, 
                detail=f"Internal ingestion error: {str(e)}"
            )
        finally:
            # 4. Cleanup: Remove the unoptimized temporary CSV/Excel file to save space
            if temp_input_path.exists():
                os.remove(temp_input_path)