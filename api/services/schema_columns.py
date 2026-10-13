"""Short-lived, process-local cache of table column metadata.

Workers build their SQL from the columns a deployment actually has, which lets
an additive migration roll out independently of the code that uses it. Reading
``information_schema`` for every row would make that tolerance the most
frequent query on the matching path, so one answer is reused for a bounded time.
"""

from __future__ import annotations

import os
import threading
import time

from sqlalchemy import text
from sqlalchemy.engine import Connection

ColumnMetadata = dict[str, dict[str, str]]

# Long enough to cover every row of a batch, short enough that a migration
# applied to a running worker is picked up without a restart.
DEFAULT_SCHEMA_CACHE_SECONDS = 60.0
_CACHE_SECONDS_ENV = "ARCLI_DB_SCHEMA_CACHE_SECONDS"
_MAX_CACHE_SECONDS = 3_600.0

_cache_lock = threading.Lock()
_cache: dict[tuple[object, str], tuple[float, ColumnMetadata]] = {}


def _cache_seconds() -> float:
    """Read the reuse window; zero or an invalid value disables reuse."""
    raw_value = os.getenv(_CACHE_SECONDS_ENV)
    if raw_value is None:
        return DEFAULT_SCHEMA_CACHE_SECONDS
    try:
        return max(0.0, min(_MAX_CACHE_SECONDS, float(raw_value)))
    except ValueError:
        return DEFAULT_SCHEMA_CACHE_SECONDS


def _copy(columns: ColumnMetadata) -> ColumnMetadata:
    # Callers receive their own mapping so one job can never alter the shared
    # answer another thread is about to build a statement from.
    return {name: dict(metadata) for name, metadata in columns.items()}


def _query_table_columns(conn: Connection, table_name: str) -> ColumnMetadata:
    rows = conn.execute(
        text(
            """
            SELECT column_name, data_type, udt_name
              FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).mappings()

    return {
        str(row["column_name"]): {
            "data_type": str(row["data_type"]),
            "udt_name": str(row["udt_name"]),
        }
        for row in rows
    }


def _cache_key(conn: Connection, table_name: str) -> tuple[object, str] | None:
    """Scope an entry to one database, or opt out when that is unknowable."""
    # Only a real connection has a stable database identity. Anything else
    # (a test double, an adapter) is always queried directly.
    if not isinstance(conn, Connection):
        return None
    try:
        database_identity = conn.engine.url
        hash(database_identity)
    except Exception:
        return None
    return (database_identity, table_name)


def table_columns(conn: Connection, table_name: str) -> ColumnMetadata:
    """Return ``{column: {data_type, udt_name}}`` for a ``public`` table."""
    cache_seconds = _cache_seconds()
    key = _cache_key(conn, table_name) if cache_seconds > 0 else None
    if key is None:
        return _query_table_columns(conn, table_name)

    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(key)
        if cached is not None and cached[0] > now:
            return _copy(cached[1])

    # Query outside the lock: a concurrent duplicate lookup is harmless, while
    # holding the lock across network I/O would serialize every worker thread.
    columns = _query_table_columns(conn, table_name)
    if columns:
        with _cache_lock:
            _cache[key] = (time.monotonic() + cache_seconds, columns)
        return _copy(columns)

    # An absent table is not remembered, so a contract applied a moment later
    # is visible to the very next job.
    with _cache_lock:
        _cache.pop(key, None)
    return columns


def clear_table_columns_cache() -> None:
    """Forget every cached answer (used after a schema change and by tests)."""
    with _cache_lock:
        _cache.clear()
