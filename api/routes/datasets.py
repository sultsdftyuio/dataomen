# api/routes/datasets.py
import logging
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel

# Adjust imports according to your actual project structure
from api.database import get_db
from api.services.storage_manager import storage_manager 
from models import Dataset, DatasetStatus  

router = APIRouter(
    prefix="/datasets",
    tags=["datasets"]
)

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Pydantic Schemas
# ------------------------------------------------------------------------------

class DatasetResponse(BaseModel):
    id: str
    filename: str
    size_bytes: Optional[int] = 0
    row_count: Optional[int] = None
    schema_definition: Optional[List[Dict[str, Any]]] = None
    sample_data: Optional[List[Dict[str, Any]]] = None  # Crucial for Phase 3 LLM Context
    status: str
    message: str

    class Config:
        from_attributes = True

class PresignedUrlRequest(BaseModel):
    file_name: str

class PresignedUrlResponse(BaseModel):
    upload_url: str
    object_key: str

class ProcessFileRequest(BaseModel):
    object_key: str
    dataset_name: str

# ------------------------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------------------------

def get_current_tenant(tenant_id: str = Header("default_tenant", alias="X-Tenant-ID")) -> str:
    """
    Security by Design: Dependency to resolve the active tenant.
    In production, this should extract the tenant_id from the Supabase JWT.
    """
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Tenant ID")
    return tenant_id

# ------------------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------------------

@router.post("/presigned-url", response_model=PresignedUrlResponse)
def get_presigned_url(
    request: PresignedUrlRequest,
    tenant_id: str = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """
    Phase 2: Direct-to-Object Storage.
    Generates a secure, temporary upload URL for the frontend to bypass the backend API.
    Enforces strict path jailing via the storage manager.
    """
    try:
        data = storage_manager.generate_presigned_url(db, tenant_id, request.file_name)
        return PresignedUrlResponse(
            upload_url=data["upload_url"],
            object_key=data["object_key"]
        )
    except Exception as e:
        logger.error(f"Error generating presigned URL for tenant {tenant_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Storage infrastructure error while generating upload link."
        )

@router.post("/process-file", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def process_uploaded_file(
    request: ProcessFileRequest,
    tenant_id: str = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """
    Phase 2: Event-Driven Profiling Worker.
    Triggers DuckDB to stream the newly uploaded S3 object, convert it to highly compressed 
    Parquet, and immediately extract the RAG schema context.
    """
    dataset_id = str(uuid.uuid4())

    try:
        # Pipeline: Raw S3 -> DuckDB Stream -> Parquet S3 -> Schema Metadata
        metadata = storage_manager.convert_to_parquet_and_profile(db, tenant_id, request.object_key)
        
        # Persist the active dataset context to Postgres
        new_dataset = Dataset(
            id=dataset_id,
            tenant_id=tenant_id,
            filename=request.dataset_name,
            file_path=metadata["parquet_path"],
            size_bytes=0,     # Resolved asynchronously or upon first read
            row_count=None,   # Resolved upon first execution
            schema_definition=metadata["columns"],
            status=DatasetStatus.READY.value if hasattr(DatasetStatus, 'READY') else "READY"
        )
        
        db.add(new_dataset)
        db.commit()
        db.refresh(new_dataset)

        return DatasetResponse(
            id=new_dataset.id,
            filename=new_dataset.filename,
            size_bytes=new_dataset.size_bytes,
            row_count=new_dataset.row_count,
            schema_definition=new_dataset.schema_definition,
            sample_data=metadata.get("sample"),
            status=new_dataset.status,
            message="Dataset securely converted to Parquet and profiled via DuckDB."
        )

    except Exception as e:
        logger.error(f"Parquet conversion pipeline failed for {request.object_key}: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while profiling the dataset: {str(e)}"
        )

@router.get("/", response_model=List[DatasetResponse])
def list_datasets(
    tenant_id: str = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """
    Returns a multi-tenant partitioned list of available datasets.
    """
    datasets = db.query(Dataset).filter(Dataset.tenant_id == tenant_id).all()
    
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