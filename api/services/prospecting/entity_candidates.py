"""Pure adapter from licensed-provider results to entity-first proposals.

Provider clients remain responsible for authorization, billing, and raw-payload
parsing.  This boundary accepts only a deliberately small business/entity shape
and produces proposals for a later worker to persist.  It neither performs I/O
nor creates a research run, lead, or buyer-intent claim.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from itertools import islice
from typing import Any, Literal

from api.services.social.candidate_privacy import collapse_space

from .account_candidates import (
    AccountProviderCandidate,
    ContactProviderCandidate,
    ProviderDiscoveryRequest,
)
from .entity_first import ENTITY_KINDS, EntityKind, ProspectEntityInput, TargetingProfileInput, normalize_public_url


ProviderMatchSignal = Literal[
    "target_trait",
    "change_trigger",
    "seed_url",
    "provider_fit",
]
ProposalSkipReason = Literal[
    "contact_result_not_promoted",
    "invalid_provider_result",
    "invalid_public_url",
    "missing_public_url",
    "target_type_not_enabled",
    "unsupported_provider_result",
]

PROVIDER_MATCH_SIGNALS = frozenset(
    {"target_trait", "change_trigger", "seed_url", "provider_fit"}
)
MAX_PROVIDER_NAME_CHARS = 120
MAX_PROVIDER_EXTERNAL_ID_CHARS = 512
MAX_TITLE_CHARS = 240
MAX_MATCH_SIGNALS = 4

_EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![\w.-])"
)
_PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-])?(?:\(?\d{2,4}\)?[\s.-])\d{3,4}[\s.-]\d{3,4}(?!\w)"
)


def _required_safe_text(value: Any, *, field_name: str, maximum: int) -> str:
    normalized = collapse_space(value, maximum=maximum)
    if not normalized:
        raise ValueError(f"{field_name} is required")
    if _EMAIL_PATTERN.search(normalized) or _PHONE_PATTERN.search(normalized):
        raise ValueError(f"{field_name} must not contain email or phone data")
    return normalized


def _normalized_kind(value: Any) -> EntityKind:
    kind = _required_safe_text(value, field_name="entity_kind", maximum=32).casefold()
    if kind not in ENTITY_KINDS:
        raise ValueError(f"unsupported entity_kind: {kind}")
    return kind  # type: ignore[return-value]


def _normalized_score(value: Any) -> float | None:
    if value is None:
        return None
    try:
        score = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("fit_score must be numeric") from error
    if not 0 <= score <= 1:
        raise ValueError("fit_score must be between 0 and 1")
    return score


def _normalized_signals(values: Sequence[str]) -> tuple[ProviderMatchSignal, ...]:
    if isinstance(values, (str, bytes, bytearray)):
        raise ValueError("match_signals must be a list")
    if len(values) > MAX_MATCH_SIGNALS:
        raise ValueError(f"match_signals exceeds {MAX_MATCH_SIGNALS} items")

    normalized: list[ProviderMatchSignal] = []
    for value in values:
        signal = _required_safe_text(value, field_name="match_signals", maximum=40).casefold()
        if signal not in PROVIDER_MATCH_SIGNALS:
            raise ValueError(f"unsupported match signal: {signal}")
        if signal not in normalized:
            normalized.append(signal)  # type: ignore[arg-type]
    return tuple(normalized)


@dataclass(frozen=True)
class LicensedProviderEntityResult:
    """Minimal, non-contact result produced by an authorized provider adapter.

    `canonical_url` is required even for an account-provider result.  A vendor
    record without a public website cannot become an entity-first target because
    users need a safe public object they can inspect and later research.
    """

    external_id: str
    entity_kind: EntityKind
    canonical_url: str
    title: str | None = None
    fit_score: float | None = None
    match_signals: Sequence[ProviderMatchSignal] = ()

    def __post_init__(self) -> None:
        kind = _normalized_kind(self.entity_kind)
        external_id = _required_safe_text(
            self.external_id,
            field_name="external_id",
            maximum=MAX_PROVIDER_EXTERNAL_ID_CHARS,
        )
        title = None
        if kind != "builder" and self.title is not None:
            title = _required_safe_text(self.title, field_name="title", maximum=MAX_TITLE_CHARS)

        object.__setattr__(self, "entity_kind", kind)
        object.__setattr__(self, "external_id", external_id)
        object.__setattr__(self, "canonical_url", normalize_public_url(self.canonical_url))
        object.__setattr__(self, "title", title)
        object.__setattr__(self, "fit_score", _normalized_score(self.fit_score))
        object.__setattr__(self, "match_signals", _normalized_signals(self.match_signals))


@dataclass(frozen=True)
class LicensedProviderProvenance:
    """Safe, tenant-local provenance for a future persistence worker."""

    tenant_id: str
    service_profile_id: str
    provider: str
    provider_external_id: str
    discovery_run_id: str
    query_type: str
    query_fingerprint: str
    origin_kind: Literal["licensed_provider"] = "licensed_provider"


@dataclass(frozen=True)
class EntityCandidateProposal:
    """An explainable target proposal that intentionally contains no evidence."""

    entity: ProspectEntityInput
    provenance: LicensedProviderProvenance
    fit_score: float | None
    reason_codes: tuple[str, ...]
    explanation: str
    assessment_state: Literal["high_fit"] = "high_fit"

    def __post_init__(self) -> None:
        if self.assessment_state != "high_fit":
            raise ValueError("provider candidate proposals may only be high_fit")

    @property
    def priority_score(self) -> float:
        """Provider relevance prioritizes review; it does not imply buying intent."""

        return round((self.fit_score or 0) * 100, 2)


@dataclass(frozen=True)
class ProviderResultSkip:
    """A PII-free diagnostic for a provider result intentionally not proposed."""

    index: int
    reason_code: ProposalSkipReason


@dataclass(frozen=True)
class ProviderEntityProposalBatch:
    """Bounded pure conversion output; a caller chooses whether to persist it."""

    proposals: tuple[EntityCandidateProposal, ...]
    skipped: tuple[ProviderResultSkip, ...]


def _provider_name(value: Any) -> str:
    return _required_safe_text(value, field_name="provider", maximum=MAX_PROVIDER_NAME_CHARS).casefold()


def _provenance(
    request: ProviderDiscoveryRequest,
    *,
    provider: str,
    external_id: str,
) -> LicensedProviderProvenance:
    # A query phrase can be tenant-specific.  Its stable fingerprint preserves
    # run provenance without copying potentially sensitive free text downstream.
    query_fingerprint = hashlib.sha256(request.query_phrase.encode("utf-8")).hexdigest()
    return LicensedProviderProvenance(
        tenant_id=_required_safe_text(request.tenant_id, field_name="tenant_id", maximum=120),
        service_profile_id=_required_safe_text(
            request.service_profile_id,
            field_name="service_profile_id",
            maximum=64,
        ),
        provider=provider,
        provider_external_id=external_id,
        discovery_run_id=_required_safe_text(
            request.discovery_run_id,
            field_name="discovery_run_id",
            maximum=64,
        ),
        query_type=_required_safe_text(request.query_type, field_name="query_type", maximum=120),
        query_fingerprint=query_fingerprint,
    )


def _proposal_for_result(
    targeting_profile: TargetingProfileInput,
    request: ProviderDiscoveryRequest,
    *,
    provider: str,
    result: LicensedProviderEntityResult,
) -> EntityCandidateProposal | None:
    if result.entity_kind not in targeting_profile.target_types:
        return None

    entity = ProspectEntityInput(
        entity_kind=result.entity_kind,
        entity_provider=provider,
        entity_external_id=result.external_id,
        canonical_url=result.canonical_url,
        origin_kind="licensed_provider",
        title=result.title,
    )
    reason_codes = [
        "licensed_provider_result",
        f"target_type_{result.entity_kind}",
        "public_canonical_url",
        *result.match_signals,
    ]
    if result.fit_score is not None and "provider_fit" not in reason_codes:
        reason_codes.append("provider_fit")
    return EntityCandidateProposal(
        entity=entity,
        provenance=_provenance(
            request,
            provider=provider,
            external_id=result.external_id,
        ),
        fit_score=result.fit_score,
        reason_codes=tuple(dict.fromkeys(reason_codes)),
        explanation=(
            "Authorized licensed-provider result matched an approved target type "
            "and has a public canonical URL. It is high fit only; no buyer intent "
            "or source evidence was inferred."
        ),
    )


def _account_result(candidate: AccountProviderCandidate) -> LicensedProviderEntityResult | None:
    if not candidate.website_url:
        return None
    return LicensedProviderEntityResult(
        external_id=candidate.external_id,
        entity_kind="account",
        canonical_url=candidate.website_url,
        title=candidate.company_name,
        fit_score=candidate.fit_score,
        match_signals=("provider_fit",) if candidate.fit_score is not None else (),
    )


def propose_licensed_provider_entities(
    targeting_profile: TargetingProfileInput,
    request: ProviderDiscoveryRequest,
    *,
    provider: str,
    results: Iterable[
        LicensedProviderEntityResult | AccountProviderCandidate | ContactProviderCandidate
    ],
) -> ProviderEntityProposalBatch:
    """Convert an already-authorized, bounded provider result stream.

    Contact records are deliberately skipped: even an anonymized contact ID is
    not a company, project, or public builder locator.  The caller must first
    obtain a separate non-contact entity result if it wants to propose an
    account or project.
    """

    normalized_provider = _provider_name(provider)
    proposals: list[EntityCandidateProposal] = []
    skipped: list[ProviderResultSkip] = []
    for index, raw_result in enumerate(islice(results, request.limit)):
        if isinstance(raw_result, ContactProviderCandidate):
            skipped.append(ProviderResultSkip(index, "contact_result_not_promoted"))
            continue
        try:
            if isinstance(raw_result, AccountProviderCandidate):
                result = _account_result(raw_result)
                if result is None:
                    skipped.append(ProviderResultSkip(index, "missing_public_url"))
                    continue
            elif isinstance(raw_result, LicensedProviderEntityResult):
                result = raw_result
            else:
                skipped.append(ProviderResultSkip(index, "unsupported_provider_result"))
                continue

            proposal = _proposal_for_result(
                targeting_profile,
                request,
                provider=normalized_provider,
                result=result,
            )
        except ValueError as error:
            reason = "invalid_public_url" if "canonical_url" in str(error) else "invalid_provider_result"
            skipped.append(ProviderResultSkip(index, reason))
            continue

        if proposal is None:
            skipped.append(ProviderResultSkip(index, "target_type_not_enabled"))
        else:
            proposals.append(proposal)
    return ProviderEntityProposalBatch(tuple(proposals), tuple(skipped))


__all__ = [
    "EntityCandidateProposal",
    "LicensedProviderEntityResult",
    "LicensedProviderProvenance",
    "ProviderEntityProposalBatch",
    "ProviderMatchSignal",
    "ProviderResultSkip",
    "ProposalSkipReason",
    "propose_licensed_provider_entities",
]
