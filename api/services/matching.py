import logging
import math
from typing import Callable, Literal, Sequence

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.services.cost_controls import env_float, env_int

logger = logging.getLogger(__name__)

MetadataValue = str | int | float | bool
RejectionStage = Literal["cheap_filter", "embedding_similarity"]

DEFAULT_SIMILARITY_THRESHOLD = 0.4
DEFAULT_MAX_CANDIDATES = 50
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

    dot_product = 0.0
    left_norm_squared = 0.0
    right_norm_squared = 0.0

    for left_value, right_value in zip(left, right):
        if not math.isfinite(left_value) or not math.isfinite(right_value):
            raise ValueError("Embedding values must be finite")
        dot_product += left_value * right_value
        left_norm_squared += left_value * left_value
        right_norm_squared += right_value * right_value

    if left_norm_squared == 0.0 or right_norm_squared == 0.0:
        return 0.0

    return dot_product / math.sqrt(left_norm_squared * right_norm_squared)


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


def cheap_filter_rejection_reason(text: str) -> str | None:
    normalized = text.strip().lower()
    if len(normalized) < env_int("ARCLI_MATCHING_MIN_POST_CHARS", 20):
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

    logger.info(
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
        on_rejected(rejection)


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

    candidates: list[CandidateMatch] = []
    cheap_filter_rejections = 0
    similarity_rejections = 0
    for post_embedding in post_embeddings:
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

        candidates.append(
            CandidateMatch(
                post_id=post_embedding.post_id,
                source=post_embedding.source,
                text=post_embedding.text,
                score=score,
                url=post_embedding.url,
                metadata=post_embedding.metadata,
            )
        )

    candidates.sort(key=lambda candidate: candidate.score, reverse=True)
    candidates = candidates[:resolved_max_candidates]

    logger.info(
        "candidate_matching_completed tenant_id=%s service_profile_id=%s posts=%s candidates=%s threshold=%.3f max_candidates=%s cheap_filter_rejections=%s similarity_rejections=%s",
        resolved_tenant_id,
        service_profile_id,
        len(post_embeddings),
        len(candidates),
        resolved_threshold,
        resolved_max_candidates,
        cheap_filter_rejections,
        similarity_rejections,
    )

    if not candidates:
        logger.warning(
            "tenant_zero_match_signals tenant_id=%s service_profile_id=%s posts=%s threshold=%.3f cheap_filter_rejections=%s similarity_rejections=%s",
            resolved_tenant_id,
            service_profile_id,
            len(post_embeddings),
            resolved_threshold,
            cheap_filter_rejections,
            similarity_rejections,
        )

    return candidates
