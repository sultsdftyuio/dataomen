# api/routes/datasets.py
import os
import uuid
import tempfile
import shutil
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
import duckdb

# Adjust imports according to your actual project structure
from api.database import get_db
# Assuming you have a StorageManager and Dataset model set up
from api.services.storage_manager import storage_manager 
from models import Dataset, DatasetStatus  

router = APIRouter(
    prefix="/datasets",
    tags=["datasets"]
)

logger = logging.getLogger(__name__)

class DatasetResponse(BaseModel):
    id: str
    filename: str
    size_bytes: int
    row_count: Optional[int] = None
    schema_definition: Optional[List[Dict[str, str]]] = None
    status: str
    message: str

    class Config:
        from_attributes = True

# STRICT ROUTING: No trailing slash.
# Matches exactly to POST /api/datasets/upload from the Next.js frontend proxy.
@router.post("/upload", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    tenant_id: str = Form("default_tenant"),  # Use auth dependency to inject tenant_id in production
    db: Session = Depends(get_db)
):
    """
    Ingests, validates, and stages analytical datasets (CSV, Parquet, JSON).
    Vectorized schema extraction via DuckDB ensures instant read-validation.
    """
    allowed_extensions = {".csv", ".parquet", ".json"}
    file_ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Unsupported file type '{file_ext}'. Allowed: {', '.join(allowed_extensions)}"
        )

    dataset_id = str(uuid.uuid4())
    secure_filename = f"{dataset_id}{file_ext}"
    
    # Modular Strategy: Write to a secure temp directory for staging.
    temp_dir = tempfile.gettempdir()
    file_path = os.path.join(temp_dir, secure_filename)

    try:
        # Hybrid Performance Paradigm: Stream upload to disk to prevent memory exhaustion
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size = os.path.getsize(file_path)
        logger.info(f"Tenant {tenant_id} uploaded {file.filename} ({file_size} bytes).")

        # Analytical Efficiency: Use DuckDB to efficiently extract the schema and row count
        row_count = 0
        schema_definition = []
        
        with duckdb.connect(database=':memory:') as con:
            # DuckDB automatically infers schemas for Parquet and CSV files
            if file_ext == ".parquet":
                rel = con.read_parquet(file_path)
            elif file_ext == ".csv":
                rel = con.read_csv(file_path, header=True, auto_detect=True)
            elif file_ext == ".json":
                rel = con.read_json(file_path)
            else:
                rel = None

            if rel:
                row_count = rel.count('*').fetchone()[0]
                columns = rel.columns
                types = rel.dtypes
                schema_definition = [{"name": col, "type": str(dtype)} for col, dtype in zip(columns, types)]

        # (Optional) Async handoff: storage_manager.upload_file_async(file_path, destination="s3_or_r2")
        
        # Save Metadata to the Database layer
        new_dataset = Dataset(
            id=dataset_id,
            tenant_id=tenant_id,
            filename=file.filename or secure_filename,
            file_path=file_path,  # Or an S3 URI once uploaded
            size_bytes=file_size,
            row_count=row_count,
            schema_definition=schema_definition,
            status=DatasetStatus.STAGED.value if hasattr(DatasetStatus, 'STAGED') else "STAGED"
        )
        
        db.add(new_dataset)
        db.commit()
        db.refresh(new_dataset)

        return DatasetResponse(
            id=dataset_id,
            filename=new_dataset.filename,
            size_bytes=new_dataset.size_bytes,
            row_count=new_dataset.row_count,
            schema_definition=new_dataset.schema_definition,
            status=new_dataset.status,
            message="Dataset uploaded and schema validated successfully."
        )

    except Exception as e:
        logger.error(f"Upload failed for dataset {dataset_id}: {str(e)}")
        # Clean up the staged file on failure
        if os.path.exists(file_path):
            os.remove(file_path)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while processing the upload: {str(e)}"
        )
    finally:
        # Explicitly close the file descriptor
        file.file.close()

@router.get("/", response_model=List[DatasetResponse])
def list_datasets(
    tenant_id: str = "default_tenant",  # Injected via Auth in production
    db: Session = Depends(get_db)
):
    """
    Returns a multi-tenant partitioned list of datasets.
    """
    datasets = db.query(Dataset).filter(Dataset.tenant_id == tenant_id).all()
    
    # We construct the response dynamically to fit the Pydantic model
    return [
        DatasetResponse(
            id=d.id,
            filename=d.filename,
            size_bytes=d.size_bytes,
            row_count=d.row_count,
            schema_definition=d.schema_definition,
            status=d.status,
            message="OK"
        ) for d in datasets
    ]