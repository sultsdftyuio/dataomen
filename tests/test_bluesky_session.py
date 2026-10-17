from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from api.services.integrations import bluesky_connector, bluesky_session
from api.services.integrations.bluesky_connector import BlueskyConnector
from api.services.integrations.bluesky_session import BlueskySession

PDS = "https://morel.us-east.host.bsky.network"
SIGN_IN = {
    "accessJwt": "access-1",
    "refreshJwt": "refresh-1",
    "didDoc": {"service": [{"id": "#atproto_pds", "type": "AtprotoPersonalDataServer", "serviceEndpoint": PDS}]},
}


@pytest.fixture(autouse=True)
def _clean(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("ARCLI_BLUESKY_HANDLE", "ARCLI_BLUESKY_APP_PASSWORD", "ARCLI_BLUESKY_SERVICE_URL"):
        monkeypatch.delenv(name, raising=False)
    bluesky_session.reset_bluesky_session_for_tests()


def _sign_in_client(responses: list[httpx.Response], seen: list[httpx.Request]) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return responses.pop(0)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _with_credentials(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_BLUESKY_HANDLE", "arcli.bsky.social")
    monkeypatch.setenv("ARCLI_BLUESKY_APP_PASSWORD", "abcd-efgh-ijkl-mnop")


def test_without_credentials_search_stays_anonymous() -> None:
    seen: list[httpx.Request] = []

    async def run():
        async with _sign_in_client([], seen) as client:
            return await bluesky_session.bluesky_session(client)

    assert asyncio.run(run()) is None
    assert seen == []


def test_signs_in_once_and_searches_through_the_account_server(monkeypatch) -> None:
    _with_credentials(monkeypatch)
    seen: list[httpx.Request] = []

    async def run():
        async with _sign_in_client([httpx.Response(200, json=SIGN_IN)], seen) as client:
            first = await bluesky_session.bluesky_session(client)
            second = await bluesky_session.bluesky_session(client)
            return first, second

    first, second = asyncio.run(run())

    assert first is second  # reused, not a second sign-in
    assert len(seen) == 1
    assert seen[0].url == "https://bsky.social/xrpc/com.atproto.server.createSession"
    assert json.loads(seen[0].content) == {"identifier": "arcli.bsky.social", "password": "abcd-efgh-ijkl-mnop"}
    assert first.search_url == f"{PDS}/xrpc/app.bsky.feed.searchPosts"
    assert first.headers == {"Authorization": "Bearer access-1"}


def test_failed_sign_in_falls_back_and_waits_before_trying_again(monkeypatch, caplog) -> None:
    _with_credentials(monkeypatch)
    seen: list[httpx.Request] = []

    async def run():
        async with _sign_in_client([httpx.Response(401, json={"error": "AuthenticationRequired"})], seen) as client:
            first = await bluesky_session.bluesky_session(client)
            second = await bluesky_session.bluesky_session(client)
            return first, second

    assert asyncio.run(run()) == (None, None)
    assert len(seen) == 1
    assert "abcd-efgh" not in caplog.text


def test_a_rejected_session_is_replaced(monkeypatch) -> None:
    _with_credentials(monkeypatch)
    seen: list[httpx.Request] = []
    renewed = {**SIGN_IN, "accessJwt": "access-2"}

    async def run():
        async with _sign_in_client([httpx.Response(200, json=SIGN_IN), httpx.Response(200, json=renewed)], seen) as client:
            first = await bluesky_session.bluesky_session(client)
            return await bluesky_session.bluesky_session(client, replace=first)

    assert asyncio.run(run()).access_jwt == "access-2"
    assert len(seen) == 2


@pytest.mark.parametrize(
    ("status", "body", "rejected"),
    [(401, {}, True), (400, {"error": "ExpiredToken"}, True), (400, {"error": "InvalidRequest"}, False), (403, {}, False)],
)
def test_only_token_errors_trigger_a_new_sign_in(status, body, rejected) -> None:
    response = httpx.Response(status, json=body, request=httpx.Request("GET", "https://x"))
    error = httpx.HTTPStatusError("boom", request=response.request, response=response)

    assert bluesky_session.is_rejected_session(error) is rejected


def test_search_sends_the_token_only_on_the_account_server_url() -> None:
    session = BlueskySession(access_jwt="access-1", service_url=PDS, created_at=0)
    with patch.object(bluesky_connector, "fetch_json_with_retry", AsyncMock(return_value={"posts": []})) as request:
        asyncio.run(
            BlueskyConnector(request_interval_seconds=0)._fetch_page(
                object(), query="find customers", since_timestamp=0, cursor=None, page_size=25, page=0, session=session
            )
        )

    assert request.await_args.kwargs["url"] == f"{PDS}/xrpc/app.bsky.feed.searchPosts"
    assert request.await_args.kwargs["headers"] == {"Authorization": "Bearer access-1"}


def test_expired_token_mid_run_signs_in_again_and_retries_the_page() -> None:
    stale = BlueskySession(access_jwt="old", service_url=PDS, created_at=0)
    fresh = BlueskySession(access_jwt="new", service_url=PDS, created_at=1)
    expired = httpx.Response(400, json={"error": "ExpiredToken"}, request=httpx.Request("GET", PDS))
    connector = BlueskyConnector(request_interval_seconds=0)
    sessions = AsyncMock(side_effect=[stale, fresh])
    pages = AsyncMock(side_effect=[httpx.HTTPStatusError("expired", request=expired.request, response=expired), {"posts": []}])

    with patch.object(bluesky_connector, "bluesky_session", sessions), patch.object(connector, "_fetch_page", pages):
        asyncio.run(connector.fetch_recent_posts("find customers", 0, limit=10))

    assert sessions.await_args_list[1].kwargs == {"replace": stale}
    assert pages.await_args_list[1].kwargs["session"] is fresh
