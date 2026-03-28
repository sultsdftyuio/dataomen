# api/routes/datasets.py

import logging
import uuid
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File, Form
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

# Core Security & Database
from api.auth import verify_tenant, TenantContext
from api.database import get_db
from models import Dataset, DatasetStatus

# Infrastructure Services
from api.services.storage_manager import storage_manager
from api.services.cache_manager import cache_manager
from api.services.sync_engine import INTEGRATION_REGISTRY

# Phase 6: The Background Worker
from compute_worker import process_ingestion_dataset

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/datasets", tags=["Datasets"])

# -----------------------------------------------------------------------------
# Pydantic Schemas for Strict Type Safety
# -----------------------------------------------------------------------------

class DatasetCreate(BaseModel):
    name: str = Field(..., description="A friendly name for the dataset.")
    integration_name: Optional[str] = Field(None, description="The SaaS provider (e.g., 'stripe'). Null if file upload.")
    stream_name: Optional[str] = Field(None, description="The specific table/stream to sync (e.g., 'invoices').")
    file_path: Optional[str] = Field(None, description="The R2/S3 object key if this is a direct file upload.")

class DatasetResponse(BaseModel):
    id: str
    name: str
    status: str
    integration_name: Optional[str]
    stream_name: Optional[str]
    row_count: int
    schema_metadata: Optional[Dict[str, Any]]
    created_at: str

    class Config:
        from_attributes = True

class SyncTriggerResponse(BaseModel):
    status: str
    message: str
    job_id: str

# -----------------------------------------------------------------------------
# Background Cleanup Helpers
# -----------------------------------------------------------------------------

async def _cleanup_dataset_resources(tenant_id: str, dataset_id: str, file_path: Optional[str]):
    """
    Background task to aggressively clean up orphaned resources when a dataset is deleted,
    preventing cloud storage and memory bloat.
    """
    try:
        # 1. Purge the semantic cache for this dataset
        await cache_manager.invalidate_dataset_cache(tenant_id, dataset_id)
        
        # 2. Delete the physical Parquet file from R2/S3
        if file_path:
            storage_manager.delete_file(file_path)
            
        logger.info(f"[{tenant_id}] Successfully cleaned up resources for deleted dataset {dataset_id}.")
    except Exception as e:
        logger.error(f"[{tenant_id}] Resource cleanup failed for {dataset_id}: {str(e)}")

# -----------------------------------------------------------------------------
# API Routes
# -----------------------------------------------------------------------------

@router.post("/upload", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    name: str = Form(..., description="A friendly name for the dataset."),
    file: UploadFile = File(..., description="The CSV/JSON file being uploaded."),
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Handles direct file uploads (multipart/form-data).
    Uploads the file securely to Cloud Storage (R2/S3) and dispatches the background worker.
    """
    tenant_id = context.tenant_id
    logger.info(f"[{tenant_id}] Uploading new file dataset: {name}")

    try:
        # 1. Security by Design: Generate a secure, tenant-isolated storage path
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'raw'
        file_path = f"tenants/{tenant_id}/datasets/{uuid.uuid4()}.{file_extension}"

        # 2. Read and Upload to Object Storage (Modular Strategy)
        # Assuming storage_manager has a method to handle raw bytes or file streams.
        file_bytes = await file.read()
        storage_manager.upload_bytes(file_bytes, file_path)

        # 3. Create the Database Record (Starts in PENDING state)
        new_dataset = Dataset(
            tenant_id=tenant_id,
            name=name,
            status=DatasetStatus.PENDING,
            integration_name=None, # Explicitly null for file uploads
            file_path=file_path,
            schema_metadata={"original_filename": file.filename}
        )
        
        db.add(new_dataset)
        db.commit()
        db.refresh(new_dataset)

        # 4. Phase 6 Integration: Dispatch the Celery Task
        dataset_id_str = str(new_dataset.id)
        process_ingestion_dataset.delay(dataset_id_str, tenant_id)

        logger.info(f"[{tenant_id}] Dispatched Celery Ingestion Task for File Dataset {dataset_id_str}")

        return new_dataset

    except Exception as e:
        db.rollback()
        logger.error(f"[{tenant_id}] File upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to upload and process file.")


@router.post("/", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    request: DatasetCreate,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Registers a new SaaS integration dataset and INSTANTLY dispatches the background worker.
    """
    tenant_id = context.tenant_id
    logger.info(f"[{tenant_id}] Creating new SaaS dataset: {request.name}")

    # Validation: Ensure they provided either an integration or a file, not neither
    if not request.integration_name and not request.file_path:
        raise HTTPException(status_code=400, detail="Must provide either integration_name or file_path.")

    # Validation: Ensure the SaaS integration actually exists in our registry
    if request.integration_name and request.integration_name not in INTEGRATION_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Integration '{request.integration_name}' is not supported.")

    try:
        # 1. Create the Database Record (Starts in PENDING state)
        new_dataset = Dataset(
            tenant_id=tenant_id,
            name=request.name,
            status=DatasetStatus.PENDING,
            integration_name=request.integration_name,
            stream_name=request.stream_name,
            file_path=request.file_path,
            schema_metadata={"start_timestamp": "2024-01-01T00:00:00Z"} # Default historical sync window
        )
        
        db.add(new_dataset)
        db.commit()
        db.refresh(new_dataset)

        # 2. PHASE 6 INTEGRATION: Dispatch the Celery Background Task
        dataset_id_str = str(new_dataset.id)
        process_ingestion_dataset.delay(dataset_id_str, tenant_id)

        logger.info(f"[{tenant_id}] Dispatched Celery Ingestion Task for Dataset {dataset_id_str}")

        return new_dataset

    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"[{tenant_id}] Database error creating dataset: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to register dataset.")


@router.get("/", response_model=List[DatasetResponse])
async def list_datasets(
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Retrieves all datasets for the authenticated tenant.
    Used by the UI sidebar to populate available contexts.
    """
    datasets = db.query(Dataset).filter(Dataset.tenant_id == context.tenant_id).all()
    
    # Enrich the response with safe defaults for the UI
    response_list = []
    for ds in datasets:
        row_count = ds.schema_metadata.get("row_count", 0) if ds.schema_metadata else 0
        response_list.append({
            "id": str(ds.id),
            "name": ds.name,
            "status": ds.status.value if hasattr(ds.status, 'value') else ds.status,
            "integration_name": ds.integration_name,
            "stream_name": ds.stream_name,
            "row_count": row_count,
            "schema_metadata": ds.schema_metadata,
            "created_at": ds.created_at.isoformat() if ds.created_at else ""
        })
        
    return response_list


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: str,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Retrieves a specific dataset. 
    Crucial for the UI to poll the 'status' (PENDING -> PROCESSING -> READY).
    """
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id,
        Dataset.tenant_id == context.tenant_id
    ).first()

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or unauthorized.")

    row_count = dataset.schema_metadata.get("row_count", 0) if dataset.schema_metadata else 0

    return {
        "id": str(dataset.id),
        "name": dataset.name,
        "status": dataset.status.value if hasattr(dataset.status, 'value') else dataset.status,
        "integration_name": dataset.integration_name,
        "stream_name": dataset.stream_name,
        "row_count": row_count,
        "schema_metadata": dataset.schema_metadata,
        "created_at": dataset.created_at.isoformat() if dataset.created_at else ""
    }


@router.post("/{dataset_id}/sync", response_model=SyncTriggerResponse)
async def trigger_manual_sync(
    dataset_id: str,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Allows a user to manually click "Sync Now" on the dashboard to pull the latest SaaS data.
    """
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id,
        Dataset.tenant_id == context.tenant_id
    ).first()

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    if dataset.status == DatasetStatus.PROCESSING:
        raise HTTPException(status_code=409, detail="Dataset is already currently syncing.")

    # Reset status to pending so UI shows loading state
    dataset.status = DatasetStatus.PENDING
    db.commit()

    # Dispatch Celery Task
    task = process_ingestion_dataset.delay(str(dataset.id), context.tenant_id)

    return SyncTriggerResponse(
        status="accepted",
        message="Manual sync triggered successfully. Data will be available shortly.",
        job_id=task.id
    )


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: str,
    background_tasks: BackgroundTasks,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Deletes the dataset record and asynchronously purges all related Cache and R2 Storage.
    """
    tenant_id = context.tenant_id
    
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id,
        Dataset.tenant_id == tenant_id
    ).first()

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    file_path = dataset.file_path

    try:
        # Delete from Postgres
        db.delete(dataset)
        db.commit()

        # Fire and forget resource cleanup to return 204 instantly
        background_tasks.add_task(
            _cleanup_dataset_resources,
            tenant_id=tenant_id,
            dataset_id=dataset_id,
            file_path=file_path
        )

    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"[{tenant_id}] Database error deleting dataset {dataset_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete dataset.")