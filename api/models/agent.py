from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from uuid import UUID, uuid4

class AgentBase(BaseModel):
    """
    Base attributes for an Analytical Agent.
    """
    name: str = Field(..., description="The display name of the agent.")
    description: Optional[str] = Field(None, description="Short description of what the agent does.")
    system_prompt: str = Field(..., description="The core instruction set for the LLM.")
    dataset_ids: List[str] = Field(default_factory=list, description="List of dataset IDs this agent can access.")

class AgentCreate(AgentBase):
    """
    Payload validation for creating a new agent. 
    (Inherits all fields from AgentBase).
    """
    pass

class AgentInDB(AgentBase):
    """
    Database serialization model. Includes server-generated fields and strict tenant partitioning.
    """
    id: UUID = Field(default_factory=uuid4)
    tenant_id: str = Field(..., description="The Supabase user ID owning this agent.")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        from_attributes = True