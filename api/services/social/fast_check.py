"""Parallel public-source collection for an initial lead discovery check.

Each provider keeps its own bounded, sequential query loop so its own rate
limits are respected.  Providers run beside one another, allowing the caller
to hand new posts to matching as soon as one source has completed without
marking the overall discovery run complete early.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Callable, Sequence


@dataclass(frozen=True)
class FastCheckQueryOutcome:
    source: str
    query_type: str
    query: str
    outcome: str
    hits_found: int = 0
    plausible_hits: int = 0
    inserted_count: int = 0
    error_type: str | None = None
    status_code: int | None = None


@dataclass(frozen=True)
class FastCheckSourceResult:
    source: str
    query_outcomes: tuple[FastCheckQueryOutcome, ...]
    source_post_refs: tuple[Any, ...] = ()

    @property
    def hits_found(self) -> int:
        return sum(item.hits_found for item in self.query_outcomes)

    @property
    def plausible_hits(self) -> int:
        return sum(item.plausible_hits for item in self.query_outcomes)

    @property
    def inserted_count(self) -> int:
        return sum(item.inserted_count for item in self.query_outcomes)

    @property
    def plausible_query_types(self) -> set[str]:
        return {
            item.query_type
            for item in self.query_outcomes
            if item.plausible_hits > 0 and item.query_type
        }

    @property
    def failed(self) -> bool:
        return any(item.outcome == "failed" for item in self.query_outcomes)


def _source_post_ref_key(ref: Any) -> tuple[str, str] | None:
    source = str(getattr(ref, "source", "") or "").strip()
    source_post_id = str(getattr(ref, "source_post_id", "") or "").strip()
    return (source, source_post_id) if source and source_post_id else None


def _keep_higher_priority_ref(refs: dict[tuple[str, str], Any], ref: Any) -> None:
    """Preserve the strongest signal when a post matched several query phrases."""

    key = _source_post_ref_key(ref)
    if not key:
        return
    previous = refs.get(key)
    if previous is None or int(getattr(ref, "lead_signal_score", 0) or 0) > int(
        getattr(previous, "lead_signal_score", 0) or 0
    ):
        refs[key] = ref


def _source_result_for_hackernews(
    queries: Sequence[dict[str, str]],
    *,
    since_hours_ago: int,
    posts_per_query: int,
) -> FastCheckSourceResult:
    # Import at call time: social_ingestion remains the compatibility facade
    # used by deployments and existing test patches.
    from api.services.social_ingestion import _result_source_post_refs, ingest_hn_posts

    outcomes: list[FastCheckQueryOutcome] = []
    refs: dict[tuple[str, str], Any] = {}
    for query in queries:
        try:
            result = ingest_hn_posts(
                query=query["phrase"],
                since_hours_ago=since_hours_ago,
                posts_per_query=posts_per_query,
                query_type=query["query_type"],
            )
        except Exception as exc:
            response = getattr(exc, "response", None)
            status_code = getattr(response, "status_code", None)
            outcomes.append(
                FastCheckQueryOutcome(
                    source="hackernews",
                    query_type=query["query_type"],
                    query=query["phrase"],
                    outcome="failed",
                    error_type=exc.__class__.__name__,
                    status_code=status_code if isinstance(status_code, int) else None,
                )
            )
            # A provider-level failure will affect the remaining HN phrases;
            # stop rather than spend through a known bad source.
            break

        outcomes.append(
            FastCheckQueryOutcome(
                source="hackernews",
                query_type=query["query_type"],
                query=query["phrase"],
                outcome="completed",
                hits_found=max(0, int(result.hits_found)),
                plausible_hits=max(0, int(result.plausible_hits)),
                inserted_count=max(0, int(result.inserted_count)),
            )
        )
        for ref in _result_source_post_refs(result, source="hackernews"):
            _keep_higher_priority_ref(refs, ref)

    return FastCheckSourceResult(
        source="hackernews",
        query_outcomes=tuple(outcomes),
        source_post_refs=tuple(refs.values()),
    )


def _source_result_for_additional_source(
    source: str,
    queries: Sequence[dict[str, str]],
    *,
    since_hours_ago: int,
    posts_per_query: int,
) -> FastCheckSourceResult:
    from api.services.social_ingestion import (
        additional_public_source_cache_scope,
        additional_public_source_supports_discovery_query,
        claim_additional_public_source_query,
        ingest_additional_public_source_posts,
        release_additional_public_source_query,
    )

    outcomes: list[FastCheckQueryOutcome] = []
    refs: dict[tuple[str, str], Any] = {}
    cache_scope = additional_public_source_cache_scope(source)
    for query in queries:
        if not additional_public_source_supports_discovery_query(source, query["phrase"]):
            outcomes.append(
                FastCheckQueryOutcome(
                    source=source,
                    query_type=query["query_type"],
                    query=query["phrase"],
                    outcome="skipped",
                )
            )
            continue

        if not claim_additional_public_source_query(
            source=source,
            query=query["phrase"],
            since_hours_ago=since_hours_ago,
            scope=cache_scope,
        ):
            outcomes.append(
                FastCheckQueryOutcome(
                    source=source,
                    query_type=query["query_type"],
                    query=query["phrase"],
                    outcome="cached",
                )
            )
            continue

        try:
            result = ingest_additional_public_source_posts(
                source=source,
                query=query["phrase"],
                since_hours_ago=since_hours_ago,
                posts_per_query=posts_per_query,
                query_type=query["query_type"],
            )
        except Exception as exc:
            response = getattr(exc, "response", None)
            status_code = getattr(response, "status_code", None)
            release_additional_public_source_query(
                source=source,
                query=query["phrase"],
                since_hours_ago=since_hours_ago,
                scope=cache_scope,
            )
            outcomes.append(
                FastCheckQueryOutcome(
                    source=source,
                    query_type=query["query_type"],
                    query=query["phrase"],
                    outcome="failed",
                    error_type=exc.__class__.__name__,
                    status_code=status_code if isinstance(status_code, int) else None,
                )
            )
            # As above, one source outage should not burn its remaining query
            # budget, but it must not hold back the other providers.
            break

        outcomes.append(
            FastCheckQueryOutcome(
                source=source,
                query_type=query["query_type"],
                query=query["phrase"],
                outcome="completed",
                hits_found=max(0, int(result.hits_found)),
                plausible_hits=max(0, int(result.plausible_hits)),
                inserted_count=max(0, int(result.inserted_count)),
            )
        )
        for ref in result.matchable_source_post_refs:
            _keep_higher_priority_ref(refs, ref)

    return FastCheckSourceResult(
        source=source,
        query_outcomes=tuple(outcomes),
        source_post_refs=tuple(refs.values()),
    )


def run_fast_public_source_check(
    queries: Sequence[dict[str, str]],
    *,
    sources: Sequence[str],
    since_hours_ago: int,
    posts_per_query: int,
    max_concurrency: int,
    on_source_completed: Callable[[FastCheckSourceResult], None] | None = None,
) -> list[FastCheckSourceResult]:
    """Collect selected public sources concurrently and yield each completion.

    ``on_source_completed`` runs on the parent worker thread, not a provider
    thread.  This makes queue publication and discovery telemetry deterministic
    while still allowing provider I/O to run concurrently.
    """

    normalized_sources = tuple(
        dict.fromkeys(
            source.strip().casefold() for source in sources if source and source.strip()
        )
    )
    if not normalized_sources:
        return []

    worker_count = max(1, min(max_concurrency, len(normalized_sources)))
    completed: list[FastCheckSourceResult] = []
    with ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="arcli-source") as executor:
        futures = {
            executor.submit(
                _source_result_for_hackernews
                if source == "hackernews"
                else _source_result_for_additional_source,
                *(() if source == "hackernews" else (source,)),
                queries,
                since_hours_ago=since_hours_ago,
                posts_per_query=posts_per_query,
            ): source
            for source in normalized_sources
        }
        for future in as_completed(futures):
            source = futures[future]
            try:
                result = future.result()
            except Exception as exc:  # Defensive: a source must never block the run.
                result = FastCheckSourceResult(
                    source=source,
                    query_outcomes=(
                        FastCheckQueryOutcome(
                            source=source,
                            query_type="run",
                            query=source,
                            outcome="failed",
                            error_type=exc.__class__.__name__,
                        ),
                    ),
                )
            completed.append(result)
            if on_source_completed:
                on_source_completed(result)

    return completed
