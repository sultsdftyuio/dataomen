"""Server-side subscription checks for work that can create lead-discovery cost."""

from __future__ import annotations

import os
import time
from typing import Callable

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine


def tenant_has_active_paid_access(conn: Connection, tenant_id: str) -> bool:
    """Return whether a tenant may use paid lead-discovery capacity.

    This mirrors the database lead-access policy. It intentionally evaluates
    entitlement at dispatch time so a downgrade stops scheduled work even when
    a job was accepted before the billing change was processed.
    """
    return bool(
        conn.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                      FROM public.tenants AS tenant
                     WHERE tenant.tenant_id = :tenant_id
                       AND LOWER(COALESCE(tenant.plan_tier, 'free'))
                           IN ('pro', 'enterprise')
                       AND LOWER(COALESCE(tenant.subscription_status, ''))
                           IN ('active', 'canceling')
                       AND (
                           LOWER(COALESCE(tenant.subscription_status, ''))
                               <> 'canceling'
                           OR tenant.current_period_end IS NULL
                           OR tenant.current_period_end >= NOW()
                       )
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
