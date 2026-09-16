from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

from api.services import crawling, website_recrawl


class _NoopTransaction:
    def __enter__(self):
        return object()

    def __exit__(self, exc_type, exc, traceback):
        return False


class _NoopEngine:
    def begin(self):
        return _NoopTransaction()


def test_recrawl_interval_is_never_less_than_24_or_more_than_48_hours(
    monkeypatch,
) -> None:
    monkeypatch.setenv("ARCLI_RECRAWL_MIN_HOURS", "2")
    monkeypatch.setenv("ARCLI_RECRAWL_MAX_HOURS", "96")

    limits = website_recrawl.recrawl_limits()

    assert limits.min_interval_seconds == 24 * 60 * 60
    assert limits.max_interval_seconds == 48 * 60 * 60


def test_recrawl_interval_defaults_to_the_full_24_to_48_hour_window(
    monkeypatch,
) -> None:
    monkeypatch.delenv("ARCLI_RECRAWL_MIN_HOURS", raising=False)
    monkeypatch.delenv("ARCLI_RECRAWL_MAX_HOURS", raising=False)

    limits = website_recrawl.recrawl_limits()

    assert limits.min_interval_seconds == 86_400
    assert limits.max_interval_seconds == 172_800
    assert limits.tick_seconds == 300
    assert limits.reserved_pro_dispatches_per_day == 50


def test_due_recrawl_uses_the_existing_admission_and_enqueue_path() -> None:
    claim = website_recrawl.DueWebsiteRecrawl(
        tenant_id="tenant-1",
        website_url="https://example.com/",
        scheduled_for="2026-01-01T00:00:00+00:00",
    )
    engine = _NoopEngine()
    with (
        patch.object(website_recrawl, "_claim_due_website_recrawls", return_value=([claim], 199)),
        patch.object(crawling, "_database_engine", return_value=engine),
        patch.object(crawling, "reserve_website_crawl_slot", return_value=None) as reserve,
        patch.object(crawling, "enqueue_crawl_job", return_value="message-1") as enqueue,
        patch.object(website_recrawl, "_record_dispatch") as record,
    ):
        result = website_recrawl.dispatch_due_website_recrawls()

    assert result.dispatched == 1
    assert result.deferred == 0
    assert result.failed == 0
    assert reserve.call_args.kwargs["source"] == "scheduled_recrawl"
    assert enqueue.call_args.kwargs == {
        "tenant_id": "tenant-1",
        "website_url": "https://example.com/",
        "job_id": website_recrawl._crawl_job_id("tenant-1", "https://example.com/"),
    }
    assert record.call_args.kwargs["status"] == "enqueued"


def test_capacity_rejection_defers_without_publishing_a_crawl() -> None:
    claim = website_recrawl.DueWebsiteRecrawl(
        tenant_id="tenant-1",
        website_url="https://example.com/",
        scheduled_for="2026-01-01T00:00:00+00:00",
    )
    engine = _NoopEngine()
    with (
        patch.object(website_recrawl, "_claim_due_website_recrawls", return_value=([claim], 199)),
        patch.object(crawling, "_database_engine", return_value=engine),
        patch.object(
            crawling,
            "reserve_website_crawl_slot",
            return_value=crawling.CrawlQueueCapacityLimit(6, 60),
        ),
        patch.object(crawling, "enqueue_crawl_job") as enqueue,
        patch.object(website_recrawl, "_defer_claim") as defer,
        patch.object(website_recrawl, "_record_dispatch") as record,
    ):
        result = website_recrawl.dispatch_due_website_recrawls()

    assert result.dispatched == 0
    assert result.deferred == 1
    enqueue.assert_not_called()
    assert defer.call_args.kwargs["reason"] == "crawl_queue_capacity_limited"
    assert record.call_args.kwargs["status"] == "deferred"


def test_initial_crawl_uses_the_same_guarded_admission_path() -> None:
    claim = website_recrawl.DueWebsiteRecrawl(
        tenant_id="tenant-1",
        website_url="https://example.com/",
        scheduled_for="2026-01-01T00:00:00+00:00",
        crawl_kind=website_recrawl.INITIAL_CRAWL_KIND,
        dispatch_priority=website_recrawl.FREE_DISPATCH_PRIORITY,
    )
    engine = _NoopEngine()
    with (
        patch.object(website_recrawl, "_claim_due_website_recrawls", return_value=([claim], 199)),
        patch.object(crawling, "_database_engine", return_value=engine),
        patch.object(crawling, "reserve_website_crawl_slot", return_value=None) as reserve,
        patch.object(crawling, "enqueue_crawl_job", return_value="message-1"),
        patch.object(website_recrawl, "_record_dispatch"),
    ):
        result = website_recrawl.dispatch_due_website_recrawls()

    assert result.dispatched == 1
    assert reserve.call_args.kwargs["source"] == "scheduled_initial_crawl"


def test_scheduler_schema_has_a_daily_cap_audit_and_retention_contract() -> None:
    root = Path(__file__).resolve().parents[1]
    schema = (root / "scripts" / "website_recrawl_scheduler.sql").read_text(
        encoding="utf-8"
    )

    assert "website_recrawl_schedules" in schema
    assert "website_recrawl_dispatches" in schema
    assert "crawl_kind" in schema
    assert "dispatch_priority" in schema
    assert "UNIQUE (tenant_id, website_url, scheduled_for)" in schema
    assert "90 days" in schema


def test_crawl_completion_and_system_worker_own_the_schedule() -> None:
    root = Path(__file__).resolve().parents[1]
    crawling_service = (root / "api" / "services" / "crawling.py").read_text(
        encoding="utf-8"
    )
    actors = (root / "api" / "workers" / "actors.py").read_text(encoding="utf-8")
    worker = (root / "scripts" / "start_worker.py").read_text(encoding="utf-8")

    assert "schedule_website_recrawl" in crawling_service
    assert "lead_discovery_skipped_after_crawl" in crawling_service
    assert 'actor_name="dispatch_due_website_recrawls"' in actors
    assert "bootstrap_website_recrawl_scheduler" in worker
