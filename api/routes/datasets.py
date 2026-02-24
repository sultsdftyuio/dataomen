from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, status
from sqlalchemy.orm import Session
from api.services.dataset_service import DatasetService
from api.database import get_db
# from api.auth import get_current_user # Dependency for Phase 2 auth

router = APIRouter(prefix="/api/v1/datasets", tags=["Datasets"])

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_dataset(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    dataset_name: str = Form(...),
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_user) 
):
    # Mocking user for Phase 1 until JWT logic is fully verified:
    from models import User
    user = db.query(User).first() 
    
    service = DatasetService(db=db, current_user=user)
    
    # 1. Stage file and create DB record
    dataset = await service.accept_upload(file=file, dataset_name=dataset_name)
    
    file_path = f"/tmp/dataomen_uploads/{dataset.id}.csv"
    
    # 2. Handoff to background task
    background_tasks.add_task(
        service.process_file_background, 
        dataset_id=dataset.id, 
        file_path=file_path
    )
    
    return {
        "message": "Dataset uploaded successfully and is now processing.",
        "dataset_id": str(dataset.id),
        "status": dataset.status.value
    }