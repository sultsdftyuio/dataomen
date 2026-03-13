# api/routes/datasets.py

import logging
from typing import List, Any, Dict, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, Field

# Core Database & Models
from api.database import get_db
from models import Dataset, DatasetStatus

# Multi-Tenant Auth 
from api.auth import get_current_tenant_id 

# Cloud Storage Manager 
from api.services.storage_manager import storage_manager

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/datasets",
    tags=["Datasets"]
)

# ------------------------------------------------------------------------------
# Pydantic Schemas (Request / Response Validation)
# ------------------------------------------------------------------------------
class DatasetResponse(BaseModel):
    id: str
    name: str
    status: str
    created_at: datetime
    row_count: int = 0
    file_path: Optional[str] = None
    schema_metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

class SyncRequestPayload(BaseModel):
    integration_name: str = Field(..., example="shopify")
    stream_name: str = Field(default="default", example="orders")
    start_timestamp: str = Field(default="2020-01-01T00:00:00Z", example="2023-01-01T00:00:00Z")

# ------------------------------------------------------------------------------
# Route 1: List Datasets (Paginated & Tenant-Isolated)
# ------------------------------------------------------------------------------
@router.get("/", response_model=List[DatasetResponse])
async def list_datasets(
    limit: int = Query(50, ge=1, le=100, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant_id)
):
    """
    Security by Design: Always filter strictly by tenant_id.
    Performance: Utilizes limit/offset pagination to protect memory.
    """
    datasets = (
        db.query(Dataset)
        .filter(Dataset.tenant_id == tenant_id)
        .order_by(Dataset.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    # Map the ORM model to the strict Pydantic response
    return [
        DatasetResponse(
            id=str(d.id),
            name=d.name,
            status=d.status.value,
            created_at=d.created_at,
            row_count=(d.schema_metadata or {}).get("row_count", 0),
            file_path=d.file_path,
            schema_metadata=d.schema_metadata
        )
        for d in datasets
    ]

# ------------------------------------------------------------------------------
# Route 2: Get Dataset Status / Details
# ------------------------------------------------------------------------------
@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant_id)
):
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id, 
        Dataset.tenant_id == tenant_id
    ).first()

    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or unauthorized.")

    return DatasetResponse(
        id=str(dataset.id),
        name=dataset.name,
        status=dataset.status.value,
        created_at=dataset.created_at,
        row_count=(dataset.schema_metadata or {}).get("row_count", 0),
        file_path=dataset.file_path,
        schema_metadata=dataset.schema_metadata
    )

# ------------------------------------------------------------------------------
# Route 3: Upload Raw File (Triggers Path A in Worker)
# ------------------------------------------------------------------------------
@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant_id)
):
    """
    Accepts raw CSV/JSON uploads, stashes them in secure cloud storage, 
    and cues the Compute Worker for vectorized Parquet conversion.
    """
    if not file.filename.endswith(('.csv', '.json', '.parquet')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Only CSV, JSON, and Parquet files are supported."
        )

    try:
        # 1. Fast, stateless upload to raw storage (e.g., S3/R2) via modular storage manager.
        # This keeps the FastAPI event loop unblocked for other web traffic.
        raw_file_path = await storage_manager.upload_raw_file_async(tenant_id, file)

        # 2. Register the dataset as PENDING. 
        # The Compute Worker will lock this row via `skip_locked` asynchronously.
        new_dataset = Dataset(
            tenant_id=tenant_id,
            name=file.filename,
            file_path=raw_file_path,
            status=DatasetStatus.PENDING,
            schema_metadata={
                "ingestion_type": "upload",
                "original_filename": file.filename,
                "content_type": file.content_type
            }
        )
        db.add(new_dataset)
        db.commit()
        db.refresh(new_dataset)

        return {
            "message": "Upload successful. Compute worker is processing the data.", 
            "dataset_id": str(new_dataset.id)
        }

    except SQLAlchemyError as db_err:
        db.rollback()
        logger.error(f"DB Error during upload for tenant {tenant_id}: {db_err}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database transaction failed.")
    except Exception as e:
        db.rollback()
        logger.error(f"File upload failed for tenant {tenant_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"File upload failed: {str(e)}")

# ------------------------------------------------------------------------------
# Route 4: Trigger Historical API Sync (Triggers Path B in Worker)
# ------------------------------------------------------------------------------
@router.post("/sync", status_code=status.HTTP_201_CREATED)
async def trigger_integration_sync(
    payload: SyncRequestPayload,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant_id)
):
    """
    Triggers a Zero-ETL Sync from an external SaaS integration.
    """
    try:
        new_dataset = Dataset(
            tenant_id=tenant_id,
            name=f"{payload.integration_name.capitalize()} Sync - {payload.stream_name}",
            file_path=None,  # Will be generated by the worker as Parquet
            status=DatasetStatus.PENDING,
            schema_metadata={
                "ingestion_type": "sync",
                "integration_name": payload.integration_name,
                "stream_name": payload.stream_name,
                "start_timestamp": payload.start_timestamp
            }
        )
        db.add(new_dataset)
        db.commit()
        db.refresh(new_dataset)

        return {
            "message": f"Sync queued for {payload.integration_name}.", 
            "dataset_id": str(new_dataset.id)
        }

    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"DB Error during sync queue for tenant {tenant_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database error while queuing sync.")

# ------------------------------------------------------------------------------
# Route 5: Delete Dataset (Non-Blocking)
# ------------------------------------------------------------------------------
@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant_id)
):
    """
    Deletes the dataset metadata from the DB instantly, while securely 
    wiping the raw files from Cloud Storage in a background thread.
    """
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id, 
        Dataset.tenant_id == tenant_id
    ).first()

    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or unauthorized.")

    try:
        # 1. Dispatch cloud deletion to background task to keep API response instant
        if dataset.file_path:
            # Assumes storage_manager.delete_file can accept synchronous dispatch 
            # or you can wrap it in an async background task compatible wrapper
            background_tasks.add_task(storage_manager.delete_file, dataset.file_path)

        # 2. Purge from relational DB
        db.delete(dataset)
        db.commit()
        
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Failed to delete dataset {dataset_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete dataset records.")