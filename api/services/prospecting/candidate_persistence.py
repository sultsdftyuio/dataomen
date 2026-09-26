"""Tenant-safe persistence for already-classified Phase 2 target proposals.

This boundary accepts only proposal objects produced by the official-site
classifier or a licensed-provider adapter.  It deliberately cannot accept a
raw page, provider payload, contact, free-form explanation, or evidence
claim.  A caller must hold a live candidate-generation claim token and use a
single database transaction for each proposal.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Mapping, TypeAlias
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection

from .candidate_generation import (
    CandidateGenerationRun,
    current_candidate_generation_plan_for_claim,
)
from .entity_candidates import EntityCandidateProposal
from .entity_first import (
    ProspectEntityInput,
    ProspectEvidenceInput,
    TargetingProfileInput,
    normalize_public_url,
)
from .official_site_classifier import OfficialSiteCandidateProposal
from .target_fit import TargetFitCandidate, assess_target_fit


Phase2CandidateProposal: TypeAlias = EntityCandidateProposal | OfficialSiteCandidateProposal
ProposalOrigin: TypeAlias = Literal["licensed_provider", "official_site"]

MAX_REASON_CODES = 16
_SAFE_REASON_CODE = re.compile(r"^[a-z0-9_:-]{1,80}$")


class CandidatePersistenceClaimLostError(RuntimeError):
    """The profile changed, lease expired, or another worker owns the run."""


class CandidateExcludedByTargetingBrief(ValueError):
    """A generated candidate matches an approved explicit exclusion."""


@dataclass(frozen=True)
class CandidatePersistenceResult:
    """Small, content-free write outcome suitable for a run summary."""

    entity_id: str
    entity_created: bool
    assessment_created: bool
    fit_evidence_created: bool
    origin: ProposalOrigin


def _same_origin(left: str, right: str) -> bool:
    left_parts = urlsplit(left)
    right_parts = urlsplit(right)
    return (
        left_parts.scheme.casefold(),
        (left_parts.hostname or "").casefold(),
        left_parts.port,
    ) == (
        right_parts.scheme.casefold(),
        (right_parts.hostname or "").casefold(),
        right_parts.port,
    )


def _reason_codes(values: tuple[str, ...]) -> tuple[str, ...]:
    if len(values) > MAX_REASON_CODES:
        raise ValueError(f"reason_codes exceeds {MAX_REASON_CODES} items")
    normalized: list[str] = []
    for value in values:
        if not isinstance(value, str):
            raise ValueError("reason_codes must contain strings")
        code = value.strip().casefold()
        if not _SAFE_REASON_CODE.fullmatch(code):
            raise ValueError("reason_codes contains an invalid code")
        if code not in normalized:
            normalized.append(code)
    if not normalized:
        raise ValueError("reason_codes must not be empty")
    return tuple(normalized)


def _proposal_origin(proposal: Phase2CandidateProposal) -> ProposalOrigin:
    if isinstance(proposal, EntityCandidateProposal):
        if proposal.assessment_state != "high_fit":
            raise ValueError("provider proposal must be high_fit")
        if proposal.entity.origin_kind != "licensed_provider":
            raise ValueError("provider proposal must use licensed_provider origin")
        return "licensed_provider"
    if isinstance(proposal, OfficialSiteCandidateProposal):
        if proposal.assessment_state != "high_fit":
            raise ValueError("official-site proposal must be high_fit")
        if proposal.entity.origin_kind != "official_site":
            raise ValueError("official-site proposal must use official_site origin")
        return "official_site"
    raise ValueError("proposal must be a Phase 2 candidate proposal")


def _validate_proposal_scope(
    run: CandidateGenerationRun,
    proposal: Phase2CandidateProposal,
    *,
    origin: ProposalOrigin,
) -> None:
    if origin == "licensed_provider":
        assert isinstance(proposal, EntityCandidateProposal)
        if proposal.provenance.tenant_id != run.tenant_id:
            raise ValueError("provider proposal tenant does not match the generation run")
        if proposal.provenance.service_profile_id != run.service_profile_id:
            raise ValueError("provider proposal service profile does not match the generation run")
        return

    assert isinstance(proposal, OfficialSiteCandidateProposal)
    # The classifier has already enforced a planned, same-origin seed scope.
    # Recheck the public source URL here so a hand-constructed proposal cannot
    # turn a persistence path into a URL-validation bypass.
    source_url = normalize_public_url(proposal.provenance.page_url)
    if not _same_origin(source_url, proposal.entity.canonical_url):
        raise ValueError("official-site proposal source and entity must share an origin")
    if not re.fullmatch(r"[0-9a-f]{64}", proposal.provenance.seed_fingerprint):
        raise ValueError("official-site proposal requires a seed fingerprint")


def _validate_official_site_plan(
    conn: Connection,
    *,
    run: CandidateGenerationRun,
    proposal: OfficialSiteCandidateProposal,
) -> None:
    """Prove that the source came from this run's still-current seed plan.

    A same-origin URL alone is not enough: a hand-constructed proposal could
    otherwise turn any public page into a target. Rebuilding the opaque plan
    under the profile lock binds the provenance fingerprint to one of the
    explicit seed scopes without retaining those seed URLs on the run row.
    """

    current_plan = current_candidate_generation_plan_for_claim(conn, run)
    if current_plan is None:
        raise CandidatePersistenceClaimLostError(
            "candidate-generation profile revision is no longer current"
        )
    matching_seed = next(
        (
            seed_plan
            for seed_plan in current_plan.seed_plans
            if seed_plan.is_planned
            and seed_plan.seed_fingerprint == proposal.provenance.seed_fingerprint
        ),
        None,
    )
    if matching_seed is None:
        raise ValueError("official-site proposal seed is not part of this generation run")
    if not _same_origin(proposal.provenance.page_url, matching_seed.origin_url):
        raise ValueError("official-site proposal page is outside its planned seed origin")


def _active_claim_params(
    run: CandidateGenerationRun,
    *,
    claim_token: str,
    entity_kind: str,
) -> dict[str, str]:
    try:
        normalized_token = str(UUID(claim_token))
    except (AttributeError, TypeError, ValueError) as error:
        raise CandidatePersistenceClaimLostError("candidate-generation claim token is invalid") from error
    if run.claim_token is None or run.claim_token != normalized_token:
        raise CandidatePersistenceClaimLostError("candidate-generation claim token does not match run")
    return {
        "tenant_id": run.tenant_id,
        "run_id": run.id,
        "claim_token": normalized_token,
        "entity_kind": entity_kind,
    }


_ACTIVE_CLAIM_SQL = """
    SELECT run.id,
           profile.target_types,
           profile.ideal_customer_traits,
           profile.change_triggers,
           profile.strong_evidence_definitions,
           profile.exclusions,
           profile.seed_urls
      FROM public.prospect_research_runs AS run
      INNER JOIN public.targeting_profiles AS profile
              ON profile.id = run.targeting_profile_id
             AND profile.tenant_id = run.tenant_id
     WHERE run.id = CAST(:run_id AS uuid)
       AND run.tenant_id = :tenant_id
       AND run.run_kind = 'candidate_generation'
       AND run.status = 'running'
       AND run.claim_token = CAST(:claim_token AS uuid)
       AND run.lease_expires_at >= clock_timestamp()
       AND profile.service_profile_id = run.service_profile_id
       AND profile.approval_status = 'approved'
       AND profile.profile_version = run.targeting_profile_version
       AND profile.target_types @> jsonb_build_array(CAST(:entity_kind AS text))
"""


def _profile_list(row: Mapping[str, Any], *, field_name: str) -> list[Any]:
    value = row.get(field_name)
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError(f"targeting profile {field_name} must be a JSON array") from error
    if not isinstance(value, (list, tuple)):
        raise ValueError(f"targeting profile {field_name} must be an array")
    return list(value)


def _targeting_profile_from_claim_row(row: Mapping[str, Any]) -> TargetingProfileInput:
    """Rehydrate all brief fields under the same lock as the candidate write."""

    try:
        return TargetingProfileInput(
            target_types=_profile_list(row, field_name="target_types"),
            ideal_customer_traits=_profile_list(row, field_name="ideal_customer_traits"),
            change_triggers=_profile_list(row, field_name="change_triggers"),
            strong_evidence_definitions=_profile_list(
                row,
                field_name="strong_evidence_definitions",
            ),
            exclusions=_profile_list(row, field_name="exclusions"),
            seed_urls=_profile_list(row, field_name="seed_urls"),
        )
    except ValueError as error:
        raise CandidatePersistenceClaimLostError(
            "approved targeting profile contains invalid candidate-fit policy"
        ) from error


def _assert_active_claim(
    conn: Connection,
    *,
    run: CandidateGenerationRun,
    claim_token: str,
    entity_kind: str,
    lock: bool,
) -> TargetingProfileInput:
    query = _ACTIVE_CLAIM_SQL
    if lock:
        # Holding both locks for this short entity/assessment transaction means
        # a brief revision cannot land halfway through a candidate write.
        query += " FOR UPDATE OF run, profile"
    row = conn.execute(
        text(query),
        _active_claim_params(run, claim_token=claim_token, entity_kind=entity_kind),
    ).mappings().one_or_none()
    if not row:
        raise CandidatePersistenceClaimLostError("candidate-generation claim is no longer active")
    return _targeting_profile_from_claim_row(row)


def _upsert_entity(
    conn: Connection,
    *,
    run: CandidateGenerationRun,
    claim_token: str,
    entity: ProspectEntityInput,
) -> tuple[str, bool]:
    params = _active_claim_params(
        run,
        claim_token=claim_token,
        entity_kind=entity.entity_kind,
    )
    params.update(
        {
            "entity_provider": entity.entity_provider,
            "entity_external_id": entity.entity_external_id,
            "canonical_url": entity.canonical_url,
            "title": entity.title,
            "origin_kind": entity.origin_kind,
            "origin_source_post_id": entity.origin_source_post_id,
        }
    )
    row = conn.execute(
        text(
            f"""
            WITH active_claim AS ({_ACTIVE_CLAIM_SQL})
            INSERT INTO public.prospect_entities (
                tenant_id,
                entity_kind,
                entity_provider,
                entity_external_id,
                canonical_url,
                title,
                origin_kind,
                origin_source_post_id
            )
            SELECT :tenant_id,
                :entity_kind,
                :entity_provider,
                :entity_external_id,
                :canonical_url,
                :title,
                :origin_kind,
                CAST(:origin_source_post_id AS uuid)
              FROM active_claim
            ON CONFLICT (tenant_id, entity_kind, entity_provider, entity_external_id)
            DO UPDATE SET
                title = CASE
                    WHEN public.prospect_entities.entity_kind = 'builder' THEN NULL
                    ELSE COALESCE(EXCLUDED.title, public.prospect_entities.title)
                END,
                last_seen_at = NOW()
            RETURNING id, (xmax = 0) AS entity_created
            """
        ),
        params,
    ).mappings().one_or_none()
    if not row:
        raise CandidatePersistenceClaimLostError("candidate-generation claim expired before entity write")
    return str(row["id"]), bool(row["entity_created"])


def _insert_high_fit_assessment(
    conn: Connection,
    *,
    run: CandidateGenerationRun,
    claim_token: str,
    entity_id: str,
    entity_kind: str,
    fit_score: float,
    trigger_score: float,
    priority_score: float,
    reason_codes: tuple[str, ...],
) -> bool:
    params = _active_claim_params(run, claim_token=claim_token, entity_kind=entity_kind)
    params.update(
        {
            "entity_id": entity_id,
            "fit_score": fit_score,
            "trigger_score": trigger_score,
            "priority_score": priority_score,
            "reason_codes": json.dumps(list(reason_codes), separators=(",", ":")),
        }
    )
    row = conn.execute(
        text(
            f"""
            WITH active_claim AS ({_ACTIVE_CLAIM_SQL})
            INSERT INTO public.prospect_assessments (
                tenant_id,
                targeting_profile_id,
                prospect_entity_id,
                assessment_state,
                fit_score,
                trigger_score,
                priority_score,
                reason_codes
            )
            SELECT :tenant_id,
                   run.targeting_profile_id,
                   CAST(:entity_id AS uuid),
                   'high_fit',
                   :fit_score,
                   :trigger_score,
                   :priority_score,
                   CAST(:reason_codes AS jsonb)
              FROM public.prospect_research_runs AS run
              INNER JOIN active_claim ON active_claim.id = run.id
             WHERE run.id = CAST(:run_id AS uuid)
               AND run.tenant_id = :tenant_id
            ON CONFLICT (tenant_id, targeting_profile_id, prospect_entity_id)
            DO NOTHING
            RETURNING id
            """
        ),
        params,
    ).scalar_one_or_none()
    return bool(row)


def _official_fit_evidence(
    *,
    run: CandidateGenerationRun,
    entity_id: str,
    proposal: OfficialSiteCandidateProposal,
) -> ProspectEvidenceInput:
    return ProspectEvidenceInput(
        targeting_profile_id=run.targeting_profile_id,
        prospect_entity_id=entity_id,
        research_run_id=run.id,
        evidence_type="fit",
        summary="Official-site structured metadata identifies the target type as "
        f"{proposal.entity.entity_kind}.",
        evidence_source_kind="official_site",
        source="official_site",
        source_url=proposal.provenance.page_url,
        observed_at=datetime.now(timezone.utc),
        evidence_strength="weak",
        evidence_status="pending",
    )


def _insert_official_fit_evidence(
    conn: Connection,
    *,
    run: CandidateGenerationRun,
    claim_token: str,
    entity_kind: str,
    evidence: ProspectEvidenceInput,
) -> bool:
    params = _active_claim_params(run, claim_token=claim_token, entity_kind=entity_kind)
    params.update(
        {
            "targeting_profile_id": evidence.targeting_profile_id,
            "prospect_entity_id": evidence.prospect_entity_id,
            "research_run_id": evidence.research_run_id,
            "summary": evidence.summary,
            "source": evidence.source,
            "source_url": evidence.source_url,
            "evidence_strength": evidence.evidence_strength,
            "observed_at": evidence.observed_at.isoformat(),
            "evidence_key": evidence.evidence_key,
        }
    )
    row = conn.execute(
        text(
            f"""
            WITH active_claim AS ({_ACTIVE_CLAIM_SQL})
            INSERT INTO public.prospect_evidence (
                tenant_id,
                targeting_profile_id,
                prospect_entity_id,
                research_run_id,
                evidence_type,
                summary,
                evidence_source_kind,
                source,
                source_url,
                evidence_strength,
                evidence_status,
                observed_at,
                evidence_key
            )
            SELECT :tenant_id,
                   CAST(:targeting_profile_id AS uuid),
                   CAST(:prospect_entity_id AS uuid),
                   CAST(:research_run_id AS uuid),
                   'fit',
                   :summary,
                   'official_site',
                   :source,
                   :source_url,
                   :evidence_strength,
                   'pending',
                   CAST(:observed_at AS timestamptz),
                   :evidence_key
              FROM active_claim
            ON CONFLICT (tenant_id, targeting_profile_id, evidence_key)
            DO NOTHING
            RETURNING id
            """
        ),
        params,
    ).scalar_one_or_none()
    return bool(row)


def persist_phase2_candidate(
    conn: Connection,
    *,
    run: CandidateGenerationRun,
    claim_token: str,
    proposal: Phase2CandidateProposal,
) -> CandidatePersistenceResult:
    """Persist one proposal under a live claim in an existing transaction.

    The caller must use ``engine.begin()`` (or an equivalent transaction). The
    profile and run rows are locked for the small entity/assessment/evidence
    write, and the lease is checked again immediately before returning. A
    failed recheck raises so the transaction rolls back instead of leaving a
    target under a stale target thesis.
    """

    if not isinstance(run, CandidateGenerationRun):
        raise ValueError("run must be a CandidateGenerationRun")
    origin = _proposal_origin(proposal)
    _validate_proposal_scope(run, proposal, origin=origin)
    entity = proposal.entity

    targeting_profile = _assert_active_claim(
        conn,
        run=run,
        claim_token=claim_token,
        entity_kind=entity.entity_kind,
        lock=True,
    )
    if origin == "official_site":
        assert isinstance(proposal, OfficialSiteCandidateProposal)
        _validate_official_site_plan(conn, run=run, proposal=proposal)

    fit_candidate = TargetFitCandidate(
        entity_kind=entity.entity_kind,
        canonical_url=entity.canonical_url,
        title=entity.title,
        metadata_type=(
            proposal.provenance.metadata_type
            if isinstance(proposal, OfficialSiteCandidateProposal)
            else None
        ),
        structured_description=(
            proposal.metadata_description
            if isinstance(proposal, OfficialSiteCandidateProposal)
            else None
        ),
        source_fit_score=(
            proposal.fit_score if isinstance(proposal, EntityCandidateProposal) else None
        ),
    )
    fit_assessment = assess_target_fit(targeting_profile, fit_candidate)
    if fit_assessment.excluded:
        # Keep the exclusion out of target rows altogether. The executor
        # records only this fixed reason code in its bounded run summary.
        raise CandidateExcludedByTargetingBrief("brief_exclusion_match")
    # Brief-derived reasons come first so a fixed 16-code assessment cap can
    # never hide the policy that admitted a candidate. They contain no raw
    # customer phrase, title, URL, or provider rationale.
    reason_codes = _reason_codes(
        tuple(dict.fromkeys((*fit_assessment.reason_codes, *proposal.reason_codes)))[:MAX_REASON_CODES]
    )

    entity_id, entity_created = _upsert_entity(
        conn,
        run=run,
        claim_token=claim_token,
        entity=entity,
    )
    assessment_created = _insert_high_fit_assessment(
        conn,
        run=run,
        claim_token=claim_token,
        entity_id=entity_id,
        entity_kind=entity.entity_kind,
        fit_score=fit_assessment.fit_score,
        trigger_score=fit_assessment.trigger_score,
        priority_score=fit_assessment.priority_score,
        reason_codes=reason_codes,
    )

    # An already rejected/signal-backed assessment must remain untouched.
    # Create the optional weak fit observation only alongside a newly created
    # high-fit assessment; it is not a retroactive enrichment channel.
    fit_evidence_created = False
    if origin == "official_site" and assessment_created:
        assert isinstance(proposal, OfficialSiteCandidateProposal)
        fit_evidence_created = _insert_official_fit_evidence(
            conn,
            run=run,
            claim_token=claim_token,
            entity_kind=entity.entity_kind,
            evidence=_official_fit_evidence(
                run=run,
                entity_id=entity_id,
                proposal=proposal,
            ),
        )

    _assert_active_claim(
        conn,
        run=run,
        claim_token=claim_token,
        entity_kind=entity.entity_kind,
        lock=False,
    )
    return CandidatePersistenceResult(
        entity_id=entity_id,
        entity_created=entity_created,
        assessment_created=assessment_created,
        fit_evidence_created=fit_evidence_created,
        origin=origin,
    )


__all__ = [
    "CandidatePersistenceClaimLostError",
    "CandidatePersistenceResult",
    "Phase2CandidateProposal",
    "persist_phase2_candidate",
]
