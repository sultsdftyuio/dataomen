from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, status
from sqlalchemy.orm import Session
from typing import List

from api.services.dataset_service import DatasetService
from api.database import get_db
from api.auth import get_current_user
from models import DatasetResponse

router = APIRouter()

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_dataset(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Orchestration (Backend): Upload a dataset and associate it with the tenant_id 
    derived from the Supabase JWT.
    """
    service = DatasetService(db)
    # We pass the user['tenant_id'] to ensure the file is stored in a tenant-isolated path
    job_id = await service.process_upload(
        file=file, 
        tenant_id=user["tenant_id"],
        background_tasks=background_tasks
    )
    return {"job_id": job_id, "message": "Upload started"}

@router.get("/", response_model=List[DatasetResponse])
def list_datasets(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Security by Design: Only list datasets belonging to the current tenant.
    """
    service = DatasetService(db)
    return service.get_tenant_datasets(tenant_id=user["tenant_id"])