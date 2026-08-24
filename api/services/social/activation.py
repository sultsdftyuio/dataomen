"""Activation and Hacker News discovery ingestion."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import re
import json
import hashlib
from uuid import uuid4
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Sequence, TypeVar
from urllib.parse import quote

from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.services.cost_controls import TenantQuotaGuard, env_float, env_int
from api.services.client_lifecycle import managed_network_client
from api.services.embeddings import (
    EmbeddingService,
    _as_dict,
    _bind_payload,
    _database_engine,
    _first_document,
    _load_service_profile,
    _service_profile_columns,
    _string_list,
    _string_value,
)
from api.services.integrations.hn_connector import SourcePost
from api.services.integrations.public_source import PublicSourcePost
from api.services.integrations.x_connector import TwitterSourcePost
from api.services.matching import PostEmbedding, find_candidate_matches
from api.services.verifier import (
    CandidatePost,
    ServiceProfile,
    VerificationResult,
    VerifierService,
)

def enqueue_initial_public_source_ingestion(
    tenant_id: str,
    service_profile_id: str | None,
    *,
    discovery_queries_override: Sequence[DiscoveryQuery] | None = None,
    allowed_sources: frozenset[str] | set[str] | None = None,
) -> InitialPublicSourceIngestionPlan:
    """Queue a parallel Fast check from a completed service profile.

    The profile-activation path used to call a legacy Reddit/X fetcher
    directly. This function fans out the global public sources through one
    parent job, which makes early source results matchable immediately while
    retaining one final, tenant-owned completion state for the full check.
    """
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
        logger.warning(
            "initial_public_source_ingestion_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            tenant_id,
            service_profile_id,
            "service_profile_not_found",
        )
        return InitialPublicSourceIngestionPlan([], 0, 0, "service_profile_not_found")

    profile = _service_profile_from_row(profile_row)
    discovery_queries = public_source_search_queries(
        profile,
        discovery_queries=list(discovery_queries_override)
        if discovery_queries_override is not None
        else _profile_discovery_queries(profile_row),
    )
    if not discovery_queries:
        logger.warning(
            "initial_public_source_ingestion_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            tenant_id,
            service_profile_id,
            "matching_brief_has_no_searchable_terms",
        )
        return InitialPublicSourceIngestionPlan(
            [],
            0,
            0,
            "matching_brief_has_no_searchable_terms",
        )

    from api.workers.actors import (
        ingest_initial_public_sources_fast_job,
        ingest_x_job,
        monitor_initial_public_discovery_run,
    )

    lookback_hours = _initial_source_lookback_hours()
    posts_per_query = _initial_source_posts_per_query()
    hn_jobs = 0
    x_jobs = 0
    additional_source_jobs = 0
    normalized_allowed_sources = {
        str(source).strip().casefold()
        for source in (allowed_sources or ())
        if str(source).strip()
    }
    # ``None`` means the normal product-wide activation. An explicit set is
    # a customer Watchlist preference; source controls can reduce coverage but
    # can never enable a connector that deployment policy disabled.
    source_is_allowed = lambda source: (
        not normalized_allowed_sources or source.casefold() in normalized_allowed_sources
    )
    hn_enabled = _is_source_enabled("ARCLI_HN_INGESTION_ENABLED") and source_is_allowed(
        "hackernews"
    )
    additional_sources = tuple(
        source
        for source in enabled_additional_public_sources()
        if source_is_allowed(source)
    )
    x_enabled = x_source_is_configured() and source_is_allowed("x")
    x_skip_reason = (
        None
        if x_enabled
        else (
            "x_not_selected_for_watchlist"
            if normalized_allowed_sources and not source_is_allowed("x")
            else (
                "x_ingestion_disabled"
                if not _is_source_enabled("ARCLI_X_INGESTION_ENABLED")
                else "x_bearer_token_not_configured"
            )
        )
    )
    # Keep source coverage, failures, and X-spend decisions in a tenant-owned
    # report. The helper is fail-open while the additive SQL contract is being
    # rolled out, so it can never block a customer's discovery work.
    discovery_run_id: str | None = None
    discovery_run_started_at: str | None = None
    try:
        from api.services.social.discovery_telemetry import create_discovery_run

        discovery_run_id = create_discovery_run(
            tenant_id,
            service_profile_id,
            [query.to_payload() for query in discovery_queries],
        )
        if discovery_run_id:
            discovery_run_started_at = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        logger.info(
            "discovery_run_creation_skipped tenant_id=%s service_profile_id=%s error_type=%s",
            tenant_id,
            service_profile_id,
            exc.__class__.__name__,
        )
    # All free-source jobs for one activation share this key. The actors use
    # Redis to atomically grant a single X fallback only after the complete
    # free phase lacks plausible buyer-language coverage.
    x_fallback_group_id = (
        uuid4().hex if (hn_enabled or additional_sources) and x_enabled else None
    )
    x_fallback_query = _x_fallback_query(discovery_queries) if x_fallback_group_id else None
    discovery_query_payloads = [query.to_payload() for query in discovery_queries]
    free_sources = (("hackernews",) if hn_enabled else ()) + tuple(additional_sources)
    if free_sources:
        # The parent Fast check fans out each free provider concurrently. It
        # hands early source results to matching as they arrive, but keeps the
        # tenant's discovery run open until every provider has reported.
        fast_job_kwargs: dict[str, Any] = {
            "enabled_sources": list(free_sources),
            "fallback_to_x": x_enabled,
            "tenant_id": tenant_id,
            "service_profile_id": service_profile_id,
        }
        run_completion_managed = False
        if discovery_run_id and discovery_run_started_at:
            try:
                from api.services.social.run_control import initial_discovery_run_limits

                monitor_delay_ms = initial_discovery_run_limits().poll_seconds * 1_000
                monitor_initial_public_discovery_run.send_with_options(
                    args=(
                        tenant_id,
                        str(service_profile_id),
                        discovery_run_id,
                        discovery_run_started_at,
                    ),
                    delay=monitor_delay_ms,
                )
                run_completion_managed = True
            except Exception as exc:
                logger.warning(
                    "initial_public_discovery_monitor_enqueue_failed tenant_id=%s service_profile_id=%s discovery_run_id=%s error_type=%s",
                    tenant_id,
                    service_profile_id,
                    discovery_run_id,
                    exc.__class__.__name__,
                )
        if x_fallback_group_id:
            fast_job_kwargs["x_fallback_group_id"] = x_fallback_group_id
        if x_fallback_query:
            fast_job_kwargs["x_fallback_query"] = x_fallback_query
        if x_skip_reason:
            fast_job_kwargs["x_fallback_disabled_reason"] = x_skip_reason
        if discovery_run_id:
            fast_job_kwargs["discovery_run_id"] = discovery_run_id
        if run_completion_managed:
            fast_job_kwargs["run_completion_managed"] = True
        ingest_initial_public_sources_fast_job.send(
            discovery_query_payloads,
            lookback_hours,
            posts_per_query,
            **fast_job_kwargs,
        )
        hn_jobs = 1 if hn_enabled else 0
        additional_source_jobs = 1 if additional_sources else 0
        x_jobs = 1 if x_enabled else 0
    elif x_enabled:
        # Preserve an explicitly X-only deployment, but retain the same spend
        # discipline as the normal fallback: one combined, one-page search.
        if _claim_initial_x_fallback_budget(tenant_id):
            # Keep tenant/profile context even when the optional telemetry
            # migration has not been deployed. The X actor uses that context
            # for ordinary job accounting; telemetry is only an additive
            # concern and must never alter normal matching behavior.
            x_job_kwargs: dict[str, Any] = {
                "strict_single_page": True,
                "tenant_id": tenant_id,
                "service_profile_id": service_profile_id,
            }
            if discovery_run_id:
                x_job_kwargs["discovery_run_id"] = discovery_run_id
            ingest_x_job.send(
                _x_fallback_query(discovery_queries),
                lookback_hours,
                posts_per_query,
                **x_job_kwargs,
            )
            x_jobs = 1
        else:
            x_skip_reason = "initial_ingestion_x_fallback_tenant_budget_exceeded"

    if discovery_run_id and hn_jobs == 0 and additional_source_jobs == 0 and x_jobs == 0:
        try:
            from api.services.social.discovery_telemetry import complete_discovery_run

            complete_discovery_run(
                discovery_run_id,
                tenant_id,
                status="skipped",
                summary={
                    "sources": {},
                    "x_fallback": {
                        "outcome": "skipped",
                        "reason": x_skip_reason or "no_discovery_source_enabled",
                    },
                    "verification_pending": False,
                },
            )
        except Exception as exc:
            logger.info(
                "discovery_run_completion_skipped tenant_id=%s service_profile_id=%s error_type=%s",
                tenant_id,
                service_profile_id,
                exc.__class__.__name__,
            )

    logger.info(
        "initial_public_source_ingestion_enqueued tenant_id=%s service_profile_id=%s discovery_run_id=%s query_terms=%s hn_jobs=%s additional_source_jobs=%s additional_sources=%s fast_check_sources=%s x_fallback_jobs=%s x_strategy=%s x_fallback_query=%s lookback_hours=%s posts_per_query=%s",
        tenant_id,
        service_profile_id,
        discovery_run_id,
        discovery_query_payloads,
        hn_jobs,
        additional_source_jobs,
        additional_sources,
        free_sources,
        x_jobs,
        "after_all_free_sources_insufficient_diverse_evidence"
        if (hn_enabled or additional_sources) and x_enabled
        else "direct_or_disabled",
        x_fallback_query,
        lookback_hours,
        posts_per_query,
    )
    return InitialPublicSourceIngestionPlan(
        discovery_queries,
        hn_jobs,
        x_jobs,
        x_skip_reason,
        additional_source_jobs,
        discovery_run_id,
    )



"""Hackernews for social-source ingestion."""



_DISCOVERY_QUERY_STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "can",
        "could",
        "do",
        "does",
        "for",
        "from",
        "get",
        "has",
        "have",
        "how",
        "i",
        "in",
        "is",
        "my",
        "more",
        "of",
        "on",
        "or",
        "our",
        "please",
        "the",
        "to",
        "too",
        "we",
        "what",
        "with",
        "would",
        "you",
        "your",
    }
)

_BUYER_REQUEST_CONTEXT_PATTERN = re.compile(
    r"\b(?:ask\s+hn|need(?:s)?|looking\s+for|recommend(?:ation|ations)?|"
    r"advice|help|struggl(?:e|ing)|stuck|trying\s+to|switch(?:ing)?|replace|"
    r"dropped|dropping|stalled|failing|failed|stopped\s+working|losing|"
    r"manual(?:ly)?|by\s+hand|takes?\s+forever|too\s+much\s+time)\b",
    re.IGNORECASE,
)
_BUYER_FIRST_PERSON_PATTERN = re.compile(r"\b(?:i|we|my|our|us)\b", re.IGNORECASE)
_PUBLISHER_CONTEXT_PATTERN = re.compile(
    r"\b(?:show\s+hn|launch(?:ed|ing)?|release(?:d|s|\s+notes)?|changelog|"
    r"tutorial|guide|case\s+study|blog(?:\s+post)?|content\s+strategy|"
    r"positioning|product\s+critique)\b",
    re.IGNORECASE,
)



def _discovery_query_tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9][a-z0-9_-]*", value.casefold())
        if len(token) > 1 and token not in _DISCOVERY_QUERY_STOP_WORDS
    }


def _discovery_query_overlap_fraction() -> float:
    """Return the configurable lexical-recall guard for public source hits."""

    return max(
        0.05,
        min(0.8, env_float("ARCLI_DISCOVERY_QUERY_OVERLAP_FRACTION", 0.15)),
    )



def _source_post_is_plausible_for_discovery_query(
    post: Any,
    query: str,
    *,
    query_type: str | None = None,
) -> bool:
    """Identify a credible buyer-language signal instead of a loose API hit.

    This remains a deliberately cheap guard, never a lead decision: the
    downstream similarity filter and verifier are the quality gate.  It does,
    however, require both concrete phrase coverage and evidence that someone
    is describing a need rather than publishing a tutorial, launch, or product
    critique.  That prevents broad search APIs from suppressing the one
    permitted X fallback with unrelated results.
    """
    phrase = _normalize_space(query).casefold()
    title_value = str(getattr(post, "title", "") or "")
    # Connector records expose ``body`` while the global-corpus matching path
    # deliberately converts database rows to ``SocialPost``, whose equivalent
    # field is named ``text``. Keep the relevance guard shape-compatible with
    # both paths so a cached post cannot crash a worker before verification.
    body_value = str(
        getattr(post, "body", None)
        or getattr(post, "text", "")
        or ""
    )
    text_value = _normalize_space(
        " ".join(part for part in (title_value, body_value) if part)
    ).casefold()
    if not phrase or not text_value:
        return False

    query_tokens = _discovery_query_tokens(phrase)
    if not query_tokens:
        return False
    text_tokens = _discovery_query_tokens(text_value)
    overlap = len(query_tokens.intersection(text_tokens))
    # Search providers regularly return buyer-authored paraphrases rather than
    # a copy of the query.  This is a recall guard, not the qualification
    # decision, so use a modest, configurable overlap and leave the embedding
    # similarity plus LLM verifier as the precision gates.
    required_overlap = max(
        1,
        math.ceil(len(query_tokens) * _discovery_query_overlap_fraction()),
    )
    if phrase not in text_value and overlap < required_overlap:
        return False

    has_request_context = bool(_BUYER_REQUEST_CONTEXT_PATTERN.search(text_value))
    has_first_person_context = bool(_BUYER_FIRST_PERSON_PATTERN.search(text_value))
    if _PUBLISHER_CONTEXT_PATTERN.search(text_value) and not has_first_person_context:
        return False

    # A recommendation or category search should ideally look like someone
    # evaluating a solution.  We keep the old stricter rule as an optional
    # deployment setting, but default to passing a query-grounded request or
    # problem signal to the semantic/verifier stages. This improves recall for
    # short GitHub issues and Stack Exchange questions without auto-accepting
    # a lead.
    if query_type in {"recommendation_request", "category_tool_search"}:
        strict_buyer_context = os.getenv(
            "ARCLI_STRICT_BUYER_CONTEXT_FILTER",
            "false",
        ).strip().casefold() in {"1", "true", "yes", "on"}
        if not strict_buyer_context:
            return has_request_context or has_first_person_context
        return (has_request_context or has_first_person_context) and (
            has_first_person_context
            or bool(re.search(r"\b(?:what|which|anyone|recommend)\b", text_value))
        )
    return has_request_context or has_first_person_context



@dataclass(frozen=True)
class HnIngestionResult:
    query: str
    since_timestamp: int
    hits_found: int
    inserted_count: int
    inserted_source_post_ids: list[str]
    # Public posts are globally deduplicated. Existing rows must still be
    # matched to a newly activated service profile, so actor handoffs use this
    # complete hit set rather than only fresh database inserts.
    matchable_source_post_ids: list[str] = field(default_factory=list)
    # This is a cheap coverage signal, not a lead qualification.  It lets the
    # HN-first actor decide whether an X fallback is warranted without using a
    # raw provider hit count as evidence of relevance.
    plausible_hits: int = 0
    # New queue handoffs retain the provider namespace.  Keep the legacy raw
    # ID field above for deserializing already-scheduled jobs and older tests;
    # it is never used as the primary identity for new work.
    matchable_source_post_refs: list[PublicSourcePostRef] = field(default_factory=list)



def _hn_batch_size() -> int:
    return max(1, min(1_000, env_int("ARCLI_HN_INSERT_BATCH_SIZE", 100)))



def ingest_hn_posts(
    query: str,
    since_hours_ago: int,
    posts_per_query: int | None = None,
    *,
    query_type: str | None = None,
) -> HnIngestionResult:
    """Fetch public HN content, then insert only new rows in bounded batches.

    ``ignore_duplicates=True`` maps to ``ON CONFLICT DO NOTHING`` in PostgREST.
    Together with the required ``(source, source_post_id)`` unique constraint it
    makes repeated workers and retry delivery safe without a tenant-specific key.
    """
    if not query or not query.strip():
        raise ValueError("query is required")
    if since_hours_ago < 0:
        raise ValueError("since_hours_ago must be non-negative")

    from api.services.integrations.hn_connector import HackerNewsConnector

    since_timestamp = int(
        (datetime.now(timezone.utc) - timedelta(hours=since_hours_ago)).timestamp()
    )
    connector = HackerNewsConnector()
    posts = asyncio.run(
        connector.fetch_recent_posts(
            query.strip(),
            since_timestamp=since_timestamp,
            limit=posts_per_query or DEFAULT_INITIAL_PUBLIC_SOURCE_POSTS_PER_QUERY,
        )
    )
    if not posts:
        result = HnIngestionResult(
            query=query.strip(),
            since_timestamp=since_timestamp,
            hits_found=0,
            inserted_count=0,
            inserted_source_post_ids=[],
            matchable_source_post_ids=[],
            plausible_hits=0,
            matchable_source_post_refs=[],
        )
        logger.info(
            "hn_ingestion_completed query=%s query_type=%s hits_found=%s plausible_hits=%s new_inserts=%s",
            result.query,
            query_type,
            result.hits_found,
            result.plausible_hits,
            result.inserted_count,
        )
        return result

    plausible_posts = [
        post
        for post in posts
        if _source_post_is_plausible_for_discovery_query(
            post,
            query,
            query_type=query_type,
        )
    ]
    # Keep the global corpus useful for future tenant-scoped rematches. Raw
    # provider matches that fail this inexpensive buyer-evidence guard would
    # otherwise be re-embedded and re-verified for every newly activated
    # profile despite having no connection to the query that found them.
    inserted_source_post_ids = (
        _persist_new_public_source_posts(
            plausible_posts,
            batch_size=_hn_batch_size(),
        )
        if plausible_posts
        else []
    )
    result = HnIngestionResult(
        query=query.strip(),
        since_timestamp=since_timestamp,
        hits_found=len(posts),
        inserted_count=len(inserted_source_post_ids),
        inserted_source_post_ids=inserted_source_post_ids,
        matchable_source_post_ids=_matchable_source_post_ids(plausible_posts),
        plausible_hits=len(plausible_posts),
        matchable_source_post_refs=_matchable_source_post_refs(plausible_posts),
    )
    logger.info(
        "hn_ingestion_completed query=%s query_type=%s hits_found=%s plausible_hits=%s new_inserts=%s",
        result.query,
        query_type,
        result.hits_found,
        result.plausible_hits,
        result.inserted_count,
    )
    return result

# Cross-module helper imports for static analysis and direct module use.
from .models import (
    DEFAULT_INITIAL_PUBLIC_SOURCE_POSTS_PER_QUERY,
    InitialPublicSourceIngestionPlan,
    _normalize_space,
    _profile_discovery_queries,
    _service_profile_from_row,
    logger,
)
from .public_storage import (
    _matchable_source_post_ids,
    _matchable_source_post_refs,
    _persist_new_public_source_posts,
)
from .queries import (
    _claim_initial_x_fallback_budget,
    _initial_source_lookback_hours,
    _initial_source_posts_per_query,
    _is_source_enabled,
    _x_fallback_query,
    enabled_additional_public_sources,
    public_source_queries,
    public_source_search_queries,
    x_source_is_configured,
)
