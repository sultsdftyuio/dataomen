"""Bounded, execution-independent plans for official-site target generation.

The planner turns a user-approved targeting-profile snapshot into finite
same-origin scan scopes.  It deliberately does not fetch a URL, enqueue work,
or decide that a raw URL is an account, builder, or project.  An execution
worker must revalidate DNS before every request and may persist an entity only
after official-site content proves one of the allowed target kinds.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from api.services.social.candidate_privacy import collapse_space

from .entity_first import ENTITY_KINDS, EntityKind, normalize_public_url


CandidateGenerationDecision = Literal["planned", "skipped"]
CandidateGenerationSkipReason = Literal[
    "candidate_generation_not_explicitly_requested",
    "duplicate_seed_url",
    "seed_limit_reached",
]
OfficialSitePageCategory = Literal[
    "seed",
    "homepage",
    "pricing",
    "product",
    "features",
    "solutions",
    "customers",
    "integrations",
    "about",
]


# The profile can retain up to 50 sources, while one activation stays tighter
# than the schema's 100-candidate ceiling.  It mirrors the existing six-page
# commercial-site crawl budget rather than introducing a second broad crawler.
MAX_SEED_INPUTS_PER_RUN = 50
MAX_SEEDS_PER_RUN = 12
MAX_PAGES_PER_SEED = 6
MAX_CANDIDATES_PER_SEED = 8
MAX_CANDIDATES_PER_RUN = MAX_SEEDS_PER_RUN * MAX_CANDIDATES_PER_SEED

OFFICIAL_SITE_PAGE_CATEGORIES: tuple[OfficialSitePageCategory, ...] = (
    "seed",
    "homepage",
    "pricing",
    "product",
    "features",
    "solutions",
    "customers",
    "integrations",
    "about",
)


def _required_string(value: Any, *, field_name: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    normalized = collapse_space(value, maximum=maximum)
    if not normalized:
        raise ValueError(f"{field_name} is required")
    return normalized


def _uuid(value: Any, *, field_name: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be a UUID") from error


def _bounded_int(value: int, *, field_name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field_name} must be an integer")
    if not minimum <= value <= maximum:
        raise ValueError(f"{field_name} must be between {minimum} and {maximum}")
    return value


def _normalized_target_types(values: Sequence[str]) -> tuple[EntityKind, ...]:
    if isinstance(values, (str, bytes, bytearray)):
        raise ValueError("target_types must be a list")
    if not values:
        raise ValueError("target_types must not be empty")
    if len(values) > len(ENTITY_KINDS):
        raise ValueError(f"target_types exceeds {len(ENTITY_KINDS)} items")

    normalized: list[EntityKind] = []
    seen: set[str] = set()
    for value in values:
        target_type = _required_string(value, field_name="target_types", maximum=32).casefold()
        if target_type not in ENTITY_KINDS:
            raise ValueError(f"unsupported target type: {target_type}")
        if target_type not in seen:
            seen.add(target_type)
            normalized.append(target_type)  # type: ignore[arg-type]
    if not normalized:
        raise ValueError("target_types must not be empty")
    return tuple(normalized)


def normalize_official_site_seed_url(value: Any) -> str:
    """Return a stable public crawl root without fragment or query variants.

    ``normalize_public_url`` is the shared private-host/credential boundary.
    Query strings are deliberately removed here: they do not identify an
    official site and can create unbounded tracking or session URL variants.
    """

    normalized = normalize_public_url(value)
    parsed = urlsplit(normalized)
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path or "/",
            "",
            "",
        )
    )


def _origin_url(seed_url: str) -> str:
    parsed = urlsplit(seed_url)
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def _fingerprint(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class OfficialSiteGenerationLimits:
    """Hard bounds for one user-requested official-site generation run."""

    seed_limit: int = MAX_SEEDS_PER_RUN
    page_limit_per_seed: int = MAX_PAGES_PER_SEED
    candidate_limit_per_seed: int = MAX_CANDIDATES_PER_SEED
    candidate_limit_total: int = 48

    def __post_init__(self) -> None:
        seed_limit = _bounded_int(
            self.seed_limit,
            field_name="seed_limit",
            minimum=1,
            maximum=MAX_SEEDS_PER_RUN,
        )
        page_limit_per_seed = _bounded_int(
            self.page_limit_per_seed,
            field_name="page_limit_per_seed",
            minimum=1,
            maximum=MAX_PAGES_PER_SEED,
        )
        candidate_limit_per_seed = _bounded_int(
            self.candidate_limit_per_seed,
            field_name="candidate_limit_per_seed",
            minimum=1,
            maximum=MAX_CANDIDATES_PER_SEED,
        )
        candidate_limit_total = _bounded_int(
            self.candidate_limit_total,
            field_name="candidate_limit_total",
            minimum=seed_limit,
            maximum=MAX_CANDIDATES_PER_RUN,
        )
        if candidate_limit_total > seed_limit * candidate_limit_per_seed:
            raise ValueError(
                "candidate_limit_total cannot exceed seed_limit times candidate_limit_per_seed"
            )

        object.__setattr__(self, "seed_limit", seed_limit)
        object.__setattr__(self, "page_limit_per_seed", page_limit_per_seed)
        object.__setattr__(self, "candidate_limit_per_seed", candidate_limit_per_seed)
        object.__setattr__(self, "candidate_limit_total", candidate_limit_total)


DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS = OfficialSiteGenerationLimits()


@dataclass(frozen=True)
class OfficialSiteGenerationRequest:
    """One immutable targeting-profile snapshot chosen for generation.

    ``profile_version`` is opaque version material (normally the persisted
    profile update timestamp or revision).  A queue/persistence wrapper owns
    run IDs and idempotency, so repeated explicit user runs remain possible.
    """

    tenant_id: str
    service_profile_id: str
    targeting_profile_id: str
    profile_version: str
    target_types: Sequence[str]
    seed_urls: Sequence[str]
    explicit_request: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.explicit_request, bool):
            raise ValueError("explicit_request must be a boolean")
        if isinstance(self.seed_urls, (str, bytes, bytearray)):
            raise ValueError("seed_urls must be a list")
        if not self.seed_urls:
            raise ValueError("seed_urls must not be empty")
        if len(self.seed_urls) > MAX_SEED_INPUTS_PER_RUN:
            raise ValueError(f"seed_urls exceeds {MAX_SEED_INPUTS_PER_RUN} items")

        object.__setattr__(
            self,
            "tenant_id",
            _required_string(self.tenant_id, field_name="tenant_id", maximum=120),
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
            "profile_version",
            _required_string(self.profile_version, field_name="profile_version", maximum=128),
        )
        object.__setattr__(self, "target_types", _normalized_target_types(self.target_types))
        object.__setattr__(
            self,
            "seed_urls",
            tuple(normalize_official_site_seed_url(value) for value in self.seed_urls),
        )


@dataclass(frozen=True)
class OfficialSiteSeedPlan:
    """A scan scope, not a claim that its URL identifies a target entity."""

    seed_url: str
    origin_url: str
    decision: CandidateGenerationDecision
    skip_reason: CandidateGenerationSkipReason | None
    allowed_candidate_kinds: tuple[EntityKind, ...]
    candidate_limit: int
    page_limit: int
    seed_fingerprint: str
    entity_kind: EntityKind | None
    origin_kind: Literal["official_site"] = "official_site"
    source_kind: Literal["official_site"] = "official_site"
    requires_explicit_request: bool = True
    requires_official_site_classification: bool = True
    same_origin_only: bool = True
    allow_cross_origin_redirects: bool = False
    allow_external_site_links: bool = False
    allow_social_lookup: bool = False
    allow_public_source_search: bool = False
    allow_author_history: bool = False
    allow_private_sources: bool = False
    requires_dns_revalidation: bool = True
    allowed_page_categories: tuple[OfficialSitePageCategory, ...] = (
        OFFICIAL_SITE_PAGE_CATEGORIES
    )

    @property
    def is_planned(self) -> bool:
        return self.decision == "planned"


@dataclass(frozen=True)
class OfficialSiteGenerationRunPlan:
    """Complete finite plan for a future candidate-generation worker."""

    tenant_id: str
    service_profile_id: str
    targeting_profile_id: str
    profile_version: str
    target_types: tuple[EntityKind, ...]
    seed_plans: tuple[OfficialSiteSeedPlan, ...]
    seed_limit: int
    candidate_limit_total: int
    input_fingerprint: str
    run_kind: Literal["candidate_generation"] = "candidate_generation"

    @property
    def planned_seed_count(self) -> int:
        return sum(plan.is_planned for plan in self.seed_plans)

    @property
    def planned_candidate_limit(self) -> int:
        return sum(plan.candidate_limit for plan in self.seed_plans if plan.is_planned)


def _seed_fingerprint(request: OfficialSiteGenerationRequest, seed_url: str) -> str:
    return _fingerprint(
        "official-site-seed-v1",
        request.tenant_id,
        request.service_profile_id,
        request.targeting_profile_id,
        request.profile_version,
        seed_url,
    )


def _input_fingerprint(
    request: OfficialSiteGenerationRequest,
    limits: OfficialSiteGenerationLimits,
) -> str:
    return _fingerprint(
        "official-site-generation-plan-v1",
        request.tenant_id,
        request.service_profile_id,
        request.targeting_profile_id,
        request.profile_version,
        *request.target_types,
        *request.seed_urls,
        str(limits.seed_limit),
        str(limits.page_limit_per_seed),
        str(limits.candidate_limit_per_seed),
        str(limits.candidate_limit_total),
    )


def _skipped_seed_plan(
    request: OfficialSiteGenerationRequest,
    seed_url: str,
    *,
    reason: CandidateGenerationSkipReason,
) -> OfficialSiteSeedPlan:
    return OfficialSiteSeedPlan(
        seed_url=seed_url,
        origin_url=_origin_url(seed_url),
        decision="skipped",
        skip_reason=reason,
        allowed_candidate_kinds=request.target_types,
        candidate_limit=0,
        page_limit=0,
        seed_fingerprint=_seed_fingerprint(request, seed_url),
        # A raw URL must never silently become an account-shaped target.
        entity_kind=None,
    )


def _planned_seed_plan(
    request: OfficialSiteGenerationRequest,
    seed_url: str,
    *,
    limits: OfficialSiteGenerationLimits,
) -> OfficialSiteSeedPlan:
    return OfficialSiteSeedPlan(
        seed_url=seed_url,
        origin_url=_origin_url(seed_url),
        decision="planned",
        skip_reason=None,
        allowed_candidate_kinds=request.target_types,
        candidate_limit=0,
        page_limit=limits.page_limit_per_seed,
        seed_fingerprint=_seed_fingerprint(request, seed_url),
        entity_kind=None,
    )


def _allocated_candidate_limits(
    *,
    plan_count: int,
    limits: OfficialSiteGenerationLimits,
) -> tuple[int, ...]:
    if not plan_count:
        return ()
    available = min(
        limits.candidate_limit_total,
        plan_count * limits.candidate_limit_per_seed,
    )
    base, remainder = divmod(available, plan_count)
    return tuple(
        min(limits.candidate_limit_per_seed, base + (1 if index < remainder else 0))
        for index in range(plan_count)
    )


def plan_official_site_generation(
    request: OfficialSiteGenerationRequest,
    *,
    limits: OfficialSiteGenerationLimits = DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS,
) -> OfficialSiteGenerationRunPlan:
    """Plan a user-requested, finite official-site generation operation.

    The returned plan is permission material only.  It cannot authorize social
    queries, profile/history lookup, cross-site link expansion, or private
    source access.  The future executor must DNS-revalidate each URL and may
    write only classified, provenance-backed entities of an allowed kind.
    """

    if not isinstance(request, OfficialSiteGenerationRequest):
        raise ValueError("request must be an OfficialSiteGenerationRequest")
    if not isinstance(limits, OfficialSiteGenerationLimits):
        raise ValueError("limits must be an OfficialSiteGenerationLimits")

    seed_plans: list[OfficialSiteSeedPlan] = []
    planned_indexes: list[int] = []
    seen_seed_urls: set[str] = set()

    for seed_url in request.seed_urls:
        if not request.explicit_request:
            seed_plans.append(
                _skipped_seed_plan(
                    request,
                    seed_url,
                    reason="candidate_generation_not_explicitly_requested",
                )
            )
            continue
        if seed_url in seen_seed_urls:
            seed_plans.append(
                _skipped_seed_plan(request, seed_url, reason="duplicate_seed_url")
            )
            continue
        seen_seed_urls.add(seed_url)
        if len(planned_indexes) >= limits.seed_limit:
            seed_plans.append(
                _skipped_seed_plan(request, seed_url, reason="seed_limit_reached")
            )
            continue

        planned_indexes.append(len(seed_plans))
        seed_plans.append(_planned_seed_plan(request, seed_url, limits=limits))

    allocations = _allocated_candidate_limits(
        plan_count=len(planned_indexes),
        limits=limits,
    )
    for index, candidate_limit in zip(planned_indexes, allocations, strict=True):
        seed_plans[index] = replace(seed_plans[index], candidate_limit=candidate_limit)

    return OfficialSiteGenerationRunPlan(
        tenant_id=request.tenant_id,
        service_profile_id=request.service_profile_id,
        targeting_profile_id=request.targeting_profile_id,
        profile_version=request.profile_version,
        target_types=request.target_types,
        seed_plans=tuple(seed_plans),
        seed_limit=limits.seed_limit,
        candidate_limit_total=limits.candidate_limit_total,
        input_fingerprint=_input_fingerprint(request, limits),
    )


__all__ = [
    "DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS",
    "MAX_CANDIDATES_PER_RUN",
    "MAX_CANDIDATES_PER_SEED",
    "MAX_PAGES_PER_SEED",
    "MAX_SEED_INPUTS_PER_RUN",
    "MAX_SEEDS_PER_RUN",
    "OFFICIAL_SITE_PAGE_CATEGORIES",
    "OfficialSiteGenerationLimits",
    "OfficialSiteGenerationRequest",
    "OfficialSiteGenerationRunPlan",
    "OfficialSiteSeedPlan",
    "normalize_official_site_seed_url",
    "plan_official_site_generation",
]
