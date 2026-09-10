import logging
import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Callable, Literal, Sequence

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.services.cost_controls import env_float, env_int
from api.services.social.comparison import profile_vocabulary_signal

logger = logging.getLogger(__name__)

MetadataValue = str | int | float | bool
RejectionStage = Literal["cheap_filter", "embedding_similarity"]

# This stage is a recall-oriented prefilter; the verifier is the precision
# gate before a lead reaches review. A 0.15 floor deliberately admits broader
# semantic candidates (including adjacent buyer-language paraphrases) to that
# verifier; it is never itself a lead decision.
DEFAULT_SIMILARITY_THRESHOLD = 0.15
DEFAULT_MAX_CANDIDATES = 50
DEFAULT_MIN_POST_CHARS = 8
DEFAULT_PROFILE_VOCABULARY_MAX_BOOST = 0.04
DEFAULT_MAX_CANDIDATES_PER_AUTHOR = 2
REJECTION_EMPTY_TEXT = "empty_or_too_short_text"
REJECTION_SPAM_SIGNAL = "cheap_filter_spam_signal"
REJECTION_INSUFFICIENT_SIMILARITY = "insufficient_similarity_score"

OBVIOUS_SPAM_MARKERS = (
    "limited offer",
    "buy followers",
    "verified emails",
    "crypto giveaway",
    "guaranteed leads",
)


class PostEmbedding(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    post_id: str = Field(min_length=1, description="Stable source identifier.")
    text: str = Field(min_length=1, description="Raw source post text.")
    embedding: list[float] = Field(
        min_length=1,
        description="Dense vector representation of the source post.",
    )
    source: str = Field(default="reddit", min_length=1)
    url: str | None = Field(default=None)
    metadata: dict[str, MetadataValue] = Field(default_factory=dict)

    @field_validator("embedding")
    @classmethod
    def validate_embedding(cls, value: list[float]) -> list[float]:
        if any(not math.isfinite(item) for item in value):
            raise ValueError("embedding values must be finite")
        return value


class CandidateMatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    post_id: str = Field(min_length=1)
    source: str = Field(min_length=1)
    text: str = Field(min_length=1)
    score: float = Field(ge=-1.0, le=1.0)
    url: str | None = Field(default=None)
    metadata: dict[str, MetadataValue] = Field(default_factory=dict)


@dataclass(frozen=True)
class _RankedCandidate:
    """Internal ordering data; the public candidate payload stays unchanged."""

    candidate: CandidateMatch
    ranking_score: float
    theme: str | None


class MatchRejection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    tenant_id: str = Field(min_length=1)
    service_profile_id: str | None = Field(default=None)
    source_post_id: str = Field(min_length=1)
    similarity_score: float | None = Field(default=None, ge=-1.0, le=1.0)
    threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    rejection_stage: RejectionStage
    rejection_reason: str = Field(min_length=1)


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right):
        raise ValueError(
            f"Embedding dimensions must match: left={len(left)} right={len(right)}"
        )
    if not left:
        raise ValueError("Embeddings must not be empty")

    left_scale = 0.0
    right_scale = 0.0
    for left_value, right_value in zip(left, right):
        if not math.isfinite(left_value) or not math.isfinite(right_value):
            raise ValueError("Embedding values must be finite")
        left_scale = max(left_scale, abs(left_value))
        right_scale = max(right_scale, abs(right_value))

    if left_scale == 0.0 or right_scale == 0.0:
        return 0.0

    # Scale first so a valid, high-magnitude sparse embedding cannot overflow
    # to infinity and turn an otherwise useful comparison into NaN.
    dot_product = 0.0
    left_norm_squared = 0.0
    right_norm_squared = 0.0
    for left_value, right_value in zip(left, right):
        scaled_left = left_value / left_scale
        scaled_right = right_value / right_scale
        dot_product += scaled_left * scaled_right
        left_norm_squared += scaled_left * scaled_left
        right_norm_squared += scaled_right * scaled_right

    denominator = math.sqrt(left_norm_squared * right_norm_squared)
    if denominator == 0.0 or not math.isfinite(denominator):
        return 0.0
    score = dot_product / denominator
    return score if math.isfinite(score) else 0.0


def _tenant_id(tenant_id: str | None) -> str:
    return tenant_id.strip() if tenant_id and tenant_id.strip() else "unknown"


def _similarity_threshold(threshold: float | None) -> float:
    if threshold is None:
        threshold = env_float(
            "ARCLI_MATCHING_SIMILARITY_THRESHOLD",
            DEFAULT_SIMILARITY_THRESHOLD,
        )

    if not 0.0 <= threshold <= 1.0:
        raise ValueError("threshold must be between 0.0 and 1.0")

    return threshold


def _max_candidates(max_candidates: int | None) -> int:
    if max_candidates is None:
        max_candidates = env_int("ARCLI_MATCHING_MAX_CANDIDATES", DEFAULT_MAX_CANDIDATES)

    return max(1, max_candidates)


def _profile_vocabulary_max_boost() -> float:
    """Keep profile-language ranking subordinate to embedding similarity."""

    return max(
        0.0,
        min(
            0.10,
            env_float(
                "ARCLI_MATCHING_PROFILE_VOCABULARY_MAX_BOOST",
                DEFAULT_PROFILE_VOCABULARY_MAX_BOOST,
            ),
        ),
    )


def _max_candidates_per_author() -> int:
    """Bound one prolific author without hiding posts whose author is unknown."""

    return max(
        1,
        min(
            10,
            env_int(
                "ARCLI_MATCHING_MAX_CANDIDATES_PER_AUTHOR",
                DEFAULT_MAX_CANDIDATES_PER_AUTHOR,
            ),
        ),
    )


def _metadata_text(metadata: dict[str, MetadataValue], key: str) -> str | None:
    value = metadata.get(key)
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _candidate_author_key(candidate: CandidateMatch) -> str | None:
    author = _metadata_text(candidate.metadata, "author")
    if not author or author.casefold() in {"unknown", "anonymous", "none", "null"}:
        return None
    return author.casefold()


def _append_ranking_metadata(
    metadata: dict[str, MetadataValue],
    *,
    profile: object,
    text: str,
) -> tuple[dict[str, MetadataValue], float, str | None]:
    """Add bounded explainability fields without changing candidate semantics."""

    signal = profile_vocabulary_signal(profile, text)
    enriched = dict(metadata)
    if signal.theme:
        enriched["comparison_theme"] = signal.theme
    if signal.score:
        enriched["profile_vocabulary_score"] = round(signal.score, 3)
    if signal.reasons:
        # Candidate metadata accepts scalar values only.  A bounded CSV keeps
        # the existing contract while making a ranking decision auditable.
        enriched["profile_vocabulary_signals"] = ",".join(signal.reasons[:12])[:600]
    return enriched, signal.score, signal.theme


def _select_diverse_candidates(
    ranked_candidates: Sequence[_RankedCandidate],
    *,
    max_candidates: int,
) -> tuple[list[CandidateMatch], int]:
    """Round-robin topic groups and cap repeat authors in a bounded batch.

    This is intentionally an ordering control, not an eligibility rule.  A
    topic with the strongest semantic candidate still leads its round, while
    other concrete themes are allowed into the verifier batch before that one
    topic can consume every available slot.
    """

    ordered = sorted(
        ranked_candidates,
        key=lambda item: (
            -item.ranking_score,
            -item.candidate.score,
            item.candidate.source,
            item.candidate.post_id,
        ),
    )
    buckets: dict[str, list[_RankedCandidate]] = defaultdict(list)
    for item in ordered:
        buckets[item.theme or "other"].append(item)

    # Deterministic bucket order preserves score priority at the beginning of
    # each fair round and keeps retries reproducible.
    themes = sorted(
        buckets,
        key=lambda theme: (
            -buckets[theme][0].ranking_score,
            -buckets[theme][0].candidate.score,
            theme,
        ),
    )
    positions = {theme: 0 for theme in themes}
    author_counts: dict[str, int] = defaultdict(int)
    author_limit = _max_candidates_per_author()
    selected: list[CandidateMatch] = []
    author_exclusions = 0

    while len(selected) < max_candidates:
        selected_this_round = False
        for theme in themes:
            candidates = buckets[theme]
            position = positions[theme]
            while position < len(candidates):
                item = candidates[position]
                position += 1
                author_key = _candidate_author_key(item.candidate)
                if author_key and author_counts[author_key] >= author_limit:
                    author_exclusions += 1
                    continue

                positions[theme] = position
                selected.append(item.candidate)
                if author_key:
                    author_counts[author_key] += 1
                selected_this_round = True
                break
            else:
                positions[theme] = position

            if len(selected) >= max_candidates:
                break
        if not selected_this_round:
            break

    return selected, author_exclusions


def cheap_filter_rejection_reason(text: str) -> str | None:
    normalized = text.strip().lower()
    # Short posts can be commercially meaningful ("Need CRM help").  The
    # later semantic/verifier stages still protect precision, so this only
    # rejects fragments that cannot reasonably carry buyer context.
    if len(normalized) < env_int(
        "ARCLI_MATCHING_MIN_POST_CHARS",
        DEFAULT_MIN_POST_CHARS,
    ):
        return REJECTION_EMPTY_TEXT

    for marker in OBVIOUS_SPAM_MARKERS:
        if marker in normalized:
            return REJECTION_SPAM_SIGNAL

    return None


def _emit_rejection(
    *,
    tenant_id: str,
    service_profile_id: str | None,
    post_id: str,
    stage: RejectionStage,
    rejection_reason: str,
    similarity_score: float | None = None,
    threshold: float | None = None,
    on_rejected: Callable[[MatchRejection], None] | None = None,
) -> None:
    rejection = MatchRejection(
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        source_post_id=post_id,
        similarity_score=similarity_score,
        threshold=threshold,
        rejection_stage=stage,
        rejection_reason=rejection_reason,
    )

    logger.debug(
        "lead_match_rejected tenant_id=%s service_profile_id=%s source_post_id=%s stage=%s rejection_reason=%s similarity_score=%s threshold=%s",
        rejection.tenant_id,
        rejection.service_profile_id,
        rejection.source_post_id,
        rejection.rejection_stage,
        rejection.rejection_reason,
        rejection.similarity_score,
        rejection.threshold,
    )

    if on_rejected:
        try:
            on_rejected(rejection)
        except Exception as exc:
            # Rejection telemetry/persistence is supplementary. It must not
            # turn one bad callback into a failed matching batch.
            logger.warning(
                "lead_match_rejection_callback_failed tenant_id=%s service_profile_id=%s source_post_id=%s error_type=%s",
                rejection.tenant_id,
                rejection.service_profile_id,
                rejection.source_post_id,
                exc.__class__.__name__,
            )


def rejection_update_payload(rejection: MatchRejection) -> dict[str, object]:
    return {
        "tenant_id": rejection.tenant_id,
        "service_profile_id": rejection.service_profile_id,
        "source_post_id": rejection.source_post_id,
        "match_status": "rejected",
        "rejection_reason": rejection.rejection_reason,
        "similarity_score": rejection.similarity_score,
    }


def persist_match_rejection(
    supabase: object,
    rejection: MatchRejection,
    *,
    table_name: str = "lead_matches",
) -> None:
    """
    Persist a staged-filter rejection using explicit tenant scoping.

    The update path is tenant-filtered before any row can be mutated. If no row
    exists yet, the fallback insert carries tenant_id in the payload so a worker
    can record why the candidate never reached the verifier.
    """

    payload = rejection_update_payload(rejection)
    table = getattr(supabase, "table")(table_name)
    update_query = (
        table.update(payload)
        .eq("tenant_id", rejection.tenant_id)
        .eq("source_post_id", rejection.source_post_id)
    )

    if rejection.service_profile_id:
        update_query = update_query.eq("service_profile_id", rejection.service_profile_id)

    update_response = update_query.execute()
    updated_rows = getattr(update_response, "data", None) or []
    if updated_rows:
        logger.info(
            "lead_match_rejection_persisted tenant_id=%s service_profile_id=%s source_post_id=%s persistence_mode=%s rejection_reason=%s",
            rejection.tenant_id,
            rejection.service_profile_id,
            rejection.source_post_id,
            "update",
            rejection.rejection_reason,
        )
        return

    insert_response = getattr(supabase, "table")(table_name).insert(payload).execute()
    insert_error = getattr(insert_response, "error", None)
    if insert_error:
        logger.warning(
            "lead_match_rejection_persist_failed tenant_id=%s service_profile_id=%s source_post_id=%s rejection_reason=%s error=%s",
            rejection.tenant_id,
            rejection.service_profile_id,
            rejection.source_post_id,
            rejection.rejection_reason,
            insert_error,
        )
        return

    logger.info(
        "lead_match_rejection_persisted tenant_id=%s service_profile_id=%s source_post_id=%s persistence_mode=%s rejection_reason=%s",
        rejection.tenant_id,
        rejection.service_profile_id,
        rejection.source_post_id,
        "insert",
        rejection.rejection_reason,
    )


def find_candidate_matches(
    profile_embedding: Sequence[float],
    post_embeddings: Sequence[PostEmbedding],
    threshold: float | None = None,
    *,
    profile: object | None = None,
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
    max_candidates: int | None = None,
    on_rejected: Callable[[MatchRejection], None] | None = None,
) -> list[CandidateMatch]:
    """
    Cheap semantic prefilter. This deliberately favors recall, while the LLM
    verifier remains the quality gate for false-positive reduction.
    """

    resolved_tenant_id = _tenant_id(tenant_id)
    resolved_threshold = _similarity_threshold(threshold)
    resolved_max_candidates = _max_candidates(max_candidates)

    ranked_candidates: list[_RankedCandidate] = []
    cheap_filter_rejections = 0
    similarity_rejections = 0
    malformed_post_rejections = 0
    for post_embedding in post_embeddings:
        try:
            cheap_rejection_reason = cheap_filter_rejection_reason(post_embedding.text)
            if cheap_rejection_reason:
                cheap_filter_rejections += 1
                _emit_rejection(
                    tenant_id=resolved_tenant_id,
                    service_profile_id=service_profile_id,
                    post_id=post_embedding.post_id,
                    stage="cheap_filter",
                    rejection_reason=cheap_rejection_reason,
                    on_rejected=on_rejected,
                )
                continue

            score = cosine_similarity(profile_embedding, post_embedding.embedding)
            if score < resolved_threshold:
                similarity_rejections += 1
                _emit_rejection(
                    tenant_id=resolved_tenant_id,
                    service_profile_id=service_profile_id,
                    post_id=post_embedding.post_id,
                    stage="embedding_similarity",
                    rejection_reason=REJECTION_INSUFFICIENT_SIMILARITY,
                    similarity_score=score,
                    threshold=resolved_threshold,
                    on_rejected=on_rejected,
                )
                continue

            metadata = dict(post_embedding.metadata)
            vocabulary_score = 0.0
            theme: str | None = None
            if profile is not None:
                metadata, vocabulary_score, theme = _append_ranking_metadata(
                    metadata,
                    profile=profile,
                    text=post_embedding.text,
                )

            candidate = CandidateMatch(
                post_id=post_embedding.post_id,
                source=post_embedding.source,
                text=post_embedding.text,
                score=score,
                url=post_embedding.url,
                metadata=metadata,
            )
            ranked_candidates.append(
                _RankedCandidate(
                    candidate=candidate,
                    ranking_score=score
                    + (_profile_vocabulary_max_boost() * vocabulary_score),
                    theme=theme,
                )
            )
        except Exception as exc:
            malformed_post_rejections += 1
            logger.warning(
                "candidate_matching_post_skipped tenant_id=%s service_profile_id=%s source_post_id=%s error_type=%s",
                resolved_tenant_id,
                service_profile_id,
                getattr(post_embedding, "post_id", "unknown"),
                exc.__class__.__name__,
            )

    diversity_exclusions = 0
    if profile is None:
        # Preserve the historical ordering for direct callers that do not opt
        # into profile-aware comparison. Existing score semantics are intact.
        candidates = [item.candidate for item in ranked_candidates]
        candidates.sort(key=lambda candidate: candidate.score, reverse=True)
        candidates = candidates[:resolved_max_candidates]
    else:
        candidates, diversity_exclusions = _select_diverse_candidates(
            ranked_candidates,
            max_candidates=resolved_max_candidates,
        )

    logger.debug(
        "candidate_matching_completed tenant_id=%s service_profile_id=%s posts=%s candidates=%s threshold=%.3f max_candidates=%s profile_aware=%s cheap_filter_rejections=%s similarity_rejections=%s malformed_post_rejections=%s diversity_author_exclusions=%s",
        resolved_tenant_id,
        service_profile_id,
        len(post_embeddings),
        len(candidates),
        resolved_threshold,
        resolved_max_candidates,
        profile is not None,
        cheap_filter_rejections,
        similarity_rejections,
        malformed_post_rejections,
        diversity_exclusions,
    )

    if not candidates:
        logger.debug(
            "tenant_zero_match_signals tenant_id=%s service_profile_id=%s posts=%s threshold=%.3f cheap_filter_rejections=%s similarity_rejections=%s",
            resolved_tenant_id,
            service_profile_id,
            len(post_embeddings),
            resolved_threshold,
            cheap_filter_rejections,
            similarity_rejections,
        )

    return candidates
