"""Conservative, read-only calibration from reviewed lead feedback.

The matcher is intentionally recall-oriented and the verifier remains the
quality gate.  This module can only make that prefilter a little stricter
when a sufficiently large, unambiguous set of human reviews supports it.  It
never lowers the configured similarity threshold, writes to the database, or
returns reviewer/source content to callers.

The SQL contract for ``lead_feedback`` is additive and may not be deployed in
every environment yet.  Loading is therefore deliberately fail-open: a
missing table, unavailable database, or malformed row simply disables this
optional calibration for the current batch.
"""

from __future__ import annotations

import logging
import math
import os
import threading
import time
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from statistics import median
from typing import Any

from sqlalchemy import text

from api.services.embeddings import _database_engine


logger = logging.getLogger(__name__)


DEFAULT_BASE_THRESHOLD = 0.15
DEFAULT_MIN_SAMPLES = 12
DEFAULT_MIN_CLASS_SAMPLES = 3
DEFAULT_MAX_THRESHOLD_INCREASE = 0.03
DEFAULT_MIN_NEGATIVE_MARGIN = 0.02
DEFAULT_MIN_CLASS_SEPARATION = 0.05
DEFAULT_CACHE_SECONDS = 300
DEFAULT_SAMPLE_LIMIT = 500

_POSITIVE_FEEDBACK_TYPES = frozenset({"good_fit", "useful_pain_not_now"})
_NEGATIVE_FEEDBACK_TYPES = frozenset({"wrong_buyer", "not_relevant", "spam"})
_MAX_CACHE_ENTRIES = 128
_FAILURE_COOLDOWN_SECONDS = 30.0
_MISSING_SCHEMA_COOLDOWN_SECONDS = 300.0


@dataclass(frozen=True)
class FeedbackCalibration:
    """A bounded prefilter-threshold recommendation from aggregate reviews.

    ``threshold`` is always greater than ``base_threshold``.  The fields are
    aggregate operational metadata only; no feedback reason, reviewer, or
    source-post content is retained here.
    """

    threshold: float
    base_threshold: float
    adjustment: float
    sample_size: int
    positive_samples: int
    negative_samples: int
    positive_median: float
    negative_median: float
    reason: str = "sufficient_negative_feedback"


@dataclass(frozen=True)
class FeedbackObservation:
    """Minimal, content-free input used by the pure derivation function."""

    feedback_type: str
    similarity_score: float
    lead_match_id: str | None = None


_cache_lock = threading.Lock()
_calibration_cache: dict[
    tuple[str, str, float], tuple[float, FeedbackCalibration | None]
] = {}
_unavailable_until = 0.0
_last_warning_at = 0.0


def _enabled() -> bool:
    return os.getenv("ARCLI_MATCHING_FEEDBACK_CALIBRATION_ENABLED", "true").strip().casefold() not in {
        "0",
        "false",
        "no",
        "off",
    }


def _bounded_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        logger.warning("feedback_calibration_invalid_integer_env name=%s", name)
        return default
    return max(minimum, min(maximum, value))


def _bounded_float(
    name: str,
    default: float,
    *,
    minimum: float,
    maximum: float,
) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("feedback_calibration_invalid_float_env name=%s", name)
        return default
    if not math.isfinite(value):
        logger.warning("feedback_calibration_invalid_float_env name=%s", name)
        return default
    return max(minimum, min(maximum, value))


def _base_threshold(value: float | None) -> float | None:
    candidate = DEFAULT_BASE_THRESHOLD if value is None else value
    try:
        threshold = float(candidate)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(threshold) or not 0.0 <= threshold <= 1.0:
        return None
    return threshold


def _normalised_identifier(value: object | None) -> str | None:
    if value is None:
        return None
    normalised = str(value).strip()
    return normalised or None


def _read_float(value: object) -> float | None:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(score) or not -1.0 <= score <= 1.0:
        return None
    return score


def _observation_from_row(
    row: FeedbackObservation | Mapping[str, object] | object,
    *,
    fallback_id: int,
) -> FeedbackObservation | None:
    if isinstance(row, FeedbackObservation):
        score = _read_float(row.similarity_score)
        if score is None:
            return None
        return FeedbackObservation(
            feedback_type=str(row.feedback_type or "").strip().casefold(),
            similarity_score=score,
            lead_match_id=_normalised_identifier(row.lead_match_id)
            or f"__row_{fallback_id}",
        )

    values: Mapping[str, object]
    if isinstance(row, Mapping):
        values = row
    else:
        mapping = getattr(row, "_mapping", None)
        if not isinstance(mapping, Mapping):
            return None
        values = mapping

    feedback_type = str(values.get("feedback_type", "")).strip().casefold()
    score = _read_float(values.get("similarity_score"))
    if not feedback_type or score is None:
        return None
    lead_match_id = _normalised_identifier(values.get("lead_match_id"))
    # The database contract always supplies a lead ID.  A synthetic ID makes
    # the pure helper harmless for partial test fixtures without allowing two
    # otherwise unrelated rows to cancel one another as a conflict.
    if lead_match_id is None:
        lead_match_id = f"__row_{fallback_id}"
    return FeedbackObservation(
        feedback_type=feedback_type,
        similarity_score=score,
        lead_match_id=lead_match_id,
    )


def _lower_quartile(values: list[float]) -> float:
    """Use an observed lower quartile, avoiding interpolation surprises."""

    ordered = sorted(values)
    return ordered[max(0, (len(ordered) - 1) // 4)]


def derive_feedback_calibration(
    observations: Iterable[FeedbackObservation | Mapping[str, object] | object],
    *,
    base_threshold: float | None = None,
    min_samples: int | None = None,
    min_class_samples: int | None = None,
    max_threshold_increase: float | None = None,
    min_negative_margin: float | None = None,
    min_class_separation: float | None = None,
) -> FeedbackCalibration | None:
    """Derive a threshold increase from aggregate human feedback.

    A lead with both positive and negative labels is excluded rather than
    arbitrarily resolved.  This deliberately requires clear reviewer
    agreement.  The returned threshold is capped and non-decreasing so a
    data-quality issue cannot broaden the matcher or bypass verifier caching.
    """

    resolved_base = _base_threshold(base_threshold)
    if resolved_base is None:
        return None

    try:
        resolved_min_samples = (
            _bounded_int(
                "ARCLI_MATCHING_FEEDBACK_MIN_SAMPLES",
                DEFAULT_MIN_SAMPLES,
                minimum=2,
                maximum=10_000,
            )
            if min_samples is None
            else max(2, int(min_samples))
        )
        resolved_min_class_samples = (
            _bounded_int(
                "ARCLI_MATCHING_FEEDBACK_MIN_CLASS_SAMPLES",
                DEFAULT_MIN_CLASS_SAMPLES,
                minimum=1,
                maximum=5_000,
            )
            if min_class_samples is None
            else max(1, int(min_class_samples))
        )
        resolved_max_increase = (
            _bounded_float(
                "ARCLI_MATCHING_FEEDBACK_MAX_THRESHOLD_INCREASE",
                DEFAULT_MAX_THRESHOLD_INCREASE,
                minimum=0.001,
                maximum=0.10,
            )
            if max_threshold_increase is None
            else max(0.0, min(0.10, float(max_threshold_increase)))
        )
        resolved_negative_margin = (
            _bounded_float(
                "ARCLI_MATCHING_FEEDBACK_MIN_NEGATIVE_MARGIN",
                DEFAULT_MIN_NEGATIVE_MARGIN,
                minimum=0.0,
                maximum=0.25,
            )
            if min_negative_margin is None
            else max(0.0, min(0.25, float(min_negative_margin)))
        )
        resolved_class_separation = (
            _bounded_float(
                "ARCLI_MATCHING_FEEDBACK_MIN_CLASS_SEPARATION",
                DEFAULT_MIN_CLASS_SEPARATION,
                minimum=0.0,
                maximum=0.50,
            )
            if min_class_separation is None
            else max(0.0, min(0.50, float(min_class_separation)))
        )
    except (OverflowError, TypeError, ValueError):
        return None
    if (
        not math.isfinite(resolved_max_increase)
        or not math.isfinite(resolved_negative_margin)
        or not math.isfinite(resolved_class_separation)
        or resolved_max_increase <= 0.0
    ):
        return None

    labels_by_match: dict[str, set[str]] = {}
    scores_by_match: dict[str, list[float]] = {}
    for index, raw_observation in enumerate(observations):
        observation = _observation_from_row(raw_observation, fallback_id=index)
        if observation is None:
            continue
        label = observation.feedback_type.strip().casefold()
        if label in _POSITIVE_FEEDBACK_TYPES:
            class_label = "positive"
        elif label in _NEGATIVE_FEEDBACK_TYPES:
            class_label = "negative"
        else:
            continue

        score = _read_float(observation.similarity_score)
        lead_match_id = _normalised_identifier(observation.lead_match_id)
        if score is None or lead_match_id is None:
            continue
        labels_by_match.setdefault(lead_match_id, set()).add(class_label)
        scores_by_match.setdefault(lead_match_id, []).append(score)

    positive_scores: list[float] = []
    negative_scores: list[float] = []
    for lead_match_id, labels in labels_by_match.items():
        # A split review is intentionally not evidence for automatic tuning.
        if len(labels) != 1:
            continue
        score_values = scores_by_match[lead_match_id]
        match_score = float(median(score_values))
        if "positive" in labels:
            positive_scores.append(match_score)
        else:
            negative_scores.append(match_score)

    sample_size = len(positive_scores) + len(negative_scores)
    if (
        sample_size < resolved_min_samples
        or len(positive_scores) < resolved_min_class_samples
        or len(negative_scores) < resolved_min_class_samples
    ):
        return None

    positive_median = float(median(positive_scores))
    negative_median = float(median(negative_scores))
    # Feedback needs to show that rejected candidates sit materially above the
    # current floor and remain distinguishable from accepted candidates.  If
    # it does not, leaving the recall-oriented threshold alone is safer.
    if (
        negative_median < resolved_base + resolved_negative_margin
        or positive_median < negative_median + resolved_class_separation
    ):
        return None

    safe_upper_bound = min(
        (positive_median + negative_median) / 2.0,
        _lower_quartile(positive_scores),
        1.0,
    )
    proposed_threshold = min(
        resolved_base + resolved_max_increase,
        safe_upper_bound,
    )
    adjustment = proposed_threshold - resolved_base
    # A sub-milli-point change cannot meaningfully alter comparisons and makes
    # logs/cache observations noisy.  It is safer to leave it disabled.
    if adjustment < 0.001 or not math.isfinite(adjustment):
        return None

    return FeedbackCalibration(
        threshold=round(proposed_threshold, 6),
        base_threshold=round(resolved_base, 6),
        adjustment=round(adjustment, 6),
        sample_size=sample_size,
        positive_samples=len(positive_scores),
        negative_samples=len(negative_scores),
        positive_median=round(positive_median, 6),
        negative_median=round(negative_median, 6),
    )


def _cache_seconds() -> int:
    return _bounded_int(
        "ARCLI_MATCHING_FEEDBACK_CALIBRATION_CACHE_SECONDS",
        DEFAULT_CACHE_SECONDS,
        minimum=15,
        maximum=3_600,
    )


def _sample_limit() -> int:
    return _bounded_int(
        "ARCLI_MATCHING_FEEDBACK_CALIBRATION_SAMPLE_LIMIT",
        DEFAULT_SAMPLE_LIMIT,
        minimum=12,
        maximum=5_000,
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
            "feedback_calibration_skipped reason=%s error_type=%s retry_after_seconds=%s",
            "schema_unavailable" if cooldown == _MISSING_SCHEMA_COOLDOWN_SECONDS else "storage_unavailable",
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


def _load_observations(tenant_id: str, service_profile_id: str) -> list[Mapping[str, object] | object]:
    """Load only aggregate-calibration inputs through a scoped SELECT."""

    statement = text(
        """
        SELECT
            feedback.lead_match_id::TEXT AS lead_match_id,
            feedback.feedback_type,
            lead_match.similarity_score
          FROM public.lead_feedback AS feedback
          INNER JOIN public.lead_matches AS lead_match
            ON lead_match.tenant_id = feedback.tenant_id
           AND lead_match.id = feedback.lead_match_id
         WHERE feedback.tenant_id = :tenant_id
           AND lead_match.service_profile_id = :service_profile_id
           AND lead_match.similarity_score IS NOT NULL
         ORDER BY feedback.created_at DESC
         LIMIT :limit
        """
    )
    engine = _database_engine()
    # ``connect`` does not commit and the statement contains no mutation.
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


def clear_feedback_calibration_cache() -> None:
    """Clear process-local read cache (mainly useful for tests and workers)."""

    global _unavailable_until, _last_warning_at
    with _cache_lock:
        _calibration_cache.clear()
        _unavailable_until = 0.0
        _last_warning_at = 0.0


def load_feedback_calibration(
    tenant_id: str,
    service_profile_id: str | None,
    *,
    base_threshold: float | None = None,
) -> FeedbackCalibration | None:
    """Return a safe, cached threshold increase for one tenant/profile.

    This function is intentionally safe to call at worker boundaries.  It
    returns ``None`` for disabled calibration, incomplete evidence, invalid
    identifiers, missing contracts, and all database failures.
    """

    if not _enabled() or _in_cooldown():
        return None

    tenant = _normalised_identifier(tenant_id)
    profile_id = _normalised_identifier(service_profile_id)
    resolved_base = _base_threshold(base_threshold)
    if tenant is None or profile_id is None or resolved_base is None:
        return None

    key = (tenant, profile_id, resolved_base)
    now = time.monotonic()
    with _cache_lock:
        cached = _calibration_cache.get(key)
        if cached is not None and cached[0] > now:
            return cached[1]

    try:
        observations = _load_observations(tenant, profile_id)
        calibration = derive_feedback_calibration(
            observations,
            base_threshold=resolved_base,
        )
    except Exception as error:
        _record_load_failure(error)
        return None

    expires_at = now + _cache_seconds()
    with _cache_lock:
        if len(_calibration_cache) >= _MAX_CACHE_ENTRIES:
            # Drop expired entries first; if all remain hot, evict the oldest
            # expiry.  Calibration is an optional optimization, so a compact
            # process-local cache is preferable to unbounded per-tenant state.
            expired = [cache_key for cache_key, value in _calibration_cache.items() if value[0] <= now]
            for cache_key in expired:
                _calibration_cache.pop(cache_key, None)
            if len(_calibration_cache) >= _MAX_CACHE_ENTRIES:
                oldest_key = min(_calibration_cache, key=lambda cache_key: _calibration_cache[cache_key][0])
                _calibration_cache.pop(oldest_key, None)
        _calibration_cache[key] = (expires_at, calibration)

    if calibration is not None:
        logger.info(
            "feedback_calibration_applied tenant_id=%s service_profile_id=%s sample_size=%s positive_samples=%s negative_samples=%s adjustment=%.3f",
            tenant,
            profile_id,
            calibration.sample_size,
            calibration.positive_samples,
            calibration.negative_samples,
            calibration.adjustment,
        )
    return calibration
