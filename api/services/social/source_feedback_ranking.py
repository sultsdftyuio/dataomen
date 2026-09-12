"""Advisory source-plan ordering from reviewed lead feedback.

Website-derived discovery starts from product context, then this optional
read-only layer learns where a tenant is consistently finding poor-fit
conversations. It can move a reliably positive supplemental source earlier or
a consistently unhelpful source later. It never removes a selected source: a
historical negative label must not hide a future conversation with a genuine
buyer signal. It never expands a scan or overrides an explicitly selected
Watchlist.

``lead_feedback`` is an additive contract.  A missing table, database outage,
or malformed result therefore returns the original plan and opens a short
cooldown rather than affecting an ingestion batch.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

from sqlalchemy import text

from api.services.embeddings import _database_engine


logger = logging.getLogger(__name__)


_POSITIVE_FEEDBACK_TYPES = frozenset({"good_fit", "useful_pain_not_now"})
_NEGATIVE_FEEDBACK_TYPES = frozenset({"wrong_buyer", "not_relevant", "spam"})
_PROTECTED_SOURCES = frozenset({"hackernews", "bluesky", "x"})
_DEFAULT_CACHE_SECONDS = 300
_DEFAULT_SAMPLE_LIMIT = 500
_DEFAULT_MIN_REVIEWS = 6
_DEFAULT_MIN_NEGATIVE_REVIEWS = 5
_MAX_CACHE_ENTRIES = 128
_FAILURE_COOLDOWN_SECONDS = 30.0
_MISSING_SCHEMA_COOLDOWN_SECONDS = 300.0


@dataclass(frozen=True)
class SourceFeedbackObservation:
    """The minimal, content-free input needed for source-level learning."""

    source: str
    feedback_type: str
    lead_match_id: str | None = None


@dataclass(frozen=True)
class SourceFeedbackRanking:
    """A safe source-plan result that callers can log without user content."""

    sources: tuple[str, ...]
    deprioritized_sources: tuple[str, ...] = ()
    prioritized_sources: tuple[str, ...] = ()
    reviewed_leads: int = 0


_cache_lock = threading.Lock()
_ranking_cache: dict[
    tuple[str, str, tuple[str, ...]], tuple[float, SourceFeedbackRanking]
] = {}
_unavailable_until = 0.0
_last_warning_at = 0.0


def _enabled() -> bool:
    return os.getenv("ARCLI_SOURCE_FEEDBACK_RANKING_ENABLED", "true").strip().casefold() not in {
        "0",
        "false",
        "no",
        "off",
    }


def _normalised_identifier(value: object | None) -> str | None:
    if value is None:
        return None
    normalised = str(value).strip()
    return normalised or None


def _normalised_source(value: object | None) -> str | None:
    source = _normalised_identifier(value)
    return source.casefold() if source else None


def _bounded_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        logger.warning("source_feedback_ranking_invalid_integer_env name=%s", name)
        return default
    return max(minimum, min(maximum, value))


def _cache_seconds() -> int:
    return _bounded_int(
        "ARCLI_SOURCE_FEEDBACK_RANKING_CACHE_SECONDS",
        _DEFAULT_CACHE_SECONDS,
        minimum=15,
        maximum=3_600,
    )


def _sample_limit() -> int:
    return _bounded_int(
        "ARCLI_SOURCE_FEEDBACK_RANKING_SAMPLE_LIMIT",
        _DEFAULT_SAMPLE_LIMIT,
        minimum=12,
        maximum=5_000,
    )


def _minimum_reviews() -> int:
    return _bounded_int(
        "ARCLI_SOURCE_FEEDBACK_RANKING_MIN_REVIEWS",
        _DEFAULT_MIN_REVIEWS,
        minimum=3,
        maximum=10_000,
    )


def _minimum_negative_reviews() -> int:
    return _bounded_int(
        "ARCLI_SOURCE_FEEDBACK_RANKING_MIN_NEGATIVE_REVIEWS",
        _DEFAULT_MIN_NEGATIVE_REVIEWS,
        minimum=2,
        maximum=10_000,
    )


def _normalised_sources(sources: Sequence[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    normalised: list[str] = []
    for raw_source in sources:
        source = _normalised_source(raw_source)
        if source is None or source in seen:
            continue
        seen.add(source)
        normalised.append(source)
    return tuple(normalised)


def _observation_from_row(
    row: SourceFeedbackObservation | Mapping[str, object] | object,
    *,
    fallback_id: int,
) -> SourceFeedbackObservation | None:
    if isinstance(row, SourceFeedbackObservation):
        source = _normalised_source(row.source)
        feedback_type = _normalised_source(row.feedback_type)
        lead_match_id = _normalised_identifier(row.lead_match_id)
    else:
        values: Mapping[str, object]
        if isinstance(row, Mapping):
            values = row
        else:
            mapping = getattr(row, "_mapping", None)
            if not isinstance(mapping, Mapping):
                return None
            values = mapping
        source = _normalised_source(values.get("source"))
        feedback_type = _normalised_source(values.get("feedback_type"))
        lead_match_id = _normalised_identifier(values.get("lead_match_id"))

    if source is None or feedback_type is None:
        return None
    # Database rows always have a lead ID. A synthetic value keeps pure unit
    # fixtures safe without conflating two incomplete rows.
    return SourceFeedbackObservation(
        source=source,
        feedback_type=feedback_type,
        lead_match_id=lead_match_id or f"__row_{fallback_id}",
    )


def _source_has_promising_feedback(counts: tuple[int, int]) -> bool:
    """Require more than one positive review before changing job order."""

    positive_count, negative_count = counts
    return positive_count >= 2 and positive_count >= negative_count * 2


def _prioritize_promising_sources(
    sources: tuple[str, ...],
    counts_by_source: Mapping[str, tuple[int, int]],
    deprioritized_sources: frozenset[str],
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Move proven sources earlier and weak ones later without losing coverage."""

    original_positions = {source: index for index, source in enumerate(sources)}

    def sort_key(source: str) -> tuple[int, int, int]:
        position = original_positions[source]
        if source in {"hackernews", "bluesky"}:
            return (0, 0, position)
        if source == "x":
            # X remains a final fallback. It must not turn into a first-pass
            # source merely because a historical review happened to be good.
            return (4, 0, position)
        positive_count, _negative_count = counts_by_source.get(source, (0, 0))
        if _source_has_promising_feedback((positive_count, _negative_count)):
            return (1, -positive_count, position)
        if source in deprioritized_sources:
            # This remains an ordering signal only. The source stays in the
            # plan so newly relevant buyer language can still surface a lead.
            return (3, 0, position)
        return (2, 0, position)

    ordered_sources = tuple(sorted(sources, key=sort_key))
    prioritized_sources = tuple(
        source
        for index, source in enumerate(ordered_sources)
        if original_positions[source] != index
        and _source_has_promising_feedback(counts_by_source.get(source, (0, 0)))
    )
    return ordered_sources, prioritized_sources


def derive_source_feedback_ranking(
    observations: Iterable[SourceFeedbackObservation | Mapping[str, object] | object],
    sources: Sequence[str],
    *,
    min_reviews: int | None = None,
    min_negative_reviews: int | None = None,
) -> SourceFeedbackRanking:
    """Return a bounded source order after unambiguous review evidence.

    A lead with conflicting positive and negative feedback is intentionally
    ignored. A supplemental source with a sufficiently large unanimously
    negative sample moves later, but is deliberately never removed. This keeps
    feedback useful for prioritization without letting past reviews erase a
    channel that may contain valid buyers.
    """

    baseline_sources = _normalised_sources(sources)
    if not baseline_sources:
        return SourceFeedbackRanking(())

    try:
        resolved_min_reviews = (
            _minimum_reviews() if min_reviews is None else max(3, int(min_reviews))
        )
        resolved_min_negative = (
            _minimum_negative_reviews()
            if min_negative_reviews is None
            else max(2, int(min_negative_reviews))
        )
    except (OverflowError, TypeError, ValueError):
        return SourceFeedbackRanking(baseline_sources)

    labels_by_source_lead: dict[tuple[str, str], set[str]] = {}
    for index, raw_observation in enumerate(observations):
        observation = _observation_from_row(raw_observation, fallback_id=index)
        if observation is None or observation.source not in baseline_sources:
            continue

        if observation.feedback_type in _POSITIVE_FEEDBACK_TYPES:
            label = "positive"
        elif observation.feedback_type in _NEGATIVE_FEEDBACK_TYPES:
            label = "negative"
        else:
            continue

        lead_match_id = observation.lead_match_id
        if lead_match_id is None:
            continue
        labels_by_source_lead.setdefault(
            (observation.source, lead_match_id), set()
        ).add(label)

    counts_by_source: dict[str, tuple[int, int]] = {}
    reviewed_leads = 0
    for (source, _lead_match_id), labels in labels_by_source_lead.items():
        # Reviewer disagreement is useful to a person but not reliable enough
        # for an automatic source-plan change.
        if len(labels) != 1:
            continue
        positive_count, negative_count = counts_by_source.get(source, (0, 0))
        if "positive" in labels:
            counts_by_source[source] = (positive_count + 1, negative_count)
        else:
            counts_by_source[source] = (positive_count, negative_count + 1)
        reviewed_leads += 1

    deprioritized_sources = tuple(
        source
        for source in baseline_sources
        if source not in _PROTECTED_SOURCES
        and (counts := counts_by_source.get(source, (0, 0)))
        and counts[0] == 0
        and counts[0] + counts[1] >= resolved_min_reviews
        and counts[1] >= resolved_min_negative
    )
    ordered_sources, prioritized_sources = _prioritize_promising_sources(
        baseline_sources,
        counts_by_source,
        frozenset(deprioritized_sources),
    )
    return SourceFeedbackRanking(
        ordered_sources,
        deprioritized_sources=deprioritized_sources,
        prioritized_sources=prioritized_sources,
        reviewed_leads=reviewed_leads,
    )


def _in_cooldown() -> bool:
    with _cache_lock:
        return time.monotonic() < _unavailable_until


def _is_missing_schema_error(error: BaseException) -> bool:
    original = getattr(error, "orig", error)
    sqlstate = getattr(original, "pgcode", None) or getattr(original, "sqlstate", None)
    if sqlstate in {"3F000", "42P01", "42703"}:
        return True
    message = str(original).casefold()
    return any(
        marker in message
        for marker in (
            "lead_feedback",
            "lead_matches",
            "source_posts",
            "relation does not exist",
            "undefined table",
            "undefined column",
        )
    )


def _record_load_failure(error: Exception) -> None:
    global _unavailable_until, _last_warning_at

    now = time.monotonic()
    cooldown = (
        _MISSING_SCHEMA_COOLDOWN_SECONDS
        if _is_missing_schema_error(error)
        else _FAILURE_COOLDOWN_SECONDS
    )
    should_warn = False
    with _cache_lock:
        _unavailable_until = max(_unavailable_until, now + cooldown)
        if now >= _last_warning_at + cooldown:
            _last_warning_at = now
            should_warn = True
    if should_warn:
        logger.warning(
            "source_feedback_ranking_skipped reason=%s error_type=%s retry_after_seconds=%s",
            "schema_unavailable"
            if cooldown == _MISSING_SCHEMA_COOLDOWN_SECONDS
            else "storage_unavailable",
            type(error).__name__,
            int(cooldown),
        )


def _result_rows(result: object) -> list[Mapping[str, object] | object]:
    mappings = getattr(result, "mappings", None)
    if callable(mappings):
        mapped_result = mappings()
        all_rows = getattr(mapped_result, "all", None)
        if callable(all_rows):
            return list(all_rows())
        return list(mapped_result)
    fetchall = getattr(result, "fetchall", None)
    if callable(fetchall):
        return list(fetchall())
    return list(result) if isinstance(result, Iterable) else []


def _load_observations(
    tenant_id: str,
    service_profile_id: str,
) -> list[Mapping[str, object] | object]:
    """Load aggregate labels only; source post body and reviewer IDs stay out."""

    statement = text(
        """
        SELECT
            feedback.lead_match_id::TEXT AS lead_match_id,
            feedback.feedback_type,
            source_post.source
          FROM public.lead_feedback AS feedback
          INNER JOIN public.lead_matches AS lead_match
            ON lead_match.tenant_id = feedback.tenant_id
           AND lead_match.id = feedback.lead_match_id
          INNER JOIN public.source_posts AS source_post
            ON source_post.id = lead_match.source_post_id
         WHERE feedback.tenant_id = :tenant_id
           AND lead_match.service_profile_id = :service_profile_id
         ORDER BY feedback.created_at DESC
         LIMIT :limit
        """
    )
    engine = _database_engine()
    # ``connect`` leaves the optional learning read transaction-free and does
    # not allow this integration point to mutate a batch's database work.
    with engine.connect() as connection:
        result = connection.execute(
            statement,
            {
                "tenant_id": tenant_id,
                "service_profile_id": service_profile_id,
                "limit": _sample_limit(),
            },
        )
        return _result_rows(result)


def clear_source_feedback_ranking_cache() -> None:
    """Clear the process-local cache (mainly for tests and workers)."""

    global _unavailable_until, _last_warning_at
    with _cache_lock:
        _ranking_cache.clear()
        _unavailable_until = 0.0
        _last_warning_at = 0.0


def load_source_feedback_ranking(
    tenant_id: str,
    service_profile_id: str | None,
    sources: Sequence[str],
) -> SourceFeedbackRanking:
    """Return a cached, fail-open source plan for website-derived scans."""

    baseline_sources = _normalised_sources(sources)
    tenant = _normalised_identifier(tenant_id)
    profile_id = _normalised_identifier(service_profile_id)
    fallback = SourceFeedbackRanking(baseline_sources)
    if (
        not _enabled()
        or _in_cooldown()
        or tenant is None
        or profile_id is None
        or not baseline_sources
    ):
        return fallback

    key = (tenant, profile_id, baseline_sources)
    now = time.monotonic()
    with _cache_lock:
        cached = _ranking_cache.get(key)
    if cached and cached[0] > now:
        return cached[1]

    try:
        ranking = derive_source_feedback_ranking(
            _load_observations(tenant, profile_id),
            baseline_sources,
        )
    except Exception as error:
        _record_load_failure(error)
        return fallback

    with _cache_lock:
        if len(_ranking_cache) >= _MAX_CACHE_ENTRIES:
            expired_keys = [
                cached_key
                for cached_key, (expires_at, _value) in _ranking_cache.items()
                if expires_at <= now
            ]
            for expired_key in expired_keys:
                _ranking_cache.pop(expired_key, None)
            if len(_ranking_cache) >= _MAX_CACHE_ENTRIES:
                oldest_key = min(_ranking_cache, key=lambda item: _ranking_cache[item][0])
                _ranking_cache.pop(oldest_key, None)
        _ranking_cache[key] = (now + _cache_seconds(), ranking)
    return ranking
