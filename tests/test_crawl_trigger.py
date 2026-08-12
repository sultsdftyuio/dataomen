from __future__ import annotations

from unittest.mock import patch

import api.main as main
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
