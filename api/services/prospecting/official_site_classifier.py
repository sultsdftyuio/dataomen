"""Classify bounded official-page metadata into entity-first proposals.

This is deliberately a pure, post-fetch boundary.  A caller supplies a page
that was already fetched inside an :class:`OfficialSiteSeedPlan` scope; this
module performs no I/O, does not parse free-form page text, and never creates
evidence or an intent claim.  A raw seed URL is therefore not a candidate on
its own: an allowed entity type and a same-origin canonical URL must both be
present in explicit JSON-LD or OpenGraph metadata.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from itertools import islice
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit

from api.services.social.candidate_privacy import collapse_space

from .entity_first import EntityKind, ProspectEntityInput, normalize_public_url
from .official_site_generation import MAX_CANDIDATES_PER_SEED, OfficialSiteSeedPlan


StructuredMetadataSource = Literal["json_ld", "open_graph"]
MetadataUrlStatus = Literal["missing", "valid", "invalid"]
OfficialSiteProposalSkipReason = Literal[
    "candidate_generation_seed_not_planned",
    "candidate_generation_scope_not_supported",
    "page_outside_seed_origin",
    "metadata_missing_public_url",
    "metadata_type_not_supported",
    "metadata_url_outside_seed_origin",
    "target_type_not_enabled",
    "duplicate_entity",
    "candidate_limit_reached",
]


# These caps protect the classifier boundary even when a fetcher accidentally
# passes a page with unusually large structured-data blocks.  They are smaller
# than the run plan because one page should never consume a whole run budget.
MAX_PAGE_HTML_CHARS = 512_000
MAX_PAGE_TEXT_CHARS = 120_000
MAX_JSON_LD_BLOCKS = 16
MAX_JSON_LD_RECORDS = 24
MAX_OPEN_GRAPH_FIELDS = 32
MAX_METADATA_TYPES = 8
MAX_METADATA_TITLE_CHARS = 240
MAX_METADATA_DESCRIPTION_CHARS = 480

_EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![\w.-])"
)
_PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-])?(?:\(?\d{2,4}\)?[\s.-])\d{3,4}[\s.-]\d{3,4}(?!\w)"
)
_SCHEMA_TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{0,80}$")

_JSON_LD_ACCOUNT_TYPES = frozenset(
    {
        "organization",
        "corporation",
        "localbusiness",
        "professionalservice",
        "educationalorganization",
        "governmentorganization",
        "ngo",
    }
)
_JSON_LD_PROJECT_TYPES = frozenset(
    {"softwareapplication", "webapplication", "mobileapplication", "product"}
)
_JSON_LD_BUILDER_TYPES = frozenset({"person"})
_OPEN_GRAPH_PROJECT_TYPES = frozenset({"product"})


def _bounded_page_text(value: Any, *, field_name: str, maximum: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    if len(value) > maximum:
        raise ValueError(f"{field_name} exceeds {maximum} characters")
    return value


def _safe_title(value: Any) -> str | None:
    """Keep a presentation label only when it cannot be direct contact data."""

    if not isinstance(value, str):
        return None
    normalized = collapse_space(value, maximum=MAX_METADATA_TITLE_CHARS)
    if not normalized or _EMAIL_PATTERN.search(normalized) or _PHONE_PATTERN.search(normalized):
        return None
    return normalized


def _safe_description(value: Any) -> str | None:
    """Keep a bounded structured-description field only for brief scoring.

    This is intentionally not page text and is never persisted on an entity or
    evidence row. It lets the deterministic targeting brief use explicit
    JSON-LD/OpenGraph metadata without widening the official-site boundary.
    """

    if not isinstance(value, str):
        return None
    normalized = collapse_space(value, maximum=MAX_METADATA_DESCRIPTION_CHARS)
    if not normalized or _EMAIL_PATTERN.search(normalized) or _PHONE_PATTERN.search(normalized):
        return None
    return normalized


def _canonical_page_url(value: Any) -> str:
    """Remove query and fragment material that is not needed as page provenance."""

    normalized = normalize_public_url(value)
    parsed = urlsplit(normalized)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", "", ""))


def _metadata_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = collapse_space(value, maximum=2_048)
    return normalized or None


def _schema_type(value: Any) -> str | None:
    raw = _metadata_string(value)
    if raw is None:
        return None
    # JSON-LD commonly uses schema.org URIs, while an extractor may already
    # have reduced them to a short type name.  Only the final type token is
    # relevant; no free-form schema value is retained in a proposal.
    token = re.split(r"[/#]", raw)[-1].casefold()
    if not _SCHEMA_TYPE_PATTERN.fullmatch(token):
        return None
    return token


def _schema_types(record: Mapping[str, Any]) -> tuple[str, ...]:
    raw_types = record.get("@type", record.get("type"))
    if isinstance(raw_types, str):
        raw_values: Sequence[Any] = (raw_types,)
    elif isinstance(raw_types, Sequence) and not isinstance(raw_types, (bytes, bytearray)):
        raw_values = raw_types
    else:
        return ()

    normalized: list[str] = []
    for value in islice(raw_values, MAX_METADATA_TYPES):
        schema_type = _schema_type(value)
        if schema_type is not None and schema_type not in normalized:
            normalized.append(schema_type)
    return tuple(normalized)


def _metadata_url(record: Mapping[str, Any]) -> tuple[str | None, MetadataUrlStatus]:
    raw_url = record.get("url", record.get("@id"))
    if not isinstance(raw_url, str) or not raw_url.strip():
        return None, "missing"
    try:
        return _canonical_page_url(raw_url), "valid"
    except ValueError:
        return None, "invalid"


def _metadata_title(record: Mapping[str, Any]) -> str | None:
    return _safe_title(record.get("name", record.get("headline", record.get("title"))))


def _json_ld_blocks(value: Any) -> tuple[Mapping[str, Any], ...]:
    if value is None:
        return ()
    if isinstance(value, Mapping):
        return (value,)
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        if len(value) > MAX_JSON_LD_BLOCKS:
            raise ValueError(f"json_ld exceeds {MAX_JSON_LD_BLOCKS} blocks")
        return tuple(item for item in value if isinstance(item, Mapping))
    raise ValueError("json_ld must be a mapping or a list of mappings")


def _json_ld_records(value: Any) -> tuple[Mapping[str, Any], ...]:
    records: list[Mapping[str, Any]] = []
    for block in _json_ld_blocks(value):
        # Some parsers expose a single top-level graph container.  We only
        # inspect its immediate structured records; recursive traversal risks
        # treating arbitrary embedded payloads as target metadata.
        if _schema_types(block):
            records.append(block)
        graph = block.get("@graph")
        if isinstance(graph, Sequence) and not isinstance(graph, (str, bytes, bytearray)):
            for item in graph:
                if isinstance(item, Mapping) and _schema_types(item):
                    records.append(item)
                if len(records) >= MAX_JSON_LD_RECORDS:
                    return tuple(records)
        if len(records) >= MAX_JSON_LD_RECORDS:
            return tuple(records)
    return tuple(records)


def _open_graph_record(value: Any) -> Mapping[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise ValueError("open_graph must be a mapping")
    if len(value) > MAX_OPEN_GRAPH_FIELDS:
        raise ValueError(f"open_graph exceeds {MAX_OPEN_GRAPH_FIELDS} fields")

    normalized: dict[str, Any] = {}
    for key, raw_value in value.items():
        if not isinstance(key, str):
            continue
        name = key.casefold().strip()
        if name in {"og:type", "type", "@type"} and "@type" not in normalized:
            normalized["@type"] = raw_value
        elif name in {"og:url", "url"} and "url" not in normalized:
            normalized["url"] = raw_value
        elif name in {"og:title", "title", "name"} and "name" not in normalized:
            normalized["name"] = raw_value
        elif name in {"og:description", "description"} and "description" not in normalized:
            normalized["description"] = raw_value
    return normalized or None


def _safe_metadata_record(record: Mapping[str, Any]) -> dict[str, Any] | None:
    """Copy only classification fields, dropping arbitrary page metadata."""

    schema_types = _schema_types(record)
    canonical_url, _ = _metadata_url(record)
    safe_record: dict[str, Any] = {}
    if schema_types:
        safe_record["@type"] = schema_types
    if canonical_url is not None:
        safe_record["url"] = canonical_url
    # Person records are allowed solely to retain a public locator for a
    # builder.  Their display fields are discarded before the page object is
    # retained, rather than only when a proposal is constructed.
    if "person" not in schema_types:
        title = _metadata_title(record)
        if title is not None:
            safe_record["name"] = title
        description = _safe_description(record.get("description"))
        if description is not None:
            safe_record["description"] = description
    return safe_record or None


def _safe_json_ld_blocks(value: Any) -> tuple[Mapping[str, Any], ...]:
    safe_blocks: list[Mapping[str, Any]] = []
    for block in _json_ld_blocks(value):
        safe_block = _safe_metadata_record(block) or {}
        graph = block.get("@graph")
        if isinstance(graph, Sequence) and not isinstance(graph, (str, bytes, bytearray)):
            safe_graph: list[Mapping[str, Any]] = []
            for item in islice(graph, MAX_JSON_LD_RECORDS):
                if isinstance(item, Mapping):
                    safe_item = _safe_metadata_record(item)
                    if safe_item is not None:
                        safe_graph.append(safe_item)
            if safe_graph:
                safe_block["@graph"] = tuple(safe_graph)
        if safe_block:
            safe_blocks.append(safe_block)
    return tuple(safe_blocks)


def _safe_open_graph(value: Any) -> Mapping[str, Any] | None:
    record = _open_graph_record(value)
    if record is None:
        return None
    return _safe_metadata_record(record)


def _same_origin(url: str, origin_url: str) -> bool:
    candidate = urlsplit(url)
    origin = urlsplit(origin_url)
    return candidate.scheme == origin.scheme and candidate.netloc == origin.netloc


def _metadata_kinds(
    source: StructuredMetadataSource,
    schema_types: Sequence[str],
) -> tuple[tuple[EntityKind, str], ...]:
    candidates: list[tuple[EntityKind, str]] = []
    for schema_type in schema_types:
        if source == "json_ld":
            if schema_type in _JSON_LD_ACCOUNT_TYPES:
                candidates.append(("account", schema_type))
            if schema_type in _JSON_LD_PROJECT_TYPES:
                candidates.append(("project", schema_type))
            if schema_type in _JSON_LD_BUILDER_TYPES:
                candidates.append(("builder", schema_type))
        elif schema_type in _OPEN_GRAPH_PROJECT_TYPES:
            candidates.append(("project", schema_type))
    return tuple(candidates)


def _external_id(entity_kind: EntityKind, canonical_url: str) -> str:
    # The URL is already a public locator.  Hashing it avoids putting a
    # personal page slug or provider-specific identifier into the external ID.
    material = f"official-site-entity-v1\x1f{entity_kind}\x1f{canonical_url}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class OfficialSiteFetchedPage:
    """A bounded fetch result supplied by a separate safe fetcher.

    ``html`` and ``text`` are accepted only so an upstream fetcher can hand off
    a uniform result shape. Classification deliberately discards them during
    construction: only explicit JSON-LD/OpenGraph values and the document
    title are eligible for entity classification. This avoids turning an
    in-memory classifier object or a debug representation into a raw-page
    retention channel.
    """

    url: str
    html: str | None = None
    text: str | None = None
    json_ld: Mapping[str, Any] | Sequence[Mapping[str, Any]] | None = None
    open_graph: Mapping[str, Any] | None = None
    title: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "url", _canonical_page_url(self.url))
        _bounded_page_text(self.html, field_name="html", maximum=MAX_PAGE_HTML_CHARS)
        _bounded_page_text(self.text, field_name="text", maximum=MAX_PAGE_TEXT_CHARS)
        object.__setattr__(self, "html", None)
        object.__setattr__(self, "text", None)
        # Keep only a small, PII-filtered metadata snapshot.  In particular,
        # arbitrary JSON-LD fields and a Person display name/contact field do
        # not survive on the page object after construction.
        object.__setattr__(self, "json_ld", _safe_json_ld_blocks(self.json_ld))
        object.__setattr__(self, "open_graph", _safe_open_graph(self.open_graph))
        object.__setattr__(self, "title", _safe_title(self.title))


@dataclass(frozen=True)
class OfficialSiteMetadataRecord:
    """The small structured-data shape used internally by the classifier."""

    source: StructuredMetadataSource
    source_index: int
    schema_types: tuple[str, ...]
    canonical_url: str | None
    url_status: MetadataUrlStatus
    title: str | None
    description: str | None = field(default=None, repr=False)


@dataclass(frozen=True)
class OfficialSiteCandidateProvenance:
    """Pii-free provenance proving why an official-site target was proposed."""

    seed_fingerprint: str
    page_url: str
    metadata_source: StructuredMetadataSource
    metadata_type: str
    metadata_index: int
    origin_kind: Literal["official_site"] = "official_site"


@dataclass(frozen=True)
class OfficialSiteCandidateProposal:
    """A source-grounded target proposal, never evidence or an intent claim."""

    entity: ProspectEntityInput
    provenance: OfficialSiteCandidateProvenance
    reason_codes: tuple[str, ...]
    explanation: str
    assessment_state: Literal["high_fit"] = "high_fit"
    metadata_description: str | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if self.assessment_state != "high_fit":
            raise ValueError("official-site candidate proposals may only be high_fit")
        if self.entity.origin_kind != "official_site":
            raise ValueError("official-site proposal entity must use official_site origin")
        if self.entity.entity_kind == "builder" and self.entity.title is not None:
            raise ValueError("builder proposals must not retain a display title")
        object.__setattr__(
            self,
            "metadata_description",
            _safe_description(self.metadata_description),
        )


@dataclass(frozen=True)
class OfficialSiteProposalSkip:
    """A PII-free reason a page or metadata record was not proposed."""

    reason_code: OfficialSiteProposalSkipReason
    metadata_source: StructuredMetadataSource | None = None
    metadata_index: int | None = None


@dataclass(frozen=True)
class OfficialSiteClassificationBatch:
    """Pure result for one page; a worker decides whether to persist proposals."""

    proposals: tuple[OfficialSiteCandidateProposal, ...]
    skipped: tuple[OfficialSiteProposalSkip, ...]


def _metadata_records(page: OfficialSiteFetchedPage) -> tuple[OfficialSiteMetadataRecord, ...]:
    records: list[OfficialSiteMetadataRecord] = []
    for index, record in enumerate(_json_ld_records(page.json_ld)):
        schema_types = _schema_types(record)
        canonical_url, url_status = _metadata_url(record)
        # Person labels are intentionally discarded before an internal record
        # exists, not merely before a builder proposal is returned.
        title = None if "person" in schema_types else _metadata_title(record)
        description = None if "person" in schema_types else _safe_description(record.get("description"))
        records.append(
            OfficialSiteMetadataRecord(
                source="json_ld",
                source_index=index,
                schema_types=schema_types,
                canonical_url=canonical_url,
                url_status=url_status,
                title=title,
                description=description,
            )
        )

    open_graph = _open_graph_record(page.open_graph)
    if open_graph is not None:
        schema_types = _schema_types(open_graph)
        canonical_url, url_status = _metadata_url(open_graph)
        records.append(
            OfficialSiteMetadataRecord(
                source="open_graph",
                source_index=0,
                schema_types=schema_types,
                canonical_url=canonical_url,
                url_status=url_status,
                title=_metadata_title(open_graph),
                description=_safe_description(open_graph.get("description")),
            )
        )
    return tuple(records)


def _strict_seed_scope(seed_plan: OfficialSiteSeedPlan) -> bool:
    """Reject a hand-built plan that would widen the official-site boundary."""

    return (
        seed_plan.is_planned
        and seed_plan.requires_official_site_classification
        and seed_plan.same_origin_only
        and not seed_plan.allow_cross_origin_redirects
        and not seed_plan.allow_external_site_links
        and not seed_plan.allow_social_lookup
        and not seed_plan.allow_public_source_search
        and not seed_plan.allow_author_history
        and not seed_plan.allow_private_sources
    )


def _candidate_limit(seed_plan: OfficialSiteSeedPlan) -> int:
    value = seed_plan.candidate_limit
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return 0
    return min(value, MAX_CANDIDATES_PER_SEED)


def _proposal(
    *,
    seed_plan: OfficialSiteSeedPlan,
    page: OfficialSiteFetchedPage,
    record: OfficialSiteMetadataRecord,
    entity_kind: EntityKind,
    metadata_type: str,
) -> OfficialSiteCandidateProposal:
    assert record.canonical_url is not None
    title = None if entity_kind == "builder" else (record.title or page.title)
    entity = ProspectEntityInput(
        entity_kind=entity_kind,
        entity_provider="official_site",
        entity_external_id=_external_id(entity_kind, record.canonical_url),
        canonical_url=record.canonical_url,
        origin_kind="official_site",
        title=title,
    )
    return OfficialSiteCandidateProposal(
        entity=entity,
        provenance=OfficialSiteCandidateProvenance(
            seed_fingerprint=seed_plan.seed_fingerprint,
            page_url=page.url,
            metadata_source=record.source,
            metadata_type=metadata_type,
            metadata_index=record.source_index,
        ),
        reason_codes=(
            "official_site_structured_metadata",
            f"{record.source}_{metadata_type}",
            "same_origin_canonical_url",
            f"target_type_{entity_kind}",
        ),
        explanation=(
            "Explicit official-site structured metadata classified a public, "
            f"same-origin {entity_kind}. It is high fit only; no evidence or "
            "buyer intent was inferred."
        ),
        metadata_description=record.description,
    )


def classify_official_site_page(
    seed_plan: OfficialSiteSeedPlan,
    page: OfficialSiteFetchedPage,
) -> OfficialSiteClassificationBatch:
    """Return only source-grounded, allowed candidates for one official page.

    A metadata object's URL may equal the raw seed URL, but that is permitted
    only after an explicit recognized type (for example ``Organization``) has
    classified it.  There is no URL-only, title-only, HTML, or text fallback.
    """

    if not isinstance(seed_plan, OfficialSiteSeedPlan):
        raise ValueError("seed_plan must be an OfficialSiteSeedPlan")
    if not isinstance(page, OfficialSiteFetchedPage):
        raise ValueError("page must be an OfficialSiteFetchedPage")

    if not seed_plan.is_planned:
        return OfficialSiteClassificationBatch(
            proposals=(),
            skipped=(OfficialSiteProposalSkip("candidate_generation_seed_not_planned"),),
        )
    if not _strict_seed_scope(seed_plan) or not _candidate_limit(seed_plan):
        return OfficialSiteClassificationBatch(
            proposals=(),
            skipped=(OfficialSiteProposalSkip("candidate_generation_scope_not_supported"),),
        )
    if not _same_origin(page.url, seed_plan.origin_url):
        return OfficialSiteClassificationBatch(
            proposals=(),
            skipped=(OfficialSiteProposalSkip("page_outside_seed_origin"),),
        )

    proposals: list[OfficialSiteCandidateProposal] = []
    skipped: list[OfficialSiteProposalSkip] = []
    seen_entities: set[tuple[EntityKind, str]] = set()
    candidate_limit = _candidate_limit(seed_plan)

    for record in _metadata_records(page):
        candidates = _metadata_kinds(record.source, record.schema_types)
        if not candidates:
            skipped.append(
                OfficialSiteProposalSkip(
                    "metadata_type_not_supported",
                    metadata_source=record.source,
                    metadata_index=record.source_index,
                )
            )
            continue
        if record.canonical_url is None:
            skipped.append(
                OfficialSiteProposalSkip(
                    "metadata_missing_public_url",
                    metadata_source=record.source,
                    metadata_index=record.source_index,
                )
            )
            continue
        if not _same_origin(record.canonical_url, seed_plan.origin_url):
            skipped.append(
                OfficialSiteProposalSkip(
                    "metadata_url_outside_seed_origin",
                    metadata_source=record.source,
                    metadata_index=record.source_index,
                )
            )
            continue

        for entity_kind, metadata_type in candidates:
            if entity_kind not in seed_plan.allowed_candidate_kinds:
                skipped.append(
                    OfficialSiteProposalSkip(
                        "target_type_not_enabled",
                        metadata_source=record.source,
                        metadata_index=record.source_index,
                    )
                )
                continue
            entity_key = (entity_kind, record.canonical_url)
            if entity_key in seen_entities:
                skipped.append(
                    OfficialSiteProposalSkip(
                        "duplicate_entity",
                        metadata_source=record.source,
                        metadata_index=record.source_index,
                    )
                )
                continue
            if len(proposals) >= candidate_limit:
                skipped.append(
                    OfficialSiteProposalSkip(
                        "candidate_limit_reached",
                        metadata_source=record.source,
                        metadata_index=record.source_index,
                    )
                )
                continue

            proposal = _proposal(
                seed_plan=seed_plan,
                page=page,
                record=record,
                entity_kind=entity_kind,
                metadata_type=metadata_type,
            )
            proposals.append(proposal)
            seen_entities.add(entity_key)

    return OfficialSiteClassificationBatch(tuple(proposals), tuple(skipped))


__all__ = [
    "MAX_JSON_LD_BLOCKS",
    "MAX_JSON_LD_RECORDS",
    "MAX_OPEN_GRAPH_FIELDS",
    "MAX_PAGE_HTML_CHARS",
    "MAX_PAGE_TEXT_CHARS",
    "OfficialSiteCandidateProposal",
    "OfficialSiteCandidateProvenance",
    "OfficialSiteClassificationBatch",
    "OfficialSiteFetchedPage",
    "OfficialSiteMetadataRecord",
    "OfficialSiteProposalSkip",
    "classify_official_site_page",
]
