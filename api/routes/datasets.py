# api/routes/datasets.py
import os
import uuid
import tempfile
import shutil
import logging
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session
import duckdb

from api.database import get_db
from api.services.storage_manager import storage_manager
from models import Dataset, DatasetStatus, StorageTier, TenantSettings

# Fallback import for auth (Adjust based on your actual auth path)
try:
    from api.auth import get_current_tenant
except ImportError:
    def get_current_tenant(): return "mock_tenant_id"

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/datasets", tags=["Datasets"])

def convert_to_parquet_ephemeral(source_path: str, target_path: str):
    """
    Core Computation: Vectorized, in-memory conversion of CSV/JSON to Parquet.
    Maximizes analytical efficiency for subsequent queries.
    """
    try:
        con = duckdb.connect(':memory:')
        # read_csv_auto automatically infers schema, types, and handles dirty data natively
        con.execute(f"COPY (SELECT * FROM read_csv_auto('{source_path}')) TO '{target_path}' (FORMAT PARQUET);")
    except Exception as e:
        logger.error(f"DuckDB Conversion Error: {str(e)}")
        raise ValueError(f"Failed to parse file: {str(e)}")
    finally:
        con.close()

@router.post("/ephemeral-upload")
async def upload_ephemeral_dataset(
    file: UploadFile = File(...)
):
    """
    No-Login "Try it out" Route.
    Accepts a file, optimizes it to Parquet, and stores it in the isolated /tmp directory.
    Data will automatically be destroyed when the Vercel/Render instance spins down.
    """
    if not file.filename.endswith(('.csv', '.parquet', '.json')):
        raise HTTPException(status_code=400, detail="Only CSV, JSON, and Parquet files are supported.")

    # 1. Store securely in the OS Temp Directory (Jailed execution)
    temp_dir = tempfile.gettempdir()
    unique_id = str(uuid.uuid4())
    
    # We use .tmp initially before converting to Parquet
    raw_path = os.path.join(temp_dir, f"raw_{unique_id}_{file.filename}")
    parquet_path = os.path.join(temp_dir, f"ephemeral_{unique_id}.parquet")

    try:
        # Write chunks to avoid memory bloat on large files
        with open(raw_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 2. Convert to Parquet for 10x faster querying (if it's not already)
        if not file.filename.endswith('.parquet'):
            convert_to_parquet_ephemeral(raw_path, parquet_path)
            os.remove(raw_path) # Clean up the bloated CSV
            final_path = parquet_path
        else:
            final_path = raw_path # It was already optimized

        return {
            "message": "Ephemeral dataset ready.",
            "dataset": {
                "name": file.filename,
                "status": "READY",
                "tier": "EPHEMERAL"
            },
            # This token string is passed back to the backend during queries
            "ephemeral_path": final_path
        }

    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        logger.error(f"Ephemeral upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server processing error.")


@router.post("/upload")
async def upload_persistent_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant)
):
    """
    Standard Authenticated Route for Persistent Cloudflare R2 / Supabase Storage.
    """
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    tier = settings.storage_tier if settings else StorageTier.SUPABASE

    temp_dir = tempfile.gettempdir()
    raw_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{file.filename}")
    
    with open(raw_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        dataset_id = uuid.uuid4()
        final_path = raw_path

        if not file.filename.endswith('.parquet'):
            parquet_path = raw_path.replace(".csv", ".parquet").replace(".json", ".parquet")
            convert_to_parquet_ephemeral(raw_path, parquet_path)
            final_path = parquet_path
            os.remove(raw_path)

        # Upload to R2/Supabase using our Adaptive Router
        s3_client = storage_manager.get_s3_client(db, tenant_id)
        config = storage_manager._resolve_tenant_config(db, tenant_id)
        
        target_filename = f"{dataset_id}.parquet"
        s3_key = f"{config.prefix}{target_filename}"
        
        s3_client.upload_file(final_path, config.bucket, s3_key)

        new_dataset = Dataset(
            id=dataset_id,
            tenant_id=tenant_id,
            name=name,
            description=description,
            file_path=target_filename,
            status=DatasetStatus.READY
        )
        
        db.add(new_dataset)
        db.commit()

        from api.services.dataset_service import dataset_service
        dataset_service.process_and_save_schema(db, dataset_id, tenant_id, final_path)

        return {
            "message": "Dataset uploaded persistently.",
            "dataset": {"id": new_dataset.id, "name": new_dataset.name, "tier": tier}
        }
    finally:
        if 'final_path' in locals() and os.path.exists(final_path):
            os.remove(final_path)