import logging
import os
import time
import unicodedata
from datetime import datetime, timezone, timedelta
from enum import StrEnum
from typing import Dict, Any, Optional, List

from pydantic import BaseModel, EmailStr, Field, ValidationError, TypeAdapter

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

logger = logging.getLogger(__name__)


class MetricsSink:
    def increment(self, name: str, value: int = 1, tags: Optional[Dict[str, str]] = None) -> None:
        logger.info("metric_increment name=%s value=%s tags=%s", name, value, tags)

    def timing(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        logger.info("metric_timing name=%s value=%s tags=%s", name, round(value, 6), tags)


METRICS = MetricsSink()

# =============================================================================
# CONFIGURATION
# =============================================================================
COOLDOWN_DAYS = int(os.getenv("RECOVERY_COOLDOWN_DAYS", "7"))
MAX_SENDS_PER_TENANT_PER_HOUR = int(os.getenv("RECOVERY_MAX_SENDS_PER_TENANT_PER_HOUR", "0"))
RECOVERY_QUOTA_WINDOW_SEC = int(os.getenv("RECOVERY_QUOTA_WINDOW_SEC", "3600"))

RECOVERY_BULK_DISPATCH_RPC = os.getenv(
    "RECOVERY_BULK_DISPATCH_RPC",
    "bulk_dispatch_recovery_candidates",
)

# =============================================================================
# TYPES & ENUMS
# =============================================================================
class RiskSignal(StrEnum):
    INACTIVITY = "inactivity"
    INVOICE_PAYMENT_FAILED = "invoice_payment_failed"
    SUBSCRIPTION_CANCELLED = "subscription_cancelled"
    NEGATIVE_FEEDBACK = "negative_feedback"

    @classmethod
    def from_raw(cls, raw_value: Any) -> Optional["RiskSignal"]:
        if raw_value is None:
            return None
        value = str(raw_value).strip().lower()
        if not value:
            return None
        try:
            return cls(value)
        except ValueError:
            return None


class CampaignType(StrEnum):
    WINBACK_INACTIVE = "winback_inactive"
    BILLING_FAILED = "billing_failed"
    CANCELLATION_FOLLOWUP = "cancellation_followup"
    FEEDBACK_RECOVERY = "feedback_recovery"


RISK_TO_CAMPAIGN = {
    RiskSignal.INACTIVITY: CampaignType.WINBACK_INACTIVE,
    RiskSignal.INVOICE_PAYMENT_FAILED: CampaignType.BILLING_FAILED,
    RiskSignal.SUBSCRIPTION_CANCELLED: CampaignType.CANCELLATION_FOLLOWUP,
    RiskSignal.NEGATIVE_FEEDBACK: CampaignType.FEEDBACK_RECOVERY,
}


class RecoveryCandidate(BaseModel):
    user_id: str = Field(..., min_length=1)
    email: EmailStr
    primary_risk_signal: RiskSignal
    campaign_type: CampaignType
    churn_risk_score: Optional[int] = None


class RecoveryDecision(BaseModel):
    status: ClaimOutcome
    campaign_type: Optional[str] = None
    send_id: Optional[str] = None
    user_id: Optional[str] = None
    reason: Optional[str] = None

    @classmethod
    def safe_create(cls, *, status: Any, **data: Any) -> "RecoveryDecision":
        if isinstance(status, ClaimOutcome):
            normalized = status
        else:
            normalized = ClaimOutcome(str(status))
        return cls(status=normalized, **data)


class BulkDispatchResult(BaseModel):
    outcome: ClaimOutcome
    send_id: Optional[str] = None
    message: Optional[str] = None
    user_id: Optional[str] = None
    campaign_type: Optional[str] = None


class QuotaCheckResponse(BaseModel):
    allowed: bool
    limit: int
    used: int
    remaining: int
    applied: int


class BulkDispatchResponse(BaseModel):
    results: List[BulkDispatchResult]
    quota: Optional[QuotaCheckResponse] = None


_bulk_dispatch_adapter = TypeAdapter(List[BulkDispatchResult])


# =============================================================================
# REPOSITORY (DATA LAYER)
# =============================================================================
class RecoveryRepository:
    def __init__(self, db_client) -> None:
        self.db = db_client

    def bulk_dispatch_candidates(
        self,
        tenant_id: str,
        candidates: List[RecoveryCandidate],
        run_id: Optional[str],
    ) -> BulkDispatchResponse:
        payload = [
            {
                "user_id": candidate.user_id,
                "email": candidate.email,
                "signal": candidate.primary_risk_signal.value,
                "campaign_type": candidate.campaign_type.value,
                "score": candidate.churn_risk_score,
            }
            for candidate in candidates
        ]

        rpc_payload: Dict[str, Any] = {
            "p_tenant_id": tenant_id,
            "p_candidates": payload,
            "p_cooldown_days": COOLDOWN_DAYS,
            "p_quota_window_sec": RECOVERY_QUOTA_WINDOW_SEC,
            "p_run_id": run_id,
        }

        if MAX_SENDS_PER_TENANT_PER_HOUR > 0:
            rpc_payload["p_quota_limit"] = MAX_SENDS_PER_TENANT_PER_HOUR

        try:
            resp = self.db.rpc(RECOVERY_BULK_DISPATCH_RPC, rpc_payload).execute()
        except Exception:
            logger.exception("recovery_bulk_rpc_failed tenant=%s run_id=%s", tenant_id, run_id)
            METRICS.increment("recovery.bulk_rpc.failed", 1, {"tenant": tenant_id})
            return BulkDispatchResponse(results=[])

        return _parse_bulk_dispatch_response(resp.data, tenant_id, run_id)

    def claim_outbox_batch(self, limit: int) -> List[OutboxClaimRow]:
        return claim_outbox_batch(
            self.db,
            limit,
            logger_obj=logger,
            on_error=lambda: METRICS.increment("recovery.outbox.claim_failed", 1),
            on_invalid=lambda: METRICS.increment("recovery.outbox.claim_invalid", 1),
        )


# =============================================================================
# ENGINE LAYER (DECISION & INSERT ONLY)
# =============================================================================
class RecoveryAutomationEngine:
    """
    Evaluates at-risk users and writes approved campaigns to the Outbox.
    Does NOT dispatch directly to the queue (crash safe).
    """
    def __init__(self, db_client, email_queue: Optional[Any] = None) -> None:
        self.db = db_client
        self.email_queue = email_queue
        self.repo = RecoveryRepository(db_client)

    def evaluate_and_queue_batch(
        self,
        tenant_id: str,
        users: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        run_id = _extract_run_id(metadata)
        start_time = time.monotonic()

        if not tenant_id or not users:
            logger.warning(
                "recovery_batch_skipped tenant=%s run_id=%s reason=empty_input",
                tenant_id,
                run_id,
            )
            METRICS.increment("recovery.batch.skipped", 1, {"tenant": tenant_id})
            return []

        logger.info(
            "recovery_batch_started tenant=%s run_id=%s users=%d",
            tenant_id,
            run_id,
            len(users),
        )

        valid_candidates: List[RecoveryCandidate] = []
        duplicate_count = 0
        invalid_count = 0
        seen_keys = set()

        for user in users:
            candidate = self._build_candidate(user, tenant_id, run_id)
            if not candidate:
                invalid_count += 1
                continue

            dedup_key = f"{candidate.user_id}:{candidate.campaign_type.value}"
            if dedup_key in seen_keys:
                duplicate_count += 1
                continue
            seen_keys.add(dedup_key)

            valid_candidates.append(candidate)

        METRICS.increment("recovery.candidates.valid", len(valid_candidates), {"tenant": tenant_id})
        METRICS.increment("recovery.candidates.invalid", invalid_count, {"tenant": tenant_id})
        METRICS.increment("recovery.candidates.duplicate", duplicate_count, {"tenant": tenant_id})

        if not valid_candidates:
            logger.info("recovery_batch_no_candidates tenant=%s run_id=%s", tenant_id, run_id)
            return []

        response = self.repo.bulk_dispatch_candidates(tenant_id, valid_candidates, run_id)
        decisions = _convert_bulk_results(response.results)

        outcome_counts = _count_outcomes(response.results)
        for outcome, count in outcome_counts.items():
            METRICS.increment("recovery.bulk.outcome", count, {"tenant": tenant_id, "outcome": outcome})

        elapsed = round(time.monotonic() - start_time, 3)
        METRICS.timing("recovery.batch.duration", elapsed, {"tenant": tenant_id})

        logger.info(
            "recovery_batch_completed tenant=%s run_id=%s candidates=%d outcomes=%s duration=%ss",
            tenant_id,
            run_id,
            len(valid_candidates),
            outcome_counts,
            elapsed,
        )

        return [decision.model_dump(mode="json", exclude_none=True) for decision in decisions]

    def _build_candidate(
        self,
        user: Dict[str, Any],
        tenant_id: str,
        run_id: Optional[str],
    ) -> Optional[RecoveryCandidate]:
        user_id = _resolve_user_id(user)
        raw_email = _resolve_email(user)
        risk_signal = RiskSignal.from_raw(user.get("primary_risk_signal"))

        if not user_id or not raw_email or not risk_signal:
            _log_candidate_rejection(tenant_id, run_id, user_id, raw_email, risk_signal)
            return None

        campaign_type = RISK_TO_CAMPAIGN.get(risk_signal)
        if not campaign_type:
            _log_candidate_rejection(tenant_id, run_id, user_id, raw_email, risk_signal)
            return None

        safe_email = _normalize_email(raw_email)

        try:
            return RecoveryCandidate.model_validate({
                "user_id": user_id,
                "email": safe_email,
                "primary_risk_signal": risk_signal,
                "campaign_type": campaign_type,
                "churn_risk_score": user.get("churn_risk_score"),
            })
        except ValidationError as exc:
            _log_validation_failure(tenant_id, run_id, user_id, exc)
            METRICS.increment("recovery.candidates.validation_failed", 1, {"tenant": tenant_id})
            return None


# =============================================================================
# OUTBOX DISPATCHER (BACKGROUND DAEMON)
# =============================================================================
class OutboxDispatcher:
    """
    Runs on a cron/loop. Safely claims pending DB rows using SKIP LOCKED,
    dispatches them to the queue with an idempotency key, and handles DLQs.
    """
    def __init__(self, db_client) -> None:
        self.db = db_client
        self.repo = RecoveryRepository(db_client)

    def process_pending_outbox(self, limit: int = 100) -> None:
        logger.info("recovery_outbox_dispatch_started limit=%d", limit)
        start_time = time.monotonic()

        rows = self.repo.claim_outbox_batch(limit)
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

                self.db.table(RECOVERY_EMAIL_TABLE).update({
                    "status": RecoveryStatus.DISPATCHED_TO_QUEUE.value,
                    "dispatched_at": datetime.now(timezone.utc).isoformat(),
                    "dispatch_token": dispatch_token,
                    "dispatch_attempt": dispatch_attempt,
                    "last_error": None,
                }).eq("id", send_id).execute()

                dispatched_count += 1

            except Exception as exc:
                logger.error(
                    "recovery_dispatch_failed tenant=%s send_id=%s attempt=%d",
                    tenant_id,
                    send_id,
                    dispatch_attempt,
                )
                _mark_dispatch_failed(self.db, send_id, dispatch_attempt, str(exc))

        duration = round(time.monotonic() - start_time, 2)
        METRICS.increment("recovery.outbox.dispatched", dispatched_count)
        METRICS.timing("recovery.outbox.duration", duration)

        logger.info(
            "recovery_outbox_dispatch_completed dispatched=%d duration=%ss",
            dispatched_count,
            duration,
        )

        apply_outbox_backpressure(dispatched_count, limit)


# =============================================================================
# HELPERS
# =============================================================================
def _parse_bulk_dispatch_response(
    data: Any,
    tenant_id: str,
    run_id: Optional[str],
) -> BulkDispatchResponse:
    results_data = data
    quota_data = None

    if isinstance(data, dict):
        results_data = data.get("results", [])
        quota_data = data.get("quota")

    try:
        results = _bulk_dispatch_adapter.validate_python(results_data)
    except ValidationError:
        logger.exception("recovery_bulk_rpc_invalid tenant=%s run_id=%s", tenant_id, run_id)
        METRICS.increment("recovery.bulk_rpc.invalid", 1, {"tenant": tenant_id})
        return BulkDispatchResponse(results=[])

    quota = None
    if quota_data is not None:
        try:
            quota = QuotaCheckResponse.model_validate(quota_data)
        except ValidationError:
            logger.exception("recovery_quota_rpc_invalid tenant=%s run_id=%s", tenant_id, run_id)
            METRICS.increment("recovery.quota.invalid", 1, {"tenant": tenant_id})

    return BulkDispatchResponse(results=results, quota=quota)


def _convert_bulk_results(results: List[BulkDispatchResult]) -> List[RecoveryDecision]:
    decisions: List[RecoveryDecision] = []
    for result in results:
        decisions.append(
            RecoveryDecision.safe_create(
                status=result.outcome,
                campaign_type=result.campaign_type,
                send_id=result.send_id,
                user_id=result.user_id,
                reason=result.message,
            )
        )
    return decisions


def _count_outcomes(results: List[BulkDispatchResult]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for result in results:
        key = result.outcome.value
        counts[key] = counts.get(key, 0) + 1
    return counts


def _extract_run_id(metadata: Optional[Dict[str, Any]]) -> Optional[str]:
    if not metadata:
        return None
    run_id = metadata.get("pipeline_run_id") or metadata.get("run_id")
    return str(run_id) if run_id else None


def _resolve_user_id(user: Dict[str, Any]) -> Optional[str]:
    for key in ("user_id", "id", "uid", "auth_user_id"):
        val = user.get(key)
        if val:
            return str(val).strip()
    return None


def _resolve_email(user: Dict[str, Any]) -> Optional[str]:
    for key in ("email", "user_email", "primary_email"):
        val = user.get(key)
        if val:
            return str(val)
    return None


def _normalize_email(raw_email: str) -> str:
    return unicodedata.normalize("NFKC", raw_email).strip().lower()


def _log_candidate_rejection(
    tenant_id: str,
    run_id: Optional[str],
    user_id: Optional[str],
    raw_email: Optional[str],
    risk_signal: Optional[RiskSignal],
) -> None:
    logger.warning(
        "recovery_candidate_rejected tenant=%s run_id=%s user_id=%s email_present=%s signal=%s",
        tenant_id,
        run_id,
        user_id,
        bool(raw_email),
        risk_signal.value if risk_signal else None,
    )


def _log_validation_failure(
    tenant_id: str,
    run_id: Optional[str],
    user_id: Optional[str],
    exc: ValidationError,
) -> None:
    fields = []
    for error in exc.errors():
        loc = error.get("loc")
        if isinstance(loc, (tuple, list)) and loc:
            fields.append(str(loc[-1]))

    logger.warning(
        "recovery_candidate_validation_failed tenant=%s run_id=%s user_id=%s fields=%s",
        tenant_id,
        run_id,
        user_id,
        fields,
    )


def _mark_dispatch_failed(db_client, send_id: str, attempt: int, error: str) -> None:
    next_retry = (datetime.now(timezone.utc) + timedelta(seconds=dispatch_backoff_seconds(attempt))).isoformat()
    try:
        db_client.table(RECOVERY_EMAIL_TABLE).update({
            "status": RecoveryStatus.DISPATCH_FAILED.value,
            "failure_stage": FailureStage.DISPATCH.value,
            "next_retry_at": next_retry,
            "last_error": error[:500],
        }).eq("id", send_id).execute()
    except Exception:
        logger.exception("recovery_outbox_dispatch_failed_persist send_id=%s", send_id)