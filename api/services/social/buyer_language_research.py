"""Safe, tenant-scoped buyer-language research over public source material.

This is intentionally a separate product path from opportunity matching.  It
uses the matching brief's validated buyer-language phrases to collect direct
public evidence for a customer to review, but it never creates embeddings,
calls the lead verifier, writes ``lead_matches``, or invokes a CRM webhook.

Public source rows remain global and deduplicated.  The only tenant-owned write
from this module is to ``discovery_evidence``, whose database contract requires
a ``buyer_language_research`` run for the same tenant and service profile.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable, Sequence
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.services.cost_controls import TenantQuotaGuard, env_int
from api.services.embeddings import (
    _database_engine,
    _load_service_profile,
    _service_profile_columns,
)

from .additional_sources import (
    additional_public_source_cache_scope,
    ingest_additional_public_source_posts,
    ingest_x_posts,
)
from .discovery_telemetry import (
    complete_discovery_run,
    create_buyer_language_research_run,
    record_discovery_event,
)
from .legacy_fetch import _table_columns
from .models import (
    ADDITIONAL_PUBLIC_SOURCE_NAMES,
    DISCOVERY_QUERY_TYPES,
    DiscoveryQuery,
    PublicSourcePostRef,
    _profile_discovery_queries,
    _service_profile_from_row,
)
from .public_storage import _result_source_post_refs
from .queries import (
    _compact_public_search_term,
    _initial_source_lookback_hours,
    _is_source_enabled,
    _x_fallback_query,
    claim_additional_public_source_query,
    enabled_additional_public_sources,
    public_source_queries,
    release_additional_public_source_query,
    x_source_is_configured,
)


logger = logging.getLogger(__name__)


BUYER_LANGUAGE_RESEARCH_FLAG = "ARCLI_BUYER_LANGUAGE_RESEARCH_ENABLED"
DEFAULT_BUYER_LANGUAGE_RESEARCH_QUERY_LIMIT = 6
DEFAULT_BUYER_LANGUAGE_RESEARCH_POSTS_PER_QUERY = 12
DEFAULT_BUYER_LANGUAGE_RESEARCH_EVIDENCE_LIMIT = 30
DEFAULT_BUYER_LANGUAGE_RESEARCH_CORPUS_LIMIT = 150
DEFAULT_BUYER_LANGUAGE_RESEARCH_TENANT_LIMIT = 2
DEFAULT_BUYER_LANGUAGE_RESEARCH_WINDOW_SECONDS = 86_400
DEFAULT_BUYER_LANGUAGE_RESEARCH_X_TENANT_LIMIT = 1

_RESEARCH_CACHE_SCOPE_HN = "buyer-language-research-hn-v1"
_RESEARCH_CACHE_SCOPE_X = "buyer-language-research-x-v1"
_RESEARCH_STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "how",
        "i",
        "in",
        "is",
        "it",
        "my",
        "of",
        "on",
        "or",
        "our",
        "the",
        "to",
        "we",
        "with",
    }
)
_MAX_SOURCE_TEXT_CHARS = 16_000
_MAX_EXCERPT_CHARS = 2_000
_MAX_TITLE_CHARS = 1_000
_MAX_URL_CHARS = 4_096


@dataclass(frozen=True)
class BuyerLanguageEvidence:
    """A directly quoted public-source observation for research only."""

    source: str
    source_post_id: str | None
    source_url: str | None
    query_type: str
    query_phrase: str
    title: str | None
    source_text: str
    evidence_excerpt: str
    observed_at: str | datetime | None
    evidence_key: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class BuyerLanguageResearchResult:
    """Bounded operational result for one research run."""

    status: str
    run_id: str | None
    query_count: int
    source_counts: dict[str, int]
    source_failures: int
    public_rows_considered: int
    evidence_candidates: int
    evidence_persisted: int
    x_fallback_outcome: str
    x_fallback_reason: str
    skip_reason: str | None = None


def buyer_language_research_is_enabled() -> bool:
    """Research is deliberately off until an operator explicitly enables it."""

    value = os.getenv(BUYER_LANGUAGE_RESEARCH_FLAG, "false").strip().casefold()
    return value in {"1", "true", "yes", "on"}


def _bounded_env(name: str, default: int, *, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, env_int(name, default)))


def _research_query_limit() -> int:
    return _bounded_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_QUERY_LIMIT",
        DEFAULT_BUYER_LANGUAGE_RESEARCH_QUERY_LIMIT,
        minimum=1,
        maximum=len(DISCOVERY_QUERY_TYPES),
    )


def _research_posts_per_query() -> int:
    return _bounded_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_POSTS_PER_QUERY",
        DEFAULT_BUYER_LANGUAGE_RESEARCH_POSTS_PER_QUERY,
        minimum=1,
        maximum=25,
    )


def _research_evidence_limit() -> int:
    return _bounded_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_EVIDENCE_LIMIT",
        DEFAULT_BUYER_LANGUAGE_RESEARCH_EVIDENCE_LIMIT,
        minimum=1,
        maximum=100,
    )


def _research_corpus_limit() -> int:
    return _bounded_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_CORPUS_LIMIT",
        DEFAULT_BUYER_LANGUAGE_RESEARCH_CORPUS_LIMIT,
        minimum=1,
        maximum=500,
    )


def _research_ref_limit() -> int:
    return _bounded_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_FETCHED_REF_LIMIT",
        200,
        minimum=1,
        maximum=500,
    )


def _research_x_is_enabled() -> bool:
    """Permit paid X only through a second explicit research-specific flag."""

    value = os.getenv("ARCLI_BUYER_LANGUAGE_RESEARCH_X_ENABLED", "false")
    if value.strip().casefold() not in {"1", "true", "yes", "on"}:
        return False
    return x_source_is_configured()


def _claim_research_quota(tenant_id: str) -> bool:
    """Rate-limit user-triggered research before a queue message is published."""

    decision = TenantQuotaGuard().check_and_increment(
        tenant_id=tenant_id,
        counter_name="buyer_language_research",
        limit=env_int(
            "ARCLI_BUYER_LANGUAGE_RESEARCH_TENANT_LIMIT",
            DEFAULT_BUYER_LANGUAGE_RESEARCH_TENANT_LIMIT,
        ),
        window_seconds=env_int(
            "ARCLI_BUYER_LANGUAGE_RESEARCH_TENANT_WINDOW_SECONDS",
            DEFAULT_BUYER_LANGUAGE_RESEARCH_WINDOW_SECONDS,
        ),
    )
    return decision.allowed


def _claim_research_x_quota(tenant_id: str) -> bool:
    """Keep an explicitly opted-in X fallback to one paid request per tenant."""

    decision = TenantQuotaGuard().check_and_increment(
        tenant_id=tenant_id,
        counter_name="buyer_language_research_x_fallback",
        limit=env_int(
            "ARCLI_BUYER_LANGUAGE_RESEARCH_X_TENANT_LIMIT",
            DEFAULT_BUYER_LANGUAGE_RESEARCH_X_TENANT_LIMIT,
        ),
        window_seconds=env_int(
            "ARCLI_BUYER_LANGUAGE_RESEARCH_X_TENANT_WINDOW_SECONDS",
            DEFAULT_BUYER_LANGUAGE_RESEARCH_WINDOW_SECONDS,
        ),
    )
    return decision.allowed


def enqueue_buyer_language_research_job(
    tenant_id: str,
    service_profile_id: str,
) -> str | None:
    """Queue isolated research for an authenticated, tenant-owned profile.

    This is the intended internal API boundary.  Callers should authenticate
    and verify membership before calling it; the worker and database contract
    independently re-check tenant/profile ownership before writing evidence.
    ``None`` means the opt-in feature is disabled or the tenant budget is
    exhausted, not that a lead was found or qualified.
    """

    tenant = tenant_id.strip()
    profile_id = service_profile_id.strip()
    if not tenant or not profile_id:
        raise ValueError("tenant_id and service_profile_id are required")

    if not buyer_language_research_is_enabled():
        logger.info(
            "buyer_language_research_not_enqueued tenant_id=%s service_profile_id=%s reason=%s",
            tenant,
            profile_id,
            "feature_disabled",
        )
        return None
    if not _claim_research_quota(tenant):
        logger.info(
            "buyer_language_research_not_enqueued tenant_id=%s service_profile_id=%s reason=%s",
            tenant,
            profile_id,
            "tenant_quota_exceeded",
        )
        return None

    # Configure before importing the decorated actor.  This matches the
    # existing global-source job producer convention.
    from api.workers.actors import _require_redis_broker, process_buyer_language_research_job

    _require_redis_broker()
    message = process_buyer_language_research_job.send(tenant, profile_id)
    logger.info(
        "buyer_language_research_enqueued tenant_id=%s service_profile_id=%s message_id=%s",
        tenant,
        profile_id,
        message.message_id,
    )
    return str(message.message_id)


def _load_research_profile_and_queries(
    tenant_id: str,
    service_profile_id: str,
) -> tuple[list[DiscoveryQuery], list[str]] | None:
    """Load only the tenant-owned matching brief and its validated queries."""

    engine = _database_engine()
    with engine.begin() as conn:
        columns = _service_profile_columns(conn)
        profile_row = _load_service_profile(
            conn,
            tenant_id,
            service_profile_id,
            columns,
        )
    if not profile_row:
        return None

    profile = _service_profile_from_row(profile_row)
    queries = public_source_queries(
        profile,
        discovery_queries=_profile_discovery_queries(profile_row),
    )[:_research_query_limit()]
    return queries, list(profile.negative_keywords)


def _cache_scope_for_source(source: str) -> str:
    if source == "hackernews":
        return _RESEARCH_CACHE_SCOPE_HN
    if source == "x":
        return _RESEARCH_CACHE_SCOPE_X
    return additional_public_source_cache_scope(source)


def _record_event(
    run_id: str | None,
    tenant_id: str,
    *,
    source: str,
    query_type: str,
    query: str,
    phase: str,
    outcome: str,
    details: dict[str, Any] | None = None,
) -> None:
    """Send content-safe telemetry; the shared helper hashes the phrase."""

    record_discovery_event(
        run_id,
        tenant_id,
        source=source,
        query_type=query_type,
        query=query,
        phase=phase,
        outcome=outcome,
        details=details or {},
    )


def _search_hackernews(
    *,
    tenant_id: str,
    run_id: str,
    queries: Sequence[DiscoveryQuery],
    lookback_hours: int,
    posts_per_query: int,
) -> tuple[int, int, set[str], list[PublicSourcePostRef], int]:
    """Run the free HN phase first, isolating provider failures to HN."""

    if not _is_source_enabled("ARCLI_HN_INGESTION_ENABLED"):
        return 0, 0, set(), [], 0

    from .activation import ingest_hn_posts

    hits = 0
    plausible_hits = 0
    plausible_types: set[str] = set()
    refs: list[PublicSourcePostRef] = []
    failures = 0
    for query in queries:
        scope = _cache_scope_for_source("hackernews")
        if not claim_additional_public_source_query(
            source="hackernews",
            query=query.phrase,
            since_hours_ago=lookback_hours,
            scope=scope,
        ):
            _record_event(
                run_id,
                tenant_id,
                source="hackernews",
                query_type=query.query_type,
                query=query.phrase,
                phase="search",
                outcome="cached",
                details={"cache_status": "hit"},
            )
            continue
        try:
            result = ingest_hn_posts(
                query.phrase,
                lookback_hours,
                posts_per_query,
                query_type=query.query_type,
            )
        except Exception as exc:
            release_additional_public_source_query(
                source="hackernews",
                query=query.phrase,
                since_hours_ago=lookback_hours,
                scope=scope,
            )
            failures += 1
            _record_event(
                run_id,
                tenant_id,
                source="hackernews",
                query_type=query.query_type,
                query=query.phrase,
                phase="search",
                outcome="failed",
                details={"error_type": exc.__class__.__name__},
            )
            logger.warning(
                "buyer_language_research_source_failed tenant_id=%s source=%s error_type=%s",
                tenant_id,
                "hackernews",
                exc.__class__.__name__,
            )
            break

        result_hits = int(getattr(result, "hits_found", 0) or 0)
        result_plausible_hits = int(getattr(result, "plausible_hits", 0) or 0)
        if result_hits == 0:
            release_additional_public_source_query(
                source="hackernews",
                query=query.phrase,
                since_hours_ago=lookback_hours,
                scope=scope,
            )
        hits += result_hits
        plausible_hits += result_plausible_hits
        if result_plausible_hits:
            plausible_types.add(query.query_type)
        refs.extend(_result_source_post_refs(result, source="hackernews"))
        _record_event(
            run_id,
            tenant_id,
            source="hackernews",
            query_type=query.query_type,
            query=query.phrase,
            phase="search",
            outcome="completed",
            details={
                "hits_found": result_hits,
                "plausible_hits": result_plausible_hits,
                "new_inserts": int(getattr(result, "inserted_count", 0) or 0),
            },
        )
    return hits, plausible_hits, plausible_types, refs, failures


def _search_additional_sources(
    *,
    tenant_id: str,
    run_id: str,
    queries: Sequence[DiscoveryQuery],
    lookback_hours: int,
    posts_per_query: int,
) -> tuple[dict[str, int], int, set[str], list[PublicSourcePostRef], int]:
    """Search enabled free sources after HN; one outage never stops the rest."""

    source_counts: dict[str, int] = {}
    plausible_hits = 0
    plausible_types: set[str] = set()
    refs: list[PublicSourcePostRef] = []
    failures = 0
    for source in enabled_additional_public_sources():
        if source not in ADDITIONAL_PUBLIC_SOURCE_NAMES:
            continue
        source_hits = 0
        source_failed = False
        scope = _cache_scope_for_source(source)
        for query in queries:
            if not claim_additional_public_source_query(
                source=source,
                query=query.phrase,
                since_hours_ago=lookback_hours,
                scope=scope,
            ):
                _record_event(
                    run_id,
                    tenant_id,
                    source=source,
                    query_type=query.query_type,
                    query=query.phrase,
                    phase="search",
                    outcome="cached",
                    details={"cache_status": "hit"},
                )
                continue
            try:
                result = ingest_additional_public_source_posts(
                    source,
                    query.phrase,
                    lookback_hours,
                    posts_per_query,
                    query_type=query.query_type,
                )
            except Exception as exc:
                release_additional_public_source_query(
                    source=source,
                    query=query.phrase,
                    since_hours_ago=lookback_hours,
                    scope=scope,
                )
                failures += 1
                source_failed = True
                _record_event(
                    run_id,
                    tenant_id,
                    source=source,
                    query_type=query.query_type,
                    query=query.phrase,
                    phase="search",
                    outcome="failed",
                    details={"error_type": exc.__class__.__name__},
                )
                logger.warning(
                    "buyer_language_research_source_failed tenant_id=%s source=%s error_type=%s",
                    tenant_id,
                    source,
                    exc.__class__.__name__,
                )
                break

            result_hits = int(getattr(result, "hits_found", 0) or 0)
            result_plausible_hits = int(getattr(result, "plausible_hits", 0) or 0)
            if result_hits == 0:
                release_additional_public_source_query(
                    source=source,
                    query=query.phrase,
                    since_hours_ago=lookback_hours,
                    scope=scope,
                )
            source_hits += result_hits
            plausible_hits += result_plausible_hits
            if result_plausible_hits:
                plausible_types.add(query.query_type)
            refs.extend(_result_source_post_refs(result, source=source))
            _record_event(
                run_id,
                tenant_id,
                source=source,
                query_type=query.query_type,
                query=query.phrase,
                phase="search",
                outcome="completed",
                details={
                    "hits_found": result_hits,
                    "plausible_hits": result_plausible_hits,
                    "new_inserts": int(getattr(result, "inserted_count", 0) or 0),
                },
            )
        source_counts[source] = source_hits
        if source_failed:
            source_counts.setdefault(source, 0)
    return source_counts, plausible_hits, plausible_types, refs, failures


def _has_sufficient_free_evidence(
    *,
    plausible_hits: int,
    plausible_query_types: set[str],
) -> bool:
    min_hits = _bounded_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_FREE_MIN_PLAUSIBLE_HITS",
        2,
        minimum=1,
        maximum=100,
    )
    min_types = _bounded_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_FREE_MIN_QUERY_TYPES",
        2,
        minimum=1,
        maximum=len(DISCOVERY_QUERY_TYPES),
    )
    return plausible_hits >= min_hits and len(plausible_query_types) >= min_types


def _search_x_once_if_explicitly_enabled(
    *,
    tenant_id: str,
    run_id: str,
    queries: Sequence[DiscoveryQuery],
    lookback_hours: int,
    posts_per_query: int,
    plausible_hits: int,
    plausible_query_types: set[str],
) -> tuple[int, list[PublicSourcePostRef], str, str]:
    """Perform at most one paid page, only after all free sources were tried."""

    if _has_sufficient_free_evidence(
        plausible_hits=plausible_hits,
        plausible_query_types=plausible_query_types,
    ):
        return 0, [], "not_needed", "sufficient_diverse_free_evidence"
    if not _research_x_is_enabled():
        return 0, [], "disabled", "research_x_disabled_by_default"
    if not _claim_research_x_quota(tenant_id):
        return 0, [], "skipped", "research_x_tenant_quota_exceeded"

    query = _x_fallback_query(list(queries))
    if not query:
        return 0, [], "skipped", "matching_brief_has_no_searchable_terms"
    scope = _cache_scope_for_source("x")
    if not claim_additional_public_source_query(
        source="x",
        query=query,
        since_hours_ago=lookback_hours,
        scope=scope,
    ):
        _record_event(
            run_id,
            tenant_id,
            source="x",
            query_type="fallback",
            query=query,
            phase="fallback",
            outcome="cached",
            details={"cache_status": "hit"},
        )
        return 0, [], "cached", "research_x_query_cache_hit"
    try:
        result = ingest_x_posts(
            query,
            lookback_hours,
            posts_per_query,
            max_pages=1,
        )
    except Exception as exc:
        release_additional_public_source_query(
            source="x",
            query=query,
            since_hours_ago=lookback_hours,
            scope=scope,
        )
        _record_event(
            run_id,
            tenant_id,
            source="x",
            query_type="fallback",
            query=query,
            phase="fallback",
            outcome="failed",
            details={"error_type": exc.__class__.__name__},
        )
        return 0, [], "failed", "research_x_provider_failed"

    hits = int(getattr(result, "hits_found", 0) or 0)
    if hits == 0:
        release_additional_public_source_query(
            source="x",
            query=query,
            since_hours_ago=lookback_hours,
            scope=scope,
        )
    _record_event(
        run_id,
        tenant_id,
        source="x",
        query_type="fallback",
        query=query,
        phase="fallback",
        outcome="completed",
        details={
            "hits_found": hits,
            "new_inserts": int(getattr(result, "inserted_count", 0) or 0),
            "max_pages": 1,
        },
    )
    return hits, _result_source_post_refs(result, source="x"), "completed", "insufficient_diverse_free_evidence"


def _source_post_projection(columns: dict[str, dict[str, str]]) -> str | None:
    required = {"source", "source_post_id", "tenant_id"}
    if not required.issubset(columns):
        return None

    title = "post.title" if "title" in columns else "NULL::text"
    body_parts = [f"post.{name}" for name in ("body", "text") if name in columns]
    body = "COALESCE(" + ", ".join([*body_parts, "''::text"]) + ")"
    url = "post.url" if "url" in columns else "NULL::text"
    observed_parts = [
        f"post.{name}" for name in ("posted_at", "published_at") if name in columns
    ]
    observed = (
        "COALESCE(" + ", ".join(observed_parts) + ")"
        if observed_parts
        else "NULL::timestamptz"
    )
    return f"""
        post.source AS source,
        post.source_post_id AS source_post_id,
        {title} AS title,
        {body} AS body,
        {url} AS source_url,
        {observed} AS observed_at
    """


def _load_research_source_rows(
    *,
    refs: Sequence[PublicSourcePostRef],
    allowed_sources: Sequence[str],
    corpus_limit: int,
) -> list[dict[str, Any]]:
    """Read a bounded global source slice; never query tenant-owned posts."""

    source_names = [source.strip() for source in allowed_sources if source.strip()]
    if not source_names:
        return []
    engine = _database_engine()
    with engine.begin() as conn:
        columns = _table_columns(conn, "source_posts")
        projection = _source_post_projection(columns)
        if not projection:
            logger.warning(
                "buyer_language_research_source_rows_skipped reason=%s",
                "global_source_contract_missing",
            )
            return []

        source_params = {f"source_{index}": source for index, source in enumerate(source_names)}
        source_in = ", ".join(f":source_{index}" for index in range(len(source_names)))
        order_column = (
            "post.posted_at"
            if "posted_at" in columns
            else "post.published_at"
            if "published_at" in columns
            else "post.id"
        )
        recent_rows = conn.execute(
            text(
                f"""
                SELECT {projection}
                  FROM public.source_posts AS post
                 WHERE post.tenant_id IS NULL
                   AND post.source IN ({source_in})
                 ORDER BY {order_column} DESC NULLS LAST
                 LIMIT :corpus_limit
                """
            ),
            {**source_params, "corpus_limit": corpus_limit},
        ).mappings()
        rows = [dict(row) for row in recent_rows]

        bounded_refs: list[PublicSourcePostRef] = []
        seen_refs: set[tuple[str, str]] = set()
        for ref in refs:
            if ref.source not in source_names:
                continue
            key = (ref.source, ref.source_post_id)
            if key in seen_refs:
                continue
            seen_refs.add(key)
            bounded_refs.append(ref)
            if len(bounded_refs) >= _research_ref_limit():
                break
        if not bounded_refs:
            return _dedupe_source_rows(rows)

        pair_conditions: list[str] = []
        ref_params: dict[str, str] = {}
        for index, ref in enumerate(bounded_refs):
            source_key = f"ref_source_{index}"
            post_key = f"ref_post_{index}"
            pair_conditions.append(
                f"(post.source = :{source_key} AND post.source_post_id = :{post_key})"
            )
            ref_params[source_key] = ref.source
            ref_params[post_key] = ref.source_post_id
        fetched_rows = conn.execute(
            text(
                f"""
                SELECT {projection}
                  FROM public.source_posts AS post
                 WHERE post.tenant_id IS NULL
                   AND ({" OR ".join(pair_conditions)})
                """
            ),
            ref_params,
        ).mappings()
        rows.extend(dict(row) for row in fetched_rows)
    return _dedupe_source_rows(rows)


def _dedupe_source_rows(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        source = _text_value(row.get("source"), maximum=120)
        source_post_id = _text_value(row.get("source_post_id"), maximum=512)
        if not source or not source_post_id:
            continue
        unique.setdefault((source, source_post_id), dict(row))
    return list(unique.values())


def _normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _text_value(value: Any, *, maximum: int) -> str:
    if value is None:
        return ""
    return _normalize_space(str(value))[:maximum]


def _safe_http_url(value: Any) -> str | None:
    candidate = _text_value(value, maximum=_MAX_URL_CHARS)
    if not candidate:
        return None
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return candidate


def _query_tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9][a-z0-9_-]*", value.casefold())
        if len(token) > 1 and token not in _RESEARCH_STOP_WORDS
    }


def _required_token_overlap(query_token_count: int) -> int:
    if query_token_count <= 1:
        return 1
    if query_token_count <= 4:
        return 2
    return min(3, query_token_count)


def _excerpt_around(text_value: str, start: int, end: int) -> str:
    """Return a direct source substring within the schema's evidence bound."""

    left = max(0, start - 500)
    right = min(len(text_value), max(end + 800, left + 1))
    excerpt = text_value[left:right].strip()
    if len(excerpt) <= _MAX_EXCERPT_CHARS:
        return excerpt
    anchor_offset = max(0, start - left)
    truncated_start = max(0, anchor_offset - 500)
    truncated_end = min(len(excerpt), truncated_start + _MAX_EXCERPT_CHARS)
    return excerpt[truncated_start:truncated_end].strip()


def _best_token_overlap_excerpt(
    text_value: str,
    query_tokens: set[str],
) -> tuple[str, set[str]]:
    sentences = re.split(r"(?<=[.!?])\s+|\n+", text_value)
    best_sentence = ""
    best_overlap: set[str] = set()
    for sentence in sentences:
        normalized_sentence = _normalize_space(sentence)
        if not normalized_sentence:
            continue
        overlap = query_tokens.intersection(_query_tokens(normalized_sentence))
        if len(overlap) > len(best_overlap):
            best_sentence = normalized_sentence
            best_overlap = overlap
    if not best_sentence:
        return "", set()
    return best_sentence[:_MAX_EXCERPT_CHARS].strip(), best_overlap


def _direct_evidence_match(
    source_text: str,
    phrase: str,
) -> tuple[str, str, set[str]] | None:
    """Return only direct source wording; this is not an LLM inference."""

    normalized_phrase = _compact_public_search_term(phrase)
    normalized_text = _normalize_space(source_text)
    if not normalized_phrase or not normalized_text:
        return None
    phrase_index = normalized_text.casefold().find(normalized_phrase.casefold())
    if phrase_index >= 0:
        return (
            "exact_phrase",
            _excerpt_around(
                normalized_text,
                phrase_index,
                phrase_index + len(normalized_phrase),
            ),
            _query_tokens(normalized_phrase),
        )

    tokens = _query_tokens(normalized_phrase)
    if not tokens:
        return None
    excerpt, overlap = _best_token_overlap_excerpt(normalized_text, tokens)
    if len(overlap) < _required_token_overlap(len(tokens)):
        return None
    return "token_overlap", excerpt, overlap


def _has_negative_keyword(source_text: str, negative_keywords: Sequence[str]) -> bool:
    normalized_text = source_text.casefold()
    for raw_keyword in negative_keywords:
        keyword = _normalize_space(str(raw_keyword)).casefold()
        if len(keyword) >= 3 and keyword in normalized_text:
            return True
    return False


def _source_text_for_evidence(source_text: str, excerpt: str) -> str:
    """Keep the stored source material bounded while retaining its excerpt."""

    normalized = _normalize_space(source_text)
    if len(normalized) <= _MAX_SOURCE_TEXT_CHARS:
        return normalized
    excerpt_index = normalized.casefold().find(excerpt.casefold())
    if excerpt_index < 0:
        return normalized[:_MAX_SOURCE_TEXT_CHARS]
    start = max(0, excerpt_index - (_MAX_SOURCE_TEXT_CHARS // 3))
    end = min(len(normalized), start + _MAX_SOURCE_TEXT_CHARS)
    start = max(0, end - _MAX_SOURCE_TEXT_CHARS)
    return normalized[start:end].strip()


def _evidence_key(
    *,
    tenant_id: str,
    service_profile_id: str,
    source: str,
    source_post_id: str | None,
    source_text: str,
    query_type: str,
    query_phrase: str,
) -> str:
    material = "\x1f".join(
        (
            tenant_id.strip(),
            service_profile_id.strip(),
            source.casefold(),
            (source_post_id or hashlib.sha256(source_text.encode("utf-8")).hexdigest()).casefold(),
            query_type,
            _normalize_space(query_phrase).casefold(),
        )
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def build_buyer_language_evidence(
    *,
    tenant_id: str,
    service_profile_id: str,
    queries: Sequence[DiscoveryQuery],
    source_rows: Sequence[dict[str, Any]],
    negative_keywords: Sequence[str] = (),
    limit: int | None = None,
) -> list[BuyerLanguageEvidence]:
    """Derive reviewable, direct evidence without inferring a lead or intent.

    A phrase can match a source post exactly, or meet a conservative concrete
    token-overlap threshold.  Every stored excerpt is a literal substring of
    the stored source text, and the metadata labels the weaker overlap case so
    the UI can present it as research material rather than qualification.
    """

    evidence_limit = limit if limit is not None else _research_evidence_limit()
    evidence_limit = max(1, min(100, evidence_limit))
    candidates: list[BuyerLanguageEvidence] = []
    seen_keys: set[str] = set()
    for query in queries:
        if query.query_type not in DISCOVERY_QUERY_TYPES:
            continue
        phrase = _compact_public_search_term(query.phrase)[:512]
        if not phrase:
            continue
        for row in source_rows:
            source = _text_value(row.get("source"), maximum=120)
            source_post_id = _text_value(row.get("source_post_id"), maximum=512) or None
            title = _text_value(row.get("title"), maximum=_MAX_TITLE_CHARS) or None
            body = _text_value(row.get("body") or row.get("text"), maximum=100_000)
            raw_source_text = _normalize_space(
                "\n\n".join(part for part in (title or "", body) if part)
            )
            if not source or not raw_source_text:
                continue
            if _has_negative_keyword(raw_source_text, negative_keywords):
                continue
            direct_match = _direct_evidence_match(raw_source_text, phrase)
            if not direct_match:
                continue
            match_method, excerpt, matched_tokens = direct_match
            stored_source_text = _source_text_for_evidence(raw_source_text, excerpt)
            # The excerpt must remain source-grounded after the retention cap.
            if excerpt.casefold() not in stored_source_text.casefold():
                continue
            evidence_key = _evidence_key(
                tenant_id=tenant_id,
                service_profile_id=service_profile_id,
                source=source,
                source_post_id=source_post_id,
                source_text=stored_source_text,
                query_type=query.query_type,
                query_phrase=phrase,
            )
            if evidence_key in seen_keys:
                continue
            seen_keys.add(evidence_key)
            query_tokens = _query_tokens(phrase)
            candidates.append(
                BuyerLanguageEvidence(
                    source=source,
                    source_post_id=source_post_id,
                    source_url=_safe_http_url(row.get("source_url") or row.get("url")),
                    query_type=query.query_type,
                    query_phrase=phrase,
                    title=title,
                    source_text=stored_source_text,
                    evidence_excerpt=excerpt,
                    observed_at=row.get("observed_at") or row.get("posted_at") or row.get("published_at"),
                    evidence_key=evidence_key,
                    metadata={
                        "research_only": True,
                        "verifier_status": "not_run",
                        "match_method": match_method,
                        "matched_token_count": len(matched_tokens),
                        "query_token_count": len(query_tokens),
                    },
                )
            )
    # Exact wording is more useful for buyer-language research than a looser
    # overlap, and a stable sort makes retries deterministic.
    candidates.sort(
        key=lambda item: (
            item.metadata.get("match_method") != "exact_phrase",
            item.source,
            item.source_post_id or "",
            item.query_type,
        )
    )
    return candidates[:evidence_limit]


def _evidence_contract_is_ready(conn: Connection) -> bool:
    required = {
        "tenant_id",
        "discovery_run_id",
        "service_profile_id",
        "source",
        "source_post_id",
        "source_url",
        "query_type",
        "query_phrase",
        "title",
        "source_text",
        "evidence_excerpt",
        "evidence_status",
        "observed_at",
        "evidence_key",
        "metadata",
    }
    return required.issubset(_table_columns(conn, "discovery_evidence"))


def _persist_buyer_language_evidence(
    *,
    tenant_id: str,
    service_profile_id: str,
    run_id: str,
    evidence: Sequence[BuyerLanguageEvidence],
) -> int:
    """Persist only isolated evidence, guarded by tenant/profile/run SQL."""

    if not evidence:
        return 0
    engine = _database_engine()
    with engine.begin() as conn:
        if not _evidence_contract_is_ready(conn):
            logger.warning(
                "buyer_language_research_evidence_not_persisted tenant_id=%s service_profile_id=%s reason=%s",
                tenant_id,
                service_profile_id,
                "research_evidence_contract_missing",
            )
            return 0
        persisted = 0
        for item in evidence:
            result = conn.execute(
                text(
                    """
                    INSERT INTO public.discovery_evidence (
                        tenant_id,
                        discovery_run_id,
                        service_profile_id,
                        source,
                        source_post_id,
                        source_url,
                        query_type,
                        query_phrase,
                        title,
                        source_text,
                        evidence_excerpt,
                        evidence_status,
                        observed_at,
                        evidence_key,
                        metadata
                    )
                    SELECT
                        :tenant_id,
                        CAST(:run_id AS uuid),
                        CAST(:service_profile_id AS uuid),
                        :source,
                        :source_post_id,
                        :source_url,
                        :query_type,
                        :query_phrase,
                        :title,
                        :source_text,
                        :evidence_excerpt,
                        'accepted',
                        CAST(:observed_at AS timestamptz),
                        :evidence_key,
                        CAST(:metadata AS jsonb)
                    WHERE EXISTS (
                        SELECT 1
                          FROM public.discovery_runs AS run
                          JOIN public.service_profiles AS profile
                            ON profile.id = run.service_profile_id
                           AND profile.tenant_id = run.tenant_id
                         WHERE run.id = CAST(:run_id AS uuid)
                           AND run.tenant_id = :tenant_id
                           AND run.service_profile_id = CAST(:service_profile_id AS uuid)
                           AND run.run_kind = 'buyer_language_research'
                    )
                    ON CONFLICT (tenant_id, service_profile_id, evidence_key) DO NOTHING
                    RETURNING id
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "run_id": run_id,
                    "service_profile_id": service_profile_id,
                    "source": item.source,
                    "source_post_id": item.source_post_id,
                    "source_url": item.source_url,
                    "query_type": item.query_type,
                    "query_phrase": item.query_phrase,
                    "title": item.title,
                    "source_text": item.source_text,
                    "evidence_excerpt": item.evidence_excerpt,
                    "observed_at": (
                        item.observed_at.isoformat()
                        if isinstance(item.observed_at, datetime)
                        else item.observed_at
                    ),
                    "evidence_key": item.evidence_key,
                    "metadata": json.dumps(item.metadata, separators=(",", ":"), sort_keys=True),
                },
            )
            if result.scalar_one_or_none() is not None:
                persisted += 1
    return persisted


def _empty_result(
    *,
    status: str,
    skip_reason: str,
    run_id: str | None = None,
    query_count: int = 0,
) -> BuyerLanguageResearchResult:
    return BuyerLanguageResearchResult(
        status=status,
        run_id=run_id,
        query_count=query_count,
        source_counts={},
        source_failures=0,
        public_rows_considered=0,
        evidence_candidates=0,
        evidence_persisted=0,
        x_fallback_outcome="disabled",
        x_fallback_reason="research_x_disabled_by_default",
        skip_reason=skip_reason,
    )


def run_buyer_language_research(
    tenant_id: str,
    service_profile_id: str,
) -> BuyerLanguageResearchResult:
    """Run bounded research and persist evidence without touching lead workflow.

    The worker may retry unexpected infrastructure failures. Provider failures
    are contained to their source so a useful partial report is still created.
    There is no model/embedding invocation anywhere on this path.
    """

    tenant = tenant_id.strip()
    profile_id = service_profile_id.strip()
    if not tenant or not profile_id:
        raise ValueError("tenant_id and service_profile_id are required")
    if not buyer_language_research_is_enabled():
        return _empty_result(status="skipped", skip_reason="feature_disabled")

    profile_and_queries = _load_research_profile_and_queries(tenant, profile_id)
    if not profile_and_queries:
        return _empty_result(status="skipped", skip_reason="service_profile_not_found")
    queries, negative_keywords = profile_and_queries
    if not queries:
        return _empty_result(
            status="skipped",
            skip_reason="matching_brief_has_no_searchable_terms",
        )

    run_id = create_buyer_language_research_run(
        tenant,
        profile_id,
        [query.to_payload() for query in queries],
    )
    if not run_id:
        # Evidence must never be written without the dedicated tenant-owned run
        # that the database trigger validates.
        return _empty_result(
            status="skipped",
            skip_reason="research_run_unavailable",
            query_count=len(queries),
        )

    _record_event(
        run_id,
        tenant,
        source="buyer_language_research",
        query_type="run",
        query="buyer-language-research",
        phase="batch",
        outcome="started",
        details={"query_count": len(queries)},
    )
    lookback_hours = _initial_source_lookback_hours()
    posts_per_query = _research_posts_per_query()
    try:
        hn_hits, hn_plausible_hits, plausible_types, refs, hn_failures = _search_hackernews(
            tenant_id=tenant,
            run_id=run_id,
            queries=queries,
            lookback_hours=lookback_hours,
            posts_per_query=posts_per_query,
        )
        source_counts = {"hackernews": hn_hits}
        (
            additional_counts,
            additional_plausible_hits,
            additional_plausible_types,
            additional_refs,
            additional_failures,
        ) = _search_additional_sources(
            tenant_id=tenant,
            run_id=run_id,
            queries=queries,
            lookback_hours=lookback_hours,
            posts_per_query=posts_per_query,
        )
        source_counts.update(additional_counts)
        all_refs = [*refs, *additional_refs]
        free_plausible_hits = hn_plausible_hits + additional_plausible_hits
        free_plausible_types = plausible_types.union(additional_plausible_types)

        x_hits, x_refs, x_outcome, x_reason = _search_x_once_if_explicitly_enabled(
            tenant_id=tenant,
            run_id=run_id,
            queries=queries,
            lookback_hours=lookback_hours,
            posts_per_query=posts_per_query,
            plausible_hits=free_plausible_hits,
            plausible_query_types=free_plausible_types,
        )
        if x_outcome in {"completed", "cached"}:
            source_counts["x"] = x_hits
            all_refs.extend(x_refs)

        allowed_sources = [
            source
            for source, enabled in (
                ("hackernews", _is_source_enabled("ARCLI_HN_INGESTION_ENABLED")),
                *[(source, True) for source in enabled_additional_public_sources()],
                ("x", x_outcome in {"completed", "cached"}),
            )
            if enabled
        ]
        source_rows = _load_research_source_rows(
            refs=all_refs,
            allowed_sources=allowed_sources,
            corpus_limit=_research_corpus_limit(),
        )
        evidence = build_buyer_language_evidence(
            tenant_id=tenant,
            service_profile_id=profile_id,
            queries=queries,
            source_rows=source_rows,
            negative_keywords=negative_keywords,
        )
        persisted = _persist_buyer_language_evidence(
            tenant_id=tenant,
            service_profile_id=profile_id,
            run_id=run_id,
            evidence=evidence,
        )
        source_failures = hn_failures + additional_failures + (1 if x_outcome == "failed" else 0)
        status = "partial" if source_failures else "completed"
        result = BuyerLanguageResearchResult(
            status=status,
            run_id=run_id,
            query_count=len(queries),
            source_counts=source_counts,
            source_failures=source_failures,
            public_rows_considered=len(source_rows),
            evidence_candidates=len(evidence),
            evidence_persisted=persisted,
            x_fallback_outcome=x_outcome,
            x_fallback_reason=x_reason,
        )
        complete_discovery_run(
            run_id,
            tenant,
            status=status,
            summary={
                "research_only": True,
                "sources": source_counts,
                "source_failures": source_failures,
                "public_rows_considered": len(source_rows),
                "evidence_candidates": len(evidence),
                "evidence_persisted": persisted,
                "x_fallback": {"outcome": x_outcome, "reason": x_reason},
            },
        )
        _record_event(
            run_id,
            tenant,
            source="buyer_language_research",
            query_type="run",
            query="buyer-language-research",
            phase="batch",
            outcome=status,
            details={
                "source_failures": source_failures,
                "evidence_persisted": persisted,
            },
        )
        return result
    except Exception as exc:
        complete_discovery_run(
            run_id,
            tenant,
            status="failed",
            summary={
                "research_only": True,
                "last_failure": {"error_type": exc.__class__.__name__},
            },
        )
        _record_event(
            run_id,
            tenant,
            source="buyer_language_research",
            query_type="run",
            query="buyer-language-research",
            phase="batch",
            outcome="failed",
            details={"error_type": exc.__class__.__name__},
        )
        raise


__all__ = [
    "BUYER_LANGUAGE_RESEARCH_FLAG",
    "BuyerLanguageEvidence",
    "BuyerLanguageResearchResult",
    "build_buyer_language_evidence",
    "buyer_language_research_is_enabled",
    "enqueue_buyer_language_research_job",
    "run_buyer_language_research",
]
