from __future__ import annotations

import logging
from datetime import datetime, timezone

import pytest

from api.services import website_recrawl_backfill
from api.services.website_recrawl import RECURRING_CRAWL_KIND


class _Result:
    def __init__(self, rows=None, scalar=None, rowcount=0) -> None:
        self._rows = rows or []
        self._scalar = scalar
        self.rowcount = rowcount

    def scalar(self):
        return self._scalar

    def mappings(self):
        return self

    def all(self):
        return self._rows


class _Connection:
    """Answers each statement by what it reads, and records every insert."""

    def __init__(self, *, has_website_column=True, candidates=(), stale=()) -> None:
        self.has_website_column = has_website_column
        self.candidates = list(candidates)
        self.stale = list(stale)
        self.inserts: list[dict] = []

    def execute(self, statement, params=None):
        sql = str(statement)
        if "information_schema.columns" in sql:
            return _Result(scalar=self.has_website_column)
        if "INSERT INTO public.website_recrawl_schedules" in sql:
            self.inserts.append(dict(params))
            return _Result(rowcount=1)
        if "FROM public.tenant_settings" in sql or "settings.website_url" in sql:
            return _Result(rows=self.candidates)
        if "current_period_end" in sql:
            return _Result(rows=self.stale)
        raise AssertionError(f"unexpected statement: {sql}")


@pytest.fixture(autouse=True)
def _reset_warned() -> None:
    website_recrawl_backfill._warned_stale_billing.clear()


def test_paid_workspace_without_a_schedule_gets_one_due_now_at_the_crawler_url() -> None:
    conn = _Connection(
        candidates=[{"tenant_id": "tenant-a", "website_url": "  www.arcli.tech  "}]
    )

    created = website_recrawl_backfill.backfill_missing_recrawl_schedules(
        conn, crawl_kind=RECURRING_CRAWL_KIND
    )

    assert created == 1
    # Same normalisation as the crawler, so the schedule is not later paused
    # as a stale website.
    assert conn.inserts == [
        {
            "tenant_id": "tenant-a",
            "website_url": "https://www.arcli.tech/",
            "crawl_kind": RECURRING_CRAWL_KIND,
        }
    ]


def test_invalid_website_is_skipped_without_blocking_the_rest(caplog) -> None:
    conn = _Connection(
        candidates=[
            {"tenant_id": "tenant-bad", "website_url": "ftp://files.example"},
            {"tenant_id": "tenant-good", "website_url": "https://example.com/"},
        ]
    )

    with caplog.at_level(logging.WARNING):
        created = website_recrawl_backfill.backfill_missing_recrawl_schedules(
            conn, crawl_kind=RECURRING_CRAWL_KIND
        )

    assert created == 1
    assert [insert["tenant_id"] for insert in conn.inserts] == ["tenant-good"]
    assert "tenant_id=tenant-bad reason=invalid_website_url" in caplog.text


def test_backfill_is_skipped_when_settings_have_no_website_column() -> None:
    conn = _Connection(has_website_column=False, candidates=[{"tenant_id": "x", "website_url": "a.com"}])

    assert website_recrawl_backfill.backfill_missing_recrawl_schedules(
        conn, crawl_kind=RECURRING_CRAWL_KIND
    ) == 0
    assert conn.inserts == []


def test_stale_paid_billing_is_warned_once_per_workspace(caplog) -> None:
    ended = datetime(2026, 8, 5, 11, 48, tzinfo=timezone.utc)
    conn = _Connection(stale=[{"tenant_id": "tenant-a", "current_period_end": ended}])

    with caplog.at_level(logging.WARNING):
        first = website_recrawl_backfill.warn_stale_paid_billing(conn)
        second = website_recrawl_backfill.warn_stale_paid_billing(conn)

    assert first == ["tenant-a"]
    assert second == []
    assert caplog.text.count("billing_period_stale tenant_id=tenant-a") == 1
