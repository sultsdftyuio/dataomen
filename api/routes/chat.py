# api/routes/chat.py

import logging
from typing import Optional, Any, List, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Core Security & Database
from api.auth import verify_tenant, TenantContext
from api.database import get_db
from models import Dataset

# Refactored Services (Now using parameterless constructors & llm_client singleton)
from api.services.query_planner import QueryPlanner
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import compute_engine, DatasetMetadata, ComputeLocation
from api.services.insight_orchestrator import InsightOrchestrator
from api.services.narrative_service import narrative_service
from api.services.orchestrator import AnalyticalOrchestrator
from api.services.diagnostic_service import DiagnosticService
from api.services.subscription_manager import subscription_manager
from api.services.semantic_router import semantic_router # The Master Intelligence Hub

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat"])

# ------------------------------------------------------------------
# Service Layer Initialization (Clean Singleton Pattern)
# ------------------------------------------------------------------

# Instantiate services without passing API keys (Logic handled by llm_client internally)
planner = QueryPlanner()
generator = NL2SQLGenerator()
insight_engine = InsightOrchestrator()

# Narrative and Compute are already exported as singletons or use standard init
# Note: DiagnosticService still requires its analytical engine dependencies
diagnostic_service = DiagnosticService(
    generator=generator,
    compute=compute_engine
)

# The orchestrator wires the modular services into a streaming pipeline
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
    prompt: str = Field(..., description="User's natural language analytics query.")
    active_dataset_ids: List[str] = Field(..., description="Dataset UUIDs to include.")
    history: Optional[List[HistoryMessage]] = Field(default_factory=list)
    predictive_config: Optional[Dict[str, str]] = Field(
        default=None,
        description="Optional ML pipeline configuration."
    )

# ------------------------------------------------------------------
# Main Copilot Endpoint (Streaming)
# ------------------------------------------------------------------

@router.post("/orchestrate")
async def orchestrate_chat(
    request: OrchestrateRequest,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Phase 10: The AI Data Copilot Streaming Pipeline.

    Instead of simple query execution, this endpoint leverages the Orchestrator
    to stream the thought process, SQL generation, data extraction, 
    and mathematical insights back to the UI via Server-Sent Events (SSE).

    Engineering Excellence:
    - Zero Math Policy: Insights are pre-calculated via vectorized engines.
    - Tenant Isolation: Strict Supabase/SQLAlchemy filtering.
    - Token Efficiency: Context history is pruned to avoid context-window bloat.
    """
    tenant_id = context.tenant_id
    logger.info(f"[{tenant_id}] Copilot session initiated for: '{request.prompt[:80]}...'")

    # 1. AUTH & DATASET VALIDATION
    if not request.active_dataset_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Analysis requires at least one active dataset."
        )

    # Securely retrieve only authorized datasets
    datasets = db.query(Dataset).filter(
        Dataset.id.in_(request.active_dataset_ids),
        Dataset.tenant_id == tenant_id
    ).all()

    if not datasets:
        logger.warning(f"[{tenant_id}] Forbidden dataset access attempted.")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more datasets not found or access denied."
        )

    # 2. QUOTA & SUBSCRIPTION ENFORCEMENT
    try:
        has_access = subscription_manager.verify_access_and_reserve_credits(
            db=db,
            tenant_id=tenant_id
        )
        if not has_access:
            logger.warning(f"[{tenant_id}] Insufficient compute credits.")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Monthly query limit reached. Please upgrade for more insights."
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{tenant_id}] Subscription check failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Resource management error.")

    # 3. SCHEMA CONTEXT PREPARATION (Hybrid Performance)
    # We build the logical schema names for the QueryPlanner (NL -> Logic)
    full_schema: Dict[str, Dict[str, str]] = {}
    file_uris: List[str] = []

    for ds in datasets:
        if ds.schema_metadata:
            # Standardize table names for the LLM to 'dataset_[uuid]'
            table_name = f"dataset_{str(ds.id).replace('-', '_')}"
            full_schema[table_name] = ds.schema_metadata
        if ds.file_url:
            file_uris.append(ds.file_url)

    # 4. COMPUTE METADATA RESOLUTION
    # We resolve the physical execution layer (Local Data Lake vs Pushdown)
    target_dataset_meta = DatasetMetadata(
        dataset_id=str(datasets[0].id),
        tenant_id=tenant_id,
        location=ComputeLocation.LOCAL_DATA_LAKE, # Defaulting to DuckDB/R2 Parquet
        size_bytes=sum(ds.file_size_bytes or 0 for ds in datasets),
        file_uris=file_uris
    )

    # 5. EXECUTE ANALYTICAL STREAM
    try:
        # The pipeline generator yields SSE-formatted JSON strings
        # compatible with DashboardOrchestrator.tsx
        pipeline_generator = orchestrator.run_full_pipeline(
            prompt=request.prompt,
            dataset=target_dataset_meta,
            tenant_id=tenant_id,
            full_schema=full_schema
        )

        return StreamingResponse(
            pipeline_generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no", # Critical for Vercel/Cloudflare SSE
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
# Diagnostic & Debugging Endpoints
# ------------------------------------------------------------------

@router.post("/sync", include_in_schema=False)
async def process_chat_sync():
    """
    Deprecated: Synchronous chat processing is too slow for complex data tasks.
    Streaming via /orchestrate is the required path for SaaS UX.
    """
    raise HTTPException(
        status_code=status.HTTP_426_UPGRADE_REQUIRED,
        detail="Upgrade Required. Use /api/chat/orchestrate."
    )