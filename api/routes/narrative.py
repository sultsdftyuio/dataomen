# api/routes/narrative.py

import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.database import get_db

# Core Security & SaaS Identity
from api.auth import verify_tenant, TenantContext
from api.services.tenant_security_provider import tenant_security

# Refactored Service (Now uses centralized llm_client & parameterless singleton)
from api.services.narrative_service import narrative_service
from api.services.query_planner import QueryPlan
from api.services.insight_orchestrator import InsightPayload

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/narrative",
    tags=["Narrative"],
    responses={404: {"description": "Not found"}},
)

# ------------------------------------------------------------------
# REQUEST / RESPONSE CONTRACTS
# ------------------------------------------------------------------

class NarrativeRequest(BaseModel):
    query: str
    dataset_id: str
    data_results: List[Dict[str, Any]] = [] # The raw data to be narrated
    intent: Optional[str] = None

class NarrativeRouteResponse(BaseModel):
    status: str
    headline: str
    executive_summary: str
    key_insights: List[str]
    recommended_action: Optional[str]

# ------------------------------------------------------------------
# NARRATIVE GENERATION ENDPOINT
# ------------------------------------------------------------------

@router.post("/generate", response_model=NarrativeRouteResponse)
async def generate_narrative(
    request: NarrativeRequest,
    tenant_context: TenantContext = Depends(verify_tenant), # Security: Dual-Auth Check
    db: Session = Depends(get_db)
):
    """
    Generates a contextual, analytical narrative based on user query and data.
    
    Refactored to use the Master Intelligence pipeline:
    1. Wraps raw results in an InsightPayload.
    2. Uses the global narrative_service singleton.
    3. Enforces multi-tenant security and metering.
    """
    try:
        # Security Phase: Wrap the expensive LLM call in the metering context
        async def execute_narrative_task():
            # 1. Prepare analytical context (Mocking a plan/payload for consistency)
            dummy_plan = QueryPlan(
                intent=request.intent or request.query,
                is_achievable=True,
                steps=[],
                suggested_visualizations=[]
            )
            
            # 2. Ground the analysis in raw data row count
            payload = InsightPayload(
                row_count=len(request.data_results),
                intent_analyzed=dummy_plan.intent
            )
            
            # 3. Invoke the refactored Executive Storyteller (uses llm_client singleton)
            result = await narrative_service.generate_executive_summary(
                payload=payload,
                plan=dummy_plan,
                chart_spec=None,
                tenant_id=tenant_context.tenant_id
            )
            return result

        # Execute within the tenant-isolated security context
        narrative_obj = await tenant_security.execute_in_context(
            db=db,
            tenant_id=tenant_context.tenant_id,
            operation_name="generate_narrative",
            func=execute_narrative_task
        )
        
        return NarrativeRouteResponse(
            status="success",
            headline=f"Analysis: {request.query}",
            executive_summary=narrative_obj.executive_summary,
            key_insights=narrative_obj.key_insights,
            recommended_action=narrative_obj.recommended_action
        )

    except PermissionError as pe:
        # Blocks execution if billing limits are hit
        logger.warning(f"[{tenant_context.tenant_id}] Blocked narrative: {str(pe)}")
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(pe))
    
    except Exception as e:
        logger.error(f"[{tenant_context.tenant_id}] Narrative generation failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while synthesizing the data narrative."
        )