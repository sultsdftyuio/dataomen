"""Bounded completion control for an initial public-discovery run."""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import text

from api.services.embeddings import _database_engine


@dataclass(frozen=True)
class InitialDiscoveryRunLimits:
    """User-facing bounds for an asynchronous activation discovery run."""

    target_ready_for_review: int
    minimum_seconds: int
    maximum_seconds: int
    poll_seconds: int
    rematch_after_seconds: int = 120


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def initial_discovery_run_limits() -> InitialDiscoveryRunLimits:
    """Return a fast-preview window and a bounded background completion window.

    A public search cannot honestly promise a number of buyer conversations.
    One verified signal is enough to make the first result visible after a
    minute; otherwise discovery continues in the background for up to five.
    """

    minimum_seconds = max(
        60,
        _int_env("ARCLI_INITIAL_PUBLIC_DISCOVERY_MIN_SECONDS", 60),
    )
    maximum_seconds = min(
        300,
        max(
            minimum_seconds,
            _int_env("ARCLI_INITIAL_PUBLIC_DISCOVERY_MAX_SECONDS", 300),
        ),
    )
    return InitialDiscoveryRunLimits(
        target_ready_for_review=max(
            1,
            _int_env("ARCLI_INITIAL_PUBLIC_DISCOVERY_TARGET_READY", 1),
        ),
        minimum_seconds=minimum_seconds,
        maximum_seconds=maximum_seconds,
        rematch_after_seconds=min(
            maximum_seconds,
            max(
                minimum_seconds,
                _int_env(
                    "ARCLI_INITIAL_PUBLIC_REMATCH_AFTER_SECONDS",
                    120,
                ),
            ),
        ),
        poll_seconds=max(
            5,
            min(
                30,
                _int_env("ARCLI_INITIAL_PUBLIC_DISCOVERY_POLL_SECONDS", 15),
            ),
        ),
    )


def elapsed_run_seconds(started_at: str, *, now: datetime | None = None) -> float:
    """Return elapsed wall-clock seconds for a delayed worker message."""

    parsed = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    current = now or datetime.now(timezone.utc)
    return max(0.0, (current - parsed).total_seconds())


def next_monitor_delay_seconds(
    *,
    elapsed_seconds: float,
    limits: InitialDiscoveryRunLimits,
) -> int | None:
    """Return the next bounded poll interval, or ``None`` at the deadline."""

    if elapsed_seconds >= limits.maximum_seconds:
        return None
    boundaries = [limits.maximum_seconds]
    if elapsed_seconds < limits.minimum_seconds:
        boundaries.append(limits.minimum_seconds)
    if elapsed_seconds < limits.rematch_after_seconds:
        boundaries.append(limits.rematch_after_seconds)
    boundary = min(boundaries)
    remaining = max(1.0, boundary - elapsed_seconds)
    return max(1, min(limits.poll_seconds, math.ceil(remaining)))


def ready_for_review_count_since(
    tenant_id: str,
    service_profile_id: str,
    started_at: str,
) -> int:
    """Count new user-visible finds created during this activation run."""

    with _database_engine().begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT COUNT(*)
                  FROM public.lead_matches
                 WHERE tenant_id = :tenant_id
                   AND service_profile_id::TEXT = :service_profile_id
                   AND match_status = 'ready_for_review'
                   AND created_at >= CAST(:started_at AS timestamptz)
                """
            ),
            {
                "tenant_id": tenant_id,
                "service_profile_id": service_profile_id,
                "started_at": started_at,
            },
        )
        return int(result.scalar_one() or 0)
