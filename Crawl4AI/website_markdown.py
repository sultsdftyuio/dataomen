"""Crawl a small set of website pages into clean Markdown with Crawl4AI.

This module deliberately does not perform LLM extraction.  Arcli's existing
profile extractor owns that responsibility after every crawl provider returns
its source Markdown, which keeps Crawl4AI fast and makes Firecrawl fallback
semantically identical.
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Any, Iterable


class Crawl4AIWebsiteError(RuntimeError):
    """Raised when the local Crawl4AI browser cannot yield usable Markdown."""


@dataclass(frozen=True)
class Crawl4AIPage:
    url: str
    markdown: str


class Crawl4AIWebsiteCrawler:
    """Bounded, sequential Chromium crawl for an Arcli website profile."""

    def __init__(self, *, page_timeout_ms: int, max_pages: int) -> None:
        self.page_timeout_ms = max(5_000, page_timeout_ms)
        self.max_pages = max(1, max_pages)

    async def crawl_pages(self, urls: Iterable[str]) -> list[Crawl4AIPage]:
        """Render candidate URLs one at a time and return usable Markdown.

        Sequential requests are intentional: the 2 GB App Platform component
        starts with one browser slot, and the outer Arcli lease enforces that
        limit across every worker replica.
        """
        try:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
        except ImportError as exc:
            raise Crawl4AIWebsiteError(
                "Crawl4AI is unavailable in this worker image. "
                "Install Crawl4AI and Chromium before enabling it."
            ) from exc

        run_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            page_timeout=self.page_timeout_ms,
            word_count_threshold=20,
            exclude_external_links=True,
            excluded_tags=[
                "nav",
                "footer",
                "aside",
                "script",
                "style",
                "noscript",
                "svg",
                "canvas",
                "form",
            ],
        )
        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
            text_mode=True,
            # App Platform containers have constrained shared memory. Keep
            # Chromium from depending on a large /dev/shm mount.
            extra_args=["--disable-dev-shm-usage"],
        )
        pages: list[Crawl4AIPage] = []
        seen_urls: set[str] = set()

        try:
            async with AsyncWebCrawler(config=browser_config) as crawler:
                for url in urls:
                    normalized_url = str(url).rstrip("/") or str(url)
                    if not normalized_url or normalized_url in seen_urls:
                        continue
                    seen_urls.add(normalized_url)
                    if len(pages) >= self.max_pages:
                        break

                    try:
                        result = await asyncio.wait_for(
                            crawler.arun(url=url, config=run_config),
                            timeout=max(10, self.page_timeout_ms // 1000 + 5),
                        )
                    except asyncio.TimeoutError:
                        continue

                    if not getattr(result, "success", False):
                        continue
                    markdown = self._markdown_from_result(result)
                    if markdown:
                        pages.append(Crawl4AIPage(url=str(getattr(result, "url", url)), markdown=markdown))
        except Crawl4AIWebsiteError:
            raise
        except Exception as exc:
            raise Crawl4AIWebsiteError("Crawl4AI browser crawl failed.") from exc

        if not pages:
            raise Crawl4AIWebsiteError("Crawl4AI returned no usable website Markdown.")
        return pages

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
