from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, status
from sqlalchemy.orm import Session
from api.services.dataset_service import DatasetService
# from database import get_db  # Assume you have a standard SQLAlchemy dependency
# from api.auth import get_current_user # Assume you have a JWT auth dependency

router = APIRouter(prefix="/api/v1/datasets", tags=["Datasets"])

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_dataset(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    dataset_name: str = Form(...),
    # db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_user)
):
    """
    Ingests a raw CSV file, stages it securely, and kicks off asynchronous processing.
    """
    # NOTE: Uncomment dependencies once your DB/Auth setup is complete.
    # Mocking for architectural demonstration:
    # db_session = db 
    # user = current_user
    
    # Initialize our OOP Service
    service = DatasetService(db=db_session, current_user=user)
    
    # 1. Stage the file and create the PENDING database record
    dataset = await service.accept_upload(file=file, dataset_name=dataset_name)
    
    file_path = f"/tmp/dataomen_uploads/{dataset.id}.csv"
    
    # 2. Handoff to background task so the frontend doesn't hang
    background_tasks.add_task(
        service.process_file_background, 
        dataset_id=dataset.id, 
        file_path=file_path
    )
    
    # 3. Return immediately so Next.js can show the "Processing..." state
    return {
        "message": "Dataset uploaded successfully and is now processing.",
        "dataset_id": dataset.id,
        "status": dataset.status.value
    }