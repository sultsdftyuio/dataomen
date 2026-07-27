from __future__ import annotations

from unittest.mock import patch

import pytest

from api.services.crawling import _failure_reason_for_exception
from api.services.profile_extraction import ProfileExtractionSemanticError
from api.workers import actors


class _ProviderBadRequest(Exception):
    status_code = 400


class _ProviderRateLimit(Exception):
    status_code = 429


def test_permanent_provider_request_errors_are_not_retried() -> None:
    with (
        patch(
            "api.services.crawling.process_crawl_job",
            side_effect=_ProviderBadRequest("invalid response schema"),
        ),
        patch.object(actors, "_close_actor_openai_clients") as close_clients,
        pytest.raises(actors.NonRetryableCrawlError),
    ):
        actors.process_crawl_job.fn("tenant-1", "https://example.com/", "job-1")

    assert actors.process_crawl_job.options["throws"] == (
        actors.NonRetryableCrawlError,
    )
    close_clients.assert_called_once()


def test_transient_provider_errors_remain_retryable() -> None:
    assert not actors._is_non_retryable_crawl_error(_ProviderRateLimit())
    assert _failure_reason_for_exception(_ProviderRateLimit()) == "provider_backpressure"


def test_permanent_provider_request_failure_is_distinct_in_job_status() -> None:
    assert _failure_reason_for_exception(_ProviderBadRequest()) == "provider_request_rejected"


def test_invalid_profile_repair_is_not_retried_as_a_new_crawl() -> None:
    error = ProfileExtractionSemanticError("repair did not satisfy the contract")

    assert actors._is_non_retryable_crawl_error(error)
    assert _failure_reason_for_exception(error) == "profile_semantic_validation_failed"
