from __future__ import annotations

import pytest

from api.services.prospecting.account_candidates import (
    AccountProviderCandidate,
    ContactProviderCandidate,
    ProviderDiscoveryRequest,
)
from api.services.prospecting.entity_candidates import (
    EntityCandidateProposal,
    LicensedProviderEntityResult,
    propose_licensed_provider_entities,
)
from api.services.prospecting.entity_first import TargetingProfileInput


REQUEST = ProviderDiscoveryRequest(
    tenant_id="tenant-1",
    service_profile_id="ce4e7939-7bba-49cf-a3cf-8edbd8142cb4",
    discovery_run_id="270db59f-86e6-43f7-97ce-e5c71b2a26ca",
    query_phrase="B2B software projects launching paid plans",
)


def test_authorized_provider_result_becomes_an_explainable_high_fit_account_only() -> None:
    profile = TargetingProfileInput(target_types=["account", "project"])
    result = LicensedProviderEntityResult(
        external_id="company-123",
        entity_kind="account",
        canonical_url="https://Acme.example/Products#pricing",
        title="Acme",
        fit_score=0.82,
        match_signals=["target_trait", "change_trigger"],
    )

    batch = propose_licensed_provider_entities(
        profile,
        REQUEST,
        provider="Licensed Provider",
        results=[result],
    )

    assert batch.skipped == ()
    proposal = batch.proposals[0]
    assert proposal.assessment_state == "high_fit"
    assert proposal.entity.entity_kind == "account"
    assert proposal.entity.origin_kind == "licensed_provider"
    assert proposal.entity.canonical_url == "https://acme.example/Products"
    assert proposal.provenance.tenant_id == "tenant-1"
    assert proposal.provenance.service_profile_id == REQUEST.service_profile_id
    assert proposal.provenance.provider == "licensed provider"
    assert proposal.provenance.provider_external_id == "company-123"
    assert len(proposal.provenance.query_fingerprint) == 64
    assert proposal.priority_score == 82
    assert proposal.reason_codes == (
        "licensed_provider_result",
        "target_type_account",
        "public_canonical_url",
        "target_trait",
        "change_trigger",
        "provider_fit",
    )
    assert "buyer intent" in proposal.explanation


def test_builder_has_only_a_public_locator_and_no_provider_display_name() -> None:
    profile = TargetingProfileInput(target_types=["builder"])
    result = LicensedProviderEntityResult(
        external_id="builder-profile-8",
        entity_kind="builder",
        canonical_url="https://indie.example/projects/one",
        title="A personal name is intentionally discarded",
    )

    batch = propose_licensed_provider_entities(
        profile,
        REQUEST,
        provider="licensed-provider",
        results=[result],
    )

    assert batch.proposals[0].entity.title is None
    assert result.title is None


def test_existing_account_results_bridge_but_contact_results_never_become_targets() -> None:
    profile = TargetingProfileInput(target_types=["account"])
    account = AccountProviderCandidate(
        external_id="account-7",
        company_name="Acme",
        website_url="https://acme.example",
        summary="This raw provider summary must not flow into the proposal.",
        reason="Nor should this free-form provider rationale.",
    )
    contact = ContactProviderCandidate(
        external_id="contact-7",
        company_name="Acme",
        role="VP Marketing",
        company_url="https://acme.example",
    )

    batch = propose_licensed_provider_entities(
        profile,
        REQUEST,
        provider="licensed-provider",
        results=[account, contact],
    )

    assert len(batch.proposals) == 1
    assert batch.proposals[0].entity.entity_external_id == "account-7"
    assert "raw provider summary" not in batch.proposals[0].explanation
    assert batch.skipped[0].reason_code == "contact_result_not_promoted"


def test_missing_or_unsafe_public_urls_are_skipped_without_a_proposal() -> None:
    profile = TargetingProfileInput(target_types=["account"])
    missing_url = AccountProviderCandidate(external_id="account-1", company_name="Acme")
    unsafe_url = AccountProviderCandidate(
        external_id="account-2",
        company_name="Internal Acme",
        website_url="http://127.0.0.1",
    )

    batch = propose_licensed_provider_entities(
        profile,
        REQUEST,
        provider="licensed-provider",
        results=[missing_url, unsafe_url],
    )

    assert batch.proposals == ()
    assert [item.reason_code for item in batch.skipped] == [
        "missing_public_url",
        "invalid_public_url",
    ]


def test_unapproved_target_types_are_not_proposed_and_direct_contact_data_is_rejected() -> None:
    profile = TargetingProfileInput(target_types=["project"])
    account = LicensedProviderEntityResult(
        external_id="account-1",
        entity_kind="account",
        canonical_url="https://acme.example",
    )

    batch = propose_licensed_provider_entities(
        profile,
        REQUEST,
        provider="licensed-provider",
        results=[account],
    )

    assert batch.proposals == ()
    assert batch.skipped[0].reason_code == "target_type_not_enabled"
    with pytest.raises(ValueError, match="email or phone"):
        LicensedProviderEntityResult(
            external_id="account-2",
            entity_kind="account",
            canonical_url="https://acme.example",
            title="email founder@example.com",
        )


def test_proposal_cannot_be_constructed_with_a_buyer_signal_state() -> None:
    result = LicensedProviderEntityResult(
        external_id="account-1",
        entity_kind="account",
        canonical_url="https://acme.example",
    )
    profile = TargetingProfileInput(target_types=["account"])
    proposal = propose_licensed_provider_entities(
        profile,
        REQUEST,
        provider="licensed-provider",
        results=[result],
    ).proposals[0]

    with pytest.raises(ValueError, match="high_fit"):
        EntityCandidateProposal(
            entity=proposal.entity,
            provenance=proposal.provenance,
            fit_score=proposal.fit_score,
            reason_codes=proposal.reason_codes,
            explanation=proposal.explanation,
            assessment_state="strong_buyer_signal",  # type: ignore[arg-type]
        )
