# api/routes/datasets.py

import logging
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

# Core Database & Models
from api.database import get_db
from models import Dataset, DatasetStatus, Organization

# Core Security & SaaS Identity
from api.services.tenant_security_provider import tenant_security, TenantContext
# Re-using the Dual-Auth gateway standard established in query.py
from api.routes.query import verify_tenant_auth 

# Core Infrastructure Orchestrators
from api.services.ingestion_service import ingestion_service 
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
    schema_definition: Optional[List[Dict[str, Any]]] = None 
    sample_data: Optional[List[Dict[str, Any]]] = None  
    status: str
    message: str

    class Config:
        from_attributes = True

class PresignedUrlRequest(BaseModel):
    file_name: str
    dataset_name: str
    content_type: str = "text/csv"
    estimated_size_mb: Optional[float] = 0.0 

class PresignedUrlResponse(BaseModel):
    dataset_id: str
    upload_url: str
    object_key: str
    fields: Dict[str, str]

class ProcessFileRequest(BaseModel):
    dataset_id: str
    object_key: str

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
    context: TenantContext = Depends(verify_tenant_auth), # Security Phase 1: Dual-Auth Check
    db: Session = Depends(get_db)
):
    """
    Direct-to-Object Storage Gateway with SaaS Billing Guardrails.
    Creates a PENDING dataset and issues a cryptographically secure upload ticket.
    """
    # 1. Billing & Usage Guardrail
    org = db.query(Organization).filter(Organization.id == context.tenant_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")
        
    projected_storage = org.current_storage_mb + (request.estimated_size_mb or 0)
    if projected_storage > org.max_storage_mb:
        logger.warning(f"[{context.tenant_id}] Blocked upload. Storage limit exceeded.")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, 
            detail=f"Storage limit exceeded ({org.max_storage_mb} MB). Please upgrade your plan."
        )

    try:
        # 2. Pre-register the dataset in Postgres (PENDING state)
        dataset_id = uuid.uuid4()
        new_dataset = Dataset(
            id=dataset_id,
            tenant_id=context.tenant_id,
            name=request.dataset_name,
            status=DatasetStatus.PENDING
        )
        db.add(new_dataset)
        db.commit()

        # 3. Generate secure ticket via Orchestrator
        upload_data = ingestion_service.generate_presigned_upload(
            db=db, 
            tenant_id=context.tenant_id, 
            file_name=request.file_name,
            content_type=request.content_type
        )
        
        return PresignedUrlResponse(
            dataset_id=str(dataset_id),
            upload_url=upload_data["url"],
            object_key=upload_data["object_key"],
            fields=upload_data["fields"]
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error generating presigned URL for tenant {context.tenant_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Storage infrastructure error while generating upload link."
        )

@router.post("/process-file", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def process_uploaded_file(
    request: ProcessFileRequest,
    context: TenantContext = Depends(verify_tenant_auth),
    db: Session = Depends(get_db)
):
    """
    Event-Driven Profiling Worker.
    Delegates heavily vectorized DuckDB processing to the ingestion_service.
    """
    # 1. Verify Dataset Ownership
    dataset = db.query(Dataset).filter(
        Dataset.id == request.dataset_id,
        Dataset.tenant_id == context.tenant_id
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or unauthorized.")

    try:
        dataset.status = DatasetStatus.PROCESSING
        db.commit()

        # 2. Execute via the Orchestrator (Handles DuckDB -> Parquet conversion safely)
        result = await ingestion_service.process_raw_to_parquet(
            db=db,
            tenant_id=context.tenant_id,
            dataset_id=str(dataset.id),
            raw_object_key=request.object_key
        )
        
        # Refresh the ORM model to get the updated status and schema metadata
        db.refresh(dataset)
        
        # 3. Increment SaaS Storage Usage safely
        org = db.query(Organization).filter(Organization.id == context.tenant_id).first()
        if org:
            # Add standard buffer or actual computed size based on ingestion outputs
            org.current_storage_mb += 1.0 
            db.commit()

        return DatasetResponse(
            id=str(dataset.id),
            filename=dataset.name,
            schema_definition=dataset.schema_metadata,
            status=dataset.status.value,
            message="Dataset securely converted to Parquet and profiled via DuckDB."
        )

    except Exception as e:
        logger.error(f"Parquet conversion pipeline failed for {request.object_key}: {e}")
        # Revert dataset to failed state
        dataset.status = DatasetStatus.FAILED
        db.commit()
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
    context: TenantContext = Depends(verify_tenant_auth),
    db: Session = Depends(get_db)
):
    """
    The Orchestration Gateway (Zero-ETL).
    Pushes heavy sync pipeline to background workers, heavily authenticated via Dual-Auth.
    """
    logger.info(f"[{context.tenant_id}] Received sync request for dataset {dataset_id}")

    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id, 
        Dataset.tenant_id == context.tenant_id
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or unauthorized.")

    # 1. Credential Governance (Mocked: In production, fetch decrypted keys from DB/Vault)
    mock_credentials = {"access_token": "sk_test_123456789"} 

    # 2. Integration Factory
    integration_config = IntegrationConfig(
        tenant_id=context.tenant_id,
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

    # 3. Background Task Handoff
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
    context: TenantContext = Depends(verify_tenant_auth),
    db: Session = Depends(get_db)
):
    """
    Polling Endpoint for the Frontend UI progress bars.
    """
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id, 
        Dataset.tenant_id == context.tenant_id
    ).first()
    
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
    context: TenantContext = Depends(verify_tenant_auth),
    db: Session = Depends(get_db)
):
    """
    Returns a strictly isolated, multi-tenant partitioned list of available datasets.
    """
    datasets = db.query(Dataset).filter(Dataset.tenant_id == context.tenant_id).all()
    
    return [
        DatasetResponse(
            id=str(d.id),
            filename=d.name,
            size_bytes=0, 
            schema_definition=d.schema_metadata if isinstance(d.schema_metadata, list) else [],
            status=d.status.value,
            message="OK"
        ) for d in datasets
    ]