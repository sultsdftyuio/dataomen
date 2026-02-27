import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from api.database import get_db
from api.auth import get_current_user
from api.services.narrative_service import NarrativeService

logger = logging.getLogger("dataomen.narrative")

router = APIRouter()

class NarrativeRequest(BaseModel):
    dataset_id: str

@router.post("/generate")
async def generate_narrative(
    request: NarrativeRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Modular Strategy: High-level narrative generation scoped to a specific tenant.
    This endpoint leverages LLMs to provide a human-readable interpretation
     of the data metrics for the specified dataset.
    """
    try:
        service = NarrativeService(db)
        
        # Security by Design: Ensure the narrative is strictly scoped to the tenant_id
        narrative = await service.generate_summary(
            dataset_id=request.dataset_id,
            tenant_id=user["tenant_id"]
        )
        
        if not narrative:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Dataset not found or no narrative could be generated."
            )
            
        return {
            "dataset_id": request.dataset_id,
            "narrative": narrative
        }

    except Exception as e:
        logger.error(f"Narrative generation error for tenant {user['tenant_id']}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate narrative summary."
        )