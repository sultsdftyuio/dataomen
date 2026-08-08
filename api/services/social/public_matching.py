"""Tenant-scoped matching for global public-source records."""

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
from urllib.parse import quote, urlsplit

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
    VERIFIER_POLICY_VERSION,
    VerificationResult,
    VerifierService,
)

_CURRENT_WEBSITE_PROFILE_IDENTITY_VERSION = "website-scoped-v2"


def _normalized_website_identity(value: Any) -> str | None:
    """Return a stable host/path identity without making http/https distinct."""
    raw_value = _string_value(value)
    if not raw_value:
        return None

    candidate = raw_value.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"

    try:
        parsed = urlsplit(candidate)
    except ValueError:
        return None

    host = (parsed.hostname or "").lower().removeprefix("www.")
    if not host:
        return None

    try:
        port_number = parsed.port
    except ValueError:
        return None

    port = f":{port_number}" if port_number else ""
    path = parsed.path.rstrip("/")
    return f"{host}{port}{path}"


def _profile_matches_active_website(row: dict[str, Any]) -> bool:
    """Accept only the current, website-scoped profile for a tenant.

    A public post is global, but profile matches must target the one website a
    tenant currently selected. Older rows may carry a stale brief after a site
    replacement; their document lacks the current identity marker and must not
    spend embeddings or verifier calls.
    """
    active_website = _normalized_website_identity(row.get("active_website_url"))
    if not active_website:
        return False

    document = _first_document(row)
    if document:
        return (
            document.get("service_profile_identity_version")
            == _CURRENT_WEBSITE_PROFILE_IDENTITY_VERSION
            and _normalized_website_identity(document.get("website_url"))
            == active_website
        )

    # Keep flat-column-only deployments working. JSON-backed rows fail closed
    # above, because they have enough information to prove they are stale.
    return _normalized_website_identity(
        row.get("website_url") or row.get("url")
    ) == active_website


def _current_profile_rows_for_active_websites(
    rows: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Choose at most one current profile per tenant from newest-first rows."""
    selected_tenants: set[str] = set()
    active_rows: list[dict[str, Any]] = []
    for row in rows:
        tenant_id = _string_value(row.get("tenant_id"))
        if (
            not tenant_id
            or tenant_id in selected_tenants
            or not _profile_matches_active_website(row)
        ):
            continue
        selected_tenants.add(tenant_id)
        active_rows.append(row)
    return active_rows


def _active_tenant_website_url(conn: Connection, tenant_id: str) -> str | None:
    row = conn.execute(
        text(
            """
            SELECT website_url
              FROM public.tenant_settings
             WHERE tenant_id = :tenant_id
             LIMIT 1
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().first()
    return _string_value(row.get("website_url")) if row else None


def _public_matching_profile_rows(conn: Connection) -> list[dict[str, Any]]:
    """Return one active website profile per tenant for global post matching."""
    columns = _service_profile_columns(conn)
    if not {"id", "tenant_id"}.issubset(columns):
        return []

    select_columns = [f"profile.{column_name}" for column_name in columns]
    order_column = "profile.updated_at" if "updated_at" in columns else "profile.id"
    profile_limit = max(1, env_int("ARCLI_PUBLIC_SOURCE_PROFILE_LIMIT", 250))
    candidate_limit = min(profile_limit * 4, 1_000)
    rows = conn.execute(
        text(
            f"""
            SELECT {", ".join(select_columns)},
                   settings.website_url AS active_website_url
              FROM public.service_profiles AS profile
              JOIN public.tenant_settings AS settings
                ON settings.tenant_id = profile.tenant_id
             WHERE profile.tenant_id IS NOT NULL
               AND settings.website_url IS NOT NULL
             ORDER BY {order_column} DESC NULLS LAST
             LIMIT :candidate_limit
            """
        ),
        {"candidate_limit": candidate_limit},
    ).mappings()
    return _current_profile_rows_for_active_websites(
        [dict(row) for row in rows]
    )[:profile_limit]



def _empty_public_rematch_result() -> dict[str, int]:
    return {
        "posts": 0,
        "embedded": 0,
        "cache_misses": 0,
        "candidates": 0,
        "ready_for_review": 0,
        "discovery_candidates": 0,
    }


def _source_post_matches_profile_discovery_context(
    post: SocialPost,
    discovery_queries: Sequence[Any],
) -> bool:
    """Keep stale global noise out of a tenant's paid matching path.

    New ingestion persists only posts with query-grounded buyer evidence. This
    second guard applies the same rule to rows collected by older deployments
    before a newly activated profile can spend an embedding-similarity slot or
    verifier request on them. Profiles without typed phrases retain the legacy
    semantic-only behavior for compatibility.
    """
    if not discovery_queries:
        return True
    return any(
        _source_post_is_plausible_for_discovery_query(
            post,
            query.phrase,
            query_type=query.query_type,
        )
        for query in discovery_queries
    )



def _initial_public_global_rematch_max_candidates() -> int:
    """Keep activation-time verifier usage below the general match fan-out."""
    return max(
        1,
        min(
            50,
            env_int(
                "ARCLI_INITIAL_PUBLIC_GLOBAL_REMATCH_MAX_CANDIDATES",
                DEFAULT_INITIAL_PUBLIC_GLOBAL_REMATCH_MAX_CANDIDATES,
            ),
        ),
    )



def rematch_existing_public_source_posts_for_profile(
    tenant_id: str,
    service_profile_id: str | None,
) -> dict[str, int]:
    """Match one activated profile to a bounded, already-embedded corpus.

    New public posts retain the existing global fan-out behavior.  This path is
    deliberately profile-centric: it restores historical corpus coverage for
    the newly activated customer without reading or writing another tenant's
    lead-match rows and without generating new post embeddings.
    """
    normalized_tenant_id = tenant_id.strip()
    normalized_profile_id = (service_profile_id or "").strip()
    if not normalized_tenant_id or not normalized_profile_id:
        raise ValueError("tenant_id and service_profile_id are required")

    source_limit = max(
        1,
        min(
            500,
            env_int(
                "ARCLI_INITIAL_PUBLIC_GLOBAL_REMATCH_LIMIT",
                DEFAULT_INITIAL_PUBLIC_GLOBAL_REMATCH_LIMIT,
            ),
        ),
    )
    engine = _database_engine()
    with engine.begin() as conn:
        profile_columns = _service_profile_columns(conn)
        profile_row = _load_service_profile(
            conn,
            normalized_tenant_id,
            normalized_profile_id,
            profile_columns,
        )
        active_website_url = _active_tenant_website_url(conn, normalized_tenant_id)
        source_rows = _load_recent_embedded_public_source_post_rows(
            conn,
            limit=source_limit,
        )
        lead_match_columns = _table_columns(conn, "lead_matches")

    if not profile_row:
        logger.info(
            "existing_public_source_rematch_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            normalized_tenant_id,
            normalized_profile_id,
            "service_profile_not_found",
        )
        return _empty_public_rematch_result()

    if not _profile_matches_active_website(
        {
            **profile_row,
            "active_website_url": active_website_url,
        }
    ):
        logger.info(
            "existing_public_source_rematch_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            normalized_tenant_id,
            normalized_profile_id,
            "profile_not_current_for_active_website",
        )
        return _empty_public_rematch_result()

    profile_embedding = _profile_embedding_from_row(profile_row)
    if not profile_embedding:
        logger.info(
            "existing_public_source_rematch_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            normalized_tenant_id,
            normalized_profile_id,
            "service_profile_embedding_missing",
        )
        return _empty_public_rematch_result()

    try:
        service_profile = _service_profile_from_row(profile_row)
    except Exception as exc:
        logger.info(
            "existing_public_source_rematch_skipped tenant_id=%s service_profile_id=%s skip_reason=%s error_type=%s",
            normalized_tenant_id,
            normalized_profile_id,
            "invalid_service_profile",
            exc.__class__.__name__,
        )
        return _empty_public_rematch_result()

    discovery_queries = _profile_discovery_queries(profile_row)

    embedding_service = EmbeddingService()
    post_embeddings: list[PostEmbedding] = []
    posts_by_database_id: dict[str, SocialPost] = {}
    cache_misses = 0
    try:
        for source_row in source_rows:
            database_post_id = str(source_row.get("id") or "")
            post = _public_source_post_as_social_post(source_row)
            if not database_post_id or not post:
                continue
            if not _source_post_matches_profile_discovery_context(
                post,
                discovery_queries,
            ):
                continue

            embedding_text = post.matching_text[:32_000]
            with engine.begin() as conn:
                embedding_values = _cached_public_source_post_embedding(
                    conn,
                    database_post_id=database_post_id,
                    text_sha256=_sha256_text(embedding_text),
                    embedding_model=embedding_service.model,
                )
            if not embedding_values:
                cache_misses += 1
                continue

            post_embeddings.append(
                PostEmbedding(
                    post_id=database_post_id,
                    text=embedding_text,
                    embedding=embedding_values,
                    source=post.source,
                    url=post.url,
                    metadata=_primitive_metadata(
                        {
                            "source_post_id": database_post_id,
                            "external_id": post.external_id,
                            "external_key": post.dedupe_key,
                            "source": post.source,
                        }
                    ),
                )
            )
            posts_by_database_id[database_post_id] = post
    finally:
        embedding_service.close()

    candidates = find_candidate_matches(
        profile_embedding,
        post_embeddings,
        tenant_id=normalized_tenant_id,
        service_profile_id=normalized_profile_id,
        max_candidates=_initial_public_global_rematch_max_candidates(),
    )
    if not candidates:
        result = {
            "posts": len(source_rows),
            "embedded": len(post_embeddings),
            "cache_misses": cache_misses,
            "candidates": 0,
            "ready_for_review": 0,
            "discovery_candidates": 0,
        }
        logger.info(
            "existing_public_source_rematch_completed tenant_id=%s service_profile_id=%s posts=%s embedded=%s cache_misses=%s candidates=%s ready_for_review=%s discovery_candidates=%s",
            normalized_tenant_id,
            normalized_profile_id,
            result["posts"],
            result["embedded"],
            result["cache_misses"],
            result["candidates"],
            result["ready_for_review"],
            result["discovery_candidates"],
        )
        return result

    verifier = VerifierService()
    profile_embedding_sha256 = _embedding_sha256(profile_embedding)
    ready_for_review_count = 0
    discovery_candidate_count = 0
    try:
        for candidate in candidates:
            post = posts_by_database_id.get(candidate.post_id)
            if not post:
                continue

            with engine.begin() as conn:
                verification = _cached_lead_verification(
                    conn,
                    tenant_id=normalized_tenant_id,
                    service_profile_id=normalized_profile_id,
                    source_post_id=candidate.post_id,
                    external_key=post.dedupe_key,
                    profile_embedding_sha256=profile_embedding_sha256,
                    verifier_model=verifier.model,
                    verifier_policy_version=VERIFIER_POLICY_VERSION,
                    columns=lead_match_columns,
                )
            if not verification:
                verification = verifier.verify(
                    CandidatePost(
                        post_id=candidate.post_id,
                        source=candidate.source,
                        text=candidate.text,
                        similarity_score=candidate.score,
                        url=candidate.url,
                        metadata=candidate.metadata,
                    ),
                    service_profile,
                    tenant_id=normalized_tenant_id,
                    service_profile_id=normalized_profile_id,
                )

            match_status = _lead_match_status(verification)
            if match_status == "ready_for_review":
                ready_for_review_count += 1
            elif match_status == "discovery_candidate":
                discovery_candidate_count += 1

            with engine.begin() as conn:
                _persist_lead_match(
                    conn,
                    tenant_id=normalized_tenant_id,
                    service_profile_id=normalized_profile_id,
                    source_post_id=candidate.post_id,
                    post=post,
                    similarity_score=candidate.score,
                    verification=verification,
                    profile_embedding_sha256=profile_embedding_sha256,
                    verifier_model=verifier.model,
                    verifier_policy_version=VERIFIER_POLICY_VERSION,
                )
    finally:
        verifier.close()

    result = {
        "posts": len(source_rows),
        "embedded": len(post_embeddings),
        "cache_misses": cache_misses,
        "candidates": len(candidates),
        "ready_for_review": ready_for_review_count,
        "discovery_candidates": discovery_candidate_count,
    }
    logger.info(
        "existing_public_source_rematch_completed tenant_id=%s service_profile_id=%s posts=%s embedded=%s cache_misses=%s candidates=%s ready_for_review=%s discovery_candidates=%s",
        normalized_tenant_id,
        normalized_profile_id,
        result["posts"],
        result["embedded"],
        result["cache_misses"],
        result["candidates"],
        result["ready_for_review"],
        result["discovery_candidates"],
    )
    return result



def process_public_source_post_embedding(
    source_post_id: str,
    *,
    source: str | None = None,
) -> dict[str, int]:
    """Embed one global post and create tenant-scoped verified lead matches.

    The source row remains global.  Only a positive profile match creates a
    ``lead_matches`` row carrying that profile's tenant ID.
    """
    normalized_source_post_id = source_post_id.strip()
    normalized_source = (source or "").strip() or None
    if not normalized_source_post_id:
        raise ValueError("source_post_id is required")

    engine = _database_engine()
    with engine.begin() as conn:
        source_rows = _load_public_source_post_rows(
            conn,
            normalized_source_post_id,
            source=normalized_source,
        )
        profile_rows = _public_matching_profile_rows(conn)
        lead_match_columns = _table_columns(conn, "lead_matches")

    if not source_rows:
        logger.info(
            "public_source_post_embedding_skipped source=%s source_post_id=%s skip_reason=%s",
            normalized_source,
            normalized_source_post_id,
            "global_source_post_not_found",
        )
        return {
            "posts": 0,
            "embedded": 0,
            "candidates": 0,
            "ready_for_review": 0,
            "discovery_candidates": 0,
        }

    embedding_service = EmbeddingService()
    verifier: VerifierService | None = None
    embedded_count = 0
    candidate_count = 0
    ready_for_review_count = 0
    discovery_candidate_count = 0
    try:
        verifier = VerifierService()
        for source_row in source_rows:
            database_post_id = str(source_row["id"])
            post = _public_source_post_as_social_post(source_row)
            if not post:
                logger.info(
                    "public_source_post_embedding_skipped source=%s source_post_id=%s database_post_id=%s skip_reason=%s",
                    normalized_source,
                    normalized_source_post_id,
                    database_post_id,
                    "empty_source_content",
                )
                continue

            embedding_text = post.matching_text[:32_000]
            text_sha256 = _sha256_text(embedding_text)
            with engine.begin() as conn:
                embedding_values = _cached_public_source_post_embedding(
                    conn,
                    database_post_id=database_post_id,
                    text_sha256=text_sha256,
                    embedding_model=embedding_service.model,
                )

            if embedding_values:
                logger.info(
                    "public_source_post_embedding_cache_hit source_post_id=%s database_post_id=%s source=%s model=%s dimensions=%s",
                    post.external_id,
                    database_post_id,
                    post.source,
                    embedding_service.model,
                    len(embedding_values),
                )
            else:
                try:
                    embedding = embedding_service.embed_text(
                        embedding_text,
                        source_post_id=database_post_id,
                        purpose="public_source_matching",
                    )
                except Exception:
                    with engine.begin() as conn:
                        _mark_public_source_post_embedding_failed(
                            conn,
                            database_post_id=database_post_id,
                        )
                    raise

                embedding_values = embedding.embedding
                with engine.begin() as conn:
                    _persist_public_source_post_embedding_cache(
                        conn,
                        database_post_id=database_post_id,
                        text_sha256=text_sha256,
                        embedding_model=embedding.model,
                        embedding=embedding_values,
                    )
            embedded_count += 1

            for profile_row in profile_rows:
                tenant_id = _string_value(profile_row.get("tenant_id"))
                service_profile_id = _string_value(profile_row.get("id"))
                profile_embedding = _profile_embedding_from_row(profile_row)
                if not tenant_id or not profile_embedding:
                    continue

                try:
                    service_profile = _service_profile_from_row(profile_row)
                except Exception as exc:
                    logger.info(
                        "public_source_profile_match_skipped tenant_id=%s service_profile_id=%s source_post_id=%s skip_reason=%s error_type=%s",
                        tenant_id,
                        service_profile_id,
                        database_post_id,
                        "invalid_service_profile",
                        exc.__class__.__name__,
                    )
                    continue
                if not _source_post_matches_profile_discovery_context(
                    post,
                    _profile_discovery_queries(profile_row),
                ):
                    continue

                post_embedding = PostEmbedding(
                    post_id=database_post_id,
                    text=embedding_text,
                    embedding=embedding_values,
                    source=post.source,
                    url=post.url,
                    metadata=_primitive_metadata(
                        {
                            "source_post_id": database_post_id,
                            "external_id": post.external_id,
                            "external_key": post.dedupe_key,
                            "source": post.source,
                        }
                    ),
                )
                candidates = find_candidate_matches(
                    profile_embedding,
                    [post_embedding],
                    tenant_id=tenant_id,
                    service_profile_id=service_profile_id,
                    max_candidates=1,
                )
                if not candidates:
                    continue

                candidate = candidates[0]
                candidate_count += 1
                profile_embedding_sha256 = _embedding_sha256(profile_embedding)
                with engine.begin() as conn:
                    verification = _cached_lead_verification(
                        conn,
                        tenant_id=tenant_id,
                        service_profile_id=service_profile_id,
                        source_post_id=database_post_id,
                        external_key=post.dedupe_key,
                        profile_embedding_sha256=profile_embedding_sha256,
                        verifier_model=verifier.model,
                        verifier_policy_version=VERIFIER_POLICY_VERSION,
                        columns=lead_match_columns,
                    )

                if not verification:
                    verification = verifier.verify(
                        CandidatePost(
                            post_id=candidate.post_id,
                            source=candidate.source,
                            text=candidate.text,
                            similarity_score=candidate.score,
                            url=candidate.url,
                            metadata=candidate.metadata,
                        ),
                        service_profile,
                        tenant_id=tenant_id,
                        service_profile_id=service_profile_id,
                    )

                match_status = _lead_match_status(verification)
                if match_status == "ready_for_review":
                    ready_for_review_count += 1
                elif match_status == "discovery_candidate":
                    discovery_candidate_count += 1

                with engine.begin() as conn:
                    _persist_lead_match(
                        conn,
                        tenant_id=tenant_id,
                        service_profile_id=service_profile_id,
                        source_post_id=database_post_id,
                        post=post,
                        similarity_score=candidate.score,
                        verification=verification,
                        profile_embedding_sha256=profile_embedding_sha256,
                        verifier_model=verifier.model,
                        verifier_policy_version=VERIFIER_POLICY_VERSION,
                    )
    finally:
        embedding_service.close()
        if verifier is not None:
            verifier.close()

    logger.info(
        "public_source_post_matching_completed source=%s source_post_id=%s posts=%s embedded=%s profiles=%s candidates=%s ready_for_review=%s discovery_candidates=%s",
        normalized_source,
        normalized_source_post_id,
        len(source_rows),
        embedded_count,
        len(profile_rows),
        candidate_count,
        ready_for_review_count,
        discovery_candidate_count,
    )
    return {
        "posts": len(source_rows),
        "embedded": embedded_count,
        "candidates": candidate_count,
        "ready_for_review": ready_for_review_count,
        "discovery_candidates": discovery_candidate_count,
    }

# Cross-module helper imports for static analysis and direct module use.
from .legacy_fetch import (
    _primitive_metadata,
    _table_columns,
)
from .legacy_storage import (
    _cached_lead_verification,
    _lead_match_status,
    _persist_lead_match,
)
from .activation import _source_post_is_plausible_for_discovery_query
from .models import (
    DEFAULT_INITIAL_PUBLIC_GLOBAL_REMATCH_LIMIT,
    DEFAULT_INITIAL_PUBLIC_GLOBAL_REMATCH_MAX_CANDIDATES,
    _embedding_sha256,
    _profile_discovery_queries,
    _profile_embedding_from_row,
    _service_profile_from_row,
    _sha256_text,
    logger,
)
from .public_records import (
    _cached_public_source_post_embedding,
    _load_public_source_post_rows,
    _load_recent_embedded_public_source_post_rows,
    _mark_public_source_post_embedding_failed,
    _persist_public_source_post_embedding_cache,
    _public_source_post_as_social_post,
)
