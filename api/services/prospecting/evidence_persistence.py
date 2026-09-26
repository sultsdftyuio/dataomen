"""Tenant-safe persistence for retained-public evidence proposals.

Only the retained-corpus reader can produce proposals for this boundary.  The
write path independently proves all of the following in one short database
transaction: the worker still owns a live evidence-collection lease, the
target was selected by that run, its strict public locator still matches, and
the cited global source row belongs to that exact locator.  It never accepts a
raw post body, URL, provider payload, contact, or buyer-state update.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection

from .entity_first import ProspectEvidenceInput
from .evidence_collection import EvidenceCollectionRun, EvidenceCollectionTargetPlan
from .retained_public_evidence import (
    RetainedPublicAuthorLocator,
    resolve_retained_public_author_locator,
)


class EvidencePersistenceClaimLostError(RuntimeError):
    """The target scope, brief revision, or lease is no longer current."""


@dataclass(frozen=True)
class RetainedEvidencePersistenceResult:
    """Content-free write outcome appropriate for durable run telemetry."""

    evidence_created: bool


def _claim_token(run: EvidenceCollectionRun, claim_token: str) -> str:
    try:
        normalized = str(UUID(claim_token))
    except (AttributeError, TypeError, ValueError) as error:
        raise EvidencePersistenceClaimLostError("evidence-collection claim token is invalid") from error
    if run.claim_token is None or run.claim_token != normalized:
        raise EvidencePersistenceClaimLostError("evidence-collection claim token does not match run")
    return normalized


def _validate_scope(
    *,
    run: EvidenceCollectionRun,
    target_plan: EvidenceCollectionTargetPlan,
    locator: RetainedPublicAuthorLocator,
    evidence: ProspectEvidenceInput,
) -> None:
    if not isinstance(run, EvidenceCollectionRun):
        raise ValueError("run must be an EvidenceCollectionRun")
    if not isinstance(target_plan, EvidenceCollectionTargetPlan):
        raise ValueError("target_plan must be an EvidenceCollectionTargetPlan")
    if not isinstance(locator, RetainedPublicAuthorLocator):
        raise ValueError("locator must be a RetainedPublicAuthorLocator")
    if not isinstance(evidence, ProspectEvidenceInput):
        raise ValueError("evidence must be a ProspectEvidenceInput")
    if target_plan.target.rejected_since_request:
        raise EvidencePersistenceClaimLostError("target has been rejected since research was requested")
    if target_plan.plan.entity_id != evidence.prospect_entity_id:
        raise ValueError("evidence entity is outside the selected target plan")
    if evidence.targeting_profile_id != run.targeting_profile_id:
        raise ValueError("evidence targeting profile does not match the run")
    if evidence.research_run_id != run.id:
        raise ValueError("evidence research run does not match the active run")
    if evidence.evidence_type != "evaluation":
        raise ValueError("retained-public collection accepts only evaluation evidence")
    if evidence.evidence_source_kind != "public_source":
        raise ValueError("retained-public collection requires public-source evidence")
    if evidence.source != locator.source or locator.source not in target_plan.plan.public_sources:
        raise ValueError("evidence source is outside the selected target plan")
    if evidence.source_post_id is None or evidence.source_url is not None:
        raise ValueError("retained-public evidence requires only its source-post citation")
    if evidence.evidence_status != "pending" or evidence.verified_at is not None or evidence.verified_by is not None:
        raise ValueError("worker evidence must remain pending and unverified")
    if evidence.evidence_strength not in {"moderate", "strong"}:
        raise ValueError("retained-public evaluation evidence must have moderate or strong evidence strength")

    expected_locator = resolve_retained_public_author_locator(
        entity_kind=target_plan.target.entity_kind,
        canonical_url=target_plan.target.canonical_url,
    )
    if expected_locator != locator:
        raise ValueError("retained-public locator does not match the selected target")


_ACTIVE_CLAIM_SQL = """
    SELECT run.id
      FROM public.prospect_research_runs AS run
      INNER JOIN public.targeting_profiles AS profile
              ON profile.id = run.targeting_profile_id
             AND profile.tenant_id = run.tenant_id
      INNER JOIN public.prospect_research_run_entities AS selection
              ON selection.research_run_id = run.id
             AND selection.tenant_id = run.tenant_id
             AND selection.prospect_entity_id = CAST(:prospect_entity_id AS uuid)
      INNER JOIN public.prospect_entities AS entity
              ON entity.id = selection.prospect_entity_id
             AND entity.tenant_id = selection.tenant_id
      INNER JOIN public.prospect_assessments AS assessment
              ON assessment.prospect_entity_id = selection.prospect_entity_id
             AND assessment.tenant_id = selection.tenant_id
             AND assessment.targeting_profile_id = run.targeting_profile_id
     WHERE run.id = CAST(:run_id AS uuid)
       AND run.tenant_id = :tenant_id
       AND run.run_kind = 'evidence_collection'
       AND run.status = 'running'
       AND run.claim_token = CAST(:claim_token AS uuid)
       AND run.lease_expires_at >= clock_timestamp()
       AND profile.service_profile_id = run.service_profile_id
       AND profile.approval_status = 'approved'
       AND profile.profile_version = run.targeting_profile_version
       AND selection.entity_kind = :entity_kind
       AND selection.origin_kind = :origin_kind
       AND selection.assessment_state_at_request = :assessment_state_at_request
       AND selection.evidence_limit = :evidence_limit
       AND selection.public_sources @> jsonb_build_array(CAST(:source AS text))
       AND entity.entity_kind = :entity_kind
       AND entity.origin_kind = :origin_kind
       AND entity.canonical_url = :canonical_url
       AND assessment.assessment_state <> 'rejected'
"""


def _active_claim_params(
    *,
    run: EvidenceCollectionRun,
    target_plan: EvidenceCollectionTargetPlan,
    locator: RetainedPublicAuthorLocator,
    claim_token: str,
) -> dict[str, object]:
    return {
        "tenant_id": run.tenant_id,
        "run_id": run.id,
        "claim_token": _claim_token(run, claim_token),
        "prospect_entity_id": target_plan.target.entity_id,
        "entity_kind": target_plan.target.entity_kind,
        "origin_kind": target_plan.target.origin_kind,
        "assessment_state_at_request": target_plan.target.assessment_state,
        "evidence_limit": target_plan.plan.evidence_limit,
        "source": locator.source,
        "canonical_url": target_plan.target.canonical_url,
    }


def _assert_active_claim(
    conn: Connection,
    *,
    run: EvidenceCollectionRun,
    target_plan: EvidenceCollectionTargetPlan,
    locator: RetainedPublicAuthorLocator,
    claim_token: str,
    lock: bool,
) -> None:
    statement = _ACTIVE_CLAIM_SQL
    if lock:
        # The entity, selected mapping, profile, assessment, and run are all
        # locked for the small insert. A brief edit cannot land halfway through
        # a worker's source-grounded evidence write.
        statement += " FOR UPDATE OF run, profile, selection, entity, assessment"
    row = conn.execute(
        text(statement),
        _active_claim_params(
            run=run,
            target_plan=target_plan,
            locator=locator,
            claim_token=claim_token,
        ),
    ).scalar_one_or_none()
    if not row:
        raise EvidencePersistenceClaimLostError("evidence-collection claim is no longer active")


def persist_retained_public_evidence(
    conn: Connection,
    *,
    run: EvidenceCollectionRun,
    target_plan: EvidenceCollectionTargetPlan,
    locator: RetainedPublicAuthorLocator,
    claim_token: str,
    evidence: ProspectEvidenceInput,
) -> RetainedEvidencePersistenceResult:
    """Persist one pending, exact-author public evaluation under a live lease.

    The caller owns the surrounding ``engine.begin()`` transaction. This
    function validates the proposal before acquiring locks, then checks the
    active claim both before and after the insert so a reclaimed worker cannot
    leave a stale observation under a changed targeting thesis.
    """

    _validate_scope(run=run, target_plan=target_plan, locator=locator, evidence=evidence)
    _assert_active_claim(
        conn,
        run=run,
        target_plan=target_plan,
        locator=locator,
        claim_token=claim_token,
        lock=True,
    )
    params = _active_claim_params(
        run=run,
        target_plan=target_plan,
        locator=locator,
        claim_token=claim_token,
    )
    params.update(
        {
            "targeting_profile_id": evidence.targeting_profile_id,
            "research_run_id": evidence.research_run_id,
            "source_post_id": evidence.source_post_id,
            "summary": evidence.summary,
            "evidence_excerpt": evidence.evidence_excerpt,
            "evidence_strength": evidence.evidence_strength,
            "observed_at": evidence.observed_at.isoformat(),
            "evidence_key": evidence.evidence_key,
            "author_locator": locator.author_locator,
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
                source_post_id,
                evidence_excerpt,
                evidence_strength,
                evidence_status,
                observed_at,
                evidence_key
            )
            SELECT :tenant_id,
                   CAST(:targeting_profile_id AS uuid),
                   CAST(:prospect_entity_id AS uuid),
                   CAST(:research_run_id AS uuid),
                   'evaluation',
                   :summary,
                   'public_source',
                   :source,
                   CAST(:source_post_id AS uuid),
                   :evidence_excerpt,
                   :evidence_strength,
                   'pending',
                   CAST(:observed_at AS timestamptz),
                   :evidence_key
              FROM active_claim
              INNER JOIN public.source_posts AS source_post
                      ON source_post.id = CAST(:source_post_id AS uuid)
             WHERE source_post.tenant_id IS NULL
               AND source_post.source = :source
               AND source_post.source_post_id IS NOT NULL
               AND LOWER(source_post.author_handle) = :author_locator
               AND (
                    :evidence_excerpt IS NULL
                    OR position(:evidence_excerpt IN COALESCE(source_post.body, source_post.text, '')) > 0
               )
               AND (
                    SELECT count(*)
                      FROM public.prospect_evidence AS existing_evidence
                     WHERE existing_evidence.tenant_id = :tenant_id
                       AND existing_evidence.research_run_id = CAST(:research_run_id AS uuid)
                       AND existing_evidence.prospect_entity_id = CAST(:prospect_entity_id AS uuid)
               ) < :evidence_limit
            ON CONFLICT (tenant_id, targeting_profile_id, evidence_key)
            DO NOTHING
            RETURNING id
            """
        ),
        params,
    ).scalar_one_or_none()
    _assert_active_claim(
        conn,
        run=run,
        target_plan=target_plan,
        locator=locator,
        claim_token=claim_token,
        lock=False,
    )
    return RetainedEvidencePersistenceResult(evidence_created=bool(row))


__all__ = [
    "EvidencePersistenceClaimLostError",
    "RetainedEvidencePersistenceResult",
    "persist_retained_public_evidence",
]
