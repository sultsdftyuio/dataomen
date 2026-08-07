"""Additional Sources for social-source ingestion."""

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
from api.services.integrations.public_source import PublicSourcePost, normalise_text
from api.services.integrations.x_connector import TwitterSourcePost
from api.services.matching import PostEmbedding, find_candidate_matches
from api.services.verifier import (
    CandidatePost,
    ServiceProfile,
    VerificationResult,
    VerifierService,
)




@dataclass(frozen=True)
class XIngestionResult:
    query: str
    since_timestamp: int
    hits_found: int
    inserted_count: int
    inserted_source_post_ids: list[str]
    matchable_source_post_ids: list[str] = field(default_factory=list)
    matchable_source_post_refs: list[PublicSourcePostRef] = field(default_factory=list)



def _x_batch_size() -> int:
    return max(1, min(1_000, env_int("ARCLI_X_INSERT_BATCH_SIZE", 100)))



def ingest_x_posts(
    query: str,
    since_hours_ago: int,
    posts_per_query: int | None = None,
    *,
    max_pages: int | None = None,
) -> XIngestionResult:
    """Fetch global X posts and conflict-ignore them in bounded Supabase batches."""
    if not query or not query.strip():
        raise ValueError("query is required")
    if since_hours_ago < 0:
        raise ValueError("since_hours_ago must be non-negative")

    from api.services.integrations.x_connector import XConnector

    since_timestamp = int(
        (datetime.now(timezone.utc) - timedelta(hours=since_hours_ago)).timestamp()
    )
    fetch_kwargs: dict[str, Any] = {
        "since_timestamp": since_timestamp,
        "limit": posts_per_query or DEFAULT_INITIAL_PUBLIC_SOURCE_POSTS_PER_QUERY,
    }
    if max_pages is not None:
        fetch_kwargs["max_pages"] = max_pages
    posts = asyncio.run(
        XConnector().fetch_recent_posts(
            query.strip(),
            **fetch_kwargs,
        )
    )
    if not posts:
        result = XIngestionResult(
            query=query.strip(),
            since_timestamp=since_timestamp,
            hits_found=0,
            inserted_count=0,
            inserted_source_post_ids=[],
            matchable_source_post_ids=[],
            matchable_source_post_refs=[],
        )
        logger.info(
            "x_ingestion_completed query=%s hits_found=%s new_inserts=%s",
            result.query,
            result.hits_found,
            result.inserted_count,
        )
        return result

    inserted_source_post_ids = _persist_new_public_source_posts(
        posts,
        batch_size=_x_batch_size(),
    )
    result = XIngestionResult(
        query=query.strip(),
        since_timestamp=since_timestamp,
        hits_found=len(posts),
        inserted_count=len(inserted_source_post_ids),
        inserted_source_post_ids=inserted_source_post_ids,
        matchable_source_post_ids=_matchable_source_post_ids(posts),
        matchable_source_post_refs=_matchable_source_post_refs(posts),
    )
    logger.info(
        "x_ingestion_completed query=%s hits_found=%s new_inserts=%s",
        result.query,
        result.hits_found,
        result.inserted_count,
    )
    return result



@dataclass(frozen=True)
class AdditionalPublicSourceIngestionResult:
    """A source-qualified result from one of the four non-HN/X adapters."""

    source: str
    query: str
    since_timestamp: int
    hits_found: int
    inserted_count: int
    inserted_source_post_ids: list[str]
    matchable_source_post_refs: list[PublicSourcePostRef] = field(default_factory=list)
    plausible_hits: int = 0


_TECHNICAL_DISCOVERY_QUERY_TOKENS = frozenset(
    {
        "api",
        "backend",
        "bug",
        "bugs",
        "code",
        "coding",
        "database",
        "deploy",
        "deployment",
        "developer",
        "developers",
        "devops",
        "engineering",
        "frontend",
        "github",
        "infrastructure",
        "integration",
        "kubernetes",
        "observability",
        "repository",
        "sdk",
        "security",
        "server",
        "software",
        "stacktrace",
    }
)

_COMMERCE_DISCOVERY_QUERY_TOKENS = frozenset(
    {
        "amazon",
        "commerce",
        "ecommerce",
        "etsy",
        "listing",
        "listings",
        "sales",
        "seller",
        "sellers",
        "seo",
        "shop",
        "store",
        "stores",
        "tags",
    }
)


def _query_tokens(query: str) -> set[str]:
    return set(re.findall(r"[a-z0-9][a-z0-9_-]*", query.casefold()))


def _stackexchange_site_for_query(query: str) -> str:
    """Route a query to the Stack Exchange community most likely to contain it.

    An explicit deployment setting always wins. In its absence, marketplace and
    seller language belongs on Webmasters rather than Stack Overflow. The
    former E-commerce target is not a live Stack Exchange API site and returns
    a permanent HTTP 400; technical language keeps Stack Overflow.
    """
    configured = normalise_text(os.getenv("ARCLI_STACKEXCHANGE_SITE", "")).lower()
    if configured:
        return configured
    tokens = _query_tokens(query)
    if tokens.intersection(_COMMERCE_DISCOVERY_QUERY_TOKENS):
        return "webmasters"
    return "stackoverflow"


def additional_public_source_supports_discovery_query(source: str, query: str) -> bool:
    """Avoid technical forums for a plainly non-technical buyer need.

    Stack Overflow and GitHub issues are valuable for developer-tool customers,
    but searching them for phrases such as "need more people signing up"
    produces product discussions rather than prospective buyers. Bluesky and
    Lemmy remain broad-discussion sources for every product category.
    """
    normalized_source = source.strip().casefold()
    if normalized_source not in {"stackexchange", "github"}:
        return True
    if os.getenv(
        "ARCLI_TECHNICAL_SOURCE_REQUIRE_TECHNICAL_QUERY",
        "true",
    ).strip().casefold() in {"0", "false", "no", "off"}:
        return True
    query_tokens = _query_tokens(query)
    if normalized_source == "stackexchange" and query_tokens.intersection(
        _COMMERCE_DISCOVERY_QUERY_TOKENS
    ):
        return True
    return bool(query_tokens.intersection(_TECHNICAL_DISCOVERY_QUERY_TOKENS))



def _additional_public_source_batch_size() -> int:
    return max(
        1,
        min(1_000, env_int("ARCLI_ADDITIONAL_PUBLIC_SOURCE_INSERT_BATCH_SIZE", 100)),
    )



def _additional_public_source_max_pages() -> int:
    """Use a small, bounded amount of free-source pagination by default."""
    return max(
        1,
        min(2, env_int("ARCLI_ADDITIONAL_PUBLIC_SOURCE_MAX_PAGES", 2)),
    )



def additional_public_source_cache_scope(source: str) -> str:
    """Include provider routing configuration in the global query-cache key."""
    if source == "bluesky":
        from api.services.integrations.bluesky_connector import BLUESKY_SEARCH_POSTS_URL

        return (os.getenv("ARCLI_BLUESKY_SEARCH_URL") or BLUESKY_SEARCH_POSTS_URL).strip()
    if source == "stackexchange":
        return os.getenv("ARCLI_STACKEXCHANGE_SITE", "").strip() or "auto"
    if source == "lemmy":
        from api.services.integrations.lemmy_connector import LEMMY_SEARCH_URL

        return (os.getenv("ARCLI_LEMMY_SEARCH_URL") or LEMMY_SEARCH_URL).strip()
    return ""



def _additional_public_source_connector(source: str, *, query: str | None = None) -> Any:
    """Instantiate an adapter lazily so unrelated provider dependencies stay cold."""
    if source == "bluesky":
        from api.services.integrations.bluesky_connector import BlueskyConnector

        return BlueskyConnector()
    if source == "stackexchange":
        from api.services.integrations.stackexchange_connector import StackExchangeConnector

        return StackExchangeConnector(site=_stackexchange_site_for_query(query or ""))
    if source == "github":
        from api.services.integrations.github_connector import GitHubIssuesConnector

        return GitHubIssuesConnector()
    if source == "lemmy":
        from api.services.integrations.lemmy_connector import LemmyConnector

        return LemmyConnector()
    raise ValueError(f"unsupported additional public source: {source}")



def ingest_additional_public_source_posts(
    source: str,
    query: str,
    since_hours_ago: int,
    posts_per_query: int | None = None,
    *,
    query_type: str | None = None,
) -> AdditionalPublicSourceIngestionResult:
    """Fetch one free/low-cost source, retain credible buyer signals, and return refs.

    This function intentionally does no tenant-scoped write. The caller hands
    every credible global ref to the shared embedding and verifier pipeline,
    which is the only path that can create a tenant-visible candidate. Raw API
    matches that have no buyer-language evidence are intentionally discarded so
    they cannot pollute future tenant rematches.
    """
    normalized_source = source.strip().casefold()
    normalized_query = query.strip()
    if normalized_source not in ADDITIONAL_PUBLIC_SOURCE_NAMES:
        raise ValueError(f"unsupported additional public source: {source}")
    if not normalized_query:
        raise ValueError("query is required")
    if since_hours_ago < 0:
        raise ValueError("since_hours_ago must be non-negative")

    since_timestamp = int(
        (datetime.now(timezone.utc) - timedelta(hours=since_hours_ago)).timestamp()
    )
    connector = _additional_public_source_connector(
        normalized_source,
        query=normalized_query,
    )
    posts: list[PublicSourcePost] = asyncio.run(
        connector.fetch_recent_posts(
            normalized_query,
            since_timestamp=since_timestamp,
            limit=posts_per_query or DEFAULT_INITIAL_PUBLIC_SOURCE_POSTS_PER_QUERY,
            max_pages=_additional_public_source_max_pages(),
        )
    )
    if not posts:
        result = AdditionalPublicSourceIngestionResult(
            source=normalized_source,
            query=normalized_query,
            since_timestamp=since_timestamp,
            hits_found=0,
            inserted_count=0,
            inserted_source_post_ids=[],
            matchable_source_post_refs=[],
            plausible_hits=0,
        )
    else:
        plausible_posts = [
            post
            for post in posts
            if _source_post_is_plausible_for_discovery_query(
                post,
                normalized_query,
                query_type=query_type,
            )
        ]
        inserted_source_post_ids = (
            _persist_new_public_source_posts(
                plausible_posts,
                batch_size=_additional_public_source_batch_size(),
            )
            if plausible_posts
            else []
        )
        result = AdditionalPublicSourceIngestionResult(
            source=normalized_source,
            query=normalized_query,
            since_timestamp=since_timestamp,
            hits_found=len(posts),
            inserted_count=len(inserted_source_post_ids),
            inserted_source_post_ids=inserted_source_post_ids,
            matchable_source_post_refs=_matchable_source_post_refs(plausible_posts),
            plausible_hits=len(plausible_posts),
        )
    logger.info(
        "additional_public_source_ingestion_completed source=%s query_type=%s hits_found=%s plausible_hits=%s new_inserts=%s",
        result.source,
        query_type,
        result.hits_found,
        result.plausible_hits,
        result.inserted_count,
    )
    return result

# Cross-module helper imports for static analysis and direct module use.
from .activation import _source_post_is_plausible_for_discovery_query
from .models import (
    ADDITIONAL_PUBLIC_SOURCE_NAMES,
    DEFAULT_INITIAL_PUBLIC_SOURCE_POSTS_PER_QUERY,
    logger,
)
from .public_storage import (
    _matchable_source_post_ids,
    _matchable_source_post_refs,
    _persist_new_public_source_posts,
)
