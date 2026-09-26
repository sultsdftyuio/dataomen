from __future__ import annotations

from dataclasses import replace
from typing import Any

import pytest

from api.services.prospecting import candidate_persistence
from api.services.prospecting.candidate_generation import CandidateGenerationRun
from api.services.prospecting.candidate_persistence import (
    CandidatePersistenceClaimLostError,
    persist_phase2_candidate,
)
from api.services.prospecting.entity_candidates import (
    EntityCandidateProposal,
    LicensedProviderProvenance,
)
from api.services.prospecting.entity_first import ProspectEntityInput
from api.services.prospecting.official_site_classifier import (
    OfficialSiteFetchedPage,
    classify_official_site_page,
)
from api.services.prospecting.official_site_generation import (
    OfficialSiteGenerationLimits,
    OfficialSiteGenerationRequest,
    plan_official_site_generation,
)


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
CLAIM_TOKEN = "0962fc8d-514a-4bd1-8408-974bb3182660"
ENTITY_ID = "50e98719-4e36-4d9f-8a76-5f4b9e32d9c2"
ASSESSMENT_ID = "4197c931-ecdd-4102-af3f-a36c1ad6bae1"
EVIDENCE_ID = "b8f98dd0-ae08-4bf9-b776-39c63a4e2f82"
PLAN_FINGERPRINT = "a" * 64


class _Result:
    def __init__(self, *, mapping: dict[str, Any] | None = None, scalar: Any = None) -> None:
        self.mapping = mapping
        self.scalar = scalar

    def mappings(self) -> _Result:
        return self

    def one_or_none(self) -> dict[str, Any] | None:
        return self.mapping

    def scalar_one_or_none(self) -> Any:
        return self.scalar


class _Connection:
    def __init__(self, results: list[_Result]) -> None:
        self.results = results
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def execute(self, statement: Any, params: dict[str, Any]) -> _Result:
        self.calls.append((str(statement), params))
        return self.results.pop(0)


def _run() -> CandidateGenerationRun:
    return CandidateGenerationRun(
        id=RUN_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        status="running",
        candidate_limit=8,
        plan_fingerprint=PLAN_FINGERPRINT,
        attempt_count=1,
        claim_token=CLAIM_TOKEN,
    )


def _active_profile_row(**overrides: Any) -> dict[str, Any]:
    """Return the locked brief projection used by candidate persistence."""

    row: dict[str, Any] = {
        "target_types": ["account"],
        "ideal_customer_traits": [],
        "change_triggers": [],
        "strong_evidence_definitions": [],
        "exclusions": [],
        "seed_urls": ["https://acme.example/about"],
    }
    row.update(overrides)
    return row


def _provider_proposal(*, tenant_id: str = TENANT_ID) -> EntityCandidateProposal:
    return EntityCandidateProposal(
        entity=ProspectEntityInput(
            entity_kind="account",
            entity_provider="licensed_vendor",
            entity_external_id="account-42",
            canonical_url="https://acme.example/",
            origin_kind="licensed_provider",
            title="Acme",
        ),
        provenance=LicensedProviderProvenance(
            tenant_id=tenant_id,
            service_profile_id=SERVICE_PROFILE_ID,
            provider="licensed_vendor",
            provider_external_id="account-42",
            discovery_run_id="provider-discovery-42",
            query_type="firmographic",
            query_fingerprint="b" * 64,
        ),
        fit_score=0.72,
        reason_codes=("licensed_provider_result", "target_type_account", "provider_fit"),
        explanation="Provider-private phrase that must never reach persistence.",
    )


def _official_run_plan():
    return plan_official_site_generation(
        OfficialSiteGenerationRequest(
            tenant_id=TENANT_ID,
            service_profile_id=SERVICE_PROFILE_ID,
            targeting_profile_id=TARGETING_PROFILE_ID,
            profile_version="4",
            target_types=["account"],
            seed_urls=["https://acme.example/about"],
            explicit_request=True,
        ),
        limits=OfficialSiteGenerationLimits(
            seed_limit=1,
            page_limit_per_seed=1,
            candidate_limit_per_seed=1,
            candidate_limit_total=1,
        ),
    )


def _official_plan():
    return _official_run_plan().seed_plans[0]


def _official_proposal():
    plan = _official_plan()
    return classify_official_site_page(
        plan,
        OfficialSiteFetchedPage(
            "https://acme.example/about",
            json_ld=[
                {
                    "@type": "Organization",
                    "url": "https://acme.example/",
                    "name": "Acme",
                }
            ],
        ),
    ).proposals[0]


def test_provider_candidate_writes_an_entity_and_high_fit_assessment_without_evidence() -> None:
    connection = _Connection(
        [
            _Result(mapping=_active_profile_row()),
            _Result(mapping={"id": ENTITY_ID, "entity_created": True}),
            _Result(scalar=ASSESSMENT_ID),
            _Result(mapping=_active_profile_row()),
        ]
    )

    result = persist_phase2_candidate(
        connection,  # type: ignore[arg-type]
        run=_run(),
        claim_token=CLAIM_TOKEN,
        proposal=_provider_proposal(),
    )

    assert result.entity_id == ENTITY_ID
    assert result.entity_created is True
    assert result.assessment_created is True
    assert result.fit_evidence_created is False
    assert result.origin == "licensed_provider"

    statements = "\n".join(statement for statement, _ in connection.calls)
    params = repr([params for _, params in connection.calls])
    assert "prospect_evidence" not in statements
    assert "ON CONFLICT (tenant_id, entity_kind, entity_provider, entity_external_id)" in statements
    assert "canonical_url =" not in statements
    assert "Provider-private phrase" not in params
    assert "provider-discovery-42" not in params
    assert all(params["tenant_id"] == TENANT_ID for _, params in connection.calls)
    assert all(params["claim_token"] == CLAIM_TOKEN for _, params in connection.calls)
    assessment_params = connection.calls[2][1]
    assert assessment_params["fit_score"] == 0.72
    assert assessment_params["trigger_score"] == 0.0
    assert assessment_params["priority_score"] == 61.2


def test_official_candidate_creates_only_pending_weak_fit_evidence_with_a_citation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection(
        [
            _Result(mapping=_active_profile_row()),
            _Result(mapping={"id": ENTITY_ID, "entity_created": True}),
            _Result(scalar=ASSESSMENT_ID),
            _Result(scalar=EVIDENCE_ID),
            _Result(mapping=_active_profile_row()),
        ]
    )

    monkeypatch.setattr(
        candidate_persistence,
        "current_candidate_generation_plan_for_claim",
        lambda _conn, _run: _official_run_plan(),
    )
    result = persist_phase2_candidate(
        connection,  # type: ignore[arg-type]
        run=_run(),
        claim_token=CLAIM_TOKEN,
        proposal=_official_proposal(),
    )

    assert result.assessment_created is True
    assert result.fit_evidence_created is True
    evidence_sql, evidence_params = connection.calls[3]
    assert "'fit'" in evidence_sql
    assert "'official_site'" in evidence_sql
    assert "'pending'" in evidence_sql
    assert "'evaluation'" not in evidence_sql
    assert "'trigger'" not in evidence_sql
    assert evidence_params["source_url"] == "https://acme.example/about"
    assert evidence_params["summary"] == "Official-site structured metadata identifies the target type as account."
    assert "Acme" not in repr(evidence_params)
    assessment_params = connection.calls[2][1]
    assert assessment_params["fit_score"] == 0.5
    assert assessment_params["priority_score"] == 42.5


def test_existing_assessment_is_not_enriched_by_an_official_site_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection(
        [
            _Result(mapping=_active_profile_row()),
            _Result(mapping={"id": ENTITY_ID, "entity_created": False}),
            _Result(scalar=None),
            _Result(mapping=_active_profile_row()),
        ]
    )

    monkeypatch.setattr(
        candidate_persistence,
        "current_candidate_generation_plan_for_claim",
        lambda _conn, _run: _official_run_plan(),
    )
    result = persist_phase2_candidate(
        connection,  # type: ignore[arg-type]
        run=_run(),
        claim_token=CLAIM_TOKEN,
        proposal=_official_proposal(),
    )

    assert result.assessment_created is False
    assert result.fit_evidence_created is False
    assert "prospect_evidence" not in "\n".join(statement for statement, _ in connection.calls)


def test_official_candidate_cannot_substitute_an_unplanned_seed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection([_Result(mapping=_active_profile_row())])
    proposal = _official_proposal()
    proposal = replace(
        proposal,
        provenance=replace(proposal.provenance, seed_fingerprint="f" * 64),
    )
    monkeypatch.setattr(
        candidate_persistence,
        "current_candidate_generation_plan_for_claim",
        lambda _conn, _run: _official_run_plan(),
    )

    with pytest.raises(ValueError, match="not part of this generation run"):
        persist_phase2_candidate(
            connection,  # type: ignore[arg-type]
            run=_run(),
            claim_token=CLAIM_TOKEN,
            proposal=proposal,
        )

    assert len(connection.calls) == 1


def test_generated_candidate_matching_a_brief_exclusion_is_not_persisted() -> None:
    connection = _Connection([
        _Result(mapping=_active_profile_row(exclusions=["acme"])),
    ])

    with pytest.raises(candidate_persistence.CandidateExcludedByTargetingBrief):
        persist_phase2_candidate(
            connection,  # type: ignore[arg-type]
            run=_run(),
            claim_token=CLAIM_TOKEN,
            proposal=_provider_proposal(),
        )

    assert len(connection.calls) == 1
    assert "FOR UPDATE OF run, profile" in connection.calls[0][0]


def test_provider_provenance_must_stay_with_the_claimed_tenant() -> None:
    connection = _Connection([])
    proposal = _provider_proposal(tenant_id="other-tenant")

    with pytest.raises(ValueError, match="tenant"):
        persist_phase2_candidate(
            connection,  # type: ignore[arg-type]
            run=_run(),
            claim_token=CLAIM_TOKEN,
            proposal=proposal,
        )

    assert connection.calls == []


def test_lost_claim_prevents_any_candidate_write() -> None:
    connection = _Connection([_Result(scalar=None)])

    with pytest.raises(CandidatePersistenceClaimLostError, match="no longer active"):
        persist_phase2_candidate(
            connection,  # type: ignore[arg-type]
            run=_run(),
            claim_token=CLAIM_TOKEN,
            proposal=_provider_proposal(),
        )

    assert len(connection.calls) == 1
    assert "FOR UPDATE OF run, profile" in connection.calls[0][0]
