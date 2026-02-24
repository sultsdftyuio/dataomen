import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import ForeignKey, String, Enum, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    """Base class for all SQLAlchemy 2.0 models."""
    pass

class DatasetStatus(str, enum.Enum):
    """Enum tracking the lifecycle of an uploaded dataset."""
    PENDING = "pending"           # Uploaded, waiting for Pandas processing
    PROCESSING = "processing"     # Currently being converted to Parquet
    READY = "ready"               # Uploaded to S3/R2 and verified by DuckDB
    FAILED = "failed"             # Error during cleaning/conversion

class User(Base):
    """
    Represents a tenant/user in the system. 
    Strict isolation begins here.
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    # Relationship to datasets
    datasets: Mapped[list["Dataset"]] = relationship("Dataset", back_populates="owner", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}')>"

class Dataset(Base):
    """
    Tracks the metadata and cloud storage location of a processed Parquet file.
    Does NOT store the actual analytical data.
    """
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    
    name: Mapped[str] = mapped_column(String(255), nullable=False) # e.g., "Q3 Marketing Spend"
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False) # e.g., "q3_spend_raw_v2.csv"
    
    # The crucial link to our Phase 1 Storage Engine (S3/Cloudflare R2)
    storage_uri: Mapped[str | None] = mapped_column(String(1024), nullable=True) 
    
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), default=DatasetStatus.PENDING, nullable=False)
    row_count: Mapped[int | None] = mapped_column(nullable=True) # Populated by DuckDB validation
    
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationship back to User
    owner: Mapped["User"] = relationship("User", back_populates="datasets")

    def __repr__(self) -> str:
        return f"<Dataset(id={self.id}, name='{self.name}', status='{self.status.value}')>"