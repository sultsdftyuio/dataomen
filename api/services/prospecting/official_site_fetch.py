"""Safe, bounded retrieval for an approved official-site generation plan.

This is deliberately a narrow transport boundary, not a general purpose web
crawler.  It accepts an :class:`OfficialSiteSeedPlan`, revalidates the DNS
answer immediately before every request, and makes httpcore connect to that
validated address rather than asking the operating system to resolve the host
again.  TLS SNI and the HTTP ``Host`` header still use the approved hostname.

The module does not classify content, create entities, write evidence, or
follow a person/profile/history surface.  It produces a small collection of
redacted page documents for a later, separately-authorized classifier.
"""

from __future__ import annotations

import ipaddress
import json
import re
import socket
import ssl
import time
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Literal, cast
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

import httpcore
import httpx

from api.services.social.candidate_privacy import redacted_text

from .entity_first import normalize_public_url
from .official_site_generation import (
    MAX_PAGES_PER_SEED,
    OFFICIAL_SITE_PAGE_CATEGORIES,
    OfficialSitePageCategory,
    OfficialSiteSeedPlan,
)
from .official_site_classifier import OfficialSiteFetchedPage


OfficialSiteFetchOutcome = Literal["completed", "partial", "skipped"]
OfficialSiteFetchSkipReason = Literal[
    "seed_not_planned",
    "unsafe_seed_plan",
    "invalid_seed_plan",
    "run_deadline_exceeded",
    "page_limit_reached",
    "invalid_page_url",
    "outside_seed_origin",
    "disallowed_page_path",
    "dns_resolution_failed",
    "dns_non_public_address",
    "request_timeout",
    "request_error",
    "cross_origin_redirect",
    "invalid_redirect",
    "redirect_limit_reached",
    "http_status_error",
    "non_html_content",
    "response_body_limit_exceeded",
    "total_byte_limit_exceeded",
    "malformed_html",
]


MAX_FETCH_PAGES_PER_SEED = MAX_PAGES_PER_SEED
MAX_REDIRECTS_PER_PAGE = 3
MAX_RESPONSE_BYTES = 512 * 1024
MAX_TOTAL_BYTES = MAX_RESPONSE_BYTES * MAX_FETCH_PAGES_PER_SEED
MAX_DISCOVERED_PAGE_URLS = 64
MAX_FETCH_SECONDS = 45.0
MAX_REQUEST_TIMEOUT_SECONDS = 15.0


# This mirrors the entity-first evidence boundary: a later classifier should
# never receive direct-contact data just because a public marketing page has
# it in a footer.
_PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-])?(?:\(?\d{2,4}\)?[\s.-])\d{3,4}[\s.-]\d{3,4}(?!\w)"
)
_SPACE_PATTERN = re.compile(r"\s+")

# These are intentionally path segments, not broad substring checks.  A
# product page may say "community" in its copy, but a /community/user page is
# a people/history surface and must not enter the retrieval queue.
_DISALLOWED_PATH_SEGMENTS = frozenset(
    {
        "account",
        "accounts",
        "archive",
        "author",
        "authors",
        "blog",
        "comment",
        "comments",
        "community",
        "discussion",
        "feed",
        "forum",
        "history",
        "login",
        "members",
        "news",
        "people",
        "post",
        "posts",
        "profile",
        "profiles",
        "register",
        "signin",
        "signup",
        "thread",
        "threads",
        "user",
        "users",
    }
)

_CATEGORY_PATH_MARKERS: dict[OfficialSitePageCategory, tuple[str, ...]] = {
    "pricing": ("price", "pricing", "plan", "plans", "billing", "package"),
    "product": ("product", "platform", "software", "tool", "how-it-works"),
    "features": ("feature", "features", "capability", "capabilities"),
    "solutions": ("solution", "solutions", "use-case", "usecases", "industries"),
    "customers": ("customer", "customers", "case-study", "case-studies", "success-story"),
    "integrations": ("integration", "integrations", "partner", "partners", "compare"),
    "about": ("about", "company", "our-story", "mission"),
    # ``seed`` and ``homepage`` are assigned explicitly rather than inferred
    # from arbitrary paths.
    "seed": (),
    "homepage": (),
}


@dataclass(frozen=True)
class OfficialSiteFetchLimits:
    """Hard resource bounds for one official-site seed plan.

    The fetcher can tighten a plan but never expand it.  A worker can use a
    smaller operational budget while retaining the planner's six-page maximum.
    """

    max_pages: int = MAX_FETCH_PAGES_PER_SEED
    max_redirects_per_page: int = 2
    max_response_bytes: int = MAX_RESPONSE_BYTES
    max_total_bytes: int = MAX_TOTAL_BYTES
    max_discovered_page_urls: int = MAX_DISCOVERED_PAGE_URLS
    run_timeout_seconds: float = 30.0
    connect_timeout_seconds: float = 4.0
    request_timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        _bounded_int(
            self.max_pages,
            field_name="max_pages",
            minimum=1,
            maximum=MAX_FETCH_PAGES_PER_SEED,
        )
        _bounded_int(
            self.max_redirects_per_page,
            field_name="max_redirects_per_page",
            minimum=0,
            maximum=MAX_REDIRECTS_PER_PAGE,
        )
        _bounded_int(
            self.max_response_bytes,
            field_name="max_response_bytes",
            minimum=1_024,
            maximum=MAX_RESPONSE_BYTES,
        )
        _bounded_int(
            self.max_total_bytes,
            field_name="max_total_bytes",
            minimum=self.max_response_bytes,
            maximum=MAX_TOTAL_BYTES,
        )
        _bounded_int(
            self.max_discovered_page_urls,
            field_name="max_discovered_page_urls",
            minimum=1,
            maximum=MAX_DISCOVERED_PAGE_URLS,
        )
        _bounded_float(
            self.run_timeout_seconds,
            field_name="run_timeout_seconds",
            minimum=1.0,
            maximum=MAX_FETCH_SECONDS,
        )
        _bounded_float(
            self.connect_timeout_seconds,
            field_name="connect_timeout_seconds",
            minimum=0.1,
            maximum=MAX_REQUEST_TIMEOUT_SECONDS,
        )
        _bounded_float(
            self.request_timeout_seconds,
            field_name="request_timeout_seconds",
            minimum=0.1,
            maximum=MAX_REQUEST_TIMEOUT_SECONDS,
        )
        if self.connect_timeout_seconds > self.request_timeout_seconds:
            raise ValueError("connect_timeout_seconds cannot exceed request_timeout_seconds")


@dataclass(frozen=True)
class OfficialSiteFetchSkip:
    """A bounded, non-sensitive explanation for one skipped request."""

    url: str | None
    reason_code: OfficialSiteFetchSkipReason
    status_code: int | None = None


@dataclass(frozen=True)
class OfficialSitePageDocument:
    """A bounded official-site document with only classifier-safe metadata.

    It intentionally has no raw HTML, extracted page text, script body, or
    direct-contact values. ``json_ld`` and ``open_graph`` have already passed
    through ``OfficialSiteFetchedPage``'s restrictive metadata sanitizer.
    """

    source_url: str
    page_category: OfficialSitePageCategory
    status_code: int
    content_type: str
    title: str | None
    json_ld: tuple[Mapping[str, object], ...]
    open_graph: Mapping[str, object] | None
    discovered_page_urls: tuple[str, ...]
    body_bytes: int
    fetched_at: datetime
    source_kind: Literal["official_site"] = "official_site"
    same_origin_only: Literal[True] = True

    def as_classifier_page(self) -> OfficialSiteFetchedPage:
        """Return the already-sanitized pure input consumed by the classifier."""

        return OfficialSiteFetchedPage(
            self.source_url,
            json_ld=self.json_ld,
            open_graph=self.open_graph,
            title=self.title,
        )


@dataclass(frozen=True)
class OfficialSiteFetchResult:
    """Result of a finite seed fetch.  It does not make a target claim."""

    seed_url: str
    outcome: OfficialSiteFetchOutcome
    documents: tuple[OfficialSitePageDocument, ...]
    skipped: tuple[OfficialSiteFetchSkip, ...]
    pages_requested: int
    total_body_bytes: int

    @property
    def is_complete(self) -> bool:
        return self.outcome == "completed"


@dataclass(frozen=True)
class _Origin:
    scheme: str
    host: str
    port: int


PublicDnsResolver = Callable[[str, int], Sequence[str]]
PinnedTransportFactory = Callable[[str, str, int], httpx.BaseTransport]
Clock = Callable[[], float]
Now = Callable[[], datetime]


def _bounded_int(value: object, *, field_name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field_name} must be an integer")
    if not minimum <= value <= maximum:
        raise ValueError(f"{field_name} must be between {minimum} and {maximum}")
    return value


def _bounded_float(value: object, *, field_name: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise ValueError(f"{field_name} must be a number")
    numeric = float(value)
    if not minimum <= numeric <= maximum:
        raise ValueError(f"{field_name} must be between {minimum} and {maximum}")
    return numeric


DEFAULT_OFFICIAL_SITE_FETCH_LIMITS = OfficialSiteFetchLimits()


def _canonical_host(host: str) -> str:
    """Return an ASCII host identity suitable for DNS and strict origin checks."""

    candidate = host.casefold().rstrip(".")
    if not candidate:
        raise ValueError("URL must include a host")
    try:
        # IP literals must not be IDNA encoded.  ``ip_address`` also keeps the
        # stable compressed form used by the pinned TCP backend.
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        try:
            return candidate.encode("idna").decode("ascii")
        except UnicodeError as error:
            raise ValueError("URL has an invalid hostname") from error


def _default_port(scheme: str) -> int:
    if scheme == "https":
        return 443
    if scheme == "http":
        return 80
    raise ValueError("URL must use http or https")


def _origin_for_url(value: str) -> _Origin:
    parsed = urlsplit(value)
    scheme = parsed.scheme.casefold()
    host = _canonical_host(parsed.hostname or "")
    try:
        port = parsed.port or _default_port(scheme)
    except ValueError as error:
        raise ValueError("URL has an invalid port") from error
    return _Origin(scheme=scheme, host=host, port=port)


def _normalized_page_url(value: object) -> str:
    """Validate a public URL and remove query/fragment crawl variants."""

    normalized = normalize_public_url(value)
    parsed = urlsplit(normalized)
    # Preserve the approved origin spelling, including an explicit default
    # port. The pure classifier compares source URLs against the plan's origin
    # as a URL value, while connection safety uses the canonical _Origin below.
    _origin_for_url(normalized)
    return urlunsplit((parsed.scheme.casefold(), parsed.netloc.casefold(), parsed.path or "/", "", ""))


def _with_seed_origin_spelling(value: str, seed_url: str) -> str:
    """Keep same-origin redirects compatible with the plan's URL identity."""

    if not _same_origin(value, seed_url):
        return value
    target = urlsplit(value)
    seed = urlsplit(seed_url)
    return urlunsplit((seed.scheme, seed.netloc, target.path or "/", "", ""))


def _is_public_address(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return False
    # ``is_global`` excludes local, loopback, link-local, multicast,
    # documentation, shared-carrier, and other special-use ranges.  Requiring
    # it is stricter than relying on only ``is_private``.
    return address.is_global


def _validated_public_addresses(addresses: Iterable[str]) -> tuple[str, ...]:
    """Validate *all* DNS answers before choosing an address.

    Rejecting a mixed public/private answer is intentionally conservative.  A
    later OS-level resolution is never permitted; the selected public answer is
    pinned into the TCP connection below.
    """

    normalized: list[str] = []
    seen: set[str] = set()
    for raw_address in addresses:
        try:
            address = ipaddress.ip_address(str(raw_address))
        except ValueError as error:
            raise ValueError("DNS returned an invalid address") from error
        if not _is_public_address(str(address)):
            raise ValueError("DNS returned a non-public address")
        canonical = str(address)
        if canonical not in seen:
            seen.add(canonical)
            normalized.append(canonical)
    if not normalized:
        raise ValueError("DNS returned no addresses")
    return tuple(normalized)


def resolve_public_dns(host: str, port: int) -> tuple[str, ...]:
    """Resolve a host once and return only validated public IP addresses.

    The caller must still use one returned address to create the socket; merely
    validating a DNS response and then passing the hostname to a client leaves
    a DNS-rebinding window.
    """

    canonical_host = _canonical_host(host)
    try:
        literal = ipaddress.ip_address(canonical_host)
    except ValueError:
        literal = None
    if literal is not None:
        return _validated_public_addresses((str(literal),))

    try:
        records = socket.getaddrinfo(
            canonical_host,
            port,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except OSError as error:
        raise ValueError("DNS resolution failed") from error
    return _validated_public_addresses(record[4][0] for record in records)


class PinnedAddressBackend(httpcore.NetworkBackend):
    """A httpcore backend that connects to exactly one prevalidated IP.

    httpcore continues to see the original hostname, so HTTPS certificate
    verification and SNI cannot be bypassed by the pinned-address mechanism.
    The delegate receives the IP address only at the final TCP connection step.
    """

    def __init__(
        self,
        *,
        expected_host: str,
        expected_port: int,
        pinned_address: str,
        delegate: httpcore.NetworkBackend | None = None,
    ) -> None:
        if not _is_public_address(pinned_address):
            raise ValueError("pinned_address must be a public IP address")
        self._expected_host = _canonical_host(expected_host)
        self._expected_port = expected_port
        self._pinned_address = str(ipaddress.ip_address(pinned_address))
        self._delegate = delegate or httpcore.SyncBackend()

    def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[httpcore.SOCKET_OPTION] | None = None,
    ) -> httpcore.NetworkStream:
        if _canonical_host(host) != self._expected_host or port != self._expected_port:
            raise httpcore.ConnectError("pinned backend rejected an unexpected origin")
        return self._delegate.connect_tcp(
            host=self._pinned_address,
            port=port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

    def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Iterable[httpcore.SOCKET_OPTION] | None = None,
    ) -> httpcore.NetworkStream:
        raise httpcore.ConnectError("official-site fetching does not allow UNIX sockets")


class _PinnedResponseStream(httpx.SyncByteStream):
    def __init__(self, stream: Iterable[bytes]) -> None:
        self._stream = stream

    def __iter__(self) -> Iterable[bytes]:
        try:
            yield from self._stream
        except httpcore.TimeoutException as error:
            raise httpx.ReadTimeout(str(error)) from error
        except httpcore.NetworkError as error:
            raise httpx.ReadError(str(error)) from error

    def close(self) -> None:
        close = getattr(self._stream, "close", None)
        if callable(close):
            close()


class PinnedAddressTransport(httpx.BaseTransport):
    """A direct httpx transport using :class:`PinnedAddressBackend`.

    It deliberately creates no proxy transport and callers create a fresh
    instance for every request.  That avoids connection reuse or HTTP/2 host
    coalescing across DNS revalidation boundaries.
    """

    def __init__(self, *, host: str, pinned_address: str, port: int) -> None:
        self._pool = httpcore.ConnectionPool(
            ssl_context=ssl.create_default_context(),
            max_connections=1,
            max_keepalive_connections=0,
            keepalive_expiry=0.0,
            http1=True,
            http2=False,
            retries=0,
            network_backend=PinnedAddressBackend(
                expected_host=host,
                expected_port=port,
                pinned_address=pinned_address,
            ),
        )

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        if not isinstance(request.stream, httpx.SyncByteStream):
            raise RuntimeError("PinnedAddressTransport requires a synchronous request stream")
        request_url = httpcore.URL(
            scheme=request.url.raw_scheme,
            host=request.url.raw_host,
            port=request.url.port,
            target=request.url.raw_path,
        )
        core_request = httpcore.Request(
            method=request.method,
            url=request_url,
            headers=request.headers.raw,
            content=request.stream,
            extensions=request.extensions,
        )
        try:
            response = self._pool.handle_request(core_request)
        except httpcore.ConnectTimeout as error:
            raise httpx.ConnectTimeout(str(error), request=request) from error
        except httpcore.ReadTimeout as error:
            raise httpx.ReadTimeout(str(error), request=request) from error
        except httpcore.WriteTimeout as error:
            raise httpx.WriteTimeout(str(error), request=request) from error
        except httpcore.PoolTimeout as error:
            raise httpx.PoolTimeout(str(error), request=request) from error
        except httpcore.ConnectError as error:
            raise httpx.ConnectError(str(error), request=request) from error
        except httpcore.ReadError as error:
            raise httpx.ReadError(str(error), request=request) from error
        except httpcore.WriteError as error:
            raise httpx.WriteError(str(error), request=request) from error
        except httpcore.ProtocolError as error:
            raise httpx.ProtocolError(str(error), request=request) from error
        except httpcore.NetworkError as error:
            raise httpx.NetworkError(str(error), request=request) from error

        return httpx.Response(
            status_code=response.status,
            headers=response.headers,
            stream=_PinnedResponseStream(cast(Iterable[bytes], response.stream)),
            extensions=response.extensions,
            request=request,
        )

    def close(self) -> None:
        self._pool.close()


def _default_transport_factory(host: str, address: str, port: int) -> httpx.BaseTransport:
    return PinnedAddressTransport(host=host, pinned_address=address, port=port)


def _same_origin(left: str, right: str) -> bool:
    return _origin_for_url(left) == _origin_for_url(right)


def _path_segments(url: str) -> tuple[str, ...]:
    path = unquote(urlsplit(url).path).casefold()
    return tuple(segment for segment in path.split("/") if segment)


def _is_disallowed_path(url: str) -> bool:
    return bool(set(_path_segments(url)) & _DISALLOWED_PATH_SEGMENTS)


def _page_category(
    url: str,
    *,
    allowed_categories: Sequence[OfficialSitePageCategory],
    is_seed: bool,
) -> OfficialSitePageCategory | None:
    if is_seed and "seed" in allowed_categories:
        return "seed"
    path = urlsplit(url).path.casefold().rstrip("/")
    if not path and "homepage" in allowed_categories:
        return "homepage"
    segments = _path_segments(url)
    for category in OFFICIAL_SITE_PAGE_CATEGORIES:
        if category in {"seed", "homepage"} or category not in allowed_categories:
            continue
        markers = _CATEGORY_PATH_MARKERS[category]
        if any(marker in segment for marker in markers for segment in segments):
            return category
    return None


def _safe_text(value: object, *, maximum: int) -> str:
    text = redacted_text(value, maximum=maximum)
    return _PHONE_PATTERN.sub("[redacted-phone]", text)


class _OfficialSiteHtmlParser(HTMLParser):
    """Extract only safe metadata and nofollow-aware anchor targets from HTML."""

    _IGNORED_TAGS = frozenset({"script", "style", "template", "noscript", "svg"})

    def __init__(self, *, max_links: int) -> None:
        super().__init__(convert_charrefs=True)
        self._max_links = max_links
        self._ignored_depth = 0
        self._in_title = False
        self._in_json_ld = False
        self._json_ld_chars = 0
        self._json_ld_blocks: list[str] = []
        self._current_json_ld_parts: list[str] = []
        self._title_parts: list[str] = []
        self._links: list[str] = []
        self._open_graph: dict[str, str] = {}

    @property
    def title(self) -> str:
        return _SPACE_PATTERN.sub(" ", " ".join(self._title_parts)).strip()

    @property
    def links(self) -> tuple[str, ...]:
        return tuple(self._links)

    @property
    def json_ld(self) -> tuple[Mapping[str, object], ...]:
        """Decode at most the known JSON-LD object shapes without retaining scripts."""

        if not self._json_ld_blocks:
            return ()
        records: list[Mapping[str, object]] = []
        for block in self._json_ld_blocks:
            try:
                decoded = json.loads(block)
            except (TypeError, ValueError):
                continue
            if isinstance(decoded, Mapping):
                records.append(cast(Mapping[str, object], decoded))
            elif isinstance(decoded, list):
                records.extend(
                    cast(Mapping[str, object], item)
                    for item in decoded[:16]
                    if isinstance(item, Mapping)
                )
            if len(records) >= 16:
                break
        return tuple(records[:16])

    @property
    def open_graph(self) -> Mapping[str, object] | None:
        return dict(self._open_graph) or None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        attributes = {name.casefold(): value for name, value in attrs}
        if tag == "script":
            script_type = (attributes.get("type") or "").split(";", 1)[0].casefold().strip()
            if (
                script_type == "application/ld+json"
                and not self._in_json_ld
                and len(self._json_ld_blocks) < 16
            ):
                self._in_json_ld = True
                self._current_json_ld_parts = []
            else:
                self._ignored_depth += 1
            return
        if tag in self._IGNORED_TAGS:
            self._ignored_depth += 1
            return
        if tag == "title":
            self._in_title = True
            return
        if tag == "meta" and not self._ignored_depth:
            key = (attributes.get("property") or attributes.get("name") or "").casefold().strip()
            content = attributes.get("content")
            if (
                key in {"og:type", "og:url", "og:title"}
                and isinstance(content, str)
                and key not in self._open_graph
                and len(self._open_graph) < 3
            ):
                self._open_graph[key] = content[:2_048]
            return
        if tag != "a" or self._ignored_depth or len(self._links) >= self._max_links:
            return
        href = attributes.get("href")
        rel = (attributes.get("rel") or "").casefold().split()
        if href and "nofollow" not in rel:
            self._links.append(href)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag == "script":
            if self._in_json_ld:
                if self._current_json_ld_parts:
                    self._json_ld_blocks.append("".join(self._current_json_ld_parts))
                self._current_json_ld_parts = []
                self._in_json_ld = False
            elif self._ignored_depth:
                self._ignored_depth -= 1
        elif tag in self._IGNORED_TAGS and self._ignored_depth:
            self._ignored_depth -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_json_ld:
            remaining = 128_000 - self._json_ld_chars
            if remaining > 0:
                clipped = data[:remaining]
                self._current_json_ld_parts.append(clipped)
                self._json_ld_chars += len(clipped)
            return
        if self._ignored_depth:
            return
        if self._in_title:
            self._title_parts.append(data)


def _extract_document(
    *,
    source_url: str,
    page_category: OfficialSitePageCategory,
    content_type: str,
    body: bytes,
    limits: OfficialSiteFetchLimits,
    fetched_at: datetime,
) -> tuple[OfficialSitePageDocument, tuple[str, ...]]:
    # Deliberately tolerate malformed encoding rather than asking a site for a
    # second resource or retaining raw binary. HTMLParser only receives the
    # already bounded body and returns structured metadata, never raw content.
    parser = _OfficialSiteHtmlParser(max_links=limits.max_discovered_page_urls)
    parser.feed(body.decode("utf-8", errors="replace"))
    parser.close()
    safe_page = OfficialSiteFetchedPage(
        source_url,
        json_ld=parser.json_ld,
        open_graph=parser.open_graph,
        title=_safe_text(parser.title, maximum=240) or None,
    )
    document = OfficialSitePageDocument(
        source_url=source_url,
        page_category=page_category,
        status_code=200,  # replaced by the caller with the actual successful status.
        content_type=content_type,
        title=safe_page.title,
        json_ld=cast(tuple[Mapping[str, object], ...], safe_page.json_ld),
        open_graph=cast(Mapping[str, object] | None, safe_page.open_graph),
        discovered_page_urls=(),
        body_bytes=len(body),
        fetched_at=fetched_at,
    )
    return document, parser.links


def _content_type(response: httpx.Response) -> str:
    return response.headers.get("content-type", "").split(";", 1)[0].casefold().strip()


def _is_html_content_type(content_type: str) -> bool:
    return content_type in {"text/html", "application/xhtml+xml"}


def _read_response_body(
    response: httpx.Response,
    *,
    remaining_total_bytes: int,
    limits: OfficialSiteFetchLimits,
) -> tuple[bytes | None, OfficialSiteFetchSkipReason | None]:
    content_length = response.headers.get("content-length")
    if content_length:
        try:
            declared = int(content_length)
        except ValueError:
            declared = None
        if declared is not None and declared > limits.max_response_bytes:
            return None, "response_body_limit_exceeded"
        if declared is not None and declared > remaining_total_bytes:
            return None, "total_byte_limit_exceeded"

    body = bytearray()
    try:
        for chunk in response.iter_bytes(chunk_size=8_192):
            if not chunk:
                continue
            if len(body) + len(chunk) > limits.max_response_bytes:
                return None, "response_body_limit_exceeded"
            if len(body) + len(chunk) > remaining_total_bytes:
                return None, "total_byte_limit_exceeded"
            body.extend(chunk)
    except httpx.TimeoutException:
        return None, "request_timeout"
    except httpx.RequestError:
        return None, "request_error"
    return bytes(body), None


class OfficialSiteFetcher:
    """Fetch finite, same-origin official-site pages from a trusted plan.

    ``resolver`` and ``transport_factory`` are dependency-injection seams for
    deterministic tests.  The production defaults are the DNS validator and
    pinned direct transport above; callers should not replace them in runtime
    wiring.
    """

    def __init__(
        self,
        *,
        limits: OfficialSiteFetchLimits = DEFAULT_OFFICIAL_SITE_FETCH_LIMITS,
        resolver: PublicDnsResolver = resolve_public_dns,
        transport_factory: PinnedTransportFactory = _default_transport_factory,
        clock: Clock = time.monotonic,
        now: Now = lambda: datetime.now(timezone.utc),
    ) -> None:
        if not isinstance(limits, OfficialSiteFetchLimits):
            raise ValueError("limits must be an OfficialSiteFetchLimits")
        self._limits = limits
        self._resolver = resolver
        self._transport_factory = transport_factory
        self._clock = clock
        self._now = now

    def fetch(self, plan: OfficialSiteSeedPlan) -> OfficialSiteFetchResult:
        """Retrieve only pages permitted by ``plan`` without classifying them."""

        seed_url, preflight_skip = self._preflight(plan)
        if preflight_skip is not None:
            return OfficialSiteFetchResult(
                seed_url=seed_url,
                outcome="skipped",
                documents=(),
                skipped=(preflight_skip,),
                pages_requested=0,
                total_body_bytes=0,
            )

        assert isinstance(plan, OfficialSiteSeedPlan)
        limits = self._limits
        start = self._clock()
        deadline = start + limits.run_timeout_seconds
        origin = _origin_for_url(seed_url)
        allowed_categories = tuple(
            category
            for category in plan.allowed_page_categories
            if category in OFFICIAL_SITE_PAGE_CATEGORIES
        )
        page_budget = min(plan.page_limit, limits.max_pages)
        pending = [seed_url]
        queued = {seed_url}
        documents: list[OfficialSitePageDocument] = []
        skipped: list[OfficialSiteFetchSkip] = []
        pages_requested = 0
        total_body_bytes = 0
        partial = False

        while pending:
            if self._clock() >= deadline:
                skipped.append(OfficialSiteFetchSkip(None, "run_deadline_exceeded"))
                partial = True
                break
            if pages_requested >= page_budget:
                skipped.append(OfficialSiteFetchSkip(None, "page_limit_reached"))
                partial = True
                break

            requested_url = pending.pop(0)
            pages_requested += 1
            page_category = _page_category(
                requested_url,
                allowed_categories=allowed_categories,
                is_seed=requested_url == seed_url,
            )
            # A redirect can leave the initial root at a locale page.  Links,
            # however, only enter the queue if they map to an approved category.
            if page_category is None and requested_url != seed_url:
                skipped.append(OfficialSiteFetchSkip(requested_url, "disallowed_page_path"))
                partial = True
                continue

            fetched = self._fetch_one(
                requested_url,
                origin=origin,
                deadline=deadline,
                remaining_total_bytes=limits.max_total_bytes - total_body_bytes,
            )
            if isinstance(fetched, OfficialSiteFetchSkip):
                skipped.append(fetched)
                partial = True
                continue

            response_url, status_code, content_type, body = fetched
            total_body_bytes += len(body)
            final_category = _page_category(
                response_url,
                allowed_categories=allowed_categories,
                is_seed=requested_url == seed_url,
            )
            if final_category is None:
                # We only reach this for an allowed same-origin redirect from a
                # seed. It is safe to retain the document as the seed surface.
                final_category = "seed"
            try:
                document, raw_links = _extract_document(
                    source_url=response_url,
                    page_category=final_category,
                    content_type=content_type,
                    body=body,
                    limits=limits,
                    fetched_at=self._now(),
                )
            except Exception:
                skipped.append(OfficialSiteFetchSkip(response_url, "malformed_html", status_code))
                partial = True
                continue

            discovered = self._discover_same_origin_pages(
                base_url=response_url,
                raw_links=raw_links,
                seed_origin=origin,
                allowed_categories=allowed_categories,
                seen=queued,
                remaining_slots=max(0, limits.max_discovered_page_urls - len(queued)),
            )
            queued.update(discovered)
            pending.extend(discovered)
            documents.append(
                OfficialSitePageDocument(
                    source_url=document.source_url,
                    page_category=document.page_category,
                    status_code=status_code,
                    content_type=document.content_type,
                    title=document.title,
                    json_ld=document.json_ld,
                    open_graph=document.open_graph,
                    discovered_page_urls=discovered,
                    body_bytes=document.body_bytes,
                    fetched_at=document.fetched_at,
                )
            )

        return OfficialSiteFetchResult(
            seed_url=seed_url,
            outcome="partial" if partial else "completed",
            documents=tuple(documents),
            skipped=tuple(skipped),
            pages_requested=pages_requested,
            total_body_bytes=total_body_bytes,
        )

    def _preflight(
        self,
        plan: OfficialSiteSeedPlan,
    ) -> tuple[str, OfficialSiteFetchSkip | None]:
        seed_url = ""
        if not isinstance(plan, OfficialSiteSeedPlan):
            return seed_url, OfficialSiteFetchSkip(None, "invalid_seed_plan")
        try:
            seed_url = _normalized_page_url(plan.seed_url)
            declared_origin = _normalized_page_url(plan.origin_url + "/")
        except ValueError:
            return seed_url, OfficialSiteFetchSkip(seed_url or None, "invalid_seed_plan")
        if not plan.is_planned:
            return seed_url, OfficialSiteFetchSkip(seed_url, "seed_not_planned")
        if not _same_origin(seed_url, declared_origin):
            return seed_url, OfficialSiteFetchSkip(seed_url, "invalid_seed_plan")
        origin_path = urlsplit(plan.origin_url).path
        if origin_path not in {"", "/"} or urlsplit(plan.origin_url).query:
            return seed_url, OfficialSiteFetchSkip(seed_url, "invalid_seed_plan")
        if plan.page_limit < 1 or plan.candidate_limit < 1:
            return seed_url, OfficialSiteFetchSkip(seed_url, "invalid_seed_plan")
        if "seed" not in plan.allowed_page_categories:
            return seed_url, OfficialSiteFetchSkip(seed_url, "unsafe_seed_plan")
        if (
            not plan.same_origin_only
            or plan.allow_cross_origin_redirects
            or plan.allow_external_site_links
            or plan.allow_social_lookup
            or plan.allow_public_source_search
            or plan.allow_author_history
            or plan.allow_private_sources
            or not plan.requires_dns_revalidation
            or not plan.requires_official_site_classification
        ):
            return seed_url, OfficialSiteFetchSkip(seed_url, "unsafe_seed_plan")
        return seed_url, None

    def _fetch_one(
        self,
        requested_url: str,
        *,
        origin: _Origin,
        deadline: float,
        remaining_total_bytes: int,
    ) -> tuple[str, int, str, bytes] | OfficialSiteFetchSkip:
        current_url = requested_url
        redirects = 0
        seen_redirects = {requested_url}

        while True:
            if self._clock() >= deadline:
                return OfficialSiteFetchSkip(current_url, "run_deadline_exceeded")
            try:
                current_url = _normalized_page_url(current_url)
                if _origin_for_url(current_url) != origin:
                    return OfficialSiteFetchSkip(current_url, "outside_seed_origin")
                current_url = _with_seed_origin_spelling(current_url, requested_url)
                if current_url != requested_url and _is_disallowed_path(current_url):
                    return OfficialSiteFetchSkip(current_url, "disallowed_page_path")
            except ValueError:
                return OfficialSiteFetchSkip(current_url, "invalid_page_url")

            page_origin = _origin_for_url(current_url)
            try:
                addresses = _validated_public_addresses(
                    self._resolver(page_origin.host, page_origin.port)
                )
            except ValueError as error:
                reason = (
                    "dns_non_public_address"
                    if "non-public" in str(error)
                    else "dns_resolution_failed"
                )
                return OfficialSiteFetchSkip(current_url, reason)
            except Exception:
                return OfficialSiteFetchSkip(current_url, "dns_resolution_failed")

            timeout = min(
                self._limits.request_timeout_seconds,
                max(0.1, deadline - self._clock()),
            )
            try:
                transport = self._transport_factory(
                    page_origin.host,
                    addresses[0],
                    page_origin.port,
                )
                request_timeout = httpx.Timeout(
                    timeout,
                    connect=min(self._limits.connect_timeout_seconds, timeout),
                )
                with httpx.Client(
                    transport=transport,
                    timeout=request_timeout,
                    follow_redirects=False,
                    trust_env=False,
                    headers={
                        "Accept": "text/html,application/xhtml+xml",
                        "User-Agent": "arcli-official-site-fetch/1.0",
                    },
                ) as client:
                    with client.stream("GET", current_url) as response:
                        status_code = response.status_code
                        if 300 <= status_code < 400:
                            location = response.headers.get("location")
                            if not location:
                                return OfficialSiteFetchSkip(current_url, "invalid_redirect", status_code)
                            if redirects >= self._limits.max_redirects_per_page:
                                return OfficialSiteFetchSkip(
                                    current_url,
                                    "redirect_limit_reached",
                                    status_code,
                                )
                            try:
                                redirect_url = _normalized_page_url(urljoin(current_url, location))
                            except ValueError:
                                return OfficialSiteFetchSkip(current_url, "invalid_redirect", status_code)
                            if _origin_for_url(redirect_url) != origin:
                                return OfficialSiteFetchSkip(
                                    redirect_url,
                                    "cross_origin_redirect",
                                    status_code,
                                )
                            if _is_disallowed_path(redirect_url):
                                return OfficialSiteFetchSkip(
                                    redirect_url,
                                    "disallowed_page_path",
                                    status_code,
                                )
                            if redirect_url in seen_redirects:
                                return OfficialSiteFetchSkip(
                                    redirect_url,
                                    "redirect_limit_reached",
                                    status_code,
                                )
                            seen_redirects.add(redirect_url)
                            redirects += 1
                            current_url = redirect_url
                            continue
                        if not 200 <= status_code < 300:
                            return OfficialSiteFetchSkip(current_url, "http_status_error", status_code)
                        content_type = _content_type(response)
                        if not _is_html_content_type(content_type):
                            return OfficialSiteFetchSkip(current_url, "non_html_content", status_code)
                        body, body_skip = _read_response_body(
                            response,
                            remaining_total_bytes=remaining_total_bytes,
                            limits=self._limits,
                        )
                        if body_skip is not None:
                            return OfficialSiteFetchSkip(current_url, body_skip, status_code)
                        assert body is not None
                        return current_url, status_code, content_type, body
            except httpx.TimeoutException:
                return OfficialSiteFetchSkip(current_url, "request_timeout")
            except httpx.RequestError:
                return OfficialSiteFetchSkip(current_url, "request_error")

    @staticmethod
    def _discover_same_origin_pages(
        *,
        base_url: str,
        raw_links: Sequence[str],
        seed_origin: _Origin,
        allowed_categories: Sequence[OfficialSitePageCategory],
        seen: set[str],
        remaining_slots: int,
    ) -> tuple[str, ...]:
        if remaining_slots <= 0:
            return ()
        discovered: list[str] = []
        for raw_link in raw_links:
            if len(discovered) >= remaining_slots:
                break
            try:
                candidate = _normalized_page_url(urljoin(base_url, raw_link))
            except ValueError:
                continue
            if candidate in seen or _origin_for_url(candidate) != seed_origin:
                continue
            if _is_disallowed_path(candidate):
                continue
            if _page_category(
                candidate,
                allowed_categories=allowed_categories,
                is_seed=False,
            ) is None:
                continue
            discovered.append(candidate)
            seen.add(candidate)
        return tuple(discovered)


def fetch_official_site_seed(
    plan: OfficialSiteSeedPlan,
    *,
    limits: OfficialSiteFetchLimits = DEFAULT_OFFICIAL_SITE_FETCH_LIMITS,
) -> OfficialSiteFetchResult:
    """Convenience entry point using the production-safe resolver/transport."""

    return OfficialSiteFetcher(limits=limits).fetch(plan)


__all__ = [
    "DEFAULT_OFFICIAL_SITE_FETCH_LIMITS",
    "MAX_DISCOVERED_PAGE_URLS",
    "MAX_FETCH_PAGES_PER_SEED",
    "MAX_REDIRECTS_PER_PAGE",
    "MAX_RESPONSE_BYTES",
    "MAX_TOTAL_BYTES",
    "OfficialSiteFetcher",
    "OfficialSiteFetchLimits",
    "OfficialSiteFetchOutcome",
    "OfficialSiteFetchResult",
    "OfficialSiteFetchSkip",
    "OfficialSiteFetchSkipReason",
    "OfficialSitePageDocument",
    "PinnedAddressBackend",
    "PinnedAddressTransport",
    "fetch_official_site_seed",
    "resolve_public_dns",
]
