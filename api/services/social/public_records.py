"""Global public-source record access and embedding-cache persistence."""

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





def _load_public_source_post_rows(
    conn: Connection,
    source_post_id: str,
    *,
    source: str | None = None,
) -> list[dict[str, Any]]:
    """Load one source-qualified global row without crossing tenant rows.

    Source-less calls only exist to drain legacy queued work. They are allowed
    when there is exactly one matching global row, but deliberately skip an
    ambiguous external ID instead of letting a newly added source cross-match
    another provider's content.
    """
    columns = _table_columns(conn, "source_posts")
    required_columns = {"id", "source", "source_post_id"}
    if not required_columns.issubset(columns):
        logger.warning(
            "public_source_post_embedding_skipped source=%s source_post_id=%s skip_reason=%s",
            source,
            source_post_id,
            "source_post_contract_missing",
        )
        return []

    select_columns = [
        column_name
        for column_name in (
            "id",
            "source",
            "source_post_id",
            "title",
            "body",
            "text",
            "author_handle",
            "author",
            "url",
            "posted_at",
            "published_at",
            "metadata",
            "embedding_status",
        )
        if column_name in columns
    ]
    normalized_source = (source or "").strip() or None
    where_parts = ["source_post_id = :source_post_id"]
    params: dict[str, Any] = {"source_post_id": source_post_id}
    if normalized_source:
        where_parts.append("source = :source")
        params["source"] = normalized_source
    if "tenant_id" in columns:
        where_parts.append("tenant_id IS NULL")

    # Query two rows for a legacy source-less handoff: one proves it is still
    # unambiguous; two prove that processing it would cross provider domains.
    limit_clause = "" if normalized_source else "LIMIT 2"

    rows = conn.execute(
        text(
            f"""
            SELECT {", ".join(select_columns)}
             FROM public.source_posts
             WHERE {" AND ".join(where_parts)}
             ORDER BY id
             {limit_clause}
            """
        ),
        params,
    ).mappings()
    normalized_rows = [dict(row) for row in rows]
    if not normalized_source and len(normalized_rows) > 1:
        logger.warning(
            "public_source_post_embedding_skipped source_post_id=%s skip_reason=%s",
            source_post_id,
            "source_post_ref_missing_ambiguous",
        )
        return []
    return normalized_rows



def _load_recent_embedded_public_source_post_rows(
    conn: Connection,
    *,
    limit: int,
) -> list[dict[str, Any]]:
    """Load a bounded global corpus slice that can be matched without re-embed.

    Activation rematching intentionally consumes only rows already marked
    embedded.  Re-embedding a corpus for every customer would defeat the
    global cache and make onboarding OpenAI usage scale with tenant count.
    """
    columns = _table_columns(conn, "source_posts")
    required_columns = {"id", "source", "source_post_id", "tenant_id", "metadata"}
    if not required_columns.issubset(columns) or "embedding_status" not in columns:
        logger.warning(
            "existing_public_source_rematch_skipped skip_reason=%s",
            "source_post_contract_missing",
        )
        return []

    select_columns = [
        column_name
        for column_name in (
            "id",
            "source",
            "source_post_id",
            "title",
            "body",
            "text",
            "author_handle",
            "author",
            "url",
            "posted_at",
            "published_at",
            "metadata",
            "embedding_status",
        )
        if column_name in columns
    ]
    order_column = "posted_at" if "posted_at" in columns else "id"
    rows = conn.execute(
        text(
            f"""
            SELECT {", ".join(select_columns)}
              FROM public.source_posts
             WHERE tenant_id IS NULL
               AND source_post_id IS NOT NULL
               AND embedding_status = 'completed'
             ORDER BY {order_column} DESC NULLS LAST, id DESC
             LIMIT :limit
            """
        ),
        {"limit": limit},
    ).mappings()
    return [dict(row) for row in rows]



def _public_source_post_as_social_post(row: dict[str, Any]) -> SocialPost | None:
    source = _string_value(row.get("source"))
    external_id = _string_value(row.get("source_post_id"))
    title = _string_value(row.get("title")) or ""
    body = _string_value(row.get("body")) or _string_value(row.get("text")) or ""
    if not source or not external_id or not body.strip():
        return None

    metadata = _as_dict(row.get("metadata"))
    return SocialPost(
        source=source,
        external_id=external_id,
        title=title,
        text=body,
        author=(
            _string_value(row.get("author_handle"))
            or _string_value(row.get("author"))
        ),
        url=_string_value(row.get("url")),
        published_at=(
            _string_value(row.get("posted_at"))
            or _string_value(row.get("published_at"))
        ),
        metadata=metadata,
    )



def _cached_public_source_post_embedding(
    conn: Connection,
    *,
    database_post_id: str,
    text_sha256: str,
    embedding_model: str,
) -> list[float] | None:
    columns = _table_columns(conn, "source_posts")
    if "metadata" not in columns:
        return None

    cache = conn.execute(
        text(
            """
            SELECT metadata->:cache_key
              FROM public.source_posts
             WHERE id = CAST(:database_post_id AS uuid)
               AND tenant_id IS NULL
             LIMIT 1
            """
        ),
        {
            "database_post_id": database_post_id,
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



def _persist_public_source_post_embedding_cache(
    conn: Connection,
    *,
    database_post_id: str,
    text_sha256: str,
    embedding_model: str,
    embedding: list[float],
) -> None:
    columns = _table_columns(conn, "source_posts")
    metadata_column = columns.get("metadata")
    if not metadata_column:
        return

    metadata_expression = """
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
    if metadata_column["data_type"] == "json" or metadata_column["udt_name"] == "json":
        metadata_expression = f"({metadata_expression})::json"

    assignments = [f"metadata = {metadata_expression}"]
    if "embedding_status" in columns:
        assignments.append("embedding_status = 'completed'")
    if "updated_at" in columns:
        assignments.append("updated_at = CAST(:cached_at AS timestamptz)")

    conn.execute(
        text(
            f"""
            UPDATE public.source_posts
               SET {", ".join(assignments)}
             WHERE id = CAST(:database_post_id AS uuid)
               AND tenant_id IS NULL
            """
        ),
        {
            "database_post_id": database_post_id,
            "cache_key": SOURCE_POST_EMBEDDING_CACHE_KEY,
            "embedding_model": embedding_model,
            "text_sha256": text_sha256,
            "embedding": json.dumps(embedding, separators=(",", ":")),
            "dimensions": len(embedding),
            "cached_at": datetime.now(timezone.utc).isoformat(),
        },
    )



def _mark_public_source_post_embedding_failed(
    conn: Connection,
    *,
    database_post_id: str,
) -> None:
    columns = _table_columns(conn, "source_posts")
    if "embedding_status" not in columns:
        return

    assignments = ["embedding_status = 'failed'"]
    params: dict[str, Any] = {"database_post_id": database_post_id}
    if "updated_at" in columns:
        assignments.append("updated_at = CAST(:updated_at AS timestamptz)")
        params["updated_at"] = datetime.now(timezone.utc).isoformat()

    conn.execute(
        text(
            f"""
            UPDATE public.source_posts
               SET {", ".join(assignments)}
             WHERE id = CAST(:database_post_id AS uuid)
               AND tenant_id IS NULL
            """
        ),
        params,
    )

# Cross-module helper imports for static analysis and direct module use.
from .legacy_fetch import _table_columns
from .models import (
    SOURCE_POST_EMBEDDING_CACHE_KEY,
    SocialPost,
    _embedding_values,
    logger,
)
