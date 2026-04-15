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
from models import Agent, Dataset, QueryHistory  # Added QueryHistory for telemetry
from models import SemanticMetric

# The Intelligence & Execution Layers
from api.services.llm_client import llm_client
from api.services.query_planner import query_planner
from api.services.sql_compiler import sql_compiler
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
        safe_sql = None  # Initialize safely for fallback error logging
        
        try:
            # -------------------------------------------------------------------
            # Step 1: Strict Semantic Routing (The 1-to-1 Constraint)
            # -------------------------------------------------------------------
            yield f"data: {json.dumps({'type': 'status', 'message': 'Loading secure memory boundary...'})}\n\n"
            await asyncio.sleep(0.05) # Micro-pause for UI fluidity
            
            if not agent.dataset_id:
                yield f"data: {json.dumps({'type': 'error', 'message': 'This agent has no configured memory boundary. Please assign a dataset.'})}\n\n"
                return

            dataset = db.query(Dataset).filter(Dataset.id == agent.dataset_id, Dataset.tenant_id == tenant_id).first()
            if not dataset:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Assigned dataset not found or unauthorized.'})}\n\n"
                return

            # EXCLUSIVE INJECTION: We only extract the schema for this specific connector.
            strict_schema_context = {
                str(dataset.id): dataset.schema_metadata or {}
            }

            # -------------------------------------------------------------------
            # Step 2: The Brain (Planning)
            # -------------------------------------------------------------------
            yield f"data: {json.dumps({'type': 'status', 'message': 'Analyzing request & planning execution...'})}\n\n"
            
            plan = await query_planner.plan_execution(
                db=db, 
                tenant_id=tenant_id, 
                agent=agent, 
                natural_query=request.message,
                schema_hints=strict_schema_context # Phase 3: Passing isolated schema
            )
            
            if plan.confidence_score < 0.4:
                yield f"data: {json.dumps({'type': 'error', 'message': 'I do not have enough data in my assigned memory boundary to answer that.'})}\n\n"
                return

            # -------------------------------------------------------------------
            # Step 3: Typed Compiler Pipeline (AST -> Logical -> Physical -> SQL)
            # -------------------------------------------------------------------
            yield f"data: {json.dumps({'type': 'status', 'message': 'Compiling typed execution plan...'})}\n\n"

            target_ids = set(plan.target_dataset_ids or [])
            if not target_ids and agent.dataset_id:
                target_ids.add(str(agent.dataset_id))

            tenant_datasets = db.query(Dataset).filter(Dataset.tenant_id == tenant_id).all()
            compile_datasets = [ds for ds in tenant_datasets if str(ds.id) in target_ids]

            if not compile_datasets:
                yield f"data: {json.dumps({'type': 'error', 'message': 'No authorized datasets available for typed compilation.'})}\n\n"
                return

            all_metrics = db.query(SemanticMetric).filter(SemanticMetric.tenant_id == tenant_id).all()
            compile_metrics = [
                m for m in all_metrics
                if str(m.dataset_id) in {str(ds.id) for ds in compile_datasets}
            ]

            compilation_artifact = sql_compiler.compile_artifact(
                plan=plan,
                datasets=compile_datasets,
                governed_metrics=compile_metrics,
                strict_mode=True,
            )

            safe_sql = compilation_artifact.sql
            safe_chart = None

            # Transmit the underlying code so the UI can render a "Show SQL" button
            yield f"data: {json.dumps({'type': 'sql_generated', 'sql': safe_sql, 'plan_fingerprint': compilation_artifact.plan_fingerprint})}\n\n"

            # -------------------------------------------------------------------
            # Step 4: The Engine (DuckDB Execution)
            # -------------------------------------------------------------------
            yield f"data: {json.dumps({'type': 'status', 'message': 'Executing against warehouse...'})}\n\n"
            
            execution_result = await execution_engine.execute_compiled_query(
                tenant_id=tenant_id,
                sql_query=safe_sql,
                compilation_meta=compilation_artifact.model_dump(),
                chart_spec=safe_chart,
                incremental=True,
            )

            if execution_result.status == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': f'Execution failed: {execution_result.error}'})}\n\n"
                return

            # Push the heavy analytical data payload to the frontend for Vega-Lite rendering
            yield f"data: {json.dumps({'type': 'data_fetched', 'data': execution_result.data, 'chart': execution_result.chart_spec, 'preview_data': execution_result.preview_data, 'execution_dag': execution_result.execution_dag})}\n\n"

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
            data_preview = execution_result.data[:20]
            if len(execution_result.data) > 20:
                data_preview.append({"_note": f"... and {len(execution_result.data) - 20} more rows."})
                
            user_prompt = f"Question: {request.message}\nData Result: {json.dumps(data_preview)}"

            # Stream the actual text tokens chunk by chunk directly from the LLM via SSE
            async for chunk in llm_client.stream_text(system_prompt=system_prompt, prompt=user_prompt, temperature=agent.temperature):
                # We yield each chunk immediately so the UI typing effect works perfectly
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"

            # -------------------------------------------------------------------
            # Step 6: Telemetry & Billing
            # -------------------------------------------------------------------
            total_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
            
            try:
                query_log = QueryHistory(
                    agent_id=agent.id,
                    tenant_id=tenant_id,
                    natural_query=request.message,
                    generated_sql=safe_sql,
                    execution_time_ms=total_time_ms,
                    was_successful=True
                )
                db.add(query_log)
                db.commit()
            except Exception as db_err:
                logger.error(f"[{tenant_id}] Failed to save query telemetry: {db_err}")

            # Finalize the stream
            yield f"data: {json.dumps({'type': 'done', 'execution_time_ms': total_time_ms})}\n\n"

        except Exception as e:
            logger.error(f"🚨 [{tenant_id}] Critical failure in streaming pipeline: {str(e)}", exc_info=True)
            
            # Log the failure for telemetry so we can debug broken queries
            total_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
            try:
                error_log = QueryHistory(
                    agent_id=agent.id,
                    tenant_id=tenant_id,
                    natural_query=request.message,
                    generated_sql=safe_sql,
                    execution_time_ms=total_time_ms,
                    was_successful=False,
                    error_message=str(e)
                )
                db.add(error_log)
                db.commit()
            except Exception as db_err:
                logger.error(f"[{tenant_id}] Failed to save error telemetry: {db_err}")

            yield f"data: {json.dumps({'type': 'error', 'message': 'An unexpected critical error occurred while processing the request.'})}\n\n"

    # Return the SSE Streaming Response with explicit headers to prevent Proxy Buffering
    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disables buffering in Nginx/Cloudflare
        }
    )