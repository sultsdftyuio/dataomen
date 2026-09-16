"""Server-side subscription checks for work that can create lead-discovery cost."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection


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
