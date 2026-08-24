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


def _enqueue_public_data_retention() -> None:
    """Schedule one lightweight corpus-retention pass without delaying a scan."""

    try:
        from api.services.cost_controls import TenantQuotaGuard

        decision = TenantQuotaGuard().check_and_increment(
            tenant_id="public-data-governance",
            counter_name="retention-enqueue",
            limit=1,
            window_seconds=3_600,
        )
        if not decision.allowed:
            return
        purge_expired_public_data_job.send()
    except Exception as exc:
        # Maintenance must never prevent a customer discovery scan. The worker
        # logs the failure without personal data and retries on the next hour.
        logger.warning(
            "public_data_retention_enqueue_skipped error_type=%s",
            exc.__class__.__name__,
        )


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


def _minimum_plausible_query_types_for_x_suppression() -> int:
    """Require varied buyer evidence before skipping the paid X fallback.

    A loose source search can return many posts for one broad phrase (for
    example, "how do I get more customers?"). Raw hit volume alone therefore
    must not imply that the full matching brief has meaningful coverage.
    Deployments that intentionally want the older, cheaper behavior can set
    this to one.
    """

    return _int_env(
        "ARCLI_INITIAL_PUBLIC_FREE_MIN_QUERY_TYPES_FOR_X_SUPPRESSION",
        3,
        minimum=1,
    )


def _has_sufficient_free_evidence_for_x_suppression(
    *,
    plausible_hits: int,
    plausible_query_types: set[str],
    matching_source_posts: int = 0,
) -> bool:
    """Decide whether free-source coverage is strong enough to skip X.

    Legacy actor messages carry untyped strings. Preserve their historic
    hit-based behavior for replay compatibility; newly activated profiles
    always carry the six typed buyer-language queries and therefore require
    coverage across distinct intent types as well as enough plausible posts.
    """

    if plausible_hits < _minimum_plausible_free_hits_for_x_suppression():
        return False

    # Cheap plausibility is only a retrieval heuristic. Broad terms can
    # produce a few superficially plausible rows which are not usable for
    # embedding/matching, as happened with Etsy queries on Hacker News. Do
    # not suppress the single X fallback unless the free phase yielded at
    # least one post that can actually enter the matching pipeline.
    if matching_source_posts < 1:
        return False

    normalized_types = {
        query_type.strip()
        for query_type in plausible_query_types
        if isinstance(query_type, str) and query_type.strip()
    }
    typed_query_types = {
        query_type for query_type in normalized_types if query_type != "legacy"
    }
    if not typed_query_types:
        return True

    return len(typed_query_types) >= _minimum_plausible_query_types_for_x_suppression()


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
    log = (
        logger.debug
        if job_name == "source_post_embedding_handoff"
        else logger.info
    )
    log(
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
    log = (
        logger.debug
        if job_name == "source_post_embedding_handoff"
        else logger.info
    )
    log(
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


def _record_discovery_event(
    *,
    discovery_run_id: str | None,
    tenant_id: str | None,
    source: str,
    query_type: str | None,
    query: str | None,
    phase: str,
    outcome: str,
    details: dict[str, Any] | None = None,
) -> None:
    """Record tenant-owned run telemetry without affecting source ingestion.

    Telemetry is customer-facing diagnostic value, but it must never become a
    new failure mode for HN/X matching. The helper is also safe while rolling
    out the additive SQL contract: a worker can run before the new tables are
    applied and still complete discovery.
    """

    if not discovery_run_id or not tenant_id:
        return
    try:
        from api.services.social.discovery_telemetry import record_discovery_event

        record_discovery_event(
            discovery_run_id,
            tenant_id,
            source=source,
            # Aggregate phase events are not buyer-language searches. Give
            # them a deterministic, non-content key so the telemetry contract
            # can persist their outcome without storing a fabricated phrase.
            query_type=query_type or "run",
            query=query or f"{source}:{phase}",
            phase=phase,
            outcome=outcome,
            details=details or {},
        )
    except Exception as exc:
        logger.info(
            "discovery_telemetry_event_skipped tenant_id=%s source=%s phase=%s outcome=%s error_type=%s",
            tenant_id,
            source,
            phase,
            outcome,
            exc.__class__.__name__,
        )


def _complete_discovery_run(
    *,
    discovery_run_id: str | None,
    tenant_id: str | None,
    status: str,
    summary: dict[str, Any],
) -> None:
    """Best-effort terminal run update; see `_record_discovery_event`."""

    if not discovery_run_id or not tenant_id:
        return
    try:
        from api.services.social.discovery_telemetry import complete_discovery_run

        complete_discovery_run(
            discovery_run_id,
            tenant_id,
            status=status,
            summary=summary,
        )
    except Exception as exc:
        logger.info(
            "discovery_telemetry_completion_skipped tenant_id=%s status=%s error_type=%s",
            tenant_id,
            status,
            exc.__class__.__name__,
        )


@dramatiq.actor(
    actor_name="ingest_initial_public_sources_fast_job",
    queue_name=os.getenv("ARCLI_PUBLIC_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=2,
    min_backoff=15_000,
    max_backoff=90_000,
    time_limit=_int_env(
        "ARCLI_INITIAL_PUBLIC_FAST_CHECK_TIME_LIMIT_MS",
        300_000,
        minimum=1,
    ),
)
def ingest_initial_public_sources_fast_job(
    queries: Sequence[Any],
    since_hours_ago: int = 24,
    posts_per_query: int = 25,
    *,
    enabled_sources: Sequence[str] | None = None,
    fallback_to_x: bool = False,
    x_fallback_group_id: str | None = None,
    x_fallback_query: str | None = None,
    x_fallback_disabled_reason: str | None = None,
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
    discovery_run_id: str | None = None,
    run_completion_managed: bool = False,
) -> None:
    """Fan out public sources and close the discovery run only after all finish.

    A completed provider immediately hands its matchable posts to the embedding
    queue.  The parent job remains running, however, until every selected
    public source (and an eligible fallback) has reported a terminal outcome.
    """

    normalized_queries = _normalized_discovery_queries(queries)
    if not normalized_queries:
        raise ValueError("at least one public-source query is required")

    source_names = tuple(
        dict.fromkeys(
            source.strip().casefold()
            for source in (enabled_sources or [])
            if isinstance(source, str) and source.strip()
        )
    )
    if not source_names:
        raise ValueError("at least one public source is required")

    _enqueue_public_data_retention()

    _job_started(
        job_name="initial_public_sources_fast",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query_count=len(normalized_queries),
        sources=source_names,
        since_hours_ago=since_hours_ago,
    )
    _record_discovery_event(
        discovery_run_id=discovery_run_id,
        tenant_id=tenant_id,
        source="public_sources",
        query_type=None,
        query=None,
        phase="fast_check",
        outcome="started",
        details={"sources": list(source_names), "query_count": len(normalized_queries)},
    )

    source_counts: dict[str, int] = {}
    source_failure_details: dict[str, dict[str, int | str | None]] = {}
    total_hits = 0
    total_plausible_hits = 0
    total_new_inserts = 0
    total_matching_source_posts = 0
    plausible_query_types: set[str] = set()
    embedding_jobs = 0

    def on_source_completed(result: Any) -> None:
        nonlocal total_hits
        nonlocal total_plausible_hits
        nonlocal total_new_inserts
        nonlocal total_matching_source_posts
        nonlocal embedding_jobs

        source = str(result.source)
        source_counts[source] = result.hits_found
        total_hits += result.hits_found
        total_plausible_hits += result.plausible_hits
        total_new_inserts += result.inserted_count
        total_matching_source_posts += len(result.source_post_refs)
        plausible_query_types.update(result.plausible_query_types)

        # This is intentionally inside the per-source callback: a fast
        # provider can make leads available while a slower provider continues
        # searching. The parent run remains non-terminal until below.
        if result.source_post_refs:
            from api.services.social_ingestion import trigger_embedding_jobs

            embedding_jobs += trigger_embedding_jobs(
                list(result.source_post_refs),
                tenant_id=tenant_id,
                service_profile_id=service_profile_id,
            )

        for query_result in result.query_outcomes:
            details: dict[str, Any] = {}
            if query_result.outcome == "completed":
                details = {
                    "hits_found": query_result.hits_found,
                    "plausible_hits": query_result.plausible_hits,
                    "new_inserts": query_result.inserted_count,
                }
            elif query_result.outcome == "failed":
                details = {
                    "error_type": query_result.error_type,
                    "status_code": query_result.status_code,
                }
                source_failure_details[source] = {
                    "error_type": query_result.error_type,
                    "status_code": query_result.status_code,
                }
            elif query_result.outcome == "skipped":
                details = {"reason": "unsupported_query_for_source"}

            _record_discovery_event(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                source=source,
                query_type=query_result.query_type,
                query=query_result.query,
                phase="search",
                outcome=query_result.outcome,
                details=details,
            )

        _record_discovery_event(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            source=source,
            query_type=None,
            query=None,
            phase="source",
            outcome="partial" if result.failed else "completed",
            details={
                "hits_found": result.hits_found,
                "plausible_hits": result.plausible_hits,
                "new_inserts": result.inserted_count,
                "matching_source_posts": len(result.source_post_refs),
            },
        )

    try:
        from api.services.social.fast_check import run_fast_public_source_check

        run_fast_public_source_check(
            normalized_queries,
            sources=source_names,
            since_hours_ago=since_hours_ago,
            posts_per_query=posts_per_query,
            max_concurrency=min(
                6,
                _int_env("ARCLI_FAST_CHECK_SOURCE_CONCURRENCY", 4, minimum=1),
            ),
            on_source_completed=on_source_completed,
        )

        x_fallback_outcome = "skipped" if x_fallback_disabled_reason else "not_needed"
        x_fallback_reason = (
            x_fallback_disabled_reason or "sufficient_diverse_free_evidence"
        )
        if fallback_to_x and not _has_sufficient_free_evidence_for_x_suppression(
            plausible_hits=total_plausible_hits,
            plausible_query_types=plausible_query_types,
            matching_source_posts=total_matching_source_posts,
        ):
            x_fallback_outcome = "skipped"
            x_fallback_reason = x_fallback_disabled_reason or "x_not_configured"
            if x_fallback_disabled_reason:
                pass
            elif not _x_source_is_configured():
                x_fallback_reason = "x_bearer_token_not_configured"
            elif not _claim_initial_x_fallback(x_fallback_group_id):
                x_fallback_reason = "initial_ingestion_x_fallback_already_claimed"
            elif not _claim_tenant_x_fallback_budget(tenant_id):
                x_fallback_reason = "initial_ingestion_x_fallback_tenant_budget_exceeded"
            else:
                from api.services.social_ingestion import (
                    _result_source_post_refs,
                    ingest_x_posts,
                    trigger_embedding_jobs,
                )

                x_fallback_outcome = "completed"
                x_fallback_reason = "insufficient_diverse_free_evidence"
                try:
                    x_result = ingest_x_posts(
                        x_fallback_query or normalized_queries[0]["phrase"],
                        since_hours_ago,
                        posts_per_query,
                        max_pages=1,
                    )
                    x_refs = _result_source_post_refs(x_result, source="x")
                    source_counts["x"] = x_result.hits_found
                    total_hits += x_result.hits_found
                    total_new_inserts += x_result.inserted_count
                    total_matching_source_posts += len(x_refs)
                    if x_refs:
                        embedding_jobs += trigger_embedding_jobs(
                            x_refs,
                            tenant_id=tenant_id,
                            service_profile_id=service_profile_id,
                        )
                    _record_discovery_event(
                        discovery_run_id=discovery_run_id,
                        tenant_id=tenant_id,
                        source="x",
                        query_type="fallback",
                        query=x_fallback_query or normalized_queries[0]["phrase"],
                        phase="search",
                        outcome="completed",
                        details={
                            "hits_found": x_result.hits_found,
                            "new_inserts": x_result.inserted_count,
                            "matching_source_posts": len(x_refs),
                        },
                    )
                except Exception as exc:
                    response = getattr(exc, "response", None)
                    status_code = getattr(response, "status_code", None)
                    source_counts.setdefault("x", 0)
                    source_failure_details["x"] = {
                        "error_type": exc.__class__.__name__,
                        "status_code": status_code if isinstance(status_code, int) else None,
                    }
                    x_fallback_outcome = "failed"
                    x_fallback_reason = "provider_error"
                    _record_discovery_event(
                        discovery_run_id=discovery_run_id,
                        tenant_id=tenant_id,
                        source="x",
                        query_type="fallback",
                        query=x_fallback_query or normalized_queries[0]["phrase"],
                        phase="search",
                        outcome="failed",
                        details=source_failure_details["x"],
                    )

        source_failures = len(source_failure_details)
        _record_discovery_event(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            source="x",
            query_type=None,
            query=None,
            phase="fallback",
            outcome=x_fallback_outcome,
            details={"reason": x_fallback_reason},
        )
        # This is deliberately the only terminal update in the fast path. At
        # this point every selected provider has reported, and any permitted
        # fallback has also finished or been recorded as unavailable.
        fast_check_summary = {
            "sources": source_counts,
            "source_failures": source_failures,
            "source_failure_details": source_failure_details,
            "hits_found": total_hits,
            "plausible_hits": total_plausible_hits,
            "plausible_query_types": sorted(plausible_query_types),
            "new_inserts": total_new_inserts,
            "matching_source_posts": total_matching_source_posts,
            "embedding_jobs": embedding_jobs,
            "source_completion": {
                "expected": [
                    *source_names,
                    *(
                        ["x"]
                        if x_fallback_outcome in {"completed", "failed"}
                        else []
                    ),
                ],
                "completed": list(source_counts),
                "all_sources_finished": True,
            },
            "x_fallback": {
                "outcome": x_fallback_outcome,
                "reason": x_fallback_reason,
            },
            "verification_pending": True,
        }
        if run_completion_managed:
            _record_discovery_event(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                source="public_sources",
                query_type=None,
                query=None,
                phase="fast_check",
                outcome="completed",
                details={
                    "hits_found": total_hits,
                    "new_inserts": total_new_inserts,
                    "matching_source_posts": total_matching_source_posts,
                },
            )
        else:
            _complete_discovery_run(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                status="partial" if source_failures else "completed",
                summary=fast_check_summary,
            )
        # Cached-post rematching is useful, but it is not on the critical
        # path for a new scan.  Give fresh public-source posts a clear runway
        # through matching before the bounded historical corpus uses threads.
        if tenant_id and service_profile_id and not run_completion_managed:
            try:
                from api.services.social_ingestion import (
                    enqueue_existing_public_source_rematch,
                )

                rematch_delay_ms = _int_env(
                    "ARCLI_INITIAL_PUBLIC_REMATCH_DELAY_MS",
                    300_000,
                    minimum=0,
                )
                rematch_message_id = enqueue_existing_public_source_rematch(
                    tenant_id,
                    service_profile_id,
                    delay_ms=rematch_delay_ms,
                )
                logger.info(
                    "existing_public_source_rematch_deferred_after_fast_check tenant_id=%s service_profile_id=%s message_id=%s delay_ms=%s",
                    tenant_id,
                    service_profile_id,
                    rematch_message_id,
                    rematch_delay_ms,
                )
            except Exception as rematch_exc:
                logger.exception(
                    "existing_public_source_rematch_enqueue_after_fast_check_failed tenant_id=%s service_profile_id=%s error_type=%s error=%s",
                    tenant_id,
                    service_profile_id,
                    rematch_exc.__class__.__name__,
                    rematch_exc,
                )
    except Exception as exc:
        _record_discovery_event(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            source="public_sources",
            query_type=None,
            query=None,
            phase="fast_check",
            outcome="failed",
            details={"error_type": exc.__class__.__name__},
        )
        if not run_completion_managed:
            _complete_discovery_run(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                status="failed",
                summary={
                    "last_failure": {
                        "source": "public_sources",
                        "error_type": exc.__class__.__name__,
                    },
                    "source_completion": {
                        "expected": list(source_names),
                        "completed": list(source_counts),
                        "all_sources_finished": False,
                    },
                    "verification_pending": True,
                },
            )
        logger.exception(
            "initial_public_sources_fast_failed tenant_id=%s service_profile_id=%s query_count=%s error_type=%s",
            tenant_id,
            service_profile_id,
            len(normalized_queries),
            exc.__class__.__name__,
        )
        raise
    finally:
        _close_actor_openai_clients()

    _job_finished(
        job_name="initial_public_sources_fast",
        state="completed",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query_count=len(normalized_queries),
        sources=source_names,
        source_hits=source_counts,
        source_failures=len(source_failure_details),
        hits_found=total_hits,
        matching_source_posts=total_matching_source_posts,
        embedding_jobs=embedding_jobs,
        discovery_run_completed=not run_completion_managed,
    )


@dramatiq.actor(
    actor_name="monitor_initial_public_discovery_run",
    queue_name=os.getenv("ARCLI_PUBLIC_INGESTION_QUEUE_NAME", "ingestion"),
    max_retries=2,
    min_backoff=15_000,
    max_backoff=90_000,
    time_limit=30_000,
)
def monitor_initial_public_discovery_run(
    tenant_id: str,
    service_profile_id: str,
    discovery_run_id: str,
    started_at: str,
    *,
    rematch_attempted: bool = False,
) -> None:
    """Keep an activation run open for 2-5 minutes and target three finds.

    The source and embedding actors are intentionally asynchronous.  This
    small delayed coordinator never blocks a worker thread while they run; it
    polls only the tenant's newly-created review queue and starts one bounded
    cached-corpus rematch at the two-minute mark when more evidence is needed.
    """

    from api.services.social.run_control import (
        elapsed_run_seconds,
        initial_discovery_run_limits,
        next_monitor_delay_seconds,
        ready_for_review_count_since,
    )

    limits = initial_discovery_run_limits()
    elapsed_seconds = elapsed_run_seconds(started_at)
    _job_started(
        job_name="initial_public_discovery_monitor",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        discovery_run_id=discovery_run_id,
        elapsed_seconds=int(elapsed_seconds),
        rematch_attempted=rematch_attempted,
    )

    ready_for_review: int | None
    count_error: Exception | None = None
    try:
        ready_for_review = ready_for_review_count_since(
            tenant_id,
            service_profile_id,
            started_at,
        )
    except Exception as exc:
        ready_for_review = None
        count_error = exc
        logger.warning(
            "initial_public_discovery_monitor_count_failed tenant_id=%s service_profile_id=%s discovery_run_id=%s error_type=%s",
            tenant_id,
            service_profile_id,
            discovery_run_id,
            exc.__class__.__name__,
        )

    def schedule_next(*, next_rematch_attempted: bool) -> None:
        delay_seconds = next_monitor_delay_seconds(
            elapsed_seconds=elapsed_seconds,
            limits=limits,
        )
        if delay_seconds is None:
            return
        message = monitor_initial_public_discovery_run.send_with_options(
            args=(tenant_id, service_profile_id, discovery_run_id, started_at),
            kwargs={"rematch_attempted": next_rematch_attempted},
            delay=delay_seconds * 1_000,
        )
        logger.info(
            "initial_public_discovery_monitor_enqueued tenant_id=%s service_profile_id=%s discovery_run_id=%s delay_seconds=%s message_id=%s",
            tenant_id,
            service_profile_id,
            discovery_run_id,
            delay_seconds,
            message.message_id,
        )

    if elapsed_seconds < limits.minimum_seconds:
        schedule_next(next_rematch_attempted=rematch_attempted)
        return

    if ready_for_review is not None and ready_for_review >= limits.target_ready_for_review:
        _complete_discovery_run(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            status="completed",
            summary={
                "run_control": {
                    "stop_reason": "target_ready_for_review_reached",
                    "ready_for_review": ready_for_review,
                    "target_ready_for_review": limits.target_ready_for_review,
                    "elapsed_seconds": int(elapsed_seconds),
                    "minimum_seconds": limits.minimum_seconds,
                    "maximum_seconds": limits.maximum_seconds,
                },
                "verification_pending": False,
            },
        )
        _job_finished(
            job_name="initial_public_discovery_monitor",
            state="completed",
            tenant_id=tenant_id,
            service_profile_id=service_profile_id,
            discovery_run_id=discovery_run_id,
            ready_for_review=ready_for_review,
            stop_reason="target_ready_for_review_reached",
        )
        return

    if elapsed_seconds >= limits.maximum_seconds:
        _complete_discovery_run(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            status="partial",
            summary={
                "run_control": {
                    "stop_reason": "maximum_duration_reached",
                    "ready_for_review": ready_for_review,
                    "target_ready_for_review": limits.target_ready_for_review,
                    "elapsed_seconds": int(elapsed_seconds),
                    "minimum_seconds": limits.minimum_seconds,
                    "maximum_seconds": limits.maximum_seconds,
                    "count_error": count_error.__class__.__name__ if count_error else None,
                },
                "verification_pending": False,
            },
        )
        _job_finished(
            job_name="initial_public_discovery_monitor",
            state="partial",
            tenant_id=tenant_id,
            service_profile_id=service_profile_id,
            discovery_run_id=discovery_run_id,
            ready_for_review=ready_for_review,
            stop_reason="maximum_duration_reached",
        )
        return

    if not rematch_attempted:
        try:
            from api.services.social_ingestion import enqueue_existing_public_source_rematch

            rematch_message_id = enqueue_existing_public_source_rematch(
                tenant_id,
                service_profile_id,
            )
            _record_discovery_event(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                source="public_corpus",
                query_type=None,
                query=None,
                phase="rematch",
                outcome="scheduled",
                details={"message_id": rematch_message_id or "not_enqueued"},
            )
        except Exception as exc:
            logger.warning(
                "initial_public_discovery_rematch_enqueue_failed tenant_id=%s service_profile_id=%s discovery_run_id=%s error_type=%s",
                tenant_id,
                service_profile_id,
                discovery_run_id,
                exc.__class__.__name__,
            )
        schedule_next(next_rematch_attempted=True)
        return

    schedule_next(next_rematch_attempted=True)


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
    x_fallback_disabled_reason: str | None = None,
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
    discovery_run_id: str | None = None,
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
    _record_discovery_event(
        discovery_run_id=discovery_run_id,
        tenant_id=tenant_id,
        source="hackernews",
        query_type=None,
        query=None,
        phase="batch",
        outcome="started",
        details={"query_count": len(normalized_queries), "lookback_hours": since_hours_ago},
    )
    try:
        from api.services.social_ingestion import (
            _result_source_post_refs,
            ingest_hn_posts,
            trigger_embedding_jobs,
        )

        total_hits = 0
        total_plausible_hits = 0
        plausible_query_types: set[str] = set()
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
            if result.plausible_hits > 0:
                plausible_query_types.add(query["query_type"])
            total_new_inserts += result.inserted_count
            _record_discovery_event(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                source="hackernews",
                query_type=query["query_type"],
                query=query["phrase"],
                phase="search",
                outcome="completed",
                details={
                    "hits_found": result.hits_found,
                    "plausible_hits": result.plausible_hits,
                    "new_inserts": result.inserted_count,
                },
            )
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
        x_fallback_skip_reason: str | None = x_fallback_disabled_reason
        minimum_plausible_hits = _minimum_plausible_free_hits_for_x_suppression()
        if continue_to_additional_sources:
            ingest_additional_public_sources_batch_job.send(
                normalized_queries,
                since_hours_ago,
                posts_per_query,
                initial_hits=total_hits,
                initial_new_inserts=total_new_inserts,
                initial_source_result_counts={"hackernews": total_hits},
                initial_plausible_hits=total_plausible_hits,
                initial_plausible_query_types=sorted(plausible_query_types),
                initial_matching_source_posts=matching_source_posts,
                fallback_to_x=fallback_to_x,
                enabled_sources=list(additional_sources or []),
                x_fallback_group_id=x_fallback_group_id,
                x_fallback_query=x_fallback_query,
                x_fallback_disabled_reason=x_fallback_disabled_reason,
                tenant_id=tenant_id,
                service_profile_id=service_profile_id,
                discovery_run_id=discovery_run_id,
            )
            additional_sources_enqueued = True
        elif fallback_to_x and not _has_sufficient_free_evidence_for_x_suppression(
            plausible_hits=total_plausible_hits,
            plausible_query_types=plausible_query_types,
            matching_source_posts=matching_source_posts,
        ):
            if x_fallback_disabled_reason:
                x_fallback_skip_reason = x_fallback_disabled_reason
            elif not _x_source_is_configured():
                x_fallback_skip_reason = "x_bearer_token_not_configured"
            elif not _claim_initial_x_fallback(x_fallback_group_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_already_claimed"
            elif not _claim_tenant_x_fallback_budget(tenant_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_tenant_budget_exceeded"
            else:
                x_kwargs: dict[str, Any] = {"strict_single_page": True}
                if tenant_id is not None:
                    x_kwargs["tenant_id"] = tenant_id
                if service_profile_id is not None:
                    x_kwargs["service_profile_id"] = service_profile_id
                if discovery_run_id:
                    x_kwargs["discovery_run_id"] = discovery_run_id
                ingest_x_job.send(
                    x_fallback_query or normalized_queries[0]["phrase"],
                    since_hours_ago,
                    posts_per_query,
                    **x_kwargs,
                )
                x_fallback_enqueued = True
                _record_discovery_event(
                    discovery_run_id=discovery_run_id,
                    tenant_id=tenant_id,
                    source="x",
                    query_type="fallback",
                    query=x_fallback_query or normalized_queries[0]["phrase"],
                    phase="fallback",
                    outcome="queued",
                    details={"reason": "insufficient_diverse_free_evidence"},
                )
        if not additional_sources_enqueued and not x_fallback_enqueued:
            _record_discovery_event(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                source="x",
                query_type=None,
                query=None,
                phase="fallback",
                outcome="not_needed" if not x_fallback_skip_reason else "skipped",
                details={"reason": x_fallback_skip_reason or "sufficient_diverse_free_evidence"},
            )
            _complete_discovery_run(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                status="completed",
                summary={
                    "sources": {"hackernews": total_hits},
                    "hits_found": total_hits,
                    "plausible_hits": total_plausible_hits,
                    "plausible_query_types": sorted(plausible_query_types),
                    "new_inserts": total_new_inserts,
                    "matching_source_posts": matching_source_posts,
                    "embedding_jobs": embedding_jobs,
                    "x_fallback": {
                        "outcome": "not_needed" if not x_fallback_skip_reason else "skipped",
                        "reason": x_fallback_skip_reason or "sufficient_diverse_free_evidence",
                    },
                    "verification_pending": True,
                },
            )
    except Exception as exc:
        _record_discovery_event(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            source="hackernews",
            query_type=None,
            query=None,
            phase="batch",
            outcome="failed",
            details={"error_type": exc.__class__.__name__},
        )
        _complete_discovery_run(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            status="failed",
            summary={
                "last_failure": {"source": "hackernews", "error_type": exc.__class__.__name__},
                "verification_pending": True,
            },
        )
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
        plausible_hn_query_types=sorted(plausible_query_types),
        minimum_plausible_query_types_for_x_suppression=(
            _minimum_plausible_query_types_for_x_suppression()
        ),
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
    initial_hits: int = 0,
    initial_new_inserts: int = 0,
    initial_source_result_counts: dict[str, int] | None = None,
    initial_plausible_hits: int = 0,
    initial_plausible_query_types: Sequence[str] | None = None,
    initial_matching_source_posts: int = 0,
    fallback_to_x: bool = False,
    enabled_sources: Sequence[str] | None = None,
    x_fallback_group_id: str | None = None,
    x_fallback_query: str | None = None,
    x_fallback_disabled_reason: str | None = None,
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
    discovery_run_id: str | None = None,
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
    _record_discovery_event(
        discovery_run_id=discovery_run_id,
        tenant_id=tenant_id,
        source="additional_public_sources",
        query_type=None,
        query=None,
        phase="batch",
        outcome="started",
        details={"query_count": len(normalized_queries), "lookback_hours": since_hours_ago},
    )
    try:
        from api.services.social_ingestion import (
            ADDITIONAL_PUBLIC_SOURCE_NAMES,
            additional_public_source_supports_discovery_query,
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
        total_hits = max(0, initial_hits)
        total_plausible_hits = max(0, initial_plausible_hits)
        plausible_query_types = {
            query_type.strip()
            for query_type in (initial_plausible_query_types or [])
            if isinstance(query_type, str) and query_type.strip()
        }
        total_new_inserts = max(0, initial_new_inserts)
        initial_matchable_posts = max(0, initial_matching_source_posts)
        source_failures = 0
        source_failure_details: dict[str, dict[str, int | str | None]] = {}
        source_result_counts: dict[str, int] = {
            str(source).strip().casefold(): max(0, int(hits))
            for source, hits in (initial_source_result_counts or {}).items()
            if str(source).strip()
        }
        matching_source_post_refs: dict[tuple[str, str], Any] = {}

        for source in source_names:
            source_hits = 0
            source_failed = False
            for query in normalized_queries:
                if not additional_public_source_supports_discovery_query(
                    source,
                    query["phrase"],
                ):
                    logger.info(
                        "additional_public_source_query_skipped source=%s query_type=%s skip_reason=%s",
                        source,
                        query["query_type"],
                        "nontechnical_query_for_technical_source",
                    )
                    _record_discovery_event(
                        discovery_run_id=discovery_run_id,
                        tenant_id=tenant_id,
                        source=source,
                        query_type=query["query_type"],
                        query=query["phrase"],
                        phase="search",
                        outcome="skipped",
                        details={"reason": "nontechnical_query_for_technical_source"},
                    )
                    continue
                if not claim_additional_public_source_query(
                    source=source,
                    query=query["phrase"],
                    since_hours_ago=since_hours_ago,
                    scope=additional_public_source_cache_scope(source),
                ):
                    _record_discovery_event(
                        discovery_run_id=discovery_run_id,
                        tenant_id=tenant_id,
                        source=source,
                        query_type=query["query_type"],
                        query=query["phrase"],
                        phase="search",
                        outcome="cached",
                    )
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
                    response = getattr(exc, "response", None)
                    status_code = getattr(response, "status_code", None)
                    source_failure_details[source] = {
                        "error_type": exc.__class__.__name__,
                        "status_code": status_code if isinstance(status_code, int) else None,
                    }
                    release_additional_public_source_query(
                        source=source,
                        query=query["phrase"],
                        since_hours_ago=since_hours_ago,
                        scope=additional_public_source_cache_scope(source),
                    )
                    logger.warning(
                        "additional_public_source_ingestion_skipped source=%s error_type=%s status_code=%s",
                        source,
                        exc.__class__.__name__,
                        status_code,
                    )
                    _record_discovery_event(
                        discovery_run_id=discovery_run_id,
                        tenant_id=tenant_id,
                        source=source,
                        query_type=query["query_type"],
                        query=query["phrase"],
                        phase="search",
                        outcome="failed",
                        details={
                            "error_type": exc.__class__.__name__,
                            "status_code": status_code,
                        },
                    )
                    break

                source_hits += result.hits_found
                total_hits += result.hits_found
                total_plausible_hits += result.plausible_hits
                if result.plausible_hits > 0:
                    plausible_query_types.add(query["query_type"])
                total_new_inserts += result.inserted_count
                _record_discovery_event(
                    discovery_run_id=discovery_run_id,
                    tenant_id=tenant_id,
                    source=source,
                    query_type=query["query_type"],
                    query=query["phrase"],
                    phase="search",
                    outcome="completed",
                    details={
                        "hits_found": result.hits_found,
                        "plausible_hits": result.plausible_hits,
                        "new_inserts": result.inserted_count,
                    },
                )
                for source_post_ref in result.matchable_source_post_refs:
                    matching_source_post_refs.setdefault(
                        (source_post_ref.source, source_post_ref.source_post_id),
                        source_post_ref,
                    )
            source_result_counts[source] = source_hits
            if source_failed:
                source_result_counts.setdefault(source, 0)

        matching_source_posts = len(matching_source_post_refs)
        total_matching_source_posts = initial_matchable_posts + matching_source_posts
        embedding_jobs = trigger_embedding_jobs(list(matching_source_post_refs.values()))
        x_fallback_enqueued = False
        x_fallback_skip_reason: str | None = x_fallback_disabled_reason
        minimum_plausible_hits = _minimum_plausible_free_hits_for_x_suppression()
        if fallback_to_x and not _has_sufficient_free_evidence_for_x_suppression(
            plausible_hits=total_plausible_hits,
            plausible_query_types=plausible_query_types,
            matching_source_posts=total_matching_source_posts,
        ):
            if x_fallback_disabled_reason:
                x_fallback_skip_reason = x_fallback_disabled_reason
            elif not _x_source_is_configured():
                x_fallback_skip_reason = "x_bearer_token_not_configured"
            elif not _claim_initial_x_fallback(x_fallback_group_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_already_claimed"
            elif not _claim_tenant_x_fallback_budget(tenant_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_tenant_budget_exceeded"
            else:
                x_kwargs: dict[str, Any] = {"strict_single_page": True}
                if tenant_id is not None:
                    x_kwargs["tenant_id"] = tenant_id
                if service_profile_id is not None:
                    x_kwargs["service_profile_id"] = service_profile_id
                if discovery_run_id:
                    x_kwargs["discovery_run_id"] = discovery_run_id
                ingest_x_job.send(
                    x_fallback_query or normalized_queries[0]["phrase"],
                    since_hours_ago,
                    posts_per_query,
                    **x_kwargs,
                )
                x_fallback_enqueued = True
                _record_discovery_event(
                    discovery_run_id=discovery_run_id,
                    tenant_id=tenant_id,
                    source="x",
                    query_type="fallback",
                    query=x_fallback_query or normalized_queries[0]["phrase"],
                    phase="fallback",
                    outcome="queued",
                    details={"reason": "insufficient_diverse_free_evidence"},
                )
        if not x_fallback_enqueued:
            x_outcome = "not_needed" if not x_fallback_skip_reason else "skipped"
            _record_discovery_event(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                source="x",
                query_type=None,
                query=None,
                phase="fallback",
                outcome=x_outcome,
                details={"reason": x_fallback_skip_reason or "sufficient_diverse_free_evidence"},
            )
            _complete_discovery_run(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                status="partial" if source_failures else "completed",
                summary={
                    "sources": source_result_counts,
                    "source_failures": source_failures,
                    "source_failure_details": source_failure_details,
                    "hits_found": total_hits,
                    "plausible_hits": total_plausible_hits,
                    "plausible_query_types": sorted(plausible_query_types),
                    "new_inserts": total_new_inserts,
                    "matching_source_posts": total_matching_source_posts,
                    "embedding_jobs": embedding_jobs,
                    "x_fallback": {
                        "outcome": x_outcome,
                        "reason": x_fallback_skip_reason or "sufficient_diverse_free_evidence",
                    },
                    "verification_pending": True,
                },
            )
    except Exception as exc:
        _record_discovery_event(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            source="additional_public_sources",
            query_type=None,
            query=None,
            phase="batch",
            outcome="failed",
            details={"error_type": exc.__class__.__name__},
        )
        _complete_discovery_run(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            status="failed",
            summary={
                "last_failure": {
                    "source": "additional_public_sources",
                    "error_type": exc.__class__.__name__,
                },
                "verification_pending": True,
            },
        )
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
        source_failure_details=source_failure_details,
        hits_found=total_hits,
        plausible_free_hits=total_plausible_hits,
        minimum_plausible_free_hits_for_x_suppression=minimum_plausible_hits,
        plausible_free_query_types=sorted(plausible_query_types),
        minimum_plausible_query_types_for_x_suppression=(
            _minimum_plausible_query_types_for_x_suppression()
        ),
        new_inserts=total_new_inserts,
        matching_source_posts=total_matching_source_posts,
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
        if fallback_to_x and not _has_sufficient_free_evidence_for_x_suppression(
            plausible_hits=result.plausible_hits,
            plausible_query_types={query_type or "legacy"} if result.plausible_hits else set(),
            matching_source_posts=len(matching_source_post_refs),
        ):
            if not _x_source_is_configured():
                x_fallback_skip_reason = "x_bearer_token_not_configured"
            elif not _claim_initial_x_fallback(x_fallback_group_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_already_claimed"
            elif not _claim_tenant_x_fallback_budget(tenant_id):
                x_fallback_skip_reason = "initial_ingestion_x_fallback_tenant_budget_exceeded"
            else:
                x_kwargs: dict[str, Any] = {"strict_single_page": True}
                if tenant_id is not None:
                    x_kwargs["tenant_id"] = tenant_id
                if service_profile_id is not None:
                    x_kwargs["service_profile_id"] = service_profile_id
                ingest_x_job.send(
                    x_fallback_query or query,
                    since_hours_ago,
                    posts_per_query,
                    **x_kwargs,
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
        plausible_hn_query_types=[query_type] if result.plausible_hits and query_type else [],
        minimum_plausible_query_types_for_x_suppression=(
            _minimum_plausible_query_types_for_x_suppression()
        ),
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
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
    discovery_run_id: str | None = None,
) -> None:
    """Ingest one X recent-search window and hand fresh rows to embedding.

    ``strict_single_page`` is used by the HN fallback so its one cost-controlled
    job cannot paginate into multiple paid X search requests.
    """
    _job_started(
        job_name="x_ingestion",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query=query,
        since_hours_ago=since_hours_ago,
        strict_single_page=strict_single_page,
    )
    _record_discovery_event(
        discovery_run_id=discovery_run_id,
        tenant_id=tenant_id,
        source="x",
        query_type="fallback",
        query=query,
        phase="search",
        outcome="started",
        details={"strict_single_page": strict_single_page, "lookback_hours": since_hours_ago},
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
                tenant_id=tenant_id,
                query=query,
                rejection_reason="x_bearer_token_not_configured",
            )
            _record_discovery_event(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                source="x",
                query_type="fallback",
                query=query,
                phase="search",
                outcome="skipped",
                details={"reason": "x_bearer_token_not_configured"},
            )
            _complete_discovery_run(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                status="partial",
                summary={
                    "x_fallback": {"outcome": "skipped", "reason": "x_bearer_token_not_configured"},
                    "verification_pending": True,
                },
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
                tenant_id=tenant_id,
                query=query,
                rejection_reason="provider_client_error",
                status_code=status_code,
            )
            _record_discovery_event(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                source="x",
                query_type="fallback",
                query=query,
                phase="search",
                outcome="skipped",
                details={"reason": "provider_client_error", "status_code": status_code},
            )
            _complete_discovery_run(
                discovery_run_id=discovery_run_id,
                tenant_id=tenant_id,
                status="partial",
                summary={
                    "x_fallback": {"outcome": "skipped", "reason": "provider_client_error"},
                    "verification_pending": True,
                },
            )
            return
        _record_discovery_event(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            source="x",
            query_type="fallback",
            query=query,
            phase="search",
            outcome="failed",
            details={"error_type": exc.__class__.__name__},
        )
        _complete_discovery_run(
            discovery_run_id=discovery_run_id,
            tenant_id=tenant_id,
            status="failed",
            summary={
                "last_failure": {"source": "x", "error_type": exc.__class__.__name__},
                "verification_pending": True,
            },
        )
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
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        query=query,
        hits_found=result.hits_found,
        new_inserts=result.inserted_count,
        strict_single_page=strict_single_page,
        matching_source_posts=len(
            matching_source_post_refs
        ),
        embedding_jobs=embedding_jobs,
    )
    _record_discovery_event(
        discovery_run_id=discovery_run_id,
        tenant_id=tenant_id,
        source="x",
        query_type="fallback",
        query=query,
        phase="search",
        outcome="completed",
        details={
            "hits_found": result.hits_found,
            "new_inserts": result.inserted_count,
            "matching_source_posts": len(matching_source_post_refs),
        },
    )
    _complete_discovery_run(
        discovery_run_id=discovery_run_id,
        tenant_id=tenant_id,
        status="completed",
        summary={
            "sources": {"x": result.hits_found},
            "hits_found": result.hits_found,
            "new_inserts": result.inserted_count,
            "matching_source_posts": len(matching_source_post_refs),
            "embedding_jobs": embedding_jobs,
            "x_fallback": {"outcome": "completed", "reason": "insufficient_diverse_free_evidence"},
            "verification_pending": True,
        },
    )


@dramatiq.actor(
    actor_name="purge_expired_public_data_job",
    queue_name=os.getenv("ARCLI_MAINTENANCE_QUEUE_NAME", "maintenance"),
    max_retries=2,
    min_backoff=60_000,
    max_backoff=900_000,
)
def purge_expired_public_data_job() -> None:
    """Apply the public-source retention policy outside customer job latency."""

    _job_started(job_name="public_data_retention")
    try:
        from api.services.social.data_governance import run_public_data_retention

        result = run_public_data_retention()
    except Exception as exc:
        logger.exception(
            "public_data_retention_failed error_type=%s error=%s",
            exc.__class__.__name__,
            exc,
        )
        raise

    _job_finished(
        job_name="public_data_retention",
        state="skipped" if result.skipped else "completed",
        lead_matches_deleted=result.lead_matches_deleted,
        source_posts_deleted=result.source_posts_deleted,
        discovery_evidence_deleted=result.discovery_evidence_deleted,
        removal_requests_anonymized=result.removal_requests_anonymized,
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
        # Watchlists are an additive tenant-scoped view over the same global
        # post cache. A rollout/schema issue here must never retry or duplicate
        # the established profile-wide matching result above.
        try:
            from api.services.watchlist_matching import (
                process_active_watchlists_for_public_source_post,
            )

            watchlist_result = process_active_watchlists_for_public_source_post(
                source_post_id,
                source=source,
            )
        except Exception as watchlist_exc:
            watchlist_result = None
            logger.exception(
                "watchlist_source_matching_failed source=%s source_post_id=%s error_type=%s error=%s",
                source,
                source_post_id,
                watchlist_exc.__class__.__name__,
                watchlist_exc,
            )
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
        watchlist_candidates=(watchlist_result or {}).get("candidates", 0),
        watchlist_ready_for_review=(watchlist_result or {}).get("ready_for_review", 0),
    )


@dramatiq.actor(
    actor_name="enqueue_source_post_embedding_batch_job",
    queue_name=os.getenv("ARCLI_SOURCE_POST_EMBEDDING_QUEUE_NAME", "embeddings"),
    max_retries=3,
    min_backoff=10_000,
    max_backoff=60_000,
)
def enqueue_source_post_embedding_batch_job(
    source_post_refs: Sequence[dict[str, str]],
    *,
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
) -> None:
    """Embed a small public-post batch before applying normal lead matching."""
    refs = [
        {
            "source": str(ref.get("source") or "").strip(),
            "source_post_id": str(ref.get("source_post_id") or "").strip(),
        }
        for ref in source_post_refs
        if isinstance(ref, dict)
        and str(ref.get("source") or "").strip()
        and str(ref.get("source_post_id") or "").strip()
    ]
    if not refs:
        return

    _job_started(
        job_name="source_post_embedding_batch_handoff",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        source_post_count=len(refs),
    )
    try:
        from api.services.social_ingestion import (
            process_public_source_post_embedding_batch,
        )

        result = process_public_source_post_embedding_batch(
            refs,
            tenant_id=tenant_id,
            service_profile_id=service_profile_id,
        )
        # Watchlists remain an independent tenant-scoped view.  Batch the
        # shared embedding work, but never let a watchlist error retry or
        # duplicate the profile-wide matching result above.
        watchlist_candidates = 0
        watchlist_ready_for_review = 0
        for ref in refs:
            try:
                from api.services.watchlist_matching import (
                    process_active_watchlists_for_public_source_post,
                )

                watchlist_result = process_active_watchlists_for_public_source_post(
                    ref["source_post_id"],
                    source=ref["source"],
                )
                watchlist_candidates += int(watchlist_result.get("candidates", 0))
                watchlist_ready_for_review += int(
                    watchlist_result.get("ready_for_review", 0)
                )
            except Exception as watchlist_exc:
                logger.exception(
                    "watchlist_source_matching_failed source=%s source_post_id=%s error_type=%s error=%s",
                    ref["source"],
                    ref["source_post_id"],
                    watchlist_exc.__class__.__name__,
                    watchlist_exc,
                )
    except Exception as exc:
        logger.exception(
            "source_post_embedding_batch_failed job_state=%s source_post_count=%s error_type=%s error=%s",
            "failed",
            len(refs),
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()

    _job_finished(
        job_name="source_post_embedding_batch_handoff",
        state="completed",
        source_post_count=len(refs),
        posts=result["posts"],
        embedded=result["embedded"],
        candidates=result["candidates"],
        ready_for_review=result["ready_for_review"],
        watchlist_candidates=watchlist_candidates,
        watchlist_ready_for_review=watchlist_ready_for_review,
    )


def enqueue_source_post_embedding_jobs(
    source_post_refs: Sequence[Any],
    *,
    tenant_id: str | None = None,
    service_profile_id: str | None = None,
) -> int:
    """Publish small source-qualified embedding batches for public rows.

    A plain string remains accepted solely to drain messages created by older
    workers. New callers pass ``PublicSourcePostRef`` objects, which avoid
    conflating equal external IDs from different providers.
    """
    _require_redis_broker()
    refs: list[dict[str, str]] = []
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
        # New source ingestion always has a source. Keep source-less legacy
        # messages on the original actor because they require ambiguity-safe
        # single-row loading.
        if not source:
            enqueue_source_post_embedding_job.send(source_post_id)
            continue
        refs.append({"source": source, "source_post_id": source_post_id})

    # Small batches keep the worker's memory guard from recycling mid-scan.
    batch_size = _int_env("ARCLI_SOURCE_POST_EMBEDDING_BATCH_SIZE", 8, minimum=1)
    batch_kwargs: dict[str, str] = {}
    if tenant_id and service_profile_id:
        batch_kwargs = {
            "tenant_id": tenant_id,
            "service_profile_id": service_profile_id,
        }
    messages_sent = 0
    for offset in range(0, len(refs), batch_size):
        enqueue_source_post_embedding_batch_job.send(
            refs[offset : offset + batch_size],
            **batch_kwargs,
        )
        messages_sent += 1

    legacy_count = len(seen) - len(refs)
    messages_sent += legacy_count
    logger.info(
        "source_post_embedding_handoffs_enqueued job_state=%s source_post_count=%s batch_count=%s batch_size=%s tenant_id=%s service_profile_id=%s",
        "pending",
        len(seen),
        messages_sent,
        batch_size,
        tenant_id,
        service_profile_id,
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
    actor_name="process_watchlist_discovery_job",
    queue_name=os.getenv("ARCLI_WATCHLIST_QUEUE_NAME", "ingestion"),
    max_retries=2,
    min_backoff=15_000,
    max_backoff=90_000,
    time_limit=_int_env("ARCLI_WATCHLIST_JOB_TIME_LIMIT_MS", 180_000, minimum=1),
)
def process_watchlist_discovery_job_actor(tenant_id: str, watchlist_id: str) -> None:
    """Run one customer-defined Watchlist without widening tenant scope."""
    _job_started(
        job_name="watchlist_discovery",
        tenant_id=tenant_id,
        watchlist_id=watchlist_id,
    )
    try:
        from api.services.watchlist_matching import process_watchlist_discovery_job

        result = process_watchlist_discovery_job(tenant_id, watchlist_id)
    except Exception as exc:
        logger.exception(
            "watchlist_discovery_failed job_state=%s tenant_id=%s watchlist_id=%s error_type=%s error=%s",
            "failed",
            tenant_id,
            watchlist_id,
            exc.__class__.__name__,
            exc,
        )
        raise
    finally:
        _close_actor_openai_clients()

    _job_finished(
        job_name="watchlist_discovery",
        state="completed",
        tenant_id=tenant_id,
        watchlist_id=watchlist_id,
        posts=result["posts"],
        embedded=result["embedded"],
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
    time_limit=_int_env("ARCLI_CRAWL_JOB_TIME_LIMIT_MS", 135_000, minimum=1),
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


@dramatiq.actor(
    actor_name="process_buyer_language_research_job",
    queue_name=os.getenv("ARCLI_BUYER_LANGUAGE_RESEARCH_QUEUE_NAME", "ingestion"),
    max_retries=_int_env("ARCLI_BUYER_LANGUAGE_RESEARCH_JOB_MAX_RETRIES", 2),
    min_backoff=_int_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_JOB_MIN_BACKOFF_MS", 15_000, minimum=1
    ),
    max_backoff=_int_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_JOB_MAX_BACKOFF_MS", 90_000, minimum=1
    ),
    time_limit=_int_env(
        "ARCLI_BUYER_LANGUAGE_RESEARCH_JOB_TIME_LIMIT_MS", 180_000, minimum=1
    ),
    on_retry_exhausted="mark_buyer_language_research_dead_lettered",
)
def process_buyer_language_research_job(
    tenant_id: str,
    service_profile_id: str,
) -> None:
    """Run isolated research; it must never invoke the lead/CRM pipeline."""

    _job_started(
        job_name="buyer_language_research",
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
    )
    try:
        from api.services.social.buyer_language_research import run_buyer_language_research

        result = run_buyer_language_research(tenant_id, service_profile_id)
    except Exception as exc:
        logger.exception(
            "buyer_language_research_actor_failed job_state=%s tenant_id=%s service_profile_id=%s error_type=%s",
            "failed",
            tenant_id,
            service_profile_id,
            exc.__class__.__name__,
        )
        raise
    finally:
        # This path does not call OpenAI today, but closing the per-thread
        # client registry preserves the worker lifecycle invariant if a future
        # evidence verifier is added.
        _close_actor_openai_clients()

    _job_finished(
        job_name="buyer_language_research",
        state=result.status,
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        run_id=result.run_id,
        evidence_persisted=result.evidence_persisted,
        source_failures=result.source_failures,
        skip_reason=result.skip_reason,
    )


@dramatiq.actor(
    actor_name="mark_buyer_language_research_dead_lettered",
    queue_name=os.getenv("ARCLI_BUYER_LANGUAGE_RESEARCH_QUEUE_NAME", "ingestion"),
)
def mark_buyer_language_research_dead_lettered(
    message_data: dict[str, Any],
    retry_context: dict[str, Any] | None = None,
) -> None:
    """Record exhausted research retries without logging source/customer text."""

    args = message_data.get("args") if isinstance(message_data, dict) else None
    tenant_id = str(args[0]) if isinstance(args, (list, tuple)) and args else None
    service_profile_id = (
        str(args[1]) if isinstance(args, (list, tuple)) and len(args) > 1 else None
    )
    logger.error(
        "buyer_language_research_dead_lettered tenant_id=%s service_profile_id=%s retries=%s max_retries=%s message_id=%s",
        tenant_id,
        service_profile_id,
        (retry_context or {}).get("retries"),
        (retry_context or {}).get("max_retries"),
        message_data.get("message_id") if isinstance(message_data, dict) else None,
    )
