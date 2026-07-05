"""
ARCLI SQLAlchemy Models — Canonical mapping for v3.3-fixed schema.

This module defines all ORM models that map 1:1 to the PostgreSQL schema
in arcli_core_schema_v3.3_fixed.sql.  Key fixes over previous versions:

  * Event.user_id and Event.event_name columns (required by metrics_service).
  * MetricValueDaily and MetricValueSegmented expose metric_name for direct
    querying without joining through MetricConfig.
  * AnomalyAlert uses UUID primary key and TEXT fields matching the SQL.
  * All recovery / outbox tables are modeled for the dispatch pipeline.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    """Declarative base for all ARCLI models."""


# ---------------------------------------------------------------------------
# Helper: UTC now for default timestamps
# ---------------------------------------------------------------------------

def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ===========================================================================
# CORE TENANT & USER TABLES
# ===========================================================================

class Tenant(Base):
    """Top-level workspace / organization."""

    __tablename__ = "tenants"

    tenant_id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plan_tier: Mapped[str] = mapped_column(Text, nullable=False, default="free")
    subscription_status: Mapped[str] = mapped_column(Text, nullable=False, default="free")
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    billing_status: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="free")
    dodo_customer_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dodo_subscription_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, default="PROVISIONING"
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    # Relationships
    users: Mapped[List["TenantUser"]] = relationship(
        "TenantUser", back_populates="tenant", cascade="all, delete-orphan"
    )
    settings: Mapped[Optional["TenantSettings"]] = relationship(
        "TenantSettings", back_populates="tenant", uselist=False,
        cascade="all, delete-orphan"
    )
    billing: Mapped[Optional["TenantBilling"]] = relationship(
        "TenantBilling", back_populates="tenant", uselist=False,
        cascade="all, delete-orphan"
    )


class TenantUser(Base):
    """Many-to-many link between tenants and users (auth.users)."""

    __tablename__ = "tenant_users"

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    role: Mapped[str] = mapped_column(Text, default="owner")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")


class TenantSettings(Base):
    """Per-tenant configuration (reply-to email, etc.)."""

    __tablename__ = "tenant_settings"

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), primary_key=True
    )
    reply_to_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="settings")


class TenantBilling(Base):
    """Stripe billing linkage per tenant."""

    __tablename__ = "tenant_billing"

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), primary_key=True
    )
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(
        Text, unique=True, nullable=True
    )
    subscription_status: Mapped[str] = mapped_column(Text, default="incomplete")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="billing")


# ===========================================================================
# API KEYS & IDEMPOTENCY
# ===========================================================================

class ApiKey(Base):
    """Tenant-scoped API keys with hashed secrets."""

    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    key_id: Mapped[str] = mapped_column(Text, nullable=False)
    key_hash: Mapped[str] = mapped_column(Text, nullable=False, default="")
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    hash_version: Mapped[str] = mapped_column(Text, nullable=False, default="sha256")
    scopes: Mapped[List[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    __table_args__ = (UniqueConstraint("tenant_id", "key_id"),)


class ApiIdempotencyKey(Base):
    """Idempotency key storage for exactly-once API operations."""

    __tablename__ = "api_idempotency_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(Text, nullable=False)
    request_hash: Mapped[str] = mapped_column(Text, nullable=False)
    response_payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: utc_now() + timedelta(days=7),
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (UniqueConstraint("tenant_id", "idempotency_key"),)


# ===========================================================================
# EVENTS & ANALYTICS TABLES
# ===========================================================================

class Event(Base):
    """User-facing event stream for metrics aggregation.

    FIXED v3.3: user_id and event_name columns added so
    metrics_service.aggregate_daily_metrics can query by event_name
    and count distinct user_id.
    """

    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        doc="Required for active_users / visitors distinct count"
    )
    event_name: Mapped[str] = mapped_column(
        Text, nullable=False,
        doc="Required for group_by aggregations (e.g. 'page_view', 'purchase')"
    )
    idempotency_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    value: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    properties: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Alert(Base):
    """Generic alert record per tenant."""

    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class AnomalyAlert(Base):
    """Anomaly-driven alerts with resolution tracking.

    FIXED v3.3: Aligned to SQL schema — UUID primary key, TEXT severity,
    TEXT message, BOOLEAN is_resolved.  Removed old mismatched fields
    (Integer autoincrement id, Float severity, DateTime date, String
    direction, String status).
    """

    __tablename__ = "anomaly_alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False
    )
    metric_name: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class AlertDispatchLog(Base):
    """Tracks when alert notifications were last dispatched."""

    __tablename__ = "alert_dispatch_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    metric_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_alerted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


# ===========================================================================
# CHURN RISK TABLES
# ===========================================================================

class ChurnRiskState(Base):
    """Current churn risk snapshot per user (mutable, updated by scoring)."""

    __tablename__ = "churn_risk_state"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    risk_tier: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risk_score: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class ChurnRiskHistory(Base):
    """Immutable history of churn risk scores per scoring run."""

    __tablename__ = "churn_risk_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    risk_run_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    churn_risk_score: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    risk_tier: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    primary_risk_signal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ChurnScoringRun(Base):
    """Tracks each churn scoring pipeline execution."""

    __tablename__ = "churn_scoring_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    status: Mapped[str] = mapped_column(Text, default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


# ===========================================================================
# METRIC CONFIGS & VALUES
# ===========================================================================

class MetricConfig(Base):
    """Defines a tenant-custom metric (name, thresholds, active status)."""

    __tablename__ = "metric_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    metric_name: Mapped[str] = mapped_column(Text, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class MetricValueDaily(Base):
    """Daily-aggregated metric values.

    FIXED v3.3: metric_name TEXT added so Python MVP code can query
    directly by name without joining through metric_configs.  The
    metric_config_id FK is retained for normalized relationships.
    """

    __tablename__ = "metric_values_daily"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    metric_config_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("metric_configs.id", ondelete="SET NULL"), nullable=True
    )
    metric_name: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        doc="Denormalized for direct queries by metrics_service.py"
    )
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    value: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    __table_args__ = (UniqueConstraint("tenant_id", "metric_name", "date"),)


class MetricValueSegmented(Base):
    """Daily metric values broken down by segment (plan, region, etc.).

    FIXED v3.3: metric_name TEXT added (same rationale as MetricValueDaily).
    """

    __tablename__ = "metric_values_segmented"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    metric_config_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("metric_configs.id", ondelete="SET NULL"), nullable=True
    )
    metric_name: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        doc="Denormalized for direct queries by metrics_service.py"
    )
    segment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    value: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AnomalyDetectorLog(Base):
    """Log output from anomaly detection jobs."""

    __tablename__ = "anomaly_detector_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    detector_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metric_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=True)
    log_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class UserActivityDaily(Base):
    """Pre-aggregated daily activity counts per user."""

    __tablename__ = "user_activity_daily"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    activity_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


# ===========================================================================
# RECOVERY / OUTBOX TABLES
# ===========================================================================

class RecoveryEmail(Base):
    """Outbox table for recovery campaign emails.

    States: pending_dispatch -> dispatch_claimed -> dispatched_to_queue ->
            provider_accepted -> delivered | sent
            On failure -> dispatch_failed -> (retry) pending_dispatch
    """

    __tablename__ = "recovery_emails"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    campaign_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending_dispatch")
    idempotency_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    primary_risk_signal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    churn_risk_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    dispatch_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dispatch_attempt: Mapped[int] = mapped_column(Integer, default=0)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    dispatch_claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    provider_message_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_stage: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    attribution_window_days: Mapped[int] = mapped_column(Integer, default=14)
    claimed_by_operator: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    operator_claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    queued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    # Relationships
    events: Mapped[List["RecoveryEmailEvent"]] = relationship(
        "RecoveryEmailEvent", back_populates="recovery_email"
    )
    dlq_entries: Mapped[List["RecoveryEmailDlq"]] = relationship(
        "RecoveryEmailDlq", back_populates="recovery_email"
    )
    attributions: Mapped[List["RecoveryAttribution"]] = relationship(
        "RecoveryAttribution",
        back_populates="recovery_email",
        foreign_keys="RecoveryAttribution.email_id",
    )


class RecoverySuppression(Base):
    """Emails suppressed from recovery campaigns."""

    __tablename__ = "recovery_suppressions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (UniqueConstraint("tenant_id", "email"),)


class RecoveryQuotaUsage(Base):
    """Sliding-window quota tracking for recovery dispatches."""

    __tablename__ = "recovery_quota_usage"

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), primary_key=True
    )
    window_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True
    )
    used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class RecoveryDispatchDedup(Base):
    """Deduplicates sends at the provider boundary."""

    __tablename__ = "recovery_dispatch_dedup"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    dispatch_token: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    send_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("recovery_emails.id", ondelete="SET NULL"), nullable=True
    )
    state: Mapped[str] = mapped_column(Text, nullable=False, default="processing")
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class RecoveryEmailDlq(Base):
    """Dead-letter queue for failed recovery email attempts."""

    __tablename__ = "recovery_email_dlq"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    email_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("recovery_emails.id", ondelete="SET NULL"), nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    failure_stage: Mapped[str] = mapped_column(Text, nullable=False, default="unknown")
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    # Relationships
    recovery_email: Mapped[Optional["RecoveryEmail"]] = relationship(
        "RecoveryEmail", back_populates="dlq_entries"
    )


class RecoveryEmailEvent(Base):
    """Lifecycle events for recovery emails (send, bounce, open, click)."""

    __tablename__ = "recovery_email_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    email_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("recovery_emails.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    occurred_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    # Relationships
    recovery_email: Mapped[Optional["RecoveryEmail"]] = relationship(
        "RecoveryEmail", back_populates="events"
    )


class RecoveryAttribution(Base):
    """Revenue attributions linked to recovery campaigns."""

    __tablename__ = "recovery_attributions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    email_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("recovery_emails.id", ondelete="SET NULL"), nullable=True
    )
    send_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("recovery_emails.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    campaign_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    event_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    event_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revenue: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    attributed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    # Relationships
    recovery_email: Mapped[Optional["RecoveryEmail"]] = relationship(
        "RecoveryEmail",
        back_populates="attributions",
        foreign_keys=[email_id],
    )


class BillingWebhookEvent(Base):
    """Raw billing webhook payloads (Stripe, etc.)."""

    __tablename__ = "billing_webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.tenant_id"), nullable=False
    )
    provider: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_event_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
