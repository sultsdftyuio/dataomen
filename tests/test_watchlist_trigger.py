"""Watchlist trigger authorization and queue handoff coverage."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from api import main
from api.services import watchlist_matching


TENANT_ID = "ff2a2bd0-7379-4a0e-a47e-3f430998d079"
PROFILE_ID = "6d50d075-9f07-4e8b-b38b-297c6e8bb381"
WATCHLIST_ID = "61f4b11b-c4e1-4274-b047-dfcf1c1d922d"


def _payload() -> main.WatchlistDiscoveryTriggerRequest:
    return main.WatchlistDiscoveryTriggerRequest(
        tenant_id=TENANT_ID,
        service_profile_id=PROFILE_ID,
        watchlist_id=WATCHLIST_ID,
        requested_by="43d50ac4-7554-4d0a-aeb3-bc1d8c1b52e1",
        source="dashboard_watchlist",
    )


def test_watchlist_trigger_requires_uuid_scopes() -> None:
    with pytest.raises(ValidationError):
        main.WatchlistDiscoveryTriggerRequest(
            tenant_id=TENANT_ID,
            service_profile_id=PROFILE_ID,
            watchlist_id="not-a-uuid",
        )


def test_watchlist_trigger_validates_profile_and_watchlist_tenant_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scope_calls: list[dict[str, str]] = []
    enqueue_calls: list[tuple[str, str]] = []
    monkeypatch.setattr(
        main,
        "_validate_internal_tenant_scope",
        lambda **kwargs: scope_calls.append(kwargs),
    )
    monkeypatch.setattr(
        watchlist_matching,
        "enqueue_watchlist_discovery_job",
        lambda tenant_id, watchlist_id: enqueue_calls.append((tenant_id, watchlist_id))
        or "watchlist-message-1",
    )

    response = main.trigger_watchlist_discovery(_payload(), None)

    assert response.status == "queued"
    assert response.message_id == "watchlist-message-1"
    assert scope_calls == [
        {
            "tenant_id": TENANT_ID,
            "service_profile_id": PROFILE_ID,
            "watchlist_id": WATCHLIST_ID,
        }
    ]
    assert enqueue_calls == [(TENANT_ID, WATCHLIST_ID)]


def test_watchlist_trigger_is_idempotent_while_a_scan_is_queued(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(
        watchlist_matching,
        "enqueue_watchlist_discovery_job",
        lambda *_: (_ for _ in ()).throw(
            watchlist_matching.WatchlistAlreadyQueuedError("queued")
        ),
    )

    response = main.trigger_watchlist_discovery(_payload(), None)

    assert response.status == "queued"
    assert response.message_id == "already-queued"


def test_watchlist_trigger_reports_tenant_rate_limits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(
        watchlist_matching,
        "enqueue_watchlist_discovery_job",
        lambda *_: (_ for _ in ()).throw(
            watchlist_matching.WatchlistRateLimitError("limit")
        ),
    )

    with pytest.raises(HTTPException) as raised:
        main.trigger_watchlist_discovery(_payload(), None)

    assert raised.value.status_code == 429
