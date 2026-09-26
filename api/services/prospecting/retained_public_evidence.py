"""Bounded evidence candidates from already-retained public source records.

This is not a social crawler or a people graph.  It can resolve a small set of
source-native public builder locators and read only a capped set of matching,
already-retained global ``source_posts`` rows.  It never fetches a profile,
enumerates a remote posting history, or promotes an observation to a buyer
signal: every proposed observation stays pending for human review.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import parse_qsl, urlsplit
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.services.social.candidate_privacy import redacted_text

from .entity_first import ProspectEvidenceInput, normalize_public_url
from .research_policy import EntityEvidenceResearchPlan


PublicAuthorLocatorSource = Literal["github", "bluesky", "hackernews"]
RetainedEvidenceSkipReason = Literal[
    "author_locator_mismatch",
    "duplicate_source_post",
    "evidence_limit_reached",
    "locator_source_not_allowed",
    "no_direct_evaluation_language",
    "research_not_planned",
]

MAX_AUTHOR_LOCATOR_CHARS = 253
MAX_RETAINED_POST_CHARS = 12_000
MAX_EVIDENCE_EXCERPT_INPUT_CHARS = 1_800

_LOCATOR_SOURCES = frozenset({"github", "bluesky", "hackernews"})
_GITHUB_HANDLE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$")
_BLUESKY_HANDLE = re.compile(r"^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$")
_HACKER_NEWS_HANDLE = re.compile(r"^[a-z0-9_-]{1,64}$")
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+|\n+")
_EVALUATION_ACTION = re.compile(
    r"\b(?:tried|trying|evaluat(?:e|ed|ing|ion)|compar(?:e|ed|ing)|"
    r"switched|switching|migrat(?:ed|ing)|replac(?:ed|ing)|considering|choosing)\b",
    re.IGNORECASE,
)
_EVALUATION_CONTEXT = re.compile(
    r"\b(?:tool|tools|software|platform|service|vendor|product|solution|"
    r"api|automation|crm|outbound|prospect(?:ing)?|lead(?:s)?|growth)\b",
    re.IGNORECASE,
)
_COMPARISON_CONTEXT = re.compile(
    r"\b(?:vs\.?|versus|alternative(?:s)?|instead of|from|to)\b",
    re.IGNORECASE,
)
_FIRST_PERSON = re.compile(r"\b(?:i|we|our team)\b", re.IGNORECASE)
_STRONG_ACTION = re.compile(
    r"\b(?:tried|trying|evaluat(?:e|ed|ing|ion)|compar(?:e|ed|ing)|"
    r"switched|switching|migrat(?:ed|ing)|replac(?:ed|ing))\b",
    re.IGNORECASE,
)
_PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-])?(?:\(?\d{2,4}\)?[\s.-])\d{3,4}[\s.-]\d{3,4}(?!\w)"
)
_EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+"
)


def _uuid(value: Any, *, field_name: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be a UUID") from error


def _source(value: Any) -> PublicAuthorLocatorSource:
    if not isinstance(value, str):
        raise ValueError("source must be a string")
    normalized = value.strip().casefold()
    if normalized not in _LOCATOR_SOURCES:
        raise ValueError("source does not support an exact public author locator")
    return normalized  # type: ignore[return-value]


def _bounded_text(value: Any, *, field_name: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    normalized = re.sub(r"\s+", " ", value).strip()
    if not normalized:
        raise ValueError(f"{field_name} is required")
    if len(normalized) > maximum:
        raise ValueError(f"{field_name} exceeds {maximum} characters")
    return normalized


def _author_locator(source: PublicAuthorLocatorSource, value: Any) -> str:
    locator = _bounded_text(value, field_name="author_locator", maximum=MAX_AUTHOR_LOCATOR_CHARS)
    normalized = locator.casefold()
    pattern = {
        "github": _GITHUB_HANDLE,
        "bluesky": _BLUESKY_HANDLE,
        "hackernews": _HACKER_NEWS_HANDLE,
    }[source]
    if not pattern.fullmatch(normalized):
        raise ValueError("author_locator is not a valid source-native public locator")
    return normalized


def _optional_public_url(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return normalize_public_url(value)
    except ValueError:
        return None


@dataclass(frozen=True)
class RetainedPublicAuthorLocator:
    """A source-native public identity, never a contact or profile-fetch key."""

    source: PublicAuthorLocatorSource
    author_locator: str

    def __post_init__(self) -> None:
        source = _source(self.source)
        object.__setattr__(self, "source", source)
        object.__setattr__(self, "author_locator", _author_locator(source, self.author_locator))


@dataclass(frozen=True)
class RetainedPublicSourceRecord:
    """One global source row held only long enough to propose cited evidence."""

    source_post_id: str
    source: PublicAuthorLocatorSource
    author_locator: str
    body: str = field(repr=False)
    observed_at: datetime
    source_url: str | None = None

    def __post_init__(self) -> None:
        source = _source(self.source)
        observed_at = self.observed_at
        if not isinstance(observed_at, datetime) or observed_at.tzinfo is None:
            raise ValueError("observed_at must be timezone-aware")
        body = _bounded_text(self.body, field_name="body", maximum=MAX_RETAINED_POST_CHARS)
        object.__setattr__(self, "source_post_id", _uuid(self.source_post_id, field_name="source_post_id"))
        object.__setattr__(self, "source", source)
        object.__setattr__(self, "author_locator", _author_locator(source, self.author_locator))
        object.__setattr__(self, "body", body)
        object.__setattr__(self, "observed_at", observed_at.astimezone(timezone.utc))
        object.__setattr__(self, "source_url", _optional_public_url(self.source_url))


@dataclass(frozen=True)
class RetainedEvidenceProposalBatch:
    """Pure pending observations; no result implies interest or buyer intent."""

    evidence: tuple[ProspectEvidenceInput, ...]
    skipped_by_reason: dict[RetainedEvidenceSkipReason, int]


def resolve_retained_public_author_locator(
    *,
    entity_kind: str,
    canonical_url: str,
) -> RetainedPublicAuthorLocator | None:
    """Resolve only strict profile URLs into source-native retained-row keys.

    Accounts and projects deliberately do not infer a person from a company or
    repository URL. A builder can opt into the boundary simply by using one of
    the exact public profile URL shapes below as its canonical locator.
    """

    if entity_kind != "builder":
        return None
    try:
        normalized = normalize_public_url(canonical_url)
    except ValueError:
        return None
    parsed = urlsplit(normalized)
    if parsed.scheme != "https" or parsed.fragment:
        return None
    host = (parsed.hostname or "").casefold().rstrip(".")
    path = [segment for segment in parsed.path.split("/") if segment]

    if host == "github.com" and not parsed.query and len(path) == 1:
        try:
            return RetainedPublicAuthorLocator("github", path[0])
        except ValueError:
            return None
    if host == "bsky.app" and not parsed.query and len(path) == 2 and path[0].casefold() == "profile":
        try:
            return RetainedPublicAuthorLocator("bluesky", path[1])
        except ValueError:
            return None
    if host == "news.ycombinator.com" and path == ["user"]:
        parameters = parse_qsl(parsed.query, keep_blank_values=True)
        if len(parameters) != 1 or parameters[0][0] != "id" or not parameters[0][1]:
            return None
        try:
            return RetainedPublicAuthorLocator("hackernews", parameters[0][1])
        except ValueError:
            return None
    return None


def load_retained_public_author_records(
    conn: Connection,
    *,
    locator: RetainedPublicAuthorLocator,
    limit: int,
) -> tuple[RetainedPublicSourceRecord, ...]:
    """Read a finite exact-author slice from the global retained corpus only.

    This SQL boundary neither invokes a connector nor uses a broad text query.
    It is intentionally unable to retrieve tenant-owned source rows, remote
    profile data, or unbounded author history.
    """

    if not isinstance(locator, RetainedPublicAuthorLocator):
        raise ValueError("locator must be a RetainedPublicAuthorLocator")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 10:
        raise ValueError("limit must be between 1 and 10")

    rows = conn.execute(
        text(
            """
            SELECT post.id,
                   post.source,
                   post.author_handle,
                   LEFT(COALESCE(post.body, post.text, ''), :body_limit) AS body,
                   COALESCE(post.posted_at, post.published_at, post.created_at) AS observed_at,
                   post.url AS source_url
              FROM public.source_posts AS post
             WHERE post.tenant_id IS NULL
               AND post.source = :source
               AND post.source_post_id IS NOT NULL
               AND LOWER(post.author_handle) = :author_locator
             ORDER BY COALESCE(post.posted_at, post.published_at, post.created_at) DESC NULLS LAST,
                      post.id DESC
             LIMIT :limit
            """
        ),
        {
            "source": locator.source,
            "author_locator": locator.author_locator,
            "body_limit": MAX_RETAINED_POST_CHARS,
            "limit": limit,
        },
    ).mappings()
    records: list[RetainedPublicSourceRecord] = []
    for row in rows:
        try:
            records.append(
                RetainedPublicSourceRecord(
                    source_post_id=row.get("id"),
                    source=row.get("source"),
                    author_locator=row.get("author_handle"),
                    body=row.get("body"),
                    observed_at=row.get("observed_at"),
                    source_url=row.get("source_url"),
                )
            )
        except (AttributeError, TypeError, ValueError):
            # A corrupted retained row is not a reason to widen or retry a
            # source query. The worker records a bounded aggregate separately.
            continue
    return tuple(records)


def _evaluation_excerpt(body: str) -> tuple[str, Literal["moderate", "strong"]] | None:
    for sentence in _SENTENCE_BOUNDARY.split(body):
        candidate = sentence.strip()
        if not candidate or not _EVALUATION_ACTION.search(candidate):
            continue
        if not (_EVALUATION_CONTEXT.search(candidate) or _COMPARISON_CONTEXT.search(candidate)):
            continue
        excerpt = candidate[:MAX_EVIDENCE_EXCERPT_INPUT_CHARS]
        # The SQL evidence guard requires a public-source excerpt to remain an
        # exact substring of the retained row. ``ProspectEvidenceInput``
        # redacts email, phone, and credential material, so skip any sentence
        # that would change during that safety pass instead of persisting a
        # citation that cannot be verified as grounded.
        if _EMAIL_PATTERN.search(excerpt) or _PHONE_PATTERN.search(excerpt):
            continue
        redacted = redacted_text(excerpt, maximum=2_000)
        redacted = _PHONE_PATTERN.sub("[redacted-phone]", redacted)
        if redacted != excerpt:
            continue
        strength: Literal["moderate", "strong"] = "moderate"
        if _FIRST_PERSON.search(candidate) and _STRONG_ACTION.search(candidate):
            strength = "strong"
        return excerpt, strength
    return None


def _increment(
    reasons: dict[RetainedEvidenceSkipReason, int],
    reason: RetainedEvidenceSkipReason,
) -> None:
    reasons[reason] = reasons.get(reason, 0) + 1


def propose_retained_public_evaluation_evidence(
    plan: EntityEvidenceResearchPlan,
    *,
    targeting_profile_id: str,
    research_run_id: str,
    locator: RetainedPublicAuthorLocator,
    records: Iterable[RetainedPublicSourceRecord],
) -> RetainedEvidenceProposalBatch:
    """Create only pending direct-evaluation observations from retained rows.

    ``strong`` is evidence strength, not a buyer prediction. The database can
    move an assessment to ``strong_buyer_signal`` only after a human accepts a
    fresh, cited observation and the target already has sufficient fit.
    """

    if not isinstance(plan, EntityEvidenceResearchPlan):
        raise ValueError("plan must be an EntityEvidenceResearchPlan")
    if not isinstance(locator, RetainedPublicAuthorLocator):
        raise ValueError("locator must be a RetainedPublicAuthorLocator")
    if not plan.is_planned or not plan.allow_retained_public_author_locator_search:
        return RetainedEvidenceProposalBatch((), {"research_not_planned": 1})
    if locator.source not in plan.public_sources:
        return RetainedEvidenceProposalBatch((), {"locator_source_not_allowed": 1})

    evidence: list[ProspectEvidenceInput] = []
    skipped: dict[RetainedEvidenceSkipReason, int] = {}
    seen_source_posts: set[str] = set()
    scanned = 0
    for record in records:
        if scanned >= plan.source_result_limit_per_entity:
            break
        scanned += 1
        if not isinstance(record, RetainedPublicSourceRecord):
            _increment(skipped, "author_locator_mismatch")
            continue
        if record.source != locator.source or record.author_locator != locator.author_locator:
            _increment(skipped, "author_locator_mismatch")
            continue
        if record.source_post_id in seen_source_posts:
            _increment(skipped, "duplicate_source_post")
            continue
        seen_source_posts.add(record.source_post_id)
        if len(evidence) >= plan.evidence_limit:
            _increment(skipped, "evidence_limit_reached")
            break
        detected = _evaluation_excerpt(record.body)
        if detected is None:
            _increment(skipped, "no_direct_evaluation_language")
            continue
        excerpt, strength = detected
        evidence.append(
            ProspectEvidenceInput(
                targeting_profile_id=targeting_profile_id,
                prospect_entity_id=plan.entity_id,
                research_run_id=research_run_id,
                evidence_type="evaluation",
                summary=(
                    "A retained public post contains direct tool-evaluation "
                    "language. Review the cited source before accepting it."
                ),
                evidence_source_kind="public_source",
                source=record.source,
                # ``source_post_id`` is the immutable citation. Do not set an
                # independently normalized URL here: the database guard
                # deliberately compares public-source URLs byte-for-byte with
                # the retained row, and a harmless URL normalization would make
                # a valid source fail that provenance check.
                source_url=None,
                source_post_id=record.source_post_id,
                evidence_excerpt=excerpt,
                observed_at=record.observed_at,
                evidence_strength=strength,
                evidence_status="pending",
            )
        )
    return RetainedEvidenceProposalBatch(tuple(evidence), skipped)


__all__ = [
    "MAX_EVIDENCE_EXCERPT_INPUT_CHARS",
    "MAX_RETAINED_POST_CHARS",
    "PublicAuthorLocatorSource",
    "RetainedEvidenceProposalBatch",
    "RetainedEvidenceSkipReason",
    "RetainedPublicAuthorLocator",
    "RetainedPublicSourceRecord",
    "load_retained_public_author_records",
    "propose_retained_public_evaluation_evidence",
    "resolve_retained_public_author_locator",
]
