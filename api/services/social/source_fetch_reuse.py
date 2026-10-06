"""Reuse one provider response for phrases that send the same search.

Stack Exchange and GitHub do not search a whole buyer phrase: each connector
reduces it to its first two meaningful terms.  A profile's phrases are about
one product, so several of them reduce to the same terms ("invoice approvals
take forever" and "invoice approvals stuck in email" both become "invoice
approvals").  Sending each one spent a request from the tightest allowances in
the pipeline to receive an identical page.

The response is kept only for one source within one scan.  Every phrase still
runs its own admission check against the shared posts, so nothing is admitted
or rejected differently; only the duplicate network request is removed.
"""

from __future__ import annotations

from typing import Any, Hashable

from api.services.integrations.public_source import (
    compact_discovery_search_query,
    env_positive_int,
)

# Bluesky and Lemmy search the full phrase, so their requests rarely repeat.
_COMPACTING_SOURCES = frozenset({"stackexchange", "github"})


def reuses_provider_responses(source: str) -> bool:
    return source.strip().casefold() in _COMPACTING_SOURCES


class SourceFetchReuse:
    """Per-scan memo of provider responses, keyed by the search actually sent."""

    def __init__(self) -> None:
        self._responses: dict[Hashable, list[Any]] = {}
        self.requests_saved = 0

    def search_key(self, source: str, connector: Any, query: str) -> Hashable | None:
        """Identify the provider search for a phrase, or None when unknown.

        A key is returned only when the request can be reconstructed exactly;
        an unfamiliar connector is fetched normally rather than risk serving
        one phrase another phrase's results.
        """

        normalized_source = source.strip().casefold()
        try:
            if normalized_source == "stackexchange":
                site = str(getattr(connector, "site", "") or "").strip()
                terms = str(connector._search_query(query) or "").strip()
                return (normalized_source, site, terms) if site and terms else None
            if normalized_source == "github":
                terms = compact_discovery_search_query(
                    query,
                    max_terms=env_positive_int("ARCLI_GITHUB_DISCOVERY_QUERY_TERMS", 2),
                ).strip()
                repository = str(getattr(connector, "repository", "") or "").strip()
                return (normalized_source, repository.casefold(), terms) if terms else None
        except Exception:
            return None
        return None

    def get(self, key: Hashable | None) -> list[Any] | None:
        if key is None or key not in self._responses:
            return None
        self.requests_saved += 1
        return list(self._responses[key])

    def put(self, key: Hashable | None, posts: list[Any]) -> None:
        if key is not None:
            self._responses[key] = list(posts)


__all__ = ["SourceFetchReuse", "reuses_provider_responses"]
