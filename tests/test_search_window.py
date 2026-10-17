from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from api.services.social import search_window

NOW = datetime(2026, 10, 18, 12, 0, tzinfo=timezone.utc)
FULL = 2160
PHRASES = ["Sentry alternative", "need more paying customers"]


def _plan(*phrases: str) -> dict:
    return {"version": 1, "queries": [{"query_type": "x", "phrase": p} for p in phrases]}


def _window(monkeypatch, previous, phrases=PHRASES) -> int:
    monkeypatch.setattr(search_window, "_last_fully_searched_run", lambda *_: previous)
    return search_window.incremental_lookback_hours(
        tenant_id="tenant-a",
        service_profile_id="profile-a",
        query_phrases=phrases,
        full_window_hours=FULL,
        now=NOW,
    )


@pytest.fixture(autouse=True)
def _default_overlap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ARCLI_INCREMENTAL_SEARCH_OVERLAP_HOURS", raising=False)


def test_first_run_searches_the_full_window(monkeypatch) -> None:
    assert _window(monkeypatch, None) == FULL


def test_unchanged_plan_searches_only_since_the_last_run_plus_overlap(monkeypatch) -> None:
    previous = {"started_at": NOW - timedelta(hours=30, minutes=10), "query_plan": _plan(*PHRASES)}

    # 30h10m rounds up to 31, plus the 12-hour overlap.
    assert _window(monkeypatch, previous) == 43


def test_phrase_matching_ignores_case_and_spacing(monkeypatch) -> None:
    previous = {"started_at": NOW - timedelta(hours=24), "query_plan": _plan("sentry  ALTERNATIVE", "Need more paying customers")}

    assert _window(monkeypatch, previous) == 36


def test_a_new_phrase_such_as_an_added_competitor_searches_the_full_window(monkeypatch) -> None:
    previous = {"started_at": NOW - timedelta(hours=24), "query_plan": _plan("need more paying customers")}

    assert _window(monkeypatch, previous) == FULL


def test_a_long_gap_never_exceeds_the_full_window(monkeypatch) -> None:
    previous = {"started_at": NOW - timedelta(days=200), "query_plan": _plan(*PHRASES)}

    assert _window(monkeypatch, previous) == FULL


def test_naive_database_timestamps_are_read_as_utc(monkeypatch) -> None:
    previous = {"started_at": (NOW - timedelta(hours=24)).replace(tzinfo=None), "query_plan": _plan(*PHRASES)}

    assert _window(monkeypatch, previous) == 36


def test_unreadable_plan_or_database_error_falls_back_to_the_full_window(monkeypatch) -> None:
    assert _window(monkeypatch, {"started_at": NOW, "query_plan": "garbage"}) == FULL

    def _fail(*_):
        raise RuntimeError("database down")

    monkeypatch.setattr(search_window, "_last_fully_searched_run", _fail)
    assert search_window.incremental_lookback_hours(
        tenant_id="tenant-a",
        service_profile_id="profile-a",
        query_phrases=PHRASES,
        full_window_hours=FULL,
        now=NOW,
    ) == FULL


def test_no_profile_or_phrases_keeps_the_full_window(monkeypatch) -> None:
    monkeypatch.setattr(search_window, "_last_fully_searched_run", lambda *_: pytest.fail("must not query"))
    assert search_window.incremental_lookback_hours(
        tenant_id="t", service_profile_id=None, query_phrases=PHRASES, full_window_hours=FULL
    ) == FULL
    assert search_window.incremental_lookback_hours(
        tenant_id="t", service_profile_id="p", query_phrases=["  "], full_window_hours=FULL
    ) == FULL
