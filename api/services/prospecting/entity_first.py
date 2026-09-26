"""Bounded input models and assessment policy for entity-first prospecting.

The database contract is authoritative for persistence and tenant isolation.
This module gives workers a small, provider-neutral boundary before they write
accounts, builders, projects, or evidence.  It deliberately does not model a
person/contact: builders are public locators associated with a project or
profile URL, and their titles are discarded.
"""

from __future__ import annotations

import hashlib
import ipaddress
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from api.services.social.candidate_privacy import collapse_space, redacted_text


EntityKind = Literal["account", "builder", "project"]
OriginKind = Literal["manual", "official_site", "licensed_provider", "public_source"]
EvidenceType = Literal[
    "fit",
    "trigger",
    "problem",
    "evaluation",
    "relationship",
    "negative",
]
EvidenceSourceKind = Literal[
    "manual",
    "official_site",
    "licensed_provider",
    "public_source",
]
EvidenceStrength = Literal["weak", "moderate", "strong"]
EvidenceStatus = Literal["pending", "accepted", "rejected"]
AssessmentState = Literal[
    "high_fit",
    "triggered",
    "signal_backed",
    "strong_buyer_signal",
    "rejected",
]


ENTITY_KINDS = frozenset({"account", "builder", "project"})
ORIGIN_KINDS = frozenset({"manual", "official_site", "licensed_provider", "public_source"})
EVIDENCE_TYPES = frozenset(
    {"fit", "trigger", "problem", "evaluation", "relationship", "negative"}
)
EVIDENCE_SOURCE_KINDS = frozenset(
    {"manual", "official_site", "licensed_provider", "public_source"}
)
EVIDENCE_STRENGTHS = frozenset({"weak", "moderate", "strong"})
EVIDENCE_STATUSES = frozenset({"pending", "accepted", "rejected"})
ASSESSMENT_STATES = frozenset(
    {"high_fit", "triggered", "signal_backed", "strong_buyer_signal", "rejected"}
)

MAX_TARGET_TEXT_CHARS = 320
MAX_EVIDENCE_SUMMARY_CHARS = 480
MAX_EVIDENCE_EXCERPT_CHARS = 2_000
MAX_URL_CHARS = 2_048
MAX_TARGET_TYPES = 3
MAX_TARGET_LIST_ITEMS = 40
MAX_STRONG_EVIDENCE_DEFINITIONS = 24
MAX_SEED_URLS = 50
STRONG_EVALUATION_MAX_AGE = timedelta(days=180)

_EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![\w.-])"
)
_PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-])?(?:\(?\d{2,4}\)?[\s.-])\d{3,4}[\s.-]\d{3,4}(?!\w)"
)
_SAFE_REASON_CODE = re.compile(r"^[a-z0-9_:-]{1,80}$")


def _required_text(value: Any, *, field_name: str, maximum: int) -> str:
    normalized = collapse_space(value, maximum=maximum)
    if not normalized:
        raise ValueError(f"{field_name} is required")
    return normalized


def _normalized_identifier(value: Any, *, field_name: str, allowed: frozenset[str]) -> str:
    normalized = _required_text(value, field_name=field_name, maximum=120).casefold()
    if normalized not in allowed:
        raise ValueError(f"unsupported {field_name}: {normalized}")
    return normalized


def _uuid(value: Any, *, field_name: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be a UUID") from error


def _contains_direct_contact(value: str) -> bool:
    return bool(_EMAIL_PATTERN.search(value) or _PHONE_PATTERN.search(value))


def _safe_descriptor(value: Any, *, field_name: str, maximum: int) -> str:
    normalized = _required_text(value, field_name=field_name, maximum=maximum)
    if _contains_direct_contact(normalized):
        raise ValueError(f"{field_name} must not contain email or phone data")
    return normalized


def normalize_public_url(value: Any) -> str:
    """Accept a public URL while rejecting obvious private-network targets.

    This prevents manual seed URLs from pointing directly at local or private
    hosts. A fetcher must still resolve DNS immediately before connection and
    reject a private result to defend against DNS rebinding.
    """

    candidate = _required_text(value, field_name="canonical_url", maximum=MAX_URL_CHARS)
    if "@" in candidate:
        raise ValueError("canonical_url must not contain embedded credentials or email data")
    parsed = urlsplit(candidate)
    if parsed.scheme.casefold() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("canonical_url must be an http(s) URL with a host")
    if parsed.username or parsed.password:
        raise ValueError("canonical_url must not include credentials")
    try:
        # Accessing .port validates malformed values such as ``:not-a-port``.
        _ = parsed.port
    except ValueError as error:
        raise ValueError("canonical_url contains an invalid port") from error

    host = (parsed.hostname or "").casefold().rstrip(".")
    if not host:
        raise ValueError("canonical_url must include a host")
    if (
        host in {"localhost", "local"}
        or host.endswith(".localhost")
        or host.endswith(".local")
    ):
        raise ValueError("canonical_url must not target localhost or a local hostname")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        # Decimal, octal, and shortened IPv4 spellings can resolve differently
        # across clients. Reject numeric-looking hosts unless ipaddress parsed
        # an unambiguous public IP literal.
        if re.fullmatch(r"[0-9.]+", host):
            raise ValueError("canonical_url has an invalid numeric host")
    else:
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
            raise ValueError("canonical_url must not use an IPv4-mapped IPv6 address")
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_unspecified
            or address.is_multicast
            or address.is_reserved
        ):
            raise ValueError("canonical_url must not target a private or local IP address")

    # Scheme and host are case-insensitive; preserve path/query case because
    # public project routes can be case-sensitive.
    normalized = urlunsplit(
        (
            parsed.scheme.casefold(),
            parsed.netloc.casefold(),
            parsed.path or "",
            parsed.query,
            "",
        )
    )
    if len(normalized) > MAX_URL_CHARS:
        raise ValueError("canonical_url is too long")
    return normalized


def _bounded_text_list(
    values: Iterable[Any] | None,
    *,
    field_name: str,
    maximum_items: int,
    maximum_text: int,
    allow_empty: bool = True,
) -> tuple[str, ...]:
    if values is None:
        values = ()
    if isinstance(values, (str, bytes, bytearray)):
        raise ValueError(f"{field_name} must be a list")

    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = _safe_descriptor(value, field_name=field_name, maximum=maximum_text)
        key = item.casefold()
        if key not in seen:
            seen.add(key)
            normalized.append(item)
    if len(normalized) > maximum_items:
        raise ValueError(f"{field_name} exceeds {maximum_items} items")
    if not allow_empty and not normalized:
        raise ValueError(f"{field_name} must not be empty")
    return tuple(normalized)


def _normalized_optional_title(value: Any, *, maximum: int = 240) -> str | None:
    if value is None:
        return None
    normalized = collapse_space(value, maximum=maximum)
    if not normalized:
        return None
    if _contains_direct_contact(normalized):
        raise ValueError("title must not contain email or phone data")
    return normalized


@dataclass(frozen=True)
class TargetingProfileInput:
    """A user-approved target thesis, before candidate generation begins."""

    target_types: Sequence[str]
    ideal_customer_traits: Sequence[str] = ()
    change_triggers: Sequence[str] = ()
    strong_evidence_definitions: Sequence[str] = ()
    exclusions: Sequence[str] = ()
    seed_urls: Sequence[str] = ()

    def __post_init__(self) -> None:
        normalized_types = _bounded_text_list(
            self.target_types,
            field_name="target_types",
            maximum_items=MAX_TARGET_TYPES,
            maximum_text=32,
            allow_empty=False,
        )
        canonical_types = tuple(value.casefold() for value in normalized_types)
        if any(value not in ENTITY_KINDS for value in canonical_types):
            raise ValueError("target_types must contain account, builder, or project")
        object.__setattr__(self, "target_types", canonical_types)
        object.__setattr__(
            self,
            "ideal_customer_traits",
            _bounded_text_list(
                self.ideal_customer_traits,
                field_name="ideal_customer_traits",
                maximum_items=MAX_TARGET_LIST_ITEMS,
                maximum_text=MAX_TARGET_TEXT_CHARS,
            ),
        )
        object.__setattr__(
            self,
            "change_triggers",
            _bounded_text_list(
                self.change_triggers,
                field_name="change_triggers",
                maximum_items=MAX_TARGET_LIST_ITEMS,
                maximum_text=MAX_TARGET_TEXT_CHARS,
            ),
        )
        object.__setattr__(
            self,
            "strong_evidence_definitions",
            _bounded_text_list(
                self.strong_evidence_definitions,
                field_name="strong_evidence_definitions",
                maximum_items=MAX_STRONG_EVIDENCE_DEFINITIONS,
                maximum_text=MAX_EVIDENCE_SUMMARY_CHARS,
            ),
        )
        object.__setattr__(
            self,
            "exclusions",
            _bounded_text_list(
                self.exclusions,
                field_name="exclusions",
                maximum_items=MAX_TARGET_LIST_ITEMS,
                maximum_text=MAX_TARGET_TEXT_CHARS,
            ),
        )

        if isinstance(self.seed_urls, (str, bytes, bytearray)):
            raise ValueError("seed_urls must be a list")
        normalized_urls: list[str] = []
        seen_urls: set[str] = set()
        for value in self.seed_urls:
            url = normalize_public_url(value)
            if url not in seen_urls:
                seen_urls.add(url)
                normalized_urls.append(url)
        if len(normalized_urls) > MAX_SEED_URLS:
            raise ValueError(f"seed_urls exceeds {MAX_SEED_URLS} items")
        object.__setattr__(self, "seed_urls", tuple(normalized_urls))


@dataclass(frozen=True)
class ProspectEntityInput:
    """Provider-neutral target identity with no personal contact fields."""

    entity_kind: EntityKind
    entity_provider: str
    entity_external_id: str
    canonical_url: str
    origin_kind: OriginKind
    title: str | None = None
    origin_source_post_id: str | None = None

    def __post_init__(self) -> None:
        kind = _normalized_identifier(
            self.entity_kind,
            field_name="entity_kind",
            allowed=ENTITY_KINDS,
        )
        origin = _normalized_identifier(
            self.origin_kind,
            field_name="origin_kind",
            allowed=ORIGIN_KINDS,
        )
        provider = _required_text(
            self.entity_provider,
            field_name="entity_provider",
            maximum=120,
        ).casefold()
        external_id = _required_text(
            self.entity_external_id,
            field_name="entity_external_id",
            maximum=MAX_URL_CHARS,
        )
        source_post_id = (
            _uuid(self.origin_source_post_id, field_name="origin_source_post_id")
            if self.origin_source_post_id is not None
            else None
        )
        if (origin == "public_source") != (source_post_id is not None):
            raise ValueError("only public_source entities may reference origin_source_post_id")

        object.__setattr__(self, "entity_kind", kind)
        object.__setattr__(self, "origin_kind", origin)
        object.__setattr__(self, "entity_provider", provider)
        object.__setattr__(self, "entity_external_id", external_id)
        object.__setattr__(self, "canonical_url", normalize_public_url(self.canonical_url))
        object.__setattr__(self, "origin_source_post_id", source_post_id)
        # A builder is intentionally represented by a public locator only.
        object.__setattr__(self, "title", None if kind == "builder" else _normalized_optional_title(self.title))


@dataclass(frozen=True)
class ProspectEvidenceInput:
    """A bounded, cited observation associated with one tenant target."""

    targeting_profile_id: str
    prospect_entity_id: str
    research_run_id: str
    evidence_type: EvidenceType
    summary: str
    evidence_source_kind: EvidenceSourceKind
    source: str
    observed_at: datetime
    source_url: str | None = None
    source_post_id: str | None = None
    evidence_excerpt: str | None = None
    evidence_strength: EvidenceStrength = "weak"
    evidence_status: EvidenceStatus = "pending"
    verified_by: str | None = None
    verified_at: datetime | None = None

    def __post_init__(self) -> None:
        evidence_type = _normalized_identifier(
            self.evidence_type,
            field_name="evidence_type",
            allowed=EVIDENCE_TYPES,
        )
        source_kind = _normalized_identifier(
            self.evidence_source_kind,
            field_name="evidence_source_kind",
            allowed=EVIDENCE_SOURCE_KINDS,
        )
        strength = _normalized_identifier(
            self.evidence_strength,
            field_name="evidence_strength",
            allowed=EVIDENCE_STRENGTHS,
        )
        status = _normalized_identifier(
            self.evidence_status,
            field_name="evidence_status",
            allowed=EVIDENCE_STATUSES,
        )
        source_post_id = (
            _uuid(self.source_post_id, field_name="source_post_id")
            if self.source_post_id is not None
            else None
        )
        if (source_kind == "public_source") != (source_post_id is not None):
            raise ValueError("public-source evidence requires a global source_post_id")
        if source_kind == "official_site" and self.source_url is None:
            raise ValueError("official-site evidence requires source_url")

        observed_at = self.observed_at
        if observed_at.tzinfo is None:
            raise ValueError("observed_at must be timezone-aware")
        observed_at = observed_at.astimezone(timezone.utc)
        excerpt = None
        if self.evidence_excerpt is not None:
            excerpt = redacted_text(self.evidence_excerpt, maximum=MAX_EVIDENCE_EXCERPT_CHARS)
            excerpt = _PHONE_PATTERN.sub("[redacted-phone]", excerpt)
            excerpt = excerpt or None
        verified_by = _normalized_optional_title(self.verified_by, maximum=128)
        verified_at = self.verified_at
        if verified_at is not None:
            if verified_at.tzinfo is None:
                raise ValueError("verified_at must be timezone-aware")
            verified_at = verified_at.astimezone(timezone.utc)
        if status == "pending" and (verified_by is not None or verified_at is not None):
            raise ValueError("pending evidence cannot have verification fields")
        if status != "pending" and (verified_by is None or verified_at is None):
            raise ValueError("accepted or rejected evidence requires verification fields")

        object.__setattr__(self, "targeting_profile_id", _uuid(self.targeting_profile_id, field_name="targeting_profile_id"))
        object.__setattr__(self, "prospect_entity_id", _uuid(self.prospect_entity_id, field_name="prospect_entity_id"))
        object.__setattr__(self, "research_run_id", _uuid(self.research_run_id, field_name="research_run_id"))
        object.__setattr__(self, "evidence_type", evidence_type)
        object.__setattr__(
            self,
            "summary",
            _safe_descriptor(self.summary, field_name="summary", maximum=MAX_EVIDENCE_SUMMARY_CHARS),
        )
        object.__setattr__(self, "evidence_source_kind", source_kind)
        object.__setattr__(self, "source", _required_text(self.source, field_name="source", maximum=120).casefold())
        object.__setattr__(self, "source_url", normalize_public_url(self.source_url) if self.source_url else None)
        object.__setattr__(self, "source_post_id", source_post_id)
        object.__setattr__(self, "evidence_excerpt", excerpt)
        object.__setattr__(self, "evidence_strength", strength)
        object.__setattr__(self, "evidence_status", status)
        object.__setattr__(self, "verified_by", verified_by)
        object.__setattr__(self, "verified_at", verified_at)
        object.__setattr__(self, "observed_at", observed_at)

    @property
    def evidence_key(self) -> str:
        """Stable idempotency key; it never includes a user or contact identity."""

        parts = (
            "prospect-evidence-v1",
            self.targeting_profile_id,
            self.prospect_entity_id,
            self.evidence_type,
            self.source,
            self.source_post_id or self.source_url or "",
            self.summary.casefold(),
        )
        return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class EvidenceSignal:
    """Minimal accepted/rejected evidence shape needed for deterministic rank state."""

    evidence_type: EvidenceType
    evidence_strength: EvidenceStrength
    evidence_status: EvidenceStatus
    observed_at: datetime

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "evidence_type",
            _normalized_identifier(
                self.evidence_type,
                field_name="evidence_type",
                allowed=EVIDENCE_TYPES,
            ),
        )
        object.__setattr__(
            self,
            "evidence_strength",
            _normalized_identifier(
                self.evidence_strength,
                field_name="evidence_strength",
                allowed=EVIDENCE_STRENGTHS,
            ),
        )
        object.__setattr__(
            self,
            "evidence_status",
            _normalized_identifier(
                self.evidence_status,
                field_name="evidence_status",
                allowed=EVIDENCE_STATUSES,
            ),
        )
        if self.observed_at.tzinfo is None:
            raise ValueError("observed_at must be timezone-aware")
        object.__setattr__(self, "observed_at", self.observed_at.astimezone(timezone.utc))


def assessment_state_for_evidence(
    *,
    fit_score: float | None,
    evidence: Iterable[EvidenceSignal],
    now: datetime | None = None,
) -> AssessmentState:
    """Return the highest state supported by accepted source evidence.

    This is intentionally a rank policy, not a purchase-probability model.
    Strong buyer signals need fresh, accepted, strong *evaluation* evidence;
    a relevant problem alone remains signal-backed.
    """

    if fit_score is not None and not 0 <= float(fit_score) <= 1:
        raise ValueError("fit_score must be between 0 and 1")
    reference_time = now or datetime.now(timezone.utc)
    if reference_time.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    reference_time = reference_time.astimezone(timezone.utc)

    accepted = [item for item in evidence if item.evidence_status == "accepted"]
    has_trigger = any(item.evidence_type == "trigger" for item in accepted)
    has_signal = any(item.evidence_type in {"problem", "evaluation"} for item in accepted)
    has_fresh_strong_evaluation = any(
        item.evidence_type == "evaluation"
        and item.evidence_strength == "strong"
        and item.observed_at >= reference_time - STRONG_EVALUATION_MAX_AGE
        for item in accepted
    )
    if float(fit_score or 0) >= 0.5 and has_fresh_strong_evaluation:
        return "strong_buyer_signal"
    if has_signal:
        return "signal_backed"
    if has_trigger:
        return "triggered"
    return "high_fit"


def normalized_feedback_reason_code(value: Any) -> str | None:
    """Validate the deliberately non-free-form feedback reason field."""

    normalized = collapse_space(value, maximum=80).casefold()
    if not normalized:
        return None
    if not _SAFE_REASON_CODE.fullmatch(normalized):
        raise ValueError("feedback reason code is invalid")
    return normalized


__all__ = [
    "ASSESSMENT_STATES",
    "EVIDENCE_SOURCE_KINDS",
    "EVIDENCE_STATUSES",
    "EVIDENCE_STRENGTHS",
    "EVIDENCE_TYPES",
    "ENTITY_KINDS",
    "ORIGIN_KINDS",
    "STRONG_EVALUATION_MAX_AGE",
    "EvidenceSignal",
    "ProspectEntityInput",
    "ProspectEvidenceInput",
    "TargetingProfileInput",
    "assessment_state_for_evidence",
    "normalize_public_url",
    "normalized_feedback_reason_code",
]
