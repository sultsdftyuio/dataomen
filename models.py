import uuid
import enum
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Enum, DateTime, ForeignKey, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

class Base(DeclarativeBase):
    """Strict Base class for all SQLAlchemy 2.0 models."""
    pass

class DatasetStatus(str, enum.Enum):
    """Lifecycle states for dataset ingestion and processing."""
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    
    # Security by Design: Explicit tenant_id for partitioning and isolation
    tenant_id: Mapped[str] = mapped_column(String, index=True, default=lambda: str(uuid.uuid4()), nullable=False)
    
    # Audit fields
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    datasets: Mapped[List["Dataset"]] = relationship(
        "Dataset", 
        back_populates="user", 
        cascade="all, delete-orphan"
    )

class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), default=DatasetStatus.PENDING, nullable=False)
    
    # Metadata for semantic routing/contextual RAG
    description: Mapped[Optional[str]] = mapped_column(Text)
    
    # Mathematical Precision / Vector Search: 1536 dims is standard for OpenAI ada-002
    embedding: Mapped[Optional[Vector]] = mapped_column(Vector(1536))
    
    # Multi-tenant isolation at the row level
    tenant_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    
    # Audit fields
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="datasets")