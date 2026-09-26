"""Database lifecycle for a retained-public evidence collection run.

The planner owns pure selection models. This module owns the durable database
boundary: persist an explicit selection before dispatch, then reload it only
while a worker has a live compare-and-swap lease. It never fetches remote data
or stores source body text.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from api.services.embeddings import _database_engine

from .evidence_collection import (
    MAX_RETAINED_PUBLIC_EVIDENCE_LEASE_SECONDS,
    MAX_TENANT_ID_CHARS,
    ApprovedEvidenceTargetingProfileSnapshot,
    EvidenceCollectionRun,
    EvidenceCollectionRunCreation,
    EvidenceCollectionRunPlan,
    EvidenceCollectionStartRequest,
    EvidenceCollectionTargetPlan,
    EvidenceCollectionTargetSnapshot,
    EvidenceCollectionTerminalStatus,
    _bounded_int,
    _claim_research_quota,
    _json_sequence,
    _plan_fingerprint,
    _required_string,
    _safe_reason_code,
    _uuid,
    evidence_collection_idempotency_key,
    evidence_collection_plan_summary,
    plan_evidence_collection,
    retained_public_evidence_lease_seconds,
    retained_public_evidence_research_is_enabled,
    sanitize_evidence_collection_summary,
)
from .research_policy import (
    DEFAULT_EVIDENCE_RESEARCH_LIMITS,
    EntityEvidenceResearchRequest,
    EvidenceResearchLimits,
    PublicEvidenceSource,
    plan_entity_evidence_research,
)


logger = logging.getLogger(__name__)
_TERMINAL_STATUSES = frozenset({"completed", "partial", "failed", "cancelled", "skipped"})


def _profile_from_row(row: Mapping[str, Any]) -> ApprovedEvidenceTargetingProfileSnapshot:
    return ApprovedEvidenceTargetingProfileSnapshot(
        id=row.get("id"),
        tenant_id=row.get("tenant_id"),
        service_profile_id=row.get("service_profile_id"),
        profile_version=row.get("profile_version"),
        strong_evidence_definitions=_json_sequence(
            row.get("strong_evidence_definitions", []),
            field_name="strong_evidence_definitions",
        ),
    )


def _run_from_row(row: Mapping[str, Any]) -> EvidenceCollectionRun:
    return EvidenceCollectionRun(
        id=row.get("id"),
        tenant_id=row.get("tenant_id"),
        service_profile_id=row.get("service_profile_id"),
        targeting_profile_id=row.get("targeting_profile_id"),
        targeting_profile_version=row.get("targeting_profile_version"),
        status=row.get("status"),
        entity_limit=row.get("candidate_limit"),
        evidence_limit_per_entity=row.get("evidence_limit_per_entity"),
        plan_fingerprint=row.get("plan_fingerprint"),
        attempt_count=row.get("attempt_count", 0),
        claim_token=row.get("claim_token"),
    )


def _load_approved_targeting_profile(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str,
    targeting_profile_id: str | None = None,
) -> ApprovedEvidenceTargetingProfileSnapshot | None:
    conditions = [
        "profile.tenant_id = :tenant_id",
        "profile.service_profile_id = CAST(:service_profile_id AS uuid)",
        "profile.approval_status = 'approved'",
    ]
    params: dict[str, Any] = {"tenant_id": tenant_id, "service_profile_id": service_profile_id}
    if targeting_profile_id is not None:
        conditions.append("profile.id = CAST(:targeting_profile_id AS uuid)")
        params["targeting_profile_id"] = targeting_profile_id
    row = conn.execute(
        text(
            f"""
            SELECT profile.id,
                   profile.tenant_id,
                   profile.service_profile_id,
                   profile.profile_version,
                   profile.strong_evidence_definitions
              FROM public.targeting_profiles AS profile
             WHERE {' AND '.join(conditions)}
             LIMIT 1
            """
        ),
        params,
    ).mappings().one_or_none()
    return _profile_from_row(row) if row else None


def _entity_id_bindings(entity_ids: Sequence[str]) -> tuple[str, dict[str, str]]:
    bindings: list[str] = []
    params: dict[str, str] = {}
    for index, entity_id in enumerate(entity_ids):
        key = f"entity_id_{index}"
        bindings.append(f"CAST(:{key} AS uuid)")
        params[key] = entity_id
    if not bindings:
        raise ValueError("at least one entity ID is required")
    return ", ".join(bindings), params


def _load_selected_targets(
    conn: Connection,
    *,
    tenant_id: str,
    targeting_profile_id: str,
    entity_ids: Sequence[str],
) -> tuple[EvidenceCollectionTargetSnapshot, ...]:
    bindings, params = _entity_id_bindings(entity_ids)
    params.update({"tenant_id": tenant_id, "targeting_profile_id": targeting_profile_id})
    rows = conn.execute(
        text(
            f"""
            SELECT entity.id,
                   entity.entity_kind,
                   entity.origin_kind,
                   entity.canonical_url,
                   assessment.assessment_state
              FROM public.prospect_entities AS entity
              INNER JOIN public.prospect_assessments AS assessment
                      ON assessment.prospect_entity_id = entity.id
                     AND assessment.tenant_id = entity.tenant_id
             WHERE entity.tenant_id = :tenant_id
               AND assessment.targeting_profile_id = CAST(:targeting_profile_id AS uuid)
               AND entity.id IN ({bindings})
             ORDER BY entity.id ASC
            """
        ),
        params,
    ).mappings()
    return tuple(
        EvidenceCollectionTargetSnapshot(
            entity_id=row.get("id"),
            entity_kind=row.get("entity_kind"),
            origin_kind=row.get("origin_kind"),
            assessment_state=row.get("assessment_state"),
            canonical_url=row.get("canonical_url"),
        )
        for row in rows
    )


def _find_run_by_idempotency_key(
    conn: Connection,
    *,
    tenant_id: str,
    idempotency_key: str,
) -> EvidenceCollectionRun | None:
    row = conn.execute(
        text(
            """
            SELECT id,
                   tenant_id,
                   service_profile_id,
                   targeting_profile_id,
                   targeting_profile_version,
                   status,
                   candidate_limit,
                   evidence_limit_per_entity,
                   plan_fingerprint,
                   attempt_count,
                   claim_token
              FROM public.prospect_research_runs
             WHERE tenant_id = :tenant_id
               AND idempotency_key = :idempotency_key
               AND run_kind = 'evidence_collection'
             LIMIT 1
            """
        ),
        {"tenant_id": tenant_id, "idempotency_key": idempotency_key},
    ).mappings().one_or_none()
    return _run_from_row(row) if row else None


def _lock_idempotency_key(conn: Connection, *, idempotency_key: str) -> None:
    """Serialize a request nonce before charging its tenant quota."""

    conn.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:idempotency_key))"),
        {"idempotency_key": idempotency_key},
    )


def _insert_run_targets(
    conn: Connection,
    *,
    run: EvidenceCollectionRun,
    plan: EvidenceCollectionRunPlan,
) -> None:
    """Persist opaque IDs plus immutable policy classifications only."""

    for position, target_plan in enumerate(plan.target_plans):
        item = target_plan.plan
        target = target_plan.target
        result = conn.execute(
            text(
                """
                INSERT INTO public.prospect_research_run_entities (
                    tenant_id,
                    research_run_id,
                    prospect_entity_id,
                    request_position,
                    entity_kind,
                    origin_kind,
                    assessment_state_at_request,
                    evidence_limit,
                    source_result_limit,
                    thread_context_item_limit,
                    thread_context_char_limit,
                    public_sources
                )
                SELECT :tenant_id,
                       CAST(:research_run_id AS uuid),
                       CAST(:prospect_entity_id AS uuid),
                       :request_position,
                       :entity_kind,
                       :origin_kind,
                       :assessment_state,
                       :evidence_limit,
                       :source_result_limit,
                       :thread_context_item_limit,
                       :thread_context_char_limit,
                       CAST(:public_sources AS jsonb)
                 WHERE EXISTS (
                    SELECT 1
                      FROM public.prospect_research_runs AS active_run
                     WHERE active_run.id = CAST(:research_run_id AS uuid)
                       AND active_run.tenant_id = :tenant_id
                       AND active_run.run_kind = 'evidence_collection'
                       AND active_run.status = 'queued'
                       AND active_run.targeting_profile_id = CAST(:targeting_profile_id AS uuid)
                       AND active_run.targeting_profile_version = :targeting_profile_version
                 )
                """
            ),
            {
                "tenant_id": run.tenant_id,
                "research_run_id": run.id,
                "prospect_entity_id": target.entity_id,
                "request_position": position,
                "entity_kind": target.entity_kind,
                "origin_kind": target.origin_kind,
                "assessment_state": target.assessment_state,
                "evidence_limit": item.evidence_limit,
                "source_result_limit": item.source_result_limit_per_entity,
                "thread_context_item_limit": item.thread_context_item_limit,
                "thread_context_char_limit": item.thread_context_char_limit,
                "public_sources": json.dumps(list(item.public_sources), separators=(",", ":")),
                "targeting_profile_id": run.targeting_profile_id,
                "targeting_profile_version": run.targeting_profile_version,
            },
        )
        if result.rowcount != 1:
            raise RuntimeError("evidence-collection target selection was not persisted")


def _insert_evidence_collection_run(
    conn: Connection,
    *,
    request: EvidenceCollectionStartRequest,
    snapshot: ApprovedEvidenceTargetingProfileSnapshot,
    plan: EvidenceCollectionRunPlan,
    idempotency_key: str,
) -> EvidenceCollectionRun | None:
    summary = json.dumps(
        sanitize_evidence_collection_summary(evidence_collection_plan_summary(plan)),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    row = conn.execute(
        text(
            """
            INSERT INTO public.prospect_research_runs (
                id,
                tenant_id,
                targeting_profile_id,
                targeting_profile_version,
                service_profile_id,
                run_kind,
                status,
                idempotency_key,
                plan_fingerprint,
                candidate_limit,
                evidence_limit_per_entity,
                attempt_count,
                result_summary
            )
            SELECT CAST(:run_id AS uuid),
                   :tenant_id,
                   CAST(:targeting_profile_id AS uuid),
                   :targeting_profile_version,
                   CAST(:service_profile_id AS uuid),
                   'evidence_collection',
                   'queued',
                   :idempotency_key,
                   :plan_fingerprint,
                   :entity_limit,
                   :evidence_limit_per_entity,
                   0,
                   CAST(:result_summary AS jsonb)
             WHERE EXISTS (
                SELECT 1
                  FROM public.targeting_profiles AS profile
                 WHERE profile.id = CAST(:targeting_profile_id AS uuid)
                   AND profile.tenant_id = :tenant_id
                   AND profile.service_profile_id = CAST(:service_profile_id AS uuid)
                   AND profile.approval_status = 'approved'
                   AND profile.profile_version = :targeting_profile_version
             )
            ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
            RETURNING id,
                      tenant_id,
                      service_profile_id,
                      targeting_profile_id,
                      targeting_profile_version,
                      status,
                      candidate_limit,
                      evidence_limit_per_entity,
                      plan_fingerprint,
                      attempt_count,
                      claim_token
            """
        ),
        {
            "run_id": str(uuid4()),
            "tenant_id": request.tenant_id,
            "targeting_profile_id": snapshot.id,
            "targeting_profile_version": snapshot.profile_version,
            "service_profile_id": request.service_profile_id,
            "idempotency_key": idempotency_key,
            "plan_fingerprint": plan.input_fingerprint,
            "entity_limit": plan.planned_entity_count,
            "evidence_limit_per_entity": max(item.plan.evidence_limit for item in plan.target_plans),
            "result_summary": summary,
        },
    ).mappings().one_or_none()
    if row is None:
        return None
    run = _run_from_row(row)
    _insert_run_targets(conn, run=run, plan=plan)
    return run


def _create_evidence_collection_run_with_connection(
    conn: Connection,
    request: EvidenceCollectionStartRequest,
    *,
    idempotency_key: str,
    limits: EvidenceResearchLimits = DEFAULT_EVIDENCE_RESEARCH_LIMITS,
) -> EvidenceCollectionRunCreation:
    snapshot = _load_approved_targeting_profile(
        conn,
        tenant_id=request.tenant_id,
        service_profile_id=request.service_profile_id,
    )
    if snapshot is None:
        return EvidenceCollectionRunCreation(None, None, False, "targeting_profile_unavailable")
    try:
        targets = _load_selected_targets(
            conn,
            tenant_id=request.tenant_id,
            targeting_profile_id=snapshot.id,
            entity_ids=request.prospect_entity_ids,
        )
    except ValueError:
        return EvidenceCollectionRunCreation(None, None, False, "target_not_available")
    if {target.entity_id for target in targets} != set(request.prospect_entity_ids):
        return EvidenceCollectionRunCreation(None, None, False, "target_not_available")
    try:
        plan = plan_evidence_collection(snapshot, targets, limits=limits)
    except ValueError:
        logger.warning(
            "retained_public_evidence_collection_skipped tenant_id=%s service_profile_id=%s reason=%s",
            request.tenant_id,
            request.service_profile_id,
            "targeting_profile_unavailable",
        )
        return EvidenceCollectionRunCreation(None, None, False, "targeting_profile_unavailable")
    if plan is None:
        return EvidenceCollectionRunCreation(None, None, False, "no_planned_targets")
    if not _claim_research_quota(request.tenant_id, request.quota_scope):
        return EvidenceCollectionRunCreation(None, None, False, "tenant_quota_exceeded")

    run = _insert_evidence_collection_run(
        conn,
        request=request,
        snapshot=snapshot,
        plan=plan,
        idempotency_key=idempotency_key,
    )
    if run is not None:
        return EvidenceCollectionRunCreation(run=run, plan=plan, created=True)
    existing = _find_run_by_idempotency_key(conn, tenant_id=request.tenant_id, idempotency_key=idempotency_key)
    if existing is not None:
        return EvidenceCollectionRunCreation(run=existing, plan=plan, created=False)
    return EvidenceCollectionRunCreation(None, None, False, "targeting_profile_changed")


def create_evidence_collection_run(
    request: EvidenceCollectionStartRequest,
    *,
    engine: Engine | None = None,
    limits: EvidenceResearchLimits = DEFAULT_EVIDENCE_RESEARCH_LIMITS,
) -> EvidenceCollectionRunCreation:
    """Store an opt-in, idempotent retained-evidence request before dispatch."""

    if not isinstance(request, EvidenceCollectionStartRequest):
        raise ValueError("request must be an EvidenceCollectionStartRequest")
    if not isinstance(limits, EvidenceResearchLimits):
        raise ValueError("limits must be an EvidenceResearchLimits")
    if not retained_public_evidence_research_is_enabled():
        return EvidenceCollectionRunCreation(None, None, False, "feature_disabled")
    with (engine or _database_engine()).begin() as conn:
        idempotency_key = evidence_collection_idempotency_key(request)
        _lock_idempotency_key(conn, idempotency_key=idempotency_key)
        existing = _find_run_by_idempotency_key(
            conn,
            tenant_id=request.tenant_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            return EvidenceCollectionRunCreation(run=existing, plan=None, created=False)
        return _create_evidence_collection_run_with_connection(
            conn,
            request,
            idempotency_key=idempotency_key,
            limits=limits,
        )


def _lease_seconds(value: int | None) -> int:
    lease = value if value is not None else retained_public_evidence_lease_seconds()
    return _bounded_int(
        lease,
        field_name="lease_seconds",
        minimum=30,
        maximum=MAX_RETAINED_PUBLIC_EVIDENCE_LEASE_SECONDS,
    )


def claim_evidence_collection_run(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: str,
    claim_token: str | None = None,
    lease_seconds: int | None = None,
) -> EvidenceCollectionRun | None:
    """Claim one queued or expired retained-evidence run with a CAS token."""

    row = conn.execute(
        text(
            """
            UPDATE public.prospect_research_runs AS run
               SET status = 'running',
                   claim_token = CAST(:claim_token AS uuid),
                   lease_expires_at = NOW() + make_interval(secs => :lease_seconds),
                   last_heartbeat_at = NOW(),
                   attempt_count = run.attempt_count + 1,
                   started_at = COALESCE(run.started_at, NOW()),
                   completed_at = NULL,
                   updated_at = NOW()
             WHERE run.id = CAST(:run_id AS uuid)
               AND run.tenant_id = :tenant_id
               AND run.run_kind = 'evidence_collection'
               AND (
                    run.status = 'queued'
                    OR (run.status = 'running' AND run.lease_expires_at < NOW())
               )
            RETURNING run.id,
                      run.tenant_id,
                      run.service_profile_id,
                      run.targeting_profile_id,
                      run.targeting_profile_version,
                      run.status,
                      run.candidate_limit,
                      run.evidence_limit_per_entity,
                      run.plan_fingerprint,
                      run.attempt_count,
                      run.claim_token
            """
        ),
        {
            "tenant_id": _required_string(tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS),
            "run_id": _uuid(run_id, field_name="run_id"),
            "claim_token": _uuid(claim_token or str(uuid4()), field_name="claim_token"),
            "lease_seconds": _lease_seconds(lease_seconds),
        },
    ).mappings().one_or_none()
    return _run_from_row(row) if row else None


def heartbeat_evidence_collection_run(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: str,
    claim_token: str,
    lease_seconds: int | None = None,
) -> bool:
    row = conn.execute(
        text(
            """
            UPDATE public.prospect_research_runs AS run
               SET lease_expires_at = NOW() + make_interval(secs => :lease_seconds),
                   last_heartbeat_at = NOW(),
                   updated_at = NOW()
             WHERE run.id = CAST(:run_id AS uuid)
               AND run.tenant_id = :tenant_id
               AND run.run_kind = 'evidence_collection'
               AND run.status = 'running'
               AND run.claim_token = CAST(:claim_token AS uuid)
               AND run.lease_expires_at >= NOW()
            RETURNING run.id
            """
        ),
        {
            "tenant_id": _required_string(tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS),
            "run_id": _uuid(run_id, field_name="run_id"),
            "claim_token": _uuid(claim_token, field_name="claim_token"),
            "lease_seconds": _lease_seconds(lease_seconds),
        },
    ).scalar_one_or_none()
    return bool(row)


def release_evidence_collection_run_for_retry(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: str,
    claim_token: str,
    error_code: str = "retained_public_evidence_retryable_failure",
) -> bool:
    """Make a retryable error immediately claimable by the next delivery."""

    row = conn.execute(
        text(
            """
            UPDATE public.prospect_research_runs AS run
               SET status = 'queued',
                   error_code = :error_code,
                   claim_token = NULL,
                   lease_expires_at = NULL,
                   last_heartbeat_at = NOW(),
                   completed_at = NULL,
                   updated_at = NOW()
             WHERE run.id = CAST(:run_id AS uuid)
               AND run.tenant_id = :tenant_id
               AND run.run_kind = 'evidence_collection'
               AND run.status = 'running'
               AND run.claim_token = CAST(:claim_token AS uuid)
               AND run.lease_expires_at >= NOW()
            RETURNING run.id
            """
        ),
        {
            "tenant_id": _required_string(tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS),
            "run_id": _uuid(run_id, field_name="run_id"),
            "claim_token": _uuid(claim_token, field_name="claim_token"),
            "error_code": _safe_reason_code(error_code),
        },
    ).scalar_one_or_none()
    return bool(row)


def _source_list(value: Any) -> tuple[PublicEvidenceSource, ...]:
    raw = _json_sequence(value, field_name="public_sources")
    return tuple(str(item) for item in raw)  # type: ignore[return-value]


def _load_current_run_targets(
    conn: Connection,
    *,
    run: EvidenceCollectionRun,
) -> tuple[EvidenceCollectionTargetPlan, ...] | None:
    rows = conn.execute(
        text(
            """
            SELECT selection.prospect_entity_id,
                   selection.entity_kind AS planned_entity_kind,
                   selection.origin_kind AS planned_origin_kind,
                   selection.assessment_state_at_request,
                   selection.evidence_limit,
                   selection.source_result_limit,
                   selection.thread_context_item_limit,
                   selection.thread_context_char_limit,
                   selection.public_sources,
                   entity.entity_kind AS current_entity_kind,
                   entity.origin_kind AS current_origin_kind,
                   entity.canonical_url,
                   assessment.assessment_state AS current_assessment_state
              FROM public.prospect_research_run_entities AS selection
              INNER JOIN public.prospect_entities AS entity
                      ON entity.id = selection.prospect_entity_id
                     AND entity.tenant_id = selection.tenant_id
              INNER JOIN public.prospect_assessments AS assessment
                      ON assessment.prospect_entity_id = selection.prospect_entity_id
                     AND assessment.tenant_id = selection.tenant_id
                     AND assessment.targeting_profile_id = CAST(:targeting_profile_id AS uuid)
             WHERE selection.tenant_id = :tenant_id
               AND selection.research_run_id = CAST(:run_id AS uuid)
             ORDER BY selection.request_position ASC
            """
        ),
        {
            "tenant_id": run.tenant_id,
            "run_id": run.id,
            "targeting_profile_id": run.targeting_profile_id,
        },
    ).mappings()
    target_plans: list[EvidenceCollectionTargetPlan] = []
    for row in rows:
        if row.get("planned_entity_kind") != row.get("current_entity_kind"):
            return None
        if row.get("planned_origin_kind") != row.get("current_origin_kind"):
            return None
        try:
            target = EvidenceCollectionTargetSnapshot(
                entity_id=row.get("prospect_entity_id"),
                entity_kind=row.get("planned_entity_kind"),
                origin_kind=row.get("planned_origin_kind"),
                assessment_state=row.get("assessment_state_at_request"),
                current_assessment_state=row.get("current_assessment_state"),
                canonical_url=row.get("canonical_url"),
            )
            evidence_limit = _bounded_int(
                row.get("evidence_limit"),
                field_name="evidence_limit",
                minimum=1,
                maximum=DEFAULT_EVIDENCE_RESEARCH_LIMITS.evidence_limit_per_entity,
            )
            source_result_limit = _bounded_int(
                row.get("source_result_limit"),
                field_name="source_result_limit",
                minimum=1,
                maximum=DEFAULT_EVIDENCE_RESEARCH_LIMITS.source_result_limit_per_entity,
            )
            thread_context_item_limit = _bounded_int(
                row.get("thread_context_item_limit"),
                field_name="thread_context_item_limit",
                minimum=1,
                maximum=6,
            )
            thread_context_char_limit = _bounded_int(
                row.get("thread_context_char_limit"),
                field_name="thread_context_char_limit",
                minimum=256,
                maximum=6_000,
            )
            policy_plan = plan_entity_evidence_research(
                EntityEvidenceResearchRequest(
                    entity_id=target.entity_id,
                    entity_kind=target.entity_kind,
                    origin_kind=target.origin_kind,
                    assessment_state=target.assessment_state,
                    explicit_request=True,
                    public_sources=_source_list(row.get("public_sources")),
                ),
                limits=EvidenceResearchLimits(
                    entity_limit=1,
                    evidence_limit_per_entity=evidence_limit,
                    evidence_limit_total=evidence_limit,
                    source_result_limit_per_entity=source_result_limit,
                    thread_context_item_limit=thread_context_item_limit,
                    thread_context_char_limit=thread_context_char_limit,
                ),
            )
            if not policy_plan.is_planned:
                return None
            target_plans.append(EvidenceCollectionTargetPlan(target=target, plan=policy_plan))
        except (TypeError, ValueError):
            return None
    return tuple(target_plans) if target_plans else None


def current_evidence_collection_plan_for_claim(
    conn: Connection,
    run: EvidenceCollectionRun,
) -> EvidenceCollectionRunPlan | None:
    """Reload the exact selection only while its approved brief revision is live."""

    if not isinstance(run, EvidenceCollectionRun):
        raise ValueError("run must be an EvidenceCollectionRun")
    snapshot = _load_approved_targeting_profile(
        conn,
        tenant_id=run.tenant_id,
        service_profile_id=run.service_profile_id,
        targeting_profile_id=run.targeting_profile_id,
    )
    if snapshot is None or snapshot.profile_version != run.targeting_profile_version:
        return None
    target_plans = _load_current_run_targets(conn, run=run)
    if target_plans is None:
        return None
    try:
        plan = EvidenceCollectionRunPlan(
            targeting_profile_id=run.targeting_profile_id,
            targeting_profile_version=run.targeting_profile_version,
            target_plans=target_plans,
            entity_limit=run.entity_limit,
            evidence_limit_total=sum(item.plan.evidence_limit for item in target_plans),
            input_fingerprint=_plan_fingerprint(snapshot, target_plans),
            strong_evidence_definitions=snapshot.strong_evidence_definitions,
        )
    except ValueError:
        return None
    if plan.input_fingerprint != run.plan_fingerprint:
        return None
    if plan.planned_entity_count != run.entity_limit:
        return None
    if max(item.plan.evidence_limit for item in target_plans) != run.evidence_limit_per_entity:
        return None
    return plan


def complete_evidence_collection_run(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: str,
    claim_token: str,
    status: EvidenceCollectionTerminalStatus,
    summary: Mapping[str, Any],
    error_code: str | None = None,
) -> bool:
    """Terminalize a live claim without granting a stale worker write access."""

    normalized_status = _required_string(status, field_name="status", maximum=24).casefold()
    if normalized_status not in _TERMINAL_STATUSES:
        raise ValueError("status must be an evidence-collection terminal status")
    normalized_error_code = _safe_reason_code(error_code) if error_code is not None else None
    sanitized_summary = sanitize_evidence_collection_summary(summary)
    row = conn.execute(
        text(
            """
            UPDATE public.prospect_research_runs AS run
               SET status = :status,
                   result_summary = run.result_summary || CAST(:result_summary AS jsonb),
                   error_code = :error_code,
                   claim_token = NULL,
                   lease_expires_at = NULL,
                   last_heartbeat_at = NOW(),
                   completed_at = NOW(),
                   updated_at = NOW()
             WHERE run.id = CAST(:run_id AS uuid)
               AND run.tenant_id = :tenant_id
               AND run.run_kind = 'evidence_collection'
               AND run.status = 'running'
               AND run.claim_token = CAST(:claim_token AS uuid)
               AND run.lease_expires_at >= NOW()
            RETURNING run.id
            """
        ),
        {
            "tenant_id": _required_string(tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS),
            "run_id": _uuid(run_id, field_name="run_id"),
            "claim_token": _uuid(claim_token, field_name="claim_token"),
            "status": normalized_status,
            "result_summary": json.dumps(
                sanitized_summary,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ),
            "error_code": normalized_error_code,
        },
    ).scalar_one_or_none()
    return bool(row)


__all__ = [
    "claim_evidence_collection_run",
    "complete_evidence_collection_run",
    "create_evidence_collection_run",
    "current_evidence_collection_plan_for_claim",
    "heartbeat_evidence_collection_run",
    "release_evidence_collection_run_for_retry",
]
