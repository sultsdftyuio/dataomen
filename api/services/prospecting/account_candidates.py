"""Safe intake boundary for connected account/contact discovery providers.

This module does not call a vendor API itself. A provider adapter supplies
already-authorized, public-business results to the functions below, which
store them in the same candidate-first lifecycle as public conversations.
Keeping this boundary provider-neutral lets the product add a licensed data
source without coupling its credentials, rate limits, or API shape to the
discovery crawler.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from itertools import islice
from typing import Any, Literal, Protocol

from api.services.social.candidate_pool import (
    CandidateIdentity,
    CandidateProvenance,
    CandidateScores,
    CandidateWriteResult,
    record_candidate,
)
from api.services.social.candidate_privacy import collapse_space, redacted_text


CandidateKind = Literal["account", "contact"]
DEFAULT_QUERY_TYPE = "provider_candidate"
MAX_PROVIDER_NAME_CHARS = 120
MAX_PROVIDER_EXTERNAL_ID_CHARS = 512
MAX_COMPANY_NAME_CHARS = 240
MAX_ROLE_CHARS = 240
MAX_SUMMARY_CHARS = 2_000


def account_candidate_ingestion_enabled() -> bool:
    """Return whether a separately configured provider may submit results.

    It defaults off: merely deploying the candidate-pool schema must never
    start an external account/contact lookup or incur provider costs.
    """

    return os.getenv("ARCLI_ACCOUNT_CANDIDATE_INGESTION_ENABLED", "false").strip().casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _required(value: Any, *, field_name: str, maximum: int) -> str:
    normalized = collapse_space(value, maximum=maximum)
    if not normalized:
        raise ValueError(f"{field_name} is required")
    return normalized


def _optional_text(value: Any, *, maximum: int) -> str | None:
    normalized = redacted_text(value, maximum=maximum)
    return normalized or None


def _optional_url(value: Any) -> str | None:
    candidate = collapse_space(value, maximum=2_048)
    if not candidate:
        return None
    if not candidate.startswith(("https://", "http://")):
        return None
    return candidate


def _score(value: Any) -> float | None:
    if value is None:
        return None
    try:
        score = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("fit_score must be numeric") from error
    if not 0 <= score <= 1:
        raise ValueError("fit_score must be between 0 and 1")
    return score


@dataclass(frozen=True)
class AccountProviderCandidate:
    """A public-business account result from a connected licensed provider."""

    external_id: str
    company_name: str
    website_url: str | None = None
    summary: str | None = None
    fit_score: float | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "external_id",
            _required(
                self.external_id,
                field_name="external_id",
                maximum=MAX_PROVIDER_EXTERNAL_ID_CHARS,
            ),
        )
        object.__setattr__(
            self,
            "company_name",
            _required(
                self.company_name,
                field_name="company_name",
                maximum=MAX_COMPANY_NAME_CHARS,
            ),
        )
        object.__setattr__(self, "website_url", _optional_url(self.website_url))
        object.__setattr__(self, "summary", _optional_text(self.summary, maximum=MAX_SUMMARY_CHARS))
        object.__setattr__(self, "fit_score", _score(self.fit_score))
        object.__setattr__(self, "reason", _optional_text(self.reason, maximum=1_000))


@dataclass(frozen=True)
class ContactProviderCandidate:
    """A contact result stored without name, email, or phone data.

    The provider's internal external ID is retained solely for deterministic
    dedupe. The review snapshot contains business role/context only; a future
    consented enrichment flow must resolve any direct contact details at use
    time instead of copying them into discovery storage.
    """

    external_id: str
    company_name: str
    role: str
    company_url: str | None = None
    summary: str | None = None
    fit_score: float | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "external_id",
            _required(
                self.external_id,
                field_name="external_id",
                maximum=MAX_PROVIDER_EXTERNAL_ID_CHARS,
            ),
        )
        object.__setattr__(
            self,
            "company_name",
            _required(
                self.company_name,
                field_name="company_name",
                maximum=MAX_COMPANY_NAME_CHARS,
            ),
        )
        object.__setattr__(
            self,
            "role",
            _required(self.role, field_name="role", maximum=MAX_ROLE_CHARS),
        )
        object.__setattr__(self, "company_url", _optional_url(self.company_url))
        object.__setattr__(self, "summary", _optional_text(self.summary, maximum=MAX_SUMMARY_CHARS))
        object.__setattr__(self, "fit_score", _score(self.fit_score))
        object.__setattr__(self, "reason", _optional_text(self.reason, maximum=1_000))


@dataclass(frozen=True)
class ProviderDiscoveryRequest:
    """The minimal buyer brief passed to a licensed provider adapter."""

    tenant_id: str
    service_profile_id: str
    discovery_run_id: str
    query_phrase: str
    query_type: str = DEFAULT_QUERY_TYPE
    limit: int = 25

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "tenant_id",
            _required(self.tenant_id, field_name="tenant_id", maximum=120),
        )
        object.__setattr__(
            self,
            "service_profile_id",
            _required(
                self.service_profile_id,
                field_name="service_profile_id",
                maximum=64,
            ),
        )
        object.__setattr__(
            self,
            "discovery_run_id",
            _required(self.discovery_run_id, field_name="discovery_run_id", maximum=64),
        )
        object.__setattr__(
            self,
            "query_phrase",
            _required(self.query_phrase, field_name="query_phrase", maximum=512),
        )
        object.__setattr__(
            self,
            "query_type",
            _required(self.query_type, field_name="query_type", maximum=120),
        )
        object.__setattr__(self, "limit", max(1, min(int(self.limit), 100)))


class AccountCandidateProvider(Protocol):
    """Adapter contract for a credentialed, licensed account-data provider."""

    name: str

    def discover_accounts(
        self,
        request: ProviderDiscoveryRequest,
    ) -> Iterable[AccountProviderCandidate]: ...

    def discover_contacts(
        self,
        request: ProviderDiscoveryRequest,
    ) -> Iterable[ContactProviderCandidate]: ...


def _provider_name(value: Any) -> str:
    return _required(value, field_name="provider", maximum=MAX_PROVIDER_NAME_CHARS)


def _record_provider_candidate(
    request: ProviderDiscoveryRequest,
    *,
    provider: str,
    kind: CandidateKind,
    external_id: str,
    title: str,
    url: str | None,
    summary: str | None,
    fit_score: float | None,
    reason: str | None,
) -> CandidateWriteResult | None:
    score_components: Mapping[str, Any] = {"provider_fit": fit_score} if fit_score is not None else {}
    evidence: Mapping[str, Any] = {
        "criterion": "licensed provider candidate",
        "reason": reason or "provider fit signal",
    }
    return record_candidate(
        request.tenant_id,
        request.service_profile_id,
        identity=CandidateIdentity(
            candidate_kind=kind,
            entity_provider=provider,
            entity_external_id=external_id,
            entity_url=url,
        ),
        provenance=CandidateProvenance(
            discovery_run_id=request.discovery_run_id,
            source=provider,
            source_external_id=external_id,
            query_type=request.query_type,
            query_phrase=request.query_phrase,
        ),
        scores=CandidateScores(
            raw_score=fit_score,
            plausibility_score=fit_score,
            priority_score=round((fit_score or 0) * 100, 2),
            components=score_components,
        ),
        source_snapshot={
            "source": provider,
            "title": title,
            "text": summary or "",
            "url": url or "",
        },
        evidence=evidence,
        status="raw",
    )


def record_provider_account_candidates(
    request: ProviderDiscoveryRequest,
    *,
    provider: str,
    candidates: Iterable[AccountProviderCandidate],
) -> list[CandidateWriteResult]:
    """Persist authorized account results in the common candidate pool."""

    if not account_candidate_ingestion_enabled():
        return []
    normalized_provider = _provider_name(provider)
    writes: list[CandidateWriteResult] = []
    for candidate in islice(candidates, request.limit):
        if not isinstance(candidate, AccountProviderCandidate):
            continue
        write = _record_provider_candidate(
            request,
            provider=normalized_provider,
            kind="account",
            external_id=candidate.external_id,
            title=candidate.company_name,
            url=candidate.website_url,
            summary=candidate.summary,
            fit_score=candidate.fit_score,
            reason=candidate.reason,
        )
        if write is not None:
            writes.append(write)
    return writes


def record_provider_contact_candidates(
    request: ProviderDiscoveryRequest,
    *,
    provider: str,
    candidates: Iterable[ContactProviderCandidate],
) -> list[CandidateWriteResult]:
    """Persist role-only contact candidates without direct contact details."""

    if not account_candidate_ingestion_enabled():
        return []
    normalized_provider = _provider_name(provider)
    writes: list[CandidateWriteResult] = []
    for candidate in islice(candidates, request.limit):
        if not isinstance(candidate, ContactProviderCandidate):
            continue
        write = _record_provider_candidate(
            request,
            provider=normalized_provider,
            kind="contact",
            external_id=candidate.external_id,
            title=f"{candidate.role} at {candidate.company_name}",
            url=candidate.company_url,
            summary=candidate.summary,
            fit_score=candidate.fit_score,
            reason=candidate.reason,
        )
        if write is not None:
            writes.append(write)
    return writes


__all__ = [
    "AccountCandidateProvider",
    "AccountProviderCandidate",
    "ContactProviderCandidate",
    "ProviderDiscoveryRequest",
    "account_candidate_ingestion_enabled",
    "record_provider_account_candidates",
    "record_provider_contact_candidates",
]
