from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from api import main
from api.services.social import buyer_language_research


TENANT_ID = "ff2a2bd0-7379-4a0e-a47e-3f430998d079"
PROFILE_ID = "6d50d075-9f07-4e8b-b38b-297c6e8bb381"
USER_ID = "43d50ac4-7554-4d0a-aeb3-bc1d8c1b52e1"


def _payload() -> main.BuyerLanguageResearchTriggerRequest:
    return main.BuyerLanguageResearchTriggerRequest(
        tenant_id=TENANT_ID,
        service_profile_id=PROFILE_ID,
        requested_by=USER_ID,
        source="dashboard",
    )


def test_buyer_language_research_trigger_requires_a_scoped_profile() -> None:
    with pytest.raises(ValidationError):
        main.BuyerLanguageResearchTriggerRequest(
            tenant_id=TENANT_ID,
            service_profile_id="not-a-uuid",
        )


def test_buyer_language_research_trigger_is_feature_flagged_before_enqueue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(
        buyer_language_research,
        "buyer_language_research_is_enabled",
        lambda: False,
    )
    monkeypatch.setattr(
        buyer_language_research,
        "enqueue_buyer_language_research_job",
        lambda *_: pytest.fail("disabled research must not enqueue"),
    )

    with pytest.raises(HTTPException) as raised:
        main.trigger_buyer_language_research(_payload(), None)

    assert raised.value.status_code == 404


def test_buyer_language_research_trigger_uses_scoped_queue_only(
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
        buyer_language_research,
        "buyer_language_research_is_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        buyer_language_research,
        "enqueue_buyer_language_research_job",
        lambda tenant_id, service_profile_id: enqueue_calls.append(
            (tenant_id, service_profile_id)
        )
        or "message-123",
    )

    response = main.trigger_buyer_language_research(_payload(), None)

    assert response.status == "queued"
    assert response.message_id == "message-123"
    assert scope_calls == [
        {"tenant_id": TENANT_ID, "service_profile_id": PROFILE_ID}
    ]
    assert enqueue_calls == [(TENANT_ID, PROFILE_ID)]


def test_buyer_language_research_trigger_does_not_claim_a_result_when_rate_limited(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(
        buyer_language_research,
        "buyer_language_research_is_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        buyer_language_research,
        "enqueue_buyer_language_research_job",
        lambda *_: None,
    )

    with pytest.raises(HTTPException) as raised:
        main.trigger_buyer_language_research(_payload(), None)

    assert raised.value.status_code == 429
