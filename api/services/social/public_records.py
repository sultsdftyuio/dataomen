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
    normalize_embedding_text,
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



def _timestamp_value(value: Any) -> str | None:
    """Return a post timestamp as text, whichever form the driver produced."""
    # A timestamptz column arrives as a datetime, which the generic string
    # reader rejects. Without this the match snapshot loses the post's date.
    if isinstance(value, datetime):
        return value.isoformat()
    return _string_value(value)


def _public_source_post_as_social_post(row: dict[str, Any]) -> SocialPost | None:
    source = _string_value(row.get("source"))
    external_id = _string_value(row.get("source_post_id"))
    title = _string_value(row.get("title")) or ""
    body = _string_value(row.get("body")) or _string_value(row.get("text")) or ""
    if not source or not external_id or not body.strip():
        return None

    metadata = _as_dict(row.get("metadata"))
    # The cached vector is matching state, not post context. Left in place it
    # is copied into every lead and watchlist match built from this post.
    metadata.pop(SOURCE_POST_EMBEDDING_CACHE_KEY, None)
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
            _timestamp_value(row.get("posted_at"))
            or _timestamp_value(row.get("published_at"))
        ),
        metadata=metadata,
    )



def _cached_public_source_post_embedding(
    source_row: dict[str, Any],
    *,
    text_sha256: str,
    embedding_model: str,
) -> list[float] | None:
    """Return the row's cached vector when it matches this text and model.

    Every loader selects ``metadata`` with the post, so the cache is read from
    the row in hand. Asking the database again would cost a round trip per
    post to fetch a vector the caller already holds.
    """
    cache_payload = _as_dict(
        _as_dict(source_row.get("metadata")).get(SOURCE_POST_EMBEDDING_CACHE_KEY)
    )
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

    # jsonb_build_object accepts any type, so the server cannot infer an
    # untyped parameter. Psycopg 3 binds server-side and rejects the statement
    # unless every argument carries an explicit cast.
    metadata_expression = """
        (
            COALESCE(metadata::jsonb, '{}'::jsonb)
            || jsonb_build_object(
                CAST(:cache_key AS text),
                jsonb_build_object(
                    'model', CAST(:embedding_model AS text),
                    'text_sha256', CAST(:text_sha256 AS text),
                    'embedding', CAST(:embedding AS jsonb),
                    'dimensions', CAST(:dimensions AS integer),
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


def _normalized_public_source_post_refs(
    source_post_refs: Sequence[Any],
) -> list[tuple[str | None, str]]:
    """Normalize broker-safe source references without losing source identity."""
    normalized_refs: list[tuple[str | None, str]] = []
    seen: set[tuple[str | None, str]] = set()
    for ref in source_post_refs:
        if isinstance(ref, tuple) and len(ref) == 2:
            source = _string_value(ref[0])
            source_post_id = _string_value(ref[1]) or ""
        elif isinstance(ref, str):
            source = None
            source_post_id = ref.strip()
        elif isinstance(ref, dict):
            source = _string_value(ref.get("source"))
            source_post_id = _string_value(ref.get("source_post_id")) or ""
        else:
            source = _string_value(getattr(ref, "source", None))
            source_post_id = _string_value(getattr(ref, "source_post_id", None)) or ""
        key = ((source or "").strip() or None, source_post_id.strip())
        if not key[1] or key in seen:
            continue
        seen.add(key)
        normalized_refs.append(key)
    return normalized_refs


def prewarm_public_source_post_embedding_cache(
    source_post_refs: Sequence[Any],
    *,
    source_rows_by_ref: (
        dict[tuple[str | None, str], list[dict[str, Any]]] | None
    ) = None,
    embedding_service: EmbeddingService | None = None,
    embedding_values_by_database_post_id: dict[str, list[float]] | None = None,
) -> int:
    """Fill missing public-post embeddings with provider-sized batches.

    The downstream matching function remains deliberately per post: it keeps
    its idempotent cache, verifier policy, and lead persistence semantics.
    This small preparation step only replaces many one-input embedding calls
    with one request containing up to the configured batch size.
    """
    normalized_refs = _normalized_public_source_post_refs(source_post_refs)

    if not normalized_refs:
        return 0

    engine = _database_engine()
    owns_embedding_service = embedding_service is None
    embedding_service = embedding_service or EmbeddingService()
    rows_by_ref = dict(source_rows_by_ref or {})
    missing_embeddings: list[tuple[str, str, str]] = []
    try:
        unloaded_refs = [ref for ref in normalized_refs if rows_by_ref.get(ref) is None]
        if unloaded_refs:
            with engine.begin() as conn:
                for source, source_post_id in unloaded_refs:
                    rows_by_ref[(source, source_post_id)] = (
                        _load_public_source_post_rows(
                            conn,
                            source_post_id,
                            source=source,
                        )
                    )

        # A source-less legacy reference can resolve to a row that a qualified
        # reference in the same batch also names; embed that post once.
        seen_database_post_ids: set[str] = set()
        for ref in normalized_refs:
            for source_row in rows_by_ref.get(ref) or ():
                database_post_id = str(source_row["id"])
                if database_post_id in seen_database_post_ids:
                    continue
                seen_database_post_ids.add(database_post_id)
                post = _public_source_post_as_social_post(source_row)
                if not post:
                    continue
                embedding_text = normalize_embedding_text(post.matching_text[:32_000])
                text_sha256 = _sha256_text(embedding_text)
                cached_embedding = _cached_public_source_post_embedding(
                    source_row,
                    text_sha256=text_sha256,
                    embedding_model=embedding_service.model,
                )
                if cached_embedding:
                    if embedding_values_by_database_post_id is not None:
                        embedding_values_by_database_post_id[database_post_id] = (
                            cached_embedding
                        )
                    continue
                missing_embeddings.append(
                    (database_post_id, text_sha256, embedding_text)
                )

        if not missing_embeddings:
            return 0

        try:
            embeddings = embedding_service.embed_many(
                [item[2] for item in missing_embeddings],
                source_post_ids=[item[0] for item in missing_embeddings],
                purpose="public_source_matching",
            )
        except Exception:
            with engine.begin() as conn:
                for database_post_id, _, _ in missing_embeddings:
                    _mark_public_source_post_embedding_failed(
                        conn,
                        database_post_id=database_post_id,
                    )
            raise

        # One transaction for the batch: a checkout, BEGIN and COMMIT per post
        # would cost more round trips than the writes themselves.
        with engine.begin() as conn:
            for (database_post_id, text_sha256, _), embedding in zip(
                missing_embeddings,
                embeddings,
            ):
                _persist_public_source_post_embedding_cache(
                    conn,
                    database_post_id=database_post_id,
                    text_sha256=text_sha256,
                    embedding_model=embedding.model,
                    embedding=embedding.embedding,
                )
        # Hand vectors to the matcher only once they are durably cached.
        if embedding_values_by_database_post_id is not None:
            for (database_post_id, _, _), embedding in zip(
                missing_embeddings,
                embeddings,
            ):
                embedding_values_by_database_post_id[database_post_id] = (
                    embedding.embedding
                )

        logger.info(
            "public_source_post_embedding_batch_cached posts=%s model=%s",
            len(missing_embeddings),
            embedding_service.model,
        )
        return len(missing_embeddings)
    finally:
        if owns_embedding_service:
            embedding_service.close()

# Cross-module helper imports for static analysis and direct module use.
from .legacy_fetch import _table_columns
from .models import (
    SOURCE_POST_EMBEDDING_CACHE_KEY,
    SocialPost,
    _embedding_values,
    _sha256_text,
    logger,
)
