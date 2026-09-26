from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from api.services.prospecting.entity_first import ProspectEvidenceInput
from api.services.prospecting.evidence_collection import (
    ApprovedEvidenceTargetingProfileSnapshot,
    EvidenceCollectionRun,
    EvidenceCollectionTargetSnapshot,
    plan_evidence_collection,
)
from api.services.prospecting.evidence_persistence import (
    EvidencePersistenceClaimLostError,
    persist_retained_public_evidence,
)
from api.services.prospecting.retained_public_evidence import RetainedPublicAuthorLocator


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
ENTITY_ID = "50e98719-4e36-4d9f-8a76-5f4b9e32d9c2"
POST_ID = "4197c931-ecdd-4102-af3f-a36c1ad6bae1"
CLAIM_TOKEN = "0962fc8d-514a-4bd1-8408-974bb3182660"
NOW = datetime(2026, 9, 25, 10, tzinfo=timezone.utc)


class _Result:
    def __init__(self, value: Any) -> None:
        self.value = value

    def scalar_one_or_none(self) -> Any:
        return self.value


class _Connection:
    def __init__(self, values: list[Any]) -> None:
        self.values = values
        self.calls: list[tuple[str, dict[str, object]]] = []

    def execute(self, statement: Any, params: dict[str, object]) -> _Result:
        self.calls.append((str(statement), params))
        return _Result(self.values.pop(0))


def _scope():
    snapshot = ApprovedEvidenceTargetingProfileSnapshot(
        id=TARGETING_PROFILE_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        profile_version=4,
    )
    target = EvidenceCollectionTargetSnapshot(
        entity_id=ENTITY_ID,
        entity_kind="builder",
        origin_kind="manual",
        assessment_state="high_fit",
        canonical_url="https://github.com/indie-builder",
    )
    plan = plan_evidence_collection(snapshot, [target])
    assert plan is not None
    run = EvidenceCollectionRun(
        id=RUN_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        status="running",
        entity_limit=plan.planned_entity_count,
        evidence_limit_per_entity=max(item.plan.evidence_limit for item in plan.target_plans),
        plan_fingerprint=plan.input_fingerprint,
        attempt_count=1,
        claim_token=CLAIM_TOKEN,
    )
    return run, plan.target_plans[0], RetainedPublicAuthorLocator("github", "indie-builder")


def _evidence(**changes: object) -> ProspectEvidenceInput:
    values: dict[str, object] = {
        "targeting_profile_id": TARGETING_PROFILE_ID,
        "prospect_entity_id": ENTITY_ID,
        "research_run_id": RUN_ID,
        "evidence_type": "evaluation",
        "summary": "A retained public post contains direct tool-evaluation language.",
        "evidence_source_kind": "public_source",
        "source": "github",
        "source_post_id": POST_ID,
        "evidence_excerpt": "We are evaluating outbound automation tools.",
        "evidence_strength": "strong",
        "evidence_status": "pending",
        "observed_at": NOW,
    }
    values.update(changes)
    return ProspectEvidenceInput(**values)  # type: ignore[arg-type]


def test_persistence_rechecks_claim_selection_and_exact_author_provenance() -> None:
    run, target_plan, locator = _scope()
    connection = _Connection([RUN_ID, "evidence-id", RUN_ID])

    result = persist_retained_public_evidence(
        connection,  # type: ignore[arg-type]
        run=run,
        target_plan=target_plan,
        locator=locator,
        claim_token=CLAIM_TOKEN,
        evidence=_evidence(),
    )

    assert result.evidence_created is True
    assert len(connection.calls) == 3
    insert_sql, insert_params = connection.calls[1]
    assert "LOWER(source_post.author_handle) = :author_locator" in insert_sql
    assert "source_post.tenant_id IS NULL" in insert_sql
    assert "source_post.source_post_id IS NOT NULL" in insert_sql
    assert "position(:evidence_excerpt IN COALESCE(source_post.body, source_post.text, '')) > 0" in insert_sql
    assert "source_url" not in insert_sql
    assert insert_params["author_locator"] == "indie-builder"
    assert insert_params["source_post_id"] == POST_ID


def test_persistence_rejects_a_hand_constructed_public_url_before_it_reaches_sql() -> None:
    run, target_plan, locator = _scope()

    with pytest.raises(ValueError, match="source-post citation"):
        persist_retained_public_evidence(
            _Connection([]),  # type: ignore[arg-type]
            run=run,
            target_plan=target_plan,
            locator=locator,
            claim_token=CLAIM_TOKEN,
            evidence=_evidence(source_url="https://github.com/indie-builder/project/issues/1"),
        )


def test_persistence_stops_when_a_lease_or_profile_claim_is_lost() -> None:
    run, target_plan, locator = _scope()
    connection = _Connection([None])

    with pytest.raises(EvidencePersistenceClaimLostError, match="no longer active"):
        persist_retained_public_evidence(
            connection,  # type: ignore[arg-type]
            run=run,
            target_plan=target_plan,
            locator=locator,
            claim_token=CLAIM_TOKEN,
            evidence=_evidence(),
        )

    assert len(connection.calls) == 1
