# api/routes/chat.py
import logging
import json
from typing import Optional, Any, List, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Core Security & Database
from api.auth import verify_tenant, TenantContext
from api.database import get_db
from models import Dataset

# Refactored Services (Clean Singleton Pattern)
from api.services.query_planner import QueryPlanner
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import compute_engine, DatasetMetadata, ComputeLocation
from api.services.insight_orchestrator import InsightOrchestrator
from api.services.narrative_service import narrative_service
from api.services.orchestrator import AnalyticalOrchestrator
from api.services.diagnostic_service import DiagnosticService
from api.services.subscription_manager import subscription_manager
from api.services.semantic_router import SemanticRouter
from api.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat"])

# ------------------------------------------------------------------
# Service Layer Initialization
# ------------------------------------------------------------------

planner = QueryPlanner()
generator = NL2SQLGenerator()
insight_engine = InsightOrchestrator()
llm_client = LLMClient()

diagnostic_service = DiagnosticService(
    compute=compute_engine
)

orchestrator = AnalyticalOrchestrator(
    planner=planner,
    generator=generator,
    compute_engine=compute_engine,
    insight_engine=insight_engine,
    diagnostic_service=diagnostic_service,
    narrative_service=narrative_service
)

# ------------------------------------------------------------------
# Request / Response Contracts
# ------------------------------------------------------------------

class HistoryMessage(BaseModel):
    role: str
    content: str

class OrchestrateRequest(BaseModel):
    prompt: str = Field(..., description="User's natural language query or conversational message.")
    active_dataset_ids: Optional[List[str]] = Field(default_factory=list, description="Dataset UUIDs to include.")
    history: Optional[List[HistoryMessage]] = Field(default_factory=list)
    context_id: Optional[str] = Field(default=None, description="Optional link to a specific anomaly or alert.")

# ------------------------------------------------------------------
# Main Copilot Endpoint (Dual-Mode Streaming)
# ------------------------------------------------------------------

@router.post("/orchestrate")
async def orchestrate_chat(
    request: OrchestrateRequest,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Intelligent Dual-Mode Copilot Pipeline.
    
    Routes user queries based on semantic intent:
    1. Conversational / Educational -> Standard RAG Streaming
    2. Analytical / Data Query -> Vectorized SQL Pipeline Streaming
    """
    tenant_id = context.tenant_id
    logger.info(f"[{tenant_id}] Copilot session initiated for: '{request.prompt[:80]}...'")

    # 1. QUOTA & SUBSCRIPTION ENFORCEMENT
    try:
        has_access = subscription_manager.verify_access_and_reserve_credits(
            db=db,
            tenant_id=tenant_id
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Monthly query limit reached. Please upgrade for more insights."
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{tenant_id}] Subscription check failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Resource management error.")

    # 2. SEMANTIC ROUTING (Contextual RAG)
    # Instantiate router with tenant context to keep token boundaries tight
    router = SemanticRouter(tenant_id=tenant_id)
    route_decision = await router.route_query(request.prompt)

    # ------------------------------------------------------------------
    # PATH A: Conversational Assistant (Educational / General Inquiry)
    # ------------------------------------------------------------------
    if route_decision.destination == "CONVERSATIONAL":
        logger.info(f"[{tenant_id}] Routing to Conversational Pipeline.")
        
        async def generate_conversational_stream():
            # Build contextually aware system prompt without exposing raw data
            system_prompt = f"""
            You are DataOmen AI, an expert business analyst and friendly assistant.
            You are helping a non-technical founder understand data concepts, business metrics, or navigating the platform.
            
            Current Context: The user is asking a general question, not requesting a specific chart from their database.
            Instruction: Be concise, encouraging, and avoid overly technical jargon.
            """
            
            # Yield an initial status update for the UI
            yield f"data: {json.dumps({'type': 'status', 'message': 'Thinking...'})}\n\n"
            
            try:
                # Stream the text response using the singleton LLM client
                async for chunk in llm_client.stream_response(
                    prompt=request.prompt,
                    system_instructions=system_prompt,
                    history=[h.dict() for h in request.history[-5:]] # Keep history tight
                ):
                    yield f"data: {json.dumps({'type': 'narrative_chunk', 'content': chunk})}\n\n"
                
                # Signal completion
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                
            except Exception as e:
                logger.error(f"[{tenant_id}] Conversational Streaming Error: {str(e)}")
                yield f"data: {json.dumps({'type': 'error', 'message': 'I encountered an error while thinking.'})}\n\n"

        return StreamingResponse(
            generate_conversational_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Content-Type": "text/event-stream"
            }
        )

    # ------------------------------------------------------------------
    # PATH B: Analytical Pipeline (Vectorized Compute Engine)
    # ------------------------------------------------------------------
    logger.info(f"[{tenant_id}] Routing to Analytical Compute Engine.")

    if not request.active_dataset_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This question requires data analysis. Please select at least one dataset."
        )

    # Securely retrieve only authorized datasets
    datasets = db.query(Dataset).filter(
        Dataset.id.in_(request.active_dataset_ids),
        Dataset.tenant_id == tenant_id
    ).all()

    if not datasets:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more datasets not found or access denied."
        )

    # SCHEMA CONTEXT PREPARATION 
    # Only pass the schema metadata specifically requested by the semantic router
    full_schema: Dict[str, Dict[str, str]] = {}
    file_uris: List[str] = []

    for ds in datasets:
        if ds.schema_metadata:
            # Token Efficiency: The Semantic Router could pre-filter columns here
            table_name = f"dataset_{str(ds.id).replace('-', '_')}"
            full_schema[table_name] = ds.schema_metadata
        if ds.file_url:
            file_uris.append(ds.file_url)

    # COMPUTE METADATA RESOLUTION
    target_dataset_meta = DatasetMetadata(
        dataset_id=str(datasets[0].id),
        tenant_id=tenant_id,
        location=ComputeLocation.LOCAL_DATA_LAKE,
        size_bytes=sum(ds.file_size_bytes or 0 for ds in datasets),
        file_uris=file_uris
    )

    try:
        pipeline_generator = orchestrator.run_full_pipeline(
            prompt=request.prompt,
            dataset=target_dataset_meta,
            tenant_id=tenant_id,
            full_schema=full_schema,
            context_id=request.context_id 
        )

        return StreamingResponse(
            pipeline_generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no", 
                "Content-Type": "text/event-stream"
            }
        )

    except Exception as e:
        logger.error(f"[{tenant_id}] Pipeline Orchestration Crash: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The analytical brain encountered an error."
        )

# ------------------------------------------------------------------
# Deprecated Endpoints
# ------------------------------------------------------------------
@router.post("/sync", include_in_schema=False)
async def process_chat_sync():
    raise HTTPException(
        status_code=status.HTTP_426_UPGRADE_REQUIRED,
        detail="Upgrade Required. Use /api/chat/orchestrate."
    )