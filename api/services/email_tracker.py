import logging
from typing import Optional, Union
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)


class EmailStatus(str, Enum):
    """Strict lifecycle states for email events."""
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    BOUNCED = "bounced"
    FAILED = "failed"
    RETRYING = "retrying"


# Consistent ID type alias. Tighten this to your actual schema type (UUID, int, etc.)
# instead of Union[str, int] once your migration baseline is stable.
EventId = Union[str, int]


def is_user_suppressed(db: Session, tenant_id: str, email: str) -> bool:
    """
    Checks if an email is on the suppression list (bounced, complained, unsubscribed).
    Arcli Constitution Rule 10: "Respect unsubscribes, hard bounces, abuse complaints."

    NOTE: LOWER(email) can bypass standard B-Tree indexes. Ensure a functional index exists:
        CREATE INDEX suppression_email_lower_idx
        ON suppression_list (tenant_id, LOWER(email));

    RECOMMENDED: Store emails normalized (lower().strip()) on write to avoid
    functional-index overhead and simplify queries to `email = :email`.
    """
    query = text("""
        SELECT 1
        FROM suppression_list
        WHERE tenant_id = :tenant_id
          AND LOWER(email) = LOWER(:email)
        LIMIT 1
    """)

    try:
        result = db.execute(query, {"tenant_id": tenant_id, "email": email}).first()
        return result is not None
    except SQLAlchemyError:
        logger.exception(
            "suppression_check_failed",
            extra={"tenant_id": tenant_id},
        )
        raise


def record_email_queued(
    db: Session,
    tenant_id: str,
    user_id: str,
    campaign_id: str,
    idempotency_key: str,
) -> Optional[EventId]:
    """
    Inserts a pending email event.
    If the idempotency_key already exists for this tenant, it safely returns None.

    IMPORTANT: Requires a UNIQUE constraint (or unique index) on the DB:
        CREATE UNIQUE INDEX email_events_tenant_idempotency_idx
        ON email_events (tenant_id, idempotency_key);
    """
    query = text("""
        INSERT INTO email_events (
            tenant_id,
            user_id,
            campaign_id,
            idempotency_key,
            status,
            queued_at,
            attempt_count
        ) VALUES (
            :tenant_id,
            :user_id,
            :campaign_id,
            :idempotency_key,
            :status,
            :now,
            0
        )
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
        RETURNING id
    """)

    try:
        res = db.execute(
            query,
            {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "campaign_id": campaign_id,
                "idempotency_key": idempotency_key,
                "status": EmailStatus.QUEUED.value,
                "now": datetime.now(timezone.utc),
            },
        )
        db.commit()
        return res.scalar()

    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "record_email_queued_failed",
            extra={
                "tenant_id": tenant_id,
                "campaign_id": campaign_id,
            },
        )
        raise


def record_send_attempted(
    db: Session,
    event_id: EventId,
) -> None:
    """
    Increments the attempt counter exactly once per actual provider dispatch attempt.
    Call this immediately before (or at the start of) the external send operation.
    """
    query = text("""
        UPDATE email_events
        SET attempt_count = attempt_count + 1,
            last_attempt_at = :now,
            updated_at = :now
        WHERE id = :event_id
    """)

    try:
        res = db.execute(
            query,
            {
                "event_id": event_id,
                "now": datetime.now(timezone.utc),
            },
        )
        if res.rowcount == 0:
            logger.warning(
                "record_send_attempted_noop",
                extra={"event_id": event_id},
            )
            raise ValueError(f"Email event with ID {event_id} not found.")
        db.commit()
    except (SQLAlchemyError, ValueError):
        # Ensure rollback on both DB errors and logical "not found" errors so
        # the caller never inherits a dangling transaction.
        db.rollback()
        logger.exception(
            "record_send_attempted_failed",
            extra={"event_id": event_id},
        )
        raise


def update_email_status(
    db: Session,
    event_id: EventId,
    status: EmailStatus,
    provider_id: Optional[str] = None,
    error_category: Optional[str] = None,
) -> None:
    """
    Updates the email lifecycle state (sent, delivered, bounced, failed, retrying).

    MIGRATION NOTE: This query writes to the `error_category` column. If your
    existing schema still uses `error_details`, run:
        ALTER TABLE email_events RENAME COLUMN error_details TO error_category;

    The `error_category` parameter should be a short, sanitized classification
    string (e.g., "provider_retryable", "provider_permanent", "network_timeout").
    Never store raw provider response bodies or user PII in this column.
    """
    safe_error = error_category[:120] if error_category else None

    query = text("""
        UPDATE email_events
        SET status = :status,
            provider_id = COALESCE(:provider_id, provider_id),
            error_category = COALESCE(:error_msg, error_category),
            updated_at = :now
        WHERE id = :event_id
    """)

    try:
        res = db.execute(
            query,
            {
                "status": status.value,
                "provider_id": provider_id,
                "error_msg": safe_error,
                "now": datetime.now(timezone.utc),
                "event_id": event_id,
            },
        )

        if res.rowcount == 0:
            logger.warning(
                "update_email_status_noop",
                extra={"event_id": event_id, "status": status.value},
            )
            raise ValueError(f"Email event with ID {event_id} not found.")

        db.commit()

    except (SQLAlchemyError, ValueError):
        # Ensure rollback on both DB errors and logical "not found" errors so
        # the caller never inherits a dangling transaction.
        db.rollback()
        logger.exception(
            "update_email_status_failed",
            extra={"event_id": event_id, "status": status.value},
        )
        raise