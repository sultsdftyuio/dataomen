import asyncio
import logging
import os
import re
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

logger = logging.getLogger(__name__)


class WebsiteCrawler:
    """
    Firecrawl-backed website crawler for onboarding profile extraction.

    It targets the homepage plus common About and Pricing surfaces and returns
    clean markdown that is ready for LLM synthesis.
    """

    TARGET_PATH_PATTERNS = (
        r"(?:about|about-us|company)",
        r"(?:pricing|plans|packages)",
    )

    BOILERPLATE_PHRASES = (
        "skip to content",
        "accept cookies",
        "cookie settings",
        "privacy policy",
        "terms of service",
        "terms & conditions",
        "all rights reserved",
        "copyright",
        "sign in",
        "log in",
        "login",
        "menu",
        "navigation",
    )

    def __init__(
        self,
        api_key: str | None = None,
        timeout_seconds: int = 90,
        page_timeout_ms: int = 30_000,
        max_pages: int = 8,
    ) -> None:
        self.api_key = api_key or os.getenv("FIRECRAWL_API_KEY")
        self.timeout_seconds = timeout_seconds
        self.page_timeout_ms = page_timeout_ms
        self.max_pages = max_pages

    async def crawl_and_scrape(
        self,
        url: str,
        *,
        tenant_id: str | None = None,
        service_profile_id: str | None = None,
        crawl_job_id: str | None = None,
    ) -> str:
        """
        Crawl and scrape the given website, returning concatenated markdown.

        Dead secondary pages are skipped. If no usable content can be recovered
        from either crawl or fallback scrapes, a RuntimeError is raised.
        """
        resolved_tenant_id = tenant_id or "unknown"
        normalized_url = self._normalize_url(url)
        client = self._build_client()

        documents: list[tuple[str, str]] = []
        seen_sources: set[str] = set()

        logger.info(
            "website_crawl_started tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s max_pages=%s timeout_seconds=%s",
            resolved_tenant_id,
            service_profile_id,
            crawl_job_id,
            normalized_url,
            self.max_pages,
            self.timeout_seconds,
        )

        try:
            crawl_result = await self._crawl_target_pages(client, normalized_url)
            documents.extend(self._documents_from_result(crawl_result, seen_sources))
        except asyncio.TimeoutError as exc:
            logger.warning(
                "firecrawl_crawl_timeout tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s timeout_seconds=%s failure_reason=%s",
                resolved_tenant_id,
                service_profile_id,
                crawl_job_id,
                normalized_url,
                self.timeout_seconds,
                "crawl_timeout",
            )
            crawl_error: Exception | None = exc
        except Exception as exc:
            logger.warning(
                "firecrawl_crawl_failed tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s error_type=%s error=%s failure_reason=%s",
                resolved_tenant_id,
                service_profile_id,
                crawl_job_id,
                normalized_url,
                exc.__class__.__name__,
                exc,
                "primary_crawl_failed",
                exc_info=True,
            )
            crawl_error = exc
        else:
            crawl_error = None

        if len(documents) < 3:
            fallback_docs = await self._scrape_common_pages(
                client=client,
                url=normalized_url,
                seen_sources=seen_sources,
                tenant_id=resolved_tenant_id,
                service_profile_id=service_profile_id,
                crawl_job_id=crawl_job_id,
            )
            documents.extend(fallback_docs)

        cleaned_parts = []
        for source_url, markdown in documents:
            cleaned = self._strip_boilerplate(markdown)
            if cleaned:
                cleaned_parts.append(f"## Source: {source_url}\n\n{cleaned}")

        if cleaned_parts:
            content = "\n\n---\n\n".join(cleaned_parts)
            logger.info(
                "website_crawl_completed tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s documents=%s content_chars=%s",
                resolved_tenant_id,
                service_profile_id,
                crawl_job_id,
                normalized_url,
                len(cleaned_parts),
                len(content),
            )
            return content

        if crawl_error:
            logger.error(
                "website_crawl_failed tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s failure_reason=%s documents=%s",
                resolved_tenant_id,
                service_profile_id,
                crawl_job_id,
                normalized_url,
                "no_usable_content_after_crawl_error",
                len(documents),
            )
            raise RuntimeError(
                f"Unable to crawl or scrape usable website content for {normalized_url}"
            ) from crawl_error

        logger.error(
            "website_crawl_failed tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s failure_reason=%s documents=%s",
            resolved_tenant_id,
            service_profile_id,
            crawl_job_id,
            normalized_url,
            "no_usable_content",
            len(documents),
        )
        raise RuntimeError(f"No usable website content found for {normalized_url}")

    def _build_client(self) -> Any:
        try:
            from firecrawl import AsyncFirecrawl
        except ImportError as exc:
            raise RuntimeError(
                "firecrawl-py is required for WebsiteCrawler. Install it with "
                "`pip install firecrawl-py`."
            ) from exc

        kwargs = {"api_key": self.api_key} if self.api_key else {}
        return AsyncFirecrawl(**kwargs)

    async def _crawl_target_pages(self, client: Any, url: str) -> Any:
        crawl = getattr(client, "crawl", None)
        if callable(crawl):
            return await asyncio.wait_for(
                self._call_url_method(
                    crawl,
                    url,
                    **self._crawl_options(url),
                    poll_interval=2,
                    timeout=self.timeout_seconds,
                ),
                timeout=self.timeout_seconds + 5,
            )

        start_crawl = getattr(client, "start_crawl", None)
        get_crawl_status = getattr(client, "get_crawl_status", None)
        if not callable(start_crawl) or not callable(get_crawl_status):
            raise RuntimeError("Installed firecrawl-py client does not support crawling.")

        started = await self._call_url_method(start_crawl, url, **self._crawl_options(url))
        crawl_id = self._read_field(started, "id")
        if not crawl_id:
            raise RuntimeError("Firecrawl did not return a crawl job id.")

        deadline = asyncio.get_running_loop().time() + self.timeout_seconds
        while True:
            status = await get_crawl_status(crawl_id)
            state = str(self._read_field(status, "status", "")).lower()
            if state in {"completed", "failed", "cancelled"}:
                return status
            if asyncio.get_running_loop().time() >= deadline:
                raise asyncio.TimeoutError
            await asyncio.sleep(2)

    def _crawl_options(self, url: str) -> dict[str, Any]:
        include_paths = self._target_include_patterns(url)
        return {
            "include_paths": include_paths,
            "regex_on_full_url": True,
            "crawl_entire_domain": True,
            "allow_external_links": False,
            "allow_subdomains": False,
            "ignore_query_parameters": True,
            "max_discovery_depth": 2,
            "limit": self.max_pages,
            "sitemap": "include",
            "max_concurrency": 2,
            "scrape_options": {
                "formats": ["markdown"],
                "onlyMainContent": True,
                "onlyCleanContent": True,
                "removeBase64Images": True,
                "blockAds": True,
                "timeout": self.page_timeout_ms,
                "excludeTags": [
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
            },
        }

    async def _scrape_common_pages(
        self,
        client: Any,
        url: str,
        seen_sources: set[str],
        *,
        tenant_id: str,
        service_profile_id: str | None,
        crawl_job_id: str | None,
    ) -> list[tuple[str, str]]:
        scrape = getattr(client, "scrape", None)
        if not callable(scrape):
            return []

        documents: list[tuple[str, str]] = []
        for candidate_url in self._fallback_urls(url):
            if candidate_url in seen_sources:
                continue
            try:
                result = await asyncio.wait_for(
                    self._call_url_method(
                        scrape,
                        candidate_url,
                        formats=["markdown"],
                        only_main_content=True,
                        only_clean_content=True,
                        remove_base64_images=True,
                        block_ads=True,
                        timeout=self.page_timeout_ms,
                    ),
                    timeout=max(10, self.page_timeout_ms // 1000 + 5),
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "firecrawl_scrape_timeout tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s failure_reason=%s",
                    tenant_id,
                    service_profile_id,
                    crawl_job_id,
                    candidate_url,
                    "fallback_scrape_timeout",
                )
                continue
            except Exception as exc:
                logger.info(
                    "firecrawl_scrape_skipped tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s error_type=%s error=%s failure_reason=%s",
                    tenant_id,
                    service_profile_id,
                    crawl_job_id,
                    candidate_url,
                    exc.__class__.__name__,
                    exc,
                    "fallback_scrape_failed",
                )
                continue

            documents.extend(self._documents_from_result(result, seen_sources, candidate_url))
        return documents

    async def _call_url_method(self, method: Any, url: str, **kwargs: Any) -> Any:
        try:
            return await method(url=url, **kwargs)
        except TypeError as exc:
            if "url" not in str(exc):
                raise
            return await method(url, **kwargs)

    def _documents_from_result(
        self,
        result: Any,
        seen_sources: set[str],
        fallback_source: str | None = None,
    ) -> list[tuple[str, str]]:
        raw_docs = self._read_field(result, "data")
        if raw_docs is None:
            raw_docs = [result]
        elif isinstance(raw_docs, dict):
            raw_docs = [raw_docs]

        documents: list[tuple[str, str]] = []
        for doc in raw_docs:
            markdown = self._read_field(doc, "markdown")
            if not isinstance(markdown, str) or not markdown.strip():
                continue

            metadata = self._read_field(doc, "metadata", {}) or {}
            source_url = (
                self._read_field(metadata, "source_url")
                or self._read_field(metadata, "sourceURL")
                or self._read_field(metadata, "url")
                or fallback_source
                or "unknown"
            )
            source_url = str(source_url)
            if source_url in seen_sources:
                continue

            seen_sources.add(source_url)
            documents.append((source_url, markdown))
        return documents

    def _target_include_patterns(self, url: str) -> list[str]:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        exact_url = re.escape(url.rstrip("/"))
        escaped_origin = re.escape(origin)
        target_path = "|".join(self.TARGET_PATH_PATTERNS)

        return [
            rf"^{exact_url}/?(?:[?#].*)?$",
            rf"^{escaped_origin}/?(?:[?#].*)?$",
            rf"^{escaped_origin}/(?:{target_path})(?:/.*)?(?:[?#].*)?$",
        ]

    def _fallback_urls(self, url: str) -> list[str]:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        candidates = [
            url,
            origin,
            urljoin(origin, "/about"),
            urljoin(origin, "/about-us"),
            urljoin(origin, "/company"),
            urljoin(origin, "/pricing"),
            urljoin(origin, "/plans"),
            urljoin(origin, "/packages"),
        ]

        deduped: list[str] = []
        for candidate in candidates:
            normalized = candidate.rstrip("/") or candidate
            if normalized not in deduped:
                deduped.append(normalized)
        return deduped

    def _strip_boilerplate(self, markdown: str) -> str:
        markdown = re.sub(r"!\[[^\]]*]\([^)]*\)", "", markdown)
        markdown = re.sub(r"\[!\[[^\]]*]\([^)]*\)]\([^)]*\)", "", markdown)
        markdown = re.sub(r"data:image/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+", "", markdown)

        cleaned_lines: list[str] = []
        seen_short_lines: set[str] = set()
        blank_pending = False

        for raw_line in markdown.splitlines():
            line = raw_line.strip()
            if not line:
                blank_pending = bool(cleaned_lines)
                continue

            lowered = line.lower()
            if len(line) <= 90 and any(phrase in lowered for phrase in self.BOILERPLATE_PHRASES):
                continue

            normalized_short = re.sub(r"\s+", " ", lowered)
            if len(line) <= 120 and normalized_short in seen_short_lines:
                continue
            if len(line) <= 120:
                seen_short_lines.add(normalized_short)

            if blank_pending:
                cleaned_lines.append("")
                blank_pending = False
            cleaned_lines.append(line)

        cleaned = "\n".join(cleaned_lines)
        return re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    @staticmethod
    def _normalize_url(url: str) -> str:
        if not url or not url.strip():
            raise ValueError("url is required")

        candidate = url.strip()
        if "://" not in candidate:
            candidate = f"https://{candidate}"

        parsed = urlparse(candidate)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(f"Invalid website URL: {url}")

        return urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                parsed.path or "/",
                "",
                "",
                "",
            )
        )

    @staticmethod
    def _read_field(obj: Any, field_name: str, default: Any = None) -> Any:
        if isinstance(obj, dict):
            return obj.get(field_name, default)
        return getattr(obj, field_name, default)
