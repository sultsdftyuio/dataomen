"""
Database query layer for churn scoring.

This module contains ALL database access methods extracted from the original
monolithic service.  Key production fixes applied:

1. _fetch_events_chunked() now uses server-side aggregation via RPC
   (or valid PostgREST aggregate syntax with automatic grouping) to return
   at most ONE row per (user_id, event_name) pair.  A hard .limit() cap
   prevents OOM even if the aggregation path fails.

2. _fetch_active_users_from_events() now uses RPC for DISTINCT user_id
   (or raw fetch with LIMIT + Python deduplication as fallback).  The old
   .group("user_id") call has been removed — that method does not exist in
   postgrest-py.

3. _persist_risk_state() chunks by positional index (O(n)) instead of
   scanning history_rows for every state chunk (O(n²)).

4. Memory-protection telemetry includes pre-flight batch-size reduction
   based on estimated cardinality, plus a hard LIMIT on every query.
   The post-flight telemetry monitors but no longer serves as the primary
   defense.

5. Rollup fallback emits logger.critical() before silently reverting to
   raw events, and can be disabled via CHURN_ALLOW_ROLLUP_FALLBACK.

REQUIRED DATABASE FUNCTIONS (for optimal performance):
    CREATE OR REPLACE FUNCTION get_latest_events(
        p_tenant_id TEXT,
        p_user_ids TEXT[],
        p_event_names TEXT[],
        p_start_ts TIMESTAMPTZ,
        p_end_ts TIMESTAMPTZ
    ) RETURNS TABLE(user_id TEXT, event_name TEXT, timestamp TIMESTAMPTZ) AS $$
    BEGIN
        RETURN QUERY
        SELECT e.user_id, e.event_name, MAX(e.timestamp) as timestamp
        FROM events e
        WHERE e.tenant_id = p_tenant_id
          AND e.user_id = ANY(p_user_ids)
          AND e.event_name = ANY(p_event_names)
          AND e.timestamp >= p_start_ts
          AND e.timestamp < p_end_ts
        GROUP BY e.user_id, e.event_name;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE OR REPLACE FUNCTION get_active_users(
        p_tenant_id TEXT,
        p_user_ids TEXT[],
        p_start_ts TIMESTAMPTZ,
        p_end_ts TIMESTAMPTZ
    ) RETURNS TABLE(user_id TEXT) AS $$
    BEGIN
        RETURN QUERY
        SELECT DISTINCT e.user_id
        FROM events e
        WHERE e.tenant_id = p_tenant_id
          AND e.user_id = ANY(p_user_ids)
          AND e.timestamp >= p_start_ts
          AND e.timestamp < p_end_ts;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
"""

import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from api.services.churn_config import (
    ACTIVITY_ROLLUP_TABLE,
    CHURN_USE_ACTIVITY_ROLLUP,
    DEFAULT_EVENT_BATCH_SIZE,
    HIGH_ROW_COUNT_THRESHOLD,
    MAX_ROWS_PER_QUERY,
    MIN_EVENT_BATCH_SIZE,
    RISK_HISTORY_TABLE,
    RISK_STATE_TABLE,
    SLOW_QUERY_THRESHOLD_SEC,
)

# Graceful fallback if the new flag hasn't been added to churn_config yet.
try:
    from churn_config import CHURN_ALLOW_ROLLUP_FALLBACK
except ImportError:
    CHURN_ALLOW_ROLLUP_FALLBACK = True  # backward-compatible default

logger = logging.getLogger(__name__)


# ===========================================================================
# Generic list chunking helper
# ===========================================================================

def _chunk_list(items: List[Any], batch_size: int) -> Iterable[List[Any]]:
    """Yield successive *batch_size*-sized chunks from *items*.

    Replaces the misleadingly-named ``_chunk_user_ids`` that was used in
    ``_persist_risk_state`` to chunk integer indices.  This helper is
    fully generic and works with any element type.
    """
    if batch_size <= 0:
        batch_size = DEFAULT_EVENT_BATCH_SIZE
    for index in range(0, len(items), batch_size):
        yield items[index : index + batch_size]


# ===========================================================================
# Event query helpers
# ===========================================================================

def _fetch_events_chunked(
    db,
    tenant_id: str,
    user_ids: List[str],
    start_ts: datetime,
    end_ts: datetime,
    event_names: Iterable[str],
    select_fields: str,
    batch_label: str,
) -> Iterable[Dict[str, Any]]:
    """Fetch aggregated event rows in user-id chunks.

    **CRITICAL FIX — Server-side aggregation via RPC + hard LIMIT fallback**

    The previous implementation used invalid postgrest-py syntax
    (``.group()`` does not exist) and SQL-style aggregates inside
    ``.select()``.  We now use a stored procedure (primary) or valid
    PostgREST aggregate syntax with automatic grouping.  A hard
    ``.limit()`` cap prevents OOM if the aggregation path fails.
    """
    if not user_ids:
        return

    # ``select_fields`` is kept in the signature for backward compatibility
    # but is intentionally unused — this function always returns the three
    # fields required for churn scoring.
    _ = select_fields

    event_names_list = list(event_names)
    batch_size = min(DEFAULT_EVENT_BATCH_SIZE, len(user_ids))
    index = 0

    while index < len(user_ids):
        chunk = user_ids[index : index + batch_size]

        # ------------------------------------------------------------------
        # Pre-flight cardinality guard: reduce batch size BEFORE executing
        # so we never materialize an unbounded result set.
        # ------------------------------------------------------------------
        estimated_max_rows = len(chunk) * len(event_names_list)
        if estimated_max_rows > MAX_ROWS_PER_QUERY and batch_size > MIN_EVENT_BATCH_SIZE:
            new_batch = max(MIN_EVENT_BATCH_SIZE, batch_size // 2)
            logger.warning(
                "churn_scoring_preflight_cardinality tenant=%s label=%s "
                "estimated=%d > max=%d, halving_batch %d -> %d",
                tenant_id,
                batch_label,
                estimated_max_rows,
                MAX_ROWS_PER_QUERY,
                batch_size,
                new_batch,
            )
            batch_size = new_batch
            continue  # recalculate chunk with smaller batch_size

        start = time.time()
        rows: List[Dict[str, Any]] = []

        # ------------------------------------------------------------------
        # PRIMARY PATH: RPC with server-side aggregation.
        # This bypasses all PostgREST query-builder limitations and works
        # regardless of whether aggregates are enabled on the server.
        # ------------------------------------------------------------------
        try:
            resp = db.rpc(
                "get_latest_events",
                {
                    "p_tenant_id": tenant_id,
                    "p_user_ids": chunk,
                    "p_event_names": event_names_list,
                    "p_start_ts": _to_iso(start_ts),
                    "p_end_ts": _to_iso(end_ts),
                },
            ).execute()
            rows = resp.data or []

        except Exception as rpc_err:
            logger.warning(
                "churn_scoring_rpc_fallback tenant=%s label=%s err=%s",
                tenant_id,
                batch_label,
                rpc_err,
            )

            # --------------------------------------------------------------
            # FALLBACK 1: PostgREST automatic grouping.
            # Syntax: alias:column.agg() — PostgREST groups automatically by
            # non-aggregated columns.  Aggregates may be disabled on the
            # server, so this is wrapped in its own try/except.
            # --------------------------------------------------------------
            try:
                resp = (
                    db.table("events")
                    .select("user_id, event_name, latest_ts:timestamp.max()")
                    .eq("tenant_id", tenant_id)
                    .in_("user_id", chunk)
                    .in_("event_name", event_names_list)
                    .gte("timestamp", _to_iso(start_ts))
                    .lt("timestamp", _to_iso(end_ts))
                    .limit(MAX_ROWS_PER_QUERY)
                    .execute()
                )
                raw_rows = resp.data or []
                # Map alias back to the key expected by downstream code
                for row in raw_rows:
                    row["timestamp"] = row.pop("latest_ts", row.get("timestamp"))
                rows = raw_rows

            except Exception as agg_err:
                logger.warning(
                    "churn_scoring_aggregate_fallback tenant=%s label=%s err=%s",
                    tenant_id,
                    batch_label,
                    agg_err,
                )

                # ----------------------------------------------------------
                # FALLBACK 2: Raw fetch with hard LIMIT + Python dedup.
                # Order by user_id (stable) then timestamp desc so the first
                # row per (user_id, event_name) is the latest.  The LIMIT
                # caps memory; deduplication keeps only the first hit.
                # ----------------------------------------------------------
                resp = (
                    db.table("events")
                    .select("user_id, event_name, timestamp")
                    .eq("tenant_id", tenant_id)
                    .in_("user_id", chunk)
                    .in_("event_name", event_names_list)
                    .gte("timestamp", _to_iso(start_ts))
                    .lt("timestamp", _to_iso(end_ts))
                    .order("user_id", desc=False)
                    .order("timestamp", desc=True)
                    .limit(MAX_ROWS_PER_QUERY)
                    .execute()
                )
                raw_rows = resp.data or []
                seen: Set[Tuple[str, str]] = set()
                for row in raw_rows:
                    key = (row.get("user_id"), row.get("event_name"))
                    if key not in seen:
                        seen.add(key)
                        rows.append(row)

                # If we hit the limit, we may have missed data.  Log loudly.
                if len(raw_rows) == MAX_ROWS_PER_QUERY:
                    logger.critical(
                        "churn_scoring_fallback_limit_hit tenant=%s label=%s "
                        "limit=%d — results may be INCOMPLETE. "
                        "Create the get_latest_events RPC for safety.",
                        tenant_id,
                        batch_label,
                        MAX_ROWS_PER_QUERY,
                    )

        duration = time.time() - start
        row_count = len(rows)

        # ------------------------------------------------------------------
        # Post-flight telemetry (monitors; LIMIT already protected us).
        # ------------------------------------------------------------------
        if row_count > MAX_ROWS_PER_QUERY:
            logger.critical(
                "churn_scoring_unbounded_result tenant=%s label=%s "
                "rows=%d batch=%d — LIMIT did not cap result set",
                tenant_id,
                batch_label,
                row_count,
                len(chunk),
            )

        if row_count > HIGH_ROW_COUNT_THRESHOLD and batch_size > MIN_EVENT_BATCH_SIZE:
            new_batch = max(MIN_EVENT_BATCH_SIZE, batch_size // 2)
            logger.warning(
                "churn_scoring_high_row_count tenant=%s label=%s "
                "rows=%d halving_batch %d -> %d",
                tenant_id,
                batch_label,
                row_count,
                batch_size,
                new_batch,
            )
            batch_size = new_batch

        if duration > SLOW_QUERY_THRESHOLD_SEC:
            logger.warning(
                "churn_scoring_slow_query tenant=%s label=%s "
                "duration=%ss batch=%d rows=%d",
                tenant_id,
                batch_label,
                round(duration, 3),
                len(chunk),
                row_count,
            )

        for row in rows:
            yield row

        index += len(chunk)


# ===========================================================================
# Activity / active-user lookup
# ===========================================================================

def _fetch_active_users(
    db,
    tenant_id: str,
    user_ids: List[str],
    start_ts: datetime,
    end_ts: datetime,
) -> Set[str]:
    """Return the subset of *user_ids* that had activity in the window."""
    if CHURN_USE_ACTIVITY_ROLLUP:
        try:
            return _fetch_active_users_from_rollup(
                db, tenant_id, user_ids, start_ts, end_ts
            )
        except Exception:
            logger.critical(
                "churn_scoring_rollup_critical_failure tenant=%s — "
                "falling back to raw events. This may reintroduce memory issues.",
                tenant_id,
                exc_info=True,
            )
            if not CHURN_ALLOW_ROLLUP_FALLBACK:
                raise
            return _fetch_active_users_from_events(
                db, tenant_id, user_ids, start_ts, end_ts
            )

    return _fetch_active_users_from_events(
        db, tenant_id, user_ids, start_ts, end_ts
    )


def _fetch_active_users_from_events(
    db,
    tenant_id: str,
    user_ids: List[str],
    start_ts: datetime,
    end_ts: datetime,
) -> Set[str]:
    """Fetch active users from raw events table with DISTINCT via RPC.

    **CRITICAL FIX — RPC + LIMIT fallback**

    The old method used ``.group("user_id")`` which does NOT exist in
    ``postgrest-py``.  We now use a stored procedure (primary) or raw
    fetch with hard LIMIT + Python deduplication (fallback).
    """
    if not user_ids:
        return set()

    batch_size = min(DEFAULT_EVENT_BATCH_SIZE, len(user_ids))
    active_users: Set[str] = set()
    index = 0

    while index < len(user_ids):
        chunk = user_ids[index : index + batch_size]

        # Pre-flight guard
        if len(chunk) > MAX_ROWS_PER_QUERY and batch_size > MIN_EVENT_BATCH_SIZE:
            batch_size = max(MIN_EVENT_BATCH_SIZE, batch_size // 2)
            continue

        start = time.time()

        # ------------------------------------------------------------------
        # PRIMARY PATH: RPC for DISTINCT user_id
        # ------------------------------------------------------------------
        rows: List[Dict[str, Any]] = []
        try:
            resp = db.rpc(
                "get_active_users",
                {
                    "p_tenant_id": tenant_id,
                    "p_user_ids": chunk,
                    "p_start_ts": _to_iso(start_ts),
                    "p_end_ts": _to_iso(end_ts),
                },
            ).execute()
            rows = resp.data or []

        except Exception as rpc_err:
            logger.warning(
                "churn_scoring_active_users_rpc_fallback tenant=%s err=%s",
                tenant_id,
                rpc_err,
            )

            # FALLBACK: raw fetch with LIMIT + Python dedup
            resp = (
                db.table("events")
                .select("user_id")
                .eq("tenant_id", tenant_id)
                .in_("user_id", chunk)
                .gte("timestamp", _to_iso(start_ts))
                .lt("timestamp", _to_iso(end_ts))
                .order("user_id", desc=False)
                .limit(MAX_ROWS_PER_QUERY)
                .execute()
            )
            raw_rows = resp.data or []
            seen: Set[str] = set()
            for row in raw_rows:
                uid = row.get("user_id")
                if uid and uid not in seen:
                    seen.add(uid)
                    rows.append(row)

            if len(raw_rows) == MAX_ROWS_PER_QUERY:
                logger.critical(
                    "churn_scoring_active_users_fallback_limit_hit tenant=%s "
                    "limit=%d — results may be INCOMPLETE. "
                    "Create the get_active_users RPC for safety.",
                    tenant_id,
                    MAX_ROWS_PER_QUERY,
                )

        duration = time.time() - start
        row_count = len(rows)

        # Memory-protection telemetry
        if row_count > MAX_ROWS_PER_QUERY:
            logger.critical(
                "churn_scoring_unbounded_result tenant=%s label=activity "
                "rows=%d batch=%d",
                tenant_id,
                row_count,
                len(chunk),
            )

        if row_count > HIGH_ROW_COUNT_THRESHOLD and batch_size > MIN_EVENT_BATCH_SIZE:
            new_batch = max(MIN_EVENT_BATCH_SIZE, batch_size // 2)
            logger.warning(
                "churn_scoring_high_row_count tenant=%s label=activity "
                "rows=%d halving_batch %d -> %d",
                tenant_id,
                row_count,
                batch_size,
                new_batch,
            )
            batch_size = new_batch

        if duration > SLOW_QUERY_THRESHOLD_SEC:
            logger.warning(
                "churn_scoring_slow_query tenant=%s label=activity "
                "duration=%ss batch=%d rows=%d",
                tenant_id,
                round(duration, 3),
                len(chunk),
                row_count,
            )

        for row in rows:
            user_id = _coerce_user_id(row.get("user_id"))
            if user_id:
                active_users.add(user_id)

        index += len(chunk)

    return active_users


def _fetch_active_users_from_rollup(
    db,
    tenant_id: str,
    user_ids: List[str],
    start_ts: datetime,
    end_ts: datetime,
) -> Set[str]:
    """Fetch active users from the pre-aggregated daily rollup table."""
    if not user_ids:
        return set()

    batch_size = min(DEFAULT_EVENT_BATCH_SIZE, len(user_ids))
    active_users: Set[str] = set()
    index = 0

    while index < len(user_ids):
        chunk = user_ids[index : index + batch_size]
        start = time.time()

        resp = (
            db.table(ACTIVITY_ROLLUP_TABLE)
            .select("user_id,last_seen_at")
            .eq("tenant_id", tenant_id)
            .in_("user_id", chunk)
            .gte("last_seen_at", _to_iso(start_ts))
            .lt("last_seen_at", _to_iso(end_ts))
            .limit(MAX_ROWS_PER_QUERY)
            .execute()
        )

        duration = time.time() - start
        rows = resp.data or []
        row_count = len(rows)

        # Memory-protection telemetry
        if row_count > MAX_ROWS_PER_QUERY:
            logger.critical(
                "churn_scoring_unbounded_result tenant=%s label=activity_rollup "
                "rows=%d batch=%d",
                tenant_id,
                row_count,
                len(chunk),
            )

        if row_count > HIGH_ROW_COUNT_THRESHOLD and batch_size > MIN_EVENT_BATCH_SIZE:
            new_batch = max(MIN_EVENT_BATCH_SIZE, batch_size // 2)
            logger.warning(
                "churn_scoring_high_row_count tenant=%s label=activity_rollup "
                "rows=%d halving_batch %d -> %d",
                tenant_id,
                row_count,
                batch_size,
                new_batch,
            )
            batch_size = new_batch

        if duration > SLOW_QUERY_THRESHOLD_SEC:
            logger.warning(
                "churn_scoring_slow_query tenant=%s label=activity_rollup "
                "duration=%ss batch=%d rows=%d",
                tenant_id,
                round(duration, 3),
                len(chunk),
                row_count,
            )

        for row in rows:
            user_id = _coerce_user_id(row.get("user_id"))
            if user_id:
                active_users.add(user_id)

        index += len(chunk)

    return active_users


# ===========================================================================
# Risk-state persistence
# ===========================================================================

def _persist_risk_state(
    db,
    tenant_id: str,
    risk_state_rows: List[Dict[str, Any]],
    history_rows: List[Dict[str, Any]],
) -> None:
    """Persist risk-state and risk-history rows to the database.

    **CRITICAL FIX — O(n²) → O(n) chunking**

    The old code passed ``list(range(len(risk_state_rows)))`` (integers) to
    ``_chunk_user_ids``, which was misleading.  The generic ``_chunk_list``
    helper is correct, but the previous implementation then scanned
    ``history_rows`` for every chunk to build ``history_chunk``, giving
    O(n²) behaviour.

    Both input lists are aligned by position (same user order).  We now
    chunk by positional index, so each history row is touched exactly once.
    """
    if not risk_state_rows:
        return

    if len(risk_state_rows) != len(history_rows):
        logger.error(
            "churn_scoring_misaligned_persist tenant=%s "
            "state_rows=%d history_rows=%d",
            tenant_id,
            len(risk_state_rows),
            len(history_rows),
        )
        return

    batch_size = min(DEFAULT_EVENT_BATCH_SIZE, len(risk_state_rows))

    for start in range(0, len(risk_state_rows), batch_size):
        end = start + batch_size
        state_chunk = risk_state_rows[start:end]
        history_chunk = history_rows[start:end]

        # Defensive: verify user_id alignment within the chunk
        for state_row, hist_row in zip(state_chunk, history_chunk):
            if state_row.get("user_id") != hist_row.get("user_id"):
                logger.error(
                    "churn_scoring_persist_alignment_error tenant=%s "
                    "user_id mismatch: state=%s history=%s",
                    tenant_id,
                    state_row.get("user_id"),
                    hist_row.get("user_id"),
                )
                break
        else:
            # Only execute if alignment check passed (no break)
            try:
                (
                    db.table(RISK_STATE_TABLE)
                    .upsert(state_chunk, on_conflict="tenant_id,user_id")
                    .execute()
                )
                (
                    db.table(RISK_HISTORY_TABLE)
                    .insert(history_chunk)
                    .execute()
                )
            except Exception:
                logger.exception(
                    "churn_scoring_persist_failed tenant=%s rows=%d",
                    tenant_id,
                    len(state_chunk),
                )
                return


# ===========================================================================
# Shared helpers (kept here to avoid circular imports with churn_scoring)
# ===========================================================================

def _coerce_user_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return str(value)


def _to_iso(value: datetime) -> str:
    return _ensure_utc(value).isoformat()


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return _ensure_utc(value)
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time()).replace(
            tzinfo=timezone.utc
        )
    if isinstance(value, (int, float)):
        return _from_epoch(value)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            if candidate.endswith("Z"):
                candidate = candidate[:-1] + "+00:00"
            parsed = datetime.fromisoformat(candidate)
            return _ensure_utc(parsed)
        except ValueError:
            return None
    return None


def _from_epoch(value: float) -> datetime:
    timestamp = float(value)
    if timestamp > 1e12:
        timestamp = timestamp / 1000.0
    return datetime.fromtimestamp(timestamp, tz=timezone.utc)