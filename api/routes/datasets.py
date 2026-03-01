import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

# Import your database session generator and auth dependency
# (Adjust the import paths if your folder structure differs slightly)
from api.database import get_db
from api.auth import get_current_tenant
from api.services.dataset_service import dataset_service

# Configure logging for observability
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# The Modular Strategy: Grouping dataset operations under a single router
router = APIRouter(prefix="/datasets", tags=["Datasets"])

@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant)
) -> Dict[str, Any]:
    """
    Handles secure, multi-tenant file ingestion. 
    Passes the file buffer off to the dataset_service for zero-copy storage.
    """
    logger.info(f"Tenant {tenant_id} is uploading file: {file.filename}")
    try:
        dataset = dataset_service.process_upload(db, tenant_id, file)
        logger.info(f"Successfully uploaded dataset {dataset.id} for tenant {tenant_id}")
        
        return {
            "message": "Upload successful", 
            "dataset_id": dataset.id,
            "filename": dataset.name
        }
    except Exception as e:
        logger.error(f"Upload failed for tenant {tenant_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload dataset: {str(e)}")

@router.get("/{dataset_id}/preview")
async def preview_dataset(
    dataset_id: str,
    limit: Optional[int] = Query(None, description="Optional row limit. Defaults to all rows."),
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant)
) -> Dict[str, Any]:
    """
    Fetches a fast, vectorized data preview for the UI using DuckDB.
    Returns the entire dataset by default so the user can infinitely scroll.
    """
    logger.info(f"Tenant {tenant_id} requested preview for dataset: {dataset_id}")
    try:
        # Analytical Efficiency: Offload the scanning logic entirely to the DuckDB service
        preview_data = dataset_service.get_dataset_preview(db, tenant_id, dataset_id, limit=limit)
        return preview_data
    
    except ValueError as ve:
        # Catch explicit validation errors (e.g., dataset not found or still processing)
        logger.warning(f"Preview warning for {dataset_id}: {str(ve)}")
        raise HTTPException(status_code=404, detail=str(ve))
    
    except Exception as e:
        logger.error(f"Preview failed for dataset {dataset_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate dataset preview: {str(e)}")