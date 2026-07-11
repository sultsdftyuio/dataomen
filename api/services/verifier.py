import json
import logging
import os
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential_jitter,
)

from api.services.cost_controls import TenantQuotaGuard, env_float, env_int
from api.services.matching import REJECTION_INSUFFICIENT_SIMILARITY

logger = logging.getLogger(__name__)

DecisionLabel = Literal["strong_match", "weak_match", "spam", "not_a_match"]
MetadataValue = str | int | float | bool
VERIFIER_QUOTA_COUNTER = "llm_verifier"
VERIFIER_QUOTA_DEFAULT_LIMIT = 1_000
VERIFIER_QUOTA_DEFAULT_WINDOW_SECONDS = 86_400
DEFAULT_VERIFIER_SIMILARITY_THRESHOLD = 0.4


class ServiceProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    company_name: str = Field(min_length=1)
    one_liner: str = Field(min_length=1)
    target_audience: list[str] = Field(min_length=1)
    core_problem_solved: str = Field(min_length=1)
    key_value_propositions: list[str] = Field(min_length=1)
    ideal_customer_pain_points: list[str] = Field(min_length=1)
    negative_keywords: list[str] = Field(default_factory=list)

    @field_validator(
        "target_audience",
        "key_value_propositions",
        "ideal_customer_pain_points",
        "negative_keywords",
    )
    @classmethod
    def validate_non_empty_items(cls, value: list[str]) -> list[str]:
        if any(not item.strip() for item in value):
            raise ValueError("list items must be non-empty strings")
        return value


class CandidatePost(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    post_id: str = Field(min_length=1)
    source: str = Field(default="reddit", min_length=1)
    text: str = Field(min_length=1)
    similarity_score: float = Field(ge=-1.0, le=1.0)
    url: str | None = Field(default=None)
    metadata: dict[str, MetadataValue] = Field(default_factory=dict)


class VerificationResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    match: bool
    decision_label: DecisionLabel
    confidence: float = Field(ge=0.0, le=1.0)
    pain_detected: str
    why_this_matches: str
    rejection_reason: str | None = Field(default=None)
    verifier_executed: bool = Field(default=True)


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
        "openai_verifier_retry attempt=%s wait_seconds=%.2f error_type=%s error=%s",
        retry_state.attempt_number,
        next_sleep,
        exception.__class__.__name__ if exception else "unknown",
        exception,
    )


class VerifierService:
    SYSTEM_PROMPT = (
        "Evaluate the candidate post against the Service Profile. A valid lead "
        "must show explicit pain, buying intent, or frustration that the Service "
        "Profile solves. Reject tutorials, spam, or job postings. You must return "
        "ONLY a JSON object with: `match` (boolean), `decision_label` (string: "
        "strong_match, weak_match, spam, not_a_match), `confidence` (float), "
        "`pain_detected` (string), `why_this_matches` (string), and "
        "`rejection_reason` (string or null). For rejected posts, make "
        "`rejection_reason` explicit and concise."
    )

    def __init__(
        self,
        client: Any | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float = 45.0,
        quota_guard: TenantQuotaGuard | None = None,
    ) -> None:
        self.client = client
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_VERIFIER_MODEL", "gpt-4o-mini")
        self.timeout_seconds = timeout_seconds
        self.quota_guard = quota_guard or TenantQuotaGuard()

    def verify(
        self,
        candidate_post: CandidatePost,
        service_profile: ServiceProfile,
        *,
        tenant_id: str | None = None,
        service_profile_id: str | None = None,
        enforce_similarity_gate: bool = True,
    ) -> VerificationResult:
        resolved_tenant_id = tenant_id or str(candidate_post.metadata.get("tenant_id", "unknown"))
        resolved_service_profile_id = service_profile_id or str(
            candidate_post.metadata.get("service_profile_id", "unknown")
        )
        threshold = env_float(
            "ARCLI_VERIFIER_MIN_SIMILARITY_THRESHOLD",
            env_float(
                "ARCLI_MATCHING_SIMILARITY_THRESHOLD",
                DEFAULT_VERIFIER_SIMILARITY_THRESHOLD,
            ),
        )

        if enforce_similarity_gate and candidate_post.similarity_score < threshold:
            result = VerificationResult(
                match=False,
                decision_label="not_a_match",
                confidence=0.0,
                pain_detected="",
                why_this_matches="Rejected before LLM verification because similarity was below threshold.",
                rejection_reason=REJECTION_INSUFFICIENT_SIMILARITY,
                verifier_executed=False,
            )
            logger.info(
                "llm_verifier_skipped tenant_id=%s service_profile_id=%s source_post_id=%s similarity_score=%.3f threshold=%.3f rejection_reason=%s",
                resolved_tenant_id,
                resolved_service_profile_id,
                candidate_post.post_id,
                candidate_post.similarity_score,
                threshold,
                result.rejection_reason,
            )
            return result

        quota = self.quota_guard.check_and_increment(
            tenant_id=resolved_tenant_id,
            counter_name=VERIFIER_QUOTA_COUNTER,
            limit=env_int("ARCLI_AI_DAILY_VERIFIER_LIMIT", VERIFIER_QUOTA_DEFAULT_LIMIT),
            window_seconds=env_int(
                "ARCLI_AI_DAILY_VERIFIER_WINDOW_SECONDS",
                VERIFIER_QUOTA_DEFAULT_WINDOW_SECONDS,
            ),
        )
        if not quota.allowed:
            result = VerificationResult(
                match=False,
                decision_label="not_a_match",
                confidence=0.0,
                pain_detected="",
                why_this_matches="Rejected before LLM verification because tenant quota was exceeded.",
                rejection_reason=quota.rejection_reason,
                verifier_executed=False,
            )
            logger.warning(
                "llm_verifier_skipped tenant_id=%s service_profile_id=%s source_post_id=%s similarity_score=%.3f threshold=%.3f rejection_reason=%s current_count=%s limit=%s",
                quota.tenant_id,
                resolved_service_profile_id,
                candidate_post.post_id,
                candidate_post.similarity_score,
                threshold,
                result.rejection_reason,
                quota.current_count,
                quota.limit,
            )
            return result

        result = self._verify_with_openai(candidate_post, service_profile)
        if not result.match and not result.rejection_reason:
            result = result.model_copy(
                update={"rejection_reason": f"llm_{result.decision_label}"}
            )

        logger.info(
            "candidate_verified tenant_id=%s service_profile_id=%s source_post_id=%s decision_label=%s match=%s confidence=%.3f similarity_score=%.3f rejection_reason=%s verifier_executed=%s",
            resolved_tenant_id,
            resolved_service_profile_id,
            candidate_post.post_id,
            result.decision_label,
            result.match,
            result.confidence,
            candidate_post.similarity_score,
            result.rejection_reason,
            result.verifier_executed,
        )
        return result

    @retry(
        retry=retry_if_exception(_is_retryable_openai_error),
        wait=wait_exponential_jitter(initial=1, max=20),
        stop=stop_after_attempt(4),
        before_sleep=_log_retry,
        reraise=True,
    )
    def _verify_with_openai(
        self,
        candidate_post: CandidatePost,
        service_profile: ServiceProfile,
    ) -> VerificationResult:
        client = self.client or self._build_client()
        completion = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": self._build_user_prompt(
                        candidate_post,
                        service_profile,
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
            timeout=self.timeout_seconds,
        )

        message = completion.choices[0].message
        refusal = getattr(message, "refusal", None)
        if refusal:
            raise RuntimeError(f"OpenAI refused verification: {refusal}")

        content = getattr(message, "content", None)
        if not content:
            raise RuntimeError("OpenAI verifier returned empty content.")

        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            logger.error(
                "openai_verifier_invalid_json source_post_id=%s response_chars=%s error_type=%s error=%s",
                candidate_post.post_id,
                len(content),
                exc.__class__.__name__,
                exc,
            )
            raise RuntimeError("OpenAI verifier returned invalid JSON.") from exc

        return VerificationResult.model_validate(payload)

    def _build_client(self) -> Any:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError(
                "openai is required for VerifierService. Install it with "
                "`pip install openai`."
            ) from exc

        kwargs = {"api_key": self.api_key} if self.api_key else {}
        return OpenAI(**kwargs)

    def _build_user_prompt(
        self,
        candidate_post: CandidatePost,
        service_profile: ServiceProfile,
    ) -> str:
        return (
            "Use a conservative lead-quality standard. The similarity score is "
            "only a cheap prefilter and must not be treated as proof of fit.\n\n"
            "Service Profile JSON:\n"
            f"{service_profile.model_dump_json(indent=2)}\n\n"
            "Candidate Post JSON:\n"
            f"{candidate_post.model_dump_json(indent=2)}"
        )
