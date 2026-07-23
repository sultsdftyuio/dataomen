"""Lightweight Dramatiq actor registry.

This module is intentionally limited to the queue runtime and standard-library
helpers.  Actor implementations import their crawler, database, SDK, and HTTP
dependencies only after Dramatiq has dequeued work.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Sequence
from typing import Any

import dramatiq

logger = logging.getLogger(__name__)


def _int_env(name: str, default: int, *, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _require_redis_broker() -> None:
    """Configure a bounded broker only for a producer-side queue operation."""
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        raise RuntimeError("REDIS_URL is required to enqueue Dramatiq jobs.")

    from api.broker import configure_redis_broker

    current_broker = dramatiq.get_broker()
    if getattr(current_broker, "_arcli_redis_url", None) != redis_url:
        configure_redis_broker(redis_url)


def _job_started(
    *,
    job_name: str,
    tenant_id: str | None = None,
    **fields: Any,
) -> None:
    logger.info(
        "job_executed tenant_id=%s job_name=%s job_state=%s %s",
        tenant_id or "global",
        job_name,
        "processing",
        " ".join(f"{key}={value}" for key, value in fields.items()),
    )


def _job_finished(
    *,
    job_name: str,
    state: str,
    tenant_id: str | None = None,
    **fields: Any,
) -> None:
    logger.info(
        "job_executed tenant_id=%s job_name=%s job_state=%s %s",
        tenant_id or "global",
        job_name,
        state,
        " ".join(f"{key}={value}" for key, value in fields.items()),
    )


def _close_actor_openai_clients() -> None:
    """Close SDK transports even when an actor exits through a retry path."""
    from api.services.openai_lifecycle import close_current_thread_openai_clients

    close_current_thread_openai_clients()


@dramatiq.actor(
    actor_name="ingest_hn_job",
    queue_name=os.getenv("ARCLI_HN_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=3,
    min_backoff=15_000,
    max_backoff=90_000,
)
def ingest_hn_job(query: str, since_hours_ago: int = 24) -> None:
    """Ingest one HN search window and hand only fresh rows to embedding."""
    _job_started(
        job_name="hn_ingestion",
        query=query,
        since_hours_ago=since_hours_ago,
    )
    try:
        from api.services.social_ingestion import ingest_hn_posts, trigger_embedding_jobs

        result = ingest_hn_posts(query=query, since_hours_ago=since_hours_ago)
        embedding_jobs = trigger_embedding_jobs(result.inserted_source_post_ids)
    except Exception as exc:
        logger.exception(
            "hn_ingestion_failed job_state=%s query=%s since_hours_ago=%s error_type=%s error=%s",
            "failed",
            query,
            since_hours_ago,
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()

    _job_finished(
        job_name="hn_ingestion",
        state="completed",
        query=query,
        hits_found=result.hits_found,
        new_inserts=result.inserted_count,
        embedding_jobs=embedding_jobs,
    )


@dramatiq.actor(
    actor_name="ingest_x_job",
    queue_name=os.getenv("ARCLI_X_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=3,
    min_backoff=15_000,
    max_backoff=90_000,
)
def ingest_x_job(query: str, since_hours_ago: int = 24) -> None:
    """Ingest one X recent-search window and hand fresh rows to embedding."""
    _job_started(
        job_name="x_ingestion",
        query=query,
        since_hours_ago=since_hours_ago,
    )
    try:
        from api.services.social_ingestion import ingest_x_posts, trigger_embedding_jobs

        result = ingest_x_posts(query=query, since_hours_ago=since_hours_ago)
        embedding_jobs = trigger_embedding_jobs(result.inserted_source_post_ids)
    except Exception as exc:
        logger.exception(
            "x_ingestion_failed job_state=%s query=%s since_hours_ago=%s error_type=%s error=%s",
            "failed",
            query,
            since_hours_ago,
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()

    _job_finished(
        job_name="x_ingestion",
        state="completed",
        query=query,
        hits_found=result.hits_found,
        new_inserts=result.inserted_count,
        embedding_jobs=embedding_jobs,
    )


@dramatiq.actor(
    actor_name="enqueue_source_post_embedding_job",
    queue_name=os.getenv("ARCLI_SOURCE_POST_EMBEDDING_QUEUE_NAME", "embeddings"),
    max_retries=3,
    min_backoff=10_000,
    max_backoff=60_000,
)
def enqueue_source_post_embedding_job(source_post_id: str) -> None:
    """Durable handoff for the source-post embedding consumer."""
    _job_started(
        job_name="source_post_embedding_handoff",
        source_post_id=source_post_id,
    )
    _job_finished(
        job_name="source_post_embedding_handoff",
        state="completed",
        source_post_id=source_post_id,
    )


def enqueue_source_post_embedding_jobs(source_post_ids: Sequence[str]) -> int:
    """Publish one idempotent embedding handoff per newly inserted source row."""
    _require_redis_broker()
    messages_sent = 0
    for source_post_id in dict.fromkeys(source_post_ids):
        enqueue_source_post_embedding_job.send(source_post_id)
        messages_sent += 1
    logger.info(
        "source_post_embedding_handoffs_enqueued job_state=%s source_post_count=%s",
        "pending",
        messages_sent,
    )
    return messages_sent


@dramatiq.actor(
    actor_name="process_crawl_job",
    queue_name=os.getenv("ARCLI_CRAWL_QUEUE_NAME", "crawling"),
    max_retries=_int_env("ARCLI_CRAWL_JOB_MAX_RETRIES", 2),
    min_backoff=_int_env("ARCLI_CRAWL_JOB_MIN_BACKOFF_MS", 15_000, minimum=1),
    max_backoff=_int_env("ARCLI_CRAWL_JOB_MAX_BACKOFF_MS", 60_000, minimum=1),
    time_limit=_int_env("ARCLI_CRAWL_JOB_TIME_LIMIT_MS", 210_000, minimum=1),
    on_retry_exhausted="mark_crawl_job_dead_lettered",
)
def process_crawl_job(
    tenant_id: str,
    website_url: str,
    job_id: str | None = None,
) -> None:
    _job_started(
        job_name="crawl",
        tenant_id=tenant_id,
        website_url=website_url,
        job_id=job_id,
    )
    try:
        from api.services.crawling import process_crawl_job as execute

        execute(tenant_id, website_url, job_id)
    except Exception as exc:
        logger.exception(
            "crawl_actor_failed job_state=%s tenant_id=%s website_url=%s job_id=%s error_type=%s error=%s",
            "failed",
            tenant_id,
            website_url,
            job_id,
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()
    _job_finished(
        job_name="crawl",
        state="completed",
        tenant_id=tenant_id,
        website_url=website_url,
        job_id=job_id,
    )


@dramatiq.actor(
    actor_name="mark_crawl_job_dead_lettered",
    queue_name=os.getenv("ARCLI_CRAWL_QUEUE_NAME", "crawling"),
)
def mark_crawl_job_dead_lettered(
    message_data: dict[str, Any], retry_context: dict[str, Any] | None = None
) -> None:
    from api.services.crawling import mark_crawl_job_dead_lettered as execute

    execute(message_data, retry_context)


@dramatiq.actor(
    actor_name="process_workspace_brain_generation_job",
    queue_name=os.getenv("ARCLI_WORKSPACE_BRAIN_QUEUE_NAME", "workspace-brain"),
    max_retries=_int_env("ARCLI_WORKSPACE_BRAIN_JOB_MAX_RETRIES", 2),
    min_backoff=_int_env("ARCLI_WORKSPACE_BRAIN_JOB_MIN_BACKOFF_MS", 15_000, minimum=1),
    max_backoff=_int_env("ARCLI_WORKSPACE_BRAIN_JOB_MAX_BACKOFF_MS", 90_000, minimum=1),
    time_limit=_int_env("ARCLI_WORKSPACE_BRAIN_JOB_TIME_LIMIT_MS", 180_000, minimum=1),
)
def process_workspace_brain_generation_job(
    tenant_id: str, website_url: str, idempotency_key: str | None = None
) -> None:
    _job_started(
        job_name="workspace_brain",
        tenant_id=tenant_id,
        website_url=website_url,
    )
    try:
        from api.services.profile_extraction import process_workspace_brain_generation_job as execute

        execute(tenant_id, website_url, idempotency_key)
    except Exception as exc:
        logger.exception(
            "workspace_brain_actor_failed job_state=%s tenant_id=%s website_url=%s error_type=%s error=%s",
            "failed",
            tenant_id,
            website_url,
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()
    _job_finished(
        job_name="workspace_brain",
        state="completed",
        tenant_id=tenant_id,
        website_url=website_url,
    )


@dramatiq.actor(
    actor_name="process_service_profile_embedding_job",
    queue_name=os.getenv("ARCLI_EMBEDDING_QUEUE_NAME", "embeddings"),
    max_retries=_int_env("ARCLI_EMBEDDING_JOB_MAX_RETRIES", 3),
    min_backoff=_int_env("ARCLI_EMBEDDING_JOB_MIN_BACKOFF_MS", 10_000, minimum=1),
    max_backoff=_int_env("ARCLI_EMBEDDING_JOB_MAX_BACKOFF_MS", 60_000, minimum=1),
    time_limit=_int_env("ARCLI_EMBEDDING_JOB_TIME_LIMIT_MS", 90_000, minimum=1),
    on_retry_exhausted="mark_service_profile_embedding_dead_lettered",
)
def process_service_profile_embedding_job(
    tenant_id: str, service_profile_id: str | None = None
) -> None:
    _job_started(
        job_name="service_profile_embedding",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
    )
    try:
        from api.services.embeddings import process_service_profile_embedding_job as execute

        execute(tenant_id, service_profile_id)
    except Exception as exc:
        logger.exception(
            "service_profile_embedding_actor_failed job_state=%s tenant_id=%s service_profile_id=%s error_type=%s error=%s",
            "failed",
            tenant_id,
            service_profile_id,
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()
    _job_finished(
        job_name="service_profile_embedding",
        state="completed",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
    )


@dramatiq.actor(
    actor_name="mark_service_profile_embedding_dead_lettered",
    queue_name=os.getenv("ARCLI_EMBEDDING_QUEUE_NAME", "embeddings"),
)
def mark_service_profile_embedding_dead_lettered(
    message_data: dict[str, Any], retry_context: dict[str, Any] | None = None
) -> None:
    from api.services.embeddings import mark_service_profile_embedding_dead_lettered as execute

    execute(message_data, retry_context)


@dramatiq.actor(
    actor_name="process_initial_public_ingestion_job",
    queue_name=os.getenv("ARCLI_PUBLIC_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=_int_env("ARCLI_PUBLIC_INGESTION_JOB_MAX_RETRIES", 3),
    min_backoff=_int_env("ARCLI_PUBLIC_INGESTION_JOB_MIN_BACKOFF_MS", 15_000, minimum=1),
    max_backoff=_int_env("ARCLI_PUBLIC_INGESTION_JOB_MAX_BACKOFF_MS", 90_000, minimum=1),
    time_limit=_int_env("ARCLI_PUBLIC_INGESTION_JOB_TIME_LIMIT_MS", 180_000, minimum=1),
    on_retry_exhausted="mark_initial_public_ingestion_dead_lettered",
)
def process_initial_public_ingestion_job(
    tenant_id: str, service_profile_id: str | None = None
) -> None:
    _job_started(
        job_name="initial_public_ingestion",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
    )
    try:
        from api.services.ingestion_service import process_initial_public_ingestion_job as execute

        execute(tenant_id, service_profile_id)
    except Exception as exc:
        logger.exception(
            "initial_public_ingestion_actor_failed job_state=%s tenant_id=%s service_profile_id=%s error_type=%s error=%s",
            "failed",
            tenant_id,
            service_profile_id,
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()
    _job_finished(
        job_name="initial_public_ingestion",
        state="completed",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
    )


@dramatiq.actor(
    actor_name="mark_initial_public_ingestion_dead_lettered",
    queue_name=os.getenv("ARCLI_PUBLIC_INGESTION_QUEUE_NAME", "ingestion"),
)
def mark_initial_public_ingestion_dead_lettered(
    message_data: dict[str, Any], retry_context: dict[str, Any] | None = None
) -> None:
    from api.services.ingestion_service import mark_initial_public_ingestion_dead_lettered as execute

    execute(message_data, retry_context)
