"""
Arcli Worker — Durable Outbox Dispatcher

Contains: OutboxDispatcher for polling recovery email outbox,
claiming rows via SKIP LOCKED, and dispatching to Dramatiq.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
from typing import List

from api.recovery_common import (
    ClaimOutcome,
    FailureStage,
    OutboxClaimRow,
    RECOVERY_EMAIL_TABLE,
    RecoveryStatus,
    apply_outbox_backpressure,
    claim_outbox_batch,
    dispatch_backoff_seconds,
)

from api.worker.worker_core import logger, METRICS


# ---------------------------------------------------------------------------
# OUTBOX DISPATCHER
# ---------------------------------------------------------------------------
class OutboxDispatcher:
    """
    Arcli Outbox Poller (The Bridge)

    Responsibilities:
    - Sweep the `recovery_emails` outbox for new intents generated
      by Next.js or the Daily Pipeline.
    - Claim rows via the SQL RPC (SKIP LOCKED + leases) for safe
      multi-worker concurrency.
    - Push the safely claimed rows into Dramatiq for async delivery.
    """

    def __init__(self, db_client) -> None:
        self.db = db_client

    def poll_and_dispatch(self, batch_size: int = 100) -> None:
        """
        Polls the outbox. Should be run frequently
        (e.g., every 10-30 seconds via cron/loop).
        """
        logger.info("outbox_dispatcher_started batch_size=%d", batch_size)
        start_time = time.monotonic()

        rows = _claim_outbox_batch(self.db, batch_size)
        if not rows:
            return

        from api.tasks import send_recovery_email

        dispatched_count = 0

        for row in rows:
            send_id = row.id
            tenant_id = row.tenant_id
            dispatch_token = row.dispatch_token
            dispatch_attempt = row.dispatch_attempt

            try:
                send_recovery_email.send(
                    tenant_id=tenant_id,
                    send_id=send_id,
                    dispatch_token=dispatch_token,
                    dispatch_attempt=dispatch_attempt,
                )

                self.db.table(RECOVERY_EMAIL_TABLE).update(
                    {
                        "status": RecoveryStatus.DISPATCHED_TO_QUEUE.value,
                        "dispatched_at": datetime.now(timezone.utc).isoformat(),
                        "dispatch_token": dispatch_token,
                        "dispatch_attempt": dispatch_attempt,
                        "last_error": None,
                    }
                ).eq("tenant_id", tenant_id).eq("id", send_id).execute()

                dispatched_count += 1

            except Exception as exc:
                logger.error(
                    "outbox_dispatcher_dispatch_failed tenant=%s send_id=%s attempt=%d",
                    tenant_id,
                    send_id,
                    dispatch_attempt,
                )
                _handle_dispatch_failure(
                    self.db, tenant_id, send_id, dispatch_attempt, str(exc)
                )

        duration = round(time.monotonic() - start_time, 2)
        METRICS.increment("recovery.outbox.dispatched", dispatched_count)
        METRICS.timing("recovery.outbox.duration", duration)

        logger.info(
            "outbox_dispatcher_completed dispatched=%d duration=%ss",
            dispatched_count,
            duration,
        )

        apply_outbox_backpressure(dispatched_count, batch_size)


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def _claim_outbox_batch(
    db_client, limit: int
) -> List[OutboxClaimRow]:
    return claim_outbox_batch(
        db_client,
        limit,
        logger_obj=logger,
        log_label="outbox_claim_failed",
        invalid_log_label="outbox_claim_invalid_response",
        on_error=lambda: METRICS.increment("recovery.outbox.claim_failed", 1),
        on_invalid=lambda: METRICS.increment("recovery.outbox.claim_invalid", 1),
    )


def _handle_dispatch_failure(
    db_client,
    tenant_id: str,
    send_id: str,
    attempt: int,
    error_msg: str,
) -> None:
    next_retry = (
        datetime.now(timezone.utc)
        + timedelta(seconds=dispatch_backoff_seconds(attempt))
    ).isoformat()
    try:
        db_client.table(RECOVERY_EMAIL_TABLE).update(
            {
                "status": RecoveryStatus.DISPATCH_FAILED.value,
                "failure_stage": FailureStage.DISPATCH.value,
                "dispatch_attempt": attempt,
                "next_retry_at": next_retry,
                "last_error": str(error_msg)[:500],
            }
        ).eq("tenant_id", tenant_id).eq("id", send_id).execute()
    except Exception:
        logger.exception(
            "outbox_dispatcher_dlq_update_failed tenant=%s send_id=%s",
            tenant_id,
            send_id,
        )
