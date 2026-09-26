"""Durable, feature-gated run control for entity-first target generation.

This module owns the lifecycle around a *requested* candidate-generation run;
it does not crawl, call a licensed provider, or promote a target to a lead.
The executor receives only a tenant and run ID, then reloads the approved
targeting-profile snapshot before it is allowed to write anything.  That keeps
the broker free of seed URLs and makes a changed targeting thesis a safe skip
instead of a stale write.

Actual candidate persistence lives behind the same claim token used here.  The
run functions are intentionally usable without a queue so the worker boundary
can be tested independently of Redis.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from api.services.cost_controls import TenantQuotaGuard, env_int
from api.services.embeddings import _database_engine

from .entity_first import TargetingProfileInput
from .official_site_generation import (
    DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS,
    OfficialSiteGenerationLimits,
    OfficialSiteGenerationRequest,
    OfficialSiteGenerationRunPlan,
    plan_official_site_generation,
)


logger = logging.getLogger(__name__)


CANDIDATE_GENERATION_FLAG = "ARCLI_ENTITY_CANDIDATE_GENERATION_ENABLED"
DEFAULT_CANDIDATE_GENERATION_TENANT_LIMIT = 2
DEFAULT_CANDIDATE_GENERATION_TENANT_WINDOW_SECONDS = 86_400
DEFAULT_CANDIDATE_GENERATION_LEASE_SECONDS = 180
MAX_CANDIDATE_GENERATION_LEASE_SECONDS = 900
MAX_TENANT_ID_CHARS = 120
MAX_REQUEST_NONCE_CHARS = 128
MAX_SUMMARY_REASON_CODES = 16
MAX_SUMMARY_COUNT = 1_000_000

CandidateGenerationRunStatus = Literal[
    "queued",
    "running",
    "completed",
    "partial",
    "failed",
    "cancelled",
    "skipped",
]
CandidateGenerationTerminalStatus = Literal[
    "completed",
    "partial",
    "failed",
    "cancelled",
    "skipped",
]
CandidateGenerationSkipReason = Literal[
    "feature_disabled",
    "tenant_quota_exceeded",
    "targeting_profile_unavailable",
    "targeting_profile_changed",
    "no_planned_candidates",
]

_RUN_STATUSES = frozenset(
    {
        "queued",
        "running",
        "completed",
        "partial",
        "failed",
        "cancelled",
        "skipped",
    }
)
_TERMINAL_STATUSES = frozenset(
    {"completed", "partial", "failed", "cancelled", "skipped"}
)
_SAFE_REASON_CODE = re.compile(r"^[a-z0-9_:-]{1,120}$")
_SUMMARY_COUNT_KEYS = frozenset(
    {
        "planned_seed_count",
        "planned_candidate_limit",
        "pages_fetched",
        "pages_skipped",
        "candidate_proposals",
        "entities_created",
        "entities_seen",
        "assessments_created",
        "fit_evidence_created",
    }
)


def _required_string(value: Any, *, field_name: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    # Request nonces participate in idempotency and reason codes participate
    # in operational policy. Truncating either would turn distinct inputs into
    # the same accepted value, so this boundary rejects oversize material
    # instead of adopting the older display-text truncation convention.
    normalized = re.sub(r"\s+", " ", value).strip()
    if not normalized:
        raise ValueError(f"{field_name} is required")
    if len(normalized) > maximum:
        raise ValueError(f"{field_name} exceeds {maximum} characters")
    return normalized


def _uuid(value: Any, *, field_name: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be a UUID") from error


def _profile_version(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("profile_version must be a positive integer")
    try:
        normalized = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError("profile_version must be a positive integer") from error
    if normalized < 1:
        raise ValueError("profile_version must be a positive integer")
    return normalized


def _bounded_int(value: Any, *, field_name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    try:
        normalized = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be an integer") from error
    if not minimum <= normalized <= maximum:
        raise ValueError(f"{field_name} must be between {minimum} and {maximum}")
    return normalized


def _json_sequence(value: Any, *, field_name: str) -> list[Any]:
    payload = value
    if isinstance(value, str):
        try:
            payload = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError(f"{field_name} must be a JSON array") from error
    if isinstance(payload, (str, bytes, bytearray)) or not isinstance(payload, Sequence):
        raise ValueError(f"{field_name} must be an array")
    return list(payload)


def _safe_reason_code(value: Any) -> str:
    normalized = _required_string(value, field_name="reason_code", maximum=120).casefold()
    if not _SAFE_REASON_CODE.fullmatch(normalized):
        raise ValueError("reason_code is invalid")
    return normalized


def candidate_generation_is_enabled() -> bool:
    """Return whether a tenant may explicitly queue bounded target generation."""

    return os.getenv(CANDIDATE_GENERATION_FLAG, "false").strip().casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }


def candidate_generation_lease_seconds() -> int:
    """Keep a claimed run recoverable without permitting an unbounded lease."""

    configured = env_int(
        "ARCLI_ENTITY_CANDIDATE_GENERATION_LEASE_SECONDS",
        DEFAULT_CANDIDATE_GENERATION_LEASE_SECONDS,
    )
    return max(30, min(MAX_CANDIDATE_GENERATION_LEASE_SECONDS, configured))


def _claim_generation_quota(tenant_id: str) -> bool:
    decision = TenantQuotaGuard().check_and_increment(
        tenant_id=tenant_id,
        counter_name="entity_candidate_generation",
        limit=env_int(
            "ARCLI_ENTITY_CANDIDATE_GENERATION_TENANT_LIMIT",
            DEFAULT_CANDIDATE_GENERATION_TENANT_LIMIT,
        ),
        window_seconds=env_int(
            "ARCLI_ENTITY_CANDIDATE_GENERATION_TENANT_WINDOW_SECONDS",
            DEFAULT_CANDIDATE_GENERATION_TENANT_WINDOW_SECONDS,
        ),
    )
    return decision.allowed


@dataclass(frozen=True)
class CandidateGenerationStartRequest:
    """Minimal, content-free request material accepted before a run exists."""

    tenant_id: str
    service_profile_id: str
    request_nonce: str

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "tenant_id",
            _required_string(
                self.tenant_id,
                field_name="tenant_id",
                maximum=MAX_TENANT_ID_CHARS,
            ),
        )
        object.__setattr__(
            self,
            "service_profile_id",
            _uuid(self.service_profile_id, field_name="service_profile_id"),
        )
        object.__setattr__(
            self,
            "request_nonce",
            _required_string(
                self.request_nonce,
                field_name="request_nonce",
                maximum=MAX_REQUEST_NONCE_CHARS,
            ),
        )


@dataclass(frozen=True)
class ApprovedTargetingProfileSnapshot:
    """The small approved-profile view allowed to govern a generation run."""

    id: str
    tenant_id: str
    service_profile_id: str
    profile_version: int
    targeting_profile: TargetingProfileInput

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", _uuid(self.id, field_name="targeting_profile_id"))
        object.__setattr__(
            self,
            "tenant_id",
            _required_string(
                self.tenant_id,
                field_name="tenant_id",
                maximum=MAX_TENANT_ID_CHARS,
            ),
        )
        object.__setattr__(
            self,
            "service_profile_id",
            _uuid(self.service_profile_id, field_name="service_profile_id"),
        )
        object.__setattr__(self, "profile_version", _profile_version(self.profile_version))
        if not isinstance(self.targeting_profile, TargetingProfileInput):
            raise ValueError("targeting_profile must be a TargetingProfileInput")


@dataclass(frozen=True)
class CandidateGenerationRun:
    """Durable run state without target content, URLs, or provider payloads."""

    id: str
    tenant_id: str
    service_profile_id: str
    targeting_profile_id: str
    targeting_profile_version: int
    status: CandidateGenerationRunStatus
    candidate_limit: int
    plan_fingerprint: str
    attempt_count: int
    claim_token: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", _uuid(self.id, field_name="run_id"))
        object.__setattr__(
            self,
            "tenant_id",
            _required_string(
                self.tenant_id,
                field_name="tenant_id",
                maximum=MAX_TENANT_ID_CHARS,
            ),
        )
        object.__setattr__(
            self,
            "service_profile_id",
            _uuid(self.service_profile_id, field_name="service_profile_id"),
        )
        object.__setattr__(
            self,
            "targeting_profile_id",
            _uuid(self.targeting_profile_id, field_name="targeting_profile_id"),
        )
        object.__setattr__(
            self,
            "targeting_profile_version",
            _profile_version(self.targeting_profile_version),
        )
        normalized_status = _required_string(self.status, field_name="status", maximum=24).casefold()
        if normalized_status not in _RUN_STATUSES:
            raise ValueError(f"unsupported candidate-generation status: {normalized_status}")
        object.__setattr__(self, "status", normalized_status)
        object.__setattr__(
            self,
            "candidate_limit",
            _bounded_int(
                self.candidate_limit,
                field_name="candidate_limit",
                minimum=1,
                maximum=100,
            ),
        )
        fingerprint = _required_string(
            self.plan_fingerprint,
            field_name="plan_fingerprint",
            maximum=64,
        ).casefold()
        if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
            raise ValueError("plan_fingerprint must be a SHA-256 digest")
        object.__setattr__(self, "plan_fingerprint", fingerprint)
        object.__setattr__(
            self,
            "attempt_count",
            _bounded_int(
                self.attempt_count,
                field_name="attempt_count",
                minimum=0,
                maximum=100,
            ),
        )
        claim_token = self.claim_token
        if claim_token is not None:
            claim_token = _uuid(claim_token, field_name="claim_token")
        object.__setattr__(self, "claim_token", claim_token)


@dataclass(frozen=True)
class CandidateGenerationRunCreation:
    """The result of preparing one requested, durable generation operation."""

    run: CandidateGenerationRun | None
    plan: OfficialSiteGenerationRunPlan | None
    created: bool
    skip_reason: CandidateGenerationSkipReason | None = None

    def __post_init__(self) -> None:
        if self.run is None and self.plan is not None:
            raise ValueError("a skipped generation result cannot include a plan")
        if self.run is not None and self.plan is None:
            raise ValueError("a durable generation run requires its plan")
        if self.run is None and self.skip_reason is None:
            raise ValueError("a skipped generation result needs a skip_reason")
        if self.run is not None and self.skip_reason is not None:
            raise ValueError("a durable generation result cannot include a skip_reason")


def candidate_generation_idempotency_key(
    request: CandidateGenerationStartRequest,
    *,
    targeting_profile_id: str,
    targeting_profile_version: int,
    plan_fingerprint: str,
) -> str:
    """Hash all scope/version material plus a caller retry nonce.

    The plan fingerprint alone is deliberately insufficient: users may choose
    a fresh explicit run on an unchanged brief, while retries of one action
    must still resolve to the same durable row.
    """

    profile_id = _uuid(targeting_profile_id, field_name="targeting_profile_id")
    profile_version = _profile_version(targeting_profile_version)
    fingerprint = _required_string(
        plan_fingerprint,
        field_name="plan_fingerprint",
        maximum=64,
    ).casefold()
    if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
        raise ValueError("plan_fingerprint must be a SHA-256 digest")
    material = "\x1f".join(
        (
            "entity-candidate-generation-v1",
            request.tenant_id,
            request.service_profile_id,
            profile_id,
            str(profile_version),
            fingerprint,
            request.request_nonce,
        )
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def candidate_generation_plan_summary(
    plan: OfficialSiteGenerationRunPlan,
) -> dict[str, int | str]:
    """Return content-free plan telemetry safe to store on a durable run."""

    return {
        "profile_version": int(plan.profile_version),
        "plan_fingerprint": plan.input_fingerprint,
        "planned_seed_count": plan.planned_seed_count,
        "planned_candidate_limit": plan.planned_candidate_limit,
    }


def sanitize_candidate_generation_summary(
    summary: Mapping[str, Any],
) -> dict[str, Any]:
    """Allow only counters, opaque fingerprints, and fixed diagnostic codes.

    URLs, page titles, excerpts, query phrases, and provider payloads are
    intentionally not a run-summary channel.  Those may be stored only in
    their own tenant-scoped entity/evidence records after validation.
    """

    if not isinstance(summary, Mapping):
        raise ValueError("summary must be a mapping")

    sanitized: dict[str, Any] = {}
    for key in _SUMMARY_COUNT_KEYS:
        if key in summary:
            sanitized[key] = _bounded_int(
                summary[key],
                field_name=key,
                minimum=0,
                maximum=MAX_SUMMARY_COUNT,
            )

    if "profile_version" in summary:
        sanitized["profile_version"] = _profile_version(summary["profile_version"])
    if "plan_fingerprint" in summary:
        fingerprint = _required_string(
            summary["plan_fingerprint"],
            field_name="plan_fingerprint",
            maximum=64,
        ).casefold()
        if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
            raise ValueError("plan_fingerprint must be a SHA-256 digest")
        sanitized["plan_fingerprint"] = fingerprint
    if "skip_reason" in summary:
        sanitized["skip_reason"] = _safe_reason_code(summary["skip_reason"])
    if "failure_reason" in summary:
        sanitized["failure_reason"] = _safe_reason_code(summary["failure_reason"])
    if "skipped_by_reason" in summary:
        raw_reasons = summary["skipped_by_reason"]
        if not isinstance(raw_reasons, Mapping):
            raise ValueError("skipped_by_reason must be a mapping")
        if len(raw_reasons) > MAX_SUMMARY_REASON_CODES:
            raise ValueError("skipped_by_reason exceeds the reason-code limit")
        reasons: dict[str, int] = {}
        for raw_reason, raw_count in raw_reasons.items():
            reasons[_safe_reason_code(raw_reason)] = _bounded_int(
                raw_count,
                field_name="skipped_by_reason count",
                minimum=0,
                maximum=MAX_SUMMARY_COUNT,
            )
        sanitized["skipped_by_reason"] = reasons

    return sanitized


def _snapshot_from_row(row: Mapping[str, Any]) -> ApprovedTargetingProfileSnapshot:
    try:
        profile = TargetingProfileInput(
            target_types=_json_sequence(row.get("target_types"), field_name="target_types"),
            ideal_customer_traits=_json_sequence(
                row.get("ideal_customer_traits", []),
                field_name="ideal_customer_traits",
            ),
            change_triggers=_json_sequence(
                row.get("change_triggers", []),
                field_name="change_triggers",
            ),
            strong_evidence_definitions=_json_sequence(
                row.get("strong_evidence_definitions", []),
                field_name="strong_evidence_definitions",
            ),
            exclusions=_json_sequence(row.get("exclusions", []), field_name="exclusions"),
            seed_urls=_json_sequence(row.get("seed_urls"), field_name="seed_urls"),
        )
    except ValueError as error:
        raise ValueError("approved targeting profile contains invalid generation input") from error
    return ApprovedTargetingProfileSnapshot(
        id=row.get("id"),
        tenant_id=row.get("tenant_id"),
        service_profile_id=row.get("service_profile_id"),
        profile_version=row.get("profile_version"),
        targeting_profile=profile,
    )


def _run_from_row(row: Mapping[str, Any]) -> CandidateGenerationRun:
    return CandidateGenerationRun(
        id=row.get("id"),
        tenant_id=row.get("tenant_id"),
        service_profile_id=row.get("service_profile_id"),
        targeting_profile_id=row.get("targeting_profile_id"),
        targeting_profile_version=row.get("targeting_profile_version"),
        status=row.get("status"),
        candidate_limit=row.get("candidate_limit"),
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
) -> ApprovedTargetingProfileSnapshot | None:
    conditions = [
        "profile.tenant_id = :tenant_id",
        "profile.service_profile_id = CAST(:service_profile_id AS uuid)",
        "profile.approval_status = 'approved'",
    ]
    params: dict[str, Any] = {
        "tenant_id": tenant_id,
        "service_profile_id": service_profile_id,
    }
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
                   profile.target_types,
                   profile.ideal_customer_traits,
                   profile.change_triggers,
                   profile.strong_evidence_definitions,
                   profile.exclusions,
                   profile.seed_urls
              FROM public.targeting_profiles AS profile
             WHERE {' AND '.join(conditions)}
             LIMIT 1
            """
        ),
        params,
    ).mappings().one_or_none()
    return _snapshot_from_row(row) if row else None


def _find_run_by_idempotency_key(
    conn: Connection,
    *,
    tenant_id: str,
    idempotency_key: str,
) -> CandidateGenerationRun | None:
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
                   plan_fingerprint,
                   attempt_count,
                   claim_token
              FROM public.prospect_research_runs
             WHERE tenant_id = :tenant_id
               AND idempotency_key = :idempotency_key
             LIMIT 1
            """
        ),
        {"tenant_id": tenant_id, "idempotency_key": idempotency_key},
    ).mappings().one_or_none()
    return _run_from_row(row) if row else None


def _insert_candidate_generation_run(
    conn: Connection,
    *,
    request: CandidateGenerationStartRequest,
    snapshot: ApprovedTargetingProfileSnapshot,
    plan: OfficialSiteGenerationRunPlan,
    idempotency_key: str,
) -> CandidateGenerationRun | None:
    run_id = str(uuid4())
    summary = json.dumps(
        sanitize_candidate_generation_summary(candidate_generation_plan_summary(plan)),
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
            SELECT
                CAST(:run_id AS uuid),
                :tenant_id,
                CAST(:targeting_profile_id AS uuid),
                :targeting_profile_version,
                CAST(:service_profile_id AS uuid),
                'candidate_generation',
                'queued',
                :idempotency_key,
                :plan_fingerprint,
                :candidate_limit,
                1,
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
                      plan_fingerprint,
                      attempt_count,
                      claim_token
            """
        ),
        {
            "run_id": run_id,
            "tenant_id": request.tenant_id,
            "targeting_profile_id": snapshot.id,
            "targeting_profile_version": snapshot.profile_version,
            "service_profile_id": request.service_profile_id,
            "idempotency_key": idempotency_key,
            "plan_fingerprint": plan.input_fingerprint,
            "candidate_limit": plan.planned_candidate_limit,
            "result_summary": summary,
        },
    ).mappings().one_or_none()
    return _run_from_row(row) if row else None


def _plan_for_snapshot(
    request: CandidateGenerationStartRequest,
    snapshot: ApprovedTargetingProfileSnapshot,
    *,
    limits: OfficialSiteGenerationLimits = DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS,
) -> OfficialSiteGenerationRunPlan:
    return plan_official_site_generation(
        OfficialSiteGenerationRequest(
            tenant_id=request.tenant_id,
            service_profile_id=request.service_profile_id,
            targeting_profile_id=snapshot.id,
            profile_version=str(snapshot.profile_version),
            target_types=snapshot.targeting_profile.target_types,
            seed_urls=snapshot.targeting_profile.seed_urls,
            explicit_request=True,
        ),
        limits=limits,
    )


def _create_candidate_generation_run_with_connection(
    conn: Connection,
    request: CandidateGenerationStartRequest,
    *,
    limits: OfficialSiteGenerationLimits = DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS,
) -> CandidateGenerationRunCreation:
    snapshot = _load_approved_targeting_profile(
        conn,
        tenant_id=request.tenant_id,
        service_profile_id=request.service_profile_id,
    )
    if snapshot is None:
        return CandidateGenerationRunCreation(
            run=None,
            plan=None,
            created=False,
            skip_reason="targeting_profile_unavailable",
        )
    if not snapshot.targeting_profile.seed_urls:
        return CandidateGenerationRunCreation(
            run=None,
            plan=None,
            created=False,
            skip_reason="no_planned_candidates",
        )

    try:
        plan = _plan_for_snapshot(request, snapshot, limits=limits)
    except ValueError:
        # A malformed persisted profile must not create a partially scoped job.
        logger.warning(
            "entity_candidate_generation_skipped tenant_id=%s service_profile_id=%s reason=%s",
            request.tenant_id,
            request.service_profile_id,
            "targeting_profile_unavailable",
        )
        return CandidateGenerationRunCreation(
            run=None,
            plan=None,
            created=False,
            skip_reason="targeting_profile_unavailable",
        )
    if plan.planned_candidate_limit < 1:
        return CandidateGenerationRunCreation(
            run=None,
            plan=None,
            created=False,
            skip_reason="no_planned_candidates",
        )

    idempotency_key = candidate_generation_idempotency_key(
        request,
        targeting_profile_id=snapshot.id,
        targeting_profile_version=snapshot.profile_version,
        plan_fingerprint=plan.input_fingerprint,
    )
    existing = _find_run_by_idempotency_key(
        conn,
        tenant_id=request.tenant_id,
        idempotency_key=idempotency_key,
    )
    if existing is not None:
        return CandidateGenerationRunCreation(run=existing, plan=plan, created=False)

    if not _claim_generation_quota(request.tenant_id):
        return CandidateGenerationRunCreation(
            run=None,
            plan=None,
            created=False,
            skip_reason="tenant_quota_exceeded",
        )

    run = _insert_candidate_generation_run(
        conn,
        request=request,
        snapshot=snapshot,
        plan=plan,
        idempotency_key=idempotency_key,
    )
    if run is not None:
        return CandidateGenerationRunCreation(run=run, plan=plan, created=True)

    # Either the profile changed between our read and insert or another
    # request won the idempotency race. Recheck the scoped durable row first.
    existing = _find_run_by_idempotency_key(
        conn,
        tenant_id=request.tenant_id,
        idempotency_key=idempotency_key,
    )
    if existing is not None:
        return CandidateGenerationRunCreation(run=existing, plan=plan, created=False)
    return CandidateGenerationRunCreation(
        run=None,
        plan=None,
        created=False,
        skip_reason="targeting_profile_changed",
    )


def create_candidate_generation_run(
    request: CandidateGenerationStartRequest,
    *,
    engine: Engine | None = None,
    limits: OfficialSiteGenerationLimits = DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS,
) -> CandidateGenerationRunCreation:
    """Create an idempotent run before a worker message is published.

    ``feature_disabled`` is returned rather than raising so callers cannot
    mistake a disabled deployment for an empty target list. The feature flag is
    deliberately off by default and no queue side effect occurs here.
    """

    if not isinstance(request, CandidateGenerationStartRequest):
        raise ValueError("request must be a CandidateGenerationStartRequest")
    if not isinstance(limits, OfficialSiteGenerationLimits):
        raise ValueError("limits must be an OfficialSiteGenerationLimits")
    if not candidate_generation_is_enabled():
        return CandidateGenerationRunCreation(
            run=None,
            plan=None,
            created=False,
            skip_reason="feature_disabled",
        )

    resolved_engine = engine or _database_engine()
    with resolved_engine.begin() as conn:
        return _create_candidate_generation_run_with_connection(
            conn,
            request,
            limits=limits,
        )


def claim_candidate_generation_run(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: str,
    claim_token: str | None = None,
    lease_seconds: int | None = None,
) -> CandidateGenerationRun | None:
    """Atomically own one queued or expired candidate-generation run.

    A token is required for every later heartbeat, write, and terminal update.
    That means a worker which lost its lease cannot overwrite a reclaimed run.
    """

    tenant = _required_string(tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS)
    normalized_run_id = _uuid(run_id, field_name="run_id")
    token = _uuid(claim_token or str(uuid4()), field_name="claim_token")
    lease = lease_seconds if lease_seconds is not None else candidate_generation_lease_seconds()
    lease = _bounded_int(
        lease,
        field_name="lease_seconds",
        minimum=30,
        maximum=MAX_CANDIDATE_GENERATION_LEASE_SECONDS,
    )

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
               AND run.run_kind = 'candidate_generation'
               AND (
                    run.status = 'queued'
                    OR (
                        run.status = 'running'
                        AND run.lease_expires_at < NOW()
                    )
               )
            RETURNING run.id,
                      run.tenant_id,
                      run.service_profile_id,
                      run.targeting_profile_id,
                      run.targeting_profile_version,
                      run.status,
                      run.candidate_limit,
                      run.plan_fingerprint,
                      run.attempt_count,
                      run.claim_token
            """
        ),
        {
            "tenant_id": tenant,
            "run_id": normalized_run_id,
            "claim_token": token,
            "lease_seconds": lease,
        },
    ).mappings().one_or_none()
    return _run_from_row(row) if row else None


def heartbeat_candidate_generation_run(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: str,
    claim_token: str,
    lease_seconds: int | None = None,
) -> bool:
    """Extend a current claim only while it still belongs to this worker."""

    tenant = _required_string(tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS)
    normalized_run_id = _uuid(run_id, field_name="run_id")
    token = _uuid(claim_token, field_name="claim_token")
    lease = lease_seconds if lease_seconds is not None else candidate_generation_lease_seconds()
    lease = _bounded_int(
        lease,
        field_name="lease_seconds",
        minimum=30,
        maximum=MAX_CANDIDATE_GENERATION_LEASE_SECONDS,
    )
    row = conn.execute(
        text(
            """
            UPDATE public.prospect_research_runs AS run
               SET lease_expires_at = NOW() + make_interval(secs => :lease_seconds),
                   last_heartbeat_at = NOW(),
                   updated_at = NOW()
             WHERE run.id = CAST(:run_id AS uuid)
               AND run.tenant_id = :tenant_id
               AND run.run_kind = 'candidate_generation'
               AND run.status = 'running'
               AND run.claim_token = CAST(:claim_token AS uuid)
               AND run.lease_expires_at >= NOW()
            RETURNING run.id
            """
        ),
        {
            "tenant_id": tenant,
            "run_id": normalized_run_id,
            "claim_token": token,
            "lease_seconds": lease,
        },
    ).scalar_one_or_none()
    return bool(row)


def release_candidate_generation_run_for_retry(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: str,
    claim_token: str,
    error_code: str = "candidate_generation_retryable_failure",
) -> bool:
    """Return a live claim to the queue after an unexpected retryable error.

    A worker must not leave its own unexpired lease in ``running`` and then
    raise: Dramatiq would retry the message while the retry could not claim the
    run.  This compare-and-set release makes the next delivery immediately
    eligible while preserving the immutable plan and incremented attempt count.
    """

    tenant = _required_string(tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS)
    normalized_run_id = _uuid(run_id, field_name="run_id")
    token = _uuid(claim_token, field_name="claim_token")
    normalized_error_code = _safe_reason_code(error_code)
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
               AND run.run_kind = 'candidate_generation'
               AND run.status = 'running'
               AND run.claim_token = CAST(:claim_token AS uuid)
               AND run.lease_expires_at >= NOW()
            RETURNING run.id
            """
        ),
        {
            "tenant_id": tenant,
            "run_id": normalized_run_id,
            "claim_token": token,
            "error_code": normalized_error_code,
        },
    ).scalar_one_or_none()
    return bool(row)


def current_targeting_profile_for_claim(
    conn: Connection,
    run: CandidateGenerationRun,
) -> ApprovedTargetingProfileSnapshot | None:
    """Return a current profile only if it matches the run's pinned revision."""

    snapshot = _load_approved_targeting_profile(
        conn,
        tenant_id=run.tenant_id,
        service_profile_id=run.service_profile_id,
        targeting_profile_id=run.targeting_profile_id,
    )
    if snapshot is None or snapshot.profile_version != run.targeting_profile_version:
        return None
    return snapshot


def current_candidate_generation_plan_for_claim(
    conn: Connection,
    run: CandidateGenerationRun,
    *,
    limits: OfficialSiteGenerationLimits = DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS,
) -> OfficialSiteGenerationRunPlan | None:
    """Reload and verify the exact bounded plan pinned on a claimed run.

    The version check is the normal stale-brief guard. Recomputing the opaque
    fingerprint also protects against an out-of-band database edit that failed
    to advance ``profile_version``.
    """

    if not isinstance(limits, OfficialSiteGenerationLimits):
        raise ValueError("limits must be an OfficialSiteGenerationLimits")
    snapshot = current_targeting_profile_for_claim(conn, run)
    if snapshot is None or not snapshot.targeting_profile.seed_urls:
        return None
    plan = plan_official_site_generation(
        OfficialSiteGenerationRequest(
            tenant_id=run.tenant_id,
            service_profile_id=run.service_profile_id,
            targeting_profile_id=run.targeting_profile_id,
            profile_version=str(run.targeting_profile_version),
            target_types=snapshot.targeting_profile.target_types,
            seed_urls=snapshot.targeting_profile.seed_urls,
            explicit_request=True,
        ),
        limits=limits,
    )
    if (
        plan.input_fingerprint != run.plan_fingerprint
        or plan.planned_candidate_limit != run.candidate_limit
    ):
        return None
    return plan


def complete_candidate_generation_run(
    conn: Connection,
    *,
    tenant_id: str,
    run_id: str,
    claim_token: str,
    status: CandidateGenerationTerminalStatus,
    summary: Mapping[str, Any],
    error_code: str | None = None,
) -> bool:
    """Terminalize a claimed run without permitting stale-worker completion."""

    normalized_status = _required_string(status, field_name="status", maximum=24).casefold()
    if normalized_status not in _TERMINAL_STATUSES:
        raise ValueError("status must be a candidate-generation terminal status")
    normalized_error_code = None
    if error_code is not None:
        normalized_error_code = _safe_reason_code(error_code)
    sanitized_summary = sanitize_candidate_generation_summary(summary)
    tenant = _required_string(tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS)
    normalized_run_id = _uuid(run_id, field_name="run_id")
    token = _uuid(claim_token, field_name="claim_token")
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
               AND run.run_kind = 'candidate_generation'
               AND run.status = 'running'
               AND run.claim_token = CAST(:claim_token AS uuid)
               AND run.lease_expires_at >= NOW()
            RETURNING run.id
            """
        ),
        {
            "tenant_id": tenant,
            "run_id": normalized_run_id,
            "claim_token": token,
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
    "ApprovedTargetingProfileSnapshot",
    "CANDIDATE_GENERATION_FLAG",
    "CandidateGenerationRun",
    "CandidateGenerationRunCreation",
    "CandidateGenerationStartRequest",
    "candidate_generation_idempotency_key",
    "candidate_generation_is_enabled",
    "candidate_generation_lease_seconds",
    "candidate_generation_plan_summary",
    "claim_candidate_generation_run",
    "complete_candidate_generation_run",
    "create_candidate_generation_run",
    "current_candidate_generation_plan_for_claim",
    "current_targeting_profile_for_claim",
    "heartbeat_candidate_generation_run",
    "release_candidate_generation_run_for_retry",
    "sanitize_candidate_generation_summary",
]
