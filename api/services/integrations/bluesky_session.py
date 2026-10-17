"""Signed-in access for Bluesky post search.

Bluesky's AppView now answers anonymous ``searchPosts`` calls with HTTP 403,
first on paginated requests and increasingly on first pages too. Signing in
with an app password (never the account password) and searching through the
account's own server restores full results. Without credentials the connector
keeps its anonymous behaviour.

Bluesky rate-limits sign-ins per account, so a session is created once per
worker process and reused until shortly before its access token expires.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BLUESKY_ENTRYWAY_URL = "https://bsky.social"

# Access tokens last about two hours; renew comfortably before that.
_SESSION_MAX_AGE_SECONDS = 90 * 60
# A wrong password or a sign-in rate limit must not turn every search into
# another failing sign-in attempt.
_FAILURE_COOLDOWN_SECONDS = 10 * 60


@dataclass(frozen=True)
class BlueskySession:
    access_jwt: str
    service_url: str
    created_at: float

    @property
    def search_url(self) -> str:
        return f"{self.service_url}/xrpc/app.bsky.feed.searchPosts"

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_jwt}"}


_lock = threading.Lock()
_cached_session: BlueskySession | None = None
_sign_in_blocked_until = 0.0


def _credentials() -> tuple[str, str] | None:
    handle = os.getenv("ARCLI_BLUESKY_HANDLE", "").strip()
    app_password = os.getenv("ARCLI_BLUESKY_APP_PASSWORD", "").strip()
    return (handle, app_password) if handle and app_password else None


def _entryway_url() -> str:
    return (os.getenv("ARCLI_BLUESKY_SERVICE_URL") or BLUESKY_ENTRYWAY_URL).strip().rstrip("/")


def _personal_data_server(did_doc: Any) -> str | None:
    """Return the account's own server, which proxies AppView reads."""

    services = did_doc.get("service") if isinstance(did_doc, dict) else None
    for service in services if isinstance(services, list) else []:
        if (
            isinstance(service, dict)
            and str(service.get("id", "")).endswith("#atproto_pds")
            and isinstance(service.get("serviceEndpoint"), str)
        ):
            return service["serviceEndpoint"].rstrip("/")
    return None


async def bluesky_session(
    client: httpx.AsyncClient,
    *,
    replace: BlueskySession | None = None,
) -> BlueskySession | None:
    """Return a reusable signed-in session, or ``None`` to search anonymously.

    Pass ``replace`` with a session the server rejected to force a new sign-in.
    """

    global _cached_session, _sign_in_blocked_until

    credentials = _credentials()
    if credentials is None:
        return None

    now = time.monotonic()
    with _lock:
        cached = _cached_session
        if (
            cached is not None
            and cached != replace
            and now - cached.created_at < _SESSION_MAX_AGE_SECONDS
        ):
            return cached
        if now < _sign_in_blocked_until:
            return None

    handle, app_password = credentials
    try:
        response = await client.post(
            f"{_entryway_url()}/xrpc/com.atproto.server.createSession",
            json={"identifier": handle, "password": app_password},
        )
        response.raise_for_status()
        payload = response.json()
        access_jwt = payload["accessJwt"]
        if not isinstance(access_jwt, str) or not access_jwt:
            raise ValueError("Bluesky returned no access token")
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        with _lock:
            _sign_in_blocked_until = now + _FAILURE_COOLDOWN_SECONDS
        status = getattr(getattr(exc, "response", None), "status_code", None)
        # Never log the handle's password or the response body.
        logger.warning(
            "bluesky_sign_in_failed error_type=%s status=%s retry_after_seconds=%s",
            exc.__class__.__name__,
            status,
            _FAILURE_COOLDOWN_SECONDS,
        )
        return None

    session = BlueskySession(
        access_jwt=access_jwt,
        service_url=_personal_data_server(payload.get("didDoc")) or _entryway_url(),
        created_at=now,
    )
    with _lock:
        _cached_session = session
    logger.info("bluesky_signed_in")
    return session


def is_rejected_session(exc: httpx.HTTPStatusError) -> bool:
    """Whether a search failed because the access token expired or was revoked."""

    status = exc.response.status_code
    if status == 401:
        return True
    if status != 400:
        return False
    try:
        error = exc.response.json().get("error")
    except ValueError:
        return False
    return error in {"ExpiredToken", "InvalidToken"}


def reset_bluesky_session_for_tests() -> None:
    global _cached_session, _sign_in_blocked_until
    with _lock:
        _cached_session = None
        _sign_in_blocked_until = 0.0
