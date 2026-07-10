import logging
import os
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


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
    ) -> None:
        self.client = client
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_PROFILE_EXTRACTION_MODEL", "gpt-4o-mini")
        self.timeout_seconds = timeout_seconds

    def extract_profile(self, markdown_content: str) -> dict:
        """
        Extract a strict onboarding profile from scraped markdown.
        """
        if not markdown_content or not markdown_content.strip():
            raise ValueError("markdown_content is required")

        client = self.client or self._build_client()
        clipped_content = self._clip_markdown(markdown_content)

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
        except Exception:
            logger.exception("openai_profile_extraction_failed")
            raise

        message = completion.choices[0].message
        refusal = getattr(message, "refusal", None)
        if refusal:
            raise RuntimeError(f"OpenAI refused profile extraction: {refusal}")

        parsed = getattr(message, "parsed", None)
        if parsed is None:
            raise RuntimeError("OpenAI returned no parsed ServiceProfileDraft.")

        if isinstance(parsed, ServiceProfileDraft):
            profile = parsed
        else:
            profile = ServiceProfileDraft.model_validate(parsed)

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

    def _clip_markdown(self, markdown_content: str) -> str:
        content = markdown_content.strip()
        if len(content) <= self.MAX_MARKDOWN_CHARS:
            return content

        logger.info(
            "profile_extraction_markdown_clipped chars=%s limit=%s",
            len(content),
            self.MAX_MARKDOWN_CHARS,
        )
        return (
            content[: self.MAX_MARKDOWN_CHARS]
            + "\n\n[Content clipped for profile extraction context window.]"
        )
