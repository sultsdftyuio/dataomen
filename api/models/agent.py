# api/models/agent.py
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import UUID

class NotificationChannel(BaseModel):
    provider: str = Field(..., description="e.g., 'slack', 'teams', 'email'")
    target: str = Field(..., description="Channel ID, Webhook URL, or Email Address")
    enabled: bool = True

class AgentRuleBase(BaseModel):
    dataset_id: str = Field(..., description="ID of the dataset (Parquet file reference)")
    metric_column: str = Field(..., description="The numerical column to monitor")
    time_column: str = Field(..., description="The time dimension column")
    cron_schedule: str = Field(..., description="Cron expression for execution frequency")
    sensitivity_threshold: float = Field(default=2.0, description="Z-score threshold for anomaly detection")
    notification_channels: List[NotificationChannel] = Field(default_factory=list)

class AgentRuleCreate(AgentRuleBase):
    pass

class AgentRuleInDB(AgentRuleBase):
    id: UUID
    tenant_id: str
    created_at: datetime
    last_run_at: Optional[datetime] = None
    is_active: bool = True

    class Config:
        from_attributes = True