import logging
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

# Core Database & Models
from api.database import get_db
from models import Dataset, DatasetStatus, Organization

# Core Security & SaaS Identity
from api.auth import verify_tenant, TenantContext

# Core Infrastructure & Compute Services
from api.services.storage_manager import storage_manager 
from api.services.sync_engine import SyncEngine, get_sync_engine
from api.services.integrations.base_integration import IntegrationConfig
from api.services.integrations.stripe_connector import StripeIntegration

router = APIRouter(
    prefix="/api/datasets",
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
    # Updated to Dict to match the new Postgres JSONB structure
    schema_definition: Optional[Dict[str, Any]] = None 
    sample_data: Optional[List[Dict[str, Any]]] = None  
    status: str
    message: str

    class Config:
        from_attributes = True

class PresignedUrlRequest(BaseModel):
    file_name: str
    estimated_size_mb: Optional[float] = 0.0 # SaaS feature: pre-flight check

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
# Routes: Manual File Ingestion (Data Lake Pipeline)
# ------------------------------------------------------------------------------

@router.post("/presigned-url", response_model=PresignedUrlResponse)
def get_presigned_url(
    request: PresignedUrlRequest,
    tenant: TenantContext = Depends(verify_tenant), # SECURITY: Cryptographically verified tenant
    db: Session = Depends(get_db)
):
    """
    Direct-to-Object Storage Gateway with SaaS Billing Guardrails.
    Checks subscription limits before issuing an upload ticket.
    """
    # 1. Billing & Usage Guardrail
    org = db.query(Organization).filter(Organization.id == tenant.tenant_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")
        
    projected_storage = org.current_storage_mb + (request.estimated_size_mb or 0)
    if projected_storage > org.max_storage_mb:
        logger.warning(f"[{tenant.tenant_id}] Blocked upload. Storage limit exceeded.")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, 
            detail=f"Storage limit exceeded ({org.max_storage_mb} MB). Please upgrade your plan."
        )

    # 2. Generate secure ticket
    try:
        data = storage_manager.generate_presigned_url(db, tenant.tenant_id, request.file_name)
        return PresignedUrlResponse(
            upload_url=data["upload_url"],
            object_key=data["object_key"]
        )
    except Exception as e:
        logger.error(f"Error generating presigned URL for tenant {tenant.tenant_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Storage infrastructure error while generating upload link."
        )

@router.post("/process-file", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def process_uploaded_file(
    request: ProcessFileRequest,
    tenant: TenantContext = Depends(verify_tenant),
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
        metadata = storage_manager.convert_to_parquet_and_profile(db, tenant.tenant_id, request.object_key)
        
        # Persist the active dataset context to Postgres
        new_dataset = Dataset(
            id=dataset_id,
            tenant_id=tenant.tenant_id, # Bound to isolated tenant context
            name=request.dataset_name, 
            file_path=metadata.get("parquet_path"),
            schema_metadata={"columns": metadata.get("columns", [])}, # Stored as JSONB
            status=DatasetStatus.READY
        )
        
        db.add(new_dataset)
        
        # Increment SaaS Usage
        org = db.query(Organization).filter(Organization.id == tenant.tenant_id).first()
        if org and metadata.get("size_bytes"):
            # Convert bytes to MB and add to usage
            org.current_storage_mb += (metadata["size_bytes"] / (1024 * 1024))
            
        db.commit()
        db.refresh(new_dataset)

        return DatasetResponse(
            id=str(new_dataset.id),
            filename=new_dataset.name,
            size_bytes=metadata.get("size_bytes", 0),
            row_count=metadata.get("row_count"),
            schema_definition=new_dataset.schema_metadata,
            sample_data=metadata.get("sample"),
            status=new_dataset.status.value,
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
    tenant: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    The Orchestration Gateway (Zero-ETL).
    Pushes heavy sync pipeline to background workers, heavily authenticated via JWT.
    """
    logger.info(f"[{tenant.tenant_id}] Received sync request for dataset {dataset_id}")

    # Verify the dataset actually belongs to the user
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.tenant_id == tenant.tenant_id).first()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or unauthorized.")

    # 1. Credential Governance (Mocked: In production, fetch decrypted keys from DB/Vault)
    mock_credentials = {"access_token": "sk_test_123456789"} 

    # 2. Integration Factory
    integration_config = IntegrationConfig(
        tenant_id=tenant.tenant_id,
        integration_name=payload.integration_name,
        credentials=mock_credentials
    )

    if payload.integration_name.lower() == "stripe":
        integration_instance = StripeIntegration(config=integration_config)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Integration '{payload.integration_name}' is not supported."
        )

    sync_engine = get_sync_engine(db)

    # 4. Background Task Handoff
    background_tasks.add_task(
        sync_engine.run_historical_sync,
        integration=integration_instance,
        dataset_id=dataset_id,
        stream_name=payload.stream_name,
        start_timestamp=payload.start_timestamp or "2020-01-01T00:00:00Z"
    )

    return SyncTriggerResponse(
        status="processing",
        message="Sync job has been queued and is processing in the background.",
        dataset_id=dataset_id,
        job_id=f"job_{payload.integration_name}_{payload.stream_name}"
    )

@router.get("/{dataset_id}/status")
async def get_sync_status(
    dataset_id: str,
    tenant: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Polling Endpoint.
    The React frontend calls this periodically while syncing to update the UI progress bar.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.tenant_id == tenant.tenant_id).first()
    if not dataset: 
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        
    return {
        "dataset_id": str(dataset.id),
        "status": dataset.status.value, 
        "message": f"Dataset is currently {dataset.status.value.lower()}."
    }

# ------------------------------------------------------------------------------
# Routes: List & Query
# ------------------------------------------------------------------------------

@router.get("/", response_model=List[DatasetResponse])
def list_datasets(
    tenant: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Returns a strictly isolated, multi-tenant partitioned list of available datasets.
    """
    datasets = db.query(Dataset).filter(Dataset.tenant_id == tenant.tenant_id).all()
    
    return [
        DatasetResponse(
            id=str(d.id),
            filename=d.name,
            size_bytes=0, # Retrieve from your storage engine or pre-computed metadata
            schema_definition=d.schema_metadata,
            status=d.status.value,
            message="OK"
        ) for d in datasets
    ]