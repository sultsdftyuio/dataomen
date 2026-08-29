from __future__ import annotations

import asyncio
import os
from unittest.mock import AsyncMock, patch

import api.main as main
import api.services.crawling as crawling
import pytest
from fastapi import HTTPException


class APITimeoutError(Exception):
    pass


class _NoopTransaction:
    def __enter__(self):
        return object()

    def __exit__(self, exc_type, exc, traceback):
        return False


class _NoopEngine:
    def begin(self):
        return _NoopTransaction()


def _trigger_with_pass1_error(error: Exception):
    payload = main.CrawlTriggerRequest(
        tenant_id="ff2a2bd0-7379-4a0e-a47e-3f430998d079",
        website_url="https://example.com/",
    )
    with (
        patch.object(main, "_validate_internal_tenant_scope"),
        patch("api.services.crawling._database_engine", return_value=_NoopEngine()),
        patch("api.services.crawling.reserve_website_crawl_slot", return_value=None),
        patch(
            "api.services.service_profile_pass1.extract_pass1_service_profile",
            side_effect=error,
        ),
        patch("api.services.crawling.enqueue_crawl_job", return_value="message-1"),
    ):
        return main.trigger_crawl(payload, None, "idempotency-key")


def test_pass1_timeout_is_reported_as_skipped_while_deep_crawl_is_queued() -> None:
    response = _trigger_with_pass1_error(APITimeoutError("timed out"))

    assert response.pass1_status == "skipped"
    assert response.message_id == "message-1"


def test_non_transient_pass1_failure_remains_visible_without_blocking_deep_crawl() -> None:
    response = _trigger_with_pass1_error(ValueError("unexpected homepage payload"))

    assert response.pass1_status == "failed"
    assert response.message_id == "message-1"


class _NoRecentCrawlConnection:
    def __init__(self):
        self.calls: list[object] = []

    def execute(self, *_args, **_kwargs):
        self.calls.append(_args[0])
        return self

    def mappings(self):
        return self

    def first(self):
        return None


def test_recheck_resets_the_previous_queue_message_before_reenqueueing() -> None:
    """A terminal URL row is reused, so it cannot retain its old message ID."""
    with (
        patch("api.services.crawling._table_exists", return_value=True),
        patch("api.services.crawling._upsert_crawl_job") as upsert,
        patch("api.services.crawling._reserve_crawl_queue_capacity", return_value=None),
    ):
        next_available_at = crawling.reserve_website_crawl_slot(
            _NoRecentCrawlConnection(),
            tenant_id="ff2a2bd0-7379-4a0e-a47e-3f430998d079",
            crawl_job_id="crawl-job-id",
            website_url="https://example.com/",
        )

    assert next_available_at is None
    assert upsert.call_args.kwargs["restart_queue"] is True


class _QueueAdmissionConnection:
    def __init__(self, queue_position: int) -> None:
        self.queue_position = queue_position
        self.calls: list[object] = []

    def execute(self, statement, *_args, **_kwargs):
        self.calls.append(statement)
        return self

    def scalar_one(self) -> int:
        return self.queue_position


def test_crawl_queue_admission_records_a_retryable_rejection(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_CRAWL_MAX_QUEUED_JOBS", "2")
    monkeypatch.setenv("ARCLI_CRAWL_ADMISSION_RETRY_AFTER_SECONDS", "45")
    connection = _QueueAdmissionConnection(queue_position=3)

    with (
        patch("api.services.crawling._table_exists", return_value=True),
        patch("api.services.crawling._upsert_crawl_job") as upsert,
    ):
        limit = crawling._reserve_crawl_queue_capacity(
            connection,
            tenant_id="ff2a2bd0-7379-4a0e-a47e-3f430998d079",
            crawl_job_id="crawl-job-id",
            website_url="https://example.com/",
        )

    assert limit == crawling.CrawlQueueCapacityLimit(
        max_queued_jobs=2,
        retry_after_seconds=45,
    )
    assert len(connection.calls) == 2
    assert upsert.call_args.kwargs["status"] == "failed"
    assert upsert.call_args.kwargs["failure_reason"] == "admission_rejected"


def test_crawl_queue_capacity_stops_pass1_before_it_uses_api_or_model_capacity() -> None:
    payload = main.CrawlTriggerRequest(
        tenant_id="ff2a2bd0-7379-4a0e-a47e-3f430998d079",
        website_url="https://example.com/",
    )
    with (
        patch.object(main, "_validate_internal_tenant_scope"),
        patch("api.services.crawling._database_engine", return_value=_NoopEngine()),
        patch(
            "api.services.crawling.reserve_website_crawl_slot",
            return_value=crawling.CrawlQueueCapacityLimit(
                max_queued_jobs=6,
                retry_after_seconds=60,
            ),
        ),
        patch(
            "api.services.service_profile_pass1.extract_pass1_service_profile",
        ) as extract_profile,
    ):
        with pytest.raises(HTTPException) as error:
            main.trigger_crawl(payload, None, "idempotency-key")

    assert error.value.status_code == 429
    assert error.value.headers == {"Retry-After": "60"}
    assert "capacity is temporarily full" in str(error.value.detail)
    extract_profile.assert_not_called()


def test_repeat_crawls_skip_the_previous_daily_cooldown_lookup() -> None:
    connection = _NoRecentCrawlConnection()
    with (
        patch("api.services.crawling._table_exists", return_value=True),
        patch("api.services.crawling._crawl_job_row_for_website", return_value=None),
        patch("api.services.crawling._upsert_crawl_job"),
        patch("api.services.crawling._reserve_crawl_queue_capacity", return_value=None),
    ):
        result = crawling.reserve_website_crawl_slot(
            connection,
            tenant_id="ff2a2bd0-7379-4a0e-a47e-3f430998d079",
            crawl_job_id="crawl-job-id",
            website_url="https://example.com/",
        )

    assert result is None
    assert len(connection.calls) == 1


def test_default_crawl_budget_is_two_minutes() -> None:
    assert crawling.DEFAULT_CRAWL_JOB_TOTAL_TIMEOUT_SECONDS == 120
    assert crawling.DEFAULT_CRAWL_PHASE_TIMEOUT_SECONDS == 75
    assert crawling.DEFAULT_PROFILE_EXTRACTION_TIMEOUT_SECONDS == 35
    assert crawling.DEFAULT_CRAWL_JOB_TIME_LIMIT_MS == 135_000


def test_fallback_pages_are_fetched_concurrently_without_changing_page_order() -> None:
    class FakeClient:
        active_requests = 0
        max_active_requests = 0

        async def scrape(self, *, url: str, **_kwargs: object) -> dict[str, str]:
            self.active_requests += 1
            self.max_active_requests = max(
                self.max_active_requests,
                self.active_requests,
            )
            try:
                await asyncio.sleep(0.01)
                return {"markdown": f"# {url}"}
            finally:
                self.active_requests -= 1

    urls = [f"https://example.com/page-{index}" for index in range(5)]
    crawler = crawling.WebsiteCrawler(page_timeout_ms=1_000)
    client = FakeClient()
    with (
        patch.dict(os.environ, {"ARCLI_FALLBACK_SCRAPE_CONCURRENCY": "2"}),
        patch.object(crawler, "_fallback_urls", return_value=urls),
    ):
        documents = asyncio.run(
            crawler._scrape_common_pages(
                client,
                "https://example.com/",
                set(),
                tenant_id="tenant-1",
                service_profile_id="profile-1",
                crawl_job_id="crawl-1",
            )
        )

    assert client.max_active_requests == 2
    assert [source for source, _markdown in documents] == urls


def test_crawl4ai_primary_skips_firecrawl_when_it_returns_enough_content() -> None:
    class _Limiter:
        def __init__(self) -> None:
            self.providers: list[str] = []

        async def acquire_async(self, **kwargs: object) -> object:
            self.providers.append(str(kwargs["provider"]))
            return object()

        def release(self, _lease: object) -> None:
            return None

    crawler = crawling.WebsiteCrawler()
    limiter = _Limiter()
    commercial_markdown = (
        "# Acme\n\n"
        + (
            "Acme is a customer acquisition platform for B2B teams. "
            "Explore pricing, product features, integrations, and customer stories. "
            "Book a demo or start a free trial with the sales team today. "
            * 14
        )
    )
    with (
        patch.dict(os.environ, {"ARCLI_CRAWL4AI_ENABLED": "true"}),
        patch.object(crawling, "provider_concurrency_limiter", limiter),
        patch.object(
            crawler,
            "_crawl_with_crawl4ai",
            new=AsyncMock(
                return_value=[("https://example.com/", commercial_markdown)]
            ),
        ),
        patch.object(crawler, "_get_client") as firecrawl_client,
    ):
        markdown = asyncio.run(crawler.crawl_and_scrape("https://example.com/"))

    assert markdown == "## Source: https://example.com/\n\n" + commercial_markdown.strip()
    assert limiter.providers == ["crawl4ai-browser"]
    firecrawl_client.assert_not_called()


def test_crawl4ai_failure_uses_firecrawl_fallback() -> None:
    class _Limiter:
        async def acquire_async(self, **_kwargs: object) -> object:
            return object()

        def release(self, _lease: object) -> None:
            return None

    class _RateLimiter:
        async def wait_for_slot_async(self, **_kwargs: object) -> None:
            return None

    class _FirecrawlClient:
        async def crawl(self, **_kwargs: object) -> dict[str, object]:
            return {
                "data": [
                    {
                        "markdown": "# Firecrawl fallback\n\n" + "content " * 100,
                        "metadata": {"source_url": "https://example.com/"},
                    }
                ]
            }

    crawler = crawling.WebsiteCrawler()
    with (
        patch.dict(os.environ, {"ARCLI_CRAWL4AI_ENABLED": "true"}),
        patch.object(crawling, "provider_concurrency_limiter", _Limiter()),
        patch.object(crawling, "provider_rate_limiter", _RateLimiter()),
        patch.object(
            crawler,
            "_crawl_with_crawl4ai",
            new=AsyncMock(side_effect=RuntimeError("browser unavailable")),
        ),
        patch.object(crawler, "_get_client", return_value=_FirecrawlClient()),
    ):
        markdown = asyncio.run(crawler.crawl_and_scrape("https://example.com/"))

    assert "Firecrawl fallback" in markdown


def test_crawl_quality_rejects_long_noncommercial_content_and_accepts_product_surfaces() -> None:
    crawler = crawling.WebsiteCrawler()
    noncommercial = crawler._crawl_content_quality(
        [
            (
                "https://example.com/",
                "A long editorial note about a community event and its history. " * 45,
            )
        ],
        "https://example.com/",
    )

    assert noncommercial.sufficient is False
    assert "insufficient_commercial_context" in noncommercial.reasons
    assert "limited_page_coverage" in noncommercial.reasons

    commercial = crawler._crawl_content_quality(
        [
            (
                "https://example.com/",
                (
                    "Acme is a platform for revenue teams that need a predictable "
                    "customer acquisition workflow. Book a demo to see the product "
                    "and start a free trial with your sales team. "
                    * 8
                ),
            ),
            (
                "https://example.com/pricing",
                (
                    "Pricing plans give growing companies a clear monthly path to "
                    "use Acme software, integrations, and customer success support. "
                    * 8
                ),
            ),
        ],
        "https://example.com/",
    )

    assert commercial.sufficient is True
    assert commercial.quality_tier == "usable"
    assert commercial.homepage_present is True
    assert {"conversion", "offering", "pricing"}.issubset(
        commercial.commercial_signal_categories
    )


def test_linked_commercial_pages_are_discovered_without_following_noise() -> None:
    urls = crawling.WebsiteCrawler._discovered_profile_urls(
        "https://example.com/",
        [
            (
                "https://example.com/",
                "\n".join(
                    [
                        "[Pricing](/pricing?source=menu)",
                        "[Customer stories](/case-studies)",
                        "[Integrations](/integrations#catalog)",
                        "[Blog](/blog/founder-letter)",
                        "[Careers](/careers)",
                        "[Privacy](/privacy)",
                        "[Download PDF](/sales-deck.pdf)",
                        "[External](https://other.example/pricing)",
                    ]
                ),
            )
        ],
    )

    assert urls == [
        "https://example.com/pricing",
        "https://example.com/case-studies",
        "https://example.com/integrations",
    ]


def test_crawl_options_use_bounded_sitemap_discovery_and_commercial_paths() -> None:
    crawler = crawling.WebsiteCrawler(max_pages=6)

    options = crawler._crawl_options("https://example.com/", page_limit=4)

    assert options["sitemap"] == "include"
    assert options["limit"] == 4
    assert options["max_discovery_depth"] == 2
    include_pattern = options["include_paths"][-1]
    assert "integrations" in include_pattern
    assert "case-studies" in include_pattern
    assert "documentation" in include_pattern


def test_fallback_scrapes_respect_remaining_page_budget() -> None:
    class FakeClient:
        calls: list[str] = []

        async def scrape(self, *, url: str, **_kwargs: object) -> dict[str, str]:
            self.calls.append(url)
            return {"markdown": f"# {url}"}

    crawler = crawling.WebsiteCrawler()
    client = FakeClient()
    fallback_urls = [f"https://example.com/page-{index}" for index in range(5)]
    with patch.object(crawler, "_fallback_urls", return_value=fallback_urls):
        documents = asyncio.run(
            crawler._scrape_common_pages(
                client,
                "https://example.com/",
                set(),
                tenant_id="tenant-1",
                service_profile_id="profile-1",
                crawl_job_id="crawl-1",
                max_pages=2,
            )
        )

    assert client.calls == fallback_urls[:2]
    assert [source for source, _markdown in documents] == fallback_urls[:2]


def test_crawl_quality_metadata_is_carried_into_profile_json() -> None:
    quality = crawling.WebsiteCrawler.crawl_quality_metadata_for_markdown(
        "## Source: https://example.com/\n\n"
        + (
            "Acme is a product platform for teams. Book a demo and view pricing. "
            * 30
        ),
        "https://example.com/",
    )
    document = crawling._profile_document(
        {"company_name": "Acme", "crawl_quality": quality},
        "https://example.com/",
    )

    assert document["crawl_quality"]["quality_tier"] in {"usable", "strong"}
    assert document["crawl_quality"]["sufficient"] is True
    assert document["crawl_quality"]["source_urls"] == ["https://example.com/"]
