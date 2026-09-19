"""Tenant cost guard for public-conversation discovery.

The customer-facing product is intentionally not capped by a number of leads:
one useful conversation can take very different work to find.  Instead, this
module limits the operations that create variable cost.  It uses the existing
Redis-backed tenant quota guard, so simultaneous workers cannot each spend a
separate monthly budget.

The resulting decisions are also written to the discovery report when one is
available.  That gives operators a per-run audit trail without exposing an
internal credit balance to customers.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from api.services.cost_controls import TenantQuotaGuard, UsageDecision, env_int


DiscoveryUsageMetric = Literal[
    "source_request",
    "fresh_embedding_post",
    "verifier_call",
    "paid_source_request",
]

_DEFAULT_LIMITS: dict[DiscoveryUsageMetric, int] = {
    # These limits are deliberately expressed in work, not lead volume. They
    # are deployment settings and should be recalibrated from the per-run
    # telemetry after the first operating month.
    "source_request": 480,
    "fresh_embedding_post": 600,
    "verifier_call": 300,
    "paid_source_request": 20,
}
_WINDOW_SECONDS = 30 * 24 * 60 * 60


@dataclass(frozen=True)
class DiscoveryUsageClaim:
    metric: DiscoveryUsageMetric
    requested: int
    allowed: bool
    current: int
    limit: int
    reason: str | None = None


def discovery_usage_guard_enabled() -> bool:
    """Require an explicit deployment opt-in while the rollout is staged."""

    return os.getenv("ARCLI_DISCOVERY_USAGE_GUARD_ENABLED", "false").strip().casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _limit_for(metric: DiscoveryUsageMetric) -> int:
    name = f"ARCLI_PRO_MONTHLY_{metric.upper()}_LIMIT"
    return max(1, env_int(name, _DEFAULT_LIMITS[metric]))


def _window_seconds() -> int:
    return max(60, env_int("ARCLI_DISCOVERY_USAGE_WINDOW_SECONDS", _WINDOW_SECONDS))


def _counter_name(metric: DiscoveryUsageMetric) -> str:
    return f"pro-monthly-discovery-{metric}"


def claim_discovery_usage(
    tenant_id: str | None,
    metric: DiscoveryUsageMetric,
    *,
    amount: int = 1,
    discovery_run_id: str | None = None,
    guard: TenantQuotaGuard | None = None,
) -> DiscoveryUsageClaim:
    """Reserve bounded variable-cost work and record a safe run diagnostic."""

    requested = max(1, int(amount))
    limit = _limit_for(metric)
    if not tenant_id or not tenant_id.strip() or not discovery_usage_guard_enabled():
        return DiscoveryUsageClaim(metric, requested, True, 0, limit)

    decision: UsageDecision = (guard or TenantQuotaGuard()).check_and_increment(
        tenant_id=tenant_id,
        counter_name=_counter_name(metric),
        limit=limit,
        window_seconds=_window_seconds(),
        amount=requested,
    )
    claim = DiscoveryUsageClaim(
        metric=metric,
        requested=requested,
        allowed=decision.allowed,
        current=decision.current_count,
        limit=decision.limit,
        reason=None if decision.allowed else "monthly_cost_budget_reached",
    )
    _record_claim(discovery_run_id, tenant_id, claim)
    return claim


def _record_claim(
    discovery_run_id: str | None,
    tenant_id: str,
    claim: DiscoveryUsageClaim,
) -> None:
    if not discovery_run_id:
        return
    try:
        from api.services.social.discovery_telemetry import record_discovery_event

        record_discovery_event(
            discovery_run_id,
            tenant_id,
            "cost_control",
            claim.metric,
            claim.metric,
            "budget",
            "accepted" if claim.allowed else "limited",
            {
                "requested": claim.requested,
                "current": claim.current,
                "limit": claim.limit,
                "window_seconds": _window_seconds(),
                "reason": claim.reason,
            },
        )
    except Exception:
        # Cost limiting cannot become dependent on optional report telemetry.
        return


__all__ = [
    "DiscoveryUsageClaim",
    "DiscoveryUsageMetric",
    "claim_discovery_usage",
    "discovery_usage_guard_enabled",
]
