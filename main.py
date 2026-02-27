import uuid
import enum
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Enum as SAEnum, DateTime, ForeignKey, Text, Boolean, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

class Base(DeclarativeBase):
    """Strict Base class for all SQLAlchemy 2.0 models."""
    pass

class DatasetStatus(str, enum.Enum):
    """Enum mapping for the dataset processing pipeline."""
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"

class User(Base):
    """
    Core User (Tenant) model enforcing multi-tenant isolation.
    Every interaction and analytical query is partitioned by the User ID.
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Establish a strict 1-to-many relationship to datasets
    datasets: Mapped[List["Dataset"]] = relationship(
        "Dataset", 
        back_populates="owner", 
        cascade="all, delete-orphan"
    )

class Dataset(Base):
    """
    Dataset module representing a swappable data layer (e.g., Parquet in R2/S3).
    Includes pgvector embedding column for Contextual RAG routing.
    """
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Tenant partition key:
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[DatasetStatus] = mapped_column(SAEnum(DatasetStatus), default=DatasetStatus.PENDING)
    
    # Path to the columnar formatted file (e.g., s3://bucket/tenant_id/dataset_id.parquet)
    storage_path: Mapped[Optional[str]] = mapped_column(String(512))
    
    # Schema metadata fragment to pass to the LLM (preventing token bloat)
    schema_metadata: Mapped[Optional[dict]] = mapped_column(JSON)

    # Contextual RAG vector index for semantic routing (dim 1536 for OpenAI embeddings)
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(1536))
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # Link back to the tenant
    owner: Mapped["User"] = relationship("User", back_populates="datasets")