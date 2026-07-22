"""Hacker News search connector backed by Algolia's public API."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)


ALGOLIA_HN_SEARCH_BY_DATE_URL = "https://hn.algolia.com/api/v1/search_by_date"
_BLOCK_TAGS = frozenset({"br", "div", "p", "li", "blockquote", "pre"})
_SPAM_PATTERN = re.compile(
    r"\b(?:buy\s+now|casino|crypto\s+giveaway|viagra)\b",
    re.IGNORECASE,
)


class SourcePost(BaseModel):
    """Normalized public source content awaiting the embedding pipeline."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: Literal["hackernews"] = "hackernews"
    source_post_id: str = Field(min_length=1)
    author_handle: str | None = None
    title: str | None = None
    body: str = Field(min_length=1)
    url: str = Field(min_length=1)
    posted_at: datetime
    language: str | None = "en"
    embedding_status: Literal["pending", "completed", "failed"] = "pending"


class _HTMLTextExtractor(HTMLParser):
    """Small dependency-free HTML-to-text converter for HN's HTML fields."""

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
        return re.sub(r"\s+", " ", unescape("".join(self._parts))).strip()


def sanitize_hn_html(value: object) -> str:
    """Return readable text from Algolia's ``comment_text``/``story_text``."""
    if not isinstance(value, str) or not value.strip():
        return ""

    extractor = _HTMLTextExtractor()
    try:
        extractor.feed(value)
        extractor.close()
    except Exception:
        # HN's content is user supplied.  Preserve plain text even if a malformed
        # HTML fragment makes the stdlib parser unhappy.
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", unescape(value))).strip()
    return extractor.text()


def _env_positive_float(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.getenv(name, str(default))))
    except ValueError:
        return default


def _env_positive_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except ValueError:
        return default


class HackerNewsConnector:
    """Fetch recent Hacker News stories and comments with bounded API retries."""

    def __init__(
        self,
        *,
        base_url: str = ALGOLIA_HN_SEARCH_BY_DATE_URL,
        timeout_seconds: float | None = None,
        request_interval_seconds: float | None = None,
        max_attempts: int | None = None,
    ) -> None:
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds or _env_positive_float(
            "ARCLI_HN_HTTP_TIMEOUT_SECONDS", 15.0
        )
        self.request_interval_seconds = (
            request_interval_seconds
            if request_interval_seconds is not None
            else _env_positive_float("ARCLI_HN_REQUEST_INTERVAL_SECONDS", 0.25)
        )
        self.max_attempts = max_attempts or _env_positive_int(
            "ARCLI_HN_HTTP_MAX_ATTEMPTS", 3
        )

    async def fetch_recent_posts(
        self,
        query: str,
        since_timestamp: int,
        limit: int = 100,
    ) -> list[SourcePost]:
        """Fetch and normalize the newest matching HN stories and comments.

        Algolia applies the timestamp filter server-side; the local timestamp
        check protects the ingestion boundary if an upstream response is stale.
        """
        normalized_query = query.strip()
        if not normalized_query:
            raise ValueError("query is required")
        if since_timestamp < 0:
            raise ValueError("since_timestamp must be a Unix timestamp")
        if limit < 1:
            return []

        target_limit = min(limit, _env_positive_int("ARCLI_HN_MAX_POSTS", 500))
        page_size = min(100, target_limit)
        posts: list[SourcePost] = []
        seen_ids: set[str] = set()
        page = 0

        headers = {
            "Accept": "application/json",
            "User-Agent": os.getenv(
                "ARCLI_HN_USER_AGENT", "arcli-prospect-intelligence/1.0"
            ),
        }
        timeout = httpx.Timeout(self.timeout_seconds)
        async with httpx.AsyncClient(
            headers=headers,
            timeout=timeout,
            follow_redirects=True,
        ) as client:
            while len(posts) < target_limit:
                payload = await self._fetch_page(
                    client,
                    query=normalized_query,
                    since_timestamp=since_timestamp,
                    page=page,
                    page_size=min(page_size, target_limit - len(posts)),
                )
                hits = payload.get("hits")
                if not isinstance(hits, list) or not hits:
                    break

                for hit in hits:
                    post = self._to_source_post(hit, since_timestamp)
                    if not post or post.source_post_id in seen_ids:
                        continue
                    seen_ids.add(post.source_post_id)
                    posts.append(post)
                    if len(posts) >= target_limit:
                        break

                page += 1
                page_count = payload.get("nbPages")
                if isinstance(page_count, int) and page >= page_count:
                    break
                if len(hits) < page_size:
                    break
                if self.request_interval_seconds:
                    await asyncio.sleep(self.request_interval_seconds)

        return posts

    async def _fetch_page(
        self,
        client: httpx.AsyncClient,
        *,
        query: str,
        since_timestamp: int,
        page: int,
        page_size: int,
    ) -> dict[str, Any]:
        params = {
            "query": query,
            "tags": "(story,comment)",
            "numericFilters": f"created_at_i>={since_timestamp}",
            "page": str(page),
            "hitsPerPage": str(page_size),
        }
        last_error: httpx.TimeoutException | httpx.HTTPStatusError | None = None

        for attempt in range(1, self.max_attempts + 1):
            try:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise ValueError("Algolia returned a non-object JSON payload")
                return payload
            except httpx.TimeoutException as exc:
                last_error = exc
                retryable = True
            except httpx.HTTPStatusError as exc:
                last_error = exc
                status_code = exc.response.status_code
                retryable = status_code == 429 or status_code >= 500 or status_code in {
                    408,
                    409,
                    425,
                }

            if not retryable or attempt >= self.max_attempts:
                raise last_error

            backoff_seconds = min(8.0, 0.5 * (2 ** (attempt - 1)))
            logger.warning(
                "hn_algolia_retry query=%s page=%s attempt=%s wait_seconds=%.2f error_type=%s",
                query,
                page,
                attempt,
                backoff_seconds,
                last_error.__class__.__name__,
            )
            await asyncio.sleep(backoff_seconds)

        # The loop always either returns or raises.  This keeps type checkers
        # aware that callers never receive an incomplete page.
        raise RuntimeError("hn_algolia_request_exhausted")

    @staticmethod
    def _to_source_post(hit: object, since_timestamp: int) -> SourcePost | None:
        if not isinstance(hit, dict):
            return None

        tags = {
            str(tag).lower()
            for tag in hit.get("_tags", [])
            if isinstance(tag, str)
        }
        is_comment = "comment" in tags
        if not tags.intersection({"story", "comment"}):
            return None
        if hit.get("deleted") or hit.get("dead") or {"deleted", "dead"}.intersection(tags):
            return None

        source_post_id = str(hit.get("objectID") or "").strip()
        author_handle = str(hit.get("author") or "").strip() or None
        raw_title = hit.get("story_title") if is_comment else hit.get("title")
        title = sanitize_hn_html(raw_title) or None
        raw_body = hit.get("comment_text") if is_comment else hit.get("story_text")
        body = sanitize_hn_html(raw_body)
        if not body and not is_comment:
            body = title or ""
        if (
            not source_post_id
            or len(body) < 2
            or _SPAM_PATTERN.search(body)
        ):
            return None

        posted_at = HackerNewsConnector._posted_at(hit)
        if not posted_at or int(posted_at.timestamp()) < since_timestamp:
            return None

        raw_url = hit.get("url") if not is_comment else None
        if not isinstance(raw_url, str) or not raw_url.strip():
            raw_url = hit.get("story_url") if not is_comment else None
        if isinstance(raw_url, str) and raw_url.startswith("//"):
            raw_url = f"https:{raw_url}"
        url = (
            raw_url.strip()
            if isinstance(raw_url, str) and raw_url.strip()
            else f"https://news.ycombinator.com/item?id={source_post_id}"
        )

        try:
            return SourcePost(
                source_post_id=source_post_id,
                author_handle=author_handle,
                title=title,
                body=body,
                url=url,
                posted_at=posted_at,
                language="en",
            )
        except ValidationError:
            return None

    @staticmethod
    def _posted_at(hit: dict[str, Any]) -> datetime | None:
        created_at = hit.get("created_at")
        if isinstance(created_at, str):
            try:
                parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return parsed.astimezone(timezone.utc)
            except ValueError:
                pass

        created_at_i = hit.get("created_at_i")
        if isinstance(created_at_i, (int, float)):
            try:
                return datetime.fromtimestamp(created_at_i, tz=timezone.utc)
            except (OverflowError, OSError, ValueError):
                return None
        return None
