"""Shared contracts and safe helpers for public-source ingestion connectors."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from typing import Any, Literal, Mapping
from urllib.parse import urlsplit, urlunsplit

import httpx
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.services.cost_controls import env_int, provider_rate_limiter

logger = logging.getLogger(__name__)


_BLOCK_TAGS = frozenset({"br", "div", "p", "li", "blockquote", "pre"})
_SPAM_PATTERN = re.compile(
    r"\b(?:buy\s+now|casino|crypto\s+giveaway|free\s+followers|viagra)\b",
    re.IGNORECASE,
)

# Public source APIs generally treat consecutive query words as an AND or an
# exact phrase.  A full buyer-language sentence makes a good matching brief,
# but is usually far too specific for an issue tracker or technical forum.
# Keep the distinctive words people are likely to write, then let Arcli's
# embedding and verifier stages decide whether the post is actually a lead.
_DISCOVERY_SEARCH_STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "best",
        "by",
        "can",
        "could",
        "do",
        "does",
        "for",
        "from",
        "get",
        "how",
        "i",
        "in",
        "is",
        "it",
        "looking",
        "me",
        "more",
        "my",
        "need",
        "not",
        "of",
        "on",
        "or",
        "our",
        "please",
        "recommend",
        "recommendation",
        "recommendations",
        "should",
        "that",
        "the",
        "this",
        "to",
        "too",
        "use",
        "way",
        "we",
        "what",
        "which",
        "with",
        "would",
        "you",
        "your",
    }
)
_DISCOVERY_SEARCH_GENERIC_TERMS = frozenset(
    {
        "better",
        "manual",
        "manually",
        "platform",
        "process",
        "service",
        "solution",
        "software",
        "system",
        "tool",
        "tools",
        "workflow",
    }
)


class PublicSourcePost(BaseModel):
    """Provider-neutral content contract persisted in the global source corpus."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: str = Field(min_length=1, max_length=64)
    source_post_id: str = Field(min_length=1, max_length=1_024)
    author_handle: str | None = Field(default=None, max_length=512)
    title: str | None = Field(default=None, max_length=1_000)
    body: str = Field(min_length=1, max_length=20_000)
    url: str = Field(min_length=1, max_length=4_096)
    posted_at: datetime
    language: str | None = Field(default="en", max_length=64)
    embedding_status: Literal["pending", "completed", "failed"] = "pending"

    @field_validator("posted_at")
    @classmethod
    def _normalise_posted_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in _BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in _BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def text(self) -> str:
        return normalise_text(unescape("".join(self._parts)))


def env_positive_float(name: str, default: float) -> float:
    """Read a non-negative duration without allowing a malformed env to fail work."""
    try:
        return max(0.0, float(os.getenv(name, str(default))))
    except ValueError:
        return default


def env_positive_int(name: str, default: int) -> int:
    """Read a positive bounded-count configuration value."""
    return max(1, env_int(name, default))


def normalise_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()


def clip_text(value: str, limit: int) -> str:
    """Bound untrusted provider text before it reaches the shared database."""
    return value[: max(1, limit)].rstrip()


def compact_discovery_search_query(value: object, *, max_terms: int = 2) -> str:
    """Turn a natural buyer phrase into a recall-oriented source query.

    This intentionally does *not* decide whether a result is a lead. It only
    prevents provider search syntax from demanding that a prospect repeat a
    long generated phrase word-for-word. At least one meaningful term is kept
    and the original normalized value remains a safe fallback.
    """
    normalized = normalise_text(value)
    requested_limit = max(1, min(5, int(max_terms)))
    terms = re.findall(r"[a-z0-9][a-z0-9_-]*", normalized.casefold())
    meaningful_terms = [
        term
        for term in terms
        if term not in _DISCOVERY_SEARCH_STOP_WORDS
        and term not in _DISCOVERY_SEARCH_GENERIC_TERMS
        and len(term) > 1
    ]
    selected_terms = meaningful_terms[:requested_limit]
    if not selected_terms:
        selected_terms = [
            term
            for term in terms
            if term not in _DISCOVERY_SEARCH_STOP_WORDS and len(term) > 1
        ][:requested_limit]
    return " ".join(selected_terms) or clip_text(normalized, 200)


def html_to_text(value: object) -> str:
    """Convert provider-supplied HTML to readable bounded plain text."""
    if not isinstance(value, str) or not value.strip():
        return ""
    extractor = _HTMLTextExtractor()
    try:
        extractor.feed(value)
        extractor.close()
    except Exception:
        return normalise_text(re.sub(r"<[^>]+>", " ", unescape(value)))
    return extractor.text()


def parse_utc_datetime(value: object) -> datetime | None:
    """Parse common API timestamp formats into UTC without accepting junk."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def safe_http_url(value: object) -> str:
    """Accept only a canonical web URL; never persist script/data URLs from APIs."""
    if not isinstance(value, str):
        return ""
    candidate = value.strip()
    if not candidate or len(candidate) > 4_096:
        return ""
    try:
        parsed = urlsplit(candidate)
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return urlunsplit(parsed)


def is_probable_spam(value: str) -> bool:
    return bool(_SPAM_PATTERN.search(value))


def response_retry_after_seconds(response: httpx.Response) -> float | None:
    retry_after = response.headers.get("retry-after")
    if not retry_after:
        return None
    try:
        return max(0.0, float(retry_after))
    except ValueError:
        return None


async def fetch_json_with_retry(
    *,
    client: httpx.AsyncClient,
    url: str,
    params: Mapping[str, str],
    provider: str,
    requests_per_minute: int,
    max_attempts: int,
    log_event: str,
    page: int | str,
) -> dict[str, Any]:
    """Fetch one JSON page, retrying only timeouts and transient HTTP failures.

    The shared Redis-backed limiter coordinates independent worker processes.
    Queries and headers are intentionally omitted from logs because either can
    contain customer-specific language or credentials.
    """
    last_error: httpx.TimeoutException | httpx.HTTPStatusError | None = None
    for attempt in range(1, max(1, max_attempts) + 1):
        try:
            await provider_rate_limiter.wait_for_slot_async(
                provider=provider,
                limit=max(1, requests_per_minute),
            )
            response = await client.get(url, params=dict(params))
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("public source returned a non-object JSON payload")
            return payload
        except httpx.TimeoutException as exc:
            last_error = exc
            retryable = True
            retry_after_seconds = None
        except httpx.HTTPStatusError as exc:
            last_error = exc
            retryable = exc.response.status_code == 429 or exc.response.status_code >= 500
            retry_after_seconds = response_retry_after_seconds(exc.response)

        if not retryable or attempt >= max_attempts:
            raise last_error

        backoff_seconds = (
            retry_after_seconds
            if retry_after_seconds is not None
            else min(8.0, 0.5 * (2 ** (attempt - 1)))
        )
        # A long Retry-After should be handled by the durable worker retry,
        # rather than tying up a worker process for minutes.
        if backoff_seconds > 60.0:
            logger.warning(
                "%s_retry_deferred provider=%s page=%s retry_after_seconds=%.2f",
                log_event,
                provider,
                page,
                backoff_seconds,
            )
            raise last_error
        logger.warning(
            "%s_retry provider=%s page=%s attempt=%s wait_seconds=%.2f error_type=%s",
            log_event,
            provider,
            page,
            attempt,
            backoff_seconds,
            last_error.__class__.__name__,
        )
        await asyncio.sleep(backoff_seconds)

    raise RuntimeError("public_source_request_exhausted")
