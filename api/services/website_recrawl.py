"""Persistent, plan-aware scheduling for website crawls.

The scheduler owns when crawl work may enter the normal guarded crawler. It
does not perform browser, HTTP, or model work itself. PostgreSQL is the source
of truth, so a worker restart or a second scheduler instance cannot duplicate
work or bypass the shared cost limits.
"""
from __future__ import annotations

import hashlib
import logging
import os
import random
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from api.services.tenant_entitlements import tenant_has_active_paid_access

logger = logging.getLogger(__name__)

SCHEDULE_TABLE = "website_recrawl_schedules"
DISPATCH_TABLE = "website_recrawl_dispatches"
SCHEDULER_STATE_TABLE = "website_recrawl_scheduler_state"
SCHEDULER_STATE_NAME = "website_recrawl"
INITIAL_CRAWL_KIND = "initial"
RECURRING_CRAWL_KIND = "recurring"
PRO_DISPATCH_PRIORITY = "pro"
FREE_DISPATCH_PRIORITY = "free"
FREE_PLAN_RECRAWL_REASON = "recrawl_not_entitled"
DEFAULT_MIN_RECRAWL_HOURS = 24
DEFAULT_MAX_RECRAWL_HOURS = 48
DEFAULT_SCHEDULER_TICK_SECONDS = 300
DEFAULT_MAX_DISPATCHES_PER_TICK = 4
DEFAULT_MAX_DISPATCHES_PER_DAY = 200
DEFAULT_RESERVED_PRO_DISPATCHES_PER_DAY = 50
DEFAULT_DISPATCH_LEASE_SECONDS = 900
DEFAULT_ADMISSION_RETRY_SECONDS = 300
DEFAULT_INITIAL_FAILURE_RETRY_SECONDS = 3_600
DEFAULT_MAX_CONSECUTIVE_FAILURES = 3

_REQUIRED_SCHEDULE_COLUMNS = frozenset({"tenant_id", "website_url", "crawl_kind", "status", "next_crawl_at", "dispatch_lease_until", "consecutive_failures", "last_error"})
_REQUIRED_DISPATCH_COLUMNS = frozenset({"tenant_id", "website_url", "scheduled_for", "crawl_kind", "dispatch_priority", "status"})
_REQUIRED_SCHEDULER_STATE_COLUMNS = frozenset(
    {"scheduler_name", "next_tick_at", "last_tick_started_at", "updated_at"}
)

@dataclass(frozen=True)
class RecrawlLimits:
    """Validated controls that bound automatic crawl spend."""
    min_interval_seconds: int
    max_interval_seconds: int
    tick_seconds: int
    max_dispatches_per_tick: int
    max_dispatches_per_day: int
    reserved_pro_dispatches_per_day: int
    dispatch_lease_seconds: int
    admission_retry_seconds: int
    initial_failure_retry_seconds: int
    max_consecutive_failures: int

@dataclass(frozen=True)
class DueWebsiteRecrawl:
    tenant_id: str
    website_url: str
    scheduled_for: str
    crawl_kind: str = RECURRING_CRAWL_KIND
    dispatch_priority: str = PRO_DISPATCH_PRIORITY

@dataclass(frozen=True)
class InitialCrawlSubmission:
    """The durable acknowledgement returned before browser admission."""
    job_id: str
    deduplicated: bool

@dataclass(frozen=True)
class SchedulerTickResult:
    dispatched: int
    deferred: int
    failed: int
    daily_budget_remaining: int
    next_delay_seconds: int

def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError:
        logger.warning(
            "website_recrawl_invalid_integer_env name=%s value=%s default=%s",
            name,
            raw_value,
            default,
        )
        return default
    return max(minimum, value)

def recrawl_limits() -> RecrawlLimits:
    """Return a production-safe schedule clamped to the 24-48 hour contract."""
    configured_min_hours = _env_int(
        "ARCLI_RECRAWL_MIN_HOURS",
        DEFAULT_MIN_RECRAWL_HOURS,
    )
    configured_max_hours = _env_int(
        "ARCLI_RECRAWL_MAX_HOURS",
        DEFAULT_MAX_RECRAWL_HOURS,
    )
    min_hours = min(48, max(24, configured_min_hours))
    max_hours = min(48, max(min_hours, configured_max_hours))
    if (min_hours, max_hours) != (configured_min_hours, configured_max_hours):
        logger.warning(
            "website_recrawl_interval_clamped configured_min_hours=%s configured_max_hours=%s min_hours=%s max_hours=%s",
            configured_min_hours,
            configured_max_hours,
            min_hours,
            max_hours,
        )

    max_dispatches_per_day = _env_int(
        "ARCLI_RECRAWL_MAX_DISPATCHES_PER_DAY",
        DEFAULT_MAX_DISPATCHES_PER_DAY,
    )
    reserved_pro_dispatches_per_day = min(
        max_dispatches_per_day,
        _env_int(
            "ARCLI_RECRAWL_RESERVED_PRO_DISPATCHES_PER_DAY",
            DEFAULT_RESERVED_PRO_DISPATCHES_PER_DAY,
            minimum=0,
        ),
    )
    return RecrawlLimits(
        min_interval_seconds=min_hours * 60 * 60,
        max_interval_seconds=max_hours * 60 * 60,
        tick_seconds=_env_int(
            "ARCLI_RECRAWL_SCHEDULER_TICK_SECONDS",
            DEFAULT_SCHEDULER_TICK_SECONDS,
            minimum=60,
        ),
        max_dispatches_per_tick=_env_int(
            "ARCLI_RECRAWL_MAX_DISPATCHES_PER_TICK",
            DEFAULT_MAX_DISPATCHES_PER_TICK,
        ),
        max_dispatches_per_day=max_dispatches_per_day,
        reserved_pro_dispatches_per_day=reserved_pro_dispatches_per_day,
        dispatch_lease_seconds=_env_int(
            "ARCLI_RECRAWL_DISPATCH_LEASE_SECONDS",
            DEFAULT_DISPATCH_LEASE_SECONDS,
            minimum=60,
        ),
        admission_retry_seconds=_env_int(
            "ARCLI_RECRAWL_ADMISSION_RETRY_SECONDS",
            DEFAULT_ADMISSION_RETRY_SECONDS,
            minimum=60,
        ),
        initial_failure_retry_seconds=_env_int(
            "ARCLI_INITIAL_CRAWL_FAILURE_RETRY_SECONDS",
            DEFAULT_INITIAL_FAILURE_RETRY_SECONDS,
            minimum=60,
        ),
        max_consecutive_failures=_env_int(
            "ARCLI_RECRAWL_MAX_CONSECUTIVE_FAILURES",
            DEFAULT_MAX_CONSECUTIVE_FAILURES,
        ),
    )

def _random_interval_seconds(limits: RecrawlLimits) -> int:
    """Spread paid refreshes across the contract window instead of spiking."""
    return random.SystemRandom().randint(
        limits.min_interval_seconds,
        limits.max_interval_seconds,
    )

def _table_exists(conn: Connection, table_name: str) -> bool:
    return bool(
        conn.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                      FROM information_schema.tables
                     WHERE table_schema = 'public'
                       AND table_name = :table_name
                )
                """
            ),
            {"table_name": table_name},
        ).scalar_one()
    )

def _table_has_columns(
    conn: Connection,
    table_name: str,
    required_columns: frozenset[str],
) -> bool:
    if not _table_exists(conn, table_name):
        return False
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

def _scheduler_tables_available(conn: Connection) -> bool:
    """Fail closed until the compatible persistence migration is installed."""
    return _table_has_columns(
        conn,
        SCHEDULE_TABLE,
        _REQUIRED_SCHEDULE_COLUMNS,
    ) and _table_has_columns(
        conn,
        DISPATCH_TABLE,
        _REQUIRED_DISPATCH_COLUMNS,
    )


def _scheduler_state_available(conn: Connection) -> bool:
    """Return whether the singleton-tick migration is present.

    Schedules and dispatch records may pre-date the singleton state table.
    Those rows remain safe to write, but a worker must not execute automatic
    recrawls until it can prove that exactly one durable tick owns the next
    dispatch window.
    """

    return _table_has_columns(
        conn,
        SCHEDULER_STATE_TABLE,
        _REQUIRED_SCHEDULER_STATE_COLUMNS,
    )


def bootstrap_website_recrawl_scheduler() -> bool:
    """Return whether a system worker should seed an immediate scheduler tick.

    The persistent state is intentionally independent of Redis delayed
    messages.  After a restart, an already scheduled future tick suppresses a
    second chain; an overdue row allows recovery when a delayed message was
    lost while no worker was running.
    """

    from api.services.embeddings import _database_engine

    try:
        with _database_engine().begin() as conn:
            if not _scheduler_state_available(conn):
                logger.warning(
                    "website_recrawl_scheduler_bootstrap_skipped reason=%s",
                    "scheduler_state_schema_missing",
                )
                return False

            inserted = conn.execute(
                text(
                    """
                    INSERT INTO public.website_recrawl_scheduler_state (
                        scheduler_name,
                        next_tick_at,
                        last_tick_started_at,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        :scheduler_name,
                        NOW(),
                        NULL,
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (scheduler_name) DO NOTHING
                    RETURNING scheduler_name
                    """
                ),
                {"scheduler_name": SCHEDULER_STATE_NAME},
            ).scalar_one_or_none()
            if inserted:
                return True

            # A state row in the past means the worker was unavailable when
            # its delayed message should have run.  Publishing one recovery
            # message is safe because the tick claim below is compare-and-set.
            return bool(
                conn.execute(
                    text(
                        """
                        SELECT next_tick_at <= NOW()
                          FROM public.website_recrawl_scheduler_state
                         WHERE scheduler_name = :scheduler_name
                        """
                    ),
                    {"scheduler_name": SCHEDULER_STATE_NAME},
                ).scalar_one_or_none()
            )
    except Exception as exc:
        logger.exception(
            "website_recrawl_scheduler_bootstrap_state_failed error_type=%s error=%s",
            exc.__class__.__name__,
            exc,
        )
        return False


def claim_website_recrawl_scheduler_tick() -> int | None:
    """Advance and claim the one durable scheduler tick.

    Every queued actor, including delayed messages created before a worker
    recycle, compares against the same due timestamp.  Only one can advance
    it.  The returned delay is persisted before the caller publishes its
    successor, so duplicate deliveries become no-ops rather than permanent
    parallel scheduler loops.
    """

    from api.services.embeddings import _database_engine

    limits = recrawl_limits()
    try:
        with _database_engine().begin() as conn:
            if not _scheduler_state_available(conn):
                logger.warning(
                    "website_recrawl_scheduler_tick_skipped reason=%s",
                    "scheduler_state_schema_missing",
                )
                return None

            row = conn.execute(
                text(
                    """
                    UPDATE public.website_recrawl_scheduler_state
                       SET next_tick_at = NOW() + (
                               :tick_seconds * interval '1 second'
                           ),
                           last_tick_started_at = NOW(),
                           updated_at = NOW()
                     WHERE scheduler_name = :scheduler_name
                       AND next_tick_at <= NOW()
                    RETURNING next_tick_at
                    """
                ),
                {
                    "scheduler_name": SCHEDULER_STATE_NAME,
                    "tick_seconds": limits.tick_seconds,
                },
            ).mappings().first()
            return limits.tick_seconds if row else None
    except Exception as exc:
        logger.exception(
            "website_recrawl_scheduler_tick_claim_failed error_type=%s error=%s",
            exc.__class__.__name__,
            exc,
        )
        return None


def release_website_recrawl_scheduler_tick() -> None:
    """Make a claimed tick recoverable when publishing its successor fails."""

    from api.services.embeddings import _database_engine

    try:
        with _database_engine().begin() as conn:
            if not _scheduler_state_available(conn):
                return
            conn.execute(
                text(
                    """
                    UPDATE public.website_recrawl_scheduler_state
                       SET next_tick_at = NOW(),
                           updated_at = NOW()
                     WHERE scheduler_name = :scheduler_name
                    """
                ),
                {"scheduler_name": SCHEDULER_STATE_NAME},
            )
    except Exception as exc:
        logger.exception(
            "website_recrawl_scheduler_tick_release_failed error_type=%s error=%s",
            exc.__class__.__name__,
            exc,
        )

def _crawl_job_id(tenant_id: str, website_url: str) -> str:
    digest = hashlib.sha256(f"{tenant_id}:{website_url}".encode("utf-8")).hexdigest()
    return digest[:24]

def queue_initial_website_crawl(
    engine: Engine,
    *,
    tenant_id: str,
    website_url: str,
) -> InitialCrawlSubmission | None:
    """Durably accept a first crawl without occupying a browser queue slot.

    The request is idempotent for one tenant and URL. A later scheduler tick
    performs ordinary queue admission, which lets a 200-user onboarding burst
    drain safely instead of returning a capacity error to 194 users.
    """
    job_id = _crawl_job_id(tenant_id, website_url)
    try:
        with engine.begin() as conn:
            if not _scheduler_tables_available(conn):
                logger.warning(
                    "website_initial_crawl_not_queued tenant_id=%s website_url=%s reason=%s",
                    tenant_id,
                    website_url,
                    "scheduler_schema_missing",
                )
                return None

            existing = conn.execute(
                text(
                    """
                    SELECT crawl_kind, status
                      FROM public.website_recrawl_schedules
                     WHERE tenant_id = :tenant_id
                       AND website_url = :website_url
                     FOR UPDATE
                    """
                ),
                {"tenant_id": tenant_id, "website_url": website_url},
            ).mappings().first()
            if existing and str(existing["crawl_kind"]) == RECURRING_CRAWL_KIND:
                return InitialCrawlSubmission(job_id=job_id, deduplicated=True)

            # A new website supersedes any still-pending site for this tenant.
            # Keep old rows as a bounded audit trail, but never crawl them.
            conn.execute(
                text(
                    """
                    UPDATE public.website_recrawl_schedules
                       SET status = 'paused',
                           dispatch_lease_until = NULL,
                           last_error = 'superseded_by_new_website',
                           updated_at = NOW()
                     WHERE tenant_id = :tenant_id
                       AND website_url <> :website_url
                       AND status IN ('active', 'queued')
                    """
                ),
                {"tenant_id": tenant_id, "website_url": website_url},
            )
            conn.execute(
                text(
                    """
                    INSERT INTO public.website_recrawl_schedules (
                        tenant_id,
                        website_url,
                        crawl_kind,
                        status,
                        next_crawl_at,
                        dispatch_lease_until,
                        consecutive_failures,
                        last_error,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        :tenant_id,
                        :website_url,
                        :crawl_kind,
                        'active',
                        NOW(),
                        NULL,
                        0,
                        NULL,
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (tenant_id, website_url) DO UPDATE
                       SET crawl_kind = EXCLUDED.crawl_kind,
                           status = 'active',
                           next_crawl_at = NOW(),
                           dispatch_lease_until = NULL,
                           consecutive_failures = 0,
                           last_error = NULL,
                           updated_at = NOW()
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "website_url": website_url,
                    "crawl_kind": INITIAL_CRAWL_KIND,
                },
            )
    except Exception as exc:
        logger.exception(
            "website_initial_crawl_queue_failed tenant_id=%s website_url=%s error_type=%s error=%s",
            tenant_id,
            website_url,
            exc.__class__.__name__,
            exc,
        )
        return None

    logger.info(
        "website_initial_crawl_queued tenant_id=%s website_url=%s crawl_job_id=%s",
        tenant_id,
        website_url,
        job_id,
    )
    return InitialCrawlSubmission(job_id=job_id, deduplicated=False)

def schedule_website_recrawl(
    engine: Engine,
    *,
    tenant_id: str,
    website_url: str,
) -> bool:
    """Complete a crawl and schedule only an entitled tenant's next refresh."""
    limits = recrawl_limits()
    try:
        with engine.begin() as conn:
            if not _scheduler_tables_available(conn):
                logger.warning(
                    "website_recrawl_schedule_skipped tenant_id=%s website_url=%s reason=%s",
                    tenant_id,
                    website_url,
                    "scheduler_schema_missing",
                )
                return False

            paid_access = tenant_has_active_paid_access(conn, tenant_id)
            interval_seconds = _random_interval_seconds(limits) if paid_access else 0
            status = "active" if paid_access else "paused"
            last_error = None if paid_access else FREE_PLAN_RECRAWL_REASON
            row = conn.execute(
                text(
                    """
                    INSERT INTO public.website_recrawl_schedules (
                        tenant_id,
                        website_url,
                        crawl_kind,
                        status,
                        last_completed_at,
                        next_crawl_at,
                        consecutive_failures,
                        last_error,
                        dispatch_lease_until,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        :tenant_id,
                        :website_url,
                        :crawl_kind,
                        :status,
                        NOW(),
                        NOW() + (:interval_seconds * interval '1 second'),
                        0,
                        :last_error,
                        NULL,
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (tenant_id, website_url) DO UPDATE
                       SET crawl_kind = EXCLUDED.crawl_kind,
                           status = EXCLUDED.status,
                           last_completed_at = NOW(),
                           next_crawl_at = EXCLUDED.next_crawl_at,
                           consecutive_failures = 0,
                           last_error = EXCLUDED.last_error,
                           dispatch_lease_until = NULL,
                           updated_at = NOW()
                    RETURNING status, next_crawl_at
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "website_url": website_url,
                    "crawl_kind": RECURRING_CRAWL_KIND,
                    "status": status,
                    "interval_seconds": interval_seconds,
                    "last_error": last_error,
                },
            ).mappings().one()
    except Exception as exc:
        logger.exception(
            "website_recrawl_schedule_failed tenant_id=%s website_url=%s error_type=%s error=%s",
            tenant_id,
            website_url,
            exc.__class__.__name__,
            exc,
        )
        return False

    logger.info(
        "website_recrawl_schedule_updated tenant_id=%s website_url=%s status=%s interval_seconds=%s next_crawl_at=%s",
        tenant_id,
        website_url,
        row["status"],
        interval_seconds,
        row["next_crawl_at"],
    )
    return True

def pause_website_recrawl(
    engine: Engine,
    *,
    tenant_id: str,
    website_url: str,
    reason: str,
) -> None:
    """Stop a stale or superseded site from consuming scheduler capacity."""
    try:
        with engine.begin() as conn:
            if not _table_exists(conn, SCHEDULE_TABLE):
                return
            conn.execute(
                text(
                    """
                    UPDATE public.website_recrawl_schedules
                       SET status = 'paused',
                           dispatch_lease_until = NULL,
                           last_error = :reason,
                           updated_at = NOW()
                     WHERE tenant_id = :tenant_id
                       AND website_url = :website_url
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "website_url": website_url,
                    "reason": reason[:2_000],
                },
            )
    except Exception as exc:
        logger.exception(
            "website_recrawl_pause_failed tenant_id=%s website_url=%s reason=%s error_type=%s",
            tenant_id,
            website_url,
            reason,
            exc.__class__.__name__,
        )

def record_terminal_recrawl_failure(
    engine: Engine,
    *,
    tenant_id: str,
    website_url: str,
    failure_reason: str,
) -> None:
    """Retry an initial crawl promptly and pause repeatedly broken sites."""
    limits = recrawl_limits()
    try:
        with engine.begin() as conn:
            if not _scheduler_tables_available(conn):
                return
            existing = conn.execute(
                text(
                    """
                    SELECT crawl_kind, consecutive_failures
                      FROM public.website_recrawl_schedules
                     WHERE tenant_id = :tenant_id
                       AND website_url = :website_url
                     FOR UPDATE
                    """
                ),
                {"tenant_id": tenant_id, "website_url": website_url},
            ).mappings().first()
            if not existing:
                logger.info(
                    "website_crawl_terminal_failure_ignored tenant_id=%s website_url=%s reason=%s",
                    tenant_id,
                    website_url,
                    "not_scheduler_managed",
                )
                return

            crawl_kind = str(existing["crawl_kind"])
            failures = int(existing["consecutive_failures"]) + 1
            paused = failures >= limits.max_consecutive_failures
            retry_seconds = (
                limits.initial_failure_retry_seconds
                if crawl_kind == INITIAL_CRAWL_KIND
                else _random_interval_seconds(limits)
            )
            row = conn.execute(
                text(
                    """
                    UPDATE public.website_recrawl_schedules
                       SET consecutive_failures = :consecutive_failures,
                           status = :status,
                           next_crawl_at = CASE
                               WHEN :paused THEN next_crawl_at
                               ELSE NOW() + (:retry_seconds * interval '1 second')
                           END,
                           dispatch_lease_until = NULL,
                           last_error = :failure_reason,
                           updated_at = NOW()
                     WHERE tenant_id = :tenant_id
                       AND website_url = :website_url
                    RETURNING status, next_crawl_at
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "website_url": website_url,
                    "consecutive_failures": failures,
                    "status": "paused" if paused else "active",
                    "paused": paused,
                    "retry_seconds": retry_seconds,
                    "failure_reason": failure_reason[:2_000],
                },
            ).mappings().one()
    except Exception as exc:
        logger.exception(
            "website_recrawl_terminal_failure_not_recorded tenant_id=%s website_url=%s error_type=%s",
            tenant_id,
            website_url,
            exc.__class__.__name__,
        )
        return

    logger.warning(
        "website_crawl_terminal_failure_scheduled tenant_id=%s website_url=%s crawl_kind=%s status=%s consecutive_failures=%s next_crawl_at=%s failure_reason=%s",
        tenant_id,
        website_url,
        crawl_kind,
        row["status"],
        failures,
        row["next_crawl_at"],
        failure_reason,
    )

def _paid_access_sql(tenant_alias: str) -> str:
    return f"""
        LOWER(COALESCE({tenant_alias}.plan_tier, 'free')) IN ('pro', 'enterprise')
        AND LOWER(COALESCE({tenant_alias}.subscription_status, ''))
            IN ('active', 'canceling')
        AND (
            LOWER(COALESCE({tenant_alias}.subscription_status, '')) <> 'canceling'
            OR {tenant_alias}.current_period_end IS NULL
            OR {tenant_alias}.current_period_end >= NOW()
        )
    """
def _reconcile_recrawl_entitlements(conn: Connection, limits: RecrawlLimits) -> None:
    """Pause downgraded schedules and start a jittered window after upgrades."""
    paused = conn.execute(
        text(
            f"""
            UPDATE public.website_recrawl_schedules AS schedule
               SET status = 'paused',
                   dispatch_lease_until = NULL,
                   last_error = :reason,
                   updated_at = NOW()
             WHERE schedule.crawl_kind = :crawl_kind
               AND schedule.status IN ('active', 'queued')
               AND NOT EXISTS (
                   SELECT 1
                     FROM public.tenants AS tenant
                    WHERE tenant.tenant_id = schedule.tenant_id
                      AND ({_paid_access_sql('tenant')})
               )
            """
        ),
        {"crawl_kind": RECURRING_CRAWL_KIND, "reason": FREE_PLAN_RECRAWL_REASON},
    ).rowcount
    reactivated = conn.execute(
        text(
            f"""
            UPDATE public.website_recrawl_schedules AS schedule
               SET status = 'active',
                   next_crawl_at = NOW() + (
                       :min_interval_seconds
                       + floor(random() * (
                           :max_interval_seconds - :min_interval_seconds + 1
                       ))
                   ) * interval '1 second',
                   dispatch_lease_until = NULL,
                   last_error = NULL,
                   updated_at = NOW()
             WHERE schedule.crawl_kind = :crawl_kind
               AND schedule.status = 'paused'
               AND schedule.last_error = :reason
               AND EXISTS (
                   SELECT 1
                     FROM public.tenants AS tenant
                    WHERE tenant.tenant_id = schedule.tenant_id
                      AND ({_paid_access_sql('tenant')})
               )
            """
        ),
        {
            "crawl_kind": RECURRING_CRAWL_KIND,
            "reason": FREE_PLAN_RECRAWL_REASON,
            "min_interval_seconds": limits.min_interval_seconds,
            "max_interval_seconds": limits.max_interval_seconds,
        },
    ).rowcount
    if paused or reactivated:
        logger.info(
            "website_recrawl_entitlements_reconciled paused=%s reactivated=%s",
            paused,
            reactivated,
        )

def _daily_dispatch_counts(conn: Connection) -> tuple[int, int]:
    row = conn.execute(
        text(
            """
            SELECT COUNT(*) AS total_count,
                   COUNT(*) FILTER (
                       WHERE dispatch_priority = :pro_priority
                   ) AS pro_count
              FROM public.website_recrawl_dispatches
             WHERE status = 'enqueued'
               AND enqueued_at >= date_trunc('day', NOW())
            """
        ),
        {"pro_priority": PRO_DISPATCH_PRIORITY},
    ).mappings().one()
    return int(row["total_count"]), int(row["pro_count"])

def _claim_due_website_recrawls(
    engine: Engine,
    limits: RecrawlLimits,
) -> tuple[list[DueWebsiteRecrawl], int]:
    """Claim one bounded, paid-prioritized batch exactly once."""
    with engine.begin() as conn:
        if not _scheduler_tables_available(conn):
            return [], limits.max_dispatches_per_day

        # This protects the global cap and Pro reserve across every scheduler
        # instance. It is held only around small indexed DB statements.
        conn.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_name))"),
            {"lock_name": "arcli:website-recrawl-scheduler-v2"},
        )
        _reconcile_recrawl_entitlements(conn, limits)
        total_count, pro_count = _daily_dispatch_counts(conn)
        remaining = max(0, limits.max_dispatches_per_day - total_count)
        if remaining == 0:
            return [], 0

        pro_reserve_remaining = max(
            0,
            limits.reserved_pro_dispatches_per_day - pro_count,
        )
        allow_free = remaining > pro_reserve_remaining
        rows = conn.execute(
            text(
                f"""
                WITH due AS (
                    SELECT schedule.tenant_id,
                           schedule.website_url,
                           schedule.crawl_kind,
                           schedule.next_crawl_at,
                           CASE
                               WHEN ({_paid_access_sql('tenant')})
                               THEN :pro_priority
                               ELSE :free_priority
                           END AS dispatch_priority
                      FROM public.website_recrawl_schedules AS schedule
                      INNER JOIN public.tenants AS tenant
                        ON tenant.tenant_id = schedule.tenant_id
                     WHERE schedule.next_crawl_at <= NOW()
                       AND (
                           schedule.status = 'active'
                           OR (
                               schedule.status = 'queued'
                               AND (
                                   schedule.dispatch_lease_until IS NULL
                                   OR schedule.dispatch_lease_until <= NOW()
                               )
                           )
                       )
                       AND (
                           schedule.crawl_kind = :initial_crawl_kind
                           OR ({_paid_access_sql('tenant')})
                       )
                       AND (
                           :allow_free
                           OR ({_paid_access_sql('tenant')})
                       )
                     ORDER BY
                         CASE
                             WHEN ({_paid_access_sql('tenant')})
                                  AND schedule.crawl_kind = :initial_crawl_kind
                             THEN 0
                             WHEN ({_paid_access_sql('tenant')}) THEN 1
                             ELSE 2
                         END,
                         schedule.next_crawl_at ASC
                     FOR UPDATE OF schedule SKIP LOCKED
                     LIMIT :batch_size
                )
                UPDATE public.website_recrawl_schedules AS schedule
                   SET status = 'queued',
                       dispatch_lease_until = NOW() + (
                           :lease_seconds * interval '1 second'
                       ),
                       updated_at = NOW()
                  FROM due
                 WHERE schedule.tenant_id = due.tenant_id
                   AND schedule.website_url = due.website_url
                RETURNING schedule.tenant_id,
                          schedule.website_url,
                          due.crawl_kind,
                          due.dispatch_priority,
                          due.next_crawl_at AS scheduled_for
                """
            ),
            {
                "initial_crawl_kind": INITIAL_CRAWL_KIND,
                "pro_priority": PRO_DISPATCH_PRIORITY,
                "free_priority": FREE_DISPATCH_PRIORITY,
                "allow_free": allow_free,
                "batch_size": min(limits.max_dispatches_per_tick, remaining),
                "lease_seconds": limits.dispatch_lease_seconds,
            },
        ).mappings()
        claims = [
            DueWebsiteRecrawl(
                tenant_id=str(row["tenant_id"]),
                website_url=str(row["website_url"]),
                scheduled_for=str(row["scheduled_for"]),
                crawl_kind=str(row["crawl_kind"]),
                dispatch_priority=str(row["dispatch_priority"]),
            )
            for row in rows
        ]
        return claims, remaining

def _record_dispatch(
    engine: Engine,
    *,
    claim: DueWebsiteRecrawl,
    status: str,
    message_id: str | None = None,
    error: str | None = None,
) -> None:
    with engine.begin() as conn:
        if not _scheduler_tables_available(conn):
            return
        conn.execute(
            text(
                """
                INSERT INTO public.website_recrawl_dispatches (
                    tenant_id,
                    website_url,
                    scheduled_for,
                    crawl_kind,
                    dispatch_priority,
                    status,
                    message_id,
                    error_message,
                    enqueued_at,
                    created_at,
                    updated_at
                )
                VALUES (
                    :tenant_id,
                    :website_url,
                    CAST(:scheduled_for AS timestamptz),
                    :crawl_kind,
                    :dispatch_priority,
                    :status,
                    :message_id,
                    :error_message,
                    CASE WHEN :status = 'enqueued' THEN NOW() ELSE NULL END,
                    NOW(),
                    NOW()
                )
                ON CONFLICT (tenant_id, website_url, scheduled_for) DO UPDATE
                   SET crawl_kind = EXCLUDED.crawl_kind,
                       dispatch_priority = EXCLUDED.dispatch_priority,
                       status = EXCLUDED.status,
                       message_id = EXCLUDED.message_id,
                       error_message = EXCLUDED.error_message,
                       enqueued_at = CASE
                           WHEN EXCLUDED.status = 'enqueued' THEN NOW()
                           ELSE public.website_recrawl_dispatches.enqueued_at
                       END,
                       updated_at = NOW()
                """
            ),
            {
                "tenant_id": claim.tenant_id,
                "website_url": claim.website_url,
                "scheduled_for": claim.scheduled_for,
                "crawl_kind": claim.crawl_kind,
                "dispatch_priority": claim.dispatch_priority,
                "status": status,
                "message_id": message_id,
                "error_message": error[:2_000] if error else None,
            },
        )
        if status == "enqueued":
            conn.execute(
                text(
                    """
                    UPDATE public.website_recrawl_schedules
                       SET last_dispatched_at = NOW(),
                           updated_at = NOW()
                     WHERE tenant_id = :tenant_id
                       AND website_url = :website_url
                    """
                ),
                {"tenant_id": claim.tenant_id, "website_url": claim.website_url},
            )

def _defer_claim(
    engine: Engine,
    *,
    claim: DueWebsiteRecrawl,
    retry_seconds: int,
    reason: str,
) -> None:
    with engine.begin() as conn:
        if not _table_exists(conn, SCHEDULE_TABLE):
            return
        conn.execute(
            text(
                """
                UPDATE public.website_recrawl_schedules
                   SET status = 'active',
                       next_crawl_at = NOW() + (:retry_seconds * interval '1 second'),
                       dispatch_lease_until = NULL,
                       last_error = :reason,
                       updated_at = NOW()
                 WHERE tenant_id = :tenant_id
                   AND website_url = :website_url
                """
            ),
            {
                "tenant_id": claim.tenant_id,
                "website_url": claim.website_url,
                "retry_seconds": retry_seconds,
                "reason": reason[:2_000],
            },
        )

def dispatch_due_website_recrawls() -> SchedulerTickResult:
    """Submit due initial or paid recurring crawls through normal admission."""
    from api.services.crawling import (
        CrawlQueueCapacityLimit,
        _database_engine,
        enqueue_crawl_job,
        reserve_website_crawl_slot,
    )

    limits = recrawl_limits()
    engine = _database_engine()
    try:
        claims, daily_budget_remaining = _claim_due_website_recrawls(engine, limits)
    except Exception as exc:
        logger.exception(
            "website_recrawl_scheduler_claim_failed error_type=%s error=%s",
            exc.__class__.__name__,
            exc,
        )
        return SchedulerTickResult(0, 0, 1, 0, limits.tick_seconds)

    if not claims:
        if daily_budget_remaining == 0:
            logger.warning(
                "website_crawl_daily_budget_exhausted max_dispatches_per_day=%s",
                limits.max_dispatches_per_day,
            )
        return SchedulerTickResult(0, 0, 0, daily_budget_remaining, limits.tick_seconds)

    dispatched = 0
    deferred = 0
    failed = 0
    for claim in claims:
        crawl_job_id = _crawl_job_id(claim.tenant_id, claim.website_url)
        source = (
            "scheduled_initial_crawl"
            if claim.crawl_kind == INITIAL_CRAWL_KIND
            else "scheduled_recrawl"
        )
        try:
            with engine.begin() as conn:
                capacity_limit = reserve_website_crawl_slot(
                    conn,
                    tenant_id=claim.tenant_id,
                    crawl_job_id=crawl_job_id,
                    website_url=claim.website_url,
                    source=source,
                )
            if isinstance(capacity_limit, CrawlQueueCapacityLimit):
                retry_seconds = max(
                    limits.admission_retry_seconds,
                    capacity_limit.retry_after_seconds,
                )
                _defer_claim(
                    engine,
                    claim=claim,
                    retry_seconds=retry_seconds,
                    reason="crawl_queue_capacity_limited",
                )
                _record_dispatch(
                    engine,
                    claim=claim,
                    status="deferred",
                    error="crawl_queue_capacity_limited",
                )
                deferred += 1
                continue

            message_id = enqueue_crawl_job(
                tenant_id=claim.tenant_id,
                website_url=claim.website_url,
                job_id=crawl_job_id,
            )
            _record_dispatch(
                engine,
                claim=claim,
                status="enqueued",
                message_id=message_id,
            )
            logger.info(
                "website_crawl_enqueued tenant_id=%s website_url=%s crawl_job_id=%s message_id=%s crawl_kind=%s dispatch_priority=%s scheduled_for=%s",
                claim.tenant_id,
                claim.website_url,
                crawl_job_id,
                message_id,
                claim.crawl_kind,
                claim.dispatch_priority,
                claim.scheduled_for,
            )
            dispatched += 1
        except Exception as exc:
            _defer_claim(
                engine,
                claim=claim,
                retry_seconds=limits.admission_retry_seconds,
                reason="scheduler_enqueue_failed",
            )
            try:
                _record_dispatch(
                    engine,
                    claim=claim,
                    status="failed",
                    error=f"{exc.__class__.__name__}: {exc}",
                )
            except Exception:
                logger.exception(
                    "website_crawl_dispatch_failure_not_audited tenant_id=%s website_url=%s",
                    claim.tenant_id,
                    claim.website_url,
                )
            logger.exception(
                "website_crawl_enqueue_failed tenant_id=%s website_url=%s crawl_job_id=%s crawl_kind=%s error_type=%s error=%s",
                claim.tenant_id,
                claim.website_url,
                crawl_job_id,
                claim.crawl_kind,
                exc.__class__.__name__,
                exc,
            )
            failed += 1

    return SchedulerTickResult(
        dispatched,
        deferred,
        failed,
        daily_budget_remaining,
        limits.tick_seconds,
    )
