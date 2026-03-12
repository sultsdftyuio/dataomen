# api/models/agent.py

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
from uuid import UUID, uuid4

# ==========================================
# BASE CONFIGURATION
# ==========================================

class AgentBase(BaseModel):
    """
    Base attributes for all Data Omen Agents.
    Encapsulates core identity and multi-tenant status.
    """
    name: str = Field(..., min_length=1, max_length=100, description="The display name of the agent.")
    role_description: Optional[str] = Field(None, description="Detailed instruction set or role-play context for the LLM.")
    is_active: bool = Field(True, description="Indicates if the agent is currently enabled for processing or chat.")

# ==========================================
# TYPE A: INTERACTIVE CHAT AGENTS
# ==========================================

class AgentCreate(AgentBase):
    """
    Payload for creating an Interactive Exploration Agent.
    Designed for RAG-based chat across one or more datasets.
    """
    dataset_id: UUID = Field(..., description="The primary dataset ID this agent is tethered to.")
    system_prompt: Optional[str] = Field(None, description="Overrides the default system instructions for specialized reasoning.")

# ==========================================
# TYPE B: AUTONOMOUS MONITORING AGENTS
# ==========================================

class AgentRuleCreate(BaseModel):
    """
    Payload for creating an Autonomous Monitoring Agent (The Watchdog).
    Prioritizes vectorized metric tracking and linear algebra-based anomaly detection.
    """
    name: str = Field(..., min_length=1, description="The name of the monitoring rule.")
    dataset_id: UUID = Field(..., description="The target dataset for continuous evaluation.")
    metric_column: str = Field(..., description="The specific column name containing the numerical metric.")
    time_column: str = Field(..., description="The column used for temporal trend analysis (Linear Regression/EMA).")
    cron_schedule: str = Field("0 * * * *", description="Standard cron expression for execution frequency (Default: Hourly).")
    sensitivity_threshold: float = Field(2.0, ge=0.1, le=10.0, description="Z-score threshold for anomaly sensitivity.")
    role_description: Optional[str] = Field("Autonomous metric monitor", description="Context for the notification engine.")

# ==========================================
# DB SERIALIZATION & RESPONSE
# ==========================================

class AgentResponse(AgentBase):
    """
    The Unified Analytical Response Model.
    Includes all metadata required by the frontend Dashboard and Sync views.
    Enforces Security by Design by exposing server-side timestamps.
    """
    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(default_factory=uuid4)
    tenant_id: str = Field(..., description="Multi-tenant owner ID (Supabase Auth UID).")
    dataset_id: UUID = Field(..., description="The tethered dataset ID.")
    
    # Autonomous Metadata (Optional depending on agent type)
    cron_schedule: Optional[str] = None
    metric_column: Optional[str] = None
    time_column: Optional[str] = None
    sensitivity_threshold: Optional[float] = None
    last_run_at: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Alias for backward compatibility with existing service logic
AgentInDB = AgentResponse