import logging
import hashlib
from enum import Enum
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from api.services.integrations.email_connector import (
    EmailConnector,
    EmailPayload,
    EmailProviderError,
    FailureType,
    ProviderResponse,
)
from api.services.email_tracker import (
    EmailStatus,
    EventId,
    is_user_suppressed,
    record_email_queued,
    record_send_attempted,
    update_email_status,
)

logger = logging.getLogger(__name__)


class DispatchResult(Enum):
    """Specific return types to give the background worker precise instructions."""
    SENT = "sent"
    SUPPRESSED = "suppressed"
    DUPLICATE = "duplicate"
    RETRYABLE_FAILURE = "retryable_failure"
    PERMANENT_FAILURE = "permanent_failure"
    LEDGER_INCONSISTENT = "ledger_inconsistent"


def mask_pii(text: str) -> str:
    """
    Masks sensitive strings like emails for logging.
    Uses the same SHA256 strategy as EmailConnector for cross-service consistency.
    """
    if not text:
        return ""
    if "@" not in text:
        return f"{text[:4]}***" if len(text) > 4 else "***"
    local, domain = text.rsplit("@", 1)
    hashed_local = hashlib.sha256(local.encode()).hexdigest()[:8]
    return f"{hashed_local}...@{domain}"


def _get_existing_event(
    db: Session, tenant_id: str, idempotency_key: str
) -> Optional[tuple[EventId, EmailStatus]]:
    """
    Look up an existing email event by its idempotency key.
    Returns (event_id, status) or None if not found.
    """
    query = text("""
        SELECT id, status
        FROM email_events
        WHERE tenant_id = :tenant_id
          AND idempotency_key = :idempotency_key
        LIMIT 1
    """)
    row = db.execute(
        query,
        {"tenant_id": tenant_id, "idempotency_key": idempotency_key},
    ).first()
    if row:
        return row.id, EmailStatus(row.status)
    return None


def _safe_update_status(
    db: Session,
    event_id: EventId,
    status: EmailStatus,
    provider_id: Optional[str] = None,
    error_category: Optional[str] = None,
) -> bool:
    """
    Safely updates the DB without masking original dispatch exceptions.
    Returns True on success, False on failure so callers can decide
    whether to escalate a data-consistency issue.

    NOTE: If the session is in a failed state (e.g., after a previous DB error),
    this will likely fail immediately. Large systems may prefer to rollback and
    use a fresh session for the status update.
    """
    try:
        update_email_status(
            db=db,
            event_id=event_id,
            status=status,
            provider_id=provider_id,
            error_category=error_category,
        )
        return True
    except SQLAlchemyError as db_err:
        logger.critical(
            "db_update_failed event_id=%s status=%s error=%s",
            event_id,
            status.value,
            str(db_err),
            exc_info=True,
        )
        return False


async def dispatch_recovery_email(
    db: Session,
    tenant_id: str,
    user_id: str,
    target_email: str,
    campaign_id: str,
    idempotency_key: str,
    payload: EmailPayload,
    connector: EmailConnector,
) -> DispatchResult:
    """
    High-level orchestrator for sending a recovery email.
    Enforces Constitution Rules: Safety, Suppression, and Idempotency.

    IMPORTANT: The caller must manage the EmailConnector lifecycle:
        async with EmailConnector(config) as connector:
            result = await dispatch_recovery_email(..., connector=connector)

    RETRY BEHAVIOR: If a worker retries this job after a RETRYABLE_FAILURE,
    the idempotency key will collide. Instead of dead-locking, this function
    looks up the existing event and resumes dispatch for in-flight rows
    (QUEUED / RETRYING) while short-circuiting for terminal states
    (SENT / DELIVERED / FAILED / BOUNCED).
    """
    # NOTE: user_id is hashed without a salt. This is acceptable for log correlation
    # but should not be treated as a cryptographically secure anonymization.
    safe_user_id = hashlib.sha256(user_id.encode()).hexdigest()[:8]

    logger.info(
        "dispatch_initiated tenant_id=%s campaign_id=%s safe_user_id=%s",
        tenant_id,
        campaign_id,
        safe_user_id,
    )

    # ---------------------------------------------------------
    # 1. SAFETY & SUPPRESSION CHECK
    # ---------------------------------------------------------
    # Note on Race Conditions: To fully mitigate a user unsubscribing between
    # this check and the send, the downstream Email Provider must also enforce
    # its own suppression list. This local check handles standard flow.
    try:
        if is_user_suppressed(db, tenant_id, target_email):
            safe_email = mask_pii(target_email)
            logger.warning(
                "dispatch_aborted_suppressed tenant_id=%s safe_user_id=%s email=%s",
                tenant_id,
                safe_user_id,
                safe_email,
            )
            return DispatchResult.SUPPRESSED
    except SQLAlchemyError as e:
        logger.error(
            "suppression_check_failed tenant_id=%s safe_user_id=%s error=%s",
            tenant_id,
            safe_user_id,
            str(e),
            exc_info=True,
        )
        return DispatchResult.RETRYABLE_FAILURE

    # ---------------------------------------------------------
    # 2. IDEMPOTENT QUEUEING
    # ---------------------------------------------------------
    try:
        event_id = record_email_queued(
            db, tenant_id, user_id, campaign_id, idempotency_key
        )
    except SQLAlchemyError as e:
        logger.error(
            "queue_failed tenant_id=%s safe_user_id=%s error=%s",
            tenant_id,
            safe_user_id,
            str(e),
            exc_info=True,
        )
        return DispatchResult.RETRYABLE_FAILURE

    # ---------------------------------------------------------
    # 2b. HANDLE DUPLICATE / RESUME EXISTING EVENT
    # ---------------------------------------------------------
    if event_id is None:
        existing = _get_existing_event(db, tenant_id, idempotency_key)
        if existing is None:
            # Should not happen if record_email_queued returned None due to conflict,
            # but treat conservatively.
            logger.warning(
                "dispatch_duplicate_not_found tenant_id=%s idempotency_key=%s",
                tenant_id,
                idempotency_key,
            )
            return DispatchResult.DUPLICATE

        existing_id, existing_status = existing

        # Terminal success states — nothing more to do.
        if existing_status in (EmailStatus.SENT, EmailStatus.DELIVERED):
            logger.info(
                "dispatch_aborted_already_sent event_id=%s status=%s tenant_id=%s",
                existing_id,
                existing_status.value,
                tenant_id,
            )
            return DispatchResult.DUPLICATE

        # Terminal failure states — do not retry.
        if existing_status in (EmailStatus.FAILED, EmailStatus.BOUNCED):
            logger.info(
                "dispatch_aborted_already_failed event_id=%s status=%s tenant_id=%s",
                existing_id,
                existing_status.value,
                tenant_id,
            )
            return DispatchResult.PERMANENT_FAILURE

        # In-flight states — resume dispatch using the existing event row.
        if existing_status in (EmailStatus.QUEUED, EmailStatus.RETRYING):
            event_id = existing_id
            logger.info(
                "dispatch_resuming event_id=%s status=%s tenant_id=%s",
                event_id,
                existing_status.value,
                tenant_id,
            )
        else:
            # Unknown/unexpected status — defensive dead-letter.
            logger.error(
                "dispatch_unexpected_status event_id=%s status=%s tenant_id=%s",
                existing_id,
                existing_status.value,
                tenant_id,
            )
            return DispatchResult.PERMANENT_FAILURE

    logger.info(
        "email_queued event_id=%s tenant_id=%s campaign_id=%s",
        event_id,
        tenant_id,
        campaign_id,
    )

    # ---------------------------------------------------------
    # 3. EXTERNAL DISPATCH
    # ---------------------------------------------------------
    # Relying on the provider's idempotency key ensures that a worker retry
    # (due to a DB update failure) won't result in a duplicate send.
    try:
        # Increment attempt counter exactly once per provider dispatch attempt.
        record_send_attempted(db, event_id)

        result: ProviderResponse = await connector.send(payload, idempotency_key)

        # ---------------------------------------------------------
        # 4. SUCCESS ATTRIBUTION
        # ---------------------------------------------------------
        db_ok = _safe_update_status(
            db,
            event_id,
            status=EmailStatus.SENT,
            provider_id=result.provider_id,
        )
        if not db_ok:
            # Provider confirmed send but DB cannot record it. This is a critical
            # ledger inconsistency that requires operator attention. The DB row
            # still shows QUEUED (or RETRYING), so a reconciliation worker or
            # dead-letter queue must handle this.
            logger.critical(
                "ledger_inconsistent_after_send event_id=%s provider_id=%s",
                event_id,
                result.provider_id,
            )
            return DispatchResult.LEDGER_INCONSISTENT

        logger.info(
            "email_sent tenant_id=%s campaign_id=%s safe_user_id=%s provider_id=%s",
            tenant_id,
            campaign_id,
            safe_user_id,
            result.provider_id,
        )
        return DispatchResult.SENT

    # ---------------------------------------------------------
    # 5. FAILURE ATTRIBUTION & ERROR HANDLING
    # ---------------------------------------------------------
    except EmailProviderError as e:
        if e.failure_type is FailureType.RETRYABLE:
            logger.warning(
                "email_send_retryable tenant_id=%s safe_user_id=%s status_code=%s",
                tenant_id,
                safe_user_id,
                e.status_code,
            )
            db_ok = _safe_update_status(
                db,
                event_id,
                status=EmailStatus.RETRYING,
                error_category="provider_retryable",
            )
            if not db_ok:
                return DispatchResult.LEDGER_INCONSISTENT
            return DispatchResult.RETRYABLE_FAILURE

        if e.failure_type is FailureType.PERMANENT:
            logger.error(
                "email_send_permanent tenant_id=%s safe_user_id=%s status_code=%s",
                tenant_id,
                safe_user_id,
                e.status_code,
            )
            db_ok = _safe_update_status(
                db,
                event_id,
                status=EmailStatus.FAILED,
                error_category="provider_permanent",
            )
            if not db_ok:
                return DispatchResult.LEDGER_INCONSISTENT
            return DispatchResult.PERMANENT_FAILURE

        # Defensive: unknown failure type should not happen, but treat as retryable
        logger.error(
            "email_send_unknown_failure_type tenant_id=%s safe_user_id=%s failure_type=%s",
            tenant_id,
            safe_user_id,
            e.failure_type,
        )
        db_ok = _safe_update_status(
            db,
            event_id,
            status=EmailStatus.RETRYING,
            error_category="unknown_provider_failure",
        )
        if not db_ok:
            return DispatchResult.LEDGER_INCONSISTENT
        return DispatchResult.RETRYABLE_FAILURE

    except SQLAlchemyError as e:
        logger.error(
            "email_dispatch_db_error tenant_id=%s safe_user_id=%s error=%s",
            tenant_id,
            safe_user_id,
            str(e),
            exc_info=True,
        )
        db_ok = _safe_update_status(
            db,
            event_id,
            status=EmailStatus.RETRYING,
            error_category="internal_db_error",
        )
        if not db_ok:
            return DispatchResult.LEDGER_INCONSISTENT
        return DispatchResult.RETRYABLE_FAILURE

    except Exception:
        # Unknown programming bugs should not retry forever.
        # Returning PERMANENT_FAILURE routes to dead-letter queue for human inspection.
        # Ensure your worker infrastructure supports a DLQ before treating this as permanent.
        logger.exception(
            "email_send_bug tenant_id=%s safe_user_id=%s",
            tenant_id,
            safe_user_id,
        )
        db_ok = _safe_update_status(
            db,
            event_id,
            status=EmailStatus.FAILED,
            error_category="internal_bug",
        )
        if not db_ok:
            return DispatchResult.LEDGER_INCONSISTENT
        return DispatchResult.PERMANENT_FAILURE