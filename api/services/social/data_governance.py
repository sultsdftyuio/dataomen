"""Privacy controls for Arcli's public-source discovery corpus.

The collector is deliberately limited to configured public providers.  This
module is the single storage boundary for content minimisation, sensitive
content exclusion, retention, and approved removal suppressions.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Sequence

from sqlalchemy import text

from api.services.embeddings import _database_engine

logger = logging.getLogger(__name__)


DEFAULT_PUBLIC_DATA_RETENTION_DAYS = 30
_MIN_PUBLIC_DATA_RETENTION_DAYS = 7
_MAX_PUBLIC_DATA_RETENTION_DAYS = 90
DEFAULT_PRIVACY_REQUEST_RETENTION_DAYS = 90
_MIN_PRIVACY_REQUEST_RETENTION_DAYS = 30
_MAX_PRIVACY_REQUEST_RETENTION_DAYS = 365
_SUPPORTED_PUBLIC_SOURCES = frozenset(
    {"hackernews", "bluesky", "stackexchange", "github", "lemmy", "twitter"}
)

# We do not attempt to infer protected traits from ordinary product language.
# These expressions only exclude posts that explicitly discuss a sensitive
# category or a minor, where discovery would be inappropriate.
_SENSITIVE_CONTENT_PATTERN = re.compile(
    r"\b(?:"
    r"(?:mental\s+health|medical\s+diagnos(?:is|ed)|health\s+condition|"
    r"pregnan(?:t|cy)|hiv|aids|disabilit(?:y|ies)|therapy|therapist)|"
    r"(?:race|racial|ethnic(?:ity)?|religion|religious|muslim|christian|jewish|"
    r"sexual\s+orientation|gay|lesbian|transgender|gender\s+identity)|"
    r"(?:political\s+(?:party|affiliation)|voting\s+history|election\s+campaign)|"
    r"(?:minor(?:s)?|under\s*(?:13|16|18)|child(?:ren)?|teen(?:ager)?s?)"
    r")\b",
    re.IGNORECASE,
)
_EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}(?![\w.-])",
    re.IGNORECASE,
)
_PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-])?(?:\(?\d{2,4}\)?[\s.-])\d{3,4}[\s.-]\d{3,4}(?!\w)"
)


@dataclass(frozen=True)
class PublicDataMaintenanceResult:
    """Counts from one idempotent retention pass."""

    skipped: bool = False
    lead_matches_deleted: int = 0
    source_posts_deleted: int = 0
    discovery_evidence_deleted: int = 0
    removal_requests_anonymized: int = 0


def public_data_retention_days() -> int:
    """Return a bounded retention window; malformed values never extend it."""

    raw_value = os.getenv(
        "ARCLI_PUBLIC_DATA_RETENTION_DAYS",
        str(DEFAULT_PUBLIC_DATA_RETENTION_DAYS),
    )
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        logger.warning(
            "public_data_retention_days_invalid value=%s fallback_days=%s",
            raw_value,
            DEFAULT_PUBLIC_DATA_RETENTION_DAYS,
        )
        return DEFAULT_PUBLIC_DATA_RETENTION_DAYS
    return max(_MIN_PUBLIC_DATA_RETENTION_DAYS, min(_MAX_PUBLIC_DATA_RETENTION_DAYS, value))


def privacy_request_retention_days() -> int:
    """Keep only the suppression identity after a resolved request ages out."""

    raw_value = os.getenv(
        "ARCLI_PRIVACY_REQUEST_RETENTION_DAYS",
        str(DEFAULT_PRIVACY_REQUEST_RETENTION_DAYS),
    )
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return DEFAULT_PRIVACY_REQUEST_RETENTION_DAYS
    return max(
        _MIN_PRIVACY_REQUEST_RETENTION_DAYS,
        min(_MAX_PRIVACY_REQUEST_RETENTION_DAYS, value),
    )


def allowed_public_sources() -> frozenset[str]:
    """Return the deployment-approved public providers, never arbitrary hosts."""

    configured = os.getenv("ARCLI_PUBLIC_SOURCE_ALLOWLIST", "").strip()
    if not configured:
        return _SUPPORTED_PUBLIC_SOURCES
    requested = {
        source.strip().casefold()
        for source in configured.split(",")
        if source.strip()
    }
    rejected = requested.difference(_SUPPORTED_PUBLIC_SOURCES)
    if rejected:
        logger.warning(
            "public_source_allowlist_ignored_unknown_sources sources=%s",
            sorted(rejected),
        )
    return frozenset(requested.intersection(_SUPPORTED_PUBLIC_SOURCES))


def public_source_is_allowed(source: object) -> bool:
    normalized_source = str(source or "").strip().casefold()
    return normalized_source in allowed_public_sources()


def _redact_direct_contact_details(value: str | None) -> str | None:
    if value is None:
        return None
    redacted = _EMAIL_PATTERN.sub("[email removed]", value)
    return _PHONE_PATTERN.sub("[phone removed]", redacted)


def prepare_public_post_for_storage(post: Any) -> Any | None:
    """Apply source policy, sensitive-content exclusion, and minimisation.

    The URL and provider handle remain available solely to link back to the
    original public discussion and to honour a future removal request.  We do
    not collect profile bios, private content, or contact enrichment.
    """

    source = str(getattr(post, "source", "") or "").strip().casefold()
    if not public_source_is_allowed(source):
        logger.info("public_source_post_excluded source=%s reason=source_not_allowed", source)
        return None

    title = str(getattr(post, "title", "") or "")
    body = str(getattr(post, "body", "") or "")
    if _SENSITIVE_CONTENT_PATTERN.search(f"{title}\n{body}"):
        logger.info("public_source_post_excluded source=%s reason=sensitive_or_minor_content", source)
        return None

    # All provider contracts in this ingestion path are Pydantic v2 models.
    # Keep a defensive fallback so an adapter cannot accidentally bypass the
    # text minimisation if it returns a compatible custom object.
    updates = {
        "title": _redact_direct_contact_details(getattr(post, "title", None)),
        "body": _redact_direct_contact_details(getattr(post, "body", None)),
    }
    model_copy = getattr(post, "model_copy", None)
    if callable(model_copy):
        return model_copy(update=updates)
    for key, value in updates.items():
        if hasattr(post, key):
            setattr(post, key, value)
    return post


def prepare_public_posts_for_storage(posts: Sequence[Any]) -> list[Any]:
    """Filter a provider batch without retaining rejected content in logs."""

    prepared: list[Any] = []
    for post in posts:
        sanitized = prepare_public_post_for_storage(post)
        if sanitized is not None:
            prepared.append(sanitized)
    return prepared


def _governance_schema_enforced() -> bool:
    """Keep old deployments compatible until the required SQL contract is live."""

    return os.getenv("ARCLI_PUBLIC_DATA_GOVERNANCE_ENFORCEMENT", "false").strip().casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }


def filter_approved_removals(posts: Sequence[Any]) -> list[Any]:
    """Never re-collect content from a completed, verified removal request.

    This lookup is enabled only after the matching database migration has been
    applied.  When enabled, a lookup failure stops persistence rather than
    silently defeating a completed removal request.
    """

    if not posts or not _governance_schema_enforced():
        return list(posts)

    candidates = [
        (
            post,
            {
            "source": str(getattr(post, "source", "") or "").strip().casefold(),
            "source_post_id": str(getattr(post, "source_post_id", "") or "").strip(),
            "author_handle": str(getattr(post, "author_handle", "") or "").strip(),
            "source_url": str(getattr(post, "url", "") or "").strip(),
            },
        )
        for post in posts
    ]
    candidates = [
        (post, identity)
        for post, identity in candidates
        if identity["source"] and identity["source_post_id"]
    ]
    if not candidates:
        return []

    sources = sorted({identity["source"] for _, identity in candidates})
    with _database_engine().connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT source, source_post_id, author_handle, source_url
                  FROM public.public_data_removal_requests
                 WHERE status = 'completed'
                   AND source = ANY(:sources)
                """
            ),
            {"sources": sources},
        ).mappings()
        suppressions = [dict(row) for row in rows]

    kept: list[Any] = []
    for post, identity in candidates:
        suppressed = any(
            suppression["source"] == identity["source"]
            and (
                (
                    suppression.get("source_post_id")
                    and suppression["source_post_id"] == identity["source_post_id"]
                )
                or (
                    suppression.get("author_handle")
                    and identity["author_handle"]
                    and str(suppression["author_handle"]).casefold()
                    == identity["author_handle"].casefold()
                )
                or (
                    suppression.get("source_url")
                    and suppression["source_url"] == identity["source_url"]
                )
            )
            for suppression in suppressions
        )
        if suppressed:
            logger.info(
                "public_source_post_excluded source=%s reason=completed_removal_request",
                identity["source"],
            )
        else:
            kept.append(post)
    return kept


def run_public_data_retention() -> PublicDataMaintenanceResult:
    """Delete expired raw public content and every tenant lead snapshot of it."""

    retention_days = public_data_retention_days()
    request_retention_days = privacy_request_retention_days()
    engine = _database_engine()
    with engine.begin() as conn:
        locked = conn.execute(
            text("SELECT pg_try_advisory_xact_lock(:lock_id)"),
            {"lock_id": 941_728_311},
        ).scalar()
        if not locked:
            return PublicDataMaintenanceResult(skipped=True)

        # Remove tenant-visible copies first.  Deleting source_posts alone
        # would only null the FK and leave the JSON snapshots behind.
        lead_matches_deleted = conn.execute(
            text(
                """
                WITH expired_source_posts AS (
                    SELECT id
                      FROM public.source_posts
                     WHERE tenant_id IS NULL
                       AND source_post_id IS NOT NULL
                       AND COALESCE(posted_at, created_at)
                           < NOW() - (:retention_days * INTERVAL '1 day')
                )
                DELETE FROM public.lead_matches AS lead_match
                 USING expired_source_posts
                 WHERE lead_match.source_post_id = expired_source_posts.id
                """
            ),
            {"retention_days": retention_days},
        ).rowcount
        source_posts_deleted = conn.execute(
            text(
                """
                DELETE FROM public.source_posts
                 WHERE tenant_id IS NULL
                   AND source_post_id IS NOT NULL
                   AND COALESCE(posted_at, created_at)
                       < NOW() - (:retention_days * INTERVAL '1 day')
                """
            ),
            {"retention_days": retention_days},
        ).rowcount
        discovery_evidence_deleted = conn.execute(
            text(
                """
                DELETE FROM public.discovery_evidence
                 WHERE COALESCE(observed_at, created_at)
                       < NOW() - (:retention_days * INTERVAL '1 day')
                """
            ),
            {"retention_days": retention_days},
        ).rowcount
        removal_requests_anonymized = 0
        if _governance_schema_enforced():
            # Keep the completed suppression identity (source/post/handle/URL)
            # while removing the requester's contact details and free-form
            # explanation after a short, documented resolution window.
            removal_requests_anonymized = conn.execute(
                text(
                    """
                    UPDATE public.public_data_removal_requests
                       SET requester_email = 'removed-' || id::text || '@privacy.invalid',
                           requester_fingerprint = repeat('0', 64),
                           details = NULL
                     WHERE status IN ('completed', 'rejected')
                       AND COALESCE(completed_at, updated_at)
                           < NOW() - (:request_retention_days * INTERVAL '1 day')
                       AND requester_email NOT LIKE 'removed-%@privacy.invalid'
                    """
                ),
                {"request_retention_days": request_retention_days},
            ).rowcount

    result = PublicDataMaintenanceResult(
        lead_matches_deleted=max(0, lead_matches_deleted or 0),
        source_posts_deleted=max(0, source_posts_deleted or 0),
        discovery_evidence_deleted=max(0, discovery_evidence_deleted or 0),
        removal_requests_anonymized=max(0, removal_requests_anonymized or 0),
    )
    logger.info(
        "public_data_retention_completed retention_days=%s request_retention_days=%s lead_matches_deleted=%s source_posts_deleted=%s discovery_evidence_deleted=%s removal_requests_anonymized=%s",
        retention_days,
        request_retention_days,
        result.lead_matches_deleted,
        result.source_posts_deleted,
        result.discovery_evidence_deleted,
        result.removal_requests_anonymized,
    )
    return result
