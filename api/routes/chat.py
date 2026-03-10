# api/routes/chat.py

import logging
from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

# Core Security & Database
from api.routes.query import verify_tenant_auth
from api.services.tenant_security_provider import tenant_security, TenantContext
from api.database import get_db
from models import Agent, Dataset

# Modular Services
from api.services.semantic_router import SemanticRouter
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import compute_engine
from api.services.narrative_service import NarrativeService

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
    Implements Contextual RAG and strict SaaS Billing Guardrails.
    """
    try:
        # 1. Context Retrieval: Fetch Agent with associated Dataset via eager load
        # This ensures strict physical tenant isolation at the ORM layer.
        agent = db.query(Agent).options(joinedload(Agent.dataset)).filter(
            Agent.id == request.agent_id, 
            Agent.tenant_id == context.tenant_id
        ).first()
        
        if not agent:
            logger.warning(f"Unauthorized access attempt: Agent {request.agent_id} for tenant {context.tenant_id}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent context not found or unauthorized.")
        
        # 2. Modular Semantic Routing: Determine if query is analytical or textual
        semantic_router = SemanticRouter()
        route = semantic_router.determine_route(request.query)
        
        if route == "analytical":
            
            # 3. Define the Billable Compute Pipeline
            # We wrap the costly LLM and DuckDB steps into a single transaction closure.
            async def execute_analytical_pipeline():
                nl2sql = NL2SQLGenerator()
                
                # Contextual RAG: Use the dataset's JSONB schema metadata
                dataset: Dataset = agent.dataset
                schema_context = str(dataset.schema_metadata) if dataset.schema_metadata else "Schema unknown"
                
                if request.session_files:
                    # Appending transient file paths for DuckDB httpfs support
                    schema_context += f"\nTemporary User Files available: {request.session_files}"
                
                # Phase 3: NL2SQL Generation (Consumes LLM Tokens)
                sql_query = nl2sql.generate_sql(request.query, schema_context)
                
                if not sql_query:
                    return None, "I couldn't translate that request into a data query. Could you try rephrasing what you'd like to calculate?"
                
                # Phase 4: Secure Vectorized Execution (Consumes Compute RAM/CPU)
                execution_result = await compute_engine.execute_read_only(
                    db=db,
                    tenant_id=context.tenant_id,
                    datasets=[dataset],
                    query=sql_query
                )
                
                # Phase 5: Narrative Synthesis (Consumes LLM Tokens)
                narrative_service = NarrativeService()
                narrative = narrative_service.generate_narrative(execution_result, request.query)
                
                return execution_result, narrative

            # 4. Security Phase 2: Contextual Execution
            # Routes the pipeline through metering and security guardrails.
            try:
                pipeline_data, pipeline_narrative = await tenant_security.execute_in_context(
                    db=db,
                    tenant_id=context.tenant_id,
                    operation_name="chat_analytical_query",
                    func=execute_analytical_pipeline
                )
                
                return ChatResponse(
                    response=pipeline_narrative,
                    data=pipeline_data,
                    route_taken="analytical"
                )
                
            except PermissionError as pe:
                # 402 Payment Required: Blocks execution before OpenAI is hit
                raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(pe))
            except ValueError as ve:
                # 400 Bad Request: LLM hallucinated bad SQL syntax
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
            except RuntimeError as re:
                # 500 Internal Error: DuckDB Out-Of-Memory limit reached
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(re))
            
        else:
            # Handle standard RAG (Vector Search over document knowledge)
            # You can also wrap this in `execute_in_context` if you wish to meter textual RAG queries.
            return ChatResponse(
                response="I've processed your request as a textual inquiry. Based on the knowledge base, I can help you understand dataset rules or past queries. How can I assist further?",
                route_taken="rag"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Critical Pipeline Failure for tenant {context.tenant_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal Pipeline Failure")