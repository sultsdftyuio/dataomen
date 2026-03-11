# api/routes/datasets.py

import logging
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

# Core Database & Models
from api.database import get_db
from models import Dataset, DatasetStatus, Organization

# Core Security & SaaS Identity
from api.services.tenant_security_provider import tenant_security, TenantContext
from api.routes.query import verify_tenant_auth 

# Core Infrastructure Orchestrators
# We now import the high-performance Polars/Parquet ingestion service
from api.services.ingestion_service import DataIngestionService
from api.services.sync_engine import SyncEngine, get_sync_engine
from api.services.integrations.base_integration import IntegrationConfig
from api.services.integrations.stripe_connector import StripeIntegration

# Dependency injection for the Supabase Client
from utils.supabase.client import create_client 

router = APIRouter(
    prefix="/api/datasets",
    tags=["Datasets"]
)

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Dependency: Initialize High-Performance Ingestion Engine
# ------------------------------------------------------------------------------
def get_ingestion_service() -> DataIngestionService:
    supabase = create_client()
    return DataIngestionService(supabase_client=supabase)

# ------------------------------------------------------------------------------
# Pydantic Schemas
# ------------------------------------------------------------------------------

class DatasetResponse(BaseModel):
    id: str
    filename: str
    size_bytes: Optional[int] = 0
    row_count: Optional[int] = None
    schema_definition: Optional[List[Dict[str, Any]]] = None 
    status: str
    message: str

    class Config:
        from_attributes = True

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
# Routes: High-Performance Direct Upload (Polars -> Parquet Pipeline)
# ------------------------------------------------------------------------------

@router.post("/upload", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def upload_and_process_file(
    file: UploadFile = File(...),
    dataset_name: str = Form(...),
    context: TenantContext = Depends(verify_tenant_auth),
    db: Session = Depends(get_db),
    ingestion_engine: DataIngestionService = Depends(get_ingestion_service)
):
    """
    Direct-to-Memory Ingestion Pipeline.
    Streams CSV/JSON into Polars, infers the dictionary, compresses to Parquet, 
    and saves to tenant-isolated storage in one vectorized pass.
    """
    # 1. Billing & Usage Guardrail (Before reading heavy files)
    org = db.query(Organization).filter(Organization.id == context.tenant_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")
        
    # Pre-register the dataset in Postgres (PROCESSING state)
    dataset_id = uuid.uuid4()
    new_dataset = Dataset(
        id=dataset_id,
        tenant_id=context.tenant_id,
        name=dataset_name,
        status=DatasetStatus.PROCESSING
    )
    db.add(new_dataset)
    db.commit()

    try:
        # 2. Execute Vectorized Rust/Polars Transformation & Upload
        result = await ingestion_engine.process_and_upload(
            file=file,
            tenant_id=context.tenant_id,
            dataset_name=dataset_name
        )
        
        # 3. Save AI-Inferred Schema and Stats to Database
        # This populates the UI we built in Option 2 automatically
        new_dataset.row_count = result.row_count
        new_dataset.size_bytes = result.size_bytes
        new_dataset.storage_path = result.storage_path
        new_dataset.schema_metadata = [col.to_dict() for col in result.columns]
        new_dataset.status = DatasetStatus.ACTIVE
        
        # Update Organization storage
        storage_mb_used = result.size_bytes / (1024 * 1024)
        org.current_storage_mb += storage_mb_used
        
        db.commit()
        db.refresh(new_dataset)

        return DatasetResponse(
            id=str(new_dataset.id),
            filename=new_dataset.name,
            size_bytes=new_dataset.size_bytes,
            row_count=new_dataset.row_count,
            schema_definition=new_dataset.schema_metadata,
            status=new_dataset.status.value,
            message="Data successfully vectorized, compressed to Parquet, and indexed."
        )

    except Exception as e:
        db.rollback()
        logger.error(f"Upload pipeline failed for tenant {context.tenant_id}: {e}")
        new_dataset.status = DatasetStatus.FAILED
        db.add(new_dataset)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ingestion failed: {str(e)}"
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
    Pushes heavy API sync pipelines (like Stripe) to background workers.
    """
    logger.info(f"[{context.tenant_id}] Received sync request for dataset {dataset_id}")

    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id, 
        Dataset.tenant_id == context.tenant_id
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or unauthorized.")

    # 1. Credential Governance (Mocked: In production, fetch decrypted keys from Vault)
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


@router.get("/{dataset_id}/schema", response_model=Dict[str, Any])
async def get_dataset_schema(
    dataset_id: str,
    context: TenantContext = Depends(verify_tenant_auth),
    db: Session = Depends(get_db)
):
    """
    Returns the metadata schema required by the Dataset Dictionary UI manager.
    """
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id, 
        Dataset.tenant_id == context.tenant_id
    ).first()
    
    if not dataset: 
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        
    return {
        "dataset": {
            "id": str(dataset.id),
            "name": dataset.name,
            "source_type": "File Upload" if not dataset.storage_path else "Zero-ETL Sync",
            "row_count": dataset.row_count,
            "size_bytes": dataset.size_bytes,
            "last_synced": str(dataset.created_at),
            "columns": dataset.schema_metadata if isinstance(dataset.schema_metadata, list) else []
        }
    }


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

@router.get("", response_model=List[DatasetResponse])
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
            size_bytes=d.size_bytes, 
            row_count=d.row_count,
            schema_definition=d.schema_metadata if isinstance(d.schema_metadata, list) else [],
            status=d.status.value,
            message="OK"
        ) for d in datasets
    ]