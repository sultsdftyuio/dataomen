# api/routes/agents.py

import logging
from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel  # FIX: Explicitly import BaseModel for local schemas

# Core Database & Models
from api.database import get_db
from models import Agent

# Standardized API Contracts (Phase 4: Modular Schema Integration)
# This consumes the standardized schemas we fixed in api/models/agent.py
from api.models.agent import AgentCreate, AgentRuleCreate, AgentResponse

# Core Security & SaaS Identity
from api.auth import verify_tenant, TenantContext

# Core Services
from api.services.agent_service import agent_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["Agents"])

# ------------------------------------------------------------------------------
# Pydantic Schemas: Local API Contracts
# ------------------------------------------------------------------------------

class AgentUpdate(BaseModel):
    """
    Payload for partial updates to an existing agent's configuration.
    Uses Optional fields to support localized PATCH operations.
    """
    name: Optional[str] = None
    role_description: Optional[str] = None
    cron_schedule: Optional[str] = None
    sensitivity_threshold: Optional[float] = None
    is_active: Optional[bool] = None

# ------------------------------------------------------------------------------
# Routes: Agent Management (CRUD)
# ------------------------------------------------------------------------------

@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_agent(
    payload: AgentCreate, 
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Creates a new AI Agent dedicated to interactive RAG-based exploration.
    Security by Design: Automatically binds the agent to the authenticated tenant_id.
    """
    logger.info(f"[{context.tenant_id}] Creating Chat Agent: {payload.name}")
    try:
        return agent_service.create_agent(db, context.tenant_id, payload)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))

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
        return agent_service.create_agent(db, context.tenant_id, payload)
    except Exception as e:
        logger.error(f"[{context.tenant_id}] Monitoring Deployment Failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to deploy autonomous monitor.")

@router.get("/", response_model=List[AgentResponse])
async def list_agents(
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """Retrieves all active agents specifically for the authenticated tenant."""
    return agent_service.list_agents(db, context.tenant_id)

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """Fetches a specific agent with strict tenant isolation."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.tenant_id == context.tenant_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")
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
        raise HTTPException(status_code=404, detail="Agent not found.")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(agent, key, value)
    
    db.commit()
    db.refresh(agent)
    return agent

@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: UUID, 
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """Deletes an agent and halts its autonomous monitoring loops."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.tenant_id == context.tenant_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")
    
    db.delete(agent)
    db.commit()
    return None

# ------------------------------------------------------------------------------
# Autonomous Heartbeat
# ------------------------------------------------------------------------------

@router.post("/heartbeat", status_code=status.HTTP_202_ACCEPTED)
async def trigger_agent_heartbeat(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    The Orchestration Trigger.
    Scans for agents due for execution and dispatches them to background workers.
    """
    logger.info("SYSTEM: Autonomous Heartbeat Triggered.")
    return await agent_service.check_and_dispatch_agents(db, background_tasks)