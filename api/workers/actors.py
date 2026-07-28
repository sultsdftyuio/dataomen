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


class NonRetryableCrawlError(Exception):
    """A permanent provider request error that is already recorded on the crawl job."""


def _is_non_retryable_crawl_error(exc: BaseException) -> bool:
    """Do not repeat paid crawl work for permanent provider or semantic errors."""

    if exc.__class__.__name__ == "ProfileExtractionSemanticError":
        return True

    status_code = getattr(exc, "status_code", None)
    return (
        isinstance(status_code, int)
        and 400 <= status_code < 500
        and status_code not in {408, 409, 429}
    )


def _int_env(name: str, default: int, *, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _minimum_plausible_free_hits_for_x_suppression() -> int:
    """Read the free-source fallback threshold with the HN-era name as fallback."""
    if "ARCLI_INITIAL_PUBLIC_FREE_MIN_PLAUSIBLE_HITS_FOR_X_SUPPRESSION" in os.environ:
        return _int_env(
            "ARCLI_INITIAL_PUBLIC_FREE_MIN_PLAUSIBLE_HITS_FOR_X_SUPPRESSION",
            2,
            minimum=1,
        )
    return _int_env(
        "ARCLI_INITIAL_PUBLIC_HN_MIN_PLAUSIBLE_HITS_FOR_X_SUPPRESSION",
        2,
        minimum=1,
    )


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


def _claim_initial_x_fallback(x_fallback_group_id: str | None) -> bool:
    """Atomically reserve the single X fallback for an HN-first batch."""
    if not x_fallback_group_id:
        return False

    from api.services.cost_controls import TenantQuotaGuard

    decision = TenantQuotaGuard().check_and_increment(
        tenant_id=None,
        counter_name=f"initial_public_x_fallback_{x_fallback_group_id}",
        limit=1,
        window_seconds=_int_env(
            "ARCLI_INITIAL_PUBLIC_X_FALLBACK_WINDOW_SECONDS",
            900,
            minimum=1,
        ),
    )
    return decision.allowed


def _x_source_is_configured() -> bool:
    """Avoid retrying a paid-source job when its credential is absent."""
    enabled = os.getenv("ARCLI_X_INGESTION_ENABLED", "true").strip().lower()
    if enabled in {"0", "false", "no", "off"}:
        return False
    return bool(
        (
            os.getenv("X_BEARER_TOKEN")
            or os.getenv("TWITTER_BEARER_TOKEN")
            or os.getenv("ARCLI_X_BEARER_TOKEN")
            or ""
        ).strip()
    )


def _claim_tenant_x_fallback_budget(tenant_id: str | None) -> bool:
    """Bound paid X fallback spend across repeated profile activations.

    The activation-group claim above handles duplicate delivery.  This second,
    tenant-scoped guard prevents a customer from repeatedly reactivating a
    profile to turn one-request fallbacks into unbounded X usage.
    """
    if not tenant_id:
        # Legacy direct actor callers did not carry tenant context.  The
        # activation path always does, so preserve compatibility without
        # silently collapsing those callers into one shared "unknown" budget.
        return True

    from api.services.cost_controls import TenantQuotaGuard

    decision = TenantQuotaGuard().check_and_increment(
        tenant_id=tenant_id,
        counter_name="initial_public_x_fallback",
        limit=_int_env(
            "ARCLI_INITIAL_PUBLIC_X_FALLBACK_TENANT_LIMIT",
            5,
            minimum=1,
        ),
        window_seconds=_int_env(
            "ARCLI_INITIAL_PUBLIC_X_FALLBACK_TENANT_WINDOW_SECONDS",
            86_400,
            minimum=1,
        ),
    )
    return decision.allowed


def _normalized_discovery_queries(queries: Sequence[Any]) -> list[dict[str, str]]:
    """Accept typed queue payloads while safely replaying legacy string jobs."""
    normalized: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in queries:
        if isinstance(item, dict):
            query_type = str(item.get("query_type") or "legacy").strip() or "legacy"
            phrase = str(item.get("phrase") or "").strip()
        else:
            query_type = "legacy"
            phrase = str(item or "").strip()
        if not phrase:
            continue
        key = (query_type, phrase.casefold())
        if key in seen:
            continue
        seen.add(key)
        normalized.append({"query_type": query_type, "phrase": phrase})
    return normalized


@dramatiq.actor(
    actor_name="ingest_hn_batch_job",
    queue_name=os.getenv("ARCLI_HN_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=3,
    min_backoff=15_000,
    max_backoff=90_000,
)
def ingest_hn_batch_job(
    queries: Sequence[Any],
    since_hours_ago: int = 24,
    posts_per_query: int = 25,
    *,
    fallback_to_x: bool = False,
    continue_to_additional_sources: bool = False,
    additional_sources: Sequence[str] | None = None,
    x_fallback_group_id: str | None = None,
    x_fallback_query: str | None = None,
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
) -> None:
    """Complete the free HN phase before allowing one paid X fallback."""
    normalized_queries = _normalized_discovery_queries(queries)
    if not normalized_queries:
        raise ValueError("at least one HN query is required")

    _job_started(
        job_name="hn_ingestion_batch",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query_count=len(normalized_queries),
        since_hours_ago=since_hours_ago,
    )
    try:
        from api.services.social_ingestion import (
            _result_source_post_refs,
            ingest_hn_posts,
            trigger_embedding_jobs,
        )

        total_hits = 0
        total_plausible_hits = 0
        total_new_inserts = 0
        # The same global post can satisfy several buyer-language queries.
        # Queue it once after the free HN phase rather than fanning it out to
        # embedding/matching once per query.
        matching_source_post_refs: dict[tuple[str, str], Any] = {}
        for query in normalized_queries:
            result = ingest_hn_posts(
                query=query["phrase"],
                since_hours_ago=since_hours_ago,
                posts_per_query=posts_per_query,
                query_type=query["query_type"],
            )
            total_hits += result.hits_found
            total_plausible_hits += result.plausible_hits
            total_new_inserts += result.inserted_count
            for source_post_ref in _result_source_post_refs(
                result,
                source="hackernews",
            ):
                matching_source_post_refs.setdefault(
                    (source_post_ref.source, source_post_ref.source_post_id),
                    source_post_ref,
                )

        matching_source_posts = len(matching_source_post_refs)
        embedding_jobs = trigger_embedding_jobs(list(matching_source_post_refs.values()))

        x_fallback_enqueued = False
        additional_sources_enqueued = False
        x_fallback_skip_reason: str | None = None
        minimum_plausible_hits = _minimum_plausible_free_hits_for_x_suppression()
        if continue_to_additional_sources:
            ingest_additional_public_sources_batch_job.send(
                normalized_queries,
                since_hours_ago,
                posts_per_query,
                initial_plausible_hits=total_plausible_hits,
                fallback_to_x=fallback_to_x,
                enabled_sources=list(additional_sources or []),
                x_fallback_group_id=x_fallback_group_id,
                x_fallback_query=x_fallback_query,
                tenant_id=tenant_id,
                service_profile_id=service_profile_id,
            )
            additional_sources_enqueued = True
        elif fallback_to_x and total_plausible_hits < minimum_plausible_hits:
            if not _x_source_is_configured():
                x_fallback_skip_reason = "x_bearer_token_not_configured"
            elif not _claim_initial_x_fallback(x_fallback_group_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_already_claimed"
            elif not _claim_tenant_x_fallback_budget(tenant_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_tenant_budget_exceeded"
            else:
                ingest_x_job.send(
                    x_fallback_query or normalized_queries[0]["phrase"],
                    since_hours_ago,
                    posts_per_query,
                    strict_single_page=True,
                )
                x_fallback_enqueued = True
    except Exception as exc:
        logger.exception(
            "hn_ingestion_batch_failed job_state=%s query_count=%s since_hours_ago=%s error_type=%s error=%s",
            "failed",
            len(normalized_queries),
            since_hours_ago,
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()

    _job_finished(
        job_name="hn_ingestion_batch",
        state="completed",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query_count=len(normalized_queries),
        hits_found=total_hits,
        plausible_hn_hits=total_plausible_hits,
        minimum_plausible_hn_hits_for_x_suppression=minimum_plausible_hits,
        new_inserts=total_new_inserts,
        matching_source_posts=matching_source_posts,
        embedding_jobs=embedding_jobs,
        additional_sources_enqueued=additional_sources_enqueued,
        x_fallback_enqueued=x_fallback_enqueued,
        x_fallback_skip_reason=x_fallback_skip_reason,
    )


@dramatiq.actor(
    actor_name="ingest_additional_public_sources_batch_job",
    queue_name=os.getenv("ARCLI_ADDITIONAL_PUBLIC_SOURCE_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=2,
    min_backoff=15_000,
    max_backoff=90_000,
)
def ingest_additional_public_sources_batch_job(
    queries: Sequence[Any],
    since_hours_ago: int = 24,
    posts_per_query: int = 25,
    *,
    initial_plausible_hits: int = 0,
    fallback_to_x: bool = False,
    enabled_sources: Sequence[str] | None = None,
    x_fallback_group_id: str | None = None,
    x_fallback_query: str | None = None,
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
) -> None:
    """Search four additional free sources after HN, then allow one X fallback.

    A source outage is isolated to that source rather than retried as a whole
    activation. The global post cache and tenant-scoped verifier continue to
    protect lead quality; this actor only expands discovery coverage.
    """
    normalized_queries = _normalized_discovery_queries(queries)
    if not normalized_queries:
        raise ValueError("at least one public-source query is required")

    _job_started(
        job_name="additional_public_source_ingestion_batch",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query_count=len(normalized_queries),
        since_hours_ago=since_hours_ago,
    )
    try:
        from api.services.social_ingestion import (
            ADDITIONAL_PUBLIC_SOURCE_NAMES,
            additional_public_source_cache_scope,
            claim_additional_public_source_query,
            enabled_additional_public_sources,
            ingest_additional_public_source_posts,
            release_additional_public_source_query,
            trigger_embedding_jobs,
        )

        configured_sources = (
            tuple(enabled_sources)
            if enabled_sources is not None
            else enabled_additional_public_sources()
        )
        source_names = tuple(
            dict.fromkeys(
                source.strip().casefold()
                for source in configured_sources
                if isinstance(source, str)
                and source.strip().casefold() in ADDITIONAL_PUBLIC_SOURCE_NAMES
            )
        )
        total_hits = 0
        total_plausible_hits = max(0, initial_plausible_hits)
        total_new_inserts = 0
        source_failures = 0
        source_result_counts: dict[str, int] = {}
        matching_source_post_refs: dict[tuple[str, str], Any] = {}

        for source in source_names:
            source_hits = 0
            source_failed = False
            for query in normalized_queries:
                if not claim_additional_public_source_query(
                    source=source,
                    query=query["phrase"],
                    since_hours_ago=since_hours_ago,
                    scope=additional_public_source_cache_scope(source),
                ):
                    continue
                try:
                    result = ingest_additional_public_source_posts(
                        source=source,
                        query=query["phrase"],
                        since_hours_ago=since_hours_ago,
                        posts_per_query=posts_per_query,
                        query_type=query["query_type"],
                    )
                except Exception as exc:
                    # Retrying a single provider client error for all six
                    # phrases gives no new evidence and burns rate budget.
                    # The next scheduled window can try it again while the
                    # other three sources and X fallback still proceed.
                    source_failed = True
                    source_failures += 1
                    release_additional_public_source_query(
                        source=source,
                        query=query["phrase"],
                        since_hours_ago=since_hours_ago,
                        scope=additional_public_source_cache_scope(source),
                    )
                    logger.warning(
                        "additional_public_source_ingestion_skipped source=%s error_type=%s",
                        source,
                        exc.__class__.__name__,
                    )
                    break

                source_hits += result.hits_found
                total_hits += result.hits_found
                total_plausible_hits += result.plausible_hits
                total_new_inserts += result.inserted_count
                for source_post_ref in result.matchable_source_post_refs:
                    matching_source_post_refs.setdefault(
                        (source_post_ref.source, source_post_ref.source_post_id),
                        source_post_ref,
                    )
            source_result_counts[source] = source_hits
            if source_failed:
                source_result_counts.setdefault(source, 0)

        matching_source_posts = len(matching_source_post_refs)
        embedding_jobs = trigger_embedding_jobs(list(matching_source_post_refs.values()))
        x_fallback_enqueued = False
        x_fallback_skip_reason: str | None = None
        minimum_plausible_hits = _minimum_plausible_free_hits_for_x_suppression()
        if fallback_to_x and total_plausible_hits < minimum_plausible_hits:
            if not _x_source_is_configured():
                x_fallback_skip_reason = "x_bearer_token_not_configured"
            elif not _claim_initial_x_fallback(x_fallback_group_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_already_claimed"
            elif not _claim_tenant_x_fallback_budget(tenant_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_tenant_budget_exceeded"
            else:
                ingest_x_job.send(
                    x_fallback_query or normalized_queries[0]["phrase"],
                    since_hours_ago,
                    posts_per_query,
                    strict_single_page=True,
                )
                x_fallback_enqueued = True
    except Exception as exc:
        logger.exception(
            "additional_public_source_ingestion_batch_failed job_state=%s query_count=%s since_hours_ago=%s error_type=%s",
            "failed",
            len(normalized_queries),
            since_hours_ago,
            exc.__class__.__name__,
        )
        raise
    finally:
        _close_actor_openai_clients()

    _job_finished(
        job_name="additional_public_source_ingestion_batch",
        state="completed",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query_count=len(normalized_queries),
        sources=source_names,
        source_hits=source_result_counts,
        source_failures=source_failures,
        hits_found=total_hits,
        plausible_free_hits=total_plausible_hits,
        minimum_plausible_free_hits_for_x_suppression=minimum_plausible_hits,
        new_inserts=total_new_inserts,
        matching_source_posts=matching_source_posts,
        embedding_jobs=embedding_jobs,
        x_fallback_enqueued=x_fallback_enqueued,
        x_fallback_skip_reason=x_fallback_skip_reason,
    )


@dramatiq.actor(
    actor_name="ingest_hn_job",
    queue_name=os.getenv("ARCLI_HN_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=3,
    min_backoff=15_000,
    max_backoff=90_000,
)
def ingest_hn_job(
    query: str,
    since_hours_ago: int = 24,
    posts_per_query: int = 25,
    *,
    fallback_to_x: bool = False,
    x_fallback_group_id: str | None = None,
    x_fallback_query: str | None = None,
    query_type: str | None = None,
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
) -> None:
    """Ingest HN first and queue at most one X fallback per activation."""
    _job_started(
        job_name="hn_ingestion",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query=query,
        since_hours_ago=since_hours_ago,
    )
    try:
        from api.services.social_ingestion import (
            _result_source_post_refs,
            ingest_hn_posts,
            trigger_embedding_jobs,
        )

        result = ingest_hn_posts(
            query=query,
            since_hours_ago=since_hours_ago,
            posts_per_query=posts_per_query,
            query_type=query_type,
        )
        matching_source_post_refs = _result_source_post_refs(
            result,
            source="hackernews",
        )
        embedding_jobs = trigger_embedding_jobs(matching_source_post_refs)
        x_fallback_enqueued = False
        x_fallback_skip_reason: str | None = None
        minimum_plausible_hits = _minimum_plausible_free_hits_for_x_suppression()
        if fallback_to_x and result.plausible_hits < minimum_plausible_hits:
            if not _x_source_is_configured():
                x_fallback_skip_reason = "x_bearer_token_not_configured"
            elif not _claim_initial_x_fallback(x_fallback_group_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_already_claimed"
            elif not _claim_tenant_x_fallback_budget(tenant_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_tenant_budget_exceeded"
            else:
                ingest_x_job.send(
                    x_fallback_query or query,
                    since_hours_ago,
                    posts_per_query,
                    strict_single_page=True,
                )
                x_fallback_enqueued = True
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
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query=query,
        hits_found=result.hits_found,
        plausible_hn_hits=result.plausible_hits,
        minimum_plausible_hn_hits_for_x_suppression=minimum_plausible_hits,
        new_inserts=result.inserted_count,
        matching_source_posts=len(
            matching_source_post_refs
        ),
        embedding_jobs=embedding_jobs,
        x_fallback_enqueued=x_fallback_enqueued,
        x_fallback_skip_reason=x_fallback_skip_reason,
    )


@dramatiq.actor(
    actor_name="ingest_x_job",
    queue_name=os.getenv("ARCLI_X_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=3,
    min_backoff=15_000,
    max_backoff=90_000,
)
def ingest_x_job(
    query: str,
    since_hours_ago: int = 24,
    posts_per_query: int = 25,
    *,
    strict_single_page: bool = False,
) -> None:
    """Ingest one X recent-search window and hand fresh rows to embedding.

    ``strict_single_page`` is used by the HN fallback so its one cost-controlled
    job cannot paginate into multiple paid X search requests.
    """
    _job_started(
        job_name="x_ingestion",
        query=query,
        since_hours_ago=since_hours_ago,
        strict_single_page=strict_single_page,
    )
    try:
        from api.services.social_ingestion import (
            _result_source_post_refs,
            ingest_x_posts,
            trigger_embedding_jobs,
        )

        if not _x_source_is_configured():
            logger.info(
                "x_ingestion_skipped job_state=%s query=%s skip_reason=%s",
                "skipped",
                query,
                "x_bearer_token_not_configured",
            )
            _job_finished(
                job_name="x_ingestion",
                state="skipped",
                query=query,
                rejection_reason="x_bearer_token_not_configured",
            )
            return

        result = ingest_x_posts(
            query=query,
            since_hours_ago=since_hours_ago,
            posts_per_query=posts_per_query,
            max_pages=1 if strict_single_page else None,
        )
        matching_source_post_refs = _result_source_post_refs(
            result,
            source="twitter",
        )
        embedding_jobs = trigger_embedding_jobs(matching_source_post_refs)
    except Exception as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if isinstance(status_code, int) and 400 <= status_code < 500 and status_code not in {
            408,
            409,
            425,
            429,
        }:
            logger.warning(
                "x_ingestion_skipped job_state=%s query=%s since_hours_ago=%s status_code=%s error_type=%s error=%s",
                "skipped",
                query,
                since_hours_ago,
                status_code,
                exc.__class__.__name__,
                exc,
            )
            _job_finished(
                job_name="x_ingestion",
                state="skipped",
                query=query,
                rejection_reason="provider_client_error",
                status_code=status_code,
            )
            return
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
        strict_single_page=strict_single_page,
        matching_source_posts=len(
            matching_source_post_refs
        ),
        embedding_jobs=embedding_jobs,
    )


@dramatiq.actor(
    actor_name="enqueue_source_post_embedding_job",
    queue_name=os.getenv("ARCLI_SOURCE_POST_EMBEDDING_QUEUE_NAME", "embeddings"),
    max_retries=3,
    min_backoff=10_000,
    max_backoff=60_000,
)
def enqueue_source_post_embedding_job(
    source_post_id: str,
    *,
    source: str | None = None,
) -> None:
    """Embed one global source post and create tenant-scoped lead matches."""
    _job_started(
        job_name="source_post_embedding_handoff",
        source=source,
        source_post_id=source_post_id,
    )
    try:
        from api.services.social_ingestion import process_public_source_post_embedding

        result = process_public_source_post_embedding(source_post_id, source=source)
    except Exception as exc:
        logger.exception(
            "source_post_embedding_failed job_state=%s source=%s source_post_id=%s error_type=%s error=%s",
            "failed",
            source,
            source_post_id,
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()

    _job_finished(
        job_name="source_post_embedding_handoff",
        state="completed",
        source=source,
        source_post_id=source_post_id,
        posts=result["posts"],
        embedded=result["embedded"],
        candidates=result["candidates"],
        ready_for_review=result["ready_for_review"],
    )


def enqueue_source_post_embedding_jobs(source_post_refs: Sequence[Any]) -> int:
    """Publish one source-qualified, idempotent embedding handoff per public row.

    A plain string remains accepted solely to drain messages created by older
    workers. New callers pass ``PublicSourcePostRef`` objects, which avoid
    conflating equal external IDs from different providers.
    """
    _require_redis_broker()
    messages_sent = 0
    seen: set[tuple[str | None, str]] = set()
    for source_post_ref in source_post_refs:
        if isinstance(source_post_ref, str):
            source = None
            source_post_id = source_post_ref.strip()
        elif isinstance(source_post_ref, dict):
            source = str(source_post_ref.get("source") or "").strip() or None
            source_post_id = str(source_post_ref.get("source_post_id") or "").strip()
        else:
            source = str(getattr(source_post_ref, "source", "") or "").strip() or None
            source_post_id = str(
                getattr(source_post_ref, "source_post_id", "") or ""
            ).strip()
        if not source_post_id:
            continue
        key = (source, source_post_id)
        if key in seen:
            continue
        seen.add(key)
        if source:
            enqueue_source_post_embedding_job.send(source_post_id, source=source)
        else:
            enqueue_source_post_embedding_job.send(source_post_id)
        messages_sent += 1
    logger.info(
        "source_post_embedding_handoffs_enqueued job_state=%s source_post_count=%s",
        "pending",
        messages_sent,
    )
    return messages_sent


@dramatiq.actor(
    actor_name="rematch_existing_public_source_posts_job",
    queue_name=os.getenv("ARCLI_SOURCE_POST_EMBEDDING_QUEUE_NAME", "embeddings"),
    max_retries=2,
    min_backoff=15_000,
    max_backoff=90_000,
    time_limit=_int_env("ARCLI_PUBLIC_SOURCE_REMATCH_JOB_TIME_LIMIT_MS", 180_000, minimum=1),
)
def rematch_existing_public_source_posts_job(
    tenant_id: str,
    service_profile_id: str,
) -> None:
    """Match a newly activated profile against a bounded cached public corpus."""
    _job_started(
        job_name="existing_public_source_rematch",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
    )
    try:
        from api.services.social_ingestion import (
            rematch_existing_public_source_posts_for_profile,
        )

        result = rematch_existing_public_source_posts_for_profile(
            tenant_id,
            service_profile_id,
        )
    except Exception as exc:
        logger.exception(
            "existing_public_source_rematch_failed job_state=%s tenant_id=%s service_profile_id=%s error_type=%s error=%s",
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
        job_name="existing_public_source_rematch",
        state="completed",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        posts=result["posts"],
        embedded=result["embedded"],
        cache_misses=result["cache_misses"],
        candidates=result["candidates"],
        ready_for_review=result["ready_for_review"],
        discovery_candidates=result["discovery_candidates"],
    )


@dramatiq.actor(
    actor_name="process_crawl_job",
    queue_name=os.getenv("ARCLI_CRAWL_QUEUE_NAME", "crawling"),
    max_retries=_int_env("ARCLI_CRAWL_JOB_MAX_RETRIES", 2),
    min_backoff=_int_env("ARCLI_CRAWL_JOB_MIN_BACKOFF_MS", 15_000, minimum=1),
    max_backoff=_int_env("ARCLI_CRAWL_JOB_MAX_BACKOFF_MS", 60_000, minimum=1),
    time_limit=_int_env("ARCLI_CRAWL_JOB_TIME_LIMIT_MS", 210_000, minimum=1),
    on_retry_exhausted="mark_crawl_job_dead_lettered",
    throws=(NonRetryableCrawlError,),
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
        if _is_non_retryable_crawl_error(exc):
            logger.error(
                "crawl_actor_not_retrying tenant_id=%s website_url=%s job_id=%s status_code=%s error_type=%s error=%s",
                tenant_id,
                website_url,
                job_id,
                getattr(exc, "status_code", None),
                exc.__class__.__name__,
                exc,
            )
            message = (
                "Profile extraction result permanently failed validation."
                if exc.__class__.__name__ == "ProfileExtractionSemanticError"
                else "Crawl provider rejected a deterministic request."
            )
            raise NonRetryableCrawlError(message) from exc
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
