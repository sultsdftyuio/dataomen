import logging
import os
import time
from enum import StrEnum
from typing import Any, Callable, List, Optional

from pydantic import BaseModel, Field, ValidationError, TypeAdapter

logger = logging.getLogger(__name__)

RECOVERY_EMAIL_TABLE = os.getenv("RECOVERY_EMAIL_TABLE", "recovery_emails")
OUTBOX_CLAIM_RPC = os.getenv("RECOVERY_OUTBOX_CLAIM_RPC", "claim_outbox_batch")

OUTBOX_BACKPRESSURE_BASE_SEC = float(os.getenv("OUTBOX_BACKPRESSURE_BASE_SEC", "0.05"))
OUTBOX_BACKPRESSURE_MAX_SEC = float(os.getenv("OUTBOX_BACKPRESSURE_MAX_SEC", "0.3"))


class RecoveryStatus(StrEnum):
    PENDING_DISPATCH = "pending_dispatch"
    DISPATCH_CLAIMED = "dispatch_claimed"
    DISPATCHED_TO_QUEUE = "dispatched_to_queue"
    PROVIDER_ACCEPTED = "provider_accepted"
    DELIVERED = "delivered"
    DISPATCH_FAILED = "dispatch_failed"
    DEAD_LETTERED = "dead_lettered"


class ClaimOutcome(StrEnum):
    CLAIMED = "claimed"
    COOLDOWN = "cooldown"
    SUPPRESSED = "suppressed"
    DUPLICATE = "duplicate"
    INVALID = "invalid"
    RATE_LIMITED = "rate_limited"
    ERROR = "error"


class FailureStage(StrEnum):
    DISPATCH = "dispatch"
    PROVIDER = "provider"
    COOLDOWN = "cooldown"
    VALIDATION = "validation"


class OutboxClaimRow(BaseModel):
    id: str
    tenant_id: str
    dispatch_token: str
    dispatch_attempt: int = Field(..., ge=1)
    retry_count: Optional[int] = None


_outbox_claim_adapter = TypeAdapter(List[OutboxClaimRow])


def parse_outbox_claim_response(
    data: Any,
    *,
    on_error: Optional[Callable[[], None]] = None,
    logger_obj: Optional[logging.Logger] = None,
    log_label: str = "recovery_outbox_claim_invalid",
) -> List[OutboxClaimRow]:
    rows_data = data
    if isinstance(data, dict):
        rows_data = data.get("rows", [])

    try:
        return _outbox_claim_adapter.validate_python(rows_data)
    except ValidationError:
        (logger_obj or logger).exception(log_label)
        if on_error:
            on_error()
        return []


def claim_outbox_batch(
    db_client: Any,
    limit: int,
    *,
    logger_obj: Optional[logging.Logger] = None,
    on_error: Optional[Callable[[], None]] = None,
    on_invalid: Optional[Callable[[], None]] = None,
    log_label: str = "recovery_outbox_claim_failed",
    invalid_log_label: str = "recovery_outbox_claim_invalid",
) -> List[OutboxClaimRow]:
    try:
        resp = db_client.rpc(OUTBOX_CLAIM_RPC, {"p_limit": limit}).execute()
    except Exception:
        (logger_obj or logger).exception(log_label)
        if on_error:
            on_error()
        return []

    return parse_outbox_claim_response(
        resp.data,
        logger_obj=logger_obj,
        log_label=invalid_log_label,
        on_error=on_invalid,
    )


def dispatch_backoff_seconds(attempt: int) -> int:
    base = 15
    backoff = base * (2 ** max(0, attempt - 1))
    return min(backoff, 900)


def apply_outbox_backpressure(dispatched_count: int, limit: int) -> None:
    if dispatched_count <= 0 or OUTBOX_BACKPRESSURE_BASE_SEC <= 0:
        return
    fullness = min(1.0, dispatched_count / max(1, limit))
    sleep_for = OUTBOX_BACKPRESSURE_BASE_SEC * (1.0 + fullness)
    sleep_for = min(OUTBOX_BACKPRESSURE_MAX_SEC, sleep_for)
    if sleep_for > 0:
        time.sleep(sleep_for)
