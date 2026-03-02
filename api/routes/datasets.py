import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

# Database and Auth dependencies (matching your codebase)
# Adjust these imports if your auth file exports `get_current_user` instead of `get_current_tenant`
try:
    from api.auth import get_current_tenant as get_tenant
except ImportError:
    # Fallback in case your auth file exports it as get_current_user
    from api.auth import get_current_user as get_tenant

from api.services.dataset_service import DatasetService

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    tenant: dict = Depends(get_tenant)
) -> Dict[str, Any]:
    """
    Ingests a CSV, Parquet, or Excel file into the analytical engine.
    Tenant isolation is enforced via the injected JWT token.
    """
    logger.info(f"Received upload request for file: {file.filename} from tenant: {tenant.get('sub', 'unknown')}")
    
    # Extract the unique tenant ID from the Supabase JWT payload (usually 'sub')
    tenant_id = tenant.get("sub") or tenant.get("id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Invalid authentication token structure.")

    try:
        # Hybrid Performance: Offload the Heavy Lifting to the Service Layer
        service = DatasetService()
        
        # Read the file stream directly into memory/disk depending on size
        # This keeps the FastAPI event loop unblocked
        file_bytes = await file.read()
        
        result = await service.process_upload(
            filename=file.filename,
            file_bytes=file_bytes,
            tenant_id=tenant_id
        )
        
        # Ensure the returned dict maps cleanly to the frontend's expected format
        return result

    except ValueError as ve:
        # Catch specific data processing errors (e.g. invalid file type)
        logger.error(f"Validation error during upload: {str(ve)}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        # Catch unforeseen pipeline crashes
        logger.error(f"Unexpected error processing dataset: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process dataset.")