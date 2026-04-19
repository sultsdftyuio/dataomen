# api/routes/chat.py

import logging
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Core Security & Database
from api.auth import verify_tenant, TenantContext
from api.database import get_db

# Refactored Services (Clean Dependency Injection)
from api.services.query_planner import QueryPlanner
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine
from api.services.insight_orchestrator import InsightOrchestrator
from api.services.narrative_service import NarrativeService
from api.services.diagnostic_service import DiagnosticService
from api.services.semantic_router import SemanticRouter
from api.services.llm_client import LLMClient
from api.services.orchestrator import AnalyticalOrchestrator

# Import global singletons for resources that manage state/connections
from api.services.subscription_manager import subscription_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat"])

# ------------------------------------------------------------------
# Service Layer Initialization (Hybrid OOP Pattern)
# ------------------------------------------------------------------

planner = QueryPlanner()
generator = NL2SQLGenerator()
compute_engine = ComputeEngine()
insight_engine = InsightOrchestrator()
narrative_service = NarrativeService()
diagnostic_service = DiagnosticService()
semantic_router = SemanticRouter()
llm_client = LLMClient()

# Assemble the main Intelligence Pipeline
orchestrator = AnalyticalOrchestrator(
    planner=planner,
    generator=generator,
    compute_engine=compute_engine,
    insight_engine=insight_engine,
    diagnostic_service=diagnostic_service,
    narrative_service=narrative_service,
    router=semantic_router,
    llm_client=llm_client
)

# ------------------------------------------------------------------
# Request / Response Contracts
# ------------------------------------------------------------------

class HistoryMessage(BaseModel):
    role: str
    content: str

class OrchestrateRequest(BaseModel):
    prompt: str = Field(..., description="User's natural language query or conversational message.")
    agent_id: Optional[str] = Field(default=None, description="UUID of the specific AI Agent handling the query.")
    active_dataset_ids: Optional[List[str]] = Field(default_factory=list, description="Dataset UUIDs to include (e.g., Shopify Data).")
    active_document_ids: Optional[List[str]] = Field(default_factory=list, description="Document UUIDs to include for vector RAG context.")
    history: Optional[List[HistoryMessage]] = Field(default_factory=list, description="Recent conversation context.")
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
    2. Analytical / Data Query -> Vectorized SQL Pipeline Streaming via DuckDB
    """
    tenant_id = context.tenant_id
    logger.info(f"[{tenant_id}] Copilot session initiated for: '{request.prompt[:80]}...' | Agent: {request.agent_id}")

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

    # 2. SEMANTIC INTENT ROUTING
    # Use the lightweight LLM capability to determine if this requires data processing
    route_decision, _routing_trace = await semantic_router.route_query(
        request.prompt,
        tenant_id=tenant_id,
    )

    # ------------------------------------------------------------------
    # PATH A: Conversational Assistant (Educational / Exploratory)
    # ------------------------------------------------------------------
    if route_decision.destination in {"CONVERSATIONAL", "CLARIFICATION_REQUIRED"}:
        logger.info(f"[{tenant_id}] Routing to Conversational Assistant.")

        async def generate_conversational_stream():
            # Build contextually aware system prompt
            system_prompt = """
            You are DataOmen AI, an expert business analyst and friendly assistant.
            You are helping a non-technical founder understand data concepts, business metrics, or navigating the platform.

            Current Context: The user is asking a general question, not requesting a specific chart from their database.
            Instruction: Be concise, encouraging, and avoid overly technical jargon.
            """

            # Enforce specialized agent persona if one is active
            if request.agent_id:
                from models import Agent

                agent = db.query(Agent).filter(
                    Agent.id == request.agent_id,
                    Agent.tenant_id == tenant_id,
                ).first()

                if agent and agent.role_description:
                    system_prompt = agent.role_description

            # Yield an initial status update for the UI
            yield f"data: {json.dumps({'type': 'status', 'content': 'Thinking...'})}\n\n"

            try:
                # Stream the text response using the singleton LLM client
                async for chunk in llm_client.stream_text(
                    system_prompt=system_prompt,
                    prompt=request.prompt,
                    history=[h.model_dump() for h in (request.history or [])[-5:]],
                ):
                    yield f"data: {json.dumps({'type': 'narrative_chunk', 'content': chunk})}\n\n"

                # Signal completion
                yield f"data: {json.dumps({'type': 'done', 'content': 'Complete'})}\n\n"

            except Exception as e:
                logger.error(f"[{tenant_id}] Conversational streaming error: {e}")
                yield f"data: {json.dumps({'type': 'error', 'content': 'I encountered an error while thinking.'})}\n\n"

        return StreamingResponse(
            generate_conversational_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Content-Type": "text/event-stream",
            },
        )

    # ------------------------------------------------------------------
    # PATH B: Analytical Pipeline (Vectorized Compute Engine)
    # ------------------------------------------------------------------
    logger.info(f"[{tenant_id}] Routing to Analytical Compute Engine.")

    # Only enforce dataset selection if there isn't a pre-configured Agent
    # (Agents have their own hardcoded Memory Boundaries / dataset_ids)
    if not request.active_dataset_ids and not request.active_document_ids and not request.agent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This question requires data analysis. Please select at least one dataset, one document, or activate an Agent."
        )

    try:
        # Pass control completely over to the Orchestrator
        # FIX: The Orchestrator now correctly receives the agent_id, datasets, and conversational history
        pipeline_generator = orchestrator.run_full_pipeline(
            db=db,
            tenant_id=tenant_id,
            prompt=request.prompt,
            agent_id=request.agent_id,                                # Connects to Persona/RAG boundaries
            active_dataset_ids=request.active_dataset_ids,            # Passes user's active Shopify data selection
            active_document_ids=request.active_document_ids,          # Passes active document boundaries for vector RAG
            history=[h.model_dump() for h in request.history[-10:]]   # Passes history for multi-turn SQL queries
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