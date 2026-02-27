import uuid
import enum
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import String, Enum, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
# Note: Ensure you have pgvector installed if you are utilizing the Vector column.
from pgvector.sqlalchemy import Vector 

from pydantic import BaseModel, ConfigDict, Field

# ==========================================
# 1. ORM Models (SQLAlchemy 2.0)
# ==========================================

class Base(DeclarativeBase):
    """Strict Base class for all SQLAlchemy 2.0 models."""
    pass

class DatasetStatus(str, enum.Enum):
    """Enum tracking the ingestion lifecycle of analytical datasets."""
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"

class Dataset(Base):
    """
    Multi-tenant dataset tracking model. 
    Security by Design: tenant_id ensures isolation.
    """
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), default=DatasetStatus.PENDING)
    
    # Store S3/R2 URI here if using remote blob storage (Modular Strategy)
    storage_uri: Mapped[Optional[str]] = mapped_column(String, nullable=True) 
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

# Add other ORM models here (e.g., Queries, ChatHistory, etc.) as needed...


# ==========================================
# 2. Pydantic Schemas (Validation & I/O)
# ==========================================

class DatasetResponse(BaseModel):
    """
    Pydantic schema used to serialize Dataset objects back to the frontend.
    """
    # Enables Pydantic to read directly from SQLAlchemy ORM objects natively
    model_config = ConfigDict(from_attributes=True)
    
    # Expose the internal 'id' as 'dataset_id' to match frontend expectations
    dataset_id: str = Field(validation_alias="id", serialization_alias="dataset_id")
    tenant_id: str
    filename: str
    status: DatasetStatus
    created_at: datetime
    
    # Optional fields that might be populated later
    storage_uri: Optional[str] = None