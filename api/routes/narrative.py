import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

# Corrected Import: Changed CFONarrativeService to NarrativeService
from api.services.narrative_service import NarrativeService
from api.auth import get_current_user # Assumes your modular auth dependency

# Configure logging for observability
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/narrative",
    tags=["Narrative"],
    responses={404: {"description": "Not found"}},
)

# Type-Safe request model
class NarrativeRequest(BaseModel):
    query: str
    dataset_id: str
    context: Optional[Dict[str, Any]] = None

class NarrativeResponse(BaseModel):
    status: str
    narrative: str
    insights: List[Dict[str, Any]]

@router.post("/generate", response_model=NarrativeResponse)
async def generate_narrative(
    request: NarrativeRequest,
    user: dict = Depends(get_current_user)  # Tenant isolation via auth dependency
):
    """
    Generates a contextual, analytical narrative based on user query and data.
    """
    try:
        # Enforce multi-tenant security by passing tenant_id to the service
        tenant_id = user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant ID missing from authenticated user."
            )

        # Instantiate the corrected service class
        service = NarrativeService()
        
        # We assume the service logic handles semantic routing and vectorized data fetching
        result = await service.generate(
            tenant_id=tenant_id,
            dataset_id=request.dataset_id,
            query=request.query,
            context=request.context or {}
        )
        
        return NarrativeResponse(
            status="success",
            narrative=result.get("narrative", ""),
            insights=result.get("insights", [])
        )

    except ValueError as ve:
        logger.warning(f"Validation error in narrative generation: {str(ve)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Unexpected error in narrative generation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while generating the narrative."
        )