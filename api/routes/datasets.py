import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel, Field

# The Modular Strategy: Abstracting underlying storage tech (Cloudflare R2 / AWS S3)
from api.services.storage_manager import StorageManager
# The Hybrid Performance Paradigm: DuckDB for validation/analysis
from api.services.duckdb_validator import DuckDBValidator 

logger = logging.getLogger(__name__)

router = APIRouter()
storage_manager = StorageManager()
validator = DuckDBValidator()

# Type-Safe Schemas
class UploadUrlResponse(BaseModel):
    upload_url: str
    file_key: str
    message: str = "Presigned URL generated successfully"

class IngestRequest(BaseModel):
    tenant_id: str = Field(..., description="The unique identifier for the tenant.")
    file_key: str = Field(..., description="The cloud storage path to the uploaded data.")
    file_name: str = Field(..., description="The original name of the file.")
    
class IngestResponse(BaseModel):
    status: str
    schema_info: Optional[dict] = None
    row_count: Optional[int] = None
    message: str


@router.get("/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    filename: str = Query(..., description="The name of the file to be uploaded"), 
    tenant_id: str = Query(..., description="The unique tenant ID requesting the upload")
):
    """
    Security by Design & Modular Strategy:
    Generates a pre-signed URL for direct client-to-cloud storage upload.
    This bypasses the FastAPI compute layer, preventing large memory overheads.
    """
    if not filename or not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Filename and tenant_id are required parameters."
        )
        
    try:
        # Enforce multi-tenant isolation by prefixing the storage path
        file_key = f"{tenant_id}/datasets/{filename}"
        
        # Generate presigned URL (abstracts underlying R2/S3 logic)
        presigned_url = storage_manager.generate_presigned_upload_url(
            file_key=file_key, 
            expiration_seconds=3600
        )
        
        return UploadUrlResponse(
            upload_url=presigned_url, 
            file_key=file_key
        )
        
    except Exception as e:
        logger.error(f"Error generating presigned URL for tenant {tenant_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Failed to generate secure upload pipeline."
        )


@router.post("/ingest", response_model=IngestResponse)
async def register_dataset(request: IngestRequest):
    """
    Analytical Efficiency:
    Called AFTER the client successfully uploads to the presigned URL.
    Registers the dataset, infers schema, and prepares it for vectorized operations.
    """
    try:
        # 1. Fetch a temporary/streaming reference from StorageManager
        download_url = storage_manager.generate_presigned_download_url(
            file_key=request.file_key, 
            expiration_seconds=300
        )
        
        # 2. Hybrid Performance: Use DuckDB to infer schema directly from the cloud stream (HTTPFS)
        # This prevents us from having to download the entire file into Render's memory
        schema_info = validator.infer_schema(download_url)
        row_count = validator.count_rows(download_url)
        
        # 3. Here you would register the dataset metadata into Supabase 
        # e.g., db.register_dataset(request.tenant_id, request.file_name, request.file_key, schema_info)
        
        return IngestResponse(
            status="success",
            schema_info=schema_info,
            row_count=row_count,
            message=f"Dataset {request.file_name} successfully ingested and validated."
        )
        
    except Exception as e:
        logger.error(f"Failed to ingest dataset {request.file_key}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Data ingestion pipeline failed: {str(e)}"
        )

@router.get("/", response_model=List[dict])
async def list_datasets(tenant_id: str = Query(...)):
    """
    Security by Design:
    Retrieves all datasets isolated specifically to the requesting tenant.
    """
    try:
        # Here you would typically query Supabase using the tenant_id
        # db.get_datasets_by_tenant(tenant_id)
        
        # Placeholder returning storage objects directly as a fallback
        files = storage_manager.list_files(prefix=f"{tenant_id}/datasets/")
        return [{"file_key": f, "status": "available"} for f in files]
        
    except Exception as e:
        logger.error(f"Failed to list datasets for tenant {tenant_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve datasets."
        )