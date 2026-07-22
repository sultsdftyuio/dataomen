"""Actors for globally scoped prospect-source ingestion."""

from __future__ import annotations

import logging
import os
from collections.abc import Sequence

import dramatiq
import httpx

from api.broker import configure_redis_broker
from api.services.social_ingestion import (
    ingest_hn_posts,
    ingest_x_posts,
    trigger_embedding_jobs,
)

logger = logging.getLogger(__name__)


def _configure_dramatiq_broker() -> None:
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return

    current_broker = dramatiq.get_broker()
    if getattr(current_broker, "_arcli_redis_url", None) != redis_url:
        configure_redis_broker(redis_url)


_configure_dramatiq_broker()


@dramatiq.actor(
    queue_name=os.getenv("ARCLI_HN_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=3,
    min_backoff=15_000,
    max_backoff=90_000,
)
def ingest_hn_job(query: str, since_hours_ago: int = 24) -> None:
    """Ingest one HN search window and hand only fresh rows to embedding."""
    try:
        result = ingest_hn_posts(query=query, since_hours_ago=since_hours_ago)
        embedding_jobs = trigger_embedding_jobs(result.inserted_source_post_ids)
    except (httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        logger.exception(
            "hn_ingestion_retryable_failure query=%s since_hours_ago=%s error_type=%s error=%s",
            query,
            since_hours_ago,
            exc.__class__.__name__,
            exc,
        )
        raise
    except Exception as exc:
        logger.exception(
            "hn_ingestion_failed query=%s since_hours_ago=%s error_type=%s error=%s",
            query,
            since_hours_ago,
            exc.__class__.__name__,
            exc,
        )
        raise

    logger.info(
        "hn_ingestion_completed query=%s hits_found=%s new_inserts=%s embedding_jobs=%s",
        query,
        result.hits_found,
        result.inserted_count,
        embedding_jobs,
    )


@dramatiq.actor(
    queue_name=os.getenv("ARCLI_X_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=3,
    min_backoff=15_000,
    max_backoff=90_000,
)
def ingest_x_job(query: str, since_hours_ago: int = 24) -> None:
    """Ingest one X recent-search window and hand fresh rows to embedding."""
    try:
        result = ingest_x_posts(query=query, since_hours_ago=since_hours_ago)
        embedding_jobs = trigger_embedding_jobs(result.inserted_source_post_ids)
    except (httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        logger.exception(
            "x_ingestion_retryable_failure query=%s since_hours_ago=%s error_type=%s error=%s",
            query,
            since_hours_ago,
            exc.__class__.__name__,
            exc,
        )
        raise
    except Exception as exc:
        logger.exception(
            "x_ingestion_failed query=%s since_hours_ago=%s error_type=%s error=%s",
            query,
            since_hours_ago,
            exc.__class__.__name__,
            exc,
        )
        raise

    logger.info(
        "x_ingestion_completed query=%s hits_found=%s new_inserts=%s embedding_jobs=%s",
        query,
        result.hits_found,
        result.inserted_count,
        embedding_jobs,
    )


@dramatiq.actor(
    queue_name=os.getenv("ARCLI_SOURCE_POST_EMBEDDING_QUEUE_NAME", "embeddings"),
    max_retries=3,
)
def enqueue_source_post_embedding_job(source_post_id: str) -> None:
    """Queue boundary for the source-post embedding consumer.

    The embedding consumer owns vector generation and status transitions; this
    actor makes the post ID durable on the embedding queue immediately after a
    successful public-source insert.
    """
    logger.info("source_post_embedding_handoff source_post_id=%s", source_post_id)


def enqueue_source_post_embedding_jobs(source_post_ids: Sequence[str]) -> int:
    """Publish one idempotent embedding handoff per newly inserted source row."""
    messages_sent = 0
    for source_post_id in dict.fromkeys(source_post_ids):
        enqueue_source_post_embedding_job.send(source_post_id)
        messages_sent += 1
    return messages_sent
