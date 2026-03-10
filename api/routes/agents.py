# api/routes/agents.py

import logging
from uuid import UUID
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

# Core Database & Models
from api.database import get_db
from models import Agent, Dataset

# Core Security & SaaS Identity (Standardized Dual-Auth Gateway)
from api.routes.query import verify_tenant_auth
from api.services.tenant_security_provider import TenantContext

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
    
    # NEW: Autonomous Monitoring Fields
    cron_schedule: Optional[str] = Field(None, description="Standard cron string, e.g., '0 * * * *' (hourly)")
    metric_column: Optional[str] = Field(None, description="The specific numeric column to monitor")
    time_column: Optional[str] = Field(None, description="The datetime column in the dataset")
    sensitivity_threshold: float = Field(2.0, description="Z-score threshold for anomaly flagging")

class AgentResponse(BaseModel):
    id: str
    name: str
    dataset_id: str
    role_description: Optional[str] = None
    cron_schedule: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# ------------------------------------------------------------------------------
# Routes: Agent Management
# ------------------------------------------------------------------------------

@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(
    payload: AgentCreate, 
    context: TenantContext = Depends(verify_tenant_auth), # Security Phase 1: Dual-Auth Check
    db: Session = Depends(get_db)
):
    """
    Creates a new AI Agent dedicated to a specific dataset.
    Automatically provisions background monitoring if cron parameters are provided.
    """
    logger.info(f"[{context.tenant_id}] Attempting to create agent '{payload.name}'")

    try:
        # Delegate to the strictly isolated agent_service we built
        new_agent = agent_service.create_agent(
            db=db,
            tenant_id=context.tenant_id,
            rule=payload
        )
        return new_agent
        
    except ValueError as ve:
        logger.warning(f"[{context.tenant_id}] Failed to bind agent: {ve}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except RuntimeError as re:
        logger.error(f"[{context.tenant_id}] Runtime error during agent creation: {re}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(re))


@router.get("/", response_model=List[AgentResponse])
def list_agents(
    context: TenantContext = Depends(verify_tenant_auth),
    db: Session = Depends(get_db)
):
    """
    Retrieves all AI Agents belonging to the authenticated Organization.
    Security by Design: Filters purely by the injected tenant context.
    """
    try:
        # Delegate to agent_service for tenant-isolated retrieval
        agents = agent_service.list_agents(db, context.tenant_id)
        return agents
    except Exception as e:
        logger.error(f"[{context.tenant_id}] Failed to list agents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Failed to retrieve agents."
        )


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    agent_id: str, 
    context: TenantContext = Depends(verify_tenant_auth),
    db: Session = Depends(get_db)
):
    """
    Deletes an AI agent and halts its autonomous background monitoring loops.
    Cascadingly wipes its Contextual RAG knowledge via DB constraints.
    """
    try:
        # Fetch with strict tenant isolation
        agent = db.query(Agent).filter(
            Agent.id == agent_id,
            Agent.tenant_id == context.tenant_id
        ).first()
        
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Agent not found or unauthorized."
            )
            
        db.delete(agent)
        db.commit()
        
        logger.info(f"[{context.tenant_id}] Successfully deleted agent {agent_id}")
        return None
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[{context.tenant_id}] Failed to delete agent {agent_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Failed to delete the agent."
        )