"""
ARCLI.TECH - API Orchestration Layer
Component: Agent Chat Router
Strategy: Asynchronous SSE Streaming & Strict Semantic Routing (Phase 3)
"""

import logging
import time
import json
import asyncio
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Core Infrastructure
from api.database import get_db
from api.auth import verify_tenant, TenantContext
from models import Agent, Dataset

# The Intelligence & Execution Layers
from api.services.llm_client import llm_client
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

# ---------------------------------------------------------------------------
# The Streaming Orchestrator Endpoint
# ---------------------------------------------------------------------------

@chat_router.post("/query")
async def ask_data_agent(
    request: ChatRequest,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(verify_tenant)
):
    """
    Phase 3: The Streaming Event Loop.
    Executes Strict Semantic Routing (1-to-1 schema) and streams events 
    (Status -> SQL -> Data -> Tokenized Text) back to the client via SSE.
    """
    tenant_id = tenant.tenant_id

    # 1. Validate Agent Ownership
    agent = db.query(Agent).filter(Agent.id == request.agent_id, Agent.tenant_id == tenant_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")

    logger.info(f"💬 [{tenant_id}] Incoming stream request to Agent '{agent.name}': {request.message}")

    async def event_generator():
        start_time = time.perf_counter()
        
        try:
            # -------------------------------------------------------------------
            # Step 1: Strict Semantic Routing (The 1-to-1 Constraint)
            # -------------------------------------------------------------------
            yield f"data: {json.dumps({'type': 'status', 'message': 'Loading secure memory boundary...'})}\n\n"
            await asyncio.sleep(0.1) # Micro-pause for UI fluidity
            
            if not agent.dataset_id:
                yield f"data: {json.dumps({'type': 'error', 'message': 'This agent has no configured memory boundary. Please assign a dataset.'})}\n\n"
                return

            dataset = db.query(Dataset).filter(Dataset.id == agent.dataset_id, Dataset.tenant_id == tenant_id).first()
            if not dataset:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Assigned dataset not found or unauthorized.'})}\n\n"
                return

            # EXCLUSIVE INJECTION: We only extract the schema for this specific connector.
            strict_schema_context = dataset.schema_metadata or {}

            # -------------------------------------------------------------------
            # Step 2: The Brain (Planning)
            # -------------------------------------------------------------------
            yield f"data: {json.dumps({'type': 'status', 'message': 'Analyzing request & planning execution...'})}\n\n"
            
            plan = await query_planner.plan_execution(
                db=db, 
                tenant_id=tenant_id, 
                agent=agent, 
                natural_query=request.message,
                schema_context=strict_schema_context # Phase 3: Passing isolated schema
            )
            
            if plan.confidence_score < 0.4:
                yield f"data: {json.dumps({'type': 'error', 'message': 'I do not have enough data in my assigned memory boundary to answer that.'})}\n\n"
                return

            # -------------------------------------------------------------------
            # Step 3: The Compiler (NL2SQL Generation)
            # -------------------------------------------------------------------
            yield f"data: {json.dumps({'type': 'status', 'message': 'Compiling analytical query...'})}\n\n"
            
            execution_context = await query_planner.get_duckdb_execution_context(db, plan)
            
            # ADD THE ", _" RIGHT HERE 👇
            safe_sql, safe_chart, _ = await sql_generator.generate_sql(
                plan=plan,
                execution_context=execution_context,
                target_engine="duckdb",
                tenant_id=tenant_id,
                agent=agent,
                history=request.history,
                schema_context=strict_schema_context 
            )

            # Transmit the underlying code so the UI can render a "Show SQL" button
            yield f"data: {json.dumps({'type': 'sql_generated', 'sql': safe_sql})}\n\n"

            # -------------------------------------------------------------------
            # Step 4: The Engine (DuckDB Execution)
            # -------------------------------------------------------------------
            yield f"data: {json.dumps({'type': 'status', 'message': 'Executing against warehouse...'})}\n\n"
            
            execution_result = await execution_engine.execute_query(
                tenant_id=tenant_id,
                sql_query=safe_sql,
                chart_spec=safe_chart
            )

            if execution_result.get("status") == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': f'Execution failed: {execution_result.get('error')}'})}\n\n"
                return

            # Push the heavy analytical data payload to the frontend for Vega-Lite rendering
            yield f"data: {json.dumps({'type': 'data_fetched', 'data': execution_result['data'], 'chart': execution_result.get('chart_spec')})}\n\n"

            # -------------------------------------------------------------------
            # Step 5: Grounded Intelligence (Real-time Text Streaming)
            # -------------------------------------------------------------------
            yield f"data: {json.dumps({'type': 'status', 'message': 'Synthesizing insights...'})}\n\n"
            
            # Formulate the prompt for the final streaming synthesis
            system_prompt = (
                f"You are {agent.name}. {agent.role_description or 'You are an expert data analyst.'} "
                "Synthesize the provided Data Results into a clear, concise natural language response to answer the user's question. "
                "Do not hallucinate numbers. Rely solely on the provided Data Result."
            )
            
            # We cap the data preview sent to the LLM to prevent token bloat (DuckDB already did the heavy math)
            data_preview = execution_result['data'][:20]
            user_prompt = f"Question: {request.message}\nData Result: {json.dumps(data_preview)}"

            # Stream the actual text tokens chunk by chunk directly from the LLM via SSE
            async for chunk in llm_client.stream_text(system_prompt=system_prompt, prompt=user_prompt, temperature=agent.temperature):
                # We yield each chunk immediately so the UI typing effect works perfectly
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"

            # Finalize the stream
            total_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
            yield f"data: {json.dumps({'type': 'done', 'execution_time_ms': total_time_ms})}\n\n"

        except Exception as e:
            logger.error(f"🚨 [{tenant_id}] Critical failure in streaming pipeline: {str(e)}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': 'An unexpected critical error occurred while processing the request.'})}\n\n"

    # Return the SSE Streaming Response
    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream"
    )