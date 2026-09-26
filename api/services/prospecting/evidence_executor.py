"""Lease-aware executor for retained-public evidence collection.

The executor performs database reads only. It never fetches a profile, calls a
source API, expands an author history, or requests thread context. Its sole
input from the broker is a tenant ID and durable run ID; all selected target
scope and evidence caps are reloaded from the database under the run lease.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy.engine import Connection, Engine

from api.services.embeddings import _database_engine

from .evidence_collection import (
    EvidenceCollectionRun,
    EvidenceCollectionRunPlan,
    EvidenceCollectionTargetPlan,
    evidence_collection_plan_summary,
    retained_public_evidence_lease_seconds,
    retained_public_evidence_research_is_enabled,
)
from .evidence_run_lifecycle import (
    claim_evidence_collection_run,
    complete_evidence_collection_run,
    current_evidence_collection_plan_for_claim,
    heartbeat_evidence_collection_run,
    release_evidence_collection_run_for_retry,
)
from .evidence_persistence import (
    EvidencePersistenceClaimLostError,
    persist_retained_public_evidence,
)
from .retained_public_evidence import (
    RetainedEvidenceProposalBatch,
    RetainedPublicAuthorLocator,
    RetainedPublicSourceRecord,
    load_retained_public_author_records,
    propose_retained_public_evaluation_evidence,
    resolve_retained_public_author_locator,
)


logger = logging.getLogger(__name__)


EvidenceCollectionExecutionStatus = Literal[
    "completed",
    "failed",
    "partial",
    "skipped",
    "not_claimed",
    "claim_lost",
]
LoadRetainedRecords = Callable[
    [Connection, RetainedPublicAuthorLocator, int],
    tuple[RetainedPublicSourceRecord, ...],
]
Clock = Callable[[], float]

DEFAULT_EVIDENCE_COLLECTION_EXECUTION_SECONDS = 60.0
DEFAULT_EVIDENCE_COLLECTION_LEASE_BUFFER_SECONDS = 10.0
_SAFE_REASON_CODES = frozenset(
    {
        "author_locator_mismatch",
        "duplicate_source_post",
        "evidence_limit_reached",
        "evidence_persistence_rejected",
        "execution_deadline_exceeded",
        "feature_disabled",
        "invalid_proposal",
        "locator_source_not_allowed",
        "no_direct_evaluation_language",
        "no_supported_author_locator",
        "research_not_planned",
        "target_rejected_since_request",
        "targeting_profile_changed",
    }
)


@dataclass(frozen=True)
class EvidenceCollectionExecutionLimits:
    """Operational caps that can only tighten a persisted database plan."""

    max_run_seconds: float = DEFAULT_EVIDENCE_COLLECTION_EXECUTION_SECONDS
    lease_buffer_seconds: float = DEFAULT_EVIDENCE_COLLECTION_LEASE_BUFFER_SECONDS

    def __post_init__(self) -> None:
        for field_name, value, minimum, maximum in (
            ("max_run_seconds", self.max_run_seconds, 1.0, 300.0),
            ("lease_buffer_seconds", self.lease_buffer_seconds, 1.0, 120.0),
        ):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{field_name} must be a number")
            if not minimum <= float(value) <= maximum:
                raise ValueError(f"{field_name} must be between {minimum} and {maximum}")


DEFAULT_EVIDENCE_COLLECTION_EXECUTION_LIMITS = EvidenceCollectionExecutionLimits()


@dataclass(frozen=True)
class EvidenceCollectionExecutionResult:
    """A content-free outcome suitable for actor telemetry and retry policy."""

    run_id: str
    status: EvidenceCollectionExecutionStatus
    summary: dict[str, object]
    terminalized: bool = False


@dataclass
class _ExecutionCounters:
    retained_records_scanned: int = 0
    pending_evidence_proposals: int = 0
    evidence_created: int = 0
    evidence_existing: int = 0
    entities_without_supported_locator: int = 0
    entities_rejected_since_request: int = 0
    partial: bool = False
    skipped_by_reason: dict[str, int] = field(default_factory=dict)

    def record_reason(self, reason: object) -> None:
        normalized = reason if isinstance(reason, str) else "invalid_proposal"
        if normalized not in _SAFE_REASON_CODES:
            normalized = "invalid_proposal"
        if normalized not in self.skipped_by_reason and len(self.skipped_by_reason) >= 16:
            normalized = "invalid_proposal"
        self.skipped_by_reason[normalized] = self.skipped_by_reason.get(normalized, 0) + 1

    def summary(self) -> dict[str, object]:
        summary: dict[str, object] = {
            "retained_records_scanned": self.retained_records_scanned,
            "pending_evidence_proposals": self.pending_evidence_proposals,
            "evidence_created": self.evidence_created,
            "evidence_existing": self.evidence_existing,
            "entities_without_supported_locator": self.entities_without_supported_locator,
            "entities_rejected_since_request": self.entities_rejected_since_request,
        }
        if self.skipped_by_reason:
            summary["skipped_by_reason"] = dict(self.skipped_by_reason)
        return summary


def _claimed_run(engine: Engine, *, tenant_id: str, run_id: str) -> EvidenceCollectionRun | None:
    with engine.begin() as conn:
        return claim_evidence_collection_run(conn, tenant_id=tenant_id, run_id=run_id)


def _current_plan(engine: Engine, run: EvidenceCollectionRun) -> EvidenceCollectionRunPlan | None:
    with engine.begin() as conn:
        return current_evidence_collection_plan_for_claim(conn, run)


def _heartbeat(engine: Engine, run: EvidenceCollectionRun) -> bool:
    assert run.claim_token is not None
    with engine.begin() as conn:
        return heartbeat_evidence_collection_run(
            conn,
            tenant_id=run.tenant_id,
            run_id=run.id,
            claim_token=run.claim_token,
        )


def _complete(
    engine: Engine,
    run: EvidenceCollectionRun,
    *,
    status: Literal["completed", "failed", "partial", "skipped"],
    summary: dict[str, object],
    error_code: str | None = None,
) -> bool:
    assert run.claim_token is not None
    with engine.begin() as conn:
        return complete_evidence_collection_run(
            conn,
            tenant_id=run.tenant_id,
            run_id=run.id,
            claim_token=run.claim_token,
            status=status,
            summary=summary,
            error_code=error_code,
        )


def _release_for_retry(engine: Engine, run: EvidenceCollectionRun) -> bool:
    assert run.claim_token is not None
    with engine.begin() as conn:
        return release_evidence_collection_run_for_retry(
            conn,
            tenant_id=run.tenant_id,
            run_id=run.id,
            claim_token=run.claim_token,
        )


def _deadline(*, clock: Clock, limits: EvidenceCollectionExecutionLimits) -> float:
    lease_budget = max(
        1.0,
        float(retained_public_evidence_lease_seconds()) - float(limits.lease_buffer_seconds),
    )
    return clock() + min(float(limits.max_run_seconds), lease_budget)


def _summary_for_plan(
    plan: EvidenceCollectionRunPlan | None,
    counters: _ExecutionCounters,
    *,
    skip_reason: str | None = None,
) -> dict[str, object]:
    summary: dict[str, object] = {}
    if plan is not None:
        summary.update(evidence_collection_plan_summary(plan))
    summary.update(counters.summary())
    if skip_reason is not None:
        summary["skip_reason"] = skip_reason
    return summary


def _terminal_result(
    engine: Engine,
    run: EvidenceCollectionRun,
    *,
    status: Literal["completed", "partial", "skipped"],
    summary: dict[str, object],
) -> EvidenceCollectionExecutionResult:
    terminalized = _complete(engine, run, status=status, summary=summary)
    return EvidenceCollectionExecutionResult(
        run_id=run.id,
        status=status if terminalized else "claim_lost",
        summary=summary,
        terminalized=terminalized,
    )


def _profile_changed_result(
    engine: Engine,
    run: EvidenceCollectionRun,
    counters: _ExecutionCounters,
    plan: EvidenceCollectionRunPlan | None = None,
) -> EvidenceCollectionExecutionResult:
    counters.record_reason("targeting_profile_changed")
    return _terminal_result(
        engine,
        run,
        status="skipped",
        summary=_summary_for_plan(plan, counters, skip_reason="targeting_profile_changed"),
    )


def _handle_persistence_claim_loss(
    engine: Engine,
    run: EvidenceCollectionRun,
    counters: _ExecutionCounters,
    plan: EvidenceCollectionRunPlan,
) -> EvidenceCollectionExecutionResult:
    # A failed persistence check can mean a reclaimed lease or a profile/target
    # change. A heartbeat separates the safe terminal stale-brief outcome from
    # the case where another worker now owns the run.
    if _heartbeat(engine, run):
        return _profile_changed_result(engine, run, counters, plan)
    return EvidenceCollectionExecutionResult(
        run_id=run.id,
        status="claim_lost",
        summary=_summary_for_plan(plan, counters),
    )


def _load_records(
    engine: Engine,
    *,
    locator: RetainedPublicAuthorLocator,
    limit: int,
    load_records: LoadRetainedRecords,
) -> tuple[RetainedPublicSourceRecord, ...]:
    with engine.begin() as conn:
        return load_records(conn, locator, limit)


def _persist_batch(
    engine: Engine,
    *,
    run: EvidenceCollectionRun,
    target_plan: object,
    locator: RetainedPublicAuthorLocator,
    batch: RetainedEvidenceProposalBatch,
    counters: _ExecutionCounters,
    plan: EvidenceCollectionRunPlan,
) -> EvidenceCollectionExecutionResult | None:
    """Write a finite proposal batch, returning only if run ownership is lost."""

    if not isinstance(target_plan, EvidenceCollectionTargetPlan):
        counters.partial = True
        counters.record_reason("invalid_proposal")
        return None
    for reason, count in batch.skipped_by_reason.items():
        for _ in range(min(int(count), 1_000_000)):
            counters.record_reason(reason)
    for evidence in batch.evidence:
        counters.pending_evidence_proposals += 1
        try:
            with engine.begin() as conn:
                persisted = persist_retained_public_evidence(
                    conn,
                    run=run,
                    target_plan=target_plan,
                    locator=locator,
                    claim_token=run.claim_token or "",
                    evidence=evidence,
                )
        except EvidencePersistenceClaimLostError:
            return _handle_persistence_claim_loss(engine, run, counters, plan)
        except ValueError:
            # This catches a later code change that produces an out-of-scope
            # proposal. Keep the run partial instead of weakening its write
            # boundary or logging source content.
            counters.partial = True
            counters.record_reason("evidence_persistence_rejected")
            continue
        if persisted.evidence_created:
            counters.evidence_created += 1
        else:
            counters.evidence_existing += 1
    return None


def run_evidence_collection(
    tenant_id: str,
    run_id: str,
    *,
    engine: Engine | None = None,
    load_records: LoadRetainedRecords = load_retained_public_author_records,
    limits: EvidenceCollectionExecutionLimits = DEFAULT_EVIDENCE_COLLECTION_EXECUTION_LIMITS,
    clock: Clock = time.monotonic,
) -> EvidenceCollectionExecutionResult:
    """Run an explicit retained-corpus evidence request without new crawling."""

    if not isinstance(limits, EvidenceCollectionExecutionLimits):
        raise ValueError("limits must be an EvidenceCollectionExecutionLimits")
    if not callable(load_records):
        raise ValueError("load_records must be callable")
    if not callable(clock):
        raise ValueError("clock must be callable")

    resolved_engine = engine or _database_engine()
    run = _claimed_run(resolved_engine, tenant_id=tenant_id, run_id=run_id)
    if run is None:
        return EvidenceCollectionExecutionResult(run_id=run_id, status="not_claimed", summary={})
    assert run.claim_token is not None

    counters = _ExecutionCounters()
    plan: EvidenceCollectionRunPlan | None = None
    try:
        if not retained_public_evidence_research_is_enabled():
            counters.record_reason("feature_disabled")
            return _terminal_result(
                resolved_engine,
                run,
                status="skipped",
                summary=_summary_for_plan(None, counters, skip_reason="feature_disabled"),
            )
        try:
            plan = _current_plan(resolved_engine, run)
        except ValueError:
            return _profile_changed_result(resolved_engine, run, counters)
        if plan is None:
            return _profile_changed_result(resolved_engine, run, counters)
        if not _heartbeat(resolved_engine, run):
            return EvidenceCollectionExecutionResult(
                run_id=run.id,
                status="claim_lost",
                summary=_summary_for_plan(plan, counters),
            )

        deadline = _deadline(clock=clock, limits=limits)
        for target_plan in plan.target_plans:
            if target_plan.target.rejected_since_request:
                counters.entities_rejected_since_request += 1
                counters.record_reason("target_rejected_since_request")
                continue
            if deadline - clock() < 1.0:
                counters.partial = True
                counters.record_reason("execution_deadline_exceeded")
                break
            if not _heartbeat(resolved_engine, run):
                return EvidenceCollectionExecutionResult(
                    run_id=run.id,
                    status="claim_lost",
                    summary=_summary_for_plan(plan, counters),
                )

            locator = resolve_retained_public_author_locator(
                entity_kind=target_plan.target.entity_kind,
                canonical_url=target_plan.target.canonical_url,
            )
            if locator is None:
                counters.entities_without_supported_locator += 1
                counters.record_reason("no_supported_author_locator")
                continue
            if locator.source not in target_plan.plan.public_sources:
                counters.entities_without_supported_locator += 1
                counters.record_reason("locator_source_not_allowed")
                continue

            records = _load_records(
                resolved_engine,
                locator=locator,
                limit=target_plan.plan.source_result_limit_per_entity,
                load_records=load_records,
            )
            counters.retained_records_scanned += len(records)
            batch = propose_retained_public_evaluation_evidence(
                target_plan.plan,
                targeting_profile_id=run.targeting_profile_id,
                research_run_id=run.id,
                locator=locator,
                records=records,
            )
            ownership_result = _persist_batch(
                resolved_engine,
                run=run,
                target_plan=target_plan,
                locator=locator,
                batch=batch,
                counters=counters,
                plan=plan,
            )
            if ownership_result is not None:
                return ownership_result
            if not _heartbeat(resolved_engine, run):
                return EvidenceCollectionExecutionResult(
                    run_id=run.id,
                    status="claim_lost",
                    summary=_summary_for_plan(plan, counters),
                )

        return _terminal_result(
            resolved_engine,
            run,
            status="partial" if counters.partial else "completed",
            summary=_summary_for_plan(plan, counters),
        )
    except Exception as error:
        # Source text is never logged: even a database/parser exception can
        # carry a retained public fragment. Release only the matching live
        # claim, then re-raise so Dramatiq's bounded retry policy handles it.
        logger.error(
            "retained_public_evidence_execution_retryable_failure tenant_id=%s run_id=%s error_type=%s",
            run.tenant_id,
            run.id,
            error.__class__.__name__,
        )
        try:
            released = _release_for_retry(resolved_engine, run)
        except Exception as release_error:
            logger.error(
                "retained_public_evidence_execution_release_failed tenant_id=%s run_id=%s error_type=%s",
                run.tenant_id,
                run.id,
                release_error.__class__.__name__,
            )
        else:
            if not released:
                logger.info(
                    "retained_public_evidence_execution_release_not_owned tenant_id=%s run_id=%s",
                    run.tenant_id,
                    run.id,
                )
        raise


def mark_evidence_collection_dead_lettered(
    tenant_id: str,
    run_id: str,
    *,
    engine: Engine | None = None,
) -> EvidenceCollectionExecutionResult:
    """Claim before recording retry exhaustion, never overwrite a live run."""

    resolved_engine = engine or _database_engine()
    run = _claimed_run(resolved_engine, tenant_id=tenant_id, run_id=run_id)
    if run is None:
        return EvidenceCollectionExecutionResult(run_id=run_id, status="not_claimed", summary={})
    counters = _ExecutionCounters()
    summary = _summary_for_plan(None, counters)
    summary["failure_reason"] = "retained_public_evidence_retry_exhausted"
    terminalized = _complete(
        resolved_engine,
        run,
        status="failed",
        summary=summary,
        error_code="retained_public_evidence_retry_exhausted",
    )
    return EvidenceCollectionExecutionResult(
        run_id=run.id,
        status="failed" if terminalized else "claim_lost",
        summary=summary,
        terminalized=terminalized,
    )


__all__ = [
    "DEFAULT_EVIDENCE_COLLECTION_EXECUTION_LIMITS",
    "EvidenceCollectionExecutionLimits",
    "EvidenceCollectionExecutionResult",
    "EvidenceCollectionExecutionStatus",
    "mark_evidence_collection_dead_lettered",
    "run_evidence_collection",
]
