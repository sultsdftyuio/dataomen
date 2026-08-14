"""Public Storage for social-source ingestion."""

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




_public_source_supabase_client: Any | None = None



def _create_public_source_supabase_client() -> Any:
    """Create the service-role client used for one globally scoped ingest."""
    from supabase import create_client
    from supabase.client import ClientOptions

    supabase_url = (
        os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    ).strip()
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
    ).strip()
    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase credentials are required for public source ingestion.")

    return create_client(
        supabase_url,
        supabase_key,
        options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
            postgrest_client_timeout=15,
            storage_client_timeout=15,
        ),
    )



@contextmanager
def _public_source_supabase_client_context() -> Iterator[Any]:
    """Scope Supabase transports to a single HN or X persistence operation."""
    if _public_source_supabase_client is not None:
        # Unit tests may inject a no-network fake.  Never close an object this
        # module does not own.
        yield _public_source_supabase_client
        return

    with managed_network_client(_create_public_source_supabase_client) as client:
        yield client



_BatchItem = TypeVar("_BatchItem")



def _iter_batches(
    items: list[_BatchItem],
    batch_size: int,
) -> Iterator[list[_BatchItem]]:
    """Yield bounded chunks without materializing a second full collection."""
    for offset in range(0, len(items), batch_size):
        yield items[offset : offset + batch_size]



def _source_post_payload(post: Any) -> dict[str, Any]:
    """Use the SourcePost contract as the sole database payload contract."""
    return post.model_dump(mode="json")



def _response_source_post_ids(response: Any) -> list[str]:
    rows = getattr(response, "data", None)
    if not isinstance(rows, list):
        return []
    return [
        str(row["source_post_id"])
        for row in rows
        if isinstance(row, dict) and row.get("source_post_id")
    ]



def _is_missing_postgrest_column(error: Exception, column_name: str) -> bool:
    """Return whether PostgREST rejected an optional column absent from schema."""
    if getattr(error, "code", None) != "PGRST204":
        return False
    message = str(getattr(error, "message", "") or error)
    return column_name in message and "column" in message.lower()



def _upsert_public_source_post_payloads(
    client: Any,
    payloads: list[dict[str, Any]],
) -> Any:
    return (
        client.table("source_posts")
        .upsert(
            payloads,
            on_conflict="source,source_post_id",
            ignore_duplicates=True,
        )
        .execute()
    )



def _persist_new_public_source_posts(
    posts: Sequence[Any],
    *,
    batch_size: int,
) -> list[str]:
    """Insert only new public source rows and return the inserted source IDs."""
    inserted_source_post_ids: list[str] = []
    author_handle_supported = True
    with _public_source_supabase_client_context() as client:
        for batch in _iter_batches(posts, batch_size):
            payloads = [_source_post_payload(post) for post in batch]
            if author_handle_supported:
                try:
                    response = _upsert_public_source_post_payloads(client, payloads)
                except Exception as error:
                    if not _is_missing_postgrest_column(error, "author_handle"):
                        raise
                    # Some deployments predate the optional author_handle
                    # column. Keep the source post rather than losing a whole
                    # ingestion batch; the contract migration adds this field
                    # for new deployments.
                    author_handle_supported = False
                    logger.warning(
                        "public_source_posts_schema_fallback column=%s error_code=%s",
                        "author_handle",
                        getattr(error, "code", None),
                    )
                    response = _upsert_public_source_post_payloads(
                        client,
                        [
                            {
                                key: value
                                for key, value in payload.items()
                                if key != "author_handle"
                            }
                            for payload in payloads
                        ],
                    )
            else:
                response = _upsert_public_source_post_payloads(
                    client,
                    [
                        {
                            key: value
                            for key, value in payload.items()
                            if key != "author_handle"
                        }
                        for payload in payloads
                    ],
                )
            inserted_source_post_ids.extend(_response_source_post_ids(response))

    # A returned row from ON CONFLICT DO NOTHING is necessarily a fresh insert.
    return list(dict.fromkeys(inserted_source_post_ids))



def _matchable_source_post_ids(
    posts: Sequence[Any],
) -> list[str]:
    """Return every fetched global external ID, including duplicate rows."""
    return list(dict.fromkeys(post.source_post_id for post in posts if post.source_post_id))



def _matchable_source_post_refs(posts: Sequence[Any]) -> list[PublicSourcePostRef]:
    """Return every fetched source-qualified identity, including existing rows."""
    refs: dict[tuple[str, str], PublicSourcePostRef] = {}
    for post in posts:
        source = str(getattr(post, "source", "") or "").strip()
        source_post_id = str(getattr(post, "source_post_id", "") or "").strip()
        if not source or not source_post_id:
            continue
        ref = PublicSourcePostRef(source, source_post_id)
        refs.setdefault((ref.source, ref.source_post_id), ref)
    return list(refs.values())



def _result_source_post_refs(
    result: Any,
    *,
    source: str,
) -> list[PublicSourcePostRef]:
    """Read source-qualified result refs while replaying legacy result shapes."""
    refs = getattr(result, "matchable_source_post_refs", None)
    if refs:
        return _matchable_source_post_refs(refs)

    raw_ids = (
        getattr(result, "matchable_source_post_ids", None)
        or getattr(result, "inserted_source_post_ids", None)
        or []
    )
    return [
        PublicSourcePostRef(source, str(source_post_id))
        for source_post_id in dict.fromkeys(raw_ids)
        if str(source_post_id).strip()
    ]



def trigger_embedding_jobs(source_post_refs: Sequence[PublicSourcePostRef]) -> int:
    """Hand fetched public rows to the embedding queue.

    The source corpus is global, while lead matching is tenant-scoped. A post
    returned by a new profile's search may already exist globally; handing it
    off again is necessary to evaluate it against that newly created profile.

    This import is intentionally lazy to avoid a service/actor import cycle
    while allowing the consumer to remain independently scalable.
    """
    if not source_post_refs:
        return 0

    # Configure the broker before importing the actor registry.  Dramatiq
    # binds an actor to the broker that exists at decoration time.
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        raise RuntimeError("REDIS_URL is required to enqueue embedding jobs.")

    import dramatiq

    from api.broker import configure_redis_broker

    current_broker = dramatiq.get_broker()
    if getattr(current_broker, "_arcli_redis_url", None) != redis_url:
        configure_redis_broker(redis_url)

    from api.workers.actors import enqueue_source_post_embedding_jobs

    return enqueue_source_post_embedding_jobs(source_post_refs)



def enqueue_existing_public_source_rematch(
    tenant_id: str,
    service_profile_id: str | None,
    *,
    delay_ms: int = 0,
) -> str | None:
    """Queue a bounded, profile-only rematch of the cached public corpus.

    This is separate from new-post embedding: it lets a newly activated
    profile benefit from global public-source rows collected before that customer
    existed, without re-running every other tenant's profile against those
    rows.
    """
    if not service_profile_id:
        return None

    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        raise RuntimeError("REDIS_URL is required to enqueue public source rematches.")

    import dramatiq

    from api.broker import configure_redis_broker

    current_broker = dramatiq.get_broker()
    if getattr(current_broker, "_arcli_redis_url", None) != redis_url:
        configure_redis_broker(redis_url)

    from api.workers.actors import rematch_existing_public_source_posts_job

    normalized_delay_ms = max(0, int(delay_ms))
    if normalized_delay_ms:
        message = rematch_existing_public_source_posts_job.send_with_options(
            args=(tenant_id, service_profile_id),
            delay=normalized_delay_ms,
        )
    else:
        message = rematch_existing_public_source_posts_job.send(
            tenant_id,
            service_profile_id,
        )
    logger.info(
        "existing_public_source_rematch_enqueued tenant_id=%s service_profile_id=%s job_state=%s message_id=%s delay_ms=%s",
        tenant_id,
        service_profile_id,
        "pending",
        message.message_id,
        normalized_delay_ms,
    )
    return message.message_id

# Cross-module helper imports for static analysis and direct module use.
from .models import (
    PublicSourcePostRef,
    logger,
)
