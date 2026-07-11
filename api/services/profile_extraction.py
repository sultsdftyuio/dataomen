import logging
import os
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from api.services.cost_controls import TenantQuotaGuard, env_int

logger = logging.getLogger(__name__)

PROFILE_EXTRACTION_QUOTA_COUNTER = "profile_extraction"
PROFILE_EXTRACTION_QUOTA_DEFAULT_LIMIT = 100
PROFILE_EXTRACTION_QUOTA_DEFAULT_WINDOW_SECONDS = 86_400


class ServiceProfileDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    company_name: str = Field(
        description="The company or product name represented by the website."
    )
    one_liner: str = Field(
        description="A punchy, specific one-sentence summary of what the business does."
    )
    target_audience: list[str] = Field(
        description="Specific buyer personas, company types, or verticals this business serves."
    )
    core_problem_solved: str = Field(
        description="The primary business pain the service exists to solve."
    )
    key_value_propositions: list[str] = Field(
        description="Concrete claims, differentiators, or outcomes the service promises."
    )
    ideal_customer_pain_points: list[str] = Field(
        description="Likely pains felt by the customers who are most motivated to buy."
    )
    negative_keywords: list[str] = Field(
        description="Terms, industries, or intents Arcli should avoid matching for this service."
    )


class ProfileExtractor:
    SYSTEM_PROMPT = """
You are a seasoned B2B product marketer and demand-generation strategist.

Your job is to turn raw scraped website markdown into a crisp business profile
for Arcli, a B2B SaaS prospect matching engine. Read the website like a buyer:
infer who the product is truly for, what expensive business problem it solves,
and what pains would make an account highly likely to convert.

Be punchy, concrete, and commercially specific. Avoid generic phrasing like
"helps businesses grow" unless the website gives no better signal. Infer
negative_keywords by identifying audiences, industries, buying intents, or use
cases that would create bad-fit prospect matches, even when those exclusions are
not stated directly. Output exactly the requested schema.
""".strip()

    MAX_MARKDOWN_CHARS = 60_000

    def __init__(
        self,
        client: Any | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float = 60.0,
        quota_guard: TenantQuotaGuard | None = None,
    ) -> None:
        self.client = client
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_PROFILE_EXTRACTION_MODEL", "gpt-4o-mini")
        self.timeout_seconds = timeout_seconds
        self.quota_guard = quota_guard or TenantQuotaGuard()

    def extract_profile(
        self,
        markdown_content: str,
        *,
        tenant_id: str | None = None,
        service_profile_id: str | None = None,
        crawl_job_id: str | None = None,
    ) -> dict:
        """
        Extract a strict onboarding profile from scraped markdown.
        """
        if not markdown_content or not markdown_content.strip():
            logger.warning(
                "profile_extraction_rejected tenant_id=%s service_profile_id=%s crawl_job_id=%s rejection_reason=%s",
                tenant_id or "unknown",
                service_profile_id,
                crawl_job_id,
                "empty_markdown_content",
            )
            raise ValueError("markdown_content is required")

        quota = self.quota_guard.check_and_increment(
            tenant_id=tenant_id,
            counter_name=PROFILE_EXTRACTION_QUOTA_COUNTER,
            limit=env_int(
                "ARCLI_AI_DAILY_PROFILE_EXTRACTION_LIMIT",
                PROFILE_EXTRACTION_QUOTA_DEFAULT_LIMIT,
            ),
            window_seconds=env_int(
                "ARCLI_AI_DAILY_PROFILE_EXTRACTION_WINDOW_SECONDS",
                PROFILE_EXTRACTION_QUOTA_DEFAULT_WINDOW_SECONDS,
            ),
        )
        if not quota.allowed:
            logger.warning(
                "profile_extraction_skipped tenant_id=%s service_profile_id=%s crawl_job_id=%s rejection_reason=%s current_count=%s limit=%s window_seconds=%s",
                quota.tenant_id,
                service_profile_id,
                crawl_job_id,
                quota.rejection_reason,
                quota.current_count,
                quota.limit,
                quota.window_seconds,
            )
            raise RuntimeError("Profile extraction quota exceeded for tenant.")

        client = self.client or self._build_client()
        clipped_content = self._clip_markdown(
            markdown_content,
            tenant_id=quota.tenant_id,
            service_profile_id=service_profile_id,
            crawl_job_id=crawl_job_id,
        )

        try:
            completion = client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Synthesize this scraped website markdown into an "
                            "Arcli service profile:\n\n"
                            f"{clipped_content}"
                        ),
                    },
                ],
                response_format=ServiceProfileDraft,
                temperature=0.2,
                timeout=self.timeout_seconds,
            )
        except Exception as exc:
            logger.exception(
                "openai_profile_extraction_failed tenant_id=%s service_profile_id=%s crawl_job_id=%s model=%s markdown_chars=%s error_type=%s error=%s",
                quota.tenant_id,
                service_profile_id,
                crawl_job_id,
                self.model,
                len(markdown_content),
                exc.__class__.__name__,
                exc,
            )
            raise

        message = completion.choices[0].message
        refusal = getattr(message, "refusal", None)
        if refusal:
            logger.warning(
                "profile_extraction_refused tenant_id=%s service_profile_id=%s crawl_job_id=%s model=%s rejection_reason=%s",
                quota.tenant_id,
                service_profile_id,
                crawl_job_id,
                self.model,
                "openai_refusal",
            )
            raise RuntimeError(f"OpenAI refused profile extraction: {refusal}")

        parsed = getattr(message, "parsed", None)
        if parsed is None:
            logger.error(
                "profile_extraction_empty_response tenant_id=%s service_profile_id=%s crawl_job_id=%s model=%s failure_reason=%s",
                quota.tenant_id,
                service_profile_id,
                crawl_job_id,
                self.model,
                "missing_parsed_profile",
            )
            raise RuntimeError("OpenAI returned no parsed ServiceProfileDraft.")

        if isinstance(parsed, ServiceProfileDraft):
            profile = parsed
        else:
            profile = ServiceProfileDraft.model_validate(parsed)

        logger.info(
            "profile_extraction_completed tenant_id=%s service_profile_id=%s crawl_job_id=%s model=%s markdown_chars=%s target_audience_count=%s pain_point_count=%s negative_keyword_count=%s current_count=%s limit=%s",
            quota.tenant_id,
            service_profile_id,
            crawl_job_id,
            self.model,
            len(markdown_content),
            len(profile.target_audience),
            len(profile.ideal_customer_pain_points),
            len(profile.negative_keywords),
            quota.current_count,
            quota.limit,
        )

        return profile.model_dump()

    def _build_client(self) -> Any:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError(
                "openai is required for ProfileExtractor. Install it with "
                "`pip install openai`."
            ) from exc

        kwargs = {"api_key": self.api_key} if self.api_key else {}
        return OpenAI(**kwargs)

    def _clip_markdown(
        self,
        markdown_content: str,
        *,
        tenant_id: str,
        service_profile_id: str | None,
        crawl_job_id: str | None,
    ) -> str:
        content = markdown_content.strip()
        if len(content) <= self.MAX_MARKDOWN_CHARS:
            return content

        logger.info(
            "profile_extraction_markdown_clipped tenant_id=%s service_profile_id=%s crawl_job_id=%s chars=%s limit=%s",
            tenant_id,
            service_profile_id,
            crawl_job_id,
            len(content),
            self.MAX_MARKDOWN_CHARS,
        )
        return (
            content[: self.MAX_MARKDOWN_CHARS]
            + "\n\n[Content clipped for profile extraction context window.]"
        )
