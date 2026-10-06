"""Page sizing for the paid X fallback."""

from __future__ import annotations

import pytest

from api.services.social.x_cost import x_fallback_posts_per_request


@pytest.fixture(autouse=True)
def _default_ceiling(monkeypatch):
    monkeypatch.delenv("ARCLI_INITIAL_PUBLIC_X_FALLBACK_POSTS", raising=False)


def test_the_free_source_page_size_never_raises_the_paid_page() -> None:
    # Free sources fetch 50 per query; X must not inherit that.
    assert x_fallback_posts_per_request(50) == 25
    assert x_fallback_posts_per_request(100) == 25
    assert x_fallback_posts_per_request(None) == 25


def test_a_smaller_request_is_honoured_down_to_the_provider_minimum() -> None:
    assert x_fallback_posts_per_request(15) == 15
    # The recent-search endpoint rejects fewer than ten results.
    assert x_fallback_posts_per_request(3) == 10


def test_the_ceiling_is_a_deployment_setting_within_provider_bounds(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_INITIAL_PUBLIC_X_FALLBACK_POSTS", "40")
    assert x_fallback_posts_per_request(50) == 40

    monkeypatch.setenv("ARCLI_INITIAL_PUBLIC_X_FALLBACK_POSTS", "500")
    assert x_fallback_posts_per_request(500) == 100

    monkeypatch.setenv("ARCLI_INITIAL_PUBLIC_X_FALLBACK_POSTS", "2")
    assert x_fallback_posts_per_request(50) == 10
