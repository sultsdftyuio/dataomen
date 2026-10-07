"""Server-side subscription checks for work that can create lead-discovery cost."""

from __future__ import annotations

import os
import time
from typing import Callable

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

# How long an active subscription keeps access after its recorded period end.
# A renewal is only recorded once the billing webhook is delivered, so a
# customer in good standing must not lose discovery the moment the old period
# lapses. A failed renewal moves the tenant to past_due and ends access at once.
ACTIVE_RENEWAL_GRACE_DAYS = 2


def paid_access_sql(tenant_alias: str) -> str:
    """SQL predicate for the paid-access rule on a ``public.tenants`` alias.

    The same rule is implemented in the web app as ``hasPaidAccess``
    (lib/entitlements.ts) and in the database as
    ``public.tenant_has_paid_access`` (scripts/enforce-free-plan-limits.sql);
    change all three together.

    - active: paid until the period end plus the renewal grace window, or
      indefinitely when no period end is recorded.
    - canceling / canceled: paid only until a recorded, still-future period end.
    - anything else (free, past_due, unknown): not paid.
    """

    status = f"LOWER(COALESCE({tenant_alias}.subscription_status, ''))"
    period_end = f"{tenant_alias}.current_period_end"
    return f"""
        LOWER(COALESCE({tenant_alias}.plan_tier, 'free')) IN ('pro', 'enterprise')
        AND (
            (
                {status} = 'active'
                AND (
                    {period_end} IS NULL
                    OR {period_end} + INTERVAL '{ACTIVE_RENEWAL_GRACE_DAYS} days' > NOW()
                )
            )
            OR (
                {status} IN ('canceling', 'canceled', 'cancelled')
                AND {period_end} IS NOT NULL
                AND {period_end} > NOW()
            )
        )
    """


def tenant_has_active_paid_access(conn: Connection, tenant_id: str) -> bool:
    """Return whether a tenant may use paid lead-discovery capacity.

    It intentionally evaluates entitlement at dispatch time so a downgrade
    stops scheduled work even when a job was accepted before the billing
    change was processed.
    """
    return bool(
        conn.execute(
            text(
                f"""
                SELECT EXISTS (
                    SELECT 1
                      FROM public.tenants AS tenant
                     WHERE tenant.tenant_id = :tenant_id
                       AND {paid_access_sql("tenant")}
                )
                """
            ),
            {"tenant_id": tenant_id},
        ).scalar_one()
    )


def free_first_scan_enabled() -> bool:
    """Dark-launched until the owner sets a budget and turns it on."""

    raw = os.getenv("ARCLI_FREE_FIRST_SCAN_ENABLED", "")
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def tenant_has_unused_free_first_scan(conn: Connection, tenant_id: str) -> bool:
    """Whether a Free tenant may still run its single first discovery scan.

    Free users see one real lead before paying, which is the strongest
    conversion signal we have. The allowance is consumed by the first
    *terminal* discovery run, so worker retries of an in-flight run still
    pass, while brief edits, website changes, and recrawls afterwards do not
    start a second free scan. Recrawls stay paid-only at their own gate.
    """

    if not free_first_scan_enabled():
        return False
    return not bool(
        conn.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                      FROM public.discovery_runs AS run
                     WHERE run.tenant_id = :tenant_id
                       AND run.status <> 'running'
                )
                """
            ),
            {"tenant_id": tenant_id},
        ).scalar_one()
    )


def tenant_may_run_lead_discovery(conn: Connection, tenant_id: str) -> bool:
    """Paid access, or a Free tenant's unused one-time first scan."""

    return tenant_has_active_paid_access(conn, tenant_id) or tenant_has_unused_free_first_scan(
        conn, tenant_id
    )


def read_lead_discovery_entitlement(
    engine: Engine,
    tenant_id: str,
    *,
    attempts: int = 3,
    backoff_seconds: float = 0.5,
    sleep: Callable[[float], None] = time.sleep,
) -> bool:
    """Read the discovery entitlement, retrying a transient database failure.

    Callers that fail closed on an unreadable entitlement cannot tell a Free
    workspace from a dropped connection. A short retry keeps one network blip
    from being recorded as "not entitled". The final failure still raises, so
    each caller keeps its own fail-closed or retry-the-job decision.
    """

    attempt = 1
    while True:
        try:
            with engine.begin() as conn:
                return tenant_may_run_lead_discovery(conn, tenant_id)
        except Exception:
            if attempt >= attempts:
                raise
            sleep(backoff_seconds * attempt)
            attempt += 1
