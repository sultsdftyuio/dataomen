# api/routes/datasets.py

import logging
import uuid
import os
import re
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File, Form
from pydantic import BaseModel, Field, model_validator
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

MAX_UPLOAD_BYTES = int(os.getenv("DATASET_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
ALLOWED_UPLOAD_EXTENSIONS = {
    "csv",
    "json",
    "jsonl",
    "ndjson",
    "parquet",
    "pdf",
    "docx",
    "txt",
    "md",
}
_SAFE_EXT_RE = re.compile(r"^[a-z0-9]{1,10}$")


def _dataset_to_response(ds: Dataset) -> Dict[str, Any]:
    row_count = ds.schema_metadata.get("row_count", 0) if ds.schema_metadata else 0
    return {
        "id": str(ds.id),
        "name": ds.name,
        "status": ds.status.value if hasattr(ds.status, "value") else str(ds.status),
        "integration_name": getattr(ds, "integration_name", None),
        "stream_name": getattr(ds, "stream_name", None),
        "row_count": int(row_count) if isinstance(row_count, (int, float)) else 0,
        "schema_metadata": ds.schema_metadata,
        "created_at": ds.created_at.isoformat() if ds.created_at else "",
    }

# -----------------------------------------------------------------------------
# Pydantic Schemas for Strict Type Safety
# -----------------------------------------------------------------------------

class DatasetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120, description="A friendly name for the dataset.")
    integration_name: Optional[str] = Field(None, description="The SaaS provider (e.g., 'stripe'). Null if file upload.")
    stream_name: Optional[str] = Field(None, description="The specific table/stream to sync (e.g., 'invoices').")
    file_path: Optional[str] = Field(None, description="The R2/S3 object key if this is a direct file upload.")

    @model_validator(mode="after")
    def validate_shape(self) -> "DatasetCreate":
        self.name = self.name.strip()
        self.integration_name = self.integration_name.strip().lower() if self.integration_name else None
        self.stream_name = self.stream_name.strip() if self.stream_name else None
        self.file_path = self.file_path.strip() if self.file_path else None

        if bool(self.integration_name) == bool(self.file_path):
            raise ValueError("Provide exactly one of integration_name or file_path.")

        if self.stream_name and not self.integration_name:
            raise ValueError("stream_name is only valid for integration datasets.")

        if self.file_path and not self.file_path.startswith("s3://"):
            raise ValueError("file_path must be an s3:// URI.")

        return self

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
    file: UploadFile = File(..., description="The CSV/JSON/Parquet/TXT/MD/PDF/DOCX file being uploaded."),
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Handles direct file uploads (multipart/form-data).
    Uploads the file securely to Cloud Storage (R2/S3) and dispatches the background worker.
    """
    tenant_id = context.tenant_id
    file_path: Optional[str] = None
    dataset_persisted = False

    normalized_name = name.strip()
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Dataset name cannot be empty.")
    if len(normalized_name) > 120:
        raise HTTPException(status_code=400, detail="Dataset name must be at most 120 characters.")

    logger.info(f"[{tenant_id}] Uploading new file dataset: {normalized_name}")

    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Uploaded file must include a filename.")

        file_extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if not _SAFE_EXT_RE.match(file_extension) or file_extension not in ALLOWED_UPLOAD_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}.",
            )

        # Enforce file size cap without buffering entire file in memory for large inputs.
        payload = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(payload) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"File exceeds max size of {MAX_UPLOAD_BYTES} bytes.")
        await file.seek(0)

        # Storage manager handles tenant-scoped path generation and upload.
        file_path = await storage_manager.upload_raw_file_async(tenant_id, file)

        # 3. Create the Database Record (Starts in PENDING state)
        new_dataset = Dataset(
            tenant_id=tenant_id,
            name=normalized_name,
            status=DatasetStatus.PENDING,
            integration_name=None, # Explicitly null for file uploads
            file_path=file_path,
            schema_metadata={"original_filename": file.filename}
        )
        
        db.add(new_dataset)
        db.commit()
        db.refresh(new_dataset)
        dataset_persisted = True

        # 4. Phase 6 Integration: Dispatch the Celery Task
        dataset_id_str = str(new_dataset.id)
        try:
            process_ingestion_dataset.delay(dataset_id_str, tenant_id)
        except Exception as dispatch_error:
            new_dataset.status = DatasetStatus.FAILED
            new_dataset.schema_metadata = {
                **(new_dataset.schema_metadata or {}),
                "ingestion_error": "Failed to enqueue ingestion task",
            }
            db.commit()
            logger.error(f"[{tenant_id}] Celery dispatch failed for file dataset {dataset_id_str}: {dispatch_error}")
            raise HTTPException(status_code=503, detail="Dataset uploaded but processing queue is unavailable.")

        logger.info(f"[{tenant_id}] Dispatched Celery Ingestion Task for File Dataset {dataset_id_str}")

        return _dataset_to_response(new_dataset)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as e:
        db.rollback()
        if file_path and not dataset_persisted:
            storage_manager.delete_file(file_path)
        logger.error(f"[{tenant_id}] DB failure while uploading dataset: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to persist uploaded dataset.")

    except Exception as e:
        db.rollback()
        if file_path and not dataset_persisted:
            storage_manager.delete_file(file_path)
        logger.error(f"[{tenant_id}] File upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to upload and process file.")
    finally:
        await file.close()


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

    # Validation: Ensure the SaaS integration actually exists in our registry
    if request.integration_name and request.integration_name not in INTEGRATION_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Integration '{request.integration_name}' is not supported.")

    if request.file_path and f"/tenants/tenant_id={tenant_id}/" not in request.file_path:
        raise HTTPException(status_code=403, detail="file_path must point to tenant-owned storage.")

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
        try:
            process_ingestion_dataset.delay(dataset_id_str, tenant_id)
        except Exception as dispatch_error:
            new_dataset.status = DatasetStatus.FAILED
            new_dataset.schema_metadata = {
                **(new_dataset.schema_metadata or {}),
                "ingestion_error": "Failed to enqueue ingestion task",
            }
            db.commit()
            logger.error(f"[{tenant_id}] Celery dispatch failed for dataset {dataset_id_str}: {dispatch_error}")
            raise HTTPException(status_code=503, detail="Dataset created but processing queue is unavailable.")

        logger.info(f"[{tenant_id}] Dispatched Celery Ingestion Task for Dataset {dataset_id_str}")

        return _dataset_to_response(new_dataset)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"[{tenant_id}] Database error creating dataset: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to register dataset.")


@router.get("", response_model=List[DatasetResponse])
async def list_datasets(
    limit: int = 50,
    offset: int = 0,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Retrieves all datasets for the authenticated tenant.
    Used by the UI sidebar to populate available contexts.
    """
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)

    datasets = (
        db.query(Dataset)
        .filter(Dataset.tenant_id == context.tenant_id)
        .order_by(Dataset.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    # Enrich the response with safe defaults for the UI
    response_list = []
    for ds in datasets:
        response_list.append(_dataset_to_response(ds))
        
    return response_list


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: uuid.UUID,
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

    return _dataset_to_response(dataset)


@router.post("/{dataset_id}/sync", response_model=SyncTriggerResponse)
async def trigger_manual_sync(
    dataset_id: uuid.UUID,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Allows a user to manually click "Sync Now" on the dashboard to pull the latest SaaS data.
    """
    dataset = (
        db.query(Dataset)
        .filter(
            Dataset.id == dataset_id,
            Dataset.tenant_id == context.tenant_id,
        )
        .with_for_update()
        .first()
    )

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    if dataset.status == DatasetStatus.PROCESSING:
        raise HTTPException(status_code=409, detail="Dataset is already currently syncing.")

    previous_status = dataset.status
    dataset.status = DatasetStatus.PROCESSING

    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"[{context.tenant_id}] Failed to mark dataset {dataset_id} as PROCESSING: {e}")
        raise HTTPException(status_code=500, detail="Failed to update dataset sync state.")

    try:
        task = process_ingestion_dataset.delay(str(dataset.id), context.tenant_id)
    except Exception as dispatch_error:
        dataset.status = previous_status
        db.commit()
        logger.error(f"[{context.tenant_id}] Failed to dispatch manual sync for {dataset_id}: {dispatch_error}")
        raise HTTPException(status_code=503, detail="Sync queue unavailable. Please retry.")

    return SyncTriggerResponse(
        status="accepted",
        message="Manual sync triggered successfully. Data will be available shortly.",
        job_id=task.id
    )


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: uuid.UUID,
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

    if dataset.status == DatasetStatus.PROCESSING:
        raise HTTPException(status_code=409, detail="Cannot delete a dataset while sync is in progress.")

    file_path = dataset.file_path

    try:
        # Delete from Postgres
        db.delete(dataset)
        db.commit()

        # Fire and forget resource cleanup to return 204 instantly
        background_tasks.add_task(
            _cleanup_dataset_resources,
            tenant_id=tenant_id,
            dataset_id=str(dataset_id),
            file_path=file_path
        )

    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"[{tenant_id}] Database error deleting dataset {dataset_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete dataset.")