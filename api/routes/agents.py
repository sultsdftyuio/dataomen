# api/routes/agents.py

import logging
import os
import hmac
from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, model_validator, Field

# Core Database & Models
from api.database import get_db
from models import Agent, InvestigationRecord, Dataset

# Standardized API Contracts (Phase 1: 1-to-1 Constraint & Memory)
from api.models.agent import (
    AgentCreate, 
    AgentRuleCreate, 
    AgentResponse, 
    InvestigationRecordResponse
)

# Core Security & SaaS Identity
from api.auth import verify_tenant, TenantContext

# Core Services
from api.services.agent_service import agent_service, AgentCreatePayload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["Agents"])

CRON_REGEX = r'^((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5,7})$'
INTERNAL_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY", "")
internal_security = HTTPBearer(auto_error=False)


def verify_internal_heartbeat(
    x_internal_service_key: Optional[str] = Header(default=None, alias="x-internal-service-key"),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(internal_security),
) -> None:
    token = x_internal_service_key or (credentials.credentials if credentials else None)
    if not INTERNAL_SERVICE_KEY or not token or not hmac.compare_digest(token, INTERNAL_SERVICE_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized internal caller.")


def _verify_dataset_ownership(db: Session, tenant_id: str, dataset_id: UUID) -> None:
    owned_dataset = db.query(Dataset.id).filter(
        Dataset.id == dataset_id,
        Dataset.tenant_id == tenant_id,
    ).first()
    if not owned_dataset:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dataset not found or unauthorized.")

# ------------------------------------------------------------------------------
# Pydantic Schemas: Local API Contracts
# ------------------------------------------------------------------------------

class AgentUpdate(BaseModel):
    """
    Payload for partial updates to an existing agent's configuration.
    Phase 1 Update: Replaced array payloads with singular IDs.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    role_description: Optional[str] = Field(None, max_length=2000)
    
    # 1-to-1 strict boundaries
    dataset_id: Optional[UUID] = None
    document_id: Optional[UUID] = None
    
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)
    cron_schedule: Optional[str] = Field(None, pattern=CRON_REGEX)
    sensitivity_threshold: Optional[float] = Field(None, ge=0.1, le=10.0)
    is_active: Optional[bool] = None

    @model_validator(mode='after')
    def check_mutually_exclusive_sources(self) -> 'AgentUpdate':
        """Ensure users cannot patch an agent into a multi-schema state."""
        if self.name is not None:
            self.name = self.name.strip()
        if self.description is not None:
            self.description = self.description.strip()
        if self.role_description is not None:
            self.role_description = self.role_description.strip()

        if self.dataset_id and self.document_id:
            raise ValueError("Strict 1-to-1 isolation enforced: An agent can only map to ONE data source.")
        return self

# ------------------------------------------------------------------------------
# Routes: Agent Management (CRUD & Memory)
# ------------------------------------------------------------------------------

@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_agent(
    payload: AgentCreate, 
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Creates a new Specialized AI Copilot for interactive exploration.
    Delegates creation to the Agent Service to ensure strict 1-to-1 ownership validation.
    """
    logger.info(f"[{context.tenant_id}] Deploying Specialized Agent: {payload.name}")
    
    try:
        # Convert the incoming REST payload into the Service Layer payload
        service_payload = AgentCreatePayload(
            name=payload.name,
            description=payload.description or "",
            role_description=payload.role_description or "",
            # Phase 1: Casting the strict singular UUIDs to strings for the service layer
            dataset_id=str(payload.dataset_id) if payload.dataset_id else None,
            document_id=str(payload.document_id) if payload.document_id else None,
            temperature=payload.temperature
        )
        
        # The agent_service handles validating that the user actually owns this dataset/doc
        return await agent_service.create_agent(db, context.tenant_id, service_payload)
        
    except ValueError as ve:
        logger.warning(f"[{context.tenant_id}] Validation Error: {str(ve)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"[{context.tenant_id}] Deployment Error creating agent: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deploy agent.")


@router.get("/{agent_id}/memory", response_model=List[InvestigationRecordResponse])
async def get_agent_memory(
    agent_id: UUID,
    limit: int = 50,
    offset: int = 0,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Phase 1: The Memory Endpoint.
    Constructs the real pipeline for fetching past anomaly investigations from Postgres.
    Replaces the frontend void/simulation.
    """
    # 1. Verify Agent Ownership
    agent = db.query(Agent).filter(
        Agent.id == agent_id, 
        Agent.tenant_id == context.tenant_id
    ).first()
    
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
        
    # 2. Retrieve chronological deep memory timeline
    limit = min(max(limit, 1), 500)
    offset = max(offset, 0)

    records = (
        db.query(InvestigationRecord)
        .filter(
            InvestigationRecord.agent_id == agent_id,
            InvestigationRecord.tenant_id == context.tenant_id,
        )
        .order_by(InvestigationRecord.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    return records


@router.post("/monitor", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_monitoring_agent(
    payload: AgentRuleCreate,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Creates an Autonomous Monitoring Agent (Watchdog).
    Designed for vectorized metric tracking and background anomaly detection.
    """
    logger.info(f"[{context.tenant_id}] Deploying Monitoring Agent: {payload.name}")
    try:
        return agent_service.create_monitoring_agent(
            db=db,
            tenant_id=context.tenant_id,
            name=payload.name,
            dataset_id=str(payload.dataset_id),
            metric_column=payload.metric_column,
            time_column=payload.time_column,
            cron_schedule=payload.cron_schedule,
            sensitivity_threshold=payload.sensitivity_threshold,
            role_description=payload.role_description,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"[{context.tenant_id}] Monitoring Deployment Failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deploy autonomous monitor.")

@router.get("/", response_model=List[AgentResponse])
async def list_agents(
    limit: int = 50,
    offset: int = 0,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """Retrieves all active agents specifically for the authenticated tenant."""
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    agents = (
        db.query(Agent)
        .filter(Agent.tenant_id == context.tenant_id)
        .order_by(Agent.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return agents

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """Fetches a specific agent with strict tenant isolation."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.tenant_id == context.tenant_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return agent

@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    payload: AgentUpdate,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """Updates agent configuration or toggles active status with partial JSON payloads."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.tenant_id == context.tenant_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    
    try:
        update_data = payload.model_dump(exclude_unset=True)

        if "dataset_id" in update_data and update_data["dataset_id"] is not None:
            _verify_dataset_ownership(db, context.tenant_id, update_data["dataset_id"])

        if "document_id" in update_data and update_data["document_id"] is not None:
            has_access = await agent_service.verify_document_ownership(
                context.tenant_id,
                str(update_data["document_id"]),
            )
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Document not found or unauthorized.",
                )

        for key, value in update_data.items():
            setattr(agent, key, value)

            # Preserve strict 1-to-1 boundary integrity on partial PATCH updates.
            if key == "dataset_id" and value is not None:
                agent.document_id = None
            elif key == "document_id" and value is not None:
                agent.dataset_id = None

        # Defensive invariant check in case of pre-existing data corruption.
        if agent.dataset_id and agent.document_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Invalid agent state: both dataset_id and document_id are set.",
            )
        
        db.commit()
        db.refresh(agent)
        return agent
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"[{context.tenant_id}] Error updating agent {agent_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update agent.")

@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: UUID, 
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """Deletes an agent and halts its autonomous monitoring loops."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.tenant_id == context.tenant_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    
    try:
        db.delete(agent)
        db.commit()
        return None
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"[{context.tenant_id}] Error deleting agent {agent_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete agent.")

# ------------------------------------------------------------------------------
# Autonomous Heartbeat
# ------------------------------------------------------------------------------

@router.post("/heartbeat", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(verify_internal_heartbeat)])
async def trigger_agent_heartbeat(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    The Orchestration Trigger.
    Scans for agents due for execution and dispatches them to background workers.
    """
    logger.info("SYSTEM: Autonomous Heartbeat Triggered.")
    
    # Safely executing the checking mechanism if implemented in agent_service
    if hasattr(agent_service, 'check_and_dispatch_agents'):
        return await agent_service.check_and_dispatch_agents(db, background_tasks)
    return {"status": "Heartbeat registered. Queue worker missing or running externally."}