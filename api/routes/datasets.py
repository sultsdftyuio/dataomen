# api/routes/datasets.py

import logging
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Header, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

# Core Database & Models
from api.database import get_db
from models import Dataset, DatasetStatus  

# Core Infrastructure & Compute Services
from api.services.storage_manager import storage_manager 
from api.services.sync_engine import SyncEngine, get_sync_engine
from api.services.integrations.base_integration import IntegrationConfig
from api.services.integrations.stripe_connector import StripeIntegration

router = APIRouter(
    prefix="/api/datasets", # Ensuring prefix matches the standard API path
    tags=["Datasets"]
)

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Pydantic Schemas: File Uploads
# ------------------------------------------------------------------------------

class DatasetResponse(BaseModel):
    id: str
    filename: str
    size_bytes: Optional[int] = 0
    row_count: Optional[int] = None
    schema_definition: Optional[List[Dict[str, Any]]] = None
    sample_data: Optional[List[Dict[str, Any]]] = None  # Crucial for LLM Context Routing
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
# Pydantic Schemas: SaaS Integrations (Zero-ETL)
# ------------------------------------------------------------------------------

class SyncTriggerRequest(BaseModel):
    integration_name: str = Field(..., description="The SaaS source, e.g., 'stripe'")
    stream_name: str = Field(..., description="The specific data stream, e.g., 'charges', 'subscriptions'")
    start_timestamp: Optional[str] = Field(None, description="ISO 8601 timestamp for historical pulls")

class SyncTriggerResponse(BaseModel):
    status: str
    message: str
    dataset_id: str
    job_id: str

# ------------------------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------------------------

def get_current_tenant(tenant_id: str = Header("default_tenant", alias="X-Tenant-ID")) -> str:
    """
    Security by Design: Dependency to resolve the active tenant.
    In production, this extracts the tenant_id from the Supabase JWT.
    """
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Tenant ID")
    return tenant_id

# ------------------------------------------------------------------------------
# Routes: Manual File Ingestion (Data Lake Pipeline)
# ------------------------------------------------------------------------------

@router.post("/presigned-url", response_model=PresignedUrlResponse)
def get_presigned_url(
    request: PresignedUrlRequest,
    tenant_id: str = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """
    Direct-to-Object Storage Gateway.
    Generates a secure, temporary upload URL for the frontend to bypass the backend API.
    Enforces strict path jailing via the Adaptive Storage Manager.
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
    Event-Driven Profiling Worker.
    Triggers DuckDB to stream the newly uploaded S3 object, convert it to highly compressed 
    Parquet, and immediately extract the semantic schema context for the LLM.
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

# ------------------------------------------------------------------------------
# Routes: SaaS Integrations (Zero-ETL Pipeline)
# ------------------------------------------------------------------------------

@router.post("/{dataset_id}/sync", response_model=SyncTriggerResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_historical_sync(
    dataset_id: str,
    payload: SyncTriggerRequest,
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """
    The Orchestration Gateway (Zero-ETL).
    Triggered by the React frontend when a user clicks "Sync Data".
    Validates credentials, initializes the integration, and pushes the heavy 
    pipeline into a background worker to prevent HTTP timeouts.
    """
    logger.info(f"[{tenant_id}] Received sync request for dataset {dataset_id} ({payload.integration_name}/{payload.stream_name})")

    # 1. Credential Governance (Mocked: In production, fetch decrypted keys from DB/Vault)
    mock_credentials = {"access_token": "sk_test_123456789"} 

    if not mock_credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail=f"No connected credentials found for {payload.integration_name}."
        )

    # 2. Integration Factory (Dynamic Instantiation)
    integration_config = IntegrationConfig(
        tenant_id=tenant_id,
        integration_name=payload.integration_name,
        credentials=mock_credentials
    )

    if payload.integration_name.lower() == "stripe":
        integration_instance = StripeIntegration(config=integration_config)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Integration '{payload.integration_name}' is not currently supported."
        )

    # 3. Dependency Injection for the Orchestrator
    sync_engine = get_sync_engine(db)

    # 4. Background Task Handoff (Hybrid Performance Paradigm)
    background_tasks.add_task(
        sync_engine.run_historical_sync,
        integration=integration_instance,
        dataset_id=dataset_id,
        stream_name=payload.stream_name,
        start_timestamp=payload.start_timestamp or "2020-01-01T00:00:00Z"
    )

    # 5. Immediate ACK to Frontend
    return SyncTriggerResponse(
        status="processing",
        message="Sync job has been queued and is processing in the background.",
        dataset_id=dataset_id,
        job_id=f"job_{payload.integration_name}_{payload.stream_name}"
    )

@router.get("/{dataset_id}/status")
async def get_sync_status(
    dataset_id: str,
    tenant_id: str = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """
    Polling Endpoint.
    The React frontend calls this periodically while syncing to update the UI progress bar.
    """
    # Note: In production, query the Dataset model to get actual status
    # dataset = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.tenant_id == tenant_id).first()
    # if not dataset: raise HTTPException(404)
    # return {"status": dataset.status}
    
    return {
        "dataset_id": dataset_id,
        "status": "ACTIVE", # Placeholder response
        "message": "Dataset is ready for analytical queries."
    }

# ------------------------------------------------------------------------------
# Routes: List & Query
# ------------------------------------------------------------------------------

@router.get("/", response_model=List[DatasetResponse])
def list_datasets(
    tenant_id: str = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """
    Returns a strictly isolated, multi-tenant partitioned list of available datasets.
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