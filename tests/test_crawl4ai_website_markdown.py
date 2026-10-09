from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from Crawl4AI import website_markdown
from Crawl4AI.browser_settings import build_browser_config
from Crawl4AI.website_markdown import (
    Crawl4AIPage,
    Crawl4AIWebsiteCrawler,
    Crawl4AIWebsiteError,
    crawl4ai_enabled,
)


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


def test_crawl4ai_is_enabled_by_default(monkeypatch) -> None:
    monkeypatch.delenv("ARCLI_CRAWL4AI_ENABLED", raising=False)

    assert crawl4ai_enabled() is True


def _result(
    url: str,
    markdown: str = "# Page\n\nUseful product copy.",
    *,
    success: bool = True,
    status_code: int = 200,
    redirected_url: str | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        url=url,
        markdown=markdown,
        success=success,
        status_code=status_code,
        redirected_url=redirected_url or url,
        error_message="" if success else "render failed",
    )


class _FakeBrowser:
    """Stands in for AsyncWebCrawler; ``results`` maps a URL to its outcome."""

    def __init__(self, results: dict[str, object]) -> None:
        self.results = results
        self.starts = 0
        self.closes = 0
        self.requested: list[str] = []

    def __call__(self, *, config: object) -> "_FakeBrowser":
        return self

    async def start(self) -> None:
        self.starts += 1

    async def close(self) -> None:
        self.closes += 1

    async def arun(self, *, url: str, config: object) -> object:
        self.requested.append(url)
        outcome = self.results[url]
        if isinstance(outcome, BaseException):
            raise outcome
        if callable(outcome):
            return outcome()
        return outcome


def _crawler_with(
    monkeypatch,
    browser: _FakeBrowser,
    **crawler_kwargs: object,
) -> tuple[Crawl4AIWebsiteCrawler, list[str]]:
    crawler = Crawl4AIWebsiteCrawler(
        page_timeout_ms=20_000,
        **{"max_pages": 4, **crawler_kwargs},
    )
    reclaimed: list[str] = []
    monkeypatch.setattr(crawler, "_load_crawl4ai", lambda: (browser, None, None))
    monkeypatch.setattr(
        website_markdown,
        "terminate_orphaned_browsers",
        lambda: reclaimed.append("reclaimed"),
    )
    return crawler, reclaimed


def test_one_browser_renders_the_seed_and_the_discovered_pages(monkeypatch) -> None:
    home, pricing = "https://example.com", "https://example.com/pricing"
    browser = _FakeBrowser({home: _result(home), pricing: _result(pricing)})
    crawler, reclaimed = _crawler_with(monkeypatch, browser)
    discovered_from: list[list[str]] = []

    def discover_next(rendered: list[Crawl4AIPage]) -> list[str]:
        discovered_from.append([page.url for page in rendered])
        return [home, pricing]

    pages = asyncio.run(crawler.crawl_site([home], discover_next=discover_next))

    assert [page.url for page in pages] == [home, pricing]
    assert discovered_from == [[home]]
    # The seed is not rendered twice even though discovery offered it again.
    assert browser.requested == [home, pricing]
    assert (browser.starts, browser.closes) == (1, 1)
    assert reclaimed == ["reclaimed"]


def test_error_pages_failures_and_duplicate_redirects_are_skipped(monkeypatch) -> None:
    home = "https://example.com"
    missing = "https://example.com/plans"
    failed = "https://example.com/features"
    redirected = "https://example.com/product"
    about = "https://example.com/about"
    browser = _FakeBrowser(
        {
            home: _result(home, redirected_url="https://www.example.com/"),
            missing: _result(missing, status_code=404),
            failed: _result(failed, success=False),
            redirected: _result(redirected, redirected_url="https://www.example.com/"),
            about: _result(about),
        }
    )
    crawler, _ = _crawler_with(monkeypatch, browser)

    pages = asyncio.run(
        crawler.crawl_site(
            [home],
            discover_next=lambda _rendered: [missing, failed, redirected, about],
        )
    )

    assert [page.url for page in pages] == [home, about]


def test_a_browser_failure_after_the_homepage_keeps_the_homepage(monkeypatch) -> None:
    home, pricing = "https://example.com", "https://example.com/pricing"
    browser = _FakeBrowser(
        {home: _result(home), pricing: RuntimeError("browser has been closed")}
    )
    crawler, reclaimed = _crawler_with(monkeypatch, browser)

    pages = asyncio.run(
        crawler.crawl_site([home], discover_next=lambda _rendered: [pricing])
    )

    assert [page.url for page in pages] == [home]
    assert browser.closes == 1
    assert reclaimed == ["reclaimed"]


def test_no_usable_page_raises_and_still_closes_the_browser(monkeypatch) -> None:
    home = "https://example.com"
    browser = _FakeBrowser({home: _result(home, markdown="   ")})
    crawler, reclaimed = _crawler_with(monkeypatch, browser)
    discovery_calls: list[object] = []

    with pytest.raises(Crawl4AIWebsiteError):
        asyncio.run(crawler.crawl_site([home], discover_next=discovery_calls.append))

    # Without a usable seed page there is nothing to discover links from.
    assert discovery_calls == []
    assert browser.closes == 1
    assert reclaimed == ["reclaimed"]


def test_pages_rendered_before_the_time_budget_ran_out_are_returned(monkeypatch) -> None:
    home, pricing, about = (
        "https://example.com",
        "https://example.com/pricing",
        "https://example.com/about",
    )
    clock = SimpleNamespace(now=1_000.0)

    def slow_pricing_page() -> SimpleNamespace:
        clock.now += 50.0
        return _result(pricing)

    browser = _FakeBrowser(
        {home: _result(home), pricing: slow_pricing_page, about: _result(about)}
    )
    # Five seconds of a 58-second budget are reserved for shutdown, so three
    # remain after the slow page: too few to start another one.
    crawler, _ = _crawler_with(monkeypatch, browser, budget_seconds=58)
    monkeypatch.setattr(
        website_markdown, "time", SimpleNamespace(monotonic=lambda: clock.now)
    )

    pages = asyncio.run(
        crawler.crawl_site([home], discover_next=lambda _rendered: [pricing, about])
    )

    assert [page.url for page in pages] == [home, pricing]
    assert about not in browser.requested
    assert browser.closes == 1


def test_the_page_limit_counts_usable_pages_only(monkeypatch) -> None:
    urls = [f"https://example.com/{index}" for index in range(5)]
    browser = _FakeBrowser(
        {
            url: _result(url, status_code=404 if index == 1 else 200)
            for index, url in enumerate(urls)
        }
    )
    crawler, _ = _crawler_with(monkeypatch, browser, max_pages=3)

    pages = asyncio.run(crawler.crawl_site(urls))

    assert [page.url for page in pages] == [urls[0], urls[2], urls[3]]
    assert urls[4] not in browser.requested


def test_page_identity_ignores_scheme_www_fragment_and_trailing_slash() -> None:
    key = website_markdown._url_key

    assert key("https://www.Example.com/pricing/") == key("http://example.com/pricing#plans")
    assert key("https://example.com/pricing?tier=pro") != key("https://example.com/pricing")
    assert key("") == ""


def test_browser_is_launched_with_the_low_memory_profile() -> None:
    captured: dict[str, object] = {}

    def browser_config(**kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return captured

    build_browser_config(browser_config)

    assert captured["headless"] is True
    assert captured["text_mode"] is True
    assert captured["light_mode"] is True
    assert captured["memory_saving_mode"] is True
    assert captured["avoid_ads"] is True
    assert "--disable-dev-shm-usage" in captured["extra_args"]
