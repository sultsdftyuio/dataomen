"""Stack Exchange advanced-search connector for public buyer-problem signals."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any, Literal

import httpx
from pydantic import ValidationError

from api.services.integrations.public_source import (
    PublicSourcePost,
    clip_text,
    env_positive_float,
    env_positive_int,
    fetch_json_with_retry,
    html_to_text,
    is_probable_spam,
    normalise_text,
    parse_utc_datetime,
    safe_http_url,
)

logger = logging.getLogger(__name__)


STACKEXCHANGE_ADVANCED_SEARCH_URL = "https://api.stackexchange.com/2.3/search/advanced"
_SITE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.-]{0,127}$")


class StackExchangeSourcePost(PublicSourcePost):
    source: Literal["stackexchange"] = "stackexchange"


SourcePost = StackExchangeSourcePost


class StackExchangeConnector:
    """Fetch recent public questions from one configured Stack Exchange site."""

    def __init__(
        self,
        *,
        site: str | None = None,
        api_key: str | None = None,
        base_url: str = STACKEXCHANGE_ADVANCED_SEARCH_URL,
        timeout_seconds: float | None = None,
        request_interval_seconds: float | None = None,
        max_attempts: int | None = None,
        max_pages: int | None = None,
        requests_per_minute: int | None = None,
    ) -> None:
        configured_site = normalise_text(
            site or os.getenv("ARCLI_STACKEXCHANGE_SITE", "stackoverflow")
        ).lower()
        if not _SITE_PATTERN.fullmatch(configured_site):
            raise ValueError("ARCLI_STACKEXCHANGE_SITE must be a Stack Exchange site slug")
        self.site = configured_site
        self.api_key = (
            api_key
            or os.getenv("ARCLI_STACKEXCHANGE_API_KEY")
            or os.getenv("STACKEXCHANGE_API_KEY")
            or ""
        ).strip()
        self.base_url = base_url
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else env_positive_float("ARCLI_STACKEXCHANGE_HTTP_TIMEOUT_SECONDS", 15.0)
        )
        self.request_interval_seconds = (
            request_interval_seconds
            if request_interval_seconds is not None
            else env_positive_float("ARCLI_STACKEXCHANGE_REQUEST_INTERVAL_SECONDS", 0.5)
        )
        self.max_attempts = (
            max_attempts
            if max_attempts is not None
            else env_positive_int("ARCLI_STACKEXCHANGE_HTTP_MAX_ATTEMPTS", 3)
        )
        self.max_pages = max(
            1,
            max_pages
            if max_pages is not None
            else env_positive_int("ARCLI_STACKEXCHANGE_MAX_PAGES", 1),
        )
        self.requests_per_minute = max(
            1,
            requests_per_minute
            if requests_per_minute is not None
            else env_positive_int("ARCLI_STACKEXCHANGE_REQUESTS_PER_MINUTE", 15),
        )

    async def fetch_recent_posts(
        self,
        query: str,
        since_timestamp: int,
        limit: int = 100,
        *,
        max_pages: int | None = None,
    ) -> list[StackExchangeSourcePost]:
        normalized_query = normalise_text(query)
        if not normalized_query:
            raise ValueError("query is required")
        if since_timestamp < 0:
            raise ValueError("since_timestamp must be a Unix timestamp")
        if limit < 1:
            return []
        if max_pages is not None and max_pages < 1:
            raise ValueError("max_pages must be positive when provided")

        target_limit = min(
            limit,
            env_positive_int("ARCLI_STACKEXCHANGE_MAX_POSTS", 100),
        )
        page_cap = min(max_pages or self.max_pages, self.max_pages)
        posts: list[StackExchangeSourcePost] = []
        seen_ids: set[str] = set()
        page = 1
        headers = {
            "Accept": "application/json",
            "User-Agent": os.getenv(
                "ARCLI_STACKEXCHANGE_USER_AGENT", "arcli-prospect-intelligence/1.0"
            ),
        }

        async with httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(self.timeout_seconds),
            follow_redirects=True,
        ) as client:
            while len(posts) < target_limit and page <= page_cap:
                payload = await self._fetch_page(
                    client,
                    query=normalized_query,
                    since_timestamp=since_timestamp,
                    page=page,
                    page_size=min(100, target_limit - len(posts)),
                )
                hits = payload.get("items")
                if not isinstance(hits, list) or not hits:
                    break
                for hit in hits:
                    post = self._to_source_post(hit, since_timestamp, self.site)
                    if not post or post.source_post_id in seen_ids:
                        continue
                    seen_ids.add(post.source_post_id)
                    posts.append(post)
                    if len(posts) >= target_limit:
                        break

                if not payload.get("has_more"):
                    break
                if payload.get("quota_remaining") == 0:
                    logger.info(
                        "stackexchange_quota_exhausted site=%s page=%s",
                        self.site,
                        page,
                    )
                    break
                page += 1
                wait_seconds = self._inter_page_wait_seconds(payload)
                if wait_seconds > 60.0:
                    logger.warning(
                        "stackexchange_backoff_deferred site=%s page=%s wait_seconds=%.2f",
                        self.site,
                        page,
                        wait_seconds,
                    )
                    break
                if wait_seconds:
                    await asyncio.sleep(wait_seconds)

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
            "site": self.site,
            "q": query,
            "fromdate": str(since_timestamp),
            "sort": "creation",
            "order": "desc",
            "filter": "withbody",
            "page": str(page),
            "pagesize": str(page_size),
        }
        if self.api_key:
            params["key"] = self.api_key
        return await fetch_json_with_retry(
            client=client,
            url=self.base_url,
            params=params,
            provider="stackexchange-advanced-search",
            requests_per_minute=self.requests_per_minute,
            max_attempts=max(1, self.max_attempts),
            log_event="stackexchange_search",
            page=page,
        )

    def _inter_page_wait_seconds(self, payload: dict[str, Any]) -> float:
        backoff = payload.get("backoff")
        if isinstance(backoff, (int, float)) and not isinstance(backoff, bool):
            return max(self.request_interval_seconds, float(backoff))
        return self.request_interval_seconds

    @staticmethod
    def _to_source_post(
        item: object,
        since_timestamp: int,
        site: str,
    ) -> StackExchangeSourcePost | None:
        if not isinstance(item, dict):
            return None
        question_id = str(item.get("question_id") or "").strip()
        title = clip_text(html_to_text(item.get("title")), 1_000) or None
        question_body = clip_text(html_to_text(item.get("body")), 20_000)
        body = question_body or title or ""
        posted_at = parse_utc_datetime(item.get("creation_date"))
        url = safe_http_url(item.get("link"))
        owner = item.get("owner")
        owner = owner if isinstance(owner, dict) else {}
        author_handle = normalise_text(owner.get("display_name")) or None
        if (
            not question_id
            or len(body) < 2
            or is_probable_spam(body)
            or not posted_at
            or int(posted_at.timestamp()) < since_timestamp
            or not url
        ):
            return None
        try:
            return StackExchangeSourcePost(
                source_post_id=f"{site}:{question_id}",
                author_handle=author_handle,
                title=title,
                body=body,
                url=url,
                posted_at=posted_at,
                language=None,
            )
        except ValidationError:
            return None
