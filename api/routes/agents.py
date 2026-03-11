# api/routes/agents.py

import logging
from uuid import UUID
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

# Core Database & Models
from api.database import get_db
from models import Agent

# Core Security & SaaS Identity
# Standardized against api/auth.py for stateless/network dual-verification
from api.auth import verify_tenant, TenantContext

# Core Services
from api.services.agent_service import agent_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["Agents"])

# ------------------------------------------------------------------------------
# Pydantic Schemas: API Contracts
# ------------------------------------------------------------------------------

class AgentCreate(BaseModel):
    name: str = Field(..., example="Financial Analyst Agent")
    dataset_id: str = Field(..., description="The UUID of the dataset this agent will query.")
    role_description: Optional[str] = Field(None, description="Custom prompt instructions for the LLM.")
    
    # Autonomous Monitoring Parameters
    cron_schedule: Optional[str] = Field(None, description="Standard cron string, e.g., '0 * * * *'")
    metric_column: Optional[str] = Field(None, description="The specific numeric column to monitor")
    time_column: Optional[str] = Field(None, description="The datetime column in the dataset")
    sensitivity_threshold: float = Field(2.0, description="Z-score threshold for anomaly flagging")

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role_description: Optional[str] = None
    cron_schedule: Optional[str] = None
    sensitivity_threshold: Optional[float] = None
    is_active: Optional[bool] = None

class AgentResponse(BaseModel):
    id: UUID
    name: str
    dataset_id: UUID
    role_description: Optional[str] = None
    cron_schedule: Optional[str] = None
    metric_column: Optional[str] = None
    time_column: Optional[str] = None
    sensitivity_threshold: float
    is_active: bool
    created_at: datetime
    last_run_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ------------------------------------------------------------------------------
# Routes: Agent Management (CRUD)
# ------------------------------------------------------------------------------

@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: AgentCreate, 
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Creates a new AI Agent dedicated to a specific dataset.
    Security by Design: Validates dataset ownership before binding.
    """
    logger.info(f"[{context.tenant_id}] Creating agent: {payload.name}")
    try:
        return agent_service.create_agent(db, context.tenant_id, payload)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        logger.error(f"[{context.tenant_id}] Agent creation failed: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Agent creation failed.")

@router.get("/", response_model=List[AgentResponse])
async def list_agents(
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """Retrieves all AI Agents belonging to the authenticated Organization."""
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
    """Updates agent configuration or toggles active status."""
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
    # Note: In production, protect this with a internal secret header for Render Crons
):
    """
    The Orchestration Trigger.
    Scans for agents due for execution and dispatches them to background workers.
    Designed for 100% functional reliability in serverless/container environments.
    """
    logger.info("SYSTEM: Autonomous Heartbeat Triggered.")
    result = await agent_service.check_and_dispatch_agents(db, background_tasks)
    return result