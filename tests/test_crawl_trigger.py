from __future__ import annotations

import asyncio
import os
from unittest.mock import patch

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


def test_daily_crawl_cooldown_stops_work_before_the_fast_profile_pass() -> None:
    payload = main.CrawlTriggerRequest(
        tenant_id="ff2a2bd0-7379-4a0e-a47e-3f430998d079",
        website_url="https://example.com/",
    )
    with (
        patch.object(main, "_validate_internal_tenant_scope"),
        patch("api.services.crawling._database_engine", return_value=_NoopEngine()),
        patch(
            "api.services.crawling.reserve_website_crawl_slot",
            return_value="2030-01-01T00:00:00+00:00",
        ),
        patch(
            "api.services.service_profile_pass1.extract_pass1_service_profile",
        ) as extract_profile,
    ):
        with pytest.raises(HTTPException) as error:
            main.trigger_crawl(payload, None, "idempotency-key")

    assert error.value.status_code == 429
    assert "once every 24 hours" in str(error.value.detail)
    extract_profile.assert_not_called()


class _NoRecentCrawlConnection:
    def execute(self, *_args, **_kwargs):
        return self

    def mappings(self):
        return self

    def first(self):
        return None


def test_daily_recheck_resets_the_previous_queue_message_before_reenqueueing() -> None:
    """A terminal URL row is reused, so it cannot retain its old message ID."""
    with (
        patch("api.services.crawling._table_exists", return_value=True),
        patch("api.services.crawling._upsert_crawl_job") as upsert,
    ):
        next_available_at = crawling.reserve_website_crawl_slot(
            _NoRecentCrawlConnection(),
            tenant_id="ff2a2bd0-7379-4a0e-a47e-3f430998d079",
            crawl_job_id="crawl-job-id",
            website_url="https://example.com/",
        )

    assert next_available_at is None
    assert upsert.call_args.kwargs["restart_queue"] is True


def test_temporary_repeat_crawl_mode_requires_explicit_opt_in(monkeypatch) -> None:
    monkeypatch.delenv("ARCLI_UNLIMITED_CRAWL_TEST_MODE", raising=False)
    assert crawling._website_crawl_test_mode_enabled() is False

    monkeypatch.setenv("ARCLI_UNLIMITED_CRAWL_TEST_MODE", "true")
    assert crawling._website_crawl_test_mode_enabled() is True


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
