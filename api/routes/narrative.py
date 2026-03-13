# api/routes/narrative.py

import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.database import get_db

# Core Security & SaaS Identity (Standardized Dual-Auth Gateway)
from api.auth import verify_tenant, TenantContext  # CRITICAL FIX: Corrected import locations
from api.services.tenant_security_provider import tenant_security
from api.services.narrative_service import NarrativeService

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
    tenant_context: TenantContext = Depends(verify_tenant), # Security Phase 1: Dual-Auth Check
    db: Session = Depends(get_db)
):
    """
    Generates a contextual, analytical narrative based on user query and data.
    Securely metered via the SubscriptionManager to prevent LLM credit abuse.
    """
    try:
        service = NarrativeService()
        
        # Security Phase 2: Wrap the expensive LLM call in the metering context
        async def execute_narrative():
            return await service.generate(
                tenant_id=tenant_context.tenant_id,
                dataset_id=request.dataset_id,
                query=request.query,
                context=request.context or {}
            )
            
        result = await tenant_security.execute_in_context(
            db=db,
            tenant_id=tenant_context.tenant_id,
            operation_name="generate_narrative",
            func=execute_narrative
        )
        
        return NarrativeResponse(
            status="success",
            narrative=result.get("narrative", ""),
            insights=result.get("insights", [])
        )

    except PermissionError as pe:
        # 402 Payment Required: Blocks execution before OpenAI is hit
        logger.warning(f"[{tenant_context.tenant_id}] Blocked narrative execution. Payment required: {str(pe)}")
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(pe))
    
    except ValueError as ve:
        logger.warning(f"[{tenant_context.tenant_id}] Validation error in narrative generation: {str(ve)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    
    except Exception as e:
        logger.error(f"[{tenant_context.tenant_id}] Unexpected error in narrative generation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while generating the narrative."
        )