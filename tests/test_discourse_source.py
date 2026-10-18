from __future__ import annotations

import asyncio
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from api.services.integrations import discourse_connector
from api.services.integrations.discourse_connector import DiscourseConnector, normalize_forum_host
from api.services.social import additional_sources, community_monitoring, queries
from api.services.social.community_monitoring import CommunityTarget, parse_community_targets
from api.services.watchlist_matching import normalize_watchlist_sources, sources_with_named_forums

FORUM = "community.postman.com"
SEARCH_RESPONSE = {
    "posts": [
        {
            "id": 901,
            "username": "frustrated_dev",
            "created_at": "2026-10-15T09:00:00.000Z",
            "blurb": "We are looking for an <b>alternative</b> because the new pricing doubled our bill",
            "post_number": 1,
            "topic_id": 55,
        },
        {
            "id": 902,
            "username": "old_post",
            "created_at": "2025-01-01T09:00:00.000Z",
            "blurb": "An old alternative thread",
            "post_number": 3,
            "topic_id": 56,
        },
    ],
    "topics": [{"id": 55, "title": "Considering an alternative after the pricing change", "slug": "pricing-change"}],
    "grouped_search_result": {"more_full_page_results": False},
}


@pytest.fixture(autouse=True)
def _no_rate_limit_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discourse_connector.provider_rate_limiter, "wait_for_slot", lambda **_: None)


def _pinned(monkeypatch, handler, *, address="104.18.20.1"):
    """Route the connector's pinned transport to a fake forum and record calls."""

    pinned: list[tuple[str, str, int]] = []
    monkeypatch.setattr(discourse_connector, "resolve_public_dns", lambda host, port: (address,))

    def _transport(*, host, pinned_address, port):
        pinned.append((host, pinned_address, port))
        return httpx.MockTransport(handler)

    monkeypatch.setattr(discourse_connector, "PinnedAddressTransport", _transport)
    return pinned


def test_searches_one_forum_with_date_filter_and_maps_posts(monkeypatch) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=SEARCH_RESPONSE)

    pinned = _pinned(monkeypatch, handler)
    since = 1_784_000_000  # 2026-07-14
    posts = asyncio.run(DiscourseConnector(forum_host=FORUM).fetch_recent_posts("Postman alternative", since))

    assert pinned == [(FORUM, "104.18.20.1", 443)]
    url = urlsplit(str(requests[0].url))
    assert (url.scheme, url.netloc, url.path) == ("https", FORUM, "/search.json")
    assert parse_qs(url.query)["q"] == ["postman alternative after:2026-07-14 order:latest"]

    assert len(posts) == 1  # the 2025 post is outside the window
    post = posts[0]
    assert post.source == "discourse"
    assert post.source_post_id == f"{FORUM}:901"
    assert post.url == f"https://{FORUM}/t/pricing-change/55/1"
    assert post.title == "Considering an alternative after the pricing change"
    assert "new pricing doubled our bill" in post.body
    assert post.metadata["community"] == FORUM
    assert post.metadata["content_kind"] == "topic"


def test_redirects_are_not_followed(monkeypatch) -> None:
    _pinned(monkeypatch, lambda request: httpx.Response(302, headers={"Location": "http://169.254.169.254/"}))

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(DiscourseConnector(forum_host=FORUM).fetch_recent_posts("alternative", 0))


def test_a_host_resolving_to_a_private_address_is_never_contacted(monkeypatch) -> None:
    def _reject(host, port):
        raise ValueError("DNS returned a non-public address")

    monkeypatch.setattr(discourse_connector, "resolve_public_dns", _reject)
    monkeypatch.setattr(discourse_connector, "PinnedAddressTransport", lambda **_: pytest.fail("must not connect"))

    with pytest.raises(ValueError, match="non-public"):
        asyncio.run(DiscourseConnector(forum_host="community.internal.example").fetch_recent_posts("alternative", 0))


@pytest.mark.parametrize(
    "value",
    ["", "localhost", "10.0.0.1", "community.example.com:8443", "user@community.example.com", "exa mple.com"],
)
def test_forum_host_must_be_a_plain_public_hostname(value) -> None:
    with pytest.raises(ValueError):
        normalize_forum_host(value)


def test_forum_host_accepts_a_pasted_url() -> None:
    assert normalize_forum_host("https://Community.Postman.com/latest") == FORUM


@pytest.mark.parametrize(
    ("place", "expected"),
    [
        ("https://community.postman.com", CommunityTarget("discourse", FORUM, "https://community.postman.com")),
        ("discourse:forum.example.com", CommunityTarget("discourse", "forum.example.com", "discourse:forum.example.com")),
        ("https://example.com/forum", None),
        ("http://community.example.com", None),
    ],
)
def test_buyer_group_places_recognise_forums(place, expected) -> None:
    targets = parse_community_targets([place])

    assert (targets[0] if targets else None) == expected


def test_naming_a_forum_selects_the_forum_source() -> None:
    preferences = normalize_watchlist_sources(["hackernews"])
    forum = CommunityTarget("discourse", FORUM, FORUM)
    repo = CommunityTarget("github", "postmanlabs/postman-app-support", "github:postmanlabs/postman-app-support")

    assert sources_with_named_forums(preferences, [forum, repo]) == {"hackernews", "discourse"}
    assert sources_with_named_forums(preferences, [repo]) == {"hackernews"}
    assert "discourse" not in normalize_watchlist_sources(None)  # never a default


def test_forum_source_is_off_unless_switched_on(monkeypatch) -> None:
    monkeypatch.delenv("ARCLI_DISCOURSE_INGESTION_ENABLED", raising=False)
    assert "discourse" not in queries.enabled_additional_public_sources()

    monkeypatch.setenv("ARCLI_DISCOURSE_INGESTION_ENABLED", "true")
    assert "discourse" in queries.enabled_additional_public_sources()


def test_without_a_named_forum_nothing_is_searched(monkeypatch) -> None:
    monkeypatch.setattr(
        additional_sources,
        "_additional_public_source_connector",
        lambda *a, **k: pytest.fail("must not build a connector"),
    )

    result = additional_sources.ingest_additional_public_source_posts("discourse", "alternative", 24)

    assert (result.hits_found, result.inserted_count) == (0, 0)


def test_forum_posts_pass_the_governance_source_allowlist() -> None:
    from api.services.social.data_governance import public_source_is_allowed

    assert public_source_is_allowed("discourse")
