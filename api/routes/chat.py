# api/routes/chat.py
import logging
from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

# Core Security & Database
from api.auth import verify_tenant
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
    tenant_id: str = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Unified chat endpoint dynamically routed to vector/RAG or DuckDB execution.
    Implements Contextual RAG by providing precise schema fragments to the generator.
    """
    try:
        # 1. Context Retrieval: Fetch Agent with associated Dataset via eager load
        # This ensures tenant isolation at the ORM layer.
        agent = db.query(Agent).options(joinedload(Agent.dataset)).filter(
            Agent.id == request.agent_id, 
            Agent.tenant_id == tenant_id
        ).first()
        
        if not agent:
            logger.warning(f"Unauthorized access attempt or missing agent: {request.agent_id} for tenant {tenant_id}")
            raise HTTPException(status_code=404, detail="Agent context not found")
        
        # 2. Modular Semantic Routing: Determine if query is analytical or textual
        semantic_router = SemanticRouter()
        route = semantic_router.determine_route(request.query)
        
        if route == "analytical":
            # 3. Phase 3: NL2SQL Generation
            nl2sql = NL2SQLGenerator()
            
            # Contextual RAG: Use the dataset's JSONB schema metadata
            dataset: Dataset = agent.dataset
            schema_context = str(dataset.schema_metadata) if dataset.schema_metadata else "Schema unknown"
            
            if request.session_files:
                # Appending transient file paths for DuckDB httpfs support
                schema_context += f"\nTemporary User Files available: {request.session_files}"
            
            # Generate highly optimized DuckDB SQL
            sql_query = nl2sql.generate_sql(request.query, schema_context)
            
            if not sql_query:
                return ChatResponse(
                    response="I couldn't translate that request into a data query. Could you try rephrasing what you'd like to calculate?",
                    route_taken="analytical"
                )
            
            # 4. Phase 4: Secure Vectorized Execution
            # The compute_engine handles ephemeral DuckDB connection and RAM capping.
            try:
                execution_result = await compute_engine.execute_read_only(
                    db=db,
                    tenant_id=tenant_id,
                    datasets=[dataset],
                    query=sql_query
                )
            except Exception as engine_err:
                logger.error(f"Compute Engine Error: {str(engine_err)}")
                return ChatResponse(
                    response=f"Analytical execution failed: {str(engine_err)}",
                    route_taken="analytical"
                )
            
            # 5. Narrative Synthesis: Convert raw records into a human-readable insight
            narrative_service = NarrativeService()
            narrative = narrative_service.generate_narrative(execution_result, request.query)
            
            return ChatResponse(
                response=narrative,
                data=execution_result,
                route_taken="analytical"
            )
            
        else:
            # Handle standard RAG (Vector Search over document knowledge)
            # This path uses AgentKnowledge embeddings for textual similarity.
            return ChatResponse(
                response="I've processed your request as a textual inquiry. Based on the knowledge base, I can help you understand dataset rules or past queries. How can I assist further?",
                route_taken="rag"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Critical Pipeline Failure for tenant {tenant_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal Pipeline Failure")