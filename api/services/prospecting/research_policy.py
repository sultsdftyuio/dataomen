"""Declarative safety policy for entity-first public-evidence research.

This module deliberately plans bounded work without performing any I/O.  A
future queue worker must explicitly receive a plan before it queries an
approved public-source connector.  In particular, adding a manual account,
builder, or project can never turn into a website crawl or an author's posting
history crawl merely by passing through this policy.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Literal
from uuid import UUID

from .entity_first import (
    ASSESSMENT_STATES,
    ENTITY_KINDS,
    ORIGIN_KINDS,
    AssessmentState,
    EntityKind,
    OriginKind,
)


PublicEvidenceSource = Literal[
    "hackernews",
    "bluesky",
    "stackexchange",
    "github",
    "lemmy",
]
QueryIntent = Literal[
    "fit_validation",
    "change_trigger",
    "problem_validation",
    "evaluation_validation",
    "evidence_refresh",
]
ResearchPlanDecision = Literal["planned", "skipped"]
ResearchSkipReason = Literal[
    "duplicate_entity",
    "entity_limit_reached",
    "manual_target_requires_explicit_research_request",
    "rejected_target",
    "research_not_explicitly_requested",
]


# X/Twitter is intentionally excluded. Its existing connector is a separately
# budgeted fallback, and this policy must not quietly authorize paid retrieval.
SUPPORTED_PUBLIC_EVIDENCE_SOURCES: tuple[PublicEvidenceSource, ...] = (
    "hackernews",
    "bluesky",
    "stackexchange",
    "github",
    "lemmy",
)
DEFAULT_PUBLIC_EVIDENCE_SOURCES = SUPPORTED_PUBLIC_EVIDENCE_SOURCES

# These are deliberately tighter than the schema's hard ceiling. They bound a
# single enrichment action; a future scheduler can create another explicit run
# after a user or trusted policy asks for it.
MAX_ENTITIES_PER_RUN = 25
MAX_EVIDENCE_PER_ENTITY = 8
MAX_EVIDENCE_PER_RUN = 50
MAX_SOURCE_RESULTS_PER_ENTITY = 10
MAX_THREAD_CONTEXT_ITEMS = 6
MAX_THREAD_CONTEXT_CHARS = 6_000
MAX_REQUESTS_PER_PLAN = 100

_ACTIVE_ASSESSMENT_STATES: tuple[AssessmentState, ...] = (
    "high_fit",
    "triggered",
    "signal_backed",
    "strong_buyer_signal",
)
_QUERY_INTENTS_BY_STATE: dict[AssessmentState, tuple[QueryIntent, ...]] = {
    "high_fit": ("fit_validation", "change_trigger"),
    "triggered": ("problem_validation", "evaluation_validation"),
    "signal_backed": ("evaluation_validation",),
    "strong_buyer_signal": ("evidence_refresh",),
    "rejected": (),
}


def _bounded_int(value: int, *, field_name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field_name} must be an integer")
    if not minimum <= value <= maximum:
        raise ValueError(f"{field_name} must be between {minimum} and {maximum}")
    return value


def _normalized_identifier(
    value: str,
    *,
    field_name: str,
    allowed: frozenset[str],
) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    normalized = value.strip().casefold()
    if normalized not in allowed:
        raise ValueError(f"unsupported {field_name}: {normalized}")
    return normalized


def _normalized_entity_id(value: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError("entity_id must be a UUID") from error


def _normalized_sources(values: Sequence[str] | None) -> tuple[PublicEvidenceSource, ...]:
    if values is None:
        return DEFAULT_PUBLIC_EVIDENCE_SOURCES
    if isinstance(values, (str, bytes, bytearray)):
        raise ValueError("public_sources must be a list")
    if len(values) > len(SUPPORTED_PUBLIC_EVIDENCE_SOURCES):
        raise ValueError(
            f"public_sources exceeds {len(SUPPORTED_PUBLIC_EVIDENCE_SOURCES)} sources"
        )

    requested: set[str] = set()
    for value in values:
        if not isinstance(value, str):
            raise ValueError("public_sources must contain strings")
        source = value.strip().casefold()
        if source not in SUPPORTED_PUBLIC_EVIDENCE_SOURCES:
            raise ValueError(f"unsupported public evidence source: {source}")
        requested.add(source)
    if not requested:
        raise ValueError("public_sources must not be empty")
    return tuple(source for source in SUPPORTED_PUBLIC_EVIDENCE_SOURCES if source in requested)


@dataclass(frozen=True)
class EvidenceResearchLimits:
    """Hard upper bounds for one explicitly requested evidence-research run."""

    entity_limit: int = MAX_ENTITIES_PER_RUN
    evidence_limit_per_entity: int = MAX_EVIDENCE_PER_ENTITY
    evidence_limit_total: int = MAX_EVIDENCE_PER_RUN
    source_result_limit_per_entity: int = MAX_SOURCE_RESULTS_PER_ENTITY
    thread_context_item_limit: int = 4
    thread_context_char_limit: int = 4_000

    def __post_init__(self) -> None:
        entity_limit = _bounded_int(
            self.entity_limit,
            field_name="entity_limit",
            minimum=1,
            maximum=MAX_ENTITIES_PER_RUN,
        )
        evidence_limit_per_entity = _bounded_int(
            self.evidence_limit_per_entity,
            field_name="evidence_limit_per_entity",
            minimum=1,
            maximum=MAX_EVIDENCE_PER_ENTITY,
        )
        evidence_limit_total = _bounded_int(
            self.evidence_limit_total,
            field_name="evidence_limit_total",
            minimum=entity_limit,
            maximum=MAX_EVIDENCE_PER_RUN,
        )
        if evidence_limit_total > entity_limit * evidence_limit_per_entity:
            raise ValueError(
                "evidence_limit_total cannot exceed entity_limit times evidence_limit_per_entity"
            )

        object.__setattr__(self, "entity_limit", entity_limit)
        object.__setattr__(self, "evidence_limit_per_entity", evidence_limit_per_entity)
        object.__setattr__(self, "evidence_limit_total", evidence_limit_total)
        object.__setattr__(
            self,
            "source_result_limit_per_entity",
            _bounded_int(
                self.source_result_limit_per_entity,
                field_name="source_result_limit_per_entity",
                minimum=1,
                maximum=MAX_SOURCE_RESULTS_PER_ENTITY,
            ),
        )
        object.__setattr__(
            self,
            "thread_context_item_limit",
            _bounded_int(
                self.thread_context_item_limit,
                field_name="thread_context_item_limit",
                minimum=1,
                maximum=MAX_THREAD_CONTEXT_ITEMS,
            ),
        )
        object.__setattr__(
            self,
            "thread_context_char_limit",
            _bounded_int(
                self.thread_context_char_limit,
                field_name="thread_context_char_limit",
                minimum=256,
                maximum=MAX_THREAD_CONTEXT_CHARS,
            ),
        )


DEFAULT_EVIDENCE_RESEARCH_LIMITS = EvidenceResearchLimits()


@dataclass(frozen=True)
class EntityEvidenceResearchRequest:
    """A target selected for public evidence research, not a crawl request.

    The request carries no URL, author handle, query phrase, or contact data.
    A worker resolves the tenant-owned entity only after it has received this
    explicit planning decision and must still enforce source governance.
    """

    entity_id: str
    entity_kind: EntityKind
    origin_kind: OriginKind
    assessment_state: AssessmentState
    explicit_request: bool = False
    public_sources: Sequence[str] | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.explicit_request, bool):
            raise ValueError("explicit_request must be a boolean")
        object.__setattr__(self, "entity_id", _normalized_entity_id(self.entity_id))
        object.__setattr__(
            self,
            "entity_kind",
            _normalized_identifier(
                self.entity_kind,
                field_name="entity_kind",
                allowed=ENTITY_KINDS,
            ),
        )
        object.__setattr__(
            self,
            "origin_kind",
            _normalized_identifier(
                self.origin_kind,
                field_name="origin_kind",
                allowed=ORIGIN_KINDS,
            ),
        )
        object.__setattr__(
            self,
            "assessment_state",
            _normalized_identifier(
                self.assessment_state,
                field_name="assessment_state",
                allowed=ASSESSMENT_STATES,
            ),
        )
        object.__setattr__(self, "public_sources", _normalized_sources(self.public_sources))


@dataclass(frozen=True)
class EntityEvidenceResearchPlan:
    """A per-entity permission boundary for a future public-source worker."""

    entity_id: str
    decision: ResearchPlanDecision
    skip_reason: ResearchSkipReason | None
    query_intents: tuple[QueryIntent, ...]
    permitted_next_states: tuple[AssessmentState, ...]
    public_sources: tuple[PublicEvidenceSource, ...]
    evidence_limit: int
    source_result_limit_per_entity: int
    thread_context_item_limit: int
    thread_context_char_limit: int
    requires_explicit_request: bool = True
    same_public_thread_only: bool = True
    allow_target_url_crawl: bool = False
    # A worker may query already-retained global source rows using an exact,
    # platform-native public author locator (for example a GitHub handle). This
    # is not permission to fetch a profile or enumerate an author's history.
    allow_retained_public_author_locator_search: bool = False
    allow_author_history: bool = False
    allow_private_sources: bool = False

    @property
    def is_planned(self) -> bool:
        return self.decision == "planned"


@dataclass(frozen=True)
class EvidenceResearchRunPlan:
    """The complete bounded plan for one future queue message."""

    entity_plans: tuple[EntityEvidenceResearchPlan, ...]
    entity_limit: int
    evidence_limit_total: int

    @property
    def planned_entity_count(self) -> int:
        return sum(plan.is_planned for plan in self.entity_plans)

    @property
    def planned_evidence_limit(self) -> int:
        return sum(plan.evidence_limit for plan in self.entity_plans if plan.is_planned)


def query_intents_for_assessment_state(
    assessment_state: AssessmentState,
) -> tuple[QueryIntent, ...]:
    """Return abstract research intents without exposing raw query language."""

    state = _normalized_identifier(
        assessment_state,
        field_name="assessment_state",
        allowed=ASSESSMENT_STATES,
    )
    return _QUERY_INTENTS_BY_STATE[state]  # type: ignore[return-value]


def permitted_assessment_transitions(
    assessment_state: AssessmentState,
) -> tuple[AssessmentState, ...]:
    """Return state outcomes that a worker may request evidence for.

    Evidence can become stale or be deleted with its public source, so active
    assessments may move down as well as up.  ``rejected`` is terminal because
    the database contract forbids reopening it in place.
    """

    state = _normalized_identifier(
        assessment_state,
        field_name="assessment_state",
        allowed=ASSESSMENT_STATES,
    )
    if state == "rejected":
        return ("rejected",)
    return (*_ACTIVE_ASSESSMENT_STATES, "rejected")


def _skipped_plan(
    request: EntityEvidenceResearchRequest,
    *,
    reason: ResearchSkipReason,
) -> EntityEvidenceResearchPlan:
    return EntityEvidenceResearchPlan(
        entity_id=request.entity_id,
        decision="skipped",
        skip_reason=reason,
        query_intents=(),
        permitted_next_states=permitted_assessment_transitions(request.assessment_state),
        public_sources=(),
        evidence_limit=0,
        source_result_limit_per_entity=0,
        thread_context_item_limit=0,
        thread_context_char_limit=0,
    )


def plan_entity_evidence_research(
    request: EntityEvidenceResearchRequest,
    *,
    limits: EvidenceResearchLimits = DEFAULT_EVIDENCE_RESEARCH_LIMITS,
) -> EntityEvidenceResearchPlan:
    """Plan one explicit enrichment action without executing it.

    Manual targets are intentionally skipped until a user explicitly requests
    public evidence research.  Other target origins also require an explicit
    request; this function is not an auto-enqueue mechanism.
    """

    if request.assessment_state == "rejected":
        return _skipped_plan(request, reason="rejected_target")
    if not request.explicit_request:
        reason: ResearchSkipReason = (
            "manual_target_requires_explicit_research_request"
            if request.origin_kind == "manual"
            else "research_not_explicitly_requested"
        )
        return _skipped_plan(request, reason=reason)

    return EntityEvidenceResearchPlan(
        entity_id=request.entity_id,
        decision="planned",
        skip_reason=None,
        query_intents=query_intents_for_assessment_state(request.assessment_state),
        permitted_next_states=permitted_assessment_transitions(request.assessment_state),
        public_sources=request.public_sources,
        evidence_limit=min(limits.evidence_limit_per_entity, limits.evidence_limit_total),
        source_result_limit_per_entity=limits.source_result_limit_per_entity,
        thread_context_item_limit=limits.thread_context_item_limit,
        thread_context_char_limit=limits.thread_context_char_limit,
        allow_retained_public_author_locator_search=True,
    )


def _allocated_evidence_limits(
    *,
    plan_count: int,
    limits: EvidenceResearchLimits,
) -> tuple[int, ...]:
    if not plan_count:
        return ()
    available = min(
        limits.evidence_limit_total,
        plan_count * limits.evidence_limit_per_entity,
    )
    base, remainder = divmod(available, plan_count)
    return tuple(
        min(limits.evidence_limit_per_entity, base + (1 if index < remainder else 0))
        for index in range(plan_count)
    )


def plan_evidence_research_run(
    requests: Sequence[EntityEvidenceResearchRequest],
    *,
    limits: EvidenceResearchLimits = DEFAULT_EVIDENCE_RESEARCH_LIMITS,
) -> EvidenceResearchRunPlan:
    """Create a fair, finite plan for a batch of explicitly selected targets."""

    if isinstance(requests, (str, bytes, bytearray)):
        raise ValueError("requests must be a sequence of research requests")
    if len(requests) > MAX_REQUESTS_PER_PLAN:
        raise ValueError(f"requests exceeds {MAX_REQUESTS_PER_PLAN} items")

    entity_plans: list[EntityEvidenceResearchPlan] = []
    planned_indexes: list[int] = []
    seen_entity_ids: set[str] = set()
    for request in requests:
        if not isinstance(request, EntityEvidenceResearchRequest):
            raise ValueError("requests must contain EntityEvidenceResearchRequest values")
        if request.entity_id in seen_entity_ids:
            entity_plans.append(_skipped_plan(request, reason="duplicate_entity"))
            continue
        seen_entity_ids.add(request.entity_id)

        plan = plan_entity_evidence_research(request, limits=limits)
        if plan.is_planned and len(planned_indexes) >= limits.entity_limit:
            plan = _skipped_plan(request, reason="entity_limit_reached")
        elif plan.is_planned:
            planned_indexes.append(len(entity_plans))
        entity_plans.append(plan)

    allocations = _allocated_evidence_limits(
        plan_count=len(planned_indexes),
        limits=limits,
    )
    for index, evidence_limit in zip(planned_indexes, allocations, strict=True):
        entity_plans[index] = replace(entity_plans[index], evidence_limit=evidence_limit)

    return EvidenceResearchRunPlan(
        entity_plans=tuple(entity_plans),
        entity_limit=limits.entity_limit,
        evidence_limit_total=limits.evidence_limit_total,
    )


__all__ = [
    "DEFAULT_EVIDENCE_RESEARCH_LIMITS",
    "DEFAULT_PUBLIC_EVIDENCE_SOURCES",
    "MAX_ENTITIES_PER_RUN",
    "MAX_EVIDENCE_PER_ENTITY",
    "MAX_EVIDENCE_PER_RUN",
    "MAX_REQUESTS_PER_PLAN",
    "MAX_SOURCE_RESULTS_PER_ENTITY",
    "MAX_THREAD_CONTEXT_CHARS",
    "MAX_THREAD_CONTEXT_ITEMS",
    "SUPPORTED_PUBLIC_EVIDENCE_SOURCES",
    "EntityEvidenceResearchPlan",
    "EntityEvidenceResearchRequest",
    "EvidenceResearchLimits",
    "EvidenceResearchRunPlan",
    "permitted_assessment_transitions",
    "plan_entity_evidence_research",
    "plan_evidence_research_run",
    "query_intents_for_assessment_state",
]
