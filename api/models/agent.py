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
    description: Optional[str] = Field(None, description="A short summary of its capabilities.")
    role_description: Optional[str] = Field(None, description="Detailed instruction set or role-play context for the LLM.")
    is_active: bool = Field(True, description="Indicates if the agent is currently enabled for processing or chat.")
    temperature: float = Field(0.0, ge=0.0, le=1.0, description="0.0 for strict math/SQL, higher for creative writing.")

# ==========================================
# TYPE A: SPECIALIZED COPILOT (Interactive)
# ==========================================

class AgentCreate(AgentBase):
    """
    Updated payload mapping to the Phase 8 frontend.
    Supports multiple structured and unstructured memory boundaries.
    """
    dataset_ids: List[str] = Field(default_factory=list, description="UUIDs of allowed structured data connections.")
    document_ids: List[str] = Field(default_factory=list, description="UUIDs of allowed unstructured data (Vector RAG).")

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
    
    # Updated to support Multiple Data Boundaries (Phase 8)
    dataset_ids: List[str] = Field(default_factory=list, description="List of tethered dataset IDs.")
    document_ids: List[str] = Field(default_factory=list, description="List of tethered document IDs.")
    
    # Autonomous Metadata (Optional depending on agent type)
    cron_schedule: Optional[str] = None
    metric_column: Optional[str] = None
    time_column: Optional[str] = None
    sensitivity_threshold: Optional[float] = None
    last_run_at: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Alias for backward compatibility with existing service logic
AgentInDB = AgentResponse