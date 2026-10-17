"""Self-healing checks the recrawl scheduler runs before claiming due work.

A schedule row is normally written when a crawl completes. Workspaces whose
last crawl predates the scheduler, or whose completion write failed, never get
one, so a paying workspace can go without automatic refreshes while every
scheduler tick reports a healthy ``dispatched=0``. These checks close that gap
and make stale billing visible instead of silently excluding a workspace.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.services.crawling import WebsiteCrawler
from api.services.tenant_entitlements import (
    ACTIVE_RENEWAL_GRACE_DAYS,
    paid_access_sql,
)

logger = logging.getLogger(__name__)

# Bounds one tick's work if many workspaces need a schedule at once; the rest
# are picked up on the following ticks.
_BACKFILL_BATCH_SIZE = 50

# Warn once per worker process per workspace rather than on every 5-minute tick.
_warned_stale_billing: set[str] = set()


def _tenant_settings_have_website_url(conn: Connection) -> bool:
    return bool(
        conn.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                      FROM information_schema.columns
                     WHERE table_schema = 'public'
                       AND table_name = 'tenant_settings'
                       AND column_name = 'website_url'
                )
                """
            )
        ).scalar()
    )


def backfill_missing_recrawl_schedules(conn: Connection, *, crawl_kind: str) -> int:
    """Create a due schedule for each paid workspace that has a website but none.

    Workspaces with any existing schedule row are left alone, including paused
    ones: a pause records a deliberate decision such as a changed website.
    """

    if not _tenant_settings_have_website_url(conn):
        return 0

    rows = conn.execute(
        text(
            f"""
            SELECT tenant.tenant_id::text AS tenant_id,
                   settings.website_url
              FROM public.tenants AS tenant
              INNER JOIN public.tenant_settings AS settings
                ON settings.tenant_id::text = tenant.tenant_id::text
             WHERE ({paid_access_sql('tenant')})
               AND NULLIF(BTRIM(settings.website_url), '') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                     FROM public.website_recrawl_schedules AS schedule
                    WHERE schedule.tenant_id = tenant.tenant_id::text
               )
             LIMIT :batch_size
            """
        ),
        {"batch_size": _BACKFILL_BATCH_SIZE},
    ).mappings().all()

    created = 0
    for row in rows:
        try:
            # The crawler keys schedules by this exact form; any other spelling
            # would later be treated as a stale website and paused.
            website_url = WebsiteCrawler._normalize_url(str(row["website_url"]))
        except ValueError:
            logger.warning(
                "website_recrawl_schedule_backfill_skipped tenant_id=%s reason=%s",
                row["tenant_id"],
                "invalid_website_url",
            )
            continue
        created += conn.execute(
            text(
                """
                INSERT INTO public.website_recrawl_schedules (
                    tenant_id, website_url, crawl_kind, status, next_crawl_at
                )
                VALUES (:tenant_id, :website_url, :crawl_kind, 'active', NOW())
                ON CONFLICT (tenant_id, website_url) DO NOTHING
                """
            ),
            {
                "tenant_id": row["tenant_id"],
                "website_url": website_url,
                "crawl_kind": crawl_kind,
            },
        ).rowcount

    if created:
        logger.info("website_recrawl_schedules_backfilled count=%s", created)
    return created


def warn_stale_paid_billing(conn: Connection) -> list[str]:
    """Log workspaces that look paid but whose billing period has run out.

    Such a workspace says "pro / active" everywhere a person looks, yet the
    paid-access rule excludes it from scheduled work. That usually means a
    missed billing webhook or a manually set plan, which only a person can
    resolve, so this surfaces it rather than guessing.
    """

    rows = conn.execute(
        text(
            """
            SELECT tenant_id::text AS tenant_id, current_period_end
              FROM public.tenants
             WHERE LOWER(COALESCE(plan_tier, 'free')) IN ('pro', 'enterprise')
               AND LOWER(COALESCE(subscription_status, '')) = 'active'
               AND current_period_end IS NOT NULL
               AND current_period_end
                   + (:grace_days * interval '1 day') <= NOW()
            """
        ),
        {"grace_days": ACTIVE_RENEWAL_GRACE_DAYS},
    ).mappings().all()

    newly_warned: list[str] = []
    for row in rows:
        tenant_id = str(row["tenant_id"])
        if tenant_id in _warned_stale_billing:
            continue
        _warned_stale_billing.add(tenant_id)
        newly_warned.append(tenant_id)
        logger.warning(
            "billing_period_stale tenant_id=%s current_period_end=%s reason=%s",
            tenant_id,
            row["current_period_end"],
            "active_plan_past_period_end_excluded_from_scheduled_work",
        )
    return newly_warned
