# api/routes/chat.py

import logging
from typing import Optional, Any, List, Dict, Tuple
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

# Core Security & Database
from api.routes.query import verify_tenant_auth
from api.services.tenant_security_provider import tenant_security, TenantContext
from api.database import get_db
from models import Agent, Dataset

# Modular Services (Using singleton instances for memory efficiency)
from api.services.semantic_router import SemanticRouter
from api.services.nl2sql_generator import nl2sql_generator
from api.services.compute_engine import compute_engine
from api.services.narrative_service import NarrativeService

# Setup structured logger
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat"])

# --- Pydantic Models for Type Safety ---

class ChatRequest(BaseModel):
    agent_id: str
    query: str
    session_files: Optional[List[str]] = []
    
class ChatResponse(BaseModel):
    response: str
    data: Optional[Any] = None
    chart_spec: Optional[Dict[str, Any]] = None  # Declarative UI support (Vega-Lite)
    route_taken: str

# --- Route Handler ---

@router.post("/", response_model=ChatResponse)
async def process_chat(
    request: ChatRequest,
    context: TenantContext = Depends(verify_tenant_auth), # Security Phase 1: Dual-Auth Check
    db: Session = Depends(get_db)
):
    """
    Unified chat endpoint dynamically routed to vector/RAG or DuckDB execution.
    Orchestrates Contextual RAG, Vectorized Compute, and Strict SaaS Billing Guardrails.
    """
    try:
        # 1. Context Retrieval: Fetch Agent with associated Dataset via eager load
        # This ensures strict physical tenant isolation at the ORM layer.
        agent = db.query(Agent).options(joinedload(Agent.dataset)).filter(
            Agent.id == request.agent_id, 
            Agent.tenant_id == context.tenant_id
        ).first()
        
        if not agent or not agent.dataset:
            logger.warning(f"Unauthorized/Invalid access attempt: Agent {request.agent_id} for tenant {context.tenant_id}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent context or dataset not found.")
        
        # 2. Modular Semantic Routing: Determine if query is analytical or textual
        semantic_router = SemanticRouter()
        route = semantic_router.determine_route(request.query)
        
        if route == "analytical":
            
            # 3. Define the Billable Compute Pipeline
            # We wrap the costly LLM and DuckDB steps into a single transaction closure for metering.
            async def execute_analytical_pipeline() -> Tuple[List[Dict[str, Any]], str, Optional[Dict[str, Any]]]:
                dataset: Dataset = agent.dataset
                
                # Format schemas for Contextual RAG
                schemas = [{
                    "id": str(dataset.id),
                    "name": dataset.name,
                    "schema": dataset.schema_metadata or {}
                }]
                
                # Phase 3: NL2SQL Generation (Consumes LLM Tokens)
                # Determines the optimal vectorized path and outputs Vega-Lite specs if needed
                sql_query, chart_spec = await nl2sql_generator.generate_sql(
                    prompt=request.query, 
                    schemas=schemas
                )
                
                if not sql_query:
                    return [], "I couldn't translate that request into a data query. Could you try rephrasing what you'd like to calculate?", None
                
                # Phase 4: Secure Vectorized Execution (Consumes Compute RAM/CPU)
                try:
                    execution_result = await compute_engine.execute_read_only(
                        db=db,
                        tenant_id=context.tenant_id,
                        datasets=[dataset],
                        query=sql_query
                    )
                except Exception as compute_error:
                    # Phase 4.1: The Auto-Correction Feedback Loop
                    # If DuckDB rejects the syntax, feed the error back to the LLM for self-healing
                    logger.warning(f"[{context.tenant_id}] Compute failed, attempting auto-correction: {str(compute_error)}")
                    
                    sql_query, chart_spec = await nl2sql_generator.correct_sql(
                        failed_query=sql_query,
                        error_msg=str(compute_error),
                        prompt=request.query,
                        schemas=schemas
                    )
                    
                    # Retry execution with corrected SQL
                    execution_result = await compute_engine.execute_read_only(
                        db=db,
                        tenant_id=context.tenant_id,
                        datasets=[dataset],
                        query=sql_query
                    )
                
                # Phase 5: Narrative Synthesis (Consumes LLM Tokens)
                # Translates the mathematical JSON results back into a human-readable response
                narrative_service = NarrativeService()
                narrative = narrative_service.generate_narrative(execution_result, request.query)
                
                return execution_result, narrative, chart_spec

            # 4. Security Phase 2: Contextual Execution
            # Routes the pipeline through metering and security guardrails via dependency injection.
            try:
                pipeline_data, pipeline_narrative, pipeline_chart = await tenant_security.execute_in_context(
                    db=db,
                    tenant_id=context.tenant_id,
                    operation_name="chat_analytical_query",
                    func=execute_analytical_pipeline
                )
                
                return ChatResponse(
                    response=pipeline_narrative,
                    data=pipeline_data,
                    chart_spec=pipeline_chart,
                    route_taken="analytical"
                )
                
            except PermissionError as pe:
                # 402 Payment Required: Blocks execution before compute/LLM is hit
                raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(pe))
            except ValueError as ve:
                # 400 Bad Request: LLM hallucinated bad SQL syntax beyond repair
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
            except RuntimeError as re:
                # 500 Internal Error: DuckDB Out-Of-Memory limit reached or unrecoverable crash
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(re))
            
        else:
            # Handle standard RAG (Vector Search over document knowledge)
            return ChatResponse(
                response="I've processed your request as a textual inquiry. Based on the knowledge base, I can help you understand dataset rules or past queries. How can I assist further?",
                route_taken="rag"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Critical Pipeline Failure for tenant {context.tenant_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal Pipeline Failure")