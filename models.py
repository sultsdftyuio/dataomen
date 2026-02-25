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
    """Enforces strict state management for datasets."""
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"

class Dataset(Base):
    """
    Phase 1: Metadata tracker for user uploads. 
    The actual data lives in Parquet format in R2/S3.
    """
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    
    # Enforces tenant isolation (Security First)
    tenant_id: Mapped[str] = mapped_column(String(255), index=True)
    
    original_filename: Mapped[str] = mapped_column(String(255))
    s3_key: Mapped[str] = mapped_column(String(512), unique=True)
    
    status: Mapped[DatasetStatus] = mapped_column(
        Enum(DatasetStatus), 
        default=DatasetStatus.PROCESSING
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc)
    )

    # 1-to-Many relationship mapping to the Vector table
    columns: Mapped[List["ColumnMetadata"]] = relationship(
        "ColumnMetadata", 
        back_populates="dataset",
        cascade="all, delete-orphan" # Wipe vectors if the dataset is deleted
    )

class ColumnMetadata(Base):
    """
    Phase 2: Stores the schema details for a specific dataset along with a 
    vector embedding of the column's meaning. This is used for lightning-fast 
    NL2SQL RAG routing.
    """
    __tablename__ = "column_metadata"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    
    # Strictly bind to the parent dataset.
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), 
        index=True
    )
    
    column_name: Mapped[str] = mapped_column(String(255))
    data_type: Mapped[str] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # The Vector column. 
    # 1536 is the exact dimension size for OpenAI's `text-embedding-3-small`.
    embedding: Mapped[list[float]] = mapped_column(Vector(1536))

    # Reverse relationship to the Dataset model
    dataset: Mapped["Dataset"] = relationship(
        "Dataset", 
        back_populates="columns"
    )