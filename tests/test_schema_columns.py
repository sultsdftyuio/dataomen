"""Coverage for the short-lived table column cache."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.engine import Connection

from api.services import schema_columns


@pytest.fixture(autouse=True)
def _empty_cache():
    schema_columns.clear_table_columns_cache()
    yield
    schema_columns.clear_table_columns_cache()


def _connection(rows: list[dict[str, str]], *, database: str = "postgresql://primary"):
    """Build a connection double that SQLAlchemy code treats as a real one."""
    conn = MagicMock(spec=Connection)
    conn.engine = SimpleNamespace(url=database)
    conn.execute.return_value.mappings.return_value = rows
    return conn


SOURCE_POST_ROWS = [
    {"column_name": "id", "data_type": "uuid", "udt_name": "uuid"},
    {"column_name": "metadata", "data_type": "jsonb", "udt_name": "jsonb"},
]


def test_repeated_lookups_reuse_one_query() -> None:
    conn = _connection(SOURCE_POST_ROWS)

    first = schema_columns.table_columns(conn, "source_posts")
    second = schema_columns.table_columns(conn, "source_posts")

    assert first == second == {
        "id": {"data_type": "uuid", "udt_name": "uuid"},
        "metadata": {"data_type": "jsonb", "udt_name": "jsonb"},
    }
    assert conn.execute.call_count == 1


def test_each_table_and_database_has_its_own_entry() -> None:
    primary = _connection(SOURCE_POST_ROWS)
    replica = _connection(SOURCE_POST_ROWS, database="postgresql://replica")

    schema_columns.table_columns(primary, "source_posts")
    schema_columns.table_columns(primary, "lead_matches")
    schema_columns.table_columns(replica, "source_posts")

    assert primary.execute.call_count == 2
    assert replica.execute.call_count == 1


def test_a_caller_cannot_alter_the_shared_answer() -> None:
    conn = _connection(SOURCE_POST_ROWS)

    first = schema_columns.table_columns(conn, "source_posts")
    first["metadata"]["data_type"] = "text"
    first.pop("id")

    assert schema_columns.table_columns(conn, "source_posts") == {
        "id": {"data_type": "uuid", "udt_name": "uuid"},
        "metadata": {"data_type": "jsonb", "udt_name": "jsonb"},
    }


def test_an_entry_expires_so_a_migration_becomes_visible() -> None:
    conn = _connection(SOURCE_POST_ROWS)

    with patch.object(schema_columns.time, "monotonic", return_value=1_000.0):
        schema_columns.table_columns(conn, "source_posts")
    with patch.object(schema_columns.time, "monotonic", return_value=1_059.0):
        schema_columns.table_columns(conn, "source_posts")
    assert conn.execute.call_count == 1

    conn.execute.return_value.mappings.return_value = [
        *SOURCE_POST_ROWS,
        {"column_name": "language", "data_type": "text", "udt_name": "text"},
    ]
    with patch.object(schema_columns.time, "monotonic", return_value=1_061.0):
        refreshed = schema_columns.table_columns(conn, "source_posts")

    assert conn.execute.call_count == 2
    assert "language" in refreshed


def test_a_missing_table_is_checked_again_on_the_next_call() -> None:
    conn = _connection([])

    assert schema_columns.table_columns(conn, "discovery_evidence") == {}
    assert schema_columns.table_columns(conn, "discovery_evidence") == {}

    assert conn.execute.call_count == 2


def test_reuse_can_be_disabled(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_DB_SCHEMA_CACHE_SECONDS", "0")
    conn = _connection(SOURCE_POST_ROWS)

    schema_columns.table_columns(conn, "source_posts")
    schema_columns.table_columns(conn, "source_posts")

    assert conn.execute.call_count == 2


def test_an_invalid_window_falls_back_to_the_default(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_DB_SCHEMA_CACHE_SECONDS", "soon")
    conn = _connection(SOURCE_POST_ROWS)

    schema_columns.table_columns(conn, "source_posts")
    schema_columns.table_columns(conn, "source_posts")

    assert conn.execute.call_count == 1


def test_a_connection_double_is_never_cached() -> None:
    class ScriptedConnection:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, *_args: object, **_kwargs: object):
            self.calls += 1
            return SimpleNamespace(mappings=lambda: SOURCE_POST_ROWS)

    conn = ScriptedConnection()

    schema_columns.table_columns(conn, "source_posts")  # type: ignore[arg-type]
    schema_columns.table_columns(conn, "source_posts")  # type: ignore[arg-type]

    assert conn.calls == 2
