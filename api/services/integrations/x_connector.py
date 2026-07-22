"""X (Twitter) recent-search connector for the public prospect corpus."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)


X_RECENT_SEARCH_URL = "https://api.x.com/2/tweets/search/recent"
_SPAM_PATTERN = re.compile(
    r"\b(?:airdrop|casino|crypto\s+giveaway|free\s+followers|viagra)\b",
    re.IGNORECASE,
)


class SourcePost(BaseModel):
    """Normalized public X post awaiting the shared embedding pipeline."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: Literal["twitter"] = "twitter"
    source_post_id: str = Field(min_length=1)
    author_handle: str | None = None
    title: str | None = None
    body: str = Field(min_length=1)
    url: str = Field(min_length=1)
    posted_at: datetime
    language: str | None = "en"
    embedding_status: Literal["pending", "completed", "failed"] = "pending"


# Keep the explicit name available to call sites that ingest multiple sources
# in the same module, while preserving the SourcePost connector contract.
TwitterSourcePost = SourcePost


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


class XConnector:
    """Fetch current X posts with pagination, rate limiting, and retry safety."""

    def __init__(
        self,
        *,
        bearer_token: str | None = None,
        base_url: str = X_RECENT_SEARCH_URL,
        timeout_seconds: float | None = None,
        request_interval_seconds: float | None = None,
        max_attempts: int | None = None,
    ) -> None:
        self.bearer_token = (
            bearer_token
            or os.getenv("X_BEARER_TOKEN")
            or os.getenv("TWITTER_BEARER_TOKEN")
            or os.getenv("ARCLI_X_BEARER_TOKEN")
            or ""
        ).strip()
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds or _env_positive_float(
            "ARCLI_X_HTTP_TIMEOUT_SECONDS", 20.0
        )
        self.request_interval_seconds = (
            request_interval_seconds
            if request_interval_seconds is not None
            else _env_positive_float("ARCLI_X_REQUEST_INTERVAL_SECONDS", 0.5)
        )
        self.max_attempts = max_attempts or _env_positive_int(
            "ARCLI_X_HTTP_MAX_ATTEMPTS", 3
        )

    async def fetch_recent_posts(
        self,
        query: str,
        since_timestamp: int,
        limit: int = 100,
    ) -> list[SourcePost]:
        """Return normalized recent X posts matching the supplied intent query."""
        normalized_query = self._search_query(query)
        if since_timestamp < 0:
            raise ValueError("since_timestamp must be a Unix timestamp")
        if limit < 1:
            return []
        if not self.bearer_token:
            raise RuntimeError("X_BEARER_TOKEN is required for X ingestion.")

        target_limit = min(limit, _env_positive_int("ARCLI_X_MAX_POSTS", 500))
        posts: list[SourcePost] = []
        seen_ids: set[str] = set()
        next_token: str | None = None
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.bearer_token}",
            "User-Agent": os.getenv(
                "ARCLI_X_USER_AGENT", "arcli-prospect-intelligence/1.0"
            ),
        }

        async with httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(self.timeout_seconds),
            follow_redirects=True,
        ) as client:
            while len(posts) < target_limit:
                payload = await self._fetch_page(
                    client,
                    query=normalized_query,
                    since_timestamp=since_timestamp,
                    next_token=next_token,
                    page_size=min(100, max(10, target_limit - len(posts))),
                )
                users = {
                    str(user.get("id")): user
                    for user in self._included_users(payload)
                    if user.get("id")
                }
                data = payload.get("data")
                if not isinstance(data, list) or not data:
                    break

                for tweet in data:
                    post = self._to_source_post(tweet, users, since_timestamp)
                    if not post or post.source_post_id in seen_ids:
                        continue
                    seen_ids.add(post.source_post_id)
                    posts.append(post)
                    if len(posts) >= target_limit:
                        break

                meta = payload.get("meta")
                candidate_token = meta.get("next_token") if isinstance(meta, dict) else None
                next_token = candidate_token if isinstance(candidate_token, str) else None
                if not next_token:
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
        next_token: str | None,
        page_size: int,
    ) -> dict[str, Any]:
        params = {
            "query": query,
            "start_time": datetime.fromtimestamp(
                since_timestamp, tz=timezone.utc
            ).isoformat().replace("+00:00", "Z"),
            "max_results": str(page_size),
            "tweet.fields": "created_at,author_id,lang,conversation_id",
            "expansions": "author_id",
            "user.fields": "username",
        }
        if next_token:
            params["next_token"] = next_token

        last_error: httpx.TimeoutException | httpx.HTTPStatusError | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise ValueError("X returned a non-object JSON payload")
                return payload
            except httpx.TimeoutException as exc:
                last_error = exc
                retryable = True
                retry_after_seconds = None
            except httpx.HTTPStatusError as exc:
                last_error = exc
                status_code = exc.response.status_code
                retryable = status_code == 429 or status_code >= 500 or status_code in {
                    408,
                    409,
                    425,
                }
                retry_after_seconds = self._retry_after_seconds(exc.response)

            if not retryable or attempt >= self.max_attempts:
                raise last_error

            backoff_seconds = (
                retry_after_seconds
                if retry_after_seconds is not None
                else min(30.0, 1.0 * (2 ** (attempt - 1)))
            )
            logger.warning(
                "x_api_retry query=%s attempt=%s wait_seconds=%.2f error_type=%s",
                query,
                attempt,
                backoff_seconds,
                last_error.__class__.__name__,
            )
            await asyncio.sleep(backoff_seconds)

        raise RuntimeError("x_api_request_exhausted")

    @staticmethod
    def _search_query(query: str) -> str:
        normalized = re.sub(r"\s+", " ", query).strip()
        if not normalized:
            raise ValueError("query is required")

        lower_query = normalized.lower()
        filters: list[str] = []
        if "lang:" not in lower_query:
            filters.append("lang:en")
        if "-is:retweet" not in lower_query:
            filters.append("-is:retweet")
        return f"{normalized} {' '.join(filters)}".strip()[:512]

    @staticmethod
    def _included_users(payload: dict[str, Any]) -> list[dict[str, Any]]:
        includes = payload.get("includes")
        users = includes.get("users") if isinstance(includes, dict) else None
        return [user for user in users if isinstance(user, dict)] if isinstance(users, list) else []

    @staticmethod
    def _retry_after_seconds(response: httpx.Response) -> float | None:
        retry_after = response.headers.get("retry-after")
        if retry_after:
            try:
                return max(0.0, float(retry_after))
            except ValueError:
                pass

        rate_limit_reset = response.headers.get("x-rate-limit-reset")
        if rate_limit_reset:
            try:
                return max(0.0, float(rate_limit_reset) - time.time())
            except ValueError:
                return None
        return None

    @staticmethod
    def _to_source_post(
        tweet: object,
        users: dict[str, dict[str, Any]],
        since_timestamp: int,
    ) -> SourcePost | None:
        if not isinstance(tweet, dict):
            return None

        source_post_id = str(tweet.get("id") or "").strip()
        body = re.sub(r"\s+", " ", str(tweet.get("text") or "")).strip()
        posted_at = XConnector._posted_at(tweet.get("created_at"))
        if (
            not source_post_id
            or len(body) < 2
            or _SPAM_PATTERN.search(body)
            or not posted_at
            or int(posted_at.timestamp()) < since_timestamp
        ):
            return None

        author_id = str(tweet.get("author_id") or "").strip()
        author = users.get(author_id, {})
        username = str(author.get("username") or "").lstrip("@").strip() or None
        url = (
            f"https://x.com/{username}/status/{source_post_id}"
            if username
            else f"https://x.com/i/web/status/{source_post_id}"
        )
        language = str(tweet.get("lang") or "").strip() or "en"

        try:
            return SourcePost(
                source_post_id=source_post_id,
                author_handle=username or author_id or None,
                title=body[:160],
                body=body,
                url=url,
                posted_at=posted_at,
                language=language,
            )
        except ValidationError:
            return None

    @staticmethod
    def _posted_at(value: object) -> datetime | None:
        if not isinstance(value, str):
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
