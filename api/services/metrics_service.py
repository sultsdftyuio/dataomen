"""
metrics_service.py — ARCLI v3.3-aligned MetricsService.

What this file preserves from the old service
----------------------------------------------
  ✅  Derived product KPIs (active_users, visitors, signups, logins,
      revenue, conversion_rate) via materialize_product_metrics().
  ✅  Zero-fill guard — every metric in EXPECTED_METRICS always has a
      MetricValueDaily row, preventing anomaly-detector false positives
      and dashboard time-series gaps.
  ✅  Date-string parsing moved into a reusable parse_target_date() helper
      so API route handlers can validate input without importing datetime.

What this file replaces / improves
-----------------------------------
  ✅  PostgreSQL-native upsert (INSERT … ON CONFLICT DO UPDATE) replaces
      the old manual query-then-branch pattern.
  ✅  Models updated to MetricValueDaily (v3.3 schema); old MetricValue
      is gone.
  ✅  Monolithic aggregate_daily_metrics() split into focused methods:
        _aggregate_raw_events()          — raw event → metric rows
        materialize_product_metrics()    — derived KPI writes
        _zero_fill_expected_metrics()    — gap prevention
        upsert_daily_value()             — idempotent core write
        get_daily_metric()               — single-day fetch
        get_metric_latest()              — most-recent-value fetch
        fetch_metric_history()           — rolling-window history
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import distinct, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from api.models import Event, MetricValueDaily

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Every metric listed here will always have a MetricValueDaily row written
#: for each aggregation run, even when the underlying event count is zero.
#: This prevents time-series gaps that would trip the anomaly detector.
EXPECTED_METRICS: frozenset[str] = frozenset(
    {
        "active_users",
        "conversion_rate",
        "logins",
        "revenue",
        "signups",
        "visitors",
    }
)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def parse_target_date(date_str: Optional[str]) -> date:
    """Parse an ISO-8601 date string into a :class:`datetime.date`.

    Falls back to today (UTC) when *date_str* is ``None``.

    Args:
        date_str: A ``"YYYY-MM-DD"`` string, or ``None``.

    Returns:
        The parsed :class:`~datetime.date`.

    Raises:
        ValueError: If *date_str* is not in ``YYYY-MM-DD`` format.
    """
    if date_str is None:
        return datetime.now(timezone.utc).date()
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(
            f"Invalid date '{date_str}' — expected YYYY-MM-DD format."
        ) from exc


def _day_window(target_date: date) -> tuple[datetime, datetime]:
    """Return a timezone-aware ``[start, end)`` pair for one UTC calendar day.

    Args:
        target_date: The calendar day to build a window for.

    Returns:
        A ``(start, end)`` tuple of UTC-aware datetimes suitable for
        half-open interval filtering (``>= start, < end``).
    """
    start = datetime.combine(target_date, datetime.min.time()).replace(
        tzinfo=timezone.utc
    )
    return start, start + timedelta(days=1)


# ===========================================================================
# MetricsService
# ===========================================================================


class MetricsService:
    """Metrics engine for the ARCLI v3.3 schema.

    Responsibilities
    ----------------
    1.  Aggregate raw :class:`Event` rows into per-``event_name`` totals and
        write them to :class:`MetricValueDaily`.
    2.  Derive product KPIs (``conversion_rate``, ``active_users``, etc.)
        from the same event window and materialise them into
        :class:`MetricValueDaily`.
    3.  Zero-fill :data:`EXPECTED_METRICS` so the anomaly detector never
        sees missing time-series points.
    4.  Expose clean fetch helpers for current and historical metric values.

    All writes go through :meth:`upsert_daily_value`, which uses a
    PostgreSQL-native ``INSERT … ON CONFLICT DO UPDATE`` — safe for backfills
    and concurrent workers.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def _require_tenant_id(self, tenant_id: str) -> None:
        if not tenant_id:
            raise ValueError("tenant_id is required.")

    # -----------------------------------------------------------------------
    # Public orchestration
    # -----------------------------------------------------------------------

    def aggregate_daily_metrics(
        self,
        tenant_id: str,
        target_date_str: Optional[str] = None,
    ) -> Dict[str, object]:
        """Run the full daily aggregation pipeline and commit the results.

        Pipeline stages
        ---------------
        1.  Parse and validate *target_date_str*.
        2.  Aggregate raw events → :class:`MetricValueDaily` (one row per
            ``event_name``).
        3.  Materialise derived product KPIs → :class:`MetricValueDaily`.
        4.  Zero-fill :data:`EXPECTED_METRICS` for gap-free time series.
        5.  Commit and return a status summary dict.

        Args:
            tenant_id:        Tenant identifier (required).
            target_date_str:  ISO-8601 date (``"YYYY-MM-DD"``).  Defaults to
                              today UTC when omitted.

        Returns:
            A dict with keys ``status``, ``tenant_id``, ``date``, and
            ``processed_metrics``.

        Raises:
            ValueError: If *tenant_id* is falsy or *target_date_str* is not
                        in ``YYYY-MM-DD`` format.
        """
        self._require_tenant_id(tenant_id)

        target_date = parse_target_date(target_date_str)

        logger.info(
            "aggregation_started",
            extra={"tenant_id": tenant_id, "date": target_date.isoformat()},
        )

        try:
            raw_event_types = self._aggregate_raw_events(tenant_id, target_date)
            self.materialize_product_metrics(tenant_id, target_date)
            self._zero_fill_expected_metrics(tenant_id, target_date)
            self.db.commit()

        except Exception:
            self.db.rollback()
            logger.exception(
                "aggregation_failed",
                extra={"tenant_id": tenant_id, "date": target_date.isoformat()},
            )
            raise

        processed = (
            self.db.query(func.count(MetricValueDaily.id))
            .filter(
                MetricValueDaily.tenant_id == tenant_id,
                MetricValueDaily.date == target_date,
            )
            .scalar()
            or 0
        )

        logger.info(
            "aggregation_completed",
            extra={
                "tenant_id": tenant_id,
                "date": target_date.isoformat(),
                "processed_metrics": processed,
                "raw_event_types": raw_event_types,
            },
        )

        return {
            "status": "success",
            "tenant_id": tenant_id,
            "date": target_date.isoformat(),
            "processed_metrics": processed,
        }

    # -----------------------------------------------------------------------
    # Stage 1 — Raw event aggregation
    # -----------------------------------------------------------------------

    def _aggregate_raw_events(
        self,
        tenant_id: str,
        target_date: date,
    ) -> int:
        """Group events by ``event_name`` and upsert one metric row each.

        Aggregation strategy
        --------------------
        - If the event carries a non-zero monetary ``value`` → store the
          **sum** (e.g. ``revenue``, ``order_value``).
        - Otherwise → store the **occurrence count** (e.g. ``login``,
          ``signup``, ``page_view``).

        This mirrors the old service's sensible heuristic while keeping the
        write path clean and schema-aligned.

        Args:
            tenant_id:    Tenant to aggregate for.
            target_date:  Calendar day to aggregate.

        Returns:
            Number of distinct ``event_name`` values processed.
        """
        self._require_tenant_id(tenant_id)
        start, end = _day_window(target_date)

        rows = (
            self.db.query(
                Event.event_name,
                func.coalesce(func.sum(Event.value), 0.0).label("value_sum"),
                func.count(Event.id).label("event_count"),
            )
            .filter(
                Event.tenant_id == tenant_id,
                Event.timestamp >= start,
                Event.timestamp < end,
            )
            .group_by(Event.event_name)
            .all()
        )

        for event_name, value_sum, event_count in rows:
            metric_value = (
                float(value_sum) if float(value_sum) != 0 else float(event_count)
            )
            self.upsert_daily_value(tenant_id, event_name, target_date, metric_value)

        return len(rows)

    # -----------------------------------------------------------------------
    # Stage 2 — Derived product KPI materialisation (salvaged from old service)
    # -----------------------------------------------------------------------

    def materialize_product_metrics(
        self,
        tenant_id: str,
        target_date: date,
    ) -> Dict[str, float]:
        """Compute derived product KPIs and write them to :class:`MetricValueDaily`.

        This method is the direct successor to the old service's embedded KPI
        block, extracted into its own method so it can be called independently
        (e.g. for targeted KPI re-runs without a full re-aggregation).

        KPIs computed
        -------------
        ``active_users``    — distinct ``user_id`` values across all events.
        ``visitors``        — distinct ``user_id`` values on ``"pageview"`` events.
        ``signups``         — count of ``"signup"`` events.
        ``logins``          — count of ``"login"`` events.
        ``revenue``         — sum of ``Event.value`` for ``"revenue"`` events.
        ``conversion_rate`` — ``signups / visitors`` (``0.0`` when visitors == 0).

        Args:
            tenant_id:    Tenant to compute KPIs for.
            target_date:  Calendar day.

        Returns:
            Dict of ``metric_name → value`` for observability and unit testing.
        """
        self._require_tenant_id(tenant_id)
        start, end = _day_window(target_date)

        def _count_events(event_name: str) -> float:
            return float(
                self.db.query(func.count(Event.id))
                .filter(
                    Event.tenant_id == tenant_id,
                    Event.timestamp >= start,
                    Event.timestamp < end,
                    Event.event_name == event_name,
                )
                .scalar()
                or 0
            )

        def _sum_event_values(event_name: str) -> float:
            return float(
                self.db.query(func.coalesce(func.sum(Event.value), 0.0))
                .filter(
                    Event.tenant_id == tenant_id,
                    Event.timestamp >= start,
                    Event.timestamp < end,
                    Event.event_name == event_name,
                )
                .scalar()
                or 0.0
            )

        def _distinct_users(event_name: Optional[str] = None) -> float:
            q = self.db.query(func.count(distinct(Event.user_id))).filter(
                Event.tenant_id == tenant_id,
                Event.timestamp >= start,
                Event.timestamp < end,
            )
            if event_name:
                q = q.filter(Event.event_name == event_name)
            return float(q.scalar() or 0)

        signups = _count_events("signup")
        logins = _count_events("login")
        revenue = _sum_event_values("revenue")
        visitors = _distinct_users("pageview")
        active_users = _distinct_users()
        conversion_rate = (signups / visitors) if visitors > 0 else 0.0

        kpis: Dict[str, float] = {
            "active_users": active_users,
            "conversion_rate": conversion_rate,
            "logins": logins,
            "revenue": revenue,
            "signups": signups,
            "visitors": visitors,
        }

        for metric_name, value in kpis.items():
            self.upsert_daily_value(tenant_id, metric_name, target_date, value)

        logger.debug(
            "product_kpis_materialized",
            extra={"tenant_id": tenant_id, "date": target_date.isoformat(), **kpis},
        )

        return kpis

    # -----------------------------------------------------------------------
    # Stage 3 — Zero-fill (salvaged from old service)
    # -----------------------------------------------------------------------

    def _zero_fill_expected_metrics(
        self,
        tenant_id: str,
        target_date: date,
    ) -> None:
        """Ensure every metric in :data:`EXPECTED_METRICS` has a row for *target_date*.

        Without zero-fill, a day with no signups would simply have no
        ``signups`` row — which the anomaly detector interprets as a missing
        point and can raise a false alert.  Writing an explicit ``0.0`` makes
        the absence of activity unambiguously intentional.

        Args:
            tenant_id:    Tenant to zero-fill for.
            target_date:  Calendar day that must be gap-free.
        """
        self._require_tenant_id(tenant_id)
        existing = {
            row.metric_name
            for row in self.db.query(MetricValueDaily.metric_name).filter(
                MetricValueDaily.tenant_id == tenant_id,
                MetricValueDaily.date == target_date,
                MetricValueDaily.metric_name.in_(EXPECTED_METRICS),
            )
        }

        for metric_name in EXPECTED_METRICS - existing:
            self.upsert_daily_value(tenant_id, metric_name, target_date, 0.0)
            logger.debug(
                "zero_filled",
                extra={
                    "tenant_id": tenant_id,
                    "metric_name": metric_name,
                    "date": target_date.isoformat(),
                },
            )

    # -----------------------------------------------------------------------
    # Idempotent upsert (replaces old manual query-then-branch logic)
    # -----------------------------------------------------------------------

    def upsert_daily_value(
        self,
        tenant_id: str,
        metric_name: str,
        target_date: date,
        value: float,
    ) -> None:
        """Idempotently write one :class:`MetricValueDaily` row.

        Uses PostgreSQL's ``INSERT … ON CONFLICT DO UPDATE`` against the
        ``(tenant_id, metric_name, date)`` unique constraint defined in
        the v3.3 schema.  Calling this multiple times with the same key is
        safe — the last ``value`` wins, which is correct for backfills and
        idempotent retries.

        This method does **not** commit; the caller owns the transaction.

        Args:
            tenant_id:    Tenant the metric belongs to.
            metric_name:  Logical name of the metric (e.g. ``"revenue"``).
            target_date:  Calendar day the value is for.
            value:        The metric value to store.
        """
        self._require_tenant_id(tenant_id)
        now = datetime.now(timezone.utc)
        stmt = (
            pg_insert(MetricValueDaily)
            .values(
                tenant_id=tenant_id,
                metric_name=metric_name,
                date=target_date,
                value=value,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_update(
                index_elements=["tenant_id", "metric_name", "date"],
                set_={"value": value, "updated_at": now},
            )
        )
        self.db.execute(stmt)
        self.db.flush()

    # -----------------------------------------------------------------------
    # Fetch helpers
    # -----------------------------------------------------------------------

    def get_daily_metric(
        self,
        tenant_id: str,
        metric_name: str,
        target_date: Optional[date] = None,
    ) -> float:
        """Return the stored value for one metric on a specific date.

        Args:
            tenant_id:    Tenant to query.
            metric_name:  Logical name of the metric.
            target_date:  Calendar day (defaults to today UTC).

        Returns:
            The stored value, or ``0.0`` if no row exists.
        """
        self._require_tenant_id(tenant_id)
        target_date = target_date or datetime.now(timezone.utc).date()
        record = (
            self.db.query(MetricValueDaily.value)
            .filter(
                MetricValueDaily.tenant_id == tenant_id,
                MetricValueDaily.metric_name == metric_name,
                MetricValueDaily.date == target_date,
            )
            .first()
        )
        return float(record[0]) if record else 0.0

    def get_metric_latest(
        self,
        tenant_id: str,
        metric_name: str,
    ) -> float:
        """Return the most recently stored value for a metric across all dates.

        Useful for dashboard "current value" cards when the exact date is
        unknown or when today's aggregation has not yet run.

        Args:
            tenant_id:    Tenant to query.
            metric_name:  Logical name of the metric.

        Returns:
            The most recent value, or ``0.0`` if no row exists.
        """
        self._require_tenant_id(tenant_id)
        record = (
            self.db.query(MetricValueDaily.value)
            .filter(
                MetricValueDaily.tenant_id == tenant_id,
                MetricValueDaily.metric_name == metric_name,
            )
            .order_by(MetricValueDaily.date.desc())
            .first()
        )
        return float(record[0]) if record else 0.0

    def fetch_metric_history(
        self,
        tenant_id: str,
        metric_name: str,
        days: int = 7,
    ) -> List[float]:
        """Return up to *days* daily values in chronological (oldest-first) order.

        Only includes dates **before today**, so partial-day aggregation
        artefacts never pollute a rolling-window baseline.

        Args:
            tenant_id:    Tenant to query.
            metric_name:  Logical name of the metric.
            days:         Maximum number of historical days to return.

        Returns:
            A list of floats in ascending date order.  May be shorter than
            *days* if fewer rows exist.
        """
        self._require_tenant_id(tenant_id)
        if days < 1:
            raise ValueError("days must be >= 1.")
        today = datetime.now(timezone.utc).date()
        records = (
            self.db.query(MetricValueDaily.value)
            .filter(
                MetricValueDaily.tenant_id == tenant_id,
                MetricValueDaily.metric_name == metric_name,
                MetricValueDaily.date < today,
            )
            .order_by(MetricValueDaily.date.desc())
            .limit(days)
            .all()
        )
        # Reverse DESC results to return chronological (oldest → newest) order.
        return [float(r[0]) for r in reversed(records)]