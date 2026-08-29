from __future__ import annotations

from unittest.mock import patch

from api.services.prospecting.account_candidates import (
    AccountProviderCandidate,
    ContactProviderCandidate,
    ProviderDiscoveryRequest,
    record_provider_account_candidates,
    record_provider_contact_candidates,
)
from api.services.social.candidate_pool import CandidateWriteResult


REQUEST = ProviderDiscoveryRequest(
    tenant_id="tenant-1",
    service_profile_id="ce4e7939-7bba-49cf-a3cf-8edbd8142cb4",
    discovery_run_id="270db59f-86e6-43f7-97ce-e5c71b2a26ca",
    query_phrase="sales teams need more paying customers",
)
WRITE = CandidateWriteResult(
    candidate_id="3d8173cc-5ddd-426b-8d85-151a78f17798",
    observation_id="a8d00f19-70f9-47d2-bb48-dc46fdcadad6",
    dedupe_key="f" * 64,
    candidate_created=True,
    observation_created=True,
)


def test_provider_intake_is_off_until_a_licensed_provider_is_explicitly_enabled(
    monkeypatch,
) -> None:
    monkeypatch.delenv("ARCLI_ACCOUNT_CANDIDATE_INGESTION_ENABLED", raising=False)

    with patch(
        "api.services.prospecting.account_candidates.record_candidate"
    ) as record:
        writes = record_provider_account_candidates(
            REQUEST,
            provider="licensed-provider",
            candidates=[AccountProviderCandidate("account-1", "Acme")],
        )

    assert writes == []
    record.assert_not_called()


def test_account_provider_intake_persists_company_context_without_contact_fields(
    monkeypatch,
) -> None:
    monkeypatch.setenv("ARCLI_ACCOUNT_CANDIDATE_INGESTION_ENABLED", "true")
    candidate = AccountProviderCandidate(
        external_id="account-1",
        company_name="Acme",
        website_url="https://acme.example",
        summary="B2B software company exploring a new revenue workflow.",
        fit_score=0.82,
        reason="Matches company size and buying trigger.",
    )

    with patch(
        "api.services.prospecting.account_candidates.record_candidate",
        return_value=WRITE,
    ) as record:
        writes = record_provider_account_candidates(
            REQUEST,
            provider="licensed-provider",
            candidates=[candidate],
        )

    assert writes == [WRITE]
    kwargs = record.call_args.kwargs
    assert kwargs["identity"].candidate_kind == "account"
    assert kwargs["identity"].entity_external_id == "account-1"
    assert kwargs["source_snapshot"] == {
        "source": "licensed-provider",
        "title": "Acme",
        "text": "B2B software company exploring a new revenue workflow.",
        "url": "https://acme.example",
    }


def test_contact_provider_intake_retains_role_and_company_but_no_personal_identity(
    monkeypatch,
) -> None:
    monkeypatch.setenv("ARCLI_ACCOUNT_CANDIDATE_INGESTION_ENABLED", "true")
    candidate = ContactProviderCandidate(
        external_id="contact-1",
        company_name="Acme",
        role="VP Marketing",
        company_url="https://acme.example",
        summary="Relevant commercial role.",
        fit_score=0.7,
    )

    with patch(
        "api.services.prospecting.account_candidates.record_candidate",
        return_value=WRITE,
    ) as record:
        writes = record_provider_contact_candidates(
            REQUEST,
            provider="licensed-provider",
            candidates=[candidate],
        )

    assert writes == [WRITE]
    kwargs = record.call_args.kwargs
    assert kwargs["identity"].candidate_kind == "contact"
    assert kwargs["source_snapshot"]["title"] == "VP Marketing at Acme"
    assert "email" not in kwargs["source_snapshot"]
    assert "phone" not in kwargs["source_snapshot"]
