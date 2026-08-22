"""Extract clean, typed numerical metrics from one public webpage.

Example:
    OPENAI_API_KEY=... python Crawl4AI/extract_numeric_metrics.py \
        https://example.com/pricing

The script intentionally returns `null` for metrics that are not explicitly
present. It never guesses values from surrounding marketing language.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import math
import os
import re
import sys
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

logger = logging.getLogger(__name__)

DEFAULT_LLM_PROVIDER = "openai/gpt-4o-mini"
DEFAULT_PAGE_TIMEOUT_MS = 60_000

_CURRENCY_CODES = {"AED", "AUD", "CAD", "EUR", "GBP", "JPY", "USD"}
_CURRENCY_MARKS = "$€£¥"
_NUMBER_PATTERN = re.compile(
    r"(?P<number>[+-]?(?:\d+(?:\.\d*)?|\.\d+))"
    r"(?P<suffix>k|m|b|thousand|million|billion)?$",
    re.IGNORECASE,
)
_COMPACT_MULTIPLIERS = {
    "k": 1_000,
    "thousand": 1_000,
    "m": 1_000_000,
    "million": 1_000_000,
    "b": 1_000_000_000,
    "billion": 1_000_000_000,
}


class ExtractionError(RuntimeError):
    """Raised when the page or its model-generated extraction is unusable."""


def normalize_numeric_value(value: Any) -> float | None:
    """Convert common human number formats to a JSON-compatible float.

    Examples: ``$1,499.00`` -> ``1499.0`` and ``12.5k`` -> ``12500.0``.
    Percent values remain percentage points, so ``12.5%`` becomes ``12.5``.
    """

    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError("boolean values are not numeric metrics")
    if isinstance(value, (int, float)):
        numeric = float(value)
        if not math.isfinite(numeric):
            raise ValueError("numeric metrics must be finite")
        return numeric
    if not isinstance(value, str):
        raise ValueError(f"unsupported numeric value type: {type(value).__name__}")

    normalized = value.strip().casefold()
    if not normalized:
        raise ValueError("numeric metrics cannot be empty")

    is_parenthesized_negative = normalized.startswith("(") and normalized.endswith(")")
    if is_parenthesized_negative:
        normalized = normalized[1:-1].strip()

    normalized = re.sub(r"\b(?:aed|aud|cad|eur|gbp|jpy|usd)\b", "", normalized)
    normalized = normalized.replace(",", "").replace("_", "").replace(" ", "")
    normalized = normalized.strip(_CURRENCY_MARKS).removesuffix("%")
    match = _NUMBER_PATTERN.fullmatch(normalized)
    if match is None:
        raise ValueError(f"could not normalize numeric value: {value!r}")

    number = float(match.group("number"))
    multiplier = _COMPACT_MULTIPLIERS.get((match.group("suffix") or "").casefold(), 1)
    result = number * multiplier
    if is_parenthesized_negative:
        result = -abs(result)
    if not math.isfinite(result):
        raise ValueError("numeric metrics must be finite")
    return result


def normalize_integer_value(value: Any) -> int | None:
    """Normalize a count while rejecting fractional values such as ``12.5``."""

    numeric = normalize_numeric_value(value)
    if numeric is None:
        return None
    if not numeric.is_integer():
        raise ValueError(f"count must be a whole number, received {numeric}")
    return int(numeric)


class PageMetrics(BaseModel):
    """Strict numeric schema for a commercial, pricing, or KPI webpage.

    Adjust these fields for a domain-specific page, but retain the validators so
    LLM output such as "$1,499" or "12.5k" is safely converted to numbers.
    """

    model_config = ConfigDict(extra="forbid", strict=True)

    currency_code: str | None = Field(
        default=None,
        description="ISO-like currency code for monetary values, such as USD or AED.",
    )
    price: float | None = Field(default=None, description="Primary listed price.")
    monthly_revenue: float | None = Field(
        default=None,
        description="Explicit monthly revenue, if the page states it.",
    )
    annual_revenue: float | None = Field(
        default=None,
        description="Explicit annual revenue, if the page states it.",
    )
    customer_count: int | None = Field(
        default=None,
        description="Explicit customer, user, subscriber, or account count.",
    )
    employee_count: int | None = Field(
        default=None,
        description="Explicit team or employee count.",
    )
    conversion_rate_percent: float | None = Field(
        default=None,
        description="Conversion rate as percentage points: 12.5 means 12.5%.",
    )

    @field_validator(
        "price",
        "monthly_revenue",
        "annual_revenue",
        "conversion_rate_percent",
        mode="before",
    )
    @classmethod
    def normalize_decimal_fields(cls, value: Any) -> float | None:
        return normalize_numeric_value(value)

    @field_validator("customer_count", "employee_count", mode="before")
    @classmethod
    def normalize_count_fields(cls, value: Any) -> int | None:
        return normalize_integer_value(value)

    @field_validator("currency_code", mode="before")
    @classmethod
    def normalize_currency_code(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("currency_code must be a string or null")
        normalized = value.strip().upper()
        if normalized not in _CURRENCY_CODES:
            raise ValueError(
                f"currency_code must be one of {', '.join(sorted(_CURRENCY_CODES))} or null"
            )
        return normalized

    @model_validator(mode="after")
    def require_one_metric(self) -> "PageMetrics":
        metric_values = (
            self.price,
            self.monthly_revenue,
            self.annual_revenue,
            self.customer_count,
            self.employee_count,
            self.conversion_rate_percent,
        )
        if all(value is None for value in metric_values):
            raise ValueError("the page did not contain any explicit target metrics")
        return self


@dataclass(frozen=True)
class ExtractionSettings:
    provider: str
    api_token: str
    page_timeout_ms: int = DEFAULT_PAGE_TIMEOUT_MS


def settings_from_environment(*, provider: str | None = None) -> ExtractionSettings:
    api_token = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_token:
        raise ExtractionError("OPENAI_API_KEY is required for LLMExtractionStrategy.")
    return ExtractionSettings(
        provider=(provider or os.getenv("CRAWL4AI_LLM_PROVIDER") or DEFAULT_LLM_PROVIDER).strip(),
        api_token=api_token,
    )


def validate_target_url(target_url: str) -> str:
    parsed = urlparse(target_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ExtractionError("Target URL must be an absolute HTTP(S) URL.")
    return target_url


def parse_extracted_metrics(extracted_content: str) -> PageMetrics:
    """Parse Crawl4AI's JSON response and validate it with the strict schema."""

    try:
        payload = json.loads(extracted_content)
    except json.JSONDecodeError as exc:
        raise ExtractionError("LLM extraction did not return valid JSON.") from exc

    if isinstance(payload, list):
        if len(payload) != 1 or not isinstance(payload[0], dict):
            raise ExtractionError("Expected exactly one metrics object from the LLM extractor.")
        payload = payload[0]
    if not isinstance(payload, dict):
        raise ExtractionError("Expected the LLM extractor to return a JSON object.")

    try:
        return PageMetrics.model_validate(payload)
    except ValidationError as exc:
        raise ExtractionError(f"Extracted values did not satisfy the metrics schema: {exc}") from exc


def build_run_config(settings: ExtractionSettings) -> tuple[Any, Any]:
    """Build Crawl4AI's LLM strategy and run config without import-time side effects."""

    try:
        from crawl4ai import CacheMode, CrawlerRunConfig, LLMConfig
        from crawl4ai.extraction_strategy import LLMExtractionStrategy
    except ImportError as exc:
        raise ExtractionError(
            "Crawl4AI is not installed. Run `pip install -r Crawl4AI/requirements.txt` "
            "and `playwright install chromium`."
        ) from exc

    strategy = LLMExtractionStrategy(
        llm_config=LLMConfig(provider=settings.provider, api_token=settings.api_token),
        schema=PageMetrics.model_json_schema(),
        extraction_type="schema",
        input_format="markdown",
        apply_chunking=False,
        instruction=(
            "Extract only explicitly stated numeric values into the provided schema. "
            "Return exactly one JSON object and use null for absent fields. "
            "Never infer, estimate, calculate, or copy a value from a comparison. "
            "Return JSON numbers, not strings. Normalize '$1,499.00' to 1499.0, "
            "'12.5k' to 12500, and '12.5%' to 12.5. Keep conversion rates as "
            "percentage points. Use an allowed ISO-like currency code only when it "
            "is explicitly shown next to monetary values."
        ),
        extra_args={"temperature": 0, "max_tokens": 600},
    )
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        page_timeout=settings.page_timeout_ms,
        word_count_threshold=20,
        exclude_external_links=True,
        extraction_strategy=strategy,
    )
    return strategy, run_config


async def extract_page_metrics(
    target_url: str,
    *,
    settings: ExtractionSettings,
) -> PageMetrics:
    """Crawl one page asynchronously and return schema-validated metrics."""

    target_url = validate_target_url(target_url)
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig
    except ImportError as exc:
        raise ExtractionError(
            "Crawl4AI is not installed. Run `pip install -r Crawl4AI/requirements.txt` "
            "and `playwright install chromium`."
        ) from exc

    strategy, run_config = build_run_config(settings)
    browser_config = BrowserConfig(headless=True, verbose=False)
    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=target_url, config=run_config)
        if not result.success:
            raise ExtractionError(result.error_message or "Crawl4AI could not crawl the page.")
        if not result.extracted_content:
            raise ExtractionError("Crawl4AI returned no structured content.")
        return parse_extracted_metrics(result.extracted_content)
    except ExtractionError:
        raise
    except Exception as exc:
        logger.exception("crawl4ai_numeric_extraction_failed target_url=%s", target_url)
        raise ExtractionError("Crawl4AI extraction failed. Check the page and crawler logs.") from exc
    finally:
        show_usage = getattr(strategy, "show_usage", None)
        if callable(show_usage):
            show_usage()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract typed numerical metrics from one public webpage using Crawl4AI.",
    )
    parser.add_argument("url", help="Absolute public HTTP(S) URL to crawl.")
    parser.add_argument(
        "--provider",
        help=f"Crawl4AI LLM provider/model (default: {DEFAULT_LLM_PROVIDER}).",
    )
    return parser.parse_args(argv)


async def async_main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        settings = settings_from_environment(provider=args.provider)
        metrics = await extract_page_metrics(args.url, settings=settings)
    except ExtractionError as exc:
        logger.error("numeric_metric_extraction_failed error=%s", exc)
        return 2

    print(metrics.model_dump_json(indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(levelname)s %(message)s")
    return asyncio.run(async_main(argv))


if __name__ == "__main__":
    sys.exit(main())
