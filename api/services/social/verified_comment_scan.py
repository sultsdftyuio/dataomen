"""Bounded Hacker News thread expansion after a lead is verified.

Comments are never a new broad crawl. A thread is expanded only after its
parent story is a verifier-confirmed ``ready_for_review`` match for the same
tenant/profile scope. The small Redis claim prevents duplicate worker work
while retaining the normal source-post and lead-match deduplication layers.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from api.services.cost_controls import env_int

logger = logging.getLogger(__name__)


def _comment_scan_limit() -> int:
    return max(1, min(100, env_int("ARCLI_HN_VERIFIED_COMMENT_LIMIT", 40)))


def _claim_ttl_seconds() -> int:
    return max(300, min(86_400, env_int("ARCLI_HN_VERIFIED_COMMENT_SCAN_TTL_SECONDS", 21_600)))


def _story_id_from_post(post: Any) -> str | None:
    source = str(getattr(post, "source", "") or "").strip().casefold()
    metadata = getattr(post, "metadata", None)
    metadata = metadata if isinstance(metadata, dict) else {}
    if source != "hackernews" or metadata.get("content_kind") != "story":
        return None
    story_id = str(getattr(post, "external_id", "") or "").strip()
    return story_id if story_id.isdigit() and int(story_id) > 0 else None


def enqueue_verified_thread_comment_scan(
    post: Any,
    *,
    tenant_id: str,
    service_profile_id: str,
) -> bool:
    """Queue a single story-comment scan without affecting lead persistence."""

    story_id = _story_id_from_post(post)
    if not story_id or not tenant_id.strip() or not service_profile_id.strip():
        return False
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        logger.info(
            "verified_thread_comment_scan_skipped source=hackernews story_id=%s reason=%s",
            story_id,
            "redis_not_configured",
        )
        return False

    claim_key = (
        "arcli:verified-thread-comment-scan:"
        f"{tenant_id.strip()}:{service_profile_id.strip()}:{story_id}"
    )
    client = None
    try:
        import redis

        client = redis.Redis.from_url(redis_url, decode_responses=True)
        claimed = bool(client.set(claim_key, "1", nx=True, ex=_claim_ttl_seconds()))
        if not claimed:
            return False
        from api.workers.actors import scan_verified_hn_story_comments_job

        scan_verified_hn_story_comments_job.send(
            story_id,
            tenant_id=tenant_id.strip(),
            service_profile_id=service_profile_id.strip(),
        )
        logger.info(
            "verified_thread_comment_scan_enqueued source=hackernews story_id=%s tenant_id=%s service_profile_id=%s comment_limit=%s",
            story_id,
            tenant_id,
            service_profile_id,
            _comment_scan_limit(),
        )
        return True
    except Exception as exc:
        # Comment context is additive. A Redis/broker failure must never undo
        # a confirmed lead or retry the expensive verifier path.
        logger.warning(
            "verified_thread_comment_scan_enqueue_skipped source=hackernews story_id=%s error_type=%s",
            story_id,
            exc.__class__.__name__,
        )
        return False
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                pass


def scan_verified_hn_story_comments(
    story_id: str,
    *,
    tenant_id: str,
    service_profile_id: str,
) -> dict[str, int]:
    """Persist one verified story's comments and hand them to normal matching."""

    normalized_story_id = story_id.strip()
    if not normalized_story_id.isdigit() or int(normalized_story_id) <= 0:
        raise ValueError("story_id must be a positive Hacker News item id")
    if not tenant_id.strip() or not service_profile_id.strip():
        raise ValueError("tenant_id and service_profile_id are required")

    from api.services.integrations.hn_connector import HackerNewsConnector
    from api.services.social.public_storage import (
        _matchable_source_post_refs,
        _persist_new_public_source_posts,
        trigger_embedding_jobs,
    )

    comments = asyncio.run(
        HackerNewsConnector().fetch_story_comments(
            normalized_story_id,
            limit=_comment_scan_limit(),
        )
    )
    if not comments:
        return {"comments_found": 0, "inserted": 0, "embedding_jobs": 0}

    inserted_ids = _persist_new_public_source_posts(comments, batch_size=50)
    refs = _matchable_source_post_refs(comments)
    embedding_jobs = trigger_embedding_jobs(
        refs,
        tenant_id=tenant_id.strip(),
        service_profile_id=service_profile_id.strip(),
    )
    result = {
        "comments_found": len(comments),
        "inserted": len(inserted_ids),
        "embedding_jobs": embedding_jobs,
    }
    logger.info(
        "verified_thread_comment_scan_completed source=hackernews story_id=%s tenant_id=%s service_profile_id=%s comments_found=%s inserted=%s embedding_jobs=%s",
        normalized_story_id,
        tenant_id,
        service_profile_id,
        result["comments_found"],
        result["inserted"],
        result["embedding_jobs"],
    )
    return result
