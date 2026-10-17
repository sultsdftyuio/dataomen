from __future__ import annotations

import asyncio

import pytest

from api.services.integrations import hn_connector
from api.services.integrations.hn_connector import (
    ALGOLIA_HN_SEARCH_BY_DATE_URL,
    ALGOLIA_HN_SEARCH_URL,
    HackerNewsConnector,
)


@pytest.fixture(autouse=True)
def _default_order(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ARCLI_HN_KEYWORD_ORDER", raising=False)


def _requested_urls(connector: HackerNewsConnector, monkeypatch, call) -> list[str]:
    urls: list[str] = []

    async def _fake_fetch_page(self, client, *, url=None, **_kwargs):
        urls.append(url or self.base_url)
        return {"hits": []}

    monkeypatch.setattr(HackerNewsConnector, "_fetch_page", _fake_fetch_page)
    asyncio.run(call(connector))
    return urls


def test_keyword_discovery_ranks_by_relevance_inside_the_date_window(monkeypatch) -> None:
    urls = _requested_urls(
        HackerNewsConnector(request_interval_seconds=0),
        monkeypatch,
        lambda c: c.fetch_recent_posts("find customers", since_timestamp=0, limit=50),
    )

    assert urls == [ALGOLIA_HN_SEARCH_URL]


def test_date_order_can_be_restored_without_a_deploy(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_HN_KEYWORD_ORDER", "date")

    urls = _requested_urls(
        HackerNewsConnector(request_interval_seconds=0),
        monkeypatch,
        lambda c: c.fetch_recent_posts("find customers", since_timestamp=0, limit=50),
    )

    assert urls == [ALGOLIA_HN_SEARCH_BY_DATE_URL]


def test_verified_story_comments_keep_their_date_order(monkeypatch) -> None:
    urls = _requested_urls(
        HackerNewsConnector(request_interval_seconds=0),
        monkeypatch,
        lambda c: c.fetch_story_comments("12345", limit=10),
    )

    assert urls == [ALGOLIA_HN_SEARCH_BY_DATE_URL]


def test_relevance_endpoint_still_honours_the_window_filter(monkeypatch) -> None:
    captured: dict = {}

    class _Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"hits": []}

    class _Client:
        async def get(self, url, params):
            captured.update(url=url, params=params)
            return _Response()

    async def _no_wait(**_kwargs):
        return None

    monkeypatch.setattr(hn_connector.provider_rate_limiter, "wait_for_slot_async", _no_wait)
    connector = HackerNewsConnector(request_interval_seconds=0)
    asyncio.run(
        connector._fetch_page(
            _Client(), url=connector.search_url, query="find customers",
            since_timestamp=1_784_000_000, page=0, page_size=50,
        )
    )

    assert captured["url"] == ALGOLIA_HN_SEARCH_URL
    assert captured["params"]["numericFilters"] == "created_at_i>=1784000000"
