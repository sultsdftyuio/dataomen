import logging
import math
import os
from typing import Any, Sequence

from pydantic import BaseModel, ConfigDict, Field, field_validator
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential_jitter,
)

logger = logging.getLogger(__name__)


EMBEDDING_MODEL = "text-embedding-3-small"
MAX_EMBEDDING_INPUT_CHARS = 32_000


class EmbeddingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    text: str = Field(
        min_length=1,
        max_length=MAX_EMBEDDING_INPUT_CHARS,
        description="Text to embed for semantic matching.",
    )
    model: str = Field(
        default=EMBEDDING_MODEL,
        min_length=1,
        description="OpenAI embedding model to use.",
    )


class EmbeddingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    model: str = Field(description="Embedding model used by OpenAI.")
    embedding: list[float] = Field(
        min_length=1,
        description="Dense embedding vector returned by OpenAI.",
    )
    dimensions: int = Field(gt=0, description="Number of vector dimensions.")

    @field_validator("embedding")
    @classmethod
    def validate_embedding(cls, value: list[float]) -> list[float]:
        if any(not isinstance(item, float) or not math.isfinite(item) for item in value):
            raise ValueError("embedding must contain only finite floats")
        return value


def _is_retryable_openai_error(exception: BaseException) -> bool:
    status_code = getattr(exception, "status_code", None)
    if status_code in {408, 409, 429, 500, 502, 503, 504}:
        return True

    return exception.__class__.__name__ in {
        "APIConnectionError",
        "APITimeoutError",
        "InternalServerError",
        "RateLimitError",
    }


def _log_retry(retry_state: RetryCallState) -> None:
    exception = retry_state.outcome.exception() if retry_state.outcome else None
    next_sleep = getattr(retry_state.next_action, "sleep", 0.0) or 0.0
    logger.warning(
        "openai_embedding_retry attempt=%s wait_seconds=%.2f error_type=%s error=%s",
        retry_state.attempt_number,
        next_sleep,
        exception.__class__.__name__ if exception else "unknown",
        exception,
    )


class EmbeddingService:
    """
    Thin OpenAI embedding boundary for the Phase 1 in-memory matching engine.
    """

    def __init__(
        self,
        client: Any | None = None,
        api_key: str | None = None,
        model: str = EMBEDDING_MODEL,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.client = client
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.timeout_seconds = timeout_seconds

    def embed_text(self, request: EmbeddingRequest | str) -> EmbeddingResponse:
        payload = (
            request
            if isinstance(request, EmbeddingRequest)
            else EmbeddingRequest(text=request, model=self.model)
        )

        embedding = self._create_embedding(payload.text, payload.model)
        result = EmbeddingResponse(
            model=payload.model,
            embedding=embedding,
            dimensions=len(embedding),
        )
        logger.info(
            "embedding_generated model=%s dimensions=%s input_chars=%s",
            result.model,
            result.dimensions,
            len(payload.text),
        )
        return result

    def embed_many(
        self,
        requests: Sequence[EmbeddingRequest] | Sequence[str],
    ) -> list[EmbeddingResponse]:
        return [self.embed_text(request) for request in requests]

    @retry(
        retry=retry_if_exception(_is_retryable_openai_error),
        wait=wait_exponential_jitter(initial=1, max=20),
        stop=stop_after_attempt(5),
        before_sleep=_log_retry,
        reraise=True,
    )
    def _create_embedding(self, text: str, model: str) -> list[float]:
        client = self.client or self._build_client()
        response = client.embeddings.create(
            model=model,
            input=text,
            timeout=self.timeout_seconds,
        )

        data = getattr(response, "data", None)
        if not data:
            raise RuntimeError("OpenAI returned no embedding data.")

        embedding = data[0].embedding
        if not isinstance(embedding, list) or not embedding:
            raise RuntimeError("OpenAI returned an invalid embedding vector.")

        return [float(value) for value in embedding]

    def _build_client(self) -> Any:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError(
                "openai is required for EmbeddingService. Install it with "
                "`pip install openai`."
            ) from exc

        kwargs = {"api_key": self.api_key} if self.api_key else {}
        return OpenAI(**kwargs)
