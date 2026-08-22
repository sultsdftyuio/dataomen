from __future__ import annotations

from types import SimpleNamespace

from Crawl4AI.website_markdown import Crawl4AIWebsiteCrawler, crawl4ai_enabled


def test_crawl4ai_result_prefers_filtered_then_raw_markdown() -> None:
    crawler = Crawl4AIWebsiteCrawler(page_timeout_ms=20_000, max_pages=4)

    assert crawler._markdown_from_result(
        SimpleNamespace(markdown=SimpleNamespace(fit_markdown="  filtered  ", raw_markdown="raw"))
    ) == "filtered"
    assert crawler._markdown_from_result(
        SimpleNamespace(markdown=SimpleNamespace(fit_markdown="", raw_markdown="  raw  "))
    ) == "raw"


def test_crawl4ai_can_be_disabled_for_an_instant_firecrawl_rollback(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_CRAWL4AI_ENABLED", "false")
    assert crawl4ai_enabled() is False

    monkeypatch.setenv("ARCLI_CRAWL4AI_ENABLED", "true")
    assert crawl4ai_enabled() is True
