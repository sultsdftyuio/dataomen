"""Driver-level connection settings shared by every backend database engine."""

from __future__ import annotations

from typing import Any

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError, NoSuchModuleError

_PSYCOPG3_DRIVERS = frozenset({"psycopg", "psycopg_async"})


def _uses_psycopg3(database_url: str) -> bool:
    # Resolve the dialect rather than reading the URL's driver suffix: a bare
    # ``postgresql://`` URL means psycopg2 on SQLAlchemy 2.0 but Psycopg 3 on
    # 2.1+, so the suffix alone cannot say which driver will connect.
    try:
        return make_url(database_url).get_dialect().driver in _PSYCOPG3_DRIVERS
    except (ArgumentError, NoSuchModuleError):
        return False


def postgres_connect_args(database_url: str, **connect_args: Any) -> dict[str, Any]:
    """Return ``connect_args`` that are safe behind a transaction-mode pooler.

    Psycopg 3 promotes a statement to a server-side prepared statement after a
    few executions. The hosted pooler hands each transaction a different
    backend session, so that named statement is missing, or belongs to another
    query, on the next checkout and the execute fails with a protocol error.
    Disabling preparation costs a re-parse per query, which is negligible next
    to the network round trip. Psycopg 2 rejects the option, so it is only
    added for the Psycopg 3 driver.
    """
    if not _uses_psycopg3(database_url):
        return dict(connect_args)
    return {**connect_args, "prepare_threshold": None}
