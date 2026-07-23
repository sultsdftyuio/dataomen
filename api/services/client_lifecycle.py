"""Small, dependency-free lifecycle helpers for short-lived SDK clients."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Callable, Iterator, TypeVar


_ClientT = TypeVar("_ClientT")


def close_network_client(client: Any) -> None:
    """Best-effort close for Supabase and the HTTP clients it owns.

    ``supabase-py`` has changed which nested clients expose ``close`` across
    releases.  Closing every known transport is safe and keeps this boundary
    compatible with the supported MVP range without retaining idle sockets.
    """
    seen: set[int] = set()
    candidates = [client]
    for attribute in ("postgrest", "storage", "functions", "auth", "realtime"):
        nested = getattr(client, attribute, None)
        if nested is not None:
            candidates.append(nested)
            session = getattr(nested, "session", None)
            if session is not None:
                candidates.append(session)

    for candidate in candidates:
        candidate_id = id(candidate)
        if candidate_id in seen:
            continue
        seen.add(candidate_id)
        close = getattr(candidate, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                # Cleanup must never hide the job result or retryable failure.
                continue


@contextmanager
def managed_network_client(factory: Callable[[], _ClientT]) -> Iterator[_ClientT]:
    """Create a client lazily and release its sockets at job completion."""
    client = factory()
    try:
        yield client
    finally:
        close_network_client(client)
