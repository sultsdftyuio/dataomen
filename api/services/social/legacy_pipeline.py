"""Legacy Pipeline for social-source ingestion."""

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
    VERIFIER_POLICY_VERSION,
    VerificationResult,
    VerifierService,
)




def run_initial_public_ingestion(
    tenant_id: str,
    service_profile_id: str | None = None,
) -> dict[str, int]:
    engine = _database_engine()
    with engine.begin() as conn:
        profile_columns = _service_profile_columns(conn)
        profile_row = _load_service_profile(
            conn,
            tenant_id,
            service_profile_id,
            profile_columns,
        )

    if not profile_row:
        logger.warning(
            "social_ingestion_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            tenant_id,
            service_profile_id,
            "service_profile_not_found",
        )
        return {"posts": 0, "embedded": 0, "candidates": 0, "qualified": 0}

    profile_embedding = _profile_embedding_from_row(profile_row)
    if not profile_embedding:
        logger.warning(
            "social_ingestion_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            tenant_id,
            service_profile_id,
            "service_profile_embedding_missing",
        )
        return {"posts": 0, "embedded": 0, "candidates": 0, "qualified": 0}

    resolved_profile_id = (
        str(profile_row.get("id")) if profile_row.get("id") else service_profile_id
    )
    service_profile = _service_profile_from_row(profile_row)
    posts = _dedupe_posts(
        [
            *_fetch_reddit_posts(
                service_profile,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
            ),
            *_fetch_x_posts(
                service_profile,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
            ),
        ]
    )

    if not posts:
        logger.info(
            "social_ingestion_completed tenant_id=%s service_profile_id=%s posts=%s embedded=%s candidates=%s qualified=%s",
            tenant_id,
            resolved_profile_id,
            0,
            0,
            0,
            0,
        )
        return {"posts": 0, "embedded": 0, "candidates": 0, "qualified": 0}

    with engine.begin() as conn:
        source_post_ids = _persist_source_posts(conn, tenant_id, posts)

    embedding_service = EmbeddingService()
    embedding_model = embedding_service.model
    profile_embedding_sha256 = _embedding_sha256(profile_embedding)
    post_embeddings: list[PostEmbedding] = []
    posts_by_match_id: dict[str, SocialPost] = {}
    for post in posts:
        source_post_id = source_post_ids.get(post.dedupe_key)
        match_post_id = source_post_id or post.dedupe_key
        embedding_text = post.matching_text[:32_000]
        text_sha256 = _sha256_text(embedding_text)
        cached_embedding: list[float] | None = None
        if source_post_id:
            with engine.begin() as conn:
                cached_embedding = _cached_source_post_embedding(
                    conn,
                    tenant_id=tenant_id,
                    source_post_id=source_post_id,
                    text_sha256=text_sha256,
                    embedding_model=embedding_model,
                )

        if cached_embedding:
            embedding_values = cached_embedding
            logger.info(
                "social_post_embedding_cache_hit tenant_id=%s service_profile_id=%s source_post_id=%s source=%s external_id=%s model=%s dimensions=%s",
                tenant_id,
                resolved_profile_id,
                source_post_id,
                post.source,
                post.external_id,
                embedding_model,
                len(embedding_values),
            )
        else:
            try:
                embedding = embedding_service.embed_text(
                    embedding_text,
                    tenant_id=tenant_id,
                    service_profile_id=resolved_profile_id,
                    source_post_id=match_post_id,
                    purpose="public_social_post_matching",
                )
            except Exception as exc:
                logger.info(
                    "social_post_embedding_skipped tenant_id=%s service_profile_id=%s source=%s external_id=%s error_type=%s error=%s",
                    tenant_id,
                    resolved_profile_id,
                    post.source,
                    post.external_id,
                    exc.__class__.__name__,
                    exc,
                )
                continue

            embedding_values = embedding.embedding
            with engine.begin() as conn:
                _persist_source_post_embedding_cache(
                    conn,
                    tenant_id=tenant_id,
                    source_post_id=source_post_id,
                    text_sha256=text_sha256,
                    embedding_model=embedding.model,
                    embedding=embedding_values,
                )

        metadata = _primitive_metadata(
            {
                **(post.metadata or {}),
                "source_post_id": source_post_id,
                "external_key": post.dedupe_key,
                "external_id": post.external_id,
                "tenant_id": tenant_id,
                "service_profile_id": resolved_profile_id,
            }
        )
        post_embeddings.append(
            PostEmbedding(
                post_id=match_post_id,
                text=post.matching_text,
                embedding=embedding_values,
                source=post.source,
                url=post.url,
                metadata=metadata,
            )
        )
        posts_by_match_id[match_post_id] = post

    embedding_service.close()

    candidates = find_candidate_matches(
        profile_embedding,
        post_embeddings,
        tenant_id=tenant_id,
        service_profile_id=resolved_profile_id,
    )

    verifier = VerifierService()
    verifier_model = verifier.model
    qualified_count = 0
    with engine.begin() as conn:
        lead_match_columns = _table_columns(conn, "lead_matches")

    for candidate in candidates:
        post = posts_by_match_id.get(candidate.post_id)
        if not post:
            continue

        source_post_id_value = candidate.metadata.get("source_post_id")
        source_post_id = str(source_post_id_value) if source_post_id_value else None
        with engine.begin() as conn:
            verification = _cached_lead_verification(
                conn,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
                source_post_id=source_post_id,
                external_key=post.dedupe_key,
                profile_embedding_sha256=profile_embedding_sha256,
                verifier_model=verifier_model,
                verifier_policy_version=VERIFIER_POLICY_VERSION,
                columns=lead_match_columns,
            )

        if verification:
            logger.info(
                "lead_verification_cache_hit tenant_id=%s service_profile_id=%s source_post_id=%s source=%s external_id=%s verifier_model=%s",
                tenant_id,
                resolved_profile_id,
                source_post_id,
                post.source,
                post.external_id,
                verifier_model,
            )
        else:
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
                service_profile_id=resolved_profile_id,
            )
        if verification.match and verification.confidence >= env_float(
            "LEAD_VERIFIER_SCORE_THRESHOLD",
            DEFAULT_VERIFIER_QUALIFIED_THRESHOLD,
        ):
            qualified_count += 1

        with engine.begin() as conn:
            _persist_lead_match(
                conn,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
                source_post_id=source_post_id,
                post=post,
                similarity_score=candidate.score,
                verification=verification,
                profile_embedding_sha256=profile_embedding_sha256,
                verifier_model=verifier_model,
                verifier_policy_version=VERIFIER_POLICY_VERSION,
            )

    verifier.close()

    logger.info(
        "social_ingestion_completed tenant_id=%s service_profile_id=%s posts=%s embedded=%s candidates=%s qualified=%s",
        tenant_id,
        resolved_profile_id,
        len(posts),
        len(post_embeddings),
        len(candidates),
        qualified_count,
    )
    return {
        "posts": len(posts),
        "embedded": len(post_embeddings),
        "candidates": len(candidates),
        "qualified": qualified_count,
    }

# Cross-module helper imports for static analysis and direct module use.
from .legacy_fetch import (
    _dedupe_posts,
    _fetch_reddit_posts,
    _fetch_x_posts,
    _primitive_metadata,
    _table_columns,
)
from .legacy_storage import (
    _cached_lead_verification,
    _cached_source_post_embedding,
    _persist_lead_match,
    _persist_source_post_embedding_cache,
    _persist_source_posts,
)
from .models import (
    DEFAULT_VERIFIER_QUALIFIED_THRESHOLD,
    _embedding_sha256,
    _profile_embedding_from_row,
    _service_profile_from_row,
    _sha256_text,
    logger,
)
