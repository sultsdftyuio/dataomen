"""Crawl a small set of website pages into clean Markdown with Crawl4AI.

This module deliberately does not perform LLM extraction.  Arcli's existing
profile extractor owns that responsibility after every crawl provider returns
its source Markdown, which keeps Crawl4AI fast and makes Firecrawl fallback
semantically identical.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterable
from urllib.parse import urlsplit

from Crawl4AI.browser_processes import BrowserSession, terminate_orphaned_browsers
from Crawl4AI.browser_settings import build_browser_config, build_run_config

logger = logging.getLogger(__name__)

# Chromium normally exits in well under a second. A wedged browser must not
# hold the crawl slot, so shutdown is bounded and leftovers are reclaimed.
BROWSER_CLOSE_TIMEOUT_SECONDS = 10.0
# Held back from the caller's time budget so the browser can close and the
# pages already rendered can be returned before the caller's own timeout.
SHUTDOWN_RESERVE_SECONDS = 5.0
# A page started with less time than this left cannot realistically render.
MIN_PAGE_BUDGET_SECONDS = 5.0
PAGE_TIMEOUT_GRACE_SECONDS = 5.0
MAX_LOGGED_ERROR_CHARS = 200


class Crawl4AIWebsiteError(RuntimeError):
    """Raised when the local Crawl4AI browser cannot yield usable Markdown."""


@dataclass(frozen=True)
class Crawl4AIPage:
    url: str
    markdown: str


DiscoverNextUrls = Callable[[list[Crawl4AIPage]], Iterable[str]]


def _url_key(url: str) -> str:
    """Identify a page regardless of scheme, ``www.``, fragment, or trailing slash."""
    text = str(url or "").strip()
    if not text:
        return ""
    try:
        parts = urlsplit(text)
    except ValueError:
        return text.rstrip("/")
    host = (parts.hostname or "").lower().removeprefix("www.")
    if not host:
        return text.rstrip("/")
    if parts.port:
        host = f"{host}:{parts.port}"
    key = host + parts.path.rstrip("/")
    return f"{key}?{parts.query}" if parts.query else key


class Crawl4AIWebsiteCrawler:
    """Bounded, sequential Chromium crawl for an Arcli website profile."""

    def __init__(
        self,
        *,
        page_timeout_ms: int,
        max_pages: int,
        budget_seconds: float | None = None,
    ) -> None:
        self.page_timeout_ms = max(5_000, page_timeout_ms)
        self.max_pages = max(1, max_pages)
        self.budget_seconds = budget_seconds

    async def crawl_site(
        self,
        seed_urls: Iterable[str],
        *,
        discover_next: DiscoverNextUrls | None = None,
    ) -> list[Crawl4AIPage]:
        """Render the seed pages, then the pages ``discover_next`` picks from them.

        One Chromium serves the whole website: launching it is the slowest and
        most memory-hungry step, so it happens once rather than per phase.
        Pages render one at a time because the worker has a single browser
        slot, and the outer Arcli lease enforces that across every replica.

        Pages already rendered are returned when the time budget runs out or
        the browser fails part-way, so one slow or broken secondary page does
        not discard a usable homepage. ``Crawl4AIWebsiteError`` is raised only
        when nothing usable was rendered.
        """
        crawler_class, browser_config, run_config = self._load_crawl4ai()
        started_at = time.monotonic()
        deadline = self._deadline(started_at)
        pages: list[Crawl4AIPage] = []
        seen_urls: set[str] = set()
        launch_ms: int | None = None

        try:
            with BrowserSession():
                crawler = crawler_class(config=browser_config)
                try:
                    await crawler.start()
                    launch_ms = int((time.monotonic() - started_at) * 1000)
                    within_budget = await self._render_pages(
                        crawler, run_config, seed_urls, pages, seen_urls, deadline
                    )
                    if (
                        within_budget
                        and pages
                        and discover_next is not None
                        and len(pages) < self.max_pages
                    ):
                        await self._render_pages(
                            crawler,
                            run_config,
                            discover_next(list(pages)),
                            pages,
                            seen_urls,
                            deadline,
                        )
                except Exception as exc:
                    if not pages:
                        raise Crawl4AIWebsiteError("Crawl4AI browser crawl failed.") from exc
                    logger.warning(
                        "crawl4ai_crawl_interrupted pages=%s error_type=%s error=%s",
                        len(pages),
                        exc.__class__.__name__,
                        str(exc)[:MAX_LOGGED_ERROR_CHARS],
                    )
                finally:
                    await self._close_browser(crawler)
        finally:
            # psutil walks and waits on processes synchronously; keep that off
            # the event loop.
            await asyncio.to_thread(terminate_orphaned_browsers)

        if not pages:
            raise Crawl4AIWebsiteError("Crawl4AI returned no usable website Markdown.")
        logger.info(
            "crawl4ai_site_crawled pages=%s content_chars=%s browser_launch_ms=%s total_ms=%s",
            len(pages),
            sum(len(page.markdown) for page in pages),
            launch_ms,
            int((time.monotonic() - started_at) * 1000),
        )
        return pages

    def _load_crawl4ai(self) -> tuple[Any, Any, Any]:
        """Import Crawl4AI lazily; only the browser worker image installs it."""
        try:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
        except ImportError as exc:
            raise Crawl4AIWebsiteError(
                "Crawl4AI is unavailable in this worker image. "
                "Install Crawl4AI and Chromium before enabling it."
            ) from exc

        return (
            AsyncWebCrawler,
            build_browser_config(BrowserConfig),
            build_run_config(
                CrawlerRunConfig,
                CacheMode.BYPASS,
                page_timeout_ms=self.page_timeout_ms,
            ),
        )

    def _deadline(self, started_at: float) -> float | None:
        if not self.budget_seconds or self.budget_seconds <= 0:
            return None
        reserve = min(SHUTDOWN_RESERVE_SECONDS, self.budget_seconds / 5)
        return started_at + self.budget_seconds - reserve

    def _page_wait_seconds(self, deadline: float | None) -> float | None:
        """Return how long the next page may take, or None when out of budget."""
        page_wait = max(10.0, self.page_timeout_ms / 1000 + PAGE_TIMEOUT_GRACE_SECONDS)
        if deadline is None:
            return page_wait
        remaining = deadline - time.monotonic()
        if remaining < MIN_PAGE_BUDGET_SECONDS:
            return None
        return min(page_wait, remaining)

    async def _render_pages(
        self,
        crawler: Any,
        run_config: Any,
        urls: Iterable[str],
        pages: list[Crawl4AIPage],
        seen_urls: set[str],
        deadline: float | None,
    ) -> bool:
        """Append usable pages in order; return False once the budget is spent."""
        for url in urls:
            if len(pages) >= self.max_pages:
                break
            requested_url = str(url)
            url_key = _url_key(requested_url)
            if not url_key or url_key in seen_urls:
                continue
            seen_urls.add(url_key)

            wait_seconds = self._page_wait_seconds(deadline)
            if wait_seconds is None:
                logger.info(
                    "crawl4ai_budget_exhausted pages=%s next_url=%s",
                    len(pages),
                    requested_url,
                )
                return False

            page = await self._render_page(
                crawler, run_config, requested_url, wait_seconds, seen_urls
            )
            if page is not None:
                pages.append(page)
        return True

    async def _render_page(
        self,
        crawler: Any,
        run_config: Any,
        url: str,
        wait_seconds: float,
        seen_urls: set[str],
    ) -> Crawl4AIPage | None:
        started_at = time.monotonic()

        def skipped(reason: str, detail: object = "") -> None:
            logger.info(
                "crawl4ai_page_skipped url=%s reason=%s elapsed_ms=%s detail=%s",
                url,
                reason,
                int((time.monotonic() - started_at) * 1000),
                str(detail)[:MAX_LOGGED_ERROR_CHARS],
            )

        try:
            result = await asyncio.wait_for(
                crawler.arun(url=url, config=run_config),
                timeout=wait_seconds,
            )
        except asyncio.TimeoutError:
            return skipped("timeout")

        if not getattr(result, "success", False):
            return skipped("render_failed", getattr(result, "error_message", "") or "")

        # Guessed paths such as /pricing often resolve to an error page, which
        # renders "successfully" but says nothing about the product.
        status_code = getattr(result, "status_code", None)
        if isinstance(status_code, int) and status_code >= 400:
            return skipped("http_error", status_code)

        # Unknown paths commonly redirect to the homepage or to another page
        # that was already rendered; keeping them would duplicate content.
        final_key = _url_key(getattr(result, "redirected_url", None) or "")
        if final_key and final_key != _url_key(url):
            if final_key in seen_urls:
                return skipped("redirected_to_rendered_page", final_key)
            seen_urls.add(final_key)

        markdown = self._markdown_from_result(result)
        if not markdown:
            return skipped("empty_markdown")
        return Crawl4AIPage(url=str(getattr(result, "url", url)), markdown=markdown)

    @staticmethod
    async def _close_browser(crawler: Any) -> None:
        try:
            await asyncio.wait_for(crawler.close(), timeout=BROWSER_CLOSE_TIMEOUT_SECONDS)
        except Exception as exc:
            logger.warning(
                "crawl4ai_browser_close_failed error_type=%s error=%s",
                exc.__class__.__name__,
                str(exc)[:MAX_LOGGED_ERROR_CHARS],
            )

    @staticmethod
    def _markdown_from_result(result: Any) -> str:
        markdown = getattr(result, "markdown", None)
        if isinstance(markdown, str):
            return markdown.strip()

        # Crawl4AI v0.9 exposes raw and filtered Markdown attributes. Prefer
        # the filtered form when configured, otherwise use raw Markdown.
        for attribute in ("fit_markdown", "raw_markdown"):
            candidate = getattr(markdown, attribute, None)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return ""


def crawl4ai_enabled() -> bool:
    """Allow a fast rollback to the Firecrawl-only path without a redeploy."""
    return os.getenv("ARCLI_CRAWL4AI_ENABLED", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
