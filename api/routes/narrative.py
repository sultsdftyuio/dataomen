import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any

from api.services.narrative_service import CFONarrativeService

# Isolate narrative routes
router = APIRouter(prefix="/narrative", tags=["Narrative"])

# Strict type safety for the incoming payload
class NarrativeRequest(BaseModel):
    user_question: str
    data_rows: List[Dict[str, Any]]

def get_narrative_service() -> CFONarrativeService:
    """Dependency injection for the service."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set in the environment.")
    return CFONarrativeService(api_key=api_key)

@router.post("/generate")
async def generate_cfo_narrative(
    request: NarrativeRequest,
    service: CFONarrativeService = Depends(get_narrative_service)
):
    """
    Receives executed database rows and returns a 3-sentence executive summary.
    Designed to be called asynchronously by the frontend *after* the chart renders.
    """
    try:
        summary = await service.generate_summary(
            user_question=request.user_question, 
            data_rows=request.data_rows
        )
        return {"summary": summary}
    except Exception as e:
        # We don't want a failed summary to crash the frontend dashboard
        return {"summary": "Narrative engine offline. Please review the chart for insights."}