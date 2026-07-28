"""GitHub public issue-search connector with conservative anonymous defaults."""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlsplit

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


GITHUB_ISSUES_SEARCH_URL = "https://api.github.com/search/issues"


class GitHubIssueSourcePost(PublicSourcePost):
    source: Literal["github"] = "github"


SourcePost = GitHubIssueSourcePost


class GitHubIssuesConnector:
    """Fetch public GitHub issues while keeping unauthenticated use inexpensive.

    A token is optional. When supplied it only improves the request budget;
    every query includes ``is:public`` and the mapper rejects any response that
    identifies a private repository, so private issue content never joins the
    global source corpus.
    """

    def __init__(
        self,
        *,
        token: str | None = None,
        base_url: str = GITHUB_ISSUES_SEARCH_URL,
        timeout_seconds: float | None = None,
        request_interval_seconds: float | None = None,
        max_attempts: int | None = None,
        max_pages: int | None = None,
        requests_per_minute: int | None = None,
    ) -> None:
        self.token = (
            token
            or os.getenv("ARCLI_GITHUB_TOKEN")
            or os.getenv("GITHUB_TOKEN")
            or os.getenv("GH_TOKEN")
            or ""
        ).strip()
        self.base_url = base_url
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else env_positive_float("ARCLI_GITHUB_HTTP_TIMEOUT_SECONDS", 15.0)
        )
        self.request_interval_seconds = (
            request_interval_seconds
            if request_interval_seconds is not None
            else env_positive_float("ARCLI_GITHUB_REQUEST_INTERVAL_SECONDS", 0.5)
        )
        self.max_attempts = max(
            1,
            max_attempts
            if max_attempts is not None
            else env_positive_int("ARCLI_GITHUB_HTTP_MAX_ATTEMPTS", 3),
        )
        self.max_pages = max(
            1,
            max_pages
            if max_pages is not None
            else self._default_max_pages(),
        )
        self.requests_per_minute = max(
            1,
            requests_per_minute
            if requests_per_minute is not None
            else self._default_requests_per_minute(),
        )

    def _default_max_pages(self) -> int:
        return env_positive_int(
            "ARCLI_GITHUB_MAX_PAGES"
            if self.token
            else "ARCLI_GITHUB_ANONYMOUS_MAX_PAGES",
            1,
        )

    def _default_requests_per_minute(self) -> int:
        explicit = os.getenv("ARCLI_GITHUB_REQUESTS_PER_MINUTE")
        if explicit is not None:
            return env_positive_int("ARCLI_GITHUB_REQUESTS_PER_MINUTE", 5)
        return env_positive_int(
            "ARCLI_GITHUB_AUTH_REQUESTS_PER_MINUTE"
            if self.token
            else "ARCLI_GITHUB_ANONYMOUS_REQUESTS_PER_MINUTE",
            20 if self.token else 5,
        )

    async def fetch_recent_posts(
        self,
        query: str,
        since_timestamp: int,
        limit: int = 100,
        *,
        max_pages: int | None = None,
    ) -> list[GitHubIssueSourcePost]:
        search_query = self._search_query(query, since_timestamp)
        if limit < 1:
            return []
        if max_pages is not None and max_pages < 1:
            raise ValueError("max_pages must be positive when provided")

        target_limit = min(limit, env_positive_int("ARCLI_GITHUB_MAX_POSTS", 100))
        page_cap = min(max_pages or self.max_pages, self.max_pages)
        posts: list[GitHubIssueSourcePost] = []
        seen_ids: set[str] = set()
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": os.getenv(
                "ARCLI_GITHUB_USER_AGENT", "arcli-prospect-intelligence/1.0"
            ),
            "X-GitHub-Api-Version": os.getenv(
                "ARCLI_GITHUB_API_VERSION", "2022-11-28"
            ),
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        async with httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(self.timeout_seconds),
            follow_redirects=True,
        ) as client:
            for page in range(1, page_cap + 1):
                payload = await self._fetch_page(
                    client,
                    search_query=search_query,
                    page=page,
                    page_size=min(100, target_limit - len(posts)),
                )
                hits = payload.get("items")
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
                if len(posts) >= target_limit or len(hits) < min(100, target_limit):
                    break
                if page < page_cap and self.request_interval_seconds:
                    await asyncio.sleep(self.request_interval_seconds)

        return posts

    async def _fetch_page(
        self,
        client: httpx.AsyncClient,
        *,
        search_query: str,
        page: int,
        page_size: int,
    ) -> dict[str, Any]:
        return await fetch_json_with_retry(
            client=client,
            url=self.base_url,
            params={
                "q": search_query,
                "sort": "created",
                "order": "desc",
                "per_page": str(page_size),
                "page": str(page),
            },
            provider="github-issue-search",
            requests_per_minute=self.requests_per_minute,
            max_attempts=self.max_attempts,
            log_event="github_issue_search",
            page=page,
        )

    @staticmethod
    def _search_query(query: str, since_timestamp: int) -> str:
        phrase = normalise_text(query).replace('"', "")
        if not phrase:
            raise ValueError("query is required")
        if since_timestamp < 0:
            raise ValueError("since_timestamp must be a Unix timestamp")
        date = datetime.fromtimestamp(since_timestamp, tz=timezone.utc).date().isoformat()
        return (
            f'"{clip_text(phrase, 200)}" '
            f"in:title,body is:issue is:public created:>={date}"
        )

    @staticmethod
    def _to_source_post(
        item: object,
        since_timestamp: int,
    ) -> GitHubIssueSourcePost | None:
        if not isinstance(item, dict) or "pull_request" in item:
            return None
        repository = item.get("repository")
        if isinstance(repository, dict) and (
            repository.get("private") is True
            or normalise_text(repository.get("visibility")).lower() == "private"
        ):
            return None

        source_post_id = str(item.get("id") or "").strip()
        title = clip_text(normalise_text(item.get("title")), 1_000) or None
        issue_body = clip_text(normalise_text(item.get("body")), 18_500)
        body = clip_text(
            "\n\n".join(part for part in (title or "", issue_body) if part),
            20_000,
        )
        posted_at = parse_utc_datetime(item.get("created_at"))
        url = safe_http_url(item.get("html_url"))
        user = item.get("user")
        user = user if isinstance(user, dict) else {}
        author_handle = normalise_text(user.get("login")) or None
        if (
            not source_post_id
            or len(body) < 2
            or is_probable_spam(body)
            or not posted_at
            or int(posted_at.timestamp()) < since_timestamp
            or not GitHubIssuesConnector._is_public_github_url(url)
        ):
            return None
        try:
            return GitHubIssueSourcePost(
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
    def _is_public_github_url(url: str) -> bool:
        try:
            host = (urlsplit(url).hostname or "").lower()
        except ValueError:
            return False
        return host in {"github.com", "www.github.com"}
