"""Bluesky public AppView search connector for the shared prospect corpus."""

from __future__ import annotations

import asyncio
import os
import re
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import quote

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
)


# ``public.api.bsky.app`` currently rejects otherwise valid unauthenticated
# search requests with HTTP 403.  ``api.bsky.app`` serves the same AppView
# lexicon and accepts public search traffic.  Keep the URL injectable for a
# self-hosted AppView or a future provider migration.
BLUESKY_SEARCH_POSTS_URL = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts"
_AT_POST_URI_PATTERN = re.compile(
    r"^at://(?P<repo>[^/]+)/app\.bsky\.feed\.post/(?P<rkey>[^/?#]+)$"
)


class BlueskySourcePost(PublicSourcePost):
    source: Literal["bluesky"] = "bluesky"


# Keep the common connector import name available while giving callers a
# provider-specific type for multi-source ingestion code.
SourcePost = BlueskySourcePost


class BlueskyConnector:
    """Fetch recent public Bluesky posts without requiring customer credentials."""

    def __init__(
        self,
        *,
        base_url: str = BLUESKY_SEARCH_POSTS_URL,
        timeout_seconds: float | None = None,
        request_interval_seconds: float | None = None,
        max_attempts: int | None = None,
        max_pages: int | None = None,
        requests_per_minute: int | None = None,
    ) -> None:
        configured_url = (os.getenv("ARCLI_BLUESKY_SEARCH_URL") or base_url).strip()
        # Older deployments used public.api.bsky.app. That host now rejects
        # public post search even for otherwise valid requests, which turns an
        # entire discovery source into a silent zero-result scan. Preserve
        # genuinely custom/self-hosted URLs, but transparently repair this
        # known obsolete AppView host.
        self.base_url = configured_url.replace(
            "https://public.api.bsky.app/",
            "https://api.bsky.app/",
            1,
        )
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else env_positive_float("ARCLI_BLUESKY_HTTP_TIMEOUT_SECONDS", 15.0)
        )
        self.request_interval_seconds = (
            request_interval_seconds
            if request_interval_seconds is not None
            else env_positive_float("ARCLI_BLUESKY_REQUEST_INTERVAL_SECONDS", 1.0)
        )
        self.max_attempts = (
            max_attempts
            if max_attempts is not None
            else env_positive_int("ARCLI_BLUESKY_HTTP_MAX_ATTEMPTS", 3)
        )
        self.max_pages = max(
            1,
            max_pages
            if max_pages is not None
            else env_positive_int("ARCLI_BLUESKY_MAX_PAGES", 2),
        )
        self.requests_per_minute = max(
            1,
            requests_per_minute
            if requests_per_minute is not None
            else env_positive_int("ARCLI_BLUESKY_REQUESTS_PER_MINUTE", 30),
        )

    async def fetch_recent_posts(
        self,
        query: str,
        since_timestamp: int,
        limit: int = 100,
        *,
        max_pages: int | None = None,
    ) -> list[BlueskySourcePost]:
        normalized_query = normalise_text(query)
        if not normalized_query:
            raise ValueError("query is required")
        if since_timestamp < 0:
            raise ValueError("since_timestamp must be a Unix timestamp")
        if limit < 1:
            return []
        if max_pages is not None and max_pages < 1:
            raise ValueError("max_pages must be positive when provided")

        target_limit = min(limit, env_positive_int("ARCLI_BLUESKY_MAX_POSTS", 200))
        page_cap = min(max_pages or self.max_pages, max(1, self.max_pages))
        page_size = min(100, target_limit)
        posts: list[BlueskySourcePost] = []
        seen_ids: set[str] = set()
        cursor: str | None = None
        headers = {
            "Accept": "application/json",
            "User-Agent": os.getenv(
                "ARCLI_BLUESKY_USER_AGENT", "arcli-prospect-intelligence/1.0"
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
                    cursor=cursor,
                    page_size=min(page_size, target_limit - len(posts)),
                    page=pages_fetched,
                )
                pages_fetched += 1
                hits = payload.get("posts")
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

                candidate_cursor = payload.get("cursor")
                cursor = candidate_cursor if isinstance(candidate_cursor, str) else None
                if not cursor:
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
        cursor: str | None,
        page_size: int,
        page: int,
    ) -> dict[str, Any]:
        params = {
            "q": query,
            "limit": str(page_size),
            "sort": "latest",
            "since": datetime.fromtimestamp(
                since_timestamp, tz=timezone.utc
            ).isoformat().replace("+00:00", "Z"),
            "lang": "en",
        }
        if cursor:
            params["cursor"] = cursor
        return await fetch_json_with_retry(
            client=client,
            url=self.base_url,
            params=params,
            provider="bluesky-search-posts",
            requests_per_minute=max(1, self.requests_per_minute),
            max_attempts=max(1, self.max_attempts),
            log_event="bluesky_search",
            page=page,
        )

    @staticmethod
    def _to_source_post(
        hit: object,
        since_timestamp: int,
    ) -> BlueskySourcePost | None:
        if not isinstance(hit, dict):
            return None
        uri = normalise_text(hit.get("uri"))
        uri_match = _AT_POST_URI_PATTERN.fullmatch(uri)
        record = hit.get("record")
        if not uri_match or not isinstance(record, dict):
            return None

        author = hit.get("author")
        author = author if isinstance(author, dict) else {}
        if BlueskyConnector._has_public_web_opt_out(hit, author):
            return None

        body = clip_text(normalise_text(record.get("text")), 20_000)
        posted_at = parse_utc_datetime(record.get("createdAt")) or parse_utc_datetime(
            hit.get("indexedAt")
        )
        if (
            len(body) < 2
            or is_probable_spam(body)
            or not posted_at
            or int(posted_at.timestamp()) < since_timestamp
        ):
            return None

        handle = normalise_text(author.get("handle")) or None
        did = normalise_text(author.get("did")) or None
        repo = uri_match.group("repo")
        permalink = BlueskyConnector._permalink(
            repo=repo,
            rkey=uri_match.group("rkey"),
            did=did,
        )
        if not permalink:
            return None
        languages = hit.get("langs")
        if not isinstance(languages, list):
            languages = record.get("langs")
        language = next(
            (
                normalise_text(candidate)
                for candidate in languages
                if normalise_text(candidate)
            ),
            "en",
        ) if isinstance(languages, list) else "en"

        try:
            return BlueskySourcePost(
                source_post_id=uri,
                author_handle=handle,
                title=clip_text(body, 1_000),
                body=body,
                url=permalink,
                posted_at=posted_at,
                language=clip_text(language, 64),
            )
        except ValidationError:
            return None

    @staticmethod
    def _permalink(*, repo: str, rkey: str, did: str | None) -> str:
        # A handle can change; use the DID returned by AppView where present.
        profile = did or repo
        if not profile or not rkey:
            return ""
        return (
            "https://bsky.app/profile/"
            f"{quote(profile, safe='.-:')}/post/{quote(rkey, safe='-_') }"
        )

    @staticmethod
    def _has_public_web_opt_out(
        hit: dict[str, Any],
        author: dict[str, Any],
    ) -> bool:
        for raw_labels in (hit.get("labels"), author.get("labels")):
            if not isinstance(raw_labels, list):
                continue
            for label in raw_labels:
                value = (
                    normalise_text(label.get("val"))
                    if isinstance(label, dict)
                    else normalise_text(label)
                )
                if value == "!no-unauthenticated":
                    return True
        return False
