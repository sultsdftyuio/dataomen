"""Legacy Storage for social-source ingestion."""

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




def _cached_source_post_embedding(
    conn: Connection,
    *,
    tenant_id: str,
    source_post_id: str | None,
    text_sha256: str,
    embedding_model: str,
) -> list[float] | None:
    if not source_post_id:
        return None

    columns = _table_columns(conn, "source_posts")
    if "metadata" not in columns:
        return None

    cache = conn.execute(
        text(
            f"""
            SELECT metadata->:cache_key
              FROM public.source_posts
             WHERE tenant_id = :tenant_id
               AND id = CAST(:source_post_id AS uuid)
             LIMIT 1
            """
        ),
        {
            "tenant_id": tenant_id,
            "source_post_id": source_post_id,
            "cache_key": SOURCE_POST_EMBEDDING_CACHE_KEY,
        },
    ).scalar_one_or_none()
    cache_payload = _as_dict(cache)
    if (
        cache_payload.get("model") != embedding_model
        or cache_payload.get("text_sha256") != text_sha256
    ):
        return None

    return _embedding_values(cache_payload.get("embedding"))



def _persist_source_post_embedding_cache(
    conn: Connection,
    *,
    tenant_id: str,
    source_post_id: str | None,
    text_sha256: str,
    embedding_model: str,
    embedding: list[float],
) -> None:
    if not source_post_id:
        return

    columns = _table_columns(conn, "source_posts")
    metadata_column = columns.get("metadata")
    if not metadata_column:
        return

    metadata_expression = (
        """
        (
            COALESCE(metadata::jsonb, '{}'::jsonb)
            || jsonb_build_object(
                :cache_key,
                jsonb_build_object(
                    'model', :embedding_model,
                    'text_sha256', :text_sha256,
                    'embedding', CAST(:embedding AS jsonb),
                    'dimensions', :dimensions,
                    'cached_at', CAST(:cached_at AS timestamptz)
                )
            )
        )
        """
    )
    if metadata_column["data_type"] == "json" or metadata_column["udt_name"] == "json":
        metadata_expression = f"({metadata_expression})::json"

    conn.execute(
        text(
            f"""
            UPDATE public.source_posts
               SET metadata = {metadata_expression},
                   updated_at = CAST(:cached_at AS timestamptz)
             WHERE tenant_id = :tenant_id
               AND id = CAST(:source_post_id AS uuid)
            """
        ),
        {
            "tenant_id": tenant_id,
            "source_post_id": source_post_id,
            "cache_key": SOURCE_POST_EMBEDDING_CACHE_KEY,
            "embedding_model": embedding_model,
            "text_sha256": text_sha256,
            "embedding": json.dumps(embedding, separators=(",", ":")),
            "dimensions": len(embedding),
            "cached_at": datetime.now(timezone.utc).isoformat(),
        },
    )



def _persist_source_posts(
    conn: Connection,
    tenant_id: str,
    posts: list[SocialPost],
) -> dict[str, str]:
    columns = _table_columns(conn, "source_posts")
    if not {"id", "tenant_id", "source", "external_id"}.issubset(columns):
        logger.info("source_post_persistence_skipped skip_reason=%s", "table_missing")
        return {}

    now = datetime.now(timezone.utc).isoformat()
    ids: dict[str, str] = {}
    for post in posts:
        payload: dict[str, Any] = {
            "tenant_id": tenant_id,
            "source": post.source,
            "external_id": post.external_id,
            "title": post.title,
            "text": post.text,
            "author": post.author,
            "community": post.community,
            "url": post.url,
            "published_at": post.published_at,
            "metadata": post.metadata or {},
            "updated_at": now,
        }
        if "created_at" in columns:
            payload["created_at"] = now

        expressions, params = _bind_payload(payload, columns)
        assignment_parts = [
            f"{column_name} = EXCLUDED.{column_name}"
            for column_name in expressions
            if column_name not in {"id", "tenant_id", "source", "external_id", "created_at"}
        ]
        conflict_sql = (
            f"DO UPDATE SET {', '.join(assignment_parts)}"
            if assignment_parts
            else "DO UPDATE SET external_id = public.source_posts.external_id"
        )

        result = conn.execute(
            text(
                f"""
                INSERT INTO public.source_posts ({", ".join(expressions)})
                VALUES ({", ".join(expressions.values())})
                ON CONFLICT (tenant_id, source, external_id)
                {conflict_sql}
                 WHERE public.source_posts.tenant_id = EXCLUDED.tenant_id
                RETURNING id
                """
            ),
            params,
        )
        inserted_id = result.scalar_one_or_none()
        if inserted_id:
            ids[post.dedupe_key] = str(inserted_id)

    return ids



def _existing_lead_match_id(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str | None,
    source_post_id: str | None,
    external_key: str,
    columns: dict[str, dict[str, str]],
) -> str | None:
    if source_post_id and "source_post_id" in columns:
        profile_filter = ""
        params: dict[str, Any] = {
            "tenant_id": tenant_id,
            "source_post_id": source_post_id,
        }
        if service_profile_id and "service_profile_id" in columns:
            profile_filter = " AND service_profile_id = CAST(:service_profile_id AS uuid)"
            params["service_profile_id"] = service_profile_id
        return conn.execute(
            text(
                f"""
                SELECT id
                  FROM public.lead_matches
                 WHERE tenant_id = :tenant_id
                   AND source_post_id = CAST(:source_post_id AS uuid)
                   {profile_filter}
                 LIMIT 1
                """
            ),
            params,
        ).scalar_one_or_none()

    if "metadata" in columns:
        profile_filter = ""
        params = {"tenant_id": tenant_id, "external_key": external_key}
        if service_profile_id and "service_profile_id" in columns:
            profile_filter = " AND service_profile_id = CAST(:service_profile_id AS uuid)"
            params["service_profile_id"] = service_profile_id
        return conn.execute(
            text(
                f"""
                SELECT id
                  FROM public.lead_matches
                 WHERE tenant_id = :tenant_id
                   AND metadata->>'external_key' = :external_key
                   {profile_filter}
                 LIMIT 1
                """
            ),
            params,
        ).scalar_one_or_none()

    return None



def _cached_lead_verification(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str | None,
    source_post_id: str | None,
    external_key: str,
    profile_embedding_sha256: str,
    verifier_model: str,
    verifier_policy_version: str,
    columns: dict[str, dict[str, str]],
) -> VerificationResult | None:
    if not {"tenant_id", "metadata"}.issubset(columns):
        return None

    verification_columns = [
        column_name
        for column_name in ("verification", "verifier_result")
        if column_name in columns
    ]
    if not verification_columns:
        return None

    select_parts = ["metadata"]
    select_parts.extend(verification_columns)
    where_parts = ["tenant_id = :tenant_id"]
    params: dict[str, Any] = {
        "tenant_id": tenant_id,
        "external_key": external_key,
    }

    if source_post_id and "source_post_id" in columns:
        where_parts.append("source_post_id = CAST(:source_post_id AS uuid)")
        params["source_post_id"] = source_post_id
    else:
        where_parts.append("metadata->>'external_key' = :external_key")

    if service_profile_id and "service_profile_id" in columns:
        where_parts.append("service_profile_id = CAST(:service_profile_id AS uuid)")
        params["service_profile_id"] = service_profile_id

    row = conn.execute(
        text(
            f"""
            SELECT {", ".join(select_parts)}
              FROM public.lead_matches
             WHERE {" AND ".join(where_parts)}
             ORDER BY updated_at DESC NULLS LAST
             LIMIT 1
            """
        ),
        params,
    ).mappings().first()
    if not row:
        return None

    metadata = _as_dict(row.get("metadata"))
    if (
        metadata.get("profile_embedding_sha256") != profile_embedding_sha256
        or metadata.get("verifier_model") != verifier_model
        or metadata.get("verifier_policy_version") != verifier_policy_version
    ):
        return None

    for column_name in verification_columns:
        payload = _as_dict(row.get(column_name))
        if not payload:
            continue
        try:
            return VerificationResult.model_validate(payload)
        except Exception as exc:
            logger.info(
                "lead_verification_cache_ignored tenant_id=%s service_profile_id=%s source_post_id=%s external_key=%s reason=%s error_type=%s error=%s",
                tenant_id,
                service_profile_id,
                source_post_id,
                external_key,
                "invalid_cached_payload",
                exc.__class__.__name__,
                exc,
            )
            return None

    return None



def _lead_match_status(verification: Any) -> str:
    """Map a verifier decision to a review-safe lead lifecycle status."""
    verifier_score = float(getattr(verification, "confidence", 0.0) or 0.0)
    is_match = bool(getattr(verification, "match", False))
    verifier_executed = bool(getattr(verification, "verifier_executed", False))
    decision_label = str(getattr(verification, "decision_label", ""))
    if not verifier_executed or not is_match:
        return "rejected"
    threshold = env_float(
        "LEAD_VERIFIER_SCORE_THRESHOLD",
        DEFAULT_VERIFIER_QUALIFIED_THRESHOLD,
    )
    # Main leads need both the configured confidence and direct evidence of a
    # real buyer problem. Potential buyers stay in their own review-only lane,
    # even if the model gave an unusually high numeric score.
    if decision_label == "strong_match" and verifier_score >= threshold:
        return "ready_for_review"
    discovery_threshold = env_float(
        "LEAD_DISCOVERY_CANDIDATE_SCORE_THRESHOLD",
        DEFAULT_DISCOVERY_CANDIDATE_THRESHOLD,
    )
    if decision_label in {"strong_match", "weak_match"} and verifier_score >= discovery_threshold:
        return "discovery_candidate"
    return "rejected"



def _persist_lead_match(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str | None,
    source_post_id: str | None,
    post: SocialPost,
    similarity_score: float,
    verification: Any,
    profile_embedding_sha256: str,
    verifier_model: str,
    verifier_policy_version: str,
) -> None:
    columns = _table_columns(conn, "lead_matches")
    if not {"tenant_id", "match_status"}.issubset(columns):
        logger.info("lead_match_persistence_skipped skip_reason=%s", "table_missing")
        return

    now = datetime.now(timezone.utc).isoformat()
    verifier_score = float(getattr(verification, "confidence", 0.0) or 0.0)
    # An LLM-verifier pass makes a lead ready for human review. Only the
    # dashboard's explicit human action promotes it to `qualified` and emits a
    # CRM webhook. A verified but lower-confidence signal remains a discovery
    # candidate rather than being mislabeled as qualified or silently erased.
    match_status = _lead_match_status(verification)
    verification_payload = verification.model_dump()
    source_post_json = post.to_source_post_json()
    metadata = {
        **(post.metadata or {}),
        "source": post.source,
        "external_id": post.external_id,
        "external_key": post.dedupe_key,
        "service_profile_id": service_profile_id,
        "profile_embedding_sha256": profile_embedding_sha256,
        "verifier_model": verifier_model,
        "verifier_policy_version": verifier_policy_version,
    }

    payload: dict[str, Any] = {
        "tenant_id": tenant_id,
        "service_profile_id": service_profile_id,
        "source_post_id": source_post_id,
        "match_status": match_status,
        "verifier_score": verifier_score,
        "similarity_score": similarity_score,
        "embedding_score": similarity_score,
        "match_score": similarity_score,
        "pain_detected": getattr(verification, "pain_detected", ""),
        "match_reason": getattr(verification, "why_this_matches", ""),
        "suggested_reply": getattr(verification, "suggested_reply", ""),
        "verification": verification_payload,
        "verifier_result": verification_payload,
        "source_post": source_post_json,
        "source_post_data": source_post_json,
        "source_post_json": source_post_json,
        "post": source_post_json,
        "metadata": metadata,
        "matched_at": now,
        "verified_at": now,
        "updated_at": now,
    }
    if "created_at" in columns:
        payload["created_at"] = now

    existing_id = _existing_lead_match_id(
        conn,
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        source_post_id=source_post_id,
        external_key=post.dedupe_key,
        columns=columns,
    )
    expressions, params = _bind_payload(payload, columns)

    if (
        service_profile_id
        and source_post_id
        and {"tenant_id", "service_profile_id", "source_post_id"}.issubset(columns)
    ):
        assignment_parts = [
            (
                "match_status = CASE "
                "WHEN public.lead_matches.match_status = 'qualified' "
                "THEN 'qualified' ELSE EXCLUDED.match_status END"
                if column_name == "match_status"
                else f"{column_name} = EXCLUDED.{column_name}"
            )
            for column_name in expressions
            if column_name
            not in {"id", "tenant_id", "service_profile_id", "source_post_id", "created_at"}
        ]
        conflict_sql = (
            f"DO UPDATE SET {', '.join(assignment_parts)}"
            if assignment_parts
            else "DO NOTHING"
        )
        where_sql = (
            """
             WHERE public.lead_matches.tenant_id = EXCLUDED.tenant_id
               AND public.lead_matches.service_profile_id = EXCLUDED.service_profile_id
               AND public.lead_matches.source_post_id = EXCLUDED.source_post_id
            """
            if assignment_parts
            else ""
        )
        conn.execute(
            text(
                f"""
                INSERT INTO public.lead_matches ({", ".join(expressions)})
                VALUES ({", ".join(expressions.values())})
                ON CONFLICT (tenant_id, service_profile_id, source_post_id)
                {conflict_sql}
                {where_sql}
                """
            ),
            params,
        )
        return

    if existing_id:
        assignment_parts = [
            (
                "match_status = CASE "
                "WHEN public.lead_matches.match_status = 'qualified' "
                "THEN 'qualified' ELSE :match_status END"
                if column_name == "match_status"
                else f"{column_name} = {expression}"
            )
            for column_name, expression in expressions.items()
            if column_name not in {"id", "tenant_id", "source_post_id", "created_at"}
        ]
        params["lead_match_id"] = existing_id
        params["tenant_id"] = tenant_id
        conn.execute(
            text(
                f"""
                UPDATE public.lead_matches
                   SET {", ".join(assignment_parts)}
                 WHERE id = :lead_match_id
                   AND tenant_id = :tenant_id
                """
            ),
            params,
        )
        return

    conn.execute(
        text(
            f"""
            INSERT INTO public.lead_matches ({", ".join(expressions)})
            VALUES ({", ".join(expressions.values())})
            """
        ),
        params,
    )

# Cross-module helper imports for static analysis and direct module use.
from .legacy_fetch import _table_columns
from .models import (
    DEFAULT_DISCOVERY_CANDIDATE_THRESHOLD,
    DEFAULT_VERIFIER_QUALIFIED_THRESHOLD,
    SOURCE_POST_EMBEDDING_CACHE_KEY,
    SocialPost,
    _embedding_values,
    logger,
)
