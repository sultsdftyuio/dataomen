import os
import uuid
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import UploadFile
from sqlalchemy.orm import Session
import duckdb
import pandas as pd

from models import Dataset, DatasetStatus

class DatasetService:
    """
    Service responsible for Dataset Ingestion, Storage, and Preview.
    Uses DuckDB for zero-copy data inspection.
    """
    def __init__(self, storage_base_path: str = "./data_storage"):
        self.storage_base_path = storage_base_path
        os.makedirs(self.storage_base_path, exist_ok=True)

    def process_upload(self, db: Session, tenant_id: str, file: UploadFile) -> Dataset:
        """
        Orchestrates file upload, saves to disk, and tracks in Postgres.
        """
        dataset_id = str(uuid.uuid4())
        tenant_dir = Path(self.storage_base_path) / tenant_id
        tenant_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = tenant_dir / f"{dataset_id}_{file.filename}"
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        dataset = Dataset(
            id=dataset_id,
            tenant_id=tenant_id,
            name=file.filename,
            storage_path=str(file_path),
            status=DatasetStatus.READY
        )
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
        
        return dataset

    def get_dataset_preview(self, db: Session, tenant_id: str, dataset_id: str, limit: Optional[int] = None) -> Dict[str, Any]:
        """
        Analytical Efficiency: Uses DuckDB's in-process engine to grab the dataset.
        By default, limit is None, meaning it will stream ALL data back to the UI.
        """
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.tenant_id == tenant_id).first()
        
        if not dataset or dataset.status != DatasetStatus.READY:
            raise ValueError("Dataset not found or not ready for preview.")
            
        file_path = dataset.storage_path
        
        try:
            # DuckDB automatically infers schemas and handles both CSV and Parquet natively
            with duckdb.connect() as conn:
                limit_clause = f" LIMIT {limit}" if limit is not None else ""
                
                if file_path.endswith('.parquet'):
                    query = f"SELECT * FROM read_parquet('{file_path}'){limit_clause}"
                else:
                    query = f"SELECT * FROM read_csv_auto('{file_path}'){limit_clause}"
                
                # Fetch as Pandas DataFrame for vectorized manipulation
                df: pd.DataFrame = conn.execute(query).fetchdf()
                
                # Clean up Pandas NaN/NaT values so they can be JSON serialized perfectly
                df = df.where(df.notnull(), None)
                
                return {
                    "dataset_id": dataset.id,
                    "dataset_name": dataset.name,
                    "columns": list(df.columns),
                    "rows": df.to_dict(orient="records")
                }
        except Exception as e:
            raise RuntimeError(f"Failed to generate vectorized preview: {str(e)}")

dataset_service = DatasetService()