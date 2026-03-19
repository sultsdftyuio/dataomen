import uuid
import enum
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import String, Enum, DateTime, ForeignKey, Text, Boolean, Float, Index, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, declared_attr
from pgvector.sqlalchemy import Vector
from sqlalchemy.sql import func

# ==========================================
# BASE CONFIGURATION & SECURITY MIXINS
# ==========================================
class Base(DeclarativeBase):
    """
    SQLAlchemy 2.0 Declarative Base.
    Enforces strict type safety and auto-completion.
    """
    pass

class TenantAwareMixin:
    """
    Security by Design: Multi-Tenant Mixin.
    Forces every analytical model to have a `tenant_id` linked to an Organization.
    Physically prevents cross-tenant data leaks and optimizes queries with automatic indexing.
    """
    @declared_attr
    def tenant_id(cls) -> Mapped[str]:
        return mapped_column(
            String,
            ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True
        )

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

class SubscriptionTier(str, enum.Enum):
    FREE = "FREE"
    PRO = "PRO"
    ENTERPRISE = "ENTERPRISE"

class InsightType(str, enum.Enum):
    """Categorization for the Autonomous Insight Engine"""
    ANOMALY = "ANOMALY"
    TREND = "TREND"
    CORRELATION = "CORRELATION"
    PREDICTION = "PREDICTION"
    DATA_QUALITY = "DATA_QUALITY"

# ==========================================
# SAAS IDENTITY & BILLING
# ==========================================
class Organization(Base):
    """
    Represents a SaaS Tenant (Workspace/Company).
    Acts as the master root for all multi-tenant isolation and usage limits.
    """
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String, primary_key=True) # Typically matches Supabase user_id or a custom UUID
    name: Mapped[str] = mapped_column(String, nullable=False)
    
    # Billing & Features
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True)
    subscription_tier: Mapped[SubscriptionTier] = mapped_column(Enum(SubscriptionTier), default=SubscriptionTier.FREE, server_default="FREE")
    
    # Usage Guardrails (Compute & Storage)
    max_storage_mb: Mapped[int] = mapped_column(default=1024) # 1GB free tier
    current_storage_mb: Mapped[float] = mapped_column(default=0.0)
    monthly_query_limit: Mapped[int] = mapped_column(default=1000)
    current_month_queries: Mapped[int] = mapped_column(default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    settings: Mapped["TenantSettings"] = relationship("TenantSettings", back_populates="organization", uselist=False, cascade="all, delete-orphan")
    users: Mapped[List["User"]] = relationship("User", back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    """
    Supabase Authenticated Users tied to an Organization.
    """
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True) # Supabase Auth UUID
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String, default="member") # admin, member, viewer
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    organization: Mapped["Organization"] = relationship("Organization", back_populates="users")


# ==========================================
# TENANT CONFIGURATION & SECURITY
# ==========================================
class TenantSettings(Base, TenantAwareMixin):
    """
    Manages tenant-level storage escalation and routing configurations.
    """
    __tablename__ = "tenant_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Storage Escalation State
    storage_tier: Mapped[StorageTier] = mapped_column(Enum(StorageTier), default=StorageTier.SUPABASE, nullable=False)
    
    # BYOS Credentials (SECURITY NOTE: Encrypt via Fernet/KMS in production)
    byos_endpoint: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    byos_bucket: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    byos_access_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    byos_secret_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    organization: Mapped["Organization"] = relationship("Organization", back_populates="settings")


class TenantApiKey(Base, TenantAwareMixin):
    """
    Manages hashed API keys for server-to-server operations.
    """
    __tablename__ = "tenant_api_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key_hash: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String, default="Default Key")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class TenantErrorLog(Base, TenantAwareMixin):
    """
    Stores tenant-isolated application failure telemetry.
    """
    __tablename__ = "tenant_error_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    operation: Mapped[str] = mapped_column(String, nullable=False)
    error_message: Mapped[str] = mapped_column(Text, nullable=False)
    
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ==========================================
# DATASETS
# ==========================================
class Dataset(Base, TenantAwareMixin):
    """
    Represents a logical analytical dataset.
    Upgraded to use JSONB for blazing fast schema querying.
    """
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # --- Physical Storage Pointers ---
    file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True) 
    
    # --- Zero-Copy Read-Only Configuration ---
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sample_uri: Mapped[Optional[str]] = mapped_column(String, nullable=True) 
    
    # --- State & AI Context ---
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), default=DatasetStatus.PENDING, nullable=False)
    
    # Upgraded to Postgres JSONB for indexable schema traversal
    schema_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True) 
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    agents: Mapped[List["Agent"]] = relationship("Agent", back_populates="dataset", cascade="all, delete-orphan")
    insights: Mapped[List["Insight"]] = relationship("Insight", back_populates="dataset", cascade="all, delete-orphan")


# ==========================================
# AGENTS & AUTONOMOUS INSIGHTS
# ==========================================
class Agent(Base, TenantAwareMixin):
    """AI Assistant & Autonomous Background Worker assigned to a specific dataset."""
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    
    name: Mapped[str] = mapped_column(String, nullable=False)
    role_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # --- Autonomous Monitoring Fields ---
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    cron_schedule: Mapped[Optional[str]] = mapped_column(String, nullable=True) # e.g., "0 * * * *" (hourly)
    metric_column: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    time_column: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sensitivity_threshold: Mapped[float] = mapped_column(Float, default=2.0)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dataset: Mapped["Dataset"] = relationship("Dataset", back_populates="agents")
    queries: Mapped[List["QueryHistory"]] = relationship("QueryHistory", back_populates="agent", cascade="all, delete-orphan")
    knowledge: Mapped[List["AgentKnowledge"]] = relationship("AgentKnowledge", back_populates="agent", cascade="all, delete-orphan")
    insights: Mapped[List["Insight"]] = relationship("Insight", back_populates="agent")


class Insight(Base, TenantAwareMixin):
    """
    The Storage Layer for the Autonomous Insight Mode.
    Stores discovered anomalies, trends, and correlations for the Dashboard Feed.
    """
    __tablename__ = "insights"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    
    # Optional: The background agent that discovered this insight
    agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)

    type: Mapped[InsightType] = mapped_column(Enum(InsightType), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False) # e.g., "Revenue dropped 18% yesterday"
    description: Mapped[str] = mapped_column(Text, nullable=False) # AI Narrative root cause
    
    metric_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Insight Ranking System: Score to determine if it should trigger an alert/be shown at the top
    impact_score: Mapped[float] = mapped_column(Float, default=0.0, index=True) 
    
    # Stores the mathematical payload (Variance drivers, charts, actual/expected values)
    payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    
    # Notification state
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    dataset: Mapped["Dataset"] = relationship("Dataset", back_populates="insights")
    agent: Mapped[Optional["Agent"]] = relationship("Agent", back_populates="insights")


class AgentKnowledge(Base, TenantAwareMixin):
    """
    Contextual RAG Vector Store.
    Stores semantic embeddings of dataset rules or past successful queries for AI alignment.
    Requires `pgvector` extension in PostgreSQL.
    """
    __tablename__ = "agent_knowledge"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    
    content: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Vector Representation for cosine similarity (OpenAI standard 1536 dims)
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(1536))
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    agent: Mapped["Agent"] = relationship("Agent", back_populates="knowledge")

    # Vector-only HNSW Index (Postgres + pgvector handles the tenant_id scalar pre-filtering automatically)
    __table_args__ = (
        Index(
            'ix_agent_knowledge_embedding', 
            'embedding', 
            postgresql_using='hnsw', 
            postgresql_with={'m': 16, 'ef_construction': 64},
            postgresql_ops={'embedding': 'vector_cosine_ops'}
        ),
    )


class QueryHistory(Base, TenantAwareMixin):
    """Platform telemetry and LLM context window tracking."""
    __tablename__ = "query_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)

    natural_query: Mapped[str] = mapped_column(Text, nullable=False)
    generated_sql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Billing Metric: Used to calculate aggregate compute costs per tenant
    execution_time_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    was_successful: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    agent: Mapped["Agent"] = relationship("Agent", back_populates="queries")