import logging
import os
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential_jitter,
)

from api.services.cost_controls import (
    TenantQuotaGuard,
    env_float,
    env_int,
    provider_rate_limiter,
)
from api.services.openai_lifecycle import OpenAIClientOwner
from api.services.matching import (
    DEFAULT_SIMILARITY_THRESHOLD,
    REJECTION_INSUFFICIENT_SIMILARITY,
)

logger = logging.getLogger(__name__)

DecisionLabel = Literal["strong_match", "weak_match", "spam", "not_a_match"]
UrgencyLevel = Literal["none", "low", "medium", "high"]
SignalType = Literal[
    "buyer_pain",
    "urgent_failure",
    "recommendation_request",
    "manual_workflow_frustration",
    "category_tool_search",
    "switching_trigger",
]
MetadataValue = str | int | float | bool
VERIFIER_QUOTA_COUNTER = "llm_verifier"
VERIFIER_QUOTA_DEFAULT_LIMIT = 1_000
VERIFIER_QUOTA_DEFAULT_WINDOW_SECONDS = 86_400
# Persist this alongside a verdict. Bump it only when verifier instructions
# materially change lead eligibility, so cached decisions cannot survive a
# policy change while preserving normal tenant-scoped cache reuse.
VERIFIER_POLICY_VERSION = "buyer_outcome_v6_leads_and_potential_buyers"
# Keep the verifier gate aligned with the candidate prefilter by default. The
# verifier itself is the precision gate; a higher hidden default would make
# the recall-oriented matching threshold ineffective.
DEFAULT_VERIFIER_SIMILARITY_THRESHOLD = DEFAULT_SIMILARITY_THRESHOLD


class ServiceProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    company_name: str = Field(min_length=1)
    one_liner: str = Field(min_length=1)
    target_audience: list[str] = Field(min_length=1)
    core_problem_solved: str = Field(min_length=1)
    key_value_propositions: list[str] = Field(min_length=1)
    ideal_customer_pain_points: list[str] = Field(min_length=1)
    use_cases: list[str] = Field(default_factory=list)
    buying_triggers: list[str] = Field(default_factory=list)
    urgency_signals: list[str] = Field(default_factory=list)
    # Short, buyer-authentic phrases used to discover public conversations.
    # They are deliberately separate from the richer matching fields above so
    # search precision is under the workspace owner's control.
    search_terms: list[str] = Field(default_factory=list)
    negative_keywords: list[str] = Field(default_factory=list)

    @field_validator(
        "target_audience",
        "key_value_propositions",
        "ideal_customer_pain_points",
        "use_cases",
        "buying_triggers",
        "urgency_signals",
        "search_terms",
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
    # Kept optional for cache compatibility with verification payloads created
    # before assisted outreach was introduced.
    suggested_reply: str = Field(default="", max_length=2000)
    rejection_reason: str | None = Field(default=None)
    # These enrich the review experience without creating another LLM call.
    # Defaults keep historical cached verifier payloads valid and avoid
    # retroactively inventing evidence for old matches.
    pain_theme: str = Field(default="", max_length=240)
    signal_type: SignalType | None = Field(default=None)
    urgency_level: UrgencyLevel = Field(default="none")
    # Must be a verbatim excerpt from the public source. It is discarded by
    # VerifierService when it cannot be tied to the candidate text.
    urgency_reason: str = Field(default="", max_length=500)
    evidence_excerpt: str = Field(default="", max_length=700)
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


class VerifierService(OpenAIClientOwner):
    SYSTEM_PROMPT = (
        "Evaluate the candidate post against the Service Profile. Treat target "
        "audience, problem solved, pain points, buying triggers, urgency signals, "
        "search_terms, negative keywords, and excluded audiences as weighted "
        "relevance signals, not a checklist or hard requirements. Similar words or "
        "a product category alone are not evidence. A main lead must show a clear, "
        "real buyer problem that the service could plausibly solve. Return "
        "`strong_match` only for that direct evidence: a specific request, urgency, "
        "evaluation, tool/category search, switching signal, or concrete problem. "
        "A Potential buyer can be an earlier but still credible buyer signal: a relevant "
        "question, investigation, workflow frustration, failed outcome, or request from "
        "a person or team that the service could plausibly help. Return `match: true` and "
        "`weak_match` for a Potential buyer, even if the writer is not an exact target "
        "persona, does not mention every profile field, or does not explicitly say they "
        "are shopping for a solution. Do not require the writer to use the vendor's product-category, "
        "internal workflow, or operator terminology when they clearly describe the "
        "real outcome the service solves. For example, when a service helps a B2B "
        "software team find customers, an in-context team explicitly needing more "
        "signups or customers, asking how to reach customers, or struggling with "
        "manual outreach can be a match even without words such as prospect, lead, "
        "account matching, or buyer intent. Calibrate confidence so 0.30-0.54 represents a plausible "
        "Potential buyer and 0.55+ represents a clear main lead ready for human review. "
        "Reject only no plausible fit, clear conflicting audiences or use cases, spam, "
        "job postings, announcements, generic publisher content, or generic advice "
        "with no buyer situation. Negative keywords and excluded audiences are context "
        "for clear bad-fit content, not a reason to reject a post merely because it "
        "contains one of those words. You must return "
        "ONLY a JSON object with: `match` (boolean), `decision_label` (string: "
        "strong_match, weak_match, spam, not_a_match), `confidence` (float), "
        "`pain_detected` (string), `why_this_matches` (string), "
        "`suggested_reply` (string), `pain_theme` (string), `signal_type` "
        "(buyer_pain, urgent_failure, recommendation_request, "
        "manual_workflow_frustration, category_tool_search, switching_trigger, "
        "or null), `urgency_level` (none, low, medium, high), "
        "`urgency_reason` (string), `evidence_excerpt` (string), and "
        "`rejection_reason` (string or null). `urgency_reason` and "
        "`evidence_excerpt` must each be an exact short excerpt from the candidate "
        "post, or an empty string when no explicit evidence exists. For rejected posts, make "
        "`rejection_reason` explicit and concise and return an empty "
        "`suggested_reply`, empty `pain_theme`, null `signal_type`, `none` urgency, "
        "and empty evidence fields. For a match, write a concise, helpful public reply "
        "that responds directly to the person's pain without pressure, claims, "
        "or a mass-outreach tone."
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
        self._owns_client = False
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_VERIFIER_MODEL", "gpt-5.4-nano")
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

        try:
            result = self._verify_with_openai(
                candidate_post,
                service_profile,
                tenant_id=resolved_tenant_id,
                service_profile_id=resolved_service_profile_id,
            )
        except Exception as exc:
            logger.exception(
                "llm_verifier_failed tenant_id=%s service_profile_id=%s source_post_id=%s model=%s similarity_score=%.3f error_type=%s error=%s",
                resolved_tenant_id,
                resolved_service_profile_id,
                candidate_post.post_id,
                self.model,
                candidate_post.similarity_score,
                exc.__class__.__name__,
                exc,
            )
            raise
        if not result.match and not result.rejection_reason:
            result = result.model_copy(
                update={"rejection_reason": f"llm_{result.decision_label}"}
            )

        result = self._sanitize_source_evidence(result, candidate_post.text)

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

    @staticmethod
    def _normalize_evidence(value: str) -> str:
        """Normalize a candidate quote without changing its words."""

        return re.sub(r"\s+", " ", value).strip()

    @classmethod
    def _is_verbatim_source_excerpt(cls, excerpt: str, source_text: str) -> bool:
        normalized_excerpt = cls._normalize_evidence(excerpt).casefold()
        normalized_source = cls._normalize_evidence(source_text).casefold()
        # Tiny fragments are easy to match accidentally and are not useful
        # reviewer evidence. This also excludes blank/punctuation-only output.
        return len(normalized_excerpt) >= 8 and normalized_excerpt in normalized_source

    @classmethod
    def _sanitize_source_evidence(
        cls,
        result: VerificationResult,
        source_text: str,
    ) -> VerificationResult:
        """Keep source-grounded detail only; the verifier remains the gate.

        A matching decision is not changed here. The guard only prevents a
        dashboard from presenting model-generated wording as evidence or
        urgency when a reviewer cannot find it in the original public post.
        """

        if not result.match:
            return result.model_copy(
                update={
                    "pain_theme": "",
                    "signal_type": None,
                    "urgency_level": "none",
                    "urgency_reason": "",
                    "evidence_excerpt": "",
                }
            )

        evidence_excerpt = cls._normalize_evidence(result.evidence_excerpt)
        urgency_reason = cls._normalize_evidence(result.urgency_reason)
        evidence_is_valid = cls._is_verbatim_source_excerpt(evidence_excerpt, source_text)
        urgency_is_valid = cls._is_verbatim_source_excerpt(urgency_reason, source_text)

        update: dict[str, Any] = {
            "evidence_excerpt": evidence_excerpt if evidence_is_valid else "",
            "urgency_reason": urgency_reason if urgency_is_valid else "",
            "urgency_level": result.urgency_level if urgency_is_valid else "none",
        }
        if evidence_excerpt and not evidence_is_valid:
            logger.info(
                "verifier_evidence_excerpt_omitted reason=%s",
                "not_verbatim_source_excerpt",
            )
        if (urgency_reason or result.urgency_level != "none") and not urgency_is_valid:
            logger.info(
                "verifier_urgency_omitted reason=%s",
                "not_verbatim_source_excerpt",
            )
        return result.model_copy(update=update)

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
        *,
        tenant_id: str,
        service_profile_id: str,
    ) -> VerificationResult:
        client = self._get_client()
        provider_rate_limiter.wait_for_slot(
            provider="openai-chat",
            limit=env_int("ARCLI_OPENAI_CHAT_REQUESTS_PER_MINUTE", 500),
        )
        try:
            parse_completion = client.beta.chat.completions.parse
        except AttributeError as exc:
            raise RuntimeError(
                "OpenAI client does not support structured verifier parsing."
            ) from exc

        completion = parse_completion(
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
            response_format=VerificationResult,
            temperature=0.0,
            timeout=self.timeout_seconds,
        )

        message = completion.choices[0].message
        refusal = getattr(message, "refusal", None)
        if refusal:
            raise RuntimeError(f"OpenAI refused verification: {refusal}")

        parsed = getattr(message, "parsed", None)
        if isinstance(parsed, VerificationResult):
            return parsed
        if parsed:
            return VerificationResult.model_validate(parsed)

        logger.error(
            "openai_verifier_schema_parse_empty tenant_id=%s service_profile_id=%s source_post_id=%s model=%s",
            tenant_id,
            service_profile_id,
            candidate_post.post_id,
            self.model,
        )
        raise RuntimeError("OpenAI verifier returned no structured parsed payload.")

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
            "Use a practical lead-quality standard. The similarity score is "
            "only a cheap prefilter and must not be treated as proof of fit.\n\n"
            "Read the matching brief's buyer-language fields before judging the "
            "candidate. In particular, search_terms describe the buyer's desired "
            "outcome, not required vendor vocabulary. Treat target audience, problem "
            "solved, pain points, triggers, urgency, search terms, and exclusions as "
            "weighted relevance signals, not a checklist. A candidate may be an adjacent "
            "buyer if it shows one credible problem, investigation, workflow frustration, "
            "or request the service could plausibly address. Prefer a cautious `weak_match` "
            "when the post has one real, relevant buyer situation. Do not require an exact target "
            "audience, every profile field, company size, budget, or explicit intent to buy; "
            "reserve rejection for no plausible fit, clear bad-fit content, spam, or generic "
            "educational content without a buyer situation.\n\n"
            "Service Profile JSON:\n"
            f"{service_profile.model_dump_json(indent=2)}\n\n"
            "Candidate Post JSON:\n"
            f"{candidate_post.model_dump_json(indent=2)}"
        )
