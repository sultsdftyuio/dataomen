"""Dramatiq boundary for durable website-refresh notification delivery."""

from __future__ import annotations

import logging
import os

import dramatiq


logger = logging.getLogger(__name__)


def _int_env(name: str, default: int, *, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


@dramatiq.actor(
    actor_name="deliver_crawl_result_notification",
    queue_name=os.getenv("ARCLI_NOTIFICATION_QUEUE_NAME", "notifications"),
    max_retries=_int_env("ARCLI_CRAWL_RESULT_EMAIL_MAX_RETRIES", 3, minimum=0),
    min_backoff=_int_env(
        "ARCLI_CRAWL_RESULT_EMAIL_MIN_BACKOFF_MS", 60_000, minimum=1
    ),
    max_backoff=_int_env(
        "ARCLI_CRAWL_RESULT_EMAIL_MAX_BACKOFF_MS", 1_800_000, minimum=1
    ),
    time_limit=_int_env(
        "ARCLI_CRAWL_RESULT_EMAIL_TIME_LIMIT_MS", 30_000, minimum=1
    ),
)
def deliver_crawl_result_notification(outbox_id: str) -> None:
    from api.services.crawl_notifications import deliver_crawl_result_notification as execute

    try:
        result = execute(outbox_id)
    except Exception as exc:
        # Keep the HTTP provider connector out of idle worker imports. The
        # notification service is loaded only after Dramatiq dequeues work.
        from api.services.crawl_notifications import RetryableCrawlNotificationError

        if isinstance(exc, RetryableCrawlNotificationError):
            raise
        logger.exception(
            "crawl_result_notification_actor_failed outbox_id=%s error_type=%s",
            outbox_id,
            exc.__class__.__name__,
        )
        raise
    logger.info(
        "crawl_result_notification_actor_completed outbox_id=%s result=%s",
        outbox_id,
        result,
    )


@dramatiq.actor(
    actor_name="recover_pending_crawl_result_notifications",
    queue_name=os.getenv("ARCLI_NOTIFICATION_QUEUE_NAME", "notifications"),
    max_retries=2,
    min_backoff=60_000,
    max_backoff=900_000,
    time_limit=_int_env(
        "ARCLI_CRAWL_RESULT_EMAIL_RECOVERY_TIME_LIMIT_MS", 30_000, minimum=1
    ),
)
def recover_pending_crawl_result_notifications() -> None:
    from api.services.crawl_notifications import (
        recover_pending_crawl_result_notifications as execute,
    )

    recovered = execute()
    logger.info("crawl_result_notification_recovery_completed recovered=%s", recovered)
