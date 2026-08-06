"""Queries for social-source ingestion."""

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




def _query_terms(profile: ServiceProfile) -> list[str]:
    candidates = [
        *profile.ideal_customer_pain_points,
        profile.core_problem_solved,
        *profile.key_value_propositions,
        *profile.target_audience,
    ]
    terms: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = _normalize_space(candidate)
        if len(normalized) < 4:
            continue

        words = normalized.split()
        if len(words) > 8:
            normalized = " ".join(words[:8])

        key = normalized.lower()
        if key not in seen:
            seen.add(key)
            terms.append(normalized)

    return terms[: env_int("ARCLI_SOCIAL_MAX_QUERIES", DEFAULT_MAX_QUERIES)]



def _compact_public_search_term(value: str) -> str:
    """Normalize a user-visible discovery phrase for public-source APIs."""
    normalized = _normalize_space(value)
    # Quotes and punctuation are normalized here because phrases can come from
    # legacy profiles as well as the structured matching brief.  The X fallback
    # subsequently quotes each complete phrase as an exact-match clause.
    normalized = normalized.replace('"', "").replace("'", "")
    normalized = re.sub(r"[^\w\s#.-]", " ", normalized)
    normalized = _normalize_space(normalized)
    # The matching-brief contract permits up to fourteen words.  Preserve that
    # full buyer-language phrase: the old eight-word truncation could leave
    # natural requests ending in "and", "or", or another incomplete thought.
    # This bound also keeps legacy free-form profiles from emitting prose.
    return " ".join(normalized.split()[:14])



def public_source_queries(
    profile: ServiceProfile,
    *,
    discovery_queries: list[DiscoveryQuery] | None = None,
) -> list[DiscoveryQuery]:
    """Return a bounded, typed buyer-language query set for source discovery.

    Canonical matching briefs provide one phrase per intent category.  We keep
    the type through the queue handoff so source-search work can be observed and
    retried by intent, while preserving old profiles that only have flat
    ``search_terms``.  Legacy fallback candidates deliberately prioritize
    buyer pains and buying events over vendor positioning prose.
    """
    typed_candidates = discovery_queries or [
        DiscoveryQuery(
            DISCOVERY_QUERY_TYPES[index % len(DISCOVERY_QUERY_TYPES)],
            term,
        )
        for index, term in enumerate(profile.search_terms)
    ]
    if not typed_candidates:
        fallback_candidates = [
            *profile.buying_triggers,
            *profile.urgency_signals,
            *profile.ideal_customer_pain_points,
            *profile.use_cases,
            profile.core_problem_solved,
            profile.one_liner,
            *profile.key_value_propositions,
            *profile.target_audience,
        ]
        typed_candidates = [
            DiscoveryQuery(
                DISCOVERY_QUERY_TYPES[index % len(DISCOVERY_QUERY_TYPES)],
                term,
            )
            for index, term in enumerate(fallback_candidates)
        ]

    max_queries = max(
        1,
        min(
            len(DISCOVERY_QUERY_TYPES),
            env_int(
                "ARCLI_INITIAL_PUBLIC_INGESTION_QUERY_LIMIT",
                DEFAULT_INITIAL_PUBLIC_SOURCE_QUERY_LIMIT,
            ),
        ),
    )
    queries: list[DiscoveryQuery] = []
    seen_phrases: set[str] = set()
    seen_types: set[str] = set()
    for candidate in typed_candidates:
        query_type = candidate.query_type.strip()
        phrase = _compact_public_search_term(candidate.phrase)
        if (
            query_type not in DISCOVERY_QUERY_TYPES
            or len(phrase) < 4
            or query_type in seen_types
        ):
            continue
        phrase_key = phrase.casefold()
        if phrase_key in seen_phrases:
            continue
        seen_types.add(query_type)
        seen_phrases.add(phrase_key)
        queries.append(DiscoveryQuery(query_type, phrase))
        if len(queries) >= max_queries:
            break
    return queries



_DEMAND_ACQUISITION_PROFILE_PATTERN = re.compile(
    r"\b(?:buyers?|leads?|prospects?|prospecting|outbound|sales\s+pipeline|"
    r"customer\s+acquisition|customer\s+discovery|demand\s+generation|"
    r"outreach|signups?|signing\s+up|customer\s+growth|growth\s+plan)\b",
    re.IGNORECASE,
)

# These are deliberately short, source-neutral alternatives to the canonical
# matching brief.  The profile's phrase remains first; these aliases only
# widen retrieval for products whose buyers genuinely discuss customer and
# pipeline acquisition.  The verifier remains the qualification gate.
_DEMAND_ACQUISITION_QUERY_VARIANTS: dict[str, tuple[str, ...]] = {
    "buyer_pain": ("need more leads", "need more customers"),
    "urgent_failure": ("signups dropping", "pipeline drying up"),
    "recommendation_request": ("find customers", "get more leads"),
    "manual_workflow_frustration": ("manual outreach", "manual prospecting"),
    "category_tool_search": ("prospecting tools", "lead generation tools"),
    "switching_trigger": ("outbound not working", "better prospecting tool"),
}


_GENERIC_QUERY_FOCUS_STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "best",
        "can",
        "cannot",
        "find",
        "for",
        "from",
        "get",
        "help",
        "how",
        "i",
        "in",
        "is",
        "manual",
        "manually",
        "more",
        "my",
        "need",
        "of",
        "our",
        "recommendation",
        "switching",
        "the",
        "to",
        "we",
        "what",
        "with",
    }
)


def _generic_query_focus(phrase: str) -> str:
    """Extract a short, product-neutral noun phrase for recall variants.

    The canonical matching brief stays the source of truth.  This helper only
    removes request-language that public authors frequently paraphrase, such
    as ``recommendation for`` or ``need a better way to``.  It deliberately
    does not introduce category terms from a model or an unrelated taxonomy.
    """

    words = re.findall(r"[A-Za-z0-9][A-Za-z0-9_-]*", phrase)
    focus = [
        word
        for word in words
        if word.casefold() not in _GENERIC_QUERY_FOCUS_STOP_WORDS
    ]
    return " ".join(focus[:4]) or _compact_public_search_term(phrase)


def _generic_query_variants(canonical: DiscoveryQuery) -> tuple[str, ...]:
    """Return compact buyer-language alternatives for any product category.

    These variants widen source retrieval without presenting an inferred
    category as customer truth.  They are fed through the same plausibility,
    embedding, and verifier gates as the canonical phrase.
    """

    focus = _generic_query_focus(canonical.phrase)
    if len(focus) < 3:
        return ()

    templates: dict[str, tuple[str, ...]] = {
        "buyer_pain": (f"struggling with {focus}",),
        "urgent_failure": (f"{focus} not working",),
        "recommendation_request": (f"looking for {focus}",),
        "manual_workflow_frustration": (f"manual {focus}",),
        "category_tool_search": (f"software for {focus}",),
        "switching_trigger": (f"alternative to {focus}",),
    }
    return templates.get(canonical.query_type, ())


def _profile_has_demand_acquisition_intent(profile: ServiceProfile) -> bool:
    context = " ".join(
        [
            profile.one_liner,
            profile.core_problem_solved,
            *profile.target_audience,
            *profile.key_value_propositions,
            *profile.ideal_customer_pain_points,
            *profile.use_cases,
            *profile.buying_triggers,
            *profile.urgency_signals,
            *profile.search_terms,
        ]
    )
    return bool(_DEMAND_ACQUISITION_PROFILE_PATTERN.search(context))


def _initial_source_query_variants_per_type() -> int:
    return max(
        1,
        min(
            3,
            env_int(
                "ARCLI_INITIAL_PUBLIC_INGESTION_QUERY_VARIANTS_PER_TYPE",
                DEFAULT_INITIAL_PUBLIC_SOURCE_QUERY_VARIANTS_PER_TYPE,
            ),
        ),
    )


def public_source_search_queries(
    profile: ServiceProfile,
    *,
    discovery_queries: list[DiscoveryQuery] | None = None,
) -> list[DiscoveryQuery]:
    """Build the bounded, high-recall source query plan for activation.

    Canonical profile phrases remain the source of truth and always lead each
    intent.  Demand-acquisition profiles also receive concise buyer-language
    alternatives, since a public author is much more likely to write "need
    more leads" than the exact sentence generated for a profile.  Every other
    product receives a compact, phrase-derived alternative too, so an unusual
    website is not limited to an exact generated sentence.
    """

    canonical_queries = public_source_queries(
        profile,
        discovery_queries=discovery_queries,
    )
    variants_per_type = _initial_source_query_variants_per_type()
    if variants_per_type == 1:
        return canonical_queries

    is_demand_acquisition_profile = _profile_has_demand_acquisition_intent(profile)
    queries: list[DiscoveryQuery] = []
    seen_phrases: set[str] = set()
    for canonical in canonical_queries:
        specific_alternatives = (
            _DEMAND_ACQUISITION_QUERY_VARIANTS.get(canonical.query_type, ())
            if is_demand_acquisition_profile
            else _generic_query_variants(canonical)
        )
        alternatives = (canonical.phrase, *specific_alternatives)
        added_for_type = 0
        for alternative in alternatives:
            phrase = _compact_public_search_term(alternative)
            phrase_key = phrase.casefold()
            if len(phrase) < 4 or phrase_key in seen_phrases:
                continue
            queries.append(DiscoveryQuery(canonical.query_type, phrase))
            seen_phrases.add(phrase_key)
            added_for_type += 1
            if added_for_type >= variants_per_type:
                break
    return queries



def public_source_query_terms(profile: ServiceProfile) -> list[str]:
    """Compatibility projection for consumers that need only flat phrases."""
    return [query.phrase for query in public_source_queries(profile)]



def _x_fallback_query(
    query_terms: list[str] | list[DiscoveryQuery] | list[dict[str, str]],
) -> str:
    """Combine the HN intent set into one high-recall X search expression.

    X charges for a search request, so the HN-first fallback must not spend a
    request on an arbitrary single term merely because its HN worker finished
    first. Each buyer phrase is an exact-match literal in one grouped
    alternative, so words such as "and" and "or" cannot be mistaken for X
    boolean operators while the connector's safe filters apply to the entire
    activation brief.
    """
    terms: list[str] = []
    for item in query_terms:
        if isinstance(item, DiscoveryQuery):
            term = item.phrase
        elif isinstance(item, dict):
            term = _string_value(item.get("phrase")) or ""
        else:
            term = str(item)
        if term.strip():
            terms.append(term.strip())
    if not terms:
        return ""
    # Do not slice a completed expression: that can leave an unmatched
    # parenthesis, quote, or partial buyer phrase, causing a paid X request to
    # fail. X supports exact phrases in double quotes; escape any embedded
    # backslash or quote before placing untrusted legacy profile text inside a
    # literal phrase.
    # HN always receives every typed phrase; X is the single bounded fallback,
    # so include complete clauses in their stable priority order until its
    # conservative query budget is full.
    max_expression_length = 400
    outer_group_length = 2 if len(terms) > 1 else 0
    clauses: list[str] = []
    current_length = 0
    for term in terms:
        literal_phrase = (
            _normalize_space(term).replace("\\", "\\\\").replace('"', '\\"')
        )
        clause = f'"{literal_phrase}"'
        separator_length = 4 if clauses else 0  # ` OR `
        if (
            current_length
            + separator_length
            + len(clause)
            + outer_group_length
            > max_expression_length
        ):
            break
        clauses.append(clause)
        current_length += separator_length + len(clause)

    expression = " OR ".join(clauses)
    return f"({expression})" if len(clauses) > 1 else expression



def _is_source_enabled(name: str, default: bool = True) -> bool:
    value = os.getenv(name, str(default)).strip().lower()
    return value not in {"0", "false", "no", "off"}



def enabled_additional_public_sources() -> tuple[str, ...]:
    """Return the explicitly enabled free/low-cost sources in stable order."""
    return tuple(
        source
        for source in ADDITIONAL_PUBLIC_SOURCE_NAMES
        if _is_source_enabled(f"ARCLI_{source.upper()}_INGESTION_ENABLED")
    )



def _additional_source_query_cache_key(
    *,
    source: str,
    query: str,
    since_hours_ago: int,
    scope: str = "",
) -> str:
    """Build a tenant-free cache key for a bounded public-source query."""
    material = "\x1f".join(
        (
            source.strip().casefold(),
            _normalize_space(query).casefold(),
            str(max(0, since_hours_ago)),
            scope.strip().casefold(),
        )
    )
    return "arcli:public-source-query:" + hashlib.sha256(
        material.encode("utf-8")
    ).hexdigest()



def claim_additional_public_source_query(
    *,
    source: str,
    query: str,
    since_hours_ago: int,
    scope: str = "",
) -> bool:
    """Claim a short global query cache slot before free-source ingestion.

    The cache intentionally contains only a hash of public buyer language and
    no tenant identifier. Redis makes repeated customer activations share one
    source request; without Redis, the global database dedupe remains safe and
    this function deliberately permits the query rather than dropping leads.
    """
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return True

    ttl_seconds = max(
        1,
        min(
            86_400,
            env_int(
                "ARCLI_ADDITIONAL_PUBLIC_SOURCE_QUERY_CACHE_TTL_SECONDS",
                DEFAULT_ADDITIONAL_PUBLIC_SOURCE_QUERY_CACHE_TTL_SECONDS,
            ),
        ),
    )
    cache_key = _additional_source_query_cache_key(
        source=source,
        query=query,
        since_hours_ago=since_hours_ago,
        scope=scope,
    )
    client: Any | None = None
    try:
        import redis

        client = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            max_connections=max(
                1,
                env_int("ARCLI_PUBLIC_SOURCE_QUERY_CACHE_REDIS_MAX_CONNECTIONS", 2),
            ),
            socket_connect_timeout=2,
            socket_timeout=2,
            health_check_interval=30,
        )
        claimed = bool(client.set(cache_key, "1", nx=True, ex=ttl_seconds))
        if not claimed:
            logger.info(
                "additional_public_source_query_cache_hit source=%s query_sha256=%s lookback_hours=%s",
                source,
                cache_key.rsplit(":", 1)[-1],
                since_hours_ago,
            )
        return claimed
    except Exception as exc:
        # Caching must never turn a transient Redis problem into a missed
        # source search. Provider limiters still guard the outbound request.
        logger.warning(
            "additional_public_source_query_cache_unavailable source=%s error_type=%s",
            source,
            exc.__class__.__name__,
        )
        return True
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                pass
        pool = getattr(client, "connection_pool", None)
        disconnect = getattr(pool, "disconnect", None)
        if callable(disconnect):
            try:
                disconnect()
            except Exception:
                pass



def release_additional_public_source_query(
    *,
    source: str,
    query: str,
    since_hours_ago: int,
    scope: str = "",
) -> None:
    """Release a failed query claim so a later activation can retry it.

    This is called only by the worker that acquired the cache slot and then
    received a provider error. Successful and empty searches retain the TTL,
    while outages do not masquerade as a cached zero-result response.
    """
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return

    cache_key = _additional_source_query_cache_key(
        source=source,
        query=query,
        since_hours_ago=since_hours_ago,
        scope=scope,
    )
    client: Any | None = None
    try:
        import redis

        client = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            max_connections=max(
                1,
                env_int("ARCLI_PUBLIC_SOURCE_QUERY_CACHE_REDIS_MAX_CONNECTIONS", 2),
            ),
            socket_connect_timeout=2,
            socket_timeout=2,
            health_check_interval=30,
        )
        client.delete(cache_key)
    except Exception as exc:
        logger.warning(
            "additional_public_source_query_cache_release_failed source=%s error_type=%s",
            source,
            exc.__class__.__name__,
        )
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                pass
        pool = getattr(client, "connection_pool", None)
        disconnect = getattr(pool, "disconnect", None)
        if callable(disconnect):
            try:
                disconnect()
            except Exception:
                pass



def x_source_is_configured() -> bool:
    """Return whether the paid X path is explicitly usable for this worker.

    Checking this before queuing a fallback avoids a retry storm after a free
    HN search when an environment has intentionally not configured X access.
    The bearer token itself is never logged.
    """
    if not _is_source_enabled("ARCLI_X_INGESTION_ENABLED"):
        return False
    return bool(
        (
            os.getenv("X_BEARER_TOKEN")
            or os.getenv("TWITTER_BEARER_TOKEN")
            or os.getenv("ARCLI_X_BEARER_TOKEN")
            or ""
        ).strip()
    )



def _claim_initial_x_fallback_budget(tenant_id: str) -> bool:
    """Apply the tenant X spend cap for the explicit X-only deployment mode."""
    decision = TenantQuotaGuard().check_and_increment(
        tenant_id=tenant_id,
        counter_name="initial_public_x_fallback",
        limit=env_int("ARCLI_INITIAL_PUBLIC_X_FALLBACK_TENANT_LIMIT", 5),
        window_seconds=env_int(
            "ARCLI_INITIAL_PUBLIC_X_FALLBACK_TENANT_WINDOW_SECONDS",
            86_400,
        ),
    )
    return decision.allowed



def _initial_source_lookback_hours() -> int:
    return max(
        1,
        min(
            720,
            env_int(
                "ARCLI_INITIAL_PUBLIC_INGESTION_LOOKBACK_HOURS",
                DEFAULT_INITIAL_PUBLIC_SOURCE_LOOKBACK_HOURS,
            ),
        ),
    )



def _initial_source_posts_per_query() -> int:
    return max(
        1,
        min(
            100,
            env_int(
                "ARCLI_INITIAL_PUBLIC_INGESTION_POSTS_PER_QUERY",
                DEFAULT_INITIAL_PUBLIC_SOURCE_POSTS_PER_QUERY,
            ),
        ),
    )

# Cross-module helper imports for static analysis and direct module use.
from .models import (
    ADDITIONAL_PUBLIC_SOURCE_NAMES,
    DEFAULT_ADDITIONAL_PUBLIC_SOURCE_QUERY_CACHE_TTL_SECONDS,
    DEFAULT_INITIAL_PUBLIC_SOURCE_LOOKBACK_HOURS,
    DEFAULT_INITIAL_PUBLIC_SOURCE_POSTS_PER_QUERY,
    DEFAULT_INITIAL_PUBLIC_SOURCE_QUERY_LIMIT,
    DEFAULT_INITIAL_PUBLIC_SOURCE_QUERY_VARIANTS_PER_TYPE,
    DEFAULT_MAX_QUERIES,
    DISCOVERY_QUERY_TYPES,
    DiscoveryQuery,
    _normalize_space,
    logger,
)
