import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

# 1. The Fix: Import the correctly named service class
from api.services.narrative_service import CFONarrativeService

# Initialize the router
router = APIRouter()
logger = logging.getLogger(__name__)

# ==========================================
# Pydantic Schemas (Input/Output Validation)
# ==========================================
class NarrativeRequest(BaseModel):
    """Payload for requesting an analytical narrative."""
    query: str
    data_points: List[Dict[str, Any]]
    
class NarrativeResponse(BaseModel):
    """Response containing the generated executive summary."""
    narrative: str
    insights: List[str]

# ==========================================
# Dependency Injection for the Service
# ==========================================
def get_narrative_service() -> CFONarrativeService:
    """
    Dependency injector for the narrative service.
    Orchestration (Backend): Ensures clean decoupling.
    """
    return CFONarrativeService()

# ==========================================
# Routes
# ==========================================
@router.post("/generate", response_model=NarrativeResponse)
async def generate_narrative(
    request: NarrativeRequest,
    service: CFONarrativeService = Depends(get_narrative_service)
):
    """
    Generates an executive (CFO-level) narrative summary based on the provided 
    analytical data points and user query.
    """
    logger.info(f"Generating narrative for query: '{request.query}'")
    
    try:
        # Contextual RAG: Pass only the strictly necessary schema/data to the LLM
        narrative_result = await service.generate_summary(
            query=request.query,
            data=request.data_points
        )
        
        return NarrativeResponse(
            narrative=narrative_result.get("summary", "No summary generated."),
            insights=narrative_result.get("key_insights", [])
        )
        
    except Exception as e:
        logger.error(f"Failed to generate narrative: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while generating the analytical narrative."
        )