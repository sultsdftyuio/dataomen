import uuid
import enum
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import String, Enum, DateTime, ForeignKey, Text, JSON, Boolean, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# ==========================================
# BASE CONFIGURATION
# ==========================================
class Base(DeclarativeBase):
    """
    SQLAlchemy 2.0 Declarative Base.
    Enforces strict type safety and auto-completion.
    """
    pass

# ==========================================
# ENUMS
# ==========================================
class DatasetStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"

class StorageTier(str, enum.Enum):
    EPHEMERAL = "EPHEMERAL" # Try-it-now: Lives in Vercel /tmp or Memory. Zero cost.
    SUPABASE = "SUPABASE"   # Default: Persistent free tier via Supabase S3 API
    R2_PRO = "R2_PRO"       # Premium: Cloudflare R2 for blazing fast Parquet analytics
    BYOS = "BYOS"           # Enterprise: Bring Your Own Storage (AWS/R2)

# ==========================================
# TENANT CONFIGURATION
# ==========================================
class TenantSettings(Base):
    """
    Manages tenant-level storage escalation and routing configurations.
    Strictly tied to a Supabase Auth User/Tenant ID.
    """
    __tablename__ = "tenant_settings"

    tenant_id: Mapped[str] = mapped_column(String, primary_key=True, index=True) 
    
    # Storage Escalation State
    storage_tier: Mapped[StorageTier] = mapped_column(Enum(StorageTier), default=StorageTier.SUPABASE, nullable=False)
    
    # BYOS Credentials (Only used if storage_tier == BYOS)
    # SECURITY NOTE: In production, encrypt these strings with KMS/Fernet before inserting.
    byos_endpoint: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    byos_bucket: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    byos_access_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    byos_secret_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

# ==========================================
# DATASETS
# ==========================================
class Dataset(Base):
    """
    Represents a logical analytical dataset.
    Can point to Ephemeral memory, Supabase Storage, Cloudflare R2, or a public Read-Only HTTP URL.
    """
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False, index=True) # Jailed execution boundary
    
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # --- Physical Storage Pointers ---
    file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True) # E.g., 'uploads/sales.parquet'
    
    # --- Zero-Copy Read-Only Configuration ---
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sample_uri: Mapped[Optional[str]] = mapped_column(String, nullable=True) # E.g. 'https://samples.dataomen.com/data.parquet'
    
    # --- State & AI Context ---
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), default=DatasetStatus.PENDING, nullable=False)
    schema_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True) # Context caching for NL2SQL
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    agents: Mapped[List["Agent"]] = relationship("Agent", back_populates="dataset", cascade="all, delete-orphan")


# ==========================================
# AGENTS & QUERY LOGS
# ==========================================
class Agent(Base):
    """AI Assistant assigned to a specific dataset."""
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    
    name: Mapped[str] = mapped_column(String, nullable=False)
    role_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    dataset: Mapped["Dataset"] = relationship("Dataset", back_populates="agents")
    queries: Mapped[List["QueryHistory"]] = relationship("QueryHistory", back_populates="agent", cascade="all, delete-orphan")


class QueryHistory(Base):
    """Platform telemetry and LLM context window tracking."""
    __tablename__ = "query_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)

    natural_query: Mapped[str] = mapped_column(Text, nullable=False)
    generated_sql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    execution_time_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    was_successful: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    agent: Mapped["Agent"] = relationship("Agent", back_populates="queries")