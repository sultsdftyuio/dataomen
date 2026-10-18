"""Discourse forum search for a customer-chosen competitor community.

Many software companies run their public community on Discourse, where
unhappy users ask for alternatives or describe switching. Discourse has no
global index, so this connector only ever searches one forum that a workspace
named as a buyer-group place, and only when the operator has switched the
source on (``ARCLI_DISCOURSE_INGESTION_ENABLED``) after checking that forum's
terms.

The forum host comes from customer input, so every request is resolved once,
must point only at public addresses, and is pinned to that address. Redirects
are not followed. One search request returns an excerpt around the matched
words for each post; the excerpt and topic title are used as the post text so
a search costs the forum one request, not one per result.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import quote

import httpx
from pydantic import ValidationError

from api.services.cost_controls import provider_rate_limiter
from api.services.integrations.public_source import (
    PublicSourcePost,
    clip_text,
    compact_discovery_search_query,
    env_positive_float,
    env_positive_int,
    html_to_text,
    is_probable_spam,
    normalise_text,
    parse_utc_datetime,
)
from api.services.prospecting.official_site_fetch import (
    PinnedAddressTransport,
    resolve_public_dns,
)

logger = logging.getLogger(__name__)

# A bare DNS name: letters, digits and hyphens in dot-separated labels, at
# least one dot. No scheme, port, path, credentials or IP literal.
_FORUM_HOST_PATTERN = re.compile(
    r"^(?=.{4,253}$)(?!\d+(\.\d+){3}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
)
_RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})


class DiscourseSourcePost(PublicSourcePost):
    source: Literal["discourse"] = "discourse"


SourcePost = DiscourseSourcePost


def normalize_forum_host(value: object) -> str:
    """Return a validated forum hostname, or raise ``ValueError``."""

    host = normalise_text(value).casefold().removeprefix("https://").removeprefix("http://")
    host = host.split("/", 1)[0].rstrip(".")
    if not _FORUM_HOST_PATTERN.fullmatch(host):
        raise ValueError("forum must be a public hostname such as community.example.com")
    return host


class DiscourseConnector:
    """Search one public Discourse forum's posts within a date window."""

    def __init__(
        self,
        *,
        forum_host: str,
        timeout_seconds: float | None = None,
        max_attempts: int | None = None,
        requests_per_minute: int | None = None,
    ) -> None:
        self.forum_host = normalize_forum_host(forum_host)
        self.timeout_seconds = timeout_seconds or env_positive_float(
            "ARCLI_DISCOURSE_HTTP_TIMEOUT_SECONDS", 15.0
        )
        self.max_attempts = max_attempts or env_positive_int("ARCLI_DISCOURSE_HTTP_MAX_ATTEMPTS", 2)
        # Forums are run by other companies, often on modest plans. Stay well
        # under Discourse's default anonymous search limits.
        self.requests_per_minute = requests_per_minute or env_positive_int(
            "ARCLI_DISCOURSE_REQUESTS_PER_MINUTE", 10
        )

    async def fetch_recent_posts(
        self,
        query: str,
        since_timestamp: int,
        limit: int = 50,
        *,
        max_pages: int | None = None,
    ) -> list[DiscourseSourcePost]:
        """Return matching posts created since ``since_timestamp``."""

        if since_timestamp < 0:
            raise ValueError("since_timestamp must be a Unix timestamp")
        # Discourse requires every search word to match, so long buyer
        # sentences return nothing. Keep the most informative terms.
        terms = compact_discovery_search_query(
            query, max_terms=env_positive_int("ARCLI_DISCOURSE_QUERY_TERMS", 3)
        )
        if not terms:
            raise ValueError("query is required")
        if limit < 1:
            return []

        target_limit = min(limit, env_positive_int("ARCLI_DISCOURSE_MAX_POSTS", 50))
        page_cap = max(1, min(max_pages or 1, env_positive_int("ARCLI_DISCOURSE_MAX_PAGES", 2)))
        after = datetime.fromtimestamp(since_timestamp, tz=timezone.utc).date().isoformat()
        search = f"{terms} after:{after} order:latest"

        posts: list[DiscourseSourcePost] = []
        seen_ids: set[str] = set()
        for page in range(1, page_cap + 1):
            payload = await asyncio.to_thread(self._fetch_search_page, search, page)
            topics = {
                topic.get("id"): topic
                for topic in payload.get("topics") or []
                if isinstance(topic, dict)
            }
            hits = payload.get("posts")
            if not isinstance(hits, list) or not hits:
                break
            for hit in hits:
                post = self._to_source_post(hit, topics, since_timestamp)
                if not post or post.source_post_id in seen_ids:
                    continue
                seen_ids.add(post.source_post_id)
                posts.append(post)
                if len(posts) >= target_limit:
                    return posts
            grouped = payload.get("grouped_search_result")
            if not (isinstance(grouped, dict) and grouped.get("more_full_page_results")):
                break
        return posts

    def _fetch_search_page(self, search: str, page: int) -> dict[str, Any]:
        url = f"https://{self.forum_host}/search.json?q={quote(search)}&page={page}"
        last_error: Exception | None = None
        for attempt in range(1, max(1, self.max_attempts) + 1):
            provider_rate_limiter.wait_for_slot(
                provider=f"discourse:{self.forum_host}",
                limit=max(1, self.requests_per_minute),
            )
            try:
                # Re-resolve and re-pin on every attempt: an address checked
                # once must not be reused after the DNS answer could change.
                address = resolve_public_dns(self.forum_host, 443)[0]
                transport = PinnedAddressTransport(host=self.forum_host, pinned_address=address, port=443)
                with httpx.Client(
                    transport=transport,
                    timeout=httpx.Timeout(self.timeout_seconds),
                    follow_redirects=False,
                    headers={
                        "Accept": "application/json",
                        "User-Agent": os.getenv(
                            "ARCLI_DISCOURSE_USER_AGENT", "arcli-prospect-intelligence/1.0"
                        ),
                    },
                ) as client:
                    response = client.get(url)
                if response.status_code in _RETRYABLE_STATUS and attempt < self.max_attempts:
                    last_error = httpx.HTTPStatusError(
                        "retryable status", request=response.request, response=response
                    )
                    time.sleep(min(8.0, 1.0 * attempt))
                    continue
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise ValueError("forum returned a non-object JSON payload")
                return payload
            except httpx.TimeoutException as exc:
                last_error = exc
                if attempt >= self.max_attempts:
                    raise
                time.sleep(min(8.0, 1.0 * attempt))
        raise last_error or RuntimeError("forum search failed")

    def _to_source_post(
        self,
        hit: object,
        topics: dict[Any, dict[str, Any]],
        since_timestamp: int,
    ) -> DiscourseSourcePost | None:
        if not isinstance(hit, dict):
            return None
        post_id, topic_id, post_number = hit.get("id"), hit.get("topic_id"), hit.get("post_number")
        if not all(isinstance(value, int) and value > 0 for value in (post_id, topic_id, post_number)):
            return None
        topic = topics.get(topic_id) or {}
        title = clip_text(normalise_text(topic.get("title")), 1_000)
        body = clip_text(html_to_text(hit.get("blurb")), 20_000)
        posted_at = parse_utc_datetime(hit.get("created_at"))
        if (
            len(body) < 2
            or is_probable_spam(body)
            or not posted_at
            or int(posted_at.timestamp()) < since_timestamp
        ):
            return None
        slug = re.sub(r"[^a-z0-9-]", "", str(topic.get("slug") or "topic").casefold()) or "topic"
        try:
            return DiscourseSourcePost(
                source_post_id=f"{self.forum_host}:{post_id}",
                author_handle=normalise_text(hit.get("username")) or None,
                title=title or None,
                body=body,
                url=f"https://{self.forum_host}/t/{slug}/{topic_id}/{post_number}",
                posted_at=posted_at,
                metadata={
                    "community": self.forum_host,
                    "topic_id": str(topic_id),
                    "content_kind": "topic" if post_number == 1 else "comment",
                    "text_scope": "search_excerpt",
                },
            )
        except ValidationError:
            return None
