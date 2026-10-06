"""Bounded recovery for candidates the verifier could not evaluate.

A candidate that passes semantic matching but meets a provider outage, or is
left over when a rematch runs out of verification time, stays ``plausible`` in
the candidate pool.  Nothing re-queued it afterwards, so one bad minute at the
model provider silently cost a workspace every candidate in that batch.

This module schedules the existing profile rematch again after a delay.  The
rematch reuses cached verdicts, so a retry only pays for candidates that still
have no decision.  Budget and quota skips are deliberately not retried here:
their windows are hours or days long, and a short retry would only spend the
attempt allowance without changing the outcome.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Callable, Iterable

from api.services.cost_controls import TenantQuotaGuard, env_int

logger = logging.getLogger(__name__)

# Set by ``verify_candidate_safely`` when the provider call itself failed.
TRANSIENT_VERIFIER_SKIP_REASON = "verifier_evaluation_failed"
# The rematch stopped at its time budget with ranked candidates remaining.
VERIFICATION_DEADLINE_REASON = "verification_deadline_reached"

_DEFAULT_MAX_ATTEMPTS = 3
_DEFAULT_WINDOW_SECONDS = 6 * 60 * 60
_DEFAULT_BASE_DELAY_SECONDS = 5 * 60
# Each attempt waits three times longer than the last (5, 15, 45 minutes by
# default), which covers a typical provider incident without hot-looping.
_BACKOFF_FACTOR = 3

EnqueueRematch = Callable[..., Any]


def is_transient_verifier_skip(verification: Any) -> bool:
    """True when a later attempt could plausibly produce a real verdict."""

    if bool(getattr(verification, "verifier_executed", True)):
        return False
    reason = str(getattr(verification, "rejection_reason", "") or "")
    return reason == TRANSIENT_VERIFIER_SKIP_REASON


def verification_retry_enabled() -> bool:
    """On by default; a deployment can switch recovery off without a release."""

    return os.getenv("ARCLI_VERIFICATION_RETRY_ENABLED", "true").strip().casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _max_attempts() -> int:
    return min(10, env_int("ARCLI_VERIFICATION_RETRY_MAX_ATTEMPTS", _DEFAULT_MAX_ATTEMPTS))


def _window_seconds() -> int:
    return max(
        300,
        env_int("ARCLI_VERIFICATION_RETRY_WINDOW_SECONDS", _DEFAULT_WINDOW_SECONDS),
    )


def _base_delay_seconds() -> int:
    return max(
        30,
        env_int("ARCLI_VERIFICATION_RETRY_BASE_DELAY_SECONDS", _DEFAULT_BASE_DELAY_SECONDS),
    )


def retry_delay_seconds(attempt: int) -> int:
    """Delay before the given 1-based attempt."""

    return _base_delay_seconds() * (_BACKOFF_FACTOR ** max(0, attempt - 1))


def schedule_verification_retry(
    tenant_id: str | None,
    service_profile_id: str | None,
    *,
    reason: str,
    guard: TenantQuotaGuard | None = None,
    enqueue: EnqueueRematch | None = None,
) -> bool:
    """Queue one delayed rematch for a profile with unverified candidates.

    The shared counter does two jobs: concurrent batches hit by the same
    outage collapse into one retry ladder, and a persistent failure stops
    after the configured attempts instead of re-queueing itself forever.
    Recovery is best effort and must never fail the matching job that
    requested it.
    """

    normalized_tenant_id = (tenant_id or "").strip()
    normalized_profile_id = (service_profile_id or "").strip()
    if (
        not normalized_tenant_id
        or not normalized_profile_id
        or not verification_retry_enabled()
    ):
        return False
    max_attempts = _max_attempts()

    try:
        decision = (guard or TenantQuotaGuard()).check_and_increment(
            tenant_id=normalized_tenant_id,
            counter_name=f"verification-retry-{normalized_profile_id}",
            limit=max_attempts,
            window_seconds=_window_seconds(),
        )
        if not decision.allowed:
            logger.warning(
                "verification_retry_exhausted tenant_id=%s service_profile_id=%s reason=%s attempts=%s window_seconds=%s",
                normalized_tenant_id,
                normalized_profile_id,
                reason,
                max_attempts,
                decision.window_seconds,
            )
            return False

        delay_seconds = retry_delay_seconds(decision.current_count)
        if enqueue is None:
            from api.services.social.public_storage import (
                enqueue_existing_public_source_rematch,
            )

            enqueue = enqueue_existing_public_source_rematch
        enqueue(
            normalized_tenant_id,
            normalized_profile_id,
            delay_ms=delay_seconds * 1_000,
        )
    except Exception as exc:
        logger.warning(
            "verification_retry_schedule_failed tenant_id=%s service_profile_id=%s reason=%s error_type=%s",
            normalized_tenant_id,
            normalized_profile_id,
            reason,
            exc.__class__.__name__,
        )
        return False

    logger.info(
        "verification_retry_scheduled tenant_id=%s service_profile_id=%s reason=%s attempt=%s max_attempts=%s delay_seconds=%s",
        normalized_tenant_id,
        normalized_profile_id,
        reason,
        decision.current_count,
        max_attempts,
        delay_seconds,
    )
    return True


def schedule_verification_retries(
    profiles: Iterable[tuple[str, str]],
    *,
    reason: str,
) -> int:
    """Schedule one retry per distinct (tenant, profile) pair."""

    return sum(
        1
        for tenant_id, service_profile_id in sorted(set(profiles))
        if schedule_verification_retry(tenant_id, service_profile_id, reason=reason)
    )


__all__ = [
    "TRANSIENT_VERIFIER_SKIP_REASON",
    "VERIFICATION_DEADLINE_REASON",
    "is_transient_verifier_skip",
    "retry_delay_seconds",
    "schedule_verification_retries",
    "schedule_verification_retry",
    "verification_retry_enabled",
]
