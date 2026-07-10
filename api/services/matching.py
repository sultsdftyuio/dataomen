import logging
import math
from typing import Sequence

from pydantic import BaseModel, ConfigDict, Field, field_validator

logger = logging.getLogger(__name__)

MetadataValue = str | int | float | bool


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


def find_candidate_matches(
    profile_embedding: Sequence[float],
    post_embeddings: Sequence[PostEmbedding],
    threshold: float = 0.4,
) -> list[CandidateMatch]:
    """
    Cheap semantic prefilter. This deliberately favors recall, while the LLM
    verifier remains the quality gate for false-positive reduction.
    """

    if not 0.0 <= threshold <= 1.0:
        raise ValueError("threshold must be between 0.0 and 1.0")

    candidates: list[CandidateMatch] = []
    for post_embedding in post_embeddings:
        score = cosine_similarity(profile_embedding, post_embedding.embedding)
        if score >= threshold:
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
    logger.info(
        "candidate_matching_completed posts=%s candidates=%s threshold=%.3f",
        len(post_embeddings),
        len(candidates),
        threshold,
    )
    return candidates
