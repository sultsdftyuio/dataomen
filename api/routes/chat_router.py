"""
ARCLI.TECH - API Orchestration Layer
Component: Legacy Chat Router Compatibility Shim
Strategy: Unified payload contract with master orchestrator delegation
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from api.auth import TenantContext, verify_tenant
from api.database import get_db
from api.routes.chat import orchestrator

logger = logging.getLogger(__name__)

chat_router = APIRouter(prefix="/api/chat", tags=["AI Agent"])


class ChatRequest(BaseModel):
    """Unified request contract aligned with the Next.js Edge gateway."""

    agent_id: Optional[str] = None
    prompt: Optional[str] = Field(default=None, min_length=1, max_length=3000)
    message: Optional[str] = Field(default=None, min_length=1, max_length=3000)
    active_dataset_ids: List[str] = Field(default_factory=list)
    active_document_ids: List[str] = Field(default_factory=list)
    history: List[Dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _require_prompt_or_message(self):
        if not (self.prompt or self.message):
            raise ValueError("Either 'prompt' or legacy 'message' is required.")
        return self


@chat_router.post("/orchestrate")
async def ask_data_agent(
    request: ChatRequest,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(verify_tenant),
):
    """Delegates streaming execution to the master analytical orchestrator."""
    tenant_id = tenant.tenant_id
    prompt = (request.prompt or request.message or "").strip()

    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prompt cannot be empty.",
        )

    if not request.agent_id and not request.active_dataset_ids and not request.active_document_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No memory boundary selected. Provide an agent, dataset, or document context.",
        )

    logger.info(
        "[%s] Legacy chat_router delegated to orchestrator | agent=%s datasets=%s documents=%s",
        tenant_id,
        request.agent_id,
        len(request.active_dataset_ids),
        len(request.active_document_ids),
    )

    pipeline_generator = orchestrator.run_full_pipeline(
        db=db,
        tenant_id=tenant_id,
        prompt=prompt,
        agent_id=request.agent_id,
        active_dataset_ids=request.active_dataset_ids,
        active_document_ids=request.active_document_ids,
        history=request.history[-10:],
    )

    return StreamingResponse(
        pipeline_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream",
        },
    )


@chat_router.post("/query", include_in_schema=False)
async def ask_data_agent_legacy(
    request: ChatRequest,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(verify_tenant),
):
    """Backwards-compatible alias for older clients still calling /query."""
    return await ask_data_agent(request=request, db=db, tenant=tenant)
