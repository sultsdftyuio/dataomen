from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict
from uuid import UUID

from api.models.agent import AgentCreate, AgentInDB
from api.auth import get_current_user

router = APIRouter(prefix="/agents", tags=["agents"])

# NOTE: Per the Modular Strategy, this is an in-memory orchestration skeleton.
# In a production environment, inject your DB session (e.g., asyncpg pool or SQLAlchemy session)
# as a dependency into these routes to maintain swappability.
_MOCK_DB: Dict[UUID, AgentInDB] = {}

@router.post("/", response_model=AgentInDB, status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: AgentCreate, 
    user: dict = Depends(get_current_user)
) -> AgentInDB:
    # Security by Design: Extract tenant_id strictly from the verified JWT
    tenant_id = user.get("sub")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid authentication credentials: No subject claim"
        )
    
    new_agent = AgentInDB(
        tenant_id=tenant_id,
        **payload.model_dump()
    )
    
    # Store in DB
    _MOCK_DB[new_agent.id] = new_agent
    return new_agent


@router.get("/", response_model=List[AgentInDB])
async def list_agents(user: dict = Depends(get_current_user)) -> List[AgentInDB]:
    tenant_id = user.get("sub")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid authentication credentials"
        )
        
    # Security by Design: Strict tenant isolation during read operations
    user_agents = [agent for agent in _MOCK_DB.values() if agent.tenant_id == tenant_id]
    
    # Sort by created_at descending for a better UI experience
    user_agents.sort(key=lambda x: x.created_at, reverse=True)
    return user_agents


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: UUID, user: dict = Depends(get_current_user)) -> None:
    tenant_id = user.get("sub")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid authentication credentials"
        )
    
    agent = _MOCK_DB.get(agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Agent not found"
        )
        
    # Security by Design: Strict tenant isolation validation before destructive action
    if agent.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Not authorized to delete this agent"
        )
        
    del _MOCK_DB[agent_id]
    return None