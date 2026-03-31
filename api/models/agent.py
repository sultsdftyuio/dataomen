# api/models/agent.py

from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional
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
    Phase 1 Updated Payload: Strict 1-to-1 Constraint.
    Enforces that an agent connects to exactly ONE dataset or ONE document source
    to completely eliminate cross-schema LLM hallucinations and scope bleed.
    """
    dataset_id: Optional[UUID] = Field(None, description="UUID of the single allowed structured data connection.")
    document_id: Optional[UUID] = Field(None, description="UUID of the single allowed unstructured data (Vector RAG).")

    @model_validator(mode='after')
    def check_mutually_exclusive_sources(self) -> 'AgentCreate':
        """
        Security by Design: Prevents the API from ever accepting multiple data sources for a single agent.
        """
        if self.dataset_id and self.document_id:
            raise ValueError("Strict 1-to-1 isolation enforced: An agent can only map to ONE data source (dataset or document), not both.")
        return self


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
# INVESTIGATION MEMORY (Phase 1 Addition)
# ==========================================

class InvestigationRecordBase(BaseModel):
    """
    The core synthesis of an autonomous anomaly detection event.
    """
    headline: str = Field(..., description="A punchy, one-sentence TL;DR of the situation.")
    executive_summary: str = Field(..., description="A concise narrative synthesis of the 'What', 'Why', and 'When'.")
    severity_level: str = Field(..., description="Low, Medium, or High based on business impact.")
    recommended_action: str = Field(..., description="A specific, data-backed step for the user to take.")
    metric_column: Optional[str] = Field(None, description="The metric that triggered this investigation.")


class InvestigationRecordCreate(InvestigationRecordBase):
    """Payload used by the background worker to persist a finding."""
    agent_id: UUID = Field(..., description="The Agent that conducted this investigation.")
    dataset_id: Optional[UUID] = Field(None, description="The specific dataset analyzed.")


class InvestigationRecordResponse(InvestigationRecordBase):
    """Response model for the GET /api/agents/{agent_id}/memory timeline."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    agent_id: UUID
    dataset_id: Optional[UUID]
    tenant_id: str = Field(..., description="Multi-tenant owner ID ensures strict isolation.")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    
    # Updated to support 1-to-1 Data Boundaries (Phase 1)
    dataset_id: Optional[UUID] = Field(None, description="The tethered dataset ID.")
    document_id: Optional[UUID] = Field(None, description="The tethered document ID.")
    
    # Autonomous Metadata (Optional depending on agent type)
    cron_schedule: Optional[str] = None
    metric_column: Optional[str] = None
    time_column: Optional[str] = None
    sensitivity_threshold: Optional[float] = None
    last_run_at: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Alias for backward compatibility with existing service logic
AgentInDB = AgentResponse