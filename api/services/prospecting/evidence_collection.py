"""Pure request, plan, and telemetry contracts for retained-public evidence.

This module has no database or network I/O. Durable creation and leases live
in ``evidence_run_lifecycle`` so an explicit selection cannot become an
implicit crawling surface.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from api.services.cost_controls import TenantQuotaGuard, env_int

from .entity_first import (
    ASSESSMENT_STATES,
    ENTITY_KINDS,
    ORIGIN_KINDS,
    AssessmentState,
    EntityKind,
    OriginKind,
    TargetingProfileInput,
    normalize_public_url,
)
from .research_policy import (
    DEFAULT_EVIDENCE_RESEARCH_LIMITS,
    EntityEvidenceResearchPlan,
    EntityEvidenceResearchRequest,
    EvidenceResearchLimits,
    plan_evidence_research_run,
)


RETAINED_PUBLIC_EVIDENCE_RESEARCH_FLAG = "ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_ENABLED"
DEFAULT_RETAINED_PUBLIC_EVIDENCE_TENANT_LIMIT = 10
DEFAULT_RETAINED_PUBLIC_EVIDENCE_TENANT_WINDOW_SECONDS = 86_400
DEFAULT_RETAINED_PUBLIC_EVIDENCE_MONITORING_TENANT_LIMIT = 5
DEFAULT_RETAINED_PUBLIC_EVIDENCE_MONITORING_TENANT_WINDOW_SECONDS = 86_400
DEFAULT_RETAINED_PUBLIC_EVIDENCE_LEASE_SECONDS = 90
MAX_RETAINED_PUBLIC_EVIDENCE_LEASE_SECONDS = 900
MAX_TENANT_ID_CHARS = 120
MAX_REQUEST_NONCE_CHARS = 128
MAX_SUMMARY_REASON_CODES = 16
MAX_SUMMARY_COUNT = 1_000_000

EvidenceCollectionRunStatus = Literal[
    "queued", "running", "completed", "partial", "failed", "cancelled", "skipped"
]
EvidenceCollectionTerminalStatus = Literal["completed", "partial", "failed", "cancelled", "skipped"]
EvidenceCollectionQuotaScope = Literal["explicit", "monitoring"]
EvidenceCollectionSkipReason = Literal[
    "feature_disabled",
    "tenant_quota_exceeded",
    "targeting_profile_unavailable",
    "targeting_profile_changed",
    "target_not_available",
    "no_planned_targets",
]

_RUN_STATUSES = frozenset({"queued", "running", "completed", "partial", "failed", "cancelled", "skipped"})
_SAFE_REASON_CODE = re.compile(r"^[a-z0-9_:-]{1,120}$")
_SUMMARY_COUNT_KEYS = frozenset(
    {
        "planned_entity_count",
        "planned_evidence_limit",
        "retained_records_scanned",
        "pending_evidence_proposals",
        "evidence_created",
        "evidence_existing",
        "entities_without_supported_locator",
        "entities_rejected_since_request",
    }
)


def _required_string(value: Any, *, field_name: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    normalized = value.strip()
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


def _bounded_int(value: Any, *, field_name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field_name} must be an integer")
    if not minimum <= value <= maximum:
        raise ValueError(f"{field_name} must be between {minimum} and {maximum}")
    return value


def _profile_version(value: Any) -> int:
    return _bounded_int(value, field_name="targeting_profile_version", minimum=1, maximum=1_000_000)


def _safe_reason_code(value: Any) -> str:
    normalized = _required_string(value, field_name="reason code", maximum=120).casefold()
    if not _SAFE_REASON_CODE.fullmatch(normalized):
        raise ValueError("reason code is invalid")
    return normalized


def _json_sequence(value: Any, *, field_name: str) -> list[Any]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError(f"{field_name} is not valid JSON") from error
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be a list")
    return value


def retained_public_evidence_research_is_enabled() -> bool:
    return os.getenv(RETAINED_PUBLIC_EVIDENCE_RESEARCH_FLAG, "false").strip().casefold() in {
        "1", "true", "yes", "on"
    }


def retained_public_evidence_lease_seconds() -> int:
    configured = env_int(
        "ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_LEASE_SECONDS",
        DEFAULT_RETAINED_PUBLIC_EVIDENCE_LEASE_SECONDS,
    )
    return max(30, min(MAX_RETAINED_PUBLIC_EVIDENCE_LEASE_SECONDS, configured))


def _claim_research_quota(
    tenant_id: str,
    quota_scope: EvidenceCollectionQuotaScope = "explicit",
) -> bool:
    """Reserve separate bounded budgets for manual requests and opted-in watches."""

    if quota_scope == "monitoring":
        counter_name = "retained_public_evidence_monitoring"
        limit_name = "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_TENANT_LIMIT"
        default_limit = DEFAULT_RETAINED_PUBLIC_EVIDENCE_MONITORING_TENANT_LIMIT
        window_name = "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_TENANT_WINDOW_SECONDS"
        default_window = DEFAULT_RETAINED_PUBLIC_EVIDENCE_MONITORING_TENANT_WINDOW_SECONDS
    else:
        counter_name = "retained_public_evidence_research"
        limit_name = "ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_TENANT_LIMIT"
        default_limit = DEFAULT_RETAINED_PUBLIC_EVIDENCE_TENANT_LIMIT
        window_name = "ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_TENANT_WINDOW_SECONDS"
        default_window = DEFAULT_RETAINED_PUBLIC_EVIDENCE_TENANT_WINDOW_SECONDS
    return TenantQuotaGuard().check_and_increment(
        tenant_id=tenant_id,
        counter_name=counter_name,
        limit=env_int(limit_name, default_limit),
        window_seconds=env_int(window_name, default_window),
    ).allowed


def _normalized_entity_ids(values: Sequence[str]) -> tuple[str, ...]:
    if isinstance(values, (str, bytes, bytearray)):
        raise ValueError("prospect_entity_ids must be a list")
    normalized = sorted({_uuid(value, field_name="prospect_entity_id") for value in values})
    if not normalized:
        raise ValueError("prospect_entity_ids must not be empty")
    if len(normalized) > DEFAULT_EVIDENCE_RESEARCH_LIMITS.entity_limit:
        raise ValueError(f"prospect_entity_ids exceeds {DEFAULT_EVIDENCE_RESEARCH_LIMITS.entity_limit} items")
    return tuple(normalized)


@dataclass(frozen=True)
class EvidenceCollectionStartRequest:
    tenant_id: str
    service_profile_id: str
    prospect_entity_ids: Sequence[str]
    request_nonce: str
    # A trusted monitor has its own small quota so it cannot consume the
    # customer's explicit evidence-research budget. Browser and API triggers
    # use the default and cannot choose this internal scope.
    quota_scope: EvidenceCollectionQuotaScope = "explicit"

    def __post_init__(self) -> None:
        object.__setattr__(self, "tenant_id", _required_string(self.tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS))
        object.__setattr__(self, "service_profile_id", _uuid(self.service_profile_id, field_name="service_profile_id"))
        object.__setattr__(self, "prospect_entity_ids", _normalized_entity_ids(self.prospect_entity_ids))
        object.__setattr__(self, "request_nonce", _required_string(self.request_nonce, field_name="request_nonce", maximum=MAX_REQUEST_NONCE_CHARS))
        scope = _required_string(
            self.quota_scope,
            field_name="quota_scope",
            maximum=32,
        ).casefold()
        if scope not in {"explicit", "monitoring"}:
            raise ValueError("quota_scope is invalid")
        object.__setattr__(self, "quota_scope", scope)


@dataclass(frozen=True)
class ApprovedEvidenceTargetingProfileSnapshot:
    id: str
    tenant_id: str
    service_profile_id: str
    profile_version: int
    strong_evidence_definitions: Sequence[str] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", _uuid(self.id, field_name="targeting_profile_id"))
        object.__setattr__(self, "tenant_id", _required_string(self.tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS))
        object.__setattr__(self, "service_profile_id", _uuid(self.service_profile_id, field_name="service_profile_id"))
        object.__setattr__(self, "profile_version", _profile_version(self.profile_version))
        try:
            # Reuse the primary brief boundary so this executor never accepts
            # a broader or contact-bearing evidence definition than the saved
            # targeting profile allows. The target type is a validation shim;
            # it is not used for evidence selection.
            definitions = TargetingProfileInput(
                target_types=("account",),
                strong_evidence_definitions=self.strong_evidence_definitions,
            ).strong_evidence_definitions
        except ValueError as error:
            raise ValueError("strong_evidence_definitions is invalid") from error
        object.__setattr__(self, "strong_evidence_definitions", definitions)


@dataclass(frozen=True)
class EvidenceCollectionTargetSnapshot:
    """Minimal selected-target identity; no social identity or source content."""

    entity_id: str
    entity_kind: EntityKind
    origin_kind: OriginKind
    assessment_state: AssessmentState
    canonical_url: str
    current_assessment_state: AssessmentState | None = None

    def __post_init__(self) -> None:
        entity_kind = _required_string(self.entity_kind, field_name="entity_kind", maximum=32).casefold()
        origin_kind = _required_string(self.origin_kind, field_name="origin_kind", maximum=32).casefold()
        assessment_state = _required_string(self.assessment_state, field_name="assessment_state", maximum=32).casefold()
        current_state = _required_string(self.current_assessment_state or assessment_state, field_name="current_assessment_state", maximum=32).casefold()
        if entity_kind not in ENTITY_KINDS:
            raise ValueError("unsupported entity_kind")
        if origin_kind not in ORIGIN_KINDS:
            raise ValueError("unsupported origin_kind")
        if assessment_state not in ASSESSMENT_STATES or current_state not in ASSESSMENT_STATES:
            raise ValueError("unsupported assessment_state")
        object.__setattr__(self, "entity_id", _uuid(self.entity_id, field_name="prospect_entity_id"))
        object.__setattr__(self, "entity_kind", entity_kind)
        object.__setattr__(self, "origin_kind", origin_kind)
        object.__setattr__(self, "assessment_state", assessment_state)
        object.__setattr__(self, "current_assessment_state", current_state)
        object.__setattr__(self, "canonical_url", normalize_public_url(self.canonical_url))

    @property
    def rejected_since_request(self) -> bool:
        return self.current_assessment_state == "rejected"


@dataclass(frozen=True)
class EvidenceCollectionTargetPlan:
    target: EvidenceCollectionTargetSnapshot
    plan: EntityEvidenceResearchPlan

    def __post_init__(self) -> None:
        if not isinstance(self.target, EvidenceCollectionTargetSnapshot):
            raise ValueError("target must be an EvidenceCollectionTargetSnapshot")
        if not isinstance(self.plan, EntityEvidenceResearchPlan) or not self.plan.is_planned:
            raise ValueError("plan must be a planned EntityEvidenceResearchPlan")
        if self.plan.entity_id != self.target.entity_id:
            raise ValueError("target and plan entity IDs must match")


@dataclass(frozen=True)
class EvidenceCollectionRunPlan:
    targeting_profile_id: str
    targeting_profile_version: int
    target_plans: tuple[EvidenceCollectionTargetPlan, ...]
    entity_limit: int
    evidence_limit_total: int
    input_fingerprint: str
    # This is a policy snapshot used only while a pinned, approved brief is
    # current. The durable run stores its digest, never these phrases.
    strong_evidence_definitions: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "targeting_profile_id", _uuid(self.targeting_profile_id, field_name="targeting_profile_id"))
        object.__setattr__(self, "targeting_profile_version", _profile_version(self.targeting_profile_version))
        if not self.target_plans or len(self.target_plans) > DEFAULT_EVIDENCE_RESEARCH_LIMITS.entity_limit:
            raise ValueError("target_plans is outside the evidence-research entity cap")
        if any(not isinstance(item, EvidenceCollectionTargetPlan) for item in self.target_plans):
            raise ValueError("target_plans must contain EvidenceCollectionTargetPlan values")
        entity_ids = [item.target.entity_id for item in self.target_plans]
        if len(entity_ids) != len(set(entity_ids)):
            raise ValueError("target_plans must have unique entity IDs")
        object.__setattr__(self, "entity_limit", _bounded_int(self.entity_limit, field_name="entity_limit", minimum=1, maximum=100))
        object.__setattr__(self, "evidence_limit_total", _bounded_int(self.evidence_limit_total, field_name="evidence_limit_total", minimum=1, maximum=DEFAULT_EVIDENCE_RESEARCH_LIMITS.evidence_limit_total))
        if len(self.target_plans) > self.entity_limit:
            raise ValueError("target_plans exceeds entity_limit")
        if sum(item.plan.evidence_limit for item in self.target_plans) > self.evidence_limit_total:
            raise ValueError("target plans exceed evidence_limit_total")
        fingerprint = _required_string(self.input_fingerprint, field_name="input_fingerprint", maximum=64).casefold()
        if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
            raise ValueError("input_fingerprint must be a SHA-256 digest")
        object.__setattr__(self, "input_fingerprint", fingerprint)
        try:
            definitions = TargetingProfileInput(
                target_types=("account",),
                strong_evidence_definitions=self.strong_evidence_definitions,
            ).strong_evidence_definitions
        except ValueError as error:
            raise ValueError("strong_evidence_definitions is invalid") from error
        object.__setattr__(self, "strong_evidence_definitions", definitions)

    @property
    def planned_entity_count(self) -> int:
        return len(self.target_plans)

    @property
    def planned_evidence_limit(self) -> int:
        return sum(item.plan.evidence_limit for item in self.target_plans)


@dataclass(frozen=True)
class EvidenceCollectionRun:
    id: str
    tenant_id: str
    service_profile_id: str
    targeting_profile_id: str
    targeting_profile_version: int
    status: EvidenceCollectionRunStatus
    entity_limit: int
    evidence_limit_per_entity: int
    plan_fingerprint: str
    attempt_count: int
    claim_token: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", _uuid(self.id, field_name="run_id"))
        object.__setattr__(self, "tenant_id", _required_string(self.tenant_id, field_name="tenant_id", maximum=MAX_TENANT_ID_CHARS))
        object.__setattr__(self, "service_profile_id", _uuid(self.service_profile_id, field_name="service_profile_id"))
        object.__setattr__(self, "targeting_profile_id", _uuid(self.targeting_profile_id, field_name="targeting_profile_id"))
        object.__setattr__(self, "targeting_profile_version", _profile_version(self.targeting_profile_version))
        status = _required_string(self.status, field_name="status", maximum=24).casefold()
        if status not in _RUN_STATUSES:
            raise ValueError(f"unsupported evidence-collection status: {status}")
        object.__setattr__(self, "status", status)
        object.__setattr__(self, "entity_limit", _bounded_int(self.entity_limit, field_name="entity_limit", minimum=1, maximum=100))
        object.__setattr__(self, "evidence_limit_per_entity", _bounded_int(self.evidence_limit_per_entity, field_name="evidence_limit_per_entity", minimum=1, maximum=25))
        fingerprint = _required_string(self.plan_fingerprint, field_name="plan_fingerprint", maximum=64).casefold()
        if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
            raise ValueError("plan_fingerprint must be a SHA-256 digest")
        object.__setattr__(self, "plan_fingerprint", fingerprint)
        object.__setattr__(self, "attempt_count", _bounded_int(self.attempt_count, field_name="attempt_count", minimum=0, maximum=100))
        object.__setattr__(self, "claim_token", _uuid(self.claim_token, field_name="claim_token") if self.claim_token is not None else None)


@dataclass(frozen=True)
class EvidenceCollectionRunCreation:
    run: EvidenceCollectionRun | None
    plan: EvidenceCollectionRunPlan | None
    created: bool
    skip_reason: EvidenceCollectionSkipReason | None = None

    def __post_init__(self) -> None:
        if self.run is None and self.plan is not None:
            raise ValueError("a skipped collection result cannot include a plan")
        # A replay after a customer changes their thesis returns the original
        # durable row without recomputing a scope under the new brief.
        if self.run is not None and self.plan is None and self.created:
            raise ValueError("a newly created collection run requires a plan")
        if self.run is None and self.skip_reason is None:
            raise ValueError("a skipped collection result needs a skip_reason")
        if self.run is not None and self.skip_reason is not None:
            raise ValueError("a durable collection result cannot include a skip_reason")


def _fingerprint_material(
    snapshot: ApprovedEvidenceTargetingProfileSnapshot,
    target_plans: Sequence[EvidenceCollectionTargetPlan],
) -> dict[str, object]:
    material: dict[str, object] = {
        "contract": "retained-public-evidence-collection-v1",
        "targeting_profile_id": snapshot.id,
        "targeting_profile_version": snapshot.profile_version,
        "planned_entity_count": len(target_plans),
        "planned_evidence_limit": sum(item.plan.evidence_limit for item in target_plans),
        "targets": [
            {
                "entity_id": item.target.entity_id,
                "entity_kind": item.target.entity_kind,
                "origin_kind": item.target.origin_kind,
                "assessment_state": item.target.assessment_state,
                "public_sources": list(item.plan.public_sources),
                "evidence_limit": item.plan.evidence_limit,
                "source_result_limit": item.plan.source_result_limit_per_entity,
                "thread_context_item_limit": item.plan.thread_context_item_limit,
                "thread_context_char_limit": item.plan.thread_context_char_limit,
            }
            for item in target_plans
        ],
    }
    # Preserve hashes for already-queued v1 runs with no custom definitions.
    # Once a customer adds a definition, the policy must be pinned in the run
    # digest so an edit cannot silently change its evidence-strength rule.
    if snapshot.strong_evidence_definitions:
        material["strong_evidence_definitions"] = list(
            snapshot.strong_evidence_definitions
        )
    return material


def _plan_fingerprint(
    snapshot: ApprovedEvidenceTargetingProfileSnapshot,
    target_plans: Sequence[EvidenceCollectionTargetPlan],
) -> str:
    encoded = json.dumps(
        _fingerprint_material(snapshot, target_plans),
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def plan_evidence_collection(
    snapshot: ApprovedEvidenceTargetingProfileSnapshot,
    targets: Sequence[EvidenceCollectionTargetSnapshot],
    *,
    limits: EvidenceResearchLimits = DEFAULT_EVIDENCE_RESEARCH_LIMITS,
) -> EvidenceCollectionRunPlan | None:
    """Plan only explicit active targets, without database or source I/O."""

    if not isinstance(snapshot, ApprovedEvidenceTargetingProfileSnapshot):
        raise ValueError("snapshot must be an ApprovedEvidenceTargetingProfileSnapshot")
    if not isinstance(limits, EvidenceResearchLimits):
        raise ValueError("limits must be an EvidenceResearchLimits")
    if isinstance(targets, (str, bytes, bytearray)) or len(targets) > limits.entity_limit:
        raise ValueError("targets is outside the evidence-research entity limit")
    by_entity_id: dict[str, EvidenceCollectionTargetSnapshot] = {}
    requests: list[EntityEvidenceResearchRequest] = []
    for target in sorted(
        targets,
        key=lambda item: item.entity_id if isinstance(item, EvidenceCollectionTargetSnapshot) else "",
    ):
        if not isinstance(target, EvidenceCollectionTargetSnapshot):
            raise ValueError("targets must contain EvidenceCollectionTargetSnapshot values")
        if target.entity_id in by_entity_id:
            raise ValueError("targets must have unique entity IDs")
        by_entity_id[target.entity_id] = target
        requests.append(
            EntityEvidenceResearchRequest(
                entity_id=target.entity_id,
                entity_kind=target.entity_kind,
                origin_kind=target.origin_kind,
                assessment_state=target.assessment_state,
                explicit_request=True,
            )
        )
    policy_plan = plan_evidence_research_run(requests, limits=limits)
    target_plans = tuple(
        EvidenceCollectionTargetPlan(by_entity_id[item.entity_id], item)
        for item in policy_plan.entity_plans
        if item.is_planned
    )
    if not target_plans:
        return None
    return EvidenceCollectionRunPlan(
        targeting_profile_id=snapshot.id,
        targeting_profile_version=snapshot.profile_version,
        target_plans=target_plans,
        entity_limit=len(target_plans),
        evidence_limit_total=policy_plan.planned_evidence_limit,
        input_fingerprint=_plan_fingerprint(snapshot, target_plans),
        strong_evidence_definitions=snapshot.strong_evidence_definitions,
    )


def evidence_collection_idempotency_key(request: EvidenceCollectionStartRequest) -> str:
    """A reused nonce resolves the original durable operation, never new scope."""

    material = "\x1f".join(
        ("retained-public-evidence-collection-v1", request.tenant_id, request.service_profile_id, request.request_nonce)
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def evidence_collection_plan_summary(plan: EvidenceCollectionRunPlan) -> dict[str, int | str]:
    return {
        "profile_version": plan.targeting_profile_version,
        "plan_fingerprint": plan.input_fingerprint,
        "planned_entity_count": plan.planned_entity_count,
        "planned_evidence_limit": plan.planned_evidence_limit,
    }


def sanitize_evidence_collection_summary(summary: Mapping[str, Any]) -> dict[str, Any]:
    """Keep source bodies, URLs, handles, and query text out of telemetry."""

    if not isinstance(summary, Mapping):
        raise ValueError("summary must be a mapping")
    sanitized: dict[str, Any] = {}
    for key in _SUMMARY_COUNT_KEYS:
        if key in summary:
            sanitized[key] = _bounded_int(
                summary[key], field_name=key, minimum=0, maximum=MAX_SUMMARY_COUNT
            )
    if "profile_version" in summary:
        sanitized["profile_version"] = _profile_version(summary["profile_version"])
    if "plan_fingerprint" in summary:
        fingerprint = _required_string(
            summary["plan_fingerprint"], field_name="plan_fingerprint", maximum=64
        ).casefold()
        if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
            raise ValueError("plan_fingerprint must be a SHA-256 digest")
        sanitized["plan_fingerprint"] = fingerprint
    for key in ("skip_reason", "failure_reason"):
        if key in summary:
            sanitized[key] = _safe_reason_code(summary[key])
    if "skipped_by_reason" in summary:
        raw_reasons = summary["skipped_by_reason"]
        if not isinstance(raw_reasons, Mapping):
            raise ValueError("skipped_by_reason must be a mapping")
        if len(raw_reasons) > MAX_SUMMARY_REASON_CODES:
            raise ValueError("skipped_by_reason exceeds the reason-code limit")
        sanitized["skipped_by_reason"] = {
            _safe_reason_code(reason): _bounded_int(
                count,
                field_name="skipped_by_reason count",
                minimum=0,
                maximum=MAX_SUMMARY_COUNT,
            )
            for reason, count in raw_reasons.items()
        }
    return sanitized


__all__ = [
    "ApprovedEvidenceTargetingProfileSnapshot",
    "DEFAULT_RETAINED_PUBLIC_EVIDENCE_LEASE_SECONDS",
    "EvidenceCollectionRun",
    "EvidenceCollectionRunCreation",
    "EvidenceCollectionRunPlan",
    "EvidenceCollectionStartRequest",
    "EvidenceCollectionTargetPlan",
    "EvidenceCollectionTargetSnapshot",
    "RETAINED_PUBLIC_EVIDENCE_RESEARCH_FLAG",
    "evidence_collection_idempotency_key",
    "evidence_collection_plan_summary",
    "plan_evidence_collection",
    "retained_public_evidence_lease_seconds",
    "retained_public_evidence_research_is_enabled",
    "sanitize_evidence_collection_summary",
]
