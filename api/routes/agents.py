import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Header

from api.models.agent import AgentRuleCreate, AgentRuleInDB
from api.services.agent_service import AgentService

# Assuming you have these dependencies established in your codebase
# Adjust import paths if your file structure differs slightly
from api.auth import get_current_user 
from api.database import get_supabase_client 

router = APIRouter(prefix="/agents", tags=["Agents"])

# Environment Variable for Cron Authentication (Fallback for dev)
CRON_SECRET_TOKEN = os.environ.get("CRON_SECRET_TOKEN", "YOUR_SECURE_INTERNAL_CRON_TOKEN")

def get_agent_service(supabase=Depends(get_supabase_client)) -> AgentService:
    """Dependency injection wrapper for the Agent Service"""
    return AgentService(supabase_client=supabase)

@router.post("/", response_model=AgentRuleInDB, status_code=status.HTTP_201_CREATED)
async def create_agent_rule(
    rule: AgentRuleCreate,
    current_user: dict = Depends(get_current_user),
    agent_service: AgentService = Depends(get_agent_service)
):
    """
    Creates a new autonomous proactive data monitoring agent.
    Secured to the authenticated tenant.
    """
    tenant_id = current_user.get("tenant_id") or current_user.get("sub")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Tenant context missing from user token.")

    try:
        created_agent = await agent_service.create_agent(tenant_id=tenant_id, rule=rule)
        return created_agent
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create agent: {str(e)}")

@router.get("/", response_model=List[AgentRuleInDB])
async def list_agent_rules(
    current_user: dict = Depends(get_current_user),
    agent_service: AgentService = Depends(get_agent_service)
):
    """
    Lists all active agents for the current tenant.
    """
    tenant_id = current_user.get("tenant_id") or current_user.get("sub")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Tenant context missing from user token.")

    try:
        agents = await agent_service.list_agents(tenant_id=tenant_id)
        return agents
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list agents: {str(e)}")

@router.post("/tick", status_code=status.HTTP_202_ACCEPTED)
async def trigger_agent_heartbeat(
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
    agent_service: AgentService = Depends(get_agent_service)
):
    """
    Internal Orchestration endpoint called by Supabase pg_cron every minute.
    Evaluates which agents are due and dispatches them to background threads 
    without blocking the web server.
    """
    # 1. Verify the caller is actually our internal Supabase Cron Job
    if not authorization or authorization != f"Bearer {CRON_SECRET_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized Cron Execution")

    # 2. Evaluate and dispatch
    # Using background_tasks allows this request to return a 202 Accepted almost instantly
    result = await agent_service.check_and_dispatch_agents(background_tasks)
    
    return result