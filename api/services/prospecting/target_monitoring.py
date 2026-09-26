"""Opt-in, retained-corpus monitoring for explicit entity-first targets.

This scheduler never fetches a profile, crawls a target URL, or invokes a
source connector.  A customer must explicitly enable a monitor in the
database contract; each due monitor then reuses the bounded retained-public
evidence collection workflow for one already-selected target.

PostgreSQL owns both the durable schedule and the singleton scheduler tick.
That makes broker delivery recoverable without turning a lost delayed message
into duplicate research or an uncontrolled background crawl.
"""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from api.services.embeddings import _database_engine

from .evidence_collection import (
    EvidenceCollectionStartRequest,
    retained_public_evidence_research_is_enabled,
)
from .evidence_dispatch import enqueue_evidence_collection_run


logger = logging.getLogger(__name__)


TARGET_MONITORING_FLAG = "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_ENABLED"
MONITOR_TABLE = "prospect_target_monitors"
SCHEDULER_STATE_TABLE = "prospect_target_monitor_scheduler_state"
SCHEDULER_NAME = "retained_public_evidence_monitoring"

DEFAULT_MONITOR_INTERVAL_HOURS = 24
DEFAULT_MONITOR_TICK_SECONDS = 300
DEFAULT_MONITOR_DISPATCHES_PER_TICK = 8
DEFAULT_MONITOR_DISPATCH_LEASE_SECONDS = 300
DEFAULT_MONITOR_RETRY_SECONDS = 3_600

_REQUIRED_MONITOR_COLUMNS = frozenset(
    {
        "id",
        "tenant_id",
        "targeting_profile_id",
        "prospect_entity_id",
        "status",
        "next_refresh_at",
        "dispatch_lease_until",
        "last_research_run_id",
    }
)
_REQUIRED_SCHEDULER_STATE_COLUMNS = frozenset(
    {"scheduler_name", "next_tick_at", "last_tick_started_at", "updated_at"}
)
_TERMINAL_MONITOR_SKIP_REASONS = frozenset(
    {
        "target_not_available",
        "no_planned_targets",
        "targeting_profile_unavailable",
        "targeting_profile_changed",
    }
)


@dataclass(frozen=True)
class TargetMonitoringLimits:
    """Controls that only bound retained-corpus refresh work."""

    interval_seconds: int
    tick_seconds: int
    max_dispatches_per_tick: int
    dispatch_lease_seconds: int
    retry_seconds: int


@dataclass(frozen=True)
class DueTargetMonitor:
    """A leased monitor with no URL, handle, query, or source content."""

    monitor_id: str
    tenant_id: str
    service_profile_id: str
    prospect_entity_id: str
    scheduled_for: datetime

    def __post_init__(self) -> None:
        for field_name in ("monitor_id", "service_profile_id", "prospect_entity_id"):
            try:
                normalized = str(UUID(str(getattr(self, field_name)).strip()))
            except (AttributeError, TypeError, ValueError) as error:
                raise ValueError(f"{field_name} must be a UUID") from error
            object.__setattr__(self, field_name, normalized)
        if not isinstance(self.tenant_id, str) or not self.tenant_id.strip():
            raise ValueError("tenant_id is required")
        object.__setattr__(self, "tenant_id", self.tenant_id.strip())
        if (
            not isinstance(self.scheduled_for, datetime)
            or self.scheduled_for.tzinfo is None
        ):
            raise ValueError("scheduled_for must be timezone-aware")
        object.__setattr__(
            self,
            "scheduled_for",
            self.scheduled_for.astimezone(timezone.utc),
        )


@dataclass(frozen=True)
class TargetMonitoringTickResult:
    """Content-free outcome suitable for scheduler telemetry."""

    dispatched: int
    deferred: int
    paused: int
    failed: int
    next_delay_seconds: int
    enabled: bool


def _env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        logger.warning(
            "retained_public_monitor_invalid_integer_env name=%s default=%s",
            name,
            default,
        )
        return default
    return max(minimum, min(maximum, value))


def retained_public_evidence_monitoring_is_enabled() -> bool:
    """Monitoring has an independent, off-by-default rollout switch."""

    return os.getenv(TARGET_MONITORING_FLAG, "false").strip().casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }


def target_monitoring_limits() -> TargetMonitoringLimits:
    """Return a deliberately low-frequency, bounded schedule."""

    return TargetMonitoringLimits(
        interval_seconds=_env_int(
            "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_INTERVAL_HOURS",
            DEFAULT_MONITOR_INTERVAL_HOURS,
            minimum=24,
            maximum=24 * 7,
        )
        * 60
        * 60,
        tick_seconds=_env_int(
            "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_TICK_SECONDS",
            DEFAULT_MONITOR_TICK_SECONDS,
            minimum=60,
            maximum=3_600,
        ),
        max_dispatches_per_tick=_env_int(
            "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_MAX_DISPATCHES_PER_TICK",
            DEFAULT_MONITOR_DISPATCHES_PER_TICK,
            minimum=1,
            maximum=25,
        ),
        dispatch_lease_seconds=_env_int(
            "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_DISPATCH_LEASE_SECONDS",
            DEFAULT_MONITOR_DISPATCH_LEASE_SECONDS,
            minimum=30,
            maximum=900,
        ),
        retry_seconds=_env_int(
            "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_RETRY_SECONDS",
            DEFAULT_MONITOR_RETRY_SECONDS,
            minimum=300,
            maximum=86_400,
        ),
    )


def _table_has_columns(
    conn: Connection,
    *,
    table_name: str,
    required_columns: frozenset[str],
) -> bool:
    rows = conn.execute(
        text(
            """
            SELECT column_name
              FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalars()
    return required_columns.issubset(set(rows))


def _monitoring_schema_available(conn: Connection) -> bool:
    """Fail closed until every persistence boundary is deployed."""

    return _table_has_columns(
        conn,
        table_name=MONITOR_TABLE,
        required_columns=_REQUIRED_MONITOR_COLUMNS,
    ) and _table_has_columns(
        conn,
        table_name=SCHEDULER_STATE_TABLE,
        required_columns=_REQUIRED_SCHEDULER_STATE_COLUMNS,
    )


def bootstrap_target_monitoring_scheduler(*, engine: Engine | None = None) -> bool:
    """Record an immediate tick if no future singleton tick already exists."""

    if (
        not retained_public_evidence_monitoring_is_enabled()
        or not retained_public_evidence_research_is_enabled()
    ):
        return False
    try:
        with (engine or _database_engine()).begin() as conn:
            if not _monitoring_schema_available(conn):
                logger.warning(
                    "retained_public_monitor_scheduler_bootstrap_skipped reason=%s",
                    "monitoring_schema_missing",
                )
                return False
            inserted = conn.execute(
                text(
                    """
                    INSERT INTO public.prospect_target_monitor_scheduler_state (
                        scheduler_name,
                        next_tick_at,
                        last_tick_started_at,
                        created_at,
                        updated_at
                    )
                    VALUES (:scheduler_name, NOW(), NULL, NOW(), NOW())
                    ON CONFLICT (scheduler_name) DO NOTHING
                    RETURNING scheduler_name
                    """
                ),
                {"scheduler_name": SCHEDULER_NAME},
            ).scalar_one_or_none()
            if inserted:
                return True
            return bool(
                conn.execute(
                    text(
                        """
                        SELECT next_tick_at <= NOW()
                          FROM public.prospect_target_monitor_scheduler_state
                         WHERE scheduler_name = :scheduler_name
                        """
                    ),
                    {"scheduler_name": SCHEDULER_NAME},
                ).scalar_one_or_none()
            )
    except Exception as error:
        logger.warning(
            "retained_public_monitor_scheduler_bootstrap_failed error_type=%s",
            error.__class__.__name__,
        )
        # Startup owns bounded retry scheduling. Do not collapse an
        # infrastructure failure into the ordinary "future tick exists" path.
        raise RuntimeError("target monitoring scheduler bootstrap failed") from error


def claim_target_monitoring_scheduler_tick(
    *,
    engine: Engine | None = None,
    limits: TargetMonitoringLimits | None = None,
) -> int | None:
    """Atomically claim the next tick and advance its durable successor."""

    if (
        not retained_public_evidence_monitoring_is_enabled()
        or not retained_public_evidence_research_is_enabled()
    ):
        return None
    resolved_limits = limits or target_monitoring_limits()
    try:
        with (engine or _database_engine()).begin() as conn:
            if not _monitoring_schema_available(conn):
                return None
            claimed = conn.execute(
                text(
                    """
                    UPDATE public.prospect_target_monitor_scheduler_state
                       SET next_tick_at = NOW()
                                          + make_interval(secs => :tick_seconds),
                           last_tick_started_at = NOW(),
                           updated_at = NOW()
                     WHERE scheduler_name = :scheduler_name
                       AND next_tick_at <= NOW()
                    RETURNING scheduler_name
                    """
                ),
                {
                    "scheduler_name": SCHEDULER_NAME,
                    "tick_seconds": resolved_limits.tick_seconds,
                },
            ).scalar_one_or_none()
            return resolved_limits.tick_seconds if claimed else None
    except Exception as error:
        logger.warning(
            "retained_public_monitor_scheduler_tick_claim_failed error_type=%s",
            error.__class__.__name__,
        )
        # The actor must retry an unavailable database rather than acknowledge
        # the only due scheduler message as an ordinary no-op.
        raise RuntimeError("target monitoring scheduler tick claim failed") from error


def release_target_monitoring_scheduler_tick(*, engine: Engine | None = None) -> None:
    """Make the current tick immediately retryable after successor publish fails."""

    try:
        with (engine or _database_engine()).begin() as conn:
            if not _monitoring_schema_available(conn):
                return
            conn.execute(
                text(
                    """
                    UPDATE public.prospect_target_monitor_scheduler_state
                       SET next_tick_at = NOW(),
                           updated_at = NOW()
                     WHERE scheduler_name = :scheduler_name
                    """
                ),
                {"scheduler_name": SCHEDULER_NAME},
            )
    except Exception as error:
        logger.warning(
            "retained_public_monitor_scheduler_tick_release_failed error_type=%s",
            error.__class__.__name__,
        )


def target_monitoring_scheduler_next_delay(
    *,
    engine: Engine | None = None,
) -> int | None:
    """Return one bounded recovery delay for an already-recorded scheduler tick.

    This is deliberately read-only. It lets worker startup and a retried actor
    repair a lost delayed broker message without changing the singleton's
    durable schedule or creating a parallel polling loop.
    """

    if (
        not retained_public_evidence_monitoring_is_enabled()
        or not retained_public_evidence_research_is_enabled()
    ):
        return None
    try:
        with (engine or _database_engine()).begin() as conn:
            if not _monitoring_schema_available(conn):
                return None
            delay_seconds = conn.execute(
                text(
                    """
                    SELECT CASE
                        WHEN next_tick_at <= NOW() THEN 0
                        ELSE CEIL(EXTRACT(EPOCH FROM next_tick_at - NOW()))::integer
                    END
                      FROM public.prospect_target_monitor_scheduler_state
                     WHERE scheduler_name = :scheduler_name
                    """
                ),
                {"scheduler_name": SCHEDULER_NAME},
            ).scalar_one_or_none()
            return None if delay_seconds is None else max(0, int(delay_seconds))
    except Exception as error:
        logger.warning(
            "retained_public_monitor_scheduler_recovery_delay_failed error_type=%s",
            error.__class__.__name__,
        )
        raise RuntimeError("target monitoring scheduler recovery delay failed") from error


def _claim_due_target_monitors(
    engine: Engine,
    *,
    limits: TargetMonitoringLimits,
) -> tuple[DueTargetMonitor, ...]:
    """Lease a finite due set; the monitor's due timestamp remains its retry key."""

    with engine.begin() as conn:
        if not _monitoring_schema_available(conn):
            return ()
        rows = conn.execute(
            text(
                """
                WITH due AS (
                    SELECT monitor.id
                      FROM public.prospect_target_monitors AS monitor
                      INNER JOIN public.prospect_assessments AS assessment
                              ON assessment.tenant_id = monitor.tenant_id
                             AND assessment.targeting_profile_id = monitor.targeting_profile_id
                             AND assessment.prospect_entity_id = monitor.prospect_entity_id
                     WHERE monitor.status = 'active'
                       AND monitor.next_refresh_at <= NOW()
                       AND (
                            monitor.dispatch_lease_until IS NULL
                            OR monitor.dispatch_lease_until < NOW()
                       )
                       AND assessment.assessment_state <> 'rejected'
                     ORDER BY monitor.next_refresh_at ASC, monitor.id ASC
                     FOR UPDATE OF monitor SKIP LOCKED
                     LIMIT :limit
                ),
                claimed AS (
                    UPDATE public.prospect_target_monitors AS monitor
                       SET dispatch_lease_until = NOW()
                                                   + make_interval(secs => :lease_seconds),
                           updated_at = NOW()
                      FROM due
                     WHERE monitor.id = due.id
                 RETURNING monitor.id,
                           monitor.tenant_id,
                           monitor.targeting_profile_id,
                           monitor.prospect_entity_id,
                           monitor.next_refresh_at
                )
                SELECT claimed.id,
                       claimed.tenant_id,
                       profile.service_profile_id,
                       claimed.prospect_entity_id,
                       claimed.next_refresh_at
                  FROM claimed
                  INNER JOIN public.targeting_profiles AS profile
                          ON profile.id = claimed.targeting_profile_id
                         AND profile.tenant_id = claimed.tenant_id
                 ORDER BY claimed.next_refresh_at ASC, claimed.id ASC
                """
            ),
            {
                "limit": limits.max_dispatches_per_tick,
                "lease_seconds": limits.dispatch_lease_seconds,
            },
        ).mappings()
        claims: list[DueTargetMonitor] = []
        for row in rows:
            try:
                claims.append(
                    DueTargetMonitor(
                        monitor_id=row.get("id"),
                        tenant_id=row.get("tenant_id"),
                        service_profile_id=row.get("service_profile_id"),
                        prospect_entity_id=row.get("prospect_entity_id"),
                        scheduled_for=row.get("next_refresh_at"),
                    )
                )
            except (AttributeError, TypeError, ValueError):
                logger.warning(
                    "retained_public_monitor_claim_skipped reason=%s",
                    "invalid_monitor_row",
                )
        return tuple(claims)


def _monitor_nonce(claim: DueTargetMonitor) -> str:
    """Create a stable, opaque retry key for this one durable due window."""

    material = (
        "retained-public-evidence-monitor-v1:"
        f"{claim.monitor_id}:{claim.scheduled_for.isoformat(timespec='seconds')}"
    )
    return f"monitor-{hashlib.sha256(material.encode('utf-8')).hexdigest()}"


def _mark_monitor_dispatched(
    engine: Engine,
    *,
    claim: DueTargetMonitor,
    research_run_id: str,
    limits: TargetMonitoringLimits,
) -> bool:
    """Advance only the live monitor lease after the evidence run is durable."""

    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                UPDATE public.prospect_target_monitors AS monitor
                   SET dispatch_lease_until = NULL,
                       last_dispatched_at = NOW(),
                       last_research_run_id = CAST(:research_run_id AS uuid),
                       last_error_code = NULL,
                       next_refresh_at = NOW()
                                         + make_interval(secs => :interval_seconds),
                       updated_at = NOW()
                 WHERE monitor.id = CAST(:monitor_id AS uuid)
                   AND monitor.tenant_id = :tenant_id
                   AND monitor.status = 'active'
                   AND monitor.dispatch_lease_until >= NOW()
                RETURNING monitor.id
                """
            ),
            {
                "monitor_id": claim.monitor_id,
                "tenant_id": claim.tenant_id,
                "research_run_id": str(UUID(research_run_id)),
                "interval_seconds": limits.interval_seconds,
            },
        ).scalar_one_or_none()
        return bool(row)


def _defer_monitor(
    engine: Engine,
    *,
    claim: DueTargetMonitor,
    reason: str,
    limits: TargetMonitoringLimits,
) -> bool:
    """Keep the original due window behind a bounded retry lease.

    Retaining ``next_refresh_at`` preserves the opaque nonce for this durable
    due window. Moving that timestamp on every broker failure could create a
    second evidence run after an ambiguous publish outcome.
    """

    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                UPDATE public.prospect_target_monitors AS monitor
                   SET dispatch_lease_until = NOW()
                                             + make_interval(secs => :retry_seconds),
                       last_error_code = :reason,
                       updated_at = NOW()
                 WHERE monitor.id = CAST(:monitor_id AS uuid)
                   AND monitor.tenant_id = :tenant_id
                   AND monitor.status = 'active'
                   AND monitor.dispatch_lease_until >= NOW()
                RETURNING monitor.id
                """
            ),
            {
                "monitor_id": claim.monitor_id,
                "tenant_id": claim.tenant_id,
                "reason": reason,
                "retry_seconds": limits.retry_seconds,
            },
        ).scalar_one_or_none()
        return bool(row)


def _pause_monitor(
    engine: Engine,
    *,
    claim: DueTargetMonitor,
    reason: str,
) -> bool:
    """Stop a monitor whose selected target cannot be researched safely."""

    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                UPDATE public.prospect_target_monitors AS monitor
                   SET status = 'paused',
                       dispatch_lease_until = NULL,
                       last_error_code = :reason,
                       updated_at = NOW()
                 WHERE monitor.id = CAST(:monitor_id AS uuid)
                   AND monitor.tenant_id = :tenant_id
                   AND monitor.dispatch_lease_until >= NOW()
                RETURNING monitor.id
                """
            ),
            {
                "monitor_id": claim.monitor_id,
                "tenant_id": claim.tenant_id,
                "reason": reason,
            },
        ).scalar_one_or_none()
        return bool(row)


def dispatch_due_target_monitor_refreshes(
    *,
    engine: Engine | None = None,
    limits: TargetMonitoringLimits | None = None,
) -> TargetMonitoringTickResult:
    """Dispatch each due opt-in target through the existing evidence boundary.

    A collection run is created before a broker message is published. If the
    publish result is ambiguous, the due timestamp and opaque nonce are left
    intact, so the next bounded retry repairs it without creating a second
    evidence scope.
    """

    resolved_limits = limits or target_monitoring_limits()
    enabled = (
        retained_public_evidence_monitoring_is_enabled()
        and retained_public_evidence_research_is_enabled()
    )
    if not enabled:
        return TargetMonitoringTickResult(
            dispatched=0,
            deferred=0,
            paused=0,
            failed=0,
            next_delay_seconds=resolved_limits.tick_seconds,
            enabled=False,
        )

    resolved_engine = engine or _database_engine()
    try:
        claims = _claim_due_target_monitors(resolved_engine, limits=resolved_limits)
    except Exception as error:
        logger.warning(
            "retained_public_monitor_due_claim_failed error_type=%s",
            error.__class__.__name__,
        )
        return TargetMonitoringTickResult(
            dispatched=0,
            deferred=0,
            paused=0,
            failed=1,
            next_delay_seconds=resolved_limits.tick_seconds,
            enabled=True,
        )

    dispatched = 0
    deferred = 0
    paused = 0
    failed = 0
    for claim in claims:
        try:
            dispatch = enqueue_evidence_collection_run(
                EvidenceCollectionStartRequest(
                    tenant_id=claim.tenant_id,
                    service_profile_id=claim.service_profile_id,
                    prospect_entity_ids=(claim.prospect_entity_id,),
                    request_nonce=_monitor_nonce(claim),
                    quota_scope="monitoring",
                ),
                engine=resolved_engine,
            )
        except Exception as error:
            logger.warning(
                "retained_public_monitor_dispatch_deferred tenant_id=%s monitor_id=%s error_type=%s",
                claim.tenant_id,
                claim.monitor_id,
                error.__class__.__name__,
            )
            try:
                _defer_monitor(
                    resolved_engine,
                    claim=claim,
                    reason="evidence_dispatch_unavailable",
                    limits=resolved_limits,
                )
                deferred += 1
            except Exception as defer_error:
                logger.warning(
                    "retained_public_monitor_dispatch_defer_failed tenant_id=%s monitor_id=%s error_type=%s",
                    claim.tenant_id,
                    claim.monitor_id,
                    defer_error.__class__.__name__,
                )
                failed += 1
            continue

        if dispatch.run is None:
            assert dispatch.skip_reason is not None
            try:
                if dispatch.skip_reason in _TERMINAL_MONITOR_SKIP_REASONS:
                    _pause_monitor(
                        resolved_engine,
                        claim=claim,
                        reason=dispatch.skip_reason,
                    )
                    paused += 1
                else:
                    _defer_monitor(
                        resolved_engine,
                        claim=claim,
                        reason=dispatch.skip_reason,
                        limits=resolved_limits,
                    )
                    deferred += 1
            except Exception as update_error:
                logger.warning(
                    "retained_public_monitor_skip_update_failed tenant_id=%s monitor_id=%s reason=%s error_type=%s",
                    claim.tenant_id,
                    claim.monitor_id,
                    dispatch.skip_reason,
                    update_error.__class__.__name__,
                )
                failed += 1
            continue

        try:
            if _mark_monitor_dispatched(
                resolved_engine,
                claim=claim,
                research_run_id=dispatch.run.id,
                limits=resolved_limits,
            ):
                dispatched += 1
            else:
                failed += 1
                logger.warning(
                    "retained_public_monitor_dispatch_claim_lost tenant_id=%s monitor_id=%s run_id=%s",
                    claim.tenant_id,
                    claim.monitor_id,
                    dispatch.run.id,
                )
        except Exception as error:
            failed += 1
            logger.warning(
                "retained_public_monitor_dispatch_record_failed tenant_id=%s monitor_id=%s run_id=%s error_type=%s",
                claim.tenant_id,
                claim.monitor_id,
                dispatch.run.id,
                error.__class__.__name__,
            )

    return TargetMonitoringTickResult(
        dispatched=dispatched,
        deferred=deferred,
        paused=paused,
        failed=failed,
        next_delay_seconds=resolved_limits.tick_seconds,
        enabled=True,
    )


__all__ = [
    "DueTargetMonitor",
    "TargetMonitoringLimits",
    "TargetMonitoringTickResult",
    "bootstrap_target_monitoring_scheduler",
    "claim_target_monitoring_scheduler_tick",
    "dispatch_due_target_monitor_refreshes",
    "release_target_monitoring_scheduler_tick",
    "retained_public_evidence_monitoring_is_enabled",
    "target_monitoring_scheduler_next_delay",
    "target_monitoring_limits",
]
