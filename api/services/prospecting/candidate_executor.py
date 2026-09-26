"""Bounded worker execution for entity-first candidate generation.

This module joins a durable candidate-generation run to the deliberately
small official-site fetch/classify/persist boundaries.  It never accepts seed
URLs from the broker, retains page text, or turns a target into a lead.  Every
write remains conditional on the claimed run token and its approved targeting
profile revision.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Literal, get_args

from sqlalchemy.engine import Engine

from api.services.embeddings import _database_engine

from .candidate_generation import (
    CandidateGenerationRun,
    candidate_generation_is_enabled,
    candidate_generation_lease_seconds,
    candidate_generation_plan_summary,
    claim_candidate_generation_run,
    complete_candidate_generation_run,
    current_candidate_generation_plan_for_claim,
    heartbeat_candidate_generation_run,
    release_candidate_generation_run_for_retry,
)
from .candidate_persistence import (
    CandidatePersistenceClaimLostError,
    persist_phase2_candidate,
)
from .official_site_classifier import (
    OfficialSiteProposalSkipReason,
    classify_official_site_page,
)
from .official_site_fetch import (
    OfficialSiteFetchLimits,
    OfficialSiteFetchResult,
    OfficialSiteFetchSkipReason,
    OfficialSiteFetcher,
    OfficialSitePageDocument,
)
from .official_site_generation import OfficialSiteGenerationRunPlan, OfficialSiteSeedPlan


logger = logging.getLogger(__name__)


CandidateGenerationExecutionStatus = Literal[
    "completed",
    "failed",
    "partial",
    "skipped",
    "not_claimed",
    "claim_lost",
]
FetchSeed = Callable[[OfficialSiteSeedPlan], OfficialSiteFetchResult]
Clock = Callable[[], float]

DEFAULT_CANDIDATE_GENERATION_EXECUTION_SECONDS = 150.0
DEFAULT_CANDIDATE_GENERATION_LEASE_BUFFER_SECONDS = 15.0
DEFAULT_CANDIDATE_GENERATION_SEED_TIMEOUT_SECONDS = 12.0


# The planner authorizes up to twelve six-page seeds.  These smaller execution
# limits keep one serial worker comfortably below the default 180-second lease
# even when several official sites stall.  A partial result is honest and can
# be requested again; expanding a crawl to fit every slow site is not safe.
DEFAULT_CANDIDATE_GENERATION_FETCH_LIMITS = OfficialSiteFetchLimits(
    run_timeout_seconds=DEFAULT_CANDIDATE_GENERATION_SEED_TIMEOUT_SECONDS,
    connect_timeout_seconds=2.0,
    request_timeout_seconds=4.0,
)

_SAFE_EXECUTION_REASON_CODES = frozenset(
    {
        *get_args(OfficialSiteFetchSkipReason),
        *get_args(OfficialSiteProposalSkipReason),
        "candidate_limit_reached",
        "candidate_persistence_rejected",
        "execution_deadline_exceeded",
        "feature_disabled",
        "invalid_fetch_result",
        "metadata_classification_failed",
        "targeting_profile_changed",
    }
)


@dataclass(frozen=True)
class CandidateGenerationExecutionLimits:
    """Operational bounds that can tighten, never widen, a persisted plan."""

    max_run_seconds: float = DEFAULT_CANDIDATE_GENERATION_EXECUTION_SECONDS
    lease_buffer_seconds: float = DEFAULT_CANDIDATE_GENERATION_LEASE_BUFFER_SECONDS
    per_seed_timeout_seconds: float = DEFAULT_CANDIDATE_GENERATION_SEED_TIMEOUT_SECONDS
    fetch_limits: OfficialSiteFetchLimits = DEFAULT_CANDIDATE_GENERATION_FETCH_LIMITS

    def __post_init__(self) -> None:
        for field_name, value, minimum, maximum in (
            ("max_run_seconds", self.max_run_seconds, 1.0, 300.0),
            ("lease_buffer_seconds", self.lease_buffer_seconds, 1.0, 120.0),
            ("per_seed_timeout_seconds", self.per_seed_timeout_seconds, 1.0, 45.0),
        ):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{field_name} must be a number")
            if not minimum <= float(value) <= maximum:
                raise ValueError(f"{field_name} must be between {minimum} and {maximum}")
        if not isinstance(self.fetch_limits, OfficialSiteFetchLimits):
            raise ValueError("fetch_limits must be an OfficialSiteFetchLimits")


DEFAULT_CANDIDATE_GENERATION_EXECUTION_LIMITS = CandidateGenerationExecutionLimits()


@dataclass(frozen=True)
class CandidateGenerationExecutionResult:
    """Content-free outcome suitable for actor telemetry and retry decisions."""

    run_id: str
    status: CandidateGenerationExecutionStatus
    summary: dict[str, object]
    terminalized: bool = False


@dataclass
class _ExecutionCounters:
    pages_fetched: int = 0
    pages_skipped: int = 0
    candidate_proposals: int = 0
    entities_created: int = 0
    entities_seen: int = 0
    assessments_created: int = 0
    fit_evidence_created: int = 0
    partial: bool = False
    skipped_by_reason: dict[str, int] = field(default_factory=dict)

    def record_reason(self, reason: object) -> None:
        normalized = reason if isinstance(reason, str) else "invalid_fetch_result"
        if normalized not in _SAFE_EXECUTION_REASON_CODES:
            normalized = "invalid_fetch_result"
        # Durable run summaries intentionally cap their reason vocabulary. A
        # generic safe bucket preserves the operational fact without turning
        # unexpected dependency output into a storage or logging channel.
        if normalized not in self.skipped_by_reason and len(self.skipped_by_reason) >= 16:
            normalized = "invalid_fetch_result"
        self.skipped_by_reason[normalized] = self.skipped_by_reason.get(normalized, 0) + 1

    def summary(self) -> dict[str, object]:
        summary: dict[str, object] = {
            "pages_fetched": self.pages_fetched,
            "pages_skipped": self.pages_skipped,
            "candidate_proposals": self.candidate_proposals,
            "entities_created": self.entities_created,
            "entities_seen": self.entities_seen,
            "assessments_created": self.assessments_created,
            "fit_evidence_created": self.fit_evidence_created,
        }
        if self.skipped_by_reason:
            summary["skipped_by_reason"] = dict(self.skipped_by_reason)
        return summary


def _claimed_run(
    engine: Engine,
    *,
    tenant_id: str,
    run_id: str,
) -> CandidateGenerationRun | None:
    with engine.begin() as conn:
        return claim_candidate_generation_run(conn, tenant_id=tenant_id, run_id=run_id)


def _current_plan(
    engine: Engine,
    run: CandidateGenerationRun,
) -> OfficialSiteGenerationRunPlan | None:
    with engine.begin() as conn:
        return current_candidate_generation_plan_for_claim(conn, run)


def _heartbeat(engine: Engine, run: CandidateGenerationRun) -> bool:
    assert run.claim_token is not None
    with engine.begin() as conn:
        return heartbeat_candidate_generation_run(
            conn,
            tenant_id=run.tenant_id,
            run_id=run.id,
            claim_token=run.claim_token,
        )


def _complete(
    engine: Engine,
    run: CandidateGenerationRun,
    *,
    status: Literal["completed", "failed", "partial", "skipped"],
    summary: dict[str, object],
    error_code: str | None = None,
) -> bool:
    assert run.claim_token is not None
    with engine.begin() as conn:
        return complete_candidate_generation_run(
            conn,
            tenant_id=run.tenant_id,
            run_id=run.id,
            claim_token=run.claim_token,
            status=status,
            summary=summary,
            error_code=error_code,
        )


def _release_for_retry(engine: Engine, run: CandidateGenerationRun) -> bool:
    assert run.claim_token is not None
    with engine.begin() as conn:
        return release_candidate_generation_run_for_retry(
            conn,
            tenant_id=run.tenant_id,
            run_id=run.id,
            claim_token=run.claim_token,
        )


def _run_deadline(
    *,
    clock: Clock,
    limits: CandidateGenerationExecutionLimits,
) -> float:
    lease_seconds = candidate_generation_lease_seconds()
    lease_budget = max(1.0, float(lease_seconds) - float(limits.lease_buffer_seconds))
    return clock() + min(float(limits.max_run_seconds), lease_budget)


def _default_fetch_seed(
    plan: OfficialSiteSeedPlan,
    *,
    remaining_seconds: float,
    limits: CandidateGenerationExecutionLimits,
) -> OfficialSiteFetchResult:
    # ``OfficialSiteFetcher`` owns per-request and per-page bounds.  Recreate
    # it per seed because its transport deliberately never reuses a connection
    # across DNS revalidation boundaries.
    timeout = min(float(limits.per_seed_timeout_seconds), remaining_seconds)
    if timeout < 1.0:
        raise ValueError("execution deadline leaves no valid seed timeout")
    fetch_limits = replace(limits.fetch_limits, run_timeout_seconds=timeout)
    return OfficialSiteFetcher(limits=fetch_limits).fetch(plan)


def _summary_for_plan(
    plan: OfficialSiteGenerationRunPlan | None,
    counters: _ExecutionCounters,
    *,
    skip_reason: str | None = None,
) -> dict[str, object]:
    summary: dict[str, object] = {}
    if plan is not None:
        summary.update(candidate_generation_plan_summary(plan))
    summary.update(counters.summary())
    if skip_reason is not None:
        summary["skip_reason"] = skip_reason
    return summary


def _terminal_result(
    engine: Engine,
    run: CandidateGenerationRun,
    *,
    status: Literal["completed", "partial", "skipped"],
    summary: dict[str, object],
) -> CandidateGenerationExecutionResult:
    terminalized = _complete(engine, run, status=status, summary=summary)
    return CandidateGenerationExecutionResult(
        run_id=run.id,
        status=status if terminalized else "claim_lost",
        summary=summary,
        terminalized=terminalized,
    )


def _profile_changed_result(
    engine: Engine,
    run: CandidateGenerationRun,
    counters: _ExecutionCounters,
    plan: OfficialSiteGenerationRunPlan | None = None,
) -> CandidateGenerationExecutionResult:
    counters.record_reason("targeting_profile_changed")
    return _terminal_result(
        engine,
        run,
        status="skipped",
        summary=_summary_for_plan(plan, counters, skip_reason="targeting_profile_changed"),
    )


def _handle_persistence_claim_loss(
    engine: Engine,
    run: CandidateGenerationRun,
    counters: _ExecutionCounters,
    plan: OfficialSiteGenerationRunPlan,
) -> CandidateGenerationExecutionResult:
    # A persistence claim can disappear because the lease was reclaimed *or*
    # because the approved profile revision changed. Heartbeat distinguishes
    # those cases without exposing target or source content.
    if _heartbeat(engine, run):
        return _profile_changed_result(engine, run, counters, plan)
    return CandidateGenerationExecutionResult(
        run_id=run.id,
        status="claim_lost",
        summary=_summary_for_plan(plan, counters),
    )


def _process_seed(
    engine: Engine,
    *,
    run: CandidateGenerationRun,
    plan: OfficialSiteGenerationRunPlan,
    seed_plan: OfficialSiteSeedPlan,
    fetch_result: OfficialSiteFetchResult,
    counters: _ExecutionCounters,
    seen_entities: set[tuple[str, str]],
) -> CandidateGenerationExecutionResult | None:
    """Persist a finite fetch result, returning only when ownership is lost."""

    if not isinstance(fetch_result, OfficialSiteFetchResult):
        counters.partial = True
        counters.record_reason("invalid_fetch_result")
        return None
    if fetch_result.seed_url != seed_plan.seed_url:
        counters.partial = True
        counters.record_reason("invalid_fetch_result")
        return None
    if fetch_result.outcome not in {"completed", "partial", "skipped"}:
        counters.partial = True
        counters.record_reason("invalid_fetch_result")
        return None
    if fetch_result.outcome == "skipped" and fetch_result.documents:
        counters.partial = True
        counters.record_reason("invalid_fetch_result")
        return None

    if fetch_result.outcome != "completed":
        counters.partial = True
    for skipped in fetch_result.skipped:
        counters.pages_skipped += 1
        counters.record_reason(getattr(skipped, "reason_code", "invalid_fetch_result"))

    seed_proposals = 0
    for document in fetch_result.documents:
        if not isinstance(document, OfficialSitePageDocument):
            counters.partial = True
            counters.record_reason("invalid_fetch_result")
            continue
        counters.pages_fetched += 1
        remaining_seed = seed_plan.candidate_limit - seed_proposals
        remaining_run = run.candidate_limit - counters.candidate_proposals
        if remaining_seed <= 0 or remaining_run <= 0:
            counters.record_reason("candidate_limit_reached")
            break

        scoped_seed_plan = replace(
            seed_plan,
            candidate_limit=min(remaining_seed, remaining_run),
        )
        try:
            classified = classify_official_site_page(
                scoped_seed_plan,
                document.as_classifier_page(),
            )
        except ValueError:
            counters.partial = True
            counters.record_reason("metadata_classification_failed")
            continue

        for skipped in classified.skipped:
            counters.record_reason(skipped.reason_code)
        for proposal in classified.proposals:
            entity_key = (proposal.entity.entity_kind, proposal.entity.canonical_url)
            if entity_key in seen_entities:
                counters.record_reason("duplicate_entity")
                continue
            if seed_proposals >= seed_plan.candidate_limit or (
                counters.candidate_proposals >= run.candidate_limit
            ):
                counters.record_reason("candidate_limit_reached")
                break
            try:
                with engine.begin() as conn:
                    persisted = persist_phase2_candidate(
                        conn,
                        run=run,
                        claim_token=run.claim_token or "",
                        proposal=proposal,
                    )
            except CandidatePersistenceClaimLostError:
                return _handle_persistence_claim_loss(engine, run, counters, plan)
            except ValueError:
                # A classifier-produced proposal should normally validate. If a
                # later code change violates the persistence contract, retain a
                # bounded partial result instead of writing an ambiguous row.
                counters.partial = True
                counters.record_reason("candidate_persistence_rejected")
                continue

            seen_entities.add(entity_key)
            seed_proposals += 1
            counters.candidate_proposals += 1
            if persisted.entity_created:
                counters.entities_created += 1
            else:
                counters.entities_seen += 1
            if persisted.assessment_created:
                counters.assessments_created += 1
            if persisted.fit_evidence_created:
                counters.fit_evidence_created += 1
    return None


def run_candidate_generation(
    tenant_id: str,
    run_id: str,
    *,
    engine: Engine | None = None,
    fetch_seed: FetchSeed | None = None,
    limits: CandidateGenerationExecutionLimits = DEFAULT_CANDIDATE_GENERATION_EXECUTION_LIMITS,
    clock: Clock = time.monotonic,
) -> CandidateGenerationExecutionResult:
    """Run one claimed target-generation job without widening its scope.

    The broker is expected to contain only ``tenant_id`` and ``run_id``. A
    stale profile, a disabled feature, or a lost lease produces a safe terminal
    or no-op result. Unexpected infrastructure exceptions release the current
    claim back to ``queued`` before re-raising so Dramatiq can actually retry.
    """

    if not isinstance(limits, CandidateGenerationExecutionLimits):
        raise ValueError("limits must be a CandidateGenerationExecutionLimits")
    if not callable(clock):
        raise ValueError("clock must be callable")

    resolved_engine = engine or _database_engine()
    run = _claimed_run(resolved_engine, tenant_id=tenant_id, run_id=run_id)
    if run is None:
        return CandidateGenerationExecutionResult(
            run_id=run_id,
            status="not_claimed",
            summary={},
        )
    assert run.claim_token is not None

    counters = _ExecutionCounters()
    plan: OfficialSiteGenerationRunPlan | None = None
    try:
        if not candidate_generation_is_enabled():
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
            # Persisted target types or seed URLs may have been edited outside
            # the normal brief RPC. That is a stale/invalid thesis, not a
            # transport outage worth retrying against.
            return _profile_changed_result(resolved_engine, run, counters)
        if plan is None:
            return _profile_changed_result(resolved_engine, run, counters)
        if not _heartbeat(resolved_engine, run):
            return CandidateGenerationExecutionResult(
                run_id=run.id,
                status="claim_lost",
                summary=_summary_for_plan(plan, counters),
            )

        deadline = _run_deadline(clock=clock, limits=limits)
        seen_entities: set[tuple[str, str]] = set()
        for seed_plan in plan.seed_plans:
            if not seed_plan.is_planned:
                continue
            remaining_seconds = deadline - clock()
            if remaining_seconds < 1.0:
                counters.partial = True
                counters.record_reason("execution_deadline_exceeded")
                break
            if not _heartbeat(resolved_engine, run):
                return CandidateGenerationExecutionResult(
                    run_id=run.id,
                    status="claim_lost",
                    summary=_summary_for_plan(plan, counters),
                )

            result = (
                fetch_seed(seed_plan)
                if fetch_seed is not None
                else _default_fetch_seed(
                    seed_plan,
                    remaining_seconds=remaining_seconds,
                    limits=limits,
                )
            )
            ownership_result = _process_seed(
                resolved_engine,
                run=run,
                plan=plan,
                seed_plan=seed_plan,
                fetch_result=result,
                counters=counters,
                seen_entities=seen_entities,
            )
            if ownership_result is not None:
                return ownership_result
            if not _heartbeat(resolved_engine, run):
                return CandidateGenerationExecutionResult(
                    run_id=run.id,
                    status="claim_lost",
                    summary=_summary_for_plan(plan, counters),
                )

        terminal_status: Literal["completed", "partial"] = (
            "partial" if counters.partial else "completed"
        )
        return _terminal_result(
            resolved_engine,
            run,
            status=terminal_status,
            summary=_summary_for_plan(plan, counters),
        )
    except Exception as error:
        # Do not include exception text or a traceback: a transport/parser
        # exception can contain a customer URL or page fragment. The run has a
        # durable safe error code and the actor gets a clean retry signal.
        logger.error(
            "candidate_generation_execution_retryable_failure tenant_id=%s run_id=%s error_type=%s",
            run.tenant_id,
            run.id,
            error.__class__.__name__,
        )
        try:
            released = _release_for_retry(resolved_engine, run)
        except Exception as release_error:
            logger.error(
                "candidate_generation_execution_release_failed tenant_id=%s run_id=%s error_type=%s",
                run.tenant_id,
                run.id,
                release_error.__class__.__name__,
            )
        else:
            if not released:
                logger.info(
                    "candidate_generation_execution_claim_lost_before_retry_release tenant_id=%s run_id=%s",
                    run.tenant_id,
                    run.id,
                )
        raise


def mark_candidate_generation_dead_lettered(
    tenant_id: str,
    run_id: str,
    *,
    engine: Engine | None = None,
) -> CandidateGenerationExecutionResult:
    """Terminalize an unclaimed queued retry only after Dramatiq gives up.

    The exhausted-message handler claims the durable row first. A duplicate
    message, a manually retried run, or a reclaimed lease therefore cannot be
    incorrectly marked failed by an older broker delivery.
    """

    resolved_engine = engine or _database_engine()
    run = _claimed_run(resolved_engine, tenant_id=tenant_id, run_id=run_id)
    if run is None:
        return CandidateGenerationExecutionResult(
            run_id=run_id,
            status="not_claimed",
            summary={},
        )
    counters = _ExecutionCounters()
    summary = _summary_for_plan(None, counters)
    summary["failure_reason"] = "candidate_generation_retry_exhausted"
    terminalized = _complete(
        resolved_engine,
        run,
        status="failed",
        summary=summary,
        error_code="candidate_generation_retry_exhausted",
    )
    return CandidateGenerationExecutionResult(
        run_id=run.id,
        status="failed" if terminalized else "claim_lost",
        summary=summary,
        terminalized=terminalized,
    )


__all__ = [
    "CandidateGenerationExecutionLimits",
    "CandidateGenerationExecutionResult",
    "CandidateGenerationExecutionStatus",
    "DEFAULT_CANDIDATE_GENERATION_EXECUTION_LIMITS",
    "DEFAULT_CANDIDATE_GENERATION_FETCH_LIMITS",
    "FetchSeed",
    "mark_candidate_generation_dead_lettered",
    "run_candidate_generation",
]
