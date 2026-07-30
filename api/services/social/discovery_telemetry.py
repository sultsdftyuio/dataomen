"""Best-effort, tenant-scoped telemetry for public-source discovery runs.

This module deliberately has no dependency on the ingestion actor.  Callers can
use it around discovery work once ``scripts/prospect_intelligence_contract.sql``
has been applied.  Every public function is fail-open: telemetry is useful, but
it must never make a customer's discovery job fail or retry.

The stored query plan is a tenant-owned report artifact and therefore retains
the bounded buyer-language phrases.  Per-event rows store only a stable SHA-256
hash of a phrase.  Event details and completion summaries are scrubbed so they
remain operational metadata rather than source-post or customer content.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
import time
from collections.abc import Mapping, Sequence
from functools import lru_cache
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


logger = logging.getLogger(__name__)


_MAX_QUERY_PLAN_QUERIES = 24
_MAX_QUERY_PLAN_PHRASE_CHARS = 500
_MAX_IDENTIFIER_CHARS = 96
_MAX_SAFE_DETAIL_DEPTH = 4
_MAX_SAFE_DETAIL_FIELDS = 40
_MAX_SAFE_DETAIL_ITEMS = 40
_MAX_SAFE_STRING_CHARS = 240
_MISSING_SCHEMA_COOLDOWN_SECONDS = 300.0
_FAILURE_COOLDOWN_SECONDS = 30.0

_COMPLETION_STATUSES = frozenset(
    {"completed", "partial", "failed", "cancelled", "skipped"}
)
_DISCOVERY_RUN_KINDS = frozenset(
    {"opportunity_leads", "buyer_language_research"}
)
_SENSITIVE_DETAIL_KEYS = frozenset(
    {
        "api_key",
        "authorization",
        "author",
        "body",
        "content",
        "cookie",
        "email",
        "message",
        "password",
        "phrase",
        "post",
        "prompt",
        "query",
        "response",
        "secret",
        "source_post_data",
        "source_post_json",
        "source_post",
        "text",
        "title",
        "token",
        "url",
        "website",
    }
)
_SAFE_STRING_DETAIL_KEYS = frozenset(
    {
        "cache_status",
        "error_code",
        "error_type",
        "model",
        "outcome",
        "phase",
        "provider",
        "reason",
        "reason_code",
        "skip_reason",
        "source",
        "stage",
        "status",
    }
)

_telemetry_state_lock = threading.Lock()
_telemetry_unavailable_until = 0.0
_telemetry_last_warning_at = 0.0


def _normalize_database_url(raw_url: str) -> str:
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql://", 1)
    return raw_url


@lru_cache(maxsize=1)
def _database_engine() -> Engine:
    """Create a deliberately small, bounded connection pool for telemetry."""

    database_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("SUPABASE_DB_URL")
        or os.getenv("POSTGRES_URL")
        or ""
    ).strip()
    if not database_url:
        raise RuntimeError("No database URL is configured for discovery telemetry.")

    normalized_url = _normalize_database_url(database_url)
    engine_options: dict[str, Any] = {
        "pool_pre_ping": True,
        "pool_size": 1,
        "max_overflow": 0,
        "pool_timeout": 1,
        "pool_recycle": 300,
    }
    if normalized_url.startswith("postgresql"):
        # psycopg accepts this option and it bounds an unavailable database
        # without applying it to non-Postgres test engines.
        engine_options["connect_args"] = {"connect_timeout": 3}

    return create_engine(normalized_url, **engine_options)


def _telemetry_enabled() -> bool:
    value = os.getenv("ARCLI_DISCOVERY_TELEMETRY_ENABLED", "true").strip().lower()
    return value not in {"0", "false", "no", "off"}


def _in_cooldown() -> bool:
    with _telemetry_state_lock:
        return time.monotonic() < _telemetry_unavailable_until


def _is_missing_schema_error(error: BaseException) -> bool:
    original = getattr(error, "orig", error)
    sqlstate = getattr(original, "pgcode", None) or getattr(original, "sqlstate", None)
    if sqlstate in {"3F000", "42P01", "42703"}:
        return True

    message = str(original).lower()
    return any(
        marker in message
        for marker in (
            "discovery_runs",
            "discovery_run_events",
            "relation does not exist",
            "undefined table",
            "undefined column",
        )
    )


def _record_telemetry_failure(operation: str, error: Exception) -> None:
    """Open a short circuit after failures; never expose query/content in logs."""

    global _telemetry_unavailable_until, _telemetry_last_warning_at

    now = time.monotonic()
    schema_missing = _is_missing_schema_error(error)
    cooldown = (
        _MISSING_SCHEMA_COOLDOWN_SECONDS if schema_missing else _FAILURE_COOLDOWN_SECONDS
    )
    should_warn = False
    with _telemetry_state_lock:
        _telemetry_unavailable_until = max(_telemetry_unavailable_until, now + cooldown)
        if now >= _telemetry_last_warning_at + cooldown:
            _telemetry_last_warning_at = now
            should_warn = True

    if should_warn:
        logger.warning(
            "discovery_telemetry_skipped operation=%s reason=%s error_type=%s retry_after_seconds=%s",
            operation,
            "schema_unavailable" if schema_missing else "storage_unavailable",
            type(error).__name__,
            int(cooldown),
        )


def _bounded_text(value: Any, *, maximum: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:maximum]


def _normalized_identifier(value: Any) -> str | None:
    normalized = _bounded_text(value, maximum=_MAX_IDENTIFIER_CHARS).lower()
    return normalized or None


def _tenant_value(tenant_id: str | None) -> str | None:
    # Tenant IDs are TEXT in the existing schema, even though production
    # callers normally use UUID-shaped values.  Do not cast them to UUID here.
    value = _bounded_text(tenant_id, maximum=_MAX_IDENTIFIER_CHARS)
    return value or None


def _uuid_value(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(UUID(str(value).strip()))
    except (TypeError, ValueError, AttributeError):
        return None


def _query_hash(query: str) -> str:
    normalized = re.sub(r"\s+", " ", query).strip().casefold()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _event_key(
    explicit_key: str | None,
    *,
    source: str,
    query_type: str,
    query_hash: str,
    phase: str,
    outcome: str,
    details: Mapping[str, Any],
) -> str:
    """Return a bounded retry-dedupe key without retaining the raw phrase."""

    normalized_explicit_key = _bounded_text(explicit_key, maximum=512)
    if normalized_explicit_key:
        # A caller may accidentally pass a phrase as a key.  Hash even explicit
        # values so an idempotence convenience cannot become a content channel.
        return hashlib.sha256(normalized_explicit_key.encode("utf-8")).hexdigest()

    digest_input = json.dumps(
        {
            "source": source,
            "query_type": query_type,
            "query_hash": query_hash,
            "phase": phase,
            "outcome": outcome,
            "details": details,
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(digest_input.encode("utf-8")).hexdigest()


def _value_from_query_item(item: Any, *names: str) -> Any:
    if isinstance(item, Mapping):
        for name in names:
            if item.get(name) is not None:
                return item[name]
        return None
    for name in names:
        value = getattr(item, name, None)
        if value is not None:
            return value
    return None


def _plan_query_items(query_plan: Any) -> Sequence[Any]:
    if isinstance(query_plan, Mapping):
        for key in ("queries", "query_plan", "discovery_queries"):
            value = query_plan.get(key)
            if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
                return value
        return ()

    value = getattr(query_plan, "queries", query_plan)
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return value
    if isinstance(value, str):
        return (value,)
    return ()


def _safe_query_plan(query_plan: Any) -> dict[str, Any]:
    """Persist only the bounded, tenant-owned discovery phrases and types."""

    queries: list[dict[str, str]] = []
    for item in _plan_query_items(query_plan)[:_MAX_QUERY_PLAN_QUERIES]:
        if isinstance(item, str):
            phrase = _bounded_text(item, maximum=_MAX_QUERY_PLAN_PHRASE_CHARS)
            query_type = "unspecified"
        else:
            phrase = _bounded_text(
                _value_from_query_item(item, "phrase", "query", "term"),
                maximum=_MAX_QUERY_PLAN_PHRASE_CHARS,
            )
            query_type = _normalized_identifier(
                _value_from_query_item(item, "query_type", "type", "intent")
            ) or "unspecified"
        if phrase:
            queries.append({"query_type": query_type, "phrase": phrase})

    return {
        "version": 1,
        "query_count": len(queries),
        "query_types": sorted({query["query_type"] for query in queries}),
        "queries": queries,
    }


def _scrub_value(value: Any, *, key: str = "", depth: int = 0) -> Any:
    """Keep operational metadata while excluding raw customer/source content."""

    if key.casefold() in _SENSITIVE_DETAIL_KEYS:
        return "[redacted]"
    if depth >= _MAX_SAFE_DETAIL_DEPTH:
        return "[truncated]"
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return value if value == value and value not in {float("inf"), float("-inf")} else None
    if isinstance(value, str):
        normalized = _bounded_text(value, maximum=_MAX_SAFE_STRING_CHARS)
        if (
            key.casefold() in _SAFE_STRING_DETAIL_KEYS
            and re.fullmatch(r"[A-Za-z0-9_.:/-]{1,120}", normalized)
        ):
            return normalized
        return {
            "sha256": hashlib.sha256(normalized.encode("utf-8")).hexdigest(),
            "length": len(value),
        }
    if isinstance(value, Mapping):
        scrubbed: dict[str, Any] = {}
        for raw_key, child in list(value.items())[:_MAX_SAFE_DETAIL_FIELDS]:
            safe_key = _bounded_text(raw_key, maximum=_MAX_IDENTIFIER_CHARS).casefold()
            if safe_key:
                scrubbed[safe_key] = _scrub_value(child, key=safe_key, depth=depth + 1)
        return scrubbed
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        return [
            _scrub_value(item, key=key, depth=depth + 1)
            for item in list(value)[:_MAX_SAFE_DETAIL_ITEMS]
        ]
    return {"type": type(value).__name__}


def _safe_metadata(value: Mapping[str, Any] | None) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        return {}
    scrubbed = _scrub_value(value)
    return scrubbed if isinstance(scrubbed, dict) else {}


def _json_value(value: Mapping[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def create_discovery_run(
    tenant_id: str,
    service_profile_id: str | None,
    query_plan: Any,
    *,
    run_kind: str = "opportunity_leads",
) -> str | None:
    """Create one tenant-owned discovery-run report, or return ``None`` safely.

    A profile must belong to ``tenant_id``.  The SQL predicate repeats that
    ownership check even though the database contract also enforces it with a
    composite foreign key and trigger.
    """

    tenant = _tenant_value(tenant_id)
    profile_id = _uuid_value(service_profile_id)
    normalized_run_kind = _normalized_identifier(run_kind)
    if (
        not tenant
        or not profile_id
        or normalized_run_kind not in _DISCOVERY_RUN_KINDS
        or not _telemetry_enabled()
        or _in_cooldown()
    ):
        return None

    run_id = str(uuid4())
    # `run_kind` is introduced by the optional research migration. Preserve
    # normal opportunity telemetry during a staggered rollout by relying on
    # its old-schema/default value; the new research mode explicitly writes
    # its discriminator and therefore fails closed until that migration is
    # present.
    if normalized_run_kind == "opportunity_leads":
        insert_statement = """
            INSERT INTO public.discovery_runs (
                id,
                tenant_id,
                service_profile_id,
                query_plan,
                status,
                started_at
            )
            SELECT
                CAST(:run_id AS uuid),
                :tenant_id,
                CAST(:service_profile_id AS uuid),
                CAST(:query_plan AS jsonb),
                'running',
                NOW()
            WHERE EXISTS (
                SELECT 1
                  FROM public.service_profiles AS profile
                 WHERE profile.id = CAST(:service_profile_id AS uuid)
                   AND profile.tenant_id = :tenant_id
            )
            RETURNING id
        """
        insert_params = {
            "run_id": run_id,
            "tenant_id": tenant,
            "service_profile_id": profile_id,
            "query_plan": _json_value(_safe_query_plan(query_plan)),
        }
    else:
        insert_statement = """
            INSERT INTO public.discovery_runs (
                id,
                tenant_id,
                service_profile_id,
                run_kind,
                query_plan,
                status,
                started_at
            )
            SELECT
                CAST(:run_id AS uuid),
                :tenant_id,
                CAST(:service_profile_id AS uuid),
                :run_kind,
                CAST(:query_plan AS jsonb),
                'running',
                NOW()
            WHERE EXISTS (
                SELECT 1
                  FROM public.service_profiles AS profile
                 WHERE profile.id = CAST(:service_profile_id AS uuid)
                   AND profile.tenant_id = :tenant_id
            )
            RETURNING id
        """
        insert_params = {
            "run_id": run_id,
            "tenant_id": tenant,
            "service_profile_id": profile_id,
            "run_kind": normalized_run_kind,
            "query_plan": _json_value(_safe_query_plan(query_plan)),
        }
    try:
        with _database_engine().begin() as conn:
            result = conn.execute(
                text(insert_statement),
                insert_params,
            )
            persisted_id = result.scalar_one_or_none()
            return str(persisted_id) if persisted_id is not None else None
    except Exception as error:  # Telemetry is intentionally non-blocking.
        _record_telemetry_failure("create_run", error)
        return None


def create_buyer_language_research_run(
    tenant_id: str,
    service_profile_id: str | None,
    query_plan: Any,
) -> str | None:
    """Create a tenant-owned research run that is isolated from lead discovery.

    The SQL contract constrains ``run_kind`` and the evidence table accepts
    only this kind of run.  Keeping this small explicit wrapper makes it hard
    for a future caller to accidentally attach research evidence to the
    opportunity-lead pipeline.
    """

    return create_discovery_run(
        tenant_id,
        service_profile_id,
        query_plan,
        run_kind="buyer_language_research",
    )


def record_discovery_event(
    run_id: str | None,
    tenant_id: str,
    source: str,
    query_type: str,
    query: str,
    phase: str,
    outcome: str,
    details: Mapping[str, Any] | None = None,
    event_key: str | None = None,
) -> None:
    """Append a tenant-scoped event without persisting the raw query phrase."""

    run = _uuid_value(run_id)
    tenant = _tenant_value(tenant_id)
    normalized_source = _normalized_identifier(source)
    normalized_query_type = _normalized_identifier(query_type)
    normalized_phase = _normalized_identifier(phase)
    normalized_outcome = _normalized_identifier(outcome)
    normalized_query = _bounded_text(query, maximum=_MAX_QUERY_PLAN_PHRASE_CHARS)
    if (
        not run
        or not tenant
        or not normalized_source
        or not normalized_query_type
        or not normalized_phase
        or not normalized_outcome
        or not normalized_query
        or not _telemetry_enabled()
        or _in_cooldown()
    ):
        return

    safe_details = _safe_metadata(details)
    hashed_query = _query_hash(normalized_query)
    dedupe_key = _event_key(
        event_key,
        source=normalized_source,
        query_type=normalized_query_type,
        query_hash=hashed_query,
        phase=normalized_phase,
        outcome=normalized_outcome,
        details=safe_details,
    )
    try:
        with _database_engine().begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO public.discovery_run_events (
                        tenant_id,
                        run_id,
                        source,
                        query_type,
                        query_hash,
                        event_key,
                        phase,
                        outcome,
                        details
                    )
                    SELECT
                        :tenant_id,
                        CAST(:run_id AS uuid),
                        :source,
                        :query_type,
                        :query_hash,
                        :event_key,
                        :phase,
                        :outcome,
                        CAST(:details AS jsonb)
                    WHERE EXISTS (
                        SELECT 1
                          FROM public.discovery_runs AS run
                         WHERE run.id = CAST(:run_id AS uuid)
                           AND run.tenant_id = :tenant_id
                    )
                    ON CONFLICT (tenant_id, run_id, event_key) DO NOTHING
                    """
                ),
                {
                    "tenant_id": tenant,
                    "run_id": run,
                    "source": normalized_source,
                    "query_type": normalized_query_type,
                    "query_hash": hashed_query,
                    "event_key": dedupe_key,
                    "phase": normalized_phase,
                    "outcome": normalized_outcome,
                    "details": _json_value(safe_details),
                },
            )
    except Exception as error:  # Telemetry must not fail the ingestion job.
        _record_telemetry_failure("record_event", error)


def complete_discovery_run(
    run_id: str | None,
    tenant_id: str,
    status: str,
    summary: Mapping[str, Any] | None = None,
) -> None:
    """Close a run with a sanitized aggregate summary, scoped by tenant ID."""

    run = _uuid_value(run_id)
    tenant = _tenant_value(tenant_id)
    normalized_status = _normalized_identifier(status)
    if (
        not run
        or not tenant
        or normalized_status not in _COMPLETION_STATUSES
        or not _telemetry_enabled()
        or _in_cooldown()
    ):
        return

    try:
        with _database_engine().begin() as conn:
            conn.execute(
                text(
                    """
                    UPDATE public.discovery_runs
                       SET status = :status,
                           -- Discovery phases complete independently. Merge
                           -- their top-level diagnostics rather than letting
                           -- a final X fallback erase HN/free-source coverage;
                           -- `sources` receives a shallow per-source merge.
                           summary = jsonb_set(
                               COALESCE(summary, '{}'::jsonb)
                               || (CAST(:summary AS jsonb) - 'sources'),
                               '{sources}',
                               COALESCE(summary->'sources', '{}'::jsonb)
                               || COALESCE(CAST(:summary AS jsonb)->'sources', '{}'::jsonb),
                               true
                           ),
                           completed_at = NOW(),
                           updated_at = NOW()
                     WHERE id = CAST(:run_id AS uuid)
                       AND tenant_id = :tenant_id
                    """
                ),
                {
                    "run_id": run,
                    "tenant_id": tenant,
                    "status": normalized_status,
                    "summary": _json_value(_safe_metadata(summary)),
                },
            )
    except Exception as error:  # Telemetry must not fail the ingestion job.
        _record_telemetry_failure("complete_run", error)


__all__ = [
    "complete_discovery_run",
    "create_buyer_language_research_run",
    "create_discovery_run",
    "record_discovery_event",
]
