"""Choose how far back a discovery run searches public sources.

A workspace's first run searches the full window. A scheduled refresh used to
search that same window again every 24-48 hours, paying the providers, the
embedding model and the verifier for posts the previous run already saw. When
the previous fully searched run covered every phrase in the current plan, only
the stretch since that run (plus an overlap) can hold anything new.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import text

from api.services.cost_controls import env_int

logger = logging.getLogger(__name__)

# Sources index posts late (search APIs lag, edited posts reappear), so the
# window reaches back past the previous run instead of starting exactly at it.
DEFAULT_OVERLAP_HOURS = 12


def _overlap_hours() -> int:
    return env_int("ARCLI_INCREMENTAL_SEARCH_OVERLAP_HOURS", DEFAULT_OVERLAP_HOURS)


def _phrase_key(phrase: str) -> str:
    return " ".join(phrase.split()).casefold()


def _plan_phrases(query_plan: object) -> set[str]:
    queries = query_plan.get("queries") if isinstance(query_plan, dict) else None
    if not isinstance(queries, list):
        return set()
    return {
        _phrase_key(item["phrase"])
        for item in queries
        if isinstance(item, dict) and isinstance(item.get("phrase"), str)
    }


def _last_fully_searched_run(tenant_id: str, service_profile_id: str):
    """Return the newest run whose every source search finished without failing.

    A run's status cannot answer this. The run monitor marks a run
    ``completed`` as soon as one signal is ready, possibly before every search
    has finished, and ``partial`` at its five-minute reporting deadline even
    when all searches succeeded and simply found nothing, which is most runs.
    The run's events record what actually happened: the search job writes one
    ``fast_check`` / ``completed`` event after every source has reported, and a
    ``search`` / ``failed`` event for each failed search. A run that completed
    itself without the monitor records its failure count in the summary.
    """

    from api.services.embeddings import _database_engine

    with _database_engine().begin() as conn:
        return conn.execute(
            text(
                """
                SELECT run.started_at, run.query_plan
                  FROM public.discovery_runs AS run
                 WHERE run.tenant_id = :tenant_id
                   AND run.service_profile_id = CAST(:service_profile_id AS uuid)
                   AND (
                       (
                           run.status = 'completed'
                           AND run.summary->>'source_failures' = '0'
                       )
                       OR (
                           EXISTS (
                               SELECT 1
                                 FROM public.discovery_run_events AS event
                                WHERE event.run_id = run.id
                                  AND event.tenant_id = run.tenant_id
                                  AND event.phase = 'fast_check'
                                  AND event.outcome = 'completed'
                           )
                           AND NOT EXISTS (
                               SELECT 1
                                 FROM public.discovery_run_events AS event
                                WHERE event.run_id = run.id
                                  AND event.tenant_id = run.tenant_id
                                  AND event.phase = 'search'
                                  AND event.outcome = 'failed'
                           )
                       )
                   )
                 ORDER BY run.started_at DESC
                 LIMIT 1
                """
            ),
            {"tenant_id": tenant_id, "service_profile_id": service_profile_id},
        ).mappings().first()


def incremental_lookback_hours(
    *,
    tenant_id: str,
    service_profile_id: str | None,
    query_phrases: Iterable[str],
    full_window_hours: int,
    now: datetime | None = None,
) -> int:
    """Return the hours to search: the full window, or just what is new.

    Falls back to the full window whenever it cannot prove the previous run
    covered this plan: no fully searched run, a phrase it did not search (a new
    competitor, an edited brief), unreadable telemetry, or a database error.
    Searching too much costs money; searching too little would silently miss
    posts, so every doubt resolves to the full window.
    """

    phrases = {_phrase_key(phrase) for phrase in query_phrases if phrase.strip()}
    if not service_profile_id or not phrases:
        return full_window_hours

    try:
        previous = _last_fully_searched_run(tenant_id, service_profile_id)
    except Exception as exc:
        logger.info(
            "incremental_search_window_skipped tenant_id=%s reason=%s error_type=%s",
            tenant_id,
            "previous_run_unavailable",
            exc.__class__.__name__,
        )
        return full_window_hours

    if previous is None or previous["started_at"] is None:
        return full_window_hours
    if not phrases <= _plan_phrases(previous["query_plan"]):
        logger.info(
            "incremental_search_window_skipped tenant_id=%s reason=%s",
            tenant_id,
            "query_plan_changed",
        )
        return full_window_hours

    started_at = previous["started_at"]
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    elapsed_hours = ((now or datetime.now(timezone.utc)) - started_at).total_seconds() / 3600
    hours = min(full_window_hours, max(1, math.ceil(elapsed_hours) + _overlap_hours()))
    logger.info(
        "incremental_search_window_selected tenant_id=%s lookback_hours=%s full_window_hours=%s",
        tenant_id,
        hours,
        full_window_hours,
    )
    return hours
