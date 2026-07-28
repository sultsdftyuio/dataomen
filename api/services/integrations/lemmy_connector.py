"""Lemmy v4 public search connector for federated discussion posts."""

from __future__ import annotations

import asyncio
import os
import re
import time
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit

import httpx
from pydantic import ValidationError

from api.services.integrations.public_source import (
    PublicSourcePost,
    clip_text,
    env_positive_float,
    env_positive_int,
    fetch_json_with_retry,
    is_probable_spam,
    normalise_text,
    parse_utc_datetime,
    safe_http_url,
)


LEMMY_V4_SEARCH_URL = "https://lemmy.world/api/v4/search"


class LemmySourcePost(PublicSourcePost):
    source: Literal["lemmy"] = "lemmy"


SourcePost = LemmySourcePost


class LemmyConnector:
    """Fetch public, non-NSFW posts from a configured Lemmy v4 instance."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        timeout_seconds: float | None = None,
        request_interval_seconds: float | None = None,
        max_attempts: int | None = None,
        max_pages: int | None = None,
        requests_per_minute: int | None = None,
    ) -> None:
        self.base_url = (
            base_url
            or os.getenv("ARCLI_LEMMY_SEARCH_URL")
            or LEMMY_V4_SEARCH_URL
        ).strip().rstrip("/")
        self.source_root = self._source_root(self.base_url)
        if not self.source_root:
            raise ValueError("ARCLI_LEMMY_SEARCH_URL must be an absolute HTTP(S) URL")
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else env_positive_float("ARCLI_LEMMY_HTTP_TIMEOUT_SECONDS", 15.0)
        )
        self.request_interval_seconds = (
            request_interval_seconds
            if request_interval_seconds is not None
            else env_positive_float("ARCLI_LEMMY_REQUEST_INTERVAL_SECONDS", 1.0)
        )
        self.max_attempts = max(
            1,
            max_attempts
            if max_attempts is not None
            else env_positive_int("ARCLI_LEMMY_HTTP_MAX_ATTEMPTS", 3),
        )
        self.max_pages = max(
            1,
            max_pages
            if max_pages is not None
            else env_positive_int("ARCLI_LEMMY_MAX_PAGES", 1),
        )
        self.requests_per_minute = max(
            1,
            requests_per_minute
            if requests_per_minute is not None
            else env_positive_int("ARCLI_LEMMY_REQUESTS_PER_MINUTE", 15),
        )

    async def fetch_recent_posts(
        self,
        query: str,
        since_timestamp: int,
        limit: int = 100,
        *,
        max_pages: int | None = None,
    ) -> list[LemmySourcePost]:
        normalized_query = normalise_text(query)
        if not normalized_query:
            raise ValueError("query is required")
        # Lemmy v4 resolves URL search terms remotely. Discovery phrases are
        # plain buyer language, so reject URLs rather than turning a customer
        # input into an unexpected remote fetch through the provider.
        if re.search(r"https?://\S+", normalized_query, flags=re.IGNORECASE):
            raise ValueError("Lemmy URL queries are not supported")
        if since_timestamp < 0:
            raise ValueError("since_timestamp must be a Unix timestamp")
        if limit < 1:
            return []
        if max_pages is not None and max_pages < 1:
            raise ValueError("max_pages must be positive when provided")

        target_limit = min(limit, env_positive_int("ARCLI_LEMMY_MAX_POSTS", 100))
        page_cap = min(max_pages or self.max_pages, self.max_pages)
        page_size = min(50, target_limit)
        posts: list[LemmySourcePost] = []
        seen_ids: set[str] = set()
        page_cursor: str | None = None
        headers = {
            "Accept": "application/json",
            "User-Agent": os.getenv(
                "ARCLI_LEMMY_USER_AGENT", "arcli-prospect-intelligence/1.0"
            ),
        }

        async with httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(self.timeout_seconds),
            follow_redirects=True,
        ) as client:
            pages_fetched = 0
            while len(posts) < target_limit and pages_fetched < page_cap:
                payload = await self._fetch_page(
                    client,
                    query=normalized_query,
                    since_timestamp=since_timestamp,
                    page_cursor=page_cursor,
                    page_size=min(page_size, target_limit - len(posts)),
                    page=pages_fetched,
                )
                pages_fetched += 1
                hits = self._post_views(payload)
                if not hits:
                    break
                for hit in hits:
                    post = self._to_source_post(
                        hit,
                        since_timestamp=since_timestamp,
                        source_root=self.source_root,
                    )
                    if not post or post.source_post_id in seen_ids:
                        continue
                    seen_ids.add(post.source_post_id)
                    posts.append(post)
                    if len(posts) >= target_limit:
                        break

                candidate_cursor = payload.get("next_page")
                page_cursor = candidate_cursor if isinstance(candidate_cursor, str) else None
                if not page_cursor:
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
        page_cursor: str | None,
        page_size: int,
        page: int,
    ) -> dict[str, Any]:
        # Lemmy v4 calls the search text ``search_term`` and uses an opaque
        # ``page_cursor`` rather than numeric pagination.
        time_range_seconds = max(1, int(time.time()) - since_timestamp)
        params = {
            "search_term": query,
            "type_": "posts",
            "listing_type": "all",
            "show_nsfw": "false",
            "time_range_seconds": str(time_range_seconds),
            "limit": str(page_size),
        }
        if page_cursor:
            params["page_cursor"] = page_cursor
        return await fetch_json_with_retry(
            client=client,
            url=self.base_url,
            params=params,
            provider="lemmy-v4-search",
            requests_per_minute=self.requests_per_minute,
            max_attempts=self.max_attempts,
            log_event="lemmy_search",
            page=page,
        )

    @staticmethod
    def _post_views(payload: dict[str, Any]) -> list[dict[str, Any]]:
        # Current v4 uses ``posts``. ``items`` supports a transitional payload
        # shape without weakening the strict source-post mapper below.
        raw_items = payload.get("posts")
        if not isinstance(raw_items, list):
            raw_items = payload.get("items")
        return [item for item in raw_items if isinstance(item, dict)] if isinstance(raw_items, list) else []

    @staticmethod
    def _to_source_post(
        view: object,
        *,
        since_timestamp: int,
        source_root: str,
    ) -> LemmySourcePost | None:
        if not isinstance(view, dict):
            return None
        post = view.get("post")
        post = post if isinstance(post, dict) else {}
        community = view.get("community")
        community = community if isinstance(community, dict) else {}
        if (
            not post
            or post.get("deleted") is True
            or post.get("removed") is True
            or post.get("nsfw") is True
            or community.get("nsfw") is True
        ):
            return None

        post_id = str(post.get("id") or "").strip()
        title = clip_text(normalise_text(post.get("name")), 1_000) or None
        post_body = clip_text(normalise_text(post.get("body")), 18_500)
        body = clip_text(
            "\n\n".join(part for part in (title or "", post_body) if part),
            20_000,
        )
        posted_at = parse_utc_datetime(post.get("published_at")) or parse_utc_datetime(
            post.get("published")
        )
        ap_id = safe_http_url(post.get("ap_id"))
        canonical_url = ap_id or f"{source_root}/post/{post_id}"
        source_post_id = f"post:{ap_id or f'{urlsplit(source_root).hostname}:{post_id}'}"
        creator = view.get("creator")
        creator = creator if isinstance(creator, dict) else {}
        author_handle = normalise_text(creator.get("name")) or None
        if (
            not post_id
            or len(body) < 2
            or is_probable_spam(body)
            or not posted_at
            or int(posted_at.timestamp()) < since_timestamp
            or not safe_http_url(canonical_url)
        ):
            return None
        try:
            return LemmySourcePost(
                source_post_id=source_post_id,
                author_handle=author_handle,
                title=title,
                body=body,
                url=canonical_url,
                posted_at=posted_at,
                language="en",
            )
        except ValidationError:
            return None

    @staticmethod
    def _source_root(url: str) -> str:
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return ""
        return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))
