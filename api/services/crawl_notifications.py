"""Durable, privacy-minimised delivery of website-refresh result emails.

This module is deliberately separate from the retired recovery-email flow.
It persists a small outbox record before publishing a worker message, never
stores lead or source-post content in that outbox, and uses a stable provider
idempotency key to make retries safe.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from api.services.integrations.email_connector import (
    EmailConfig,
    EmailConnector,
    EmailPayload,
    EmailProviderError,
    FailureType,
)
from api.services.crawl_notification_content import build_crawl_result_email


logger = logging.getLogger(__name__)


NOTIFICATION_TYPE_CRAWL_COMPLETED = "crawl_completed"
NOTIFICATION_TYPE_DISCOVERY_COMPLETED = "discovery_completed"
NOTIFICATION_TYPE_DISCOVERY_PARTIAL = "discovery_partial"
NOTIFICATION_TYPE_CRAWL_FAILED = "crawl_failed"

_EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_MAX_EVENT_KEY_LENGTH = 160
_MAX_HOST_LENGTH = 253


class RetryableCrawlNotificationError(RuntimeError):
    """Raise from a worker only when the email provider can be retried safely."""


@dataclass(frozen=True)
class NotificationSummary:
    """The aggregate-only payload kept in the notification outbox."""

    website_host: str
    pages_crawled: int = 0
    ready_for_review: int = 0
    source_posts_checked: int = 0

    def as_dict(self) -> dict[str, int | str]:
        return {
            "website_host": self.website_host,
            "pages_crawled": self.pages_crawled,
            "ready_for_review": self.ready_for_review,
            "source_posts_checked": self.source_posts_checked,
        }


@dataclass(frozen=True)
class NotificationOutboxRecord:
    id: str
    recipient_email: str
    notification_type: str
    result_summary: dict[str, Any]
    event_key: str


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"", "0", "false", "no", "off"}


def _env_int(name: str, default: int, *, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


def _normalize_database_url(raw_url: str) -> str:
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql://", 1)
    return raw_url


@lru_cache(maxsize=1)
def _database_engine() -> Engine:
    database_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("SUPABASE_DB_URL")
        or os.getenv("POSTGRES_URL")
        or ""
    ).strip()
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL is required."
        )

    return create_engine(
        _normalize_database_url(database_url),
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=0,
        pool_timeout=3,
        pool_recycle=300,
        connect_args={
            "connect_timeout": _env_int(
                "ARCLI_DB_CONNECT_TIMEOUT_SECONDS", 3, minimum=1
            ),
        },
    )


def crawl_result_email_enabled() -> bool:
    """Keep outbound mail dark until a verified sender is explicitly enabled."""

    return _env_bool("ARCLI_CRAWL_RESULT_EMAILS_ENABLED", default=False)


def _table_exists(conn: Connection, table_name: str) -> bool:
    return bool(
        conn.execute(
            text("SELECT to_regclass(:table_name) IS NOT NULL"),
            {"table_name": f"public.{table_name}"},
        ).scalar()
    )


def _host_from_website_url(website_url: str | None) -> str:
    try:
        hostname = urlparse((website_url or "").strip()).hostname or ""
    except ValueError:
        hostname = ""
    normalized = hostname.lower().removeprefix("www.")
    return normalized[:_MAX_HOST_LENGTH] or "your website"


def _non_negative_int(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _json_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return {}
        return dict(parsed) if isinstance(parsed, Mapping) else {}
    return {}


def _ready_for_review_from_summary(summary: Mapping[str, Any]) -> int:
    run_control = summary.get("run_control")
    if isinstance(run_control, Mapping):
        value = run_control.get("ready_for_review")
        if value is not None:
            return _non_negative_int(value)
    return _non_negative_int(summary.get("ready_for_review"))


def _source_post_count_from_summary(summary: Mapping[str, Any]) -> int:
    return _non_negative_int(
        summary.get("matching_source_posts", summary.get("new_inserts"))
    )


def _valid_recipient(email: Any) -> str | None:
    candidate = str(email or "").strip().lower()
    if len(candidate) > 320 or not _EMAIL_PATTERN.fullmatch(candidate):
        return None
    return candidate


def _masked_email(email: str) -> str:
    if "@" not in email:
        return "***"
    local, domain = email.rsplit("@", 1)
    return f"{hashlib.sha256(local.encode()).hexdigest()[:8]}...@{domain}"


def _safe_event_key(value: str) -> str:
    normalized = value.strip()
    if not normalized or len(normalized) > _MAX_EVENT_KEY_LENGTH:
        raise ValueError("Notification event key is missing or too long.")
    return normalized


def _notification_email_config() -> EmailConfig:
    api_key = (
        os.getenv("ARCLI_CRAWL_RESULT_EMAIL_API_KEY")
        or os.getenv("RESEND_API_KEY")
        or ""
    ).strip()
    sender = os.getenv("ARCLI_CRAWL_RESULT_EMAIL_SENDER", "").strip()
    return EmailConfig(
        provider_url=os.getenv(
            "ARCLI_CRAWL_RESULT_EMAIL_PROVIDER_URL", "https://api.resend.com/emails"
        ).strip(),
        api_key=api_key,
        sender=sender,
        timeout_connect=float(
            _env_int("ARCLI_CRAWL_RESULT_EMAIL_CONNECT_TIMEOUT_SECONDS", 5, minimum=1)
        ),
        timeout_read=float(
            _env_int("ARCLI_CRAWL_RESULT_EMAIL_READ_TIMEOUT_SECONDS", 10, minimum=1)
        ),
        timeout_write=float(
            _env_int("ARCLI_CRAWL_RESULT_EMAIL_WRITE_TIMEOUT_SECONDS", 5, minimum=1)
        ),
        timeout_pool=float(
            _env_int("ARCLI_CRAWL_RESULT_EMAIL_POOL_TIMEOUT_SECONDS", 5, minimum=1)
        ),
        mock=_env_bool("ARCLI_CRAWL_RESULT_EMAIL_MOCK", default=False),
    )


def _email_copy(
    *,
    notification_type: str,
    result_summary: Mapping[str, Any],
) -> tuple[str, str, str]:
    return build_crawl_result_email(
        notification_type=notification_type,
        result_summary=result_summary,
    )


def _outbox_schema_available(conn: Connection) -> bool:
    return all(
        _table_exists(conn, table_name)
        for table_name in (
            "crawl_notification_outbox",
            "crawl_notification_preferences",
            "crawl_notification_suppressions",
            "tenant_settings",
        )
    )


def _eligible_recipients(conn: Connection, tenant_id: str) -> list[dict[str, str]]:
    rows = conn.execute(
        text(
            """
            SELECT membership.user_id::text AS user_id,
                   account.email AS recipient_email
              FROM public.tenant_users AS membership
              JOIN auth.users AS account
                ON account.id::text = membership.user_id::text
              LEFT JOIN public.tenant_settings AS settings
                ON settings.tenant_id = membership.tenant_id
              LEFT JOIN public.crawl_notification_preferences AS preference
                ON preference.tenant_id = membership.tenant_id
               AND preference.user_id::text = membership.user_id::text
             WHERE membership.tenant_id = :tenant_id
               AND LOWER(COALESCE(membership.role, '')) IN ('owner', 'admin')
               AND COALESCE(settings.crawl_completion_email_enabled, TRUE)
               AND COALESCE(preference.enabled, TRUE)
               AND account.email IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1
                      FROM public.crawl_notification_suppressions AS suppression
                     WHERE suppression.tenant_id = membership.tenant_id
                       AND LOWER(suppression.email) = LOWER(account.email)
               )
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings()
    recipients: list[dict[str, str]] = []
    for row in rows:
        email = _valid_recipient(row.get("recipient_email"))
        user_id = str(row.get("user_id") or "").strip()
        if email and user_id:
            recipients.append({"user_id": user_id, "recipient_email": email})
    return recipients


def _prune_terminal_outbox_records(conn: Connection) -> int:
    """Bound outbox storage without holding a cleanup transaction for long."""

    retention_days = _env_int(
        "ARCLI_CRAWL_RESULT_EMAIL_RETENTION_DAYS", 90, minimum=7
    )
    result = conn.execute(
        text(
            """
            WITH expired AS (
                SELECT id
                  FROM public.crawl_notification_outbox
                 WHERE status IN ('sent', 'suppressed', 'failed')
                   AND updated_at < NOW() - (:retention_days * interval '1 day')
                 ORDER BY updated_at ASC
                 LIMIT 500
                 FOR UPDATE SKIP LOCKED
            )
            DELETE FROM public.crawl_notification_outbox AS outbox
             USING expired
             WHERE outbox.id = expired.id
            """
        ),
        {"retention_days": retention_days},
    )
    return max(0, result.rowcount or 0)


def _insert_outbox_records(
    *,
    tenant_id: str,
    event_key: str,
    notification_type: str,
    result_summary: NotificationSummary,
    discovery_run_id: str | None = None,
    crawl_job_id: str | None = None,
) -> list[str]:
    if not crawl_result_email_enabled():
        logger.info(
            "crawl_result_notification_enqueue_skipped tenant_id=%s event_key=%s reason=%s",
            tenant_id,
            event_key,
            "feature_disabled",
        )
        return []

    normalized_event_key = _safe_event_key(event_key)
    interval_hours = _env_int(
        "ARCLI_CRAWL_RESULT_EMAIL_MIN_INTERVAL_HOURS", 20, minimum=1
    )
    expiry_hours = _env_int(
        "ARCLI_CRAWL_RESULT_EMAIL_EXPIRY_HOURS", 168, minimum=1
    )
    outbox_ids: list[str] = []
    with _database_engine().begin() as conn:
        if not _outbox_schema_available(conn):
            logger.warning(
                "crawl_result_notification_enqueue_skipped tenant_id=%s event_key=%s reason=%s",
                tenant_id,
                normalized_event_key,
                "notification_schema_unavailable",
            )
            return []

        pruned = _prune_terminal_outbox_records(conn)
        if pruned:
            logger.info("crawl_result_notification_outbox_pruned deleted=%s", pruned)

        for recipient in _eligible_recipients(conn, tenant_id):
            # The interval cap is deliberately per recipient, so a new owner
            # still receives the next completion email without waiting for an
            # unrelated administrator's earlier notification.
            row = conn.execute(
                text(
                    """
                    INSERT INTO public.crawl_notification_outbox (
                        tenant_id,
                        user_id,
                        recipient_email,
                        event_key,
                        notification_type,
                        discovery_run_id,
                        crawl_job_id,
                        result_summary,
                        expires_at
                    )
                    SELECT
                        :tenant_id,
                        CAST(:user_id AS uuid),
                        :recipient_email,
                        :event_key,
                        :notification_type,
                        CAST(:discovery_run_id AS uuid),
                        :crawl_job_id,
                        CAST(:result_summary AS jsonb),
                        NOW() + (:expiry_hours * interval '1 hour')
                    WHERE NOT EXISTS (
                        SELECT 1
                          FROM public.crawl_notification_outbox AS recent
                         WHERE recent.tenant_id = :tenant_id
                           AND recent.user_id = CAST(:user_id AS uuid)
                           AND recent.status IN ('pending', 'dispatching', 'sent')
                           AND recent.created_at >= (
                               NOW() - (:interval_hours * interval '1 hour')
                           )
                    )
                    ON CONFLICT (tenant_id, user_id, event_key) DO NOTHING
                    RETURNING id::text
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "user_id": recipient["user_id"],
                    "recipient_email": recipient["recipient_email"],
                    "event_key": normalized_event_key,
                    "notification_type": notification_type,
                    "discovery_run_id": discovery_run_id,
                    "crawl_job_id": crawl_job_id,
                    "result_summary": json.dumps(result_summary.as_dict()),
                    "expiry_hours": expiry_hours,
                    "interval_hours": interval_hours,
                },
            ).scalar_one_or_none()
            if row is not None:
                outbox_ids.append(str(row))

    if outbox_ids:
        logger.info(
            "crawl_result_notification_enqueued tenant_id=%s event_key=%s notification_type=%s recipients=%s",
            tenant_id,
            normalized_event_key,
            notification_type,
            len(outbox_ids),
        )
    else:
        logger.info(
            "crawl_result_notification_not_enqueued tenant_id=%s event_key=%s notification_type=%s reason=%s",
            tenant_id,
            normalized_event_key,
            notification_type,
            "deduplicated_rate_limited_or_preference_disabled",
        )
    return outbox_ids


def _publish_delivery_messages(outbox_ids: list[str]) -> None:
    for outbox_id in outbox_ids:
        try:
            from api.workers.notification_actors import deliver_crawl_result_notification

            message = deliver_crawl_result_notification.send(outbox_id)
            logger.info(
                "crawl_result_notification_delivery_enqueued outbox_id=%s message_id=%s",
                outbox_id,
                message.message_id,
            )
        except Exception as exc:
            # The recovery actor discovers this pending outbox entry after the
            # configured grace period. A broker hiccup must never make the
            # completed crawl or discovery run fail.
            logger.exception(
                "crawl_result_notification_delivery_enqueue_failed outbox_id=%s error_type=%s",
                outbox_id,
                exc.__class__.__name__,
            )


def enqueue_initial_crawl_completion_notifications(
    *,
    tenant_id: str,
    crawl_job_id: str,
    website_url: str,
    pages_crawled: int,
) -> list[str]:
    """Queue Free-plan completion mail without revealing locked lead results."""

    outbox_ids = _insert_outbox_records(
        tenant_id=tenant_id,
        event_key=f"crawl:{crawl_job_id}",
        notification_type=NOTIFICATION_TYPE_CRAWL_COMPLETED,
        crawl_job_id=crawl_job_id,
        result_summary=NotificationSummary(
            website_host=_host_from_website_url(website_url),
            pages_crawled=_non_negative_int(pages_crawled),
        ),
    )
    _publish_delivery_messages(outbox_ids)
    return outbox_ids


def enqueue_terminal_crawl_failure_notifications(
    *,
    tenant_id: str,
    crawl_job_id: str,
    website_url: str,
) -> list[str]:
    """Queue one failure email only after the crawl actor exhausts retries."""

    outbox_ids = _insert_outbox_records(
        tenant_id=tenant_id,
        event_key=f"crawl-failed:{crawl_job_id}",
        notification_type=NOTIFICATION_TYPE_CRAWL_FAILED,
        crawl_job_id=crawl_job_id,
        result_summary=NotificationSummary(
            website_host=_host_from_website_url(website_url),
        ),
    )
    _publish_delivery_messages(outbox_ids)
    return outbox_ids


def enqueue_discovery_completion_notifications(
    *,
    tenant_id: str,
    discovery_run_id: str,
    status: str,
) -> list[str]:
    """Queue a paid result email after the discovery run has reached a terminal state."""

    normalized_status = status.strip().lower()
    if normalized_status not in {"completed", "partial"}:
        return []

    with _database_engine().begin() as conn:
        if not _outbox_schema_available(conn) or not _table_exists(conn, "discovery_runs"):
            logger.warning(
                "crawl_result_notification_enqueue_skipped tenant_id=%s discovery_run_id=%s reason=%s",
                tenant_id,
                discovery_run_id,
                "notification_or_discovery_schema_unavailable",
            )
            return []
        row = conn.execute(
            text(
                """
                SELECT run.summary,
                       settings.website_url,
                       COALESCE(latest_crawl.pages_crawled, 0) AS pages_crawled
                  FROM public.discovery_runs AS run
                  LEFT JOIN public.tenant_settings AS settings
                    ON settings.tenant_id = run.tenant_id
                  LEFT JOIN LATERAL (
                      SELECT crawl.pages_crawled
                        FROM public.crawl_jobs AS crawl
                       WHERE crawl.tenant_id = run.tenant_id
                         AND crawl.service_profile_id = run.service_profile_id::text
                         AND crawl.status = 'completed'
                       ORDER BY crawl.completed_at DESC NULLS LAST, crawl.updated_at DESC
                       LIMIT 1
                  ) AS latest_crawl ON TRUE
                 WHERE run.id = CAST(:discovery_run_id AS uuid)
                   AND run.tenant_id = :tenant_id
                   AND run.status = :status
                 LIMIT 1
                """
            ),
            {
                "discovery_run_id": discovery_run_id,
                "tenant_id": tenant_id,
                "status": normalized_status,
            },
        ).mappings().first()

    if row is None:
        logger.info(
            "crawl_result_notification_enqueue_skipped tenant_id=%s discovery_run_id=%s reason=%s",
            tenant_id,
            discovery_run_id,
            "discovery_run_not_found",
        )
        return []

    summary = _json_mapping(row.get("summary"))
    notification_type = (
        NOTIFICATION_TYPE_DISCOVERY_COMPLETED
        if normalized_status == "completed"
        else NOTIFICATION_TYPE_DISCOVERY_PARTIAL
    )
    outbox_ids = _insert_outbox_records(
        tenant_id=tenant_id,
        event_key=f"discovery:{discovery_run_id}",
        notification_type=notification_type,
        discovery_run_id=discovery_run_id,
        result_summary=NotificationSummary(
            website_host=_host_from_website_url(row.get("website_url")),
            pages_crawled=_non_negative_int(row.get("pages_crawled")),
            ready_for_review=_ready_for_review_from_summary(summary),
            source_posts_checked=_source_post_count_from_summary(summary),
        ),
    )
    _publish_delivery_messages(outbox_ids)
    return outbox_ids


def _claim_outbox_record(
    conn: Connection,
    outbox_id: str,
) -> NotificationOutboxRecord | None:
    claim_token = secrets.token_hex(16)
    claim_timeout_seconds = _env_int(
        "ARCLI_CRAWL_RESULT_EMAIL_CLAIM_TIMEOUT_SECONDS", 1_200, minimum=60
    )
    conn.execute(
        text(
            """
            UPDATE public.crawl_notification_outbox AS outbox
               SET status = 'suppressed',
                   suppression_reason = 'expired',
                   claim_token = NULL,
                   claimed_at = NULL,
                   updated_at = NOW()
             WHERE outbox.id = CAST(:outbox_id AS uuid)
               AND outbox.status IN ('pending', 'dispatching')
               AND outbox.expires_at <= NOW()
            """
        ),
        {"outbox_id": outbox_id},
    )
    conn.execute(
        text(
            """
            UPDATE public.crawl_notification_outbox AS outbox
               SET status = 'suppressed',
                   suppression_reason = CASE
                       WHEN EXISTS (
                           SELECT 1
                             FROM public.crawl_notification_suppressions AS suppression
                            WHERE suppression.tenant_id = outbox.tenant_id
                              AND LOWER(suppression.email) = LOWER(outbox.recipient_email)
                       ) THEN 'recipient_suppressed'
                       WHEN EXISTS (
                           SELECT 1
                             FROM public.crawl_notification_preferences AS preference
                            WHERE preference.tenant_id = outbox.tenant_id
                              AND preference.user_id::text = outbox.user_id::text
                              AND NOT preference.enabled
                       ) THEN 'recipient_preference_disabled'
                       WHEN EXISTS (
                           SELECT 1
                             FROM public.tenant_settings AS settings
                            WHERE settings.tenant_id = outbox.tenant_id
                              AND NOT COALESCE(settings.crawl_completion_email_enabled, TRUE)
                       ) THEN 'workspace_preference_disabled'
                       ELSE 'recipient_no_longer_owner'
                   END,
                   claim_token = NULL,
                   claimed_at = NULL,
                   updated_at = NOW()
             WHERE outbox.id = CAST(:outbox_id AS uuid)
               AND outbox.status IN ('pending', 'dispatching')
               AND (
                   EXISTS (
                       SELECT 1
                         FROM public.crawl_notification_suppressions AS suppression
                        WHERE suppression.tenant_id = outbox.tenant_id
                          AND LOWER(suppression.email) = LOWER(outbox.recipient_email)
                   )
                   OR EXISTS (
                       SELECT 1
                         FROM public.crawl_notification_preferences AS preference
                        WHERE preference.tenant_id = outbox.tenant_id
                          AND preference.user_id::text = outbox.user_id::text
                          AND NOT preference.enabled
                   )
                   OR EXISTS (
                       SELECT 1
                         FROM public.tenant_settings AS settings
                        WHERE settings.tenant_id = outbox.tenant_id
                          AND NOT COALESCE(settings.crawl_completion_email_enabled, TRUE)
                   )
                   OR NOT EXISTS (
                       SELECT 1
                         FROM public.tenant_users AS membership
                        WHERE membership.tenant_id = outbox.tenant_id
                          AND membership.user_id::text = outbox.user_id::text
                          AND LOWER(COALESCE(membership.role, '')) IN ('owner', 'admin')
                   )
               )
            """
        ),
        {"outbox_id": outbox_id},
    )
    row = conn.execute(
        text(
            """
            UPDATE public.crawl_notification_outbox AS outbox
               SET status = 'dispatching',
                   claim_token = :claim_token,
                   claimed_at = NOW(),
                   last_attempt_at = NOW(),
                   attempt_count = attempt_count + 1,
                   updated_at = NOW()
             WHERE outbox.id = CAST(:outbox_id AS uuid)
               AND outbox.expires_at > NOW()
               AND (
                   outbox.status = 'pending'
                   OR (
                       outbox.status = 'dispatching'
                       AND outbox.claimed_at < NOW() - (:claim_timeout_seconds * interval '1 second')
                   )
               )
               AND NOT EXISTS (
                   SELECT 1
                     FROM public.crawl_notification_suppressions AS suppression
                    WHERE suppression.tenant_id = outbox.tenant_id
                      AND LOWER(suppression.email) = LOWER(outbox.recipient_email)
               )
               AND NOT EXISTS (
                   SELECT 1
                     FROM public.crawl_notification_preferences AS preference
                    WHERE preference.tenant_id = outbox.tenant_id
                      AND preference.user_id::text = outbox.user_id::text
                      AND NOT preference.enabled
               )
               AND NOT EXISTS (
                   SELECT 1
                     FROM public.tenant_settings AS settings
                    WHERE settings.tenant_id = outbox.tenant_id
                      AND NOT COALESCE(settings.crawl_completion_email_enabled, TRUE)
               )
               AND EXISTS (
                   SELECT 1
                     FROM public.tenant_users AS membership
                    WHERE membership.tenant_id = outbox.tenant_id
                      AND membership.user_id::text = outbox.user_id::text
                      AND LOWER(COALESCE(membership.role, '')) IN ('owner', 'admin')
               )
            RETURNING id::text,
                      recipient_email,
                      notification_type,
                      result_summary,
                      event_key
            """
        ),
        {
            "outbox_id": outbox_id,
            "claim_token": claim_token,
            "claim_timeout_seconds": claim_timeout_seconds,
        },
    ).mappings().first()
    if row is None:
        return None
    # The token is private to this process and required by all terminal writes.
    result_summary = _json_mapping(row.get("result_summary"))
    result_summary["_claim_token"] = claim_token
    return NotificationOutboxRecord(
        id=str(row["id"]),
        recipient_email=str(row["recipient_email"]),
        notification_type=str(row["notification_type"]),
        result_summary=result_summary,
        event_key=str(row["event_key"]),
    )


def _finish_delivery(
    *,
    outbox_id: str,
    claim_token: str,
    status: str,
    provider_id: str | None = None,
    error_code: str | None = None,
    suppression_reason: str | None = None,
) -> None:
    with _database_engine().begin() as conn:
        conn.execute(
            text(
                """
                UPDATE public.crawl_notification_outbox
                   SET status = :status,
                       provider_id = COALESCE(:provider_id, provider_id),
                       error_code = :error_code,
                       suppression_reason = :suppression_reason,
                       claim_token = NULL,
                       claimed_at = NULL,
                       sent_at = CASE WHEN :status = 'sent' THEN NOW() ELSE sent_at END,
                       updated_at = NOW()
                 WHERE id = CAST(:outbox_id AS uuid)
                   AND claim_token = :claim_token
                """
            ),
            {
                "outbox_id": outbox_id,
                "claim_token": claim_token,
                "status": status,
                "provider_id": provider_id,
                "error_code": error_code,
                "suppression_reason": suppression_reason,
            },
        )


async def _send_email(
    config: EmailConfig,
    payload: EmailPayload,
    *,
    idempotency_key: str,
) -> str:
    async with EmailConnector(config) as connector:
        response = await connector.send(payload, idempotency_key)
        return response.provider_id


def deliver_crawl_result_notification(outbox_id: str) -> str:
    """Claim and send one outbox row. Safe to invoke repeatedly from workers."""

    if not crawl_result_email_enabled():
        logger.info(
            "crawl_result_notification_delivery_skipped outbox_id=%s reason=%s",
            outbox_id,
            "feature_disabled",
        )
        return "disabled"

    with _database_engine().begin() as conn:
        if not _outbox_schema_available(conn):
            logger.warning(
                "crawl_result_notification_delivery_skipped outbox_id=%s reason=%s",
                outbox_id,
                "notification_schema_unavailable",
            )
            return "schema_unavailable"
        record = _claim_outbox_record(conn, outbox_id)

    if record is None:
        return "not_claimed"

    claim_token = str(record.result_summary.pop("_claim_token"))
    try:
        config = _notification_email_config()
        subject, text_body, html_body = _email_copy(
            notification_type=record.notification_type,
            result_summary=record.result_summary,
        )
        payload = EmailPayload(
            to_email=record.recipient_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )
    except Exception as exc:
        _finish_delivery(
            outbox_id=record.id,
            claim_token=claim_token,
            status="failed",
            error_code="configuration_or_payload_invalid",
        )
        logger.error(
            "crawl_result_notification_delivery_failed outbox_id=%s error_type=%s recipient=%s reason=%s",
            record.id,
            exc.__class__.__name__,
            _masked_email(record.recipient_email),
            "configuration_or_payload_invalid",
        )
        return "configuration_or_payload_invalid"

    # The provider sees the exact same key for every actor retry, protecting
    # against the timeout-after-acceptance case.
    idempotency_key = f"arcli-crawl-result:{record.id}"
    try:
        provider_id = asyncio.run(
            _send_email(config, payload, idempotency_key=idempotency_key)
        )
    except EmailProviderError as exc:
        if exc.failure_type is FailureType.RETRYABLE:
            _finish_delivery(
                outbox_id=record.id,
                claim_token=claim_token,
                status="pending",
                error_code=f"provider_{exc.status_code or 'network'}",
            )
            logger.warning(
                "crawl_result_notification_delivery_retryable outbox_id=%s error_type=%s recipient=%s",
                record.id,
                exc.__class__.__name__,
                _masked_email(record.recipient_email),
            )
            raise RetryableCrawlNotificationError("Email provider retry is required.") from exc

        _finish_delivery(
            outbox_id=record.id,
            claim_token=claim_token,
            status="failed",
            error_code=f"provider_{exc.status_code or 'permanent'}",
        )
        logger.warning(
            "crawl_result_notification_delivery_failed outbox_id=%s error_type=%s recipient=%s reason=%s",
            record.id,
            exc.__class__.__name__,
            _masked_email(record.recipient_email),
            "provider_permanent",
        )
        return "provider_permanent"
    except Exception as exc:
        _finish_delivery(
            outbox_id=record.id,
            claim_token=claim_token,
            status="pending",
            error_code="unexpected_delivery_error",
        )
        logger.exception(
            "crawl_result_notification_delivery_retryable outbox_id=%s error_type=%s recipient=%s",
            record.id,
            exc.__class__.__name__,
            _masked_email(record.recipient_email),
        )
        raise RetryableCrawlNotificationError("Unexpected email delivery failure.") from exc

    _finish_delivery(
        outbox_id=record.id,
        claim_token=claim_token,
        status="sent",
        provider_id=provider_id,
    )
    logger.info(
        "crawl_result_notification_delivered outbox_id=%s provider_id=%s recipient=%s notification_type=%s",
        record.id,
        provider_id,
        _masked_email(record.recipient_email),
        record.notification_type,
    )
    return "sent"


def recover_pending_crawl_result_notifications() -> int:
    """Re-publish old pending records after broker/worker failures.

    Normal retries are handled by Dramatiq. This slower recovery path exists
    for the narrow case where an outbox row committed but its first publish or
    every worker retry was interrupted.
    """

    if not crawl_result_email_enabled():
        return 0
    grace_seconds = _env_int(
        "ARCLI_CRAWL_RESULT_EMAIL_RECOVERY_GRACE_SECONDS", 900, minimum=60
    )
    batch_size = _env_int(
        "ARCLI_CRAWL_RESULT_EMAIL_RECOVERY_BATCH_SIZE", 25, minimum=1)
    with _database_engine().begin() as conn:
        if not _outbox_schema_available(conn):
            return 0
        rows = conn.execute(
            text(
                """
                SELECT id::text
                  FROM public.crawl_notification_outbox
                 WHERE status = 'pending'
                   AND expires_at > NOW()
                   AND (
                       last_attempt_at IS NULL
                       OR last_attempt_at < NOW() - (:grace_seconds * interval '1 second')
                   )
                 ORDER BY created_at ASC
                 LIMIT :batch_size
                 FOR UPDATE SKIP LOCKED
                """
            ),
            {"grace_seconds": grace_seconds, "batch_size": batch_size},
        ).scalars().all()

    outbox_ids = [str(row) for row in rows]
    _publish_delivery_messages(outbox_ids)
    if outbox_ids:
        logger.info(
            "crawl_result_notification_recovery_enqueued recovered=%s",
            len(outbox_ids),
        )
    return len(outbox_ids)


__all__ = [
    "RetryableCrawlNotificationError",
    "crawl_result_email_enabled",
    "deliver_crawl_result_notification",
    "enqueue_discovery_completion_notifications",
    "enqueue_initial_crawl_completion_notifications",
    "enqueue_terminal_crawl_failure_notifications",
    "recover_pending_crawl_result_notifications",
]
