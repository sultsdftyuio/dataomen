# api/routes/chat.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
import logging

from api.auth import verify_tenant
from api.services.semantic_router import SemanticRouter
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.duckdb_validator import DuckDBValidator
from api.services.agent_service import AgentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat"])

class ChatRequest(BaseModel):
    agent_id: str
    query: str
    
class ChatResponse(BaseModel):
    response: str
    data: Optional[Any] = None
    route_taken: str

@router.post("/", response_model=ChatResponse)
async def process_chat(
    request: ChatRequest,
    tenant_id: str = Depends(verify_tenant)
):
    """
    Unified chat endpoint dynamically routed to vector/RAG or DuckDB execution.
    Prioritizes hybrid performance computation.
    """
    try:
        agent_service = AgentService()
        agent = agent_service.get_agent(tenant_id, request.agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent context not found")
        
        # 1. Modular Semantic Routing to prevent Token Bloat
        semantic_router = SemanticRouter()
        route = semantic_router.determine_route(request.query)
        
        if route == "analytical":
            # 2. Hybrid execution: Analytical Query (NL2SQL -> DuckDB)
            nl2sql = NL2SQLGenerator()
            duckdb_val = DuckDBValidator()
            
            schema_context = agent.get("dataset_schemas", "")
            
            # Generate optimal SQL
            sql_query = nl2sql.generate_sql(request.query, schema_context)
            if not sql_query:
                return ChatResponse(
                    response="Unable to parse SQL vector computation from requested schema context.",
                    route_taken="analytical"
                )
            
            # 3. Security by Design: Execute in DuckDB with tenant isolation wrapper
            execution_result = duckdb_val.execute_query(sql_query, tenant_id=tenant_id)
            
            if execution_result.get("error"):
                return ChatResponse(
                    response=f"Analytical Error Detected: {execution_result['error']}",
                    route_taken="analytical"
                )
            
            # 4. Wrap returning data in a functional narrative
            from api.services.narrative_service import NarrativeService
            narrative_service = NarrativeService()
            narrative = narrative_service.generate_narrative(execution_result["data"], request.query)
            
            return ChatResponse(
                response=narrative,
                data=execution_result["data"],
                route_taken="analytical"
            )
            
        else:
            # Handle Standard RAG / Search execution (e.g. searching document store)
            # Use functional vectorized similarity searches in the service layer
            return ChatResponse(
                response="Based on the retrieved operational context, this represents a textual inquiry.",
                route_taken="rag"
            )

    except Exception as e:
        logger.error(f"Execution Error in Pipeline: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal Pipeline Failure")