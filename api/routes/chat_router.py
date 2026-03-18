"""
ARCLI.TECH - API Orchestration Layer
Component: Agent Chat Router
Strategy: Synchronous Pipeline Orchestration & Error Boundary
"""

import logging
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Core Infrastructure
from api.database import get_db
from api.auth import verify_tenant, TenantContext
from models import Agent

# The Intelligence & Execution Layers
from api.services.query_planner import query_planner
from api.services.nl2sql_generator import sql_generator
from api.services.execution_engine import execution_engine

logger = logging.getLogger(__name__)

chat_router = APIRouter(prefix="/api/chat", tags=["AI Agent"])

# ---------------------------------------------------------------------------
# API Contracts
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    agent_id: str
    message: str
    history: Optional[List[Dict[str, str]]] = [] # Chat history for context

class ChatResponse(BaseModel):
    status: str
    response_text: str
    execution_time_ms: float
    data: Optional[List[Dict[str, Any]]] = None
    chart_spec: Optional[Dict[str, Any]] = None
    generated_sql: Optional[str] = None # Useful for debugging or "Show Code" UI features

# ---------------------------------------------------------------------------
# The Orchestrator Endpoint
# ---------------------------------------------------------------------------

@chat_router.post("/query", response_model=ChatResponse)
async def ask_data_agent(
    request: ChatRequest,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(verify_tenant)
):
    """
    The Main Event Loop.
    Translates Natural Language -> Execution Plan -> DuckDB SQL -> JSON Results.
    """
    start_time = time.perf_counter()
    tenant_id = tenant.tenant_id

    # 1. Validate Agent Ownership
    agent = db.query(Agent).filter(Agent.id == request.agent_id, Agent.tenant_id == tenant_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")

    logger.info(f"💬 [{tenant_id}] Incoming query to Agent '{agent.name}': {request.message}")

    try:
        # -------------------------------------------------------------------
        # Phase 1: The Brain (Semantic Routing & Planning)
        # -------------------------------------------------------------------
        plan = await query_planner.plan_execution(
            db=db, 
            tenant_id=tenant_id, 
            agent=agent, 
            natural_query=request.message
        )
        
        # Guard: If the planner determines the question is impossible to answer
        if plan.confidence_score < 0.4:
            return ChatResponse(
                status="insufficient_data",
                response_text="I don't have enough data in the connected sources to answer that question accurately.",
                execution_time_ms=round((time.perf_counter() - start_time) * 1000, 2)
            )

        execution_context = await query_planner.get_duckdb_execution_context(db, plan)

        # -------------------------------------------------------------------
        # Phase 2: The Compiler (NL2SQL Generation)
        # -------------------------------------------------------------------
        safe_sql, safe_chart = await sql_generator.generate_sql(
            plan=plan,
            execution_context=execution_context,
            target_engine="duckdb", # Our Zero-ETL Engine
            tenant_id=tenant_id,
            agent=agent,
            history=request.history
        )

        # -------------------------------------------------------------------
        # Phase 3: The Engine (DuckDB Execution)
        # -------------------------------------------------------------------
        execution_result = await execution_engine.execute_query(
            tenant_id=tenant_id,
            sql_query=safe_sql,
            chart_spec=safe_chart
        )

        # Handle Execution Errors (Auto-Correction loop could be triggered here in v2)
        if execution_result["status"] == "error":
            logger.error(f"[{tenant_id}] Execution failed: {execution_result['error']}")
            return ChatResponse(
                status="execution_error",
                response_text=f"I encountered an error trying to pull that data: {execution_result['error']}",
                execution_time_ms=round((time.perf_counter() - start_time) * 1000, 2),
                generated_sql=safe_sql
            )

        # -------------------------------------------------------------------
        # Phase 4: Payload Assembly
        # -------------------------------------------------------------------
        total_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
        
        # Formulate a natural language summary of the action taken
        summary_text = f"Here is the data for your query. Found {execution_result['row_count']} rows in {total_time_ms}ms."

        return ChatResponse(
            status="success",
            response_text=summary_text,
            execution_time_ms=total_time_ms,
            data=execution_result["data"],
            chart_spec=execution_result["chart_spec"],
            generated_sql=safe_sql
        )

    except Exception as e:
        logger.error(f"🚨 [{tenant_id}] Critical failure in chat pipeline: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing your request."
        )