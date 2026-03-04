import logging
import io
import uuid
from typing import Dict, Any
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from sqlalchemy.orm import Session
import pandas as pd

from api.auth import get_current_user as get_tenant
from api.database import get_db
from api.services.storage_manager import storage_manager
from models import Dataset  

router = APIRouter(prefix="/datasets", tags=["Datasets"])
logger = logging.getLogger(__name__)

def sanitize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computation Layer: Vectorized data sanitization.
    Cleans column names for strict SQL/DuckDB analytical compatibility.
    """
    # Vectorized string operations to clean headers (strip whitespace, lowercase, replace non-alphanumerics)
    df.columns = (
        df.columns.astype(str)
        .str.strip()
        .str.lower()
        .str.replace(r'[^a-z0-9_]', '_', regex=True)
    )
    
    # We allow Parquet to natively handle nulls (NaNs) to preserve analytical integrity,
    # preventing skewed variance or EMA calculations later.
    return df

@router.post("/upload", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_tenant),
    db: Session = Depends(get_db)
):
    """
    Ingests CSV/Excel, vectorizes to Parquet via Pandas, stores in R2, 
    and registers the dataset natively partitioned by tenant_id.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    file_ext = file.filename.split('.')[-1].lower()
    if file_ext not in ['csv', 'xlsx', 'xls']:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV or Excel.")

    # 1. Read file securely into memory
    contents = await file.read()
    
    try:
        # 2. Execute Vectorized Parsing (Pandas dataframe creation)
        if file_ext == 'csv':
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
            
        # Standardize the data structure for immediate DuckDB querying
        df = sanitize_dataframe(df)
        
        # 3. Convert to Parquet (High-performance columnar format)
        parquet_buffer = io.BytesIO()
        df.to_parquet(parquet_buffer, engine='pyarrow', index=False)
        parquet_bytes = parquet_buffer.getvalue()
        
    except Exception as e:
        logger.error(f"Failed to process file {file.filename}: {e}")
        raise HTTPException(status_code=422, detail=f"Data parsing failed. Ensure file is uncorrupted: {str(e)}")

    # 4. Storage & Orchestration Layer
    dataset_id = str(uuid.uuid4())
    parquet_filename = f"{dataset_id}.parquet"
    
    try:
        # Upload securely to tenant-partitioned Cloudflare R2 path
        s3_uri = storage_manager.upload_parquet(
            tenant_id=tenant_id,
            dataset_id=dataset_id,
            file_name=parquet_filename,
            file_data=parquet_bytes
        )
        
        # 5. Database Transaction (Registering the dataset for the frontend)
        new_dataset = Dataset(
            id=dataset_id,
            tenant_id=tenant_id,
            name=file.filename,
            storage_uri=s3_uri, # The s3:// URI for DuckDB
            row_count=len(df),
            column_count=len(df.columns)
        )
        
        db.add(new_dataset)
        db.commit()
        db.refresh(new_dataset)
        
        return {
            "status": "success",
            "dataset_id": dataset_id,
            "name": file.filename,
            "uri": s3_uri,
            "rows": len(df),
            "columns": len(df.columns)
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Upload pipeline failed for tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save dataset to storage or database.")