from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime, timezone
from typing import Any

import httpcore
import httpx
import pytest

from api.services.prospecting.official_site_classifier import classify_official_site_page
from api.services.prospecting.official_site_fetch import (
    OfficialSiteFetcher,
    OfficialSiteFetchLimits,
    PinnedAddressBackend,
    resolve_public_dns,
)
from api.services.prospecting.official_site_generation import (
    OfficialSiteGenerationLimits,
    OfficialSiteGenerationRequest,
    plan_official_site_generation,
)


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
PUBLIC_IP = "93.184.216.34"


def _seed_plan(*, page_limit: int = 3):
    request = OfficialSiteGenerationRequest(
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        profile_version="profile-v1",
        target_types=["account", "project"],
        seed_urls=["https://acme.example/launch?tracking=ignored"],
        explicit_request=True,
    )
    limits = OfficialSiteGenerationLimits(
        seed_limit=1,
        page_limit_per_seed=page_limit,
        candidate_limit_per_seed=8,
        candidate_limit_total=8,
    )
    return plan_official_site_generation(request, limits=limits).seed_plans[0]


def _fetcher(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    resolver_answers: tuple[str, ...] = (PUBLIC_IP,),
    limits: OfficialSiteFetchLimits | None = None,
    resolver_calls: list[tuple[str, int]] | None = None,
    pin_calls: list[tuple[str, str, int]] | None = None,
) -> OfficialSiteFetcher:
    def resolver(host: str, port: int) -> tuple[str, ...]:
        if resolver_calls is not None:
            resolver_calls.append((host, port))
        return resolver_answers

    def transport_factory(host: str, address: str, port: int) -> httpx.BaseTransport:
        if pin_calls is not None:
            pin_calls.append((host, address, port))
        return httpx.MockTransport(handler)

    return OfficialSiteFetcher(
        limits=limits or OfficialSiteFetchLimits(max_pages=3),
        resolver=resolver,
        transport_factory=transport_factory,
        now=lambda: datetime(2026, 9, 23, 12, tzinfo=timezone.utc),
    )


def _html_response(request: httpx.Request, html: str, *, status: int = 200) -> httpx.Response:
    return httpx.Response(
        status,
        headers={"content-type": "text/html; charset=utf-8"},
        content=html.encode("utf-8"),
        request=request,
    )


def test_fetches_only_approved_same_origin_pages_and_returns_safe_metadata() -> None:
    requested_urls: list[str] = []
    resolver_calls: list[tuple[str, int]] = []
    pin_calls: list[tuple[str, str, int]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.path == "/launch":
            return _html_response(
                request,
                """
                <html><head>
                  <title>Acme sales@example.com</title>
                  <meta property="og:type" content="product">
                  <meta property="og:url" content="https://acme.example/atlas?utm=ignored">
                  <meta property="og:title" content="Atlas">
                  <script type="application/ld+json">
                    {"@type":"Organization","url":"https://acme.example/","name":"Acme"}
                  </script>
                </head><body>
                  <a href="/pricing?utm=ignore">Pricing</a>
                  <a href="/product">Product</a>
                  <a href="/blog/author/avery">Author history</a>
                  <a href="https://www.linkedin.com/company/acme">Social profile</a>
                  <a href="/about" rel="nofollow">About</a>
                </body></html>
                """,
            )
        if request.url.path == "/pricing":
            return _html_response(
                request,
                '<script type="application/ld+json">'
                '{"@type":"Product","url":"https://acme.example/pricing","name":"Pricing"}'
                "</script>",
            )
        if request.url.path == "/product":
            return _html_response(request, "<html><title>Product page</title></html>")
        raise AssertionError(f"unexpected request: {request.url}")

    result = _fetcher(
        handler,
        resolver_calls=resolver_calls,
        pin_calls=pin_calls,
    ).fetch(_seed_plan())

    assert result.outcome == "completed"
    assert [document.source_url for document in result.documents] == [
        "https://acme.example/launch",
        "https://acme.example/pricing",
        "https://acme.example/product",
    ]
    assert requested_urls == [
        "https://acme.example/launch",
        "https://acme.example/pricing",
        "https://acme.example/product",
    ]
    assert resolver_calls == [("acme.example", 443)] * 3
    assert pin_calls == [("acme.example", PUBLIC_IP, 443)] * 3

    seed_document = result.documents[0]
    assert seed_document.page_category == "seed"
    assert seed_document.discovered_page_urls == (
        "https://acme.example/pricing",
        "https://acme.example/product",
    )
    assert not hasattr(seed_document, "html")
    assert not hasattr(seed_document, "text")
    assert "sales@example.com" not in repr(seed_document)
    assert seed_document.json_ld[0]["@type"] == ("organization",)
    assert seed_document.open_graph == {
        "@type": ("product",),
        "url": "https://acme.example/atlas",
        "name": "Atlas",
    }

    classification = classify_official_site_page(_seed_plan(), seed_document.as_classifier_page())
    assert [proposal.entity.entity_kind for proposal in classification.proposals] == [
        "account",
        "project",
    ]


def test_same_origin_redirect_is_revalidated_and_cross_origin_redirect_is_skipped() -> None:
    resolver_calls: list[tuple[str, int]] = []
    pin_calls: list[tuple[str, str, int]] = []

    def same_origin_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/launch":
            return httpx.Response(302, headers={"location": "/pricing"}, request=request)
        return _html_response(request, "<html><title>Pricing</title></html>")

    same_origin = _fetcher(
        same_origin_handler,
        resolver_calls=resolver_calls,
        pin_calls=pin_calls,
    ).fetch(_seed_plan(page_limit=1))

    assert same_origin.outcome == "completed"
    assert [document.source_url for document in same_origin.documents] == ["https://acme.example/pricing"]
    assert resolver_calls == [("acme.example", 443), ("acme.example", 443)]
    assert pin_calls == [("acme.example", PUBLIC_IP, 443)] * 2

    def off_origin_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            302,
            headers={"location": "https://social.example/profile/acme"},
            request=request,
        )

    cross_origin = _fetcher(off_origin_handler).fetch(_seed_plan(page_limit=1))
    assert cross_origin.outcome == "partial"
    assert cross_origin.documents == ()
    assert cross_origin.skipped[0].reason_code == "cross_origin_redirect"
    assert cross_origin.skipped[0].url == "https://social.example/profile/acme"


def test_private_or_mixed_dns_answers_never_reach_the_transport() -> None:
    transport_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("the fetcher must not issue a request")

    def transport_factory(host: str, address: str, port: int) -> httpx.BaseTransport:
        nonlocal transport_calls
        transport_calls += 1
        return httpx.MockTransport(handler)

    fetcher = OfficialSiteFetcher(
        resolver=lambda _host, _port: (PUBLIC_IP, "127.0.0.1"),
        transport_factory=transport_factory,
    )
    result = fetcher.fetch(_seed_plan(page_limit=1))

    assert result.outcome == "partial"
    assert result.skipped[0].reason_code == "dns_non_public_address"
    assert transport_calls == 0


def test_response_and_page_budgets_end_in_a_transparent_partial_result() -> None:
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        return _html_response(
            request,
            "<a href='/pricing'>Pricing</a>" + ("x" * 1_100),
        )

    too_large = _fetcher(
        handler,
        limits=OfficialSiteFetchLimits(
            max_pages=1,
            max_response_bytes=1_024,
            max_total_bytes=1_024,
        ),
    ).fetch(_seed_plan(page_limit=1))
    assert too_large.outcome == "partial"
    assert too_large.skipped[0].reason_code == "response_body_limit_exceeded"

    def bounded_handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        return _html_response(request, "<a href='/pricing'>Pricing</a>")

    page_limited = _fetcher(
        bounded_handler,
        limits=OfficialSiteFetchLimits(max_pages=1),
    ).fetch(_seed_plan(page_limit=2))
    assert page_limited.outcome == "partial"
    assert page_limited.skipped[-1].reason_code == "page_limit_reached"
    assert page_limited.pages_requested == 1
    assert requested_urls[-1] == "https://acme.example/launch"


def test_pinned_backend_replaces_only_the_tcp_destination() -> None:
    class RecordingBackend(httpcore.NetworkBackend):
        def __init__(self) -> None:
            self.calls: list[dict[str, Any]] = []
            self.stream = object()

        def connect_tcp(
            self,
            host: str,
            port: int,
            timeout: float | None = None,
            local_address: str | None = None,
            socket_options: Any = None,
        ) -> Any:
            self.calls.append(
                {
                    "host": host,
                    "port": port,
                    "timeout": timeout,
                    "local_address": local_address,
                }
            )
            return self.stream

        def connect_unix_socket(self, path: str, timeout: float | None = None, socket_options: Any = None) -> Any:
            raise AssertionError("UNIX sockets must not be used")

    delegate = RecordingBackend()
    backend = PinnedAddressBackend(
        expected_host="acme.example",
        expected_port=443,
        pinned_address=PUBLIC_IP,
        delegate=delegate,
    )

    assert backend.connect_tcp("ACME.EXAMPLE", 443, timeout=1.5) is delegate.stream
    assert delegate.calls == [
        {"host": PUBLIC_IP, "port": 443, "timeout": 1.5, "local_address": None}
    ]
    with pytest.raises(httpcore.ConnectError):
        backend.connect_tcp("other.example", 443)
    with pytest.raises(httpcore.ConnectError):
        backend.connect_unix_socket("ignored")


def test_public_dns_resolver_uses_only_validated_addresses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "api.services.prospecting.official_site_fetch.socket.getaddrinfo",
        lambda *args, **kwargs: [
            (2, 1, 6, "", (PUBLIC_IP, 443)),
            (10, 1, 6, "", ("2001:4860:4860::8888", 443, 0, 0)),
        ],
    )

    assert resolve_public_dns("acme.example", 443) == (
        PUBLIC_IP,
        "2001:4860:4860::8888",
    )


def test_widened_plan_is_rejected_before_dns_or_http() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("unsafe plans must be rejected before fetching")

    widened = replace(_seed_plan(page_limit=1), allow_social_lookup=True)
    result = _fetcher(handler).fetch(widened)

    assert result.outcome == "skipped"
    assert result.skipped[0].reason_code == "unsafe_seed_plan"


def test_explicit_default_port_keeps_the_plan_origin_identity_for_classification() -> None:
    explicit_port_plan = replace(
        _seed_plan(page_limit=1),
        seed_url="https://acme.example:443/launch",
        origin_url="https://acme.example:443",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return _html_response(
            request,
            '<script type="application/ld+json">'
            '{"@type":"Organization","url":"https://acme.example:443/","name":"Acme"}'
            "</script>",
        )

    result = _fetcher(handler).fetch(explicit_port_plan)

    assert result.documents[0].source_url == "https://acme.example:443/launch"
    classification = classify_official_site_page(
        explicit_port_plan,
        result.documents[0].as_classifier_page(),
    )
    assert [proposal.entity.entity_kind for proposal in classification.proposals] == ["account"]
