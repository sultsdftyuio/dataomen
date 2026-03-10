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

# Core Security & SaaS Identity
from api.auth import verify_tenant, TenantContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["Agents"])

# ------------------------------------------------------------------------------
# Pydantic Schemas: API Contracts
# ------------------------------------------------------------------------------

class AgentCreate(BaseModel):
    name: str = Field(..., example="Financial Analyst Agent")
    dataset_id: str = Field(..., description="The UUID of the dataset this agent will query.")
    role_description: Optional[str] = Field(None, description="Custom prompt instructions for the LLM.")

class AgentResponse(BaseModel):
    id: str
    name: str
    dataset_id: str
    role_description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# ------------------------------------------------------------------------------
# Routes: Agent Management
# ------------------------------------------------------------------------------

@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(
    payload: AgentCreate, 
    tenant: TenantContext = Depends(verify_tenant), # SECURITY: Cryptographically verified tenant
    db: Session = Depends(get_db)
):
    """
    Creates a new AI Agent dedicated to a specific dataset.
    Security by Design: Validates that the requested dataset actually belongs to the requesting tenant.
    """
    logger.info(f"[{tenant.tenant_id}] Attempting to create agent '{payload.name}'")

    try:
        # 1. Strict Tenant Boundary Check: Ensure the user owns the dataset
        dataset = db.query(Dataset).filter(
            Dataset.id == payload.dataset_id,
            Dataset.tenant_id == tenant.tenant_id
        ).first()

        if not dataset:
            logger.warning(f"[{tenant.tenant_id}] Failed to bind agent. Dataset {payload.dataset_id} not found or unauthorized.")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Dataset not found or you do not have permission to access it."
            )
        
        # 2. Persist Agent natively in PostgreSQL
        new_agent = Agent(
            tenant_id=tenant.tenant_id,
            dataset_id=dataset.id,
            name=payload.name,
            role_description=payload.role_description
        )
        
        db.add(new_agent)
        db.commit()
        db.refresh(new_agent)
        
        logger.info(f"[{tenant.tenant_id}] Successfully created agent {new_agent.id}")
        
        return AgentResponse(
            id=str(new_agent.id),
            name=new_agent.name,
            dataset_id=str(new_agent.dataset_id),
            role_description=new_agent.role_description,
            created_at=new_agent.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{tenant.tenant_id}] Database error during agent creation: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="An internal database error occurred while creating the agent."
        )


@router.get("/", response_model=List[AgentResponse])
def list_agents(
    tenant: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Retrieves all AI Agents belonging to the authenticated Organization.
    Security by Design: Filters purely by the injected tenant context.
    """
    try:
        # Vectorized / Optimized retrieval using SQLAlchemy
        agents = db.query(Agent).filter(
            Agent.tenant_id == tenant.tenant_id
        ).order_by(Agent.created_at.desc()).all()
        
        return [
            AgentResponse(
                id=str(agent.id),
                name=agent.name,
                dataset_id=str(agent.dataset_id),
                role_description=agent.role_description,
                created_at=agent.created_at
            ) for agent in agents
        ]
    except Exception as e:
        logger.error(f"[{tenant.tenant_id}] Failed to list agents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Failed to retrieve agents."
        )


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    agent_id: str, 
    tenant: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db)
):
    """
    Deletes an AI agent and cascadingly wipes its Contextual RAG knowledge.
    """
    try:
        # Fetch with strict tenant isolation
        agent = db.query(Agent).filter(
            Agent.id == agent_id,
            Agent.tenant_id == tenant.tenant_id
        ).first()
        
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Agent not found or unauthorized."
            )
            
        db.delete(agent)
        db.commit()
        
        logger.info(f"[{tenant.tenant_id}] Successfully deleted agent {agent_id}")
        return None
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{tenant.tenant_id}] Failed to delete agent {agent_id}: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Failed to delete the agent."
        )