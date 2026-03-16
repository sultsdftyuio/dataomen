import os
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

# Services
from api.services.query_planner import QueryPlanner
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine, DatasetMetadata, ComputeLocation
from api.services.insight_orchestrator import InsightOrchestrator
from api.services.narrative_service import NarrativeService
from api.services.orchestrator import AnalyticalOrchestrator
from api.services.diagnostic_service import DiagnosticService
from api.services.subscription_manager import subscription_manager

# ------------------------------------------------------------------
# Logger
# ------------------------------------------------------------------

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat"])

# ------------------------------------------------------------------
# Service Initialization (Singleton Pattern)
# ------------------------------------------------------------------

api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    logger.warning("OPENAI_API_KEY is missing. Analytical Orchestrator will fail.")

# Base services
planner = QueryPlanner(api_key=api_key)
generator = NL2SQLGenerator(api_key=api_key)
compute = ComputeEngine()
insight = InsightOrchestrator()
narrative = NarrativeService(api_key=api_key)

# Diagnostic layer
diagnostic_service = DiagnosticService(
    generator=generator,
    compute=compute
)

# Grand orchestrator
orchestrator = AnalyticalOrchestrator(
    planner=planner,
    generator=generator,
    compute_engine=compute,
    insight_engine=insight,
    diagnostic_service=diagnostic_service,
    narrative_service=narrative
)

# ------------------------------------------------------------------
# Request Contracts
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
# Main Streaming Endpoint
# ------------------------------------------------------------------

@router.post("/orchestrate")
async def orchestrate_chat(
    request: OrchestrateRequest,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Phase 8: Unified Analytical Streaming Pipeline

    Executes the full analytics pipeline:

    Natural Language
        ↓
    Query Planning
        ↓
    NL → SQL
        ↓
    Compute Engine
        ↓
    Insight Extraction
        ↓
    Narrative Generation

    Streams responses via SSE.
    """

    tenant_id = context.tenant_id

    logger.info(
        f"[{tenant_id}] Starting orchestration for prompt: {request.prompt[:80]}"
    )

    # ------------------------------------------------------------------
    # Validate datasets
    # ------------------------------------------------------------------

    if not request.active_dataset_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active datasets provided for analysis."
        )

    datasets = db.query(Dataset).filter(
        Dataset.id.in_(request.active_dataset_ids),
        Dataset.tenant_id == tenant_id
    ).all()

    if not datasets:
        logger.warning(
            f"[{tenant_id}] Unauthorized dataset access attempt."
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested datasets not found or unauthorized."
        )

    # ------------------------------------------------------------------
    # Subscription & Credit Verification
    # ------------------------------------------------------------------

    try:
        has_access = subscription_manager.verify_access_and_reserve_credits(
            db=db,
            tenant_id=tenant_id
        )

        if not has_access:
            logger.warning(
                f"[{tenant_id}] Compute credits exhausted."
            )

            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Compute credits exhausted or subscription inactive. Please upgrade your plan."
            )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(
            f"[{tenant_id}] Subscription verification failed: {str(e)}"
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Subscription verification failed."
        )

    # ------------------------------------------------------------------
    # Build semantic schema context
    # ------------------------------------------------------------------

    full_schema: Dict[str, Dict[str, str]] = {}
    file_uris: List[str] = []

    for ds in datasets:

        if ds.schema_metadata:

            table_name = f"dataset_{str(ds.id).replace('-', '_')}"

            full_schema[table_name] = ds.schema_metadata

        if ds.file_url:
            file_uris.append(ds.file_url)

    # ------------------------------------------------------------------
    # Build compute metadata
    # ------------------------------------------------------------------

    target_dataset_meta = DatasetMetadata(
        dataset_id=str(datasets[0].id),
        tenant_id=tenant_id,
        location=ComputeLocation.LOCAL_DATA_LAKE,
        size_bytes=sum(ds.file_size_bytes or 0 for ds in datasets),
        file_uris=file_uris
    )

    # ------------------------------------------------------------------
    # Start Streaming Orchestration
    # ------------------------------------------------------------------

    try:

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
                "X-Accel-Buffering": "no"
            }
        )

    except Exception as e:

        logger.error(
            f"[{tenant_id}] Fatal orchestration error: {str(e)}"
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize analytical stream."
        )


# ------------------------------------------------------------------
# Legacy Sync Endpoint
# ------------------------------------------------------------------

@router.post("/sync", response_model=Dict[str, Any])
async def process_chat_sync(
    request: OrchestrateRequest,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Deprecated synchronous endpoint.
    """

    raise HTTPException(
        status_code=status.HTTP_426_UPGRADE_REQUIRED,
        detail="Upgrade Required. Use /api/chat/orchestrate for streaming analytics."
    )