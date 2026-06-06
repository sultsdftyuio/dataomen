import logging
from typing import Dict, Any, Optional
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import text

from api.database import engine

logger = logging.getLogger(__name__)

# ── Production Guardrails ──────────────────────────────────────────────
MAX_LIMIT = 500
ALLOWED_SEGMENTS = {"country", "device", "browser", "plan"}
STATEMENT_TIMEOUT_MS = 10_000  # 10 seconds

# ── Recommended Indexes (apply via migration) ─────────────────────────
# CREATE INDEX idx_events_drilldown
# ON events (tenant_id, event_name, timestamp, user_id);
#
# CREATE INDEX idx_events_country
# ON events ((properties->>'country'));
# -- or for generic JSON access:
# CREATE INDEX idx_events_props_gin
# ON events USING gin(properties);


class UserDrilldownService:
    """
    Handles granular, user-level extractions for anomaly investigation.
    Strictly paginated to prevent memory exhaustion and DB locks.
    """

    @classmethod
    def get_affected_users_paginated(
        cls,
        tenant_id: str,
        event_name: str,
        target_date: date,
        segment_key: Optional[str] = None,
        segment_value: Optional[str] = None,
        limit: int = 100,
        last_seen_user_id: Optional[str] = None,
        last_seen_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Fetches users affected by an anomaly using composite cursor-based
        (keyset) pagination. Guarantees O(1) pagination performance and
        strict tenant isolation.

        SECURITY NOTE:
            tenant_id MUST be sourced from authenticated request context.
            Never accept tenant_id from user-controlled query parameters.
        """
        # ── 1. Input Validation ──────────────────────────────────────────
        if not isinstance(target_date, date):
            raise HTTPException(
                status_code=400,
                detail="target_date must be a valid ISO date (YYYY-MM-DD)"
            )

        # Enforce hard limit cap to prevent huge result sets / memory exhaustion
        limit = min(max(limit, 1), MAX_LIMIT)
        limit_plus_one = limit + 1

        # Composite cursor requires both components or neither
        has_cursor = last_seen_user_id is not None or last_seen_at is not None
        if has_cursor and (last_seen_user_id is None or last_seen_at is None):
            raise HTTPException(
                status_code=400,
                detail="Pagination cursor requires both last_seen_user_id and last_seen_at"
            )

        # ── 2. Query Parameter Binding ─────────────────────────────────
        params: Dict[str, Any] = {
            "tenant_id": tenant_id,
            "event_name": event_name,
            "target_date": target_date,
            "limit": limit_plus_one,
        }

        where_clauses = [
            "tenant_id = :tenant_id",
            "event_name = :event_name",
            "timestamp >= :target_date",
            "timestamp < (:target_date + INTERVAL '1 day')",
        ]

        # ── 3. Segment Filtering (allowlist + safe literal injection) ──
        if segment_key and segment_value and segment_key != "overall":
            if segment_key not in ALLOWED_SEGMENTS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid segment key '{segment_key}'. "
                        f"Allowed: {', '.join(sorted(ALLOWED_SEGMENTS))}"
                )
            # segment_key is validated against the allowlist, so safe to inline.
            # segment_value remains parameterized.
            where_clauses.append(f"properties->>'{segment_key}' = :segment_value")
            params["segment_value"] = segment_value

        where_sql = " AND ".join(where_clauses)

        # ── 4. Composite Keyset Cursor ─────────────────────────────────
        cursor_sql = ""
        if last_seen_user_id and last_seen_at:
            cursor_sql = (
                "WHERE (last_seen_at, user_id) > "
                "(:cursor_last_seen_at, :cursor_last_seen_user_id)"
            )
            params["cursor_last_seen_at"] = last_seen_at
            params["cursor_last_seen_user_id"] = last_seen_user_id

        # ── 5. Assemble Query ──────────────────────────────────────────
        # Uses a CTE so the aggregate can be referenced in the outer WHERE.
        query = f"""
            WITH grouped_events AS (
                SELECT
                    user_id,
                    MAX(timestamp) AS last_seen_at
                FROM events
                WHERE {where_sql}
                GROUP BY user_id
            )
            SELECT user_id, last_seen_at
            FROM grouped_events
            {cursor_sql}
            ORDER BY last_seen_at, user_id
            LIMIT :limit;
        """

        # ── 6. Execution with Statement Timeout & Safe Connection Mgmt ─
        try:
            # engine.begin() natively checks out a pool connection and manages the transaction
            with engine.begin() as conn:
                # Abort runaway queries early (transaction-scoped)
                conn.execute(
                    text(f"SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT_MS}ms'")
                )
                
                # Execute using safe SQLAlchemy text() parameterized bindings
                result = conn.execute(text(query), params)
                rows = result.mappings().all()

        except HTTPException:
            raise
        except Exception as exc:
            logger.error(
                "drilldown_failed tenant_id=%s event_name=%s target_date=%s error=%s",
                tenant_id,
                event_name,
                target_date,
                str(exc),
                exc_info=True,
            )
            # Surface a generic error to API consumers; log specifics internally.
            raise HTTPException(
                status_code=500,
                detail="Failed to retrieve drilldown data"
            )

        # ── 7. Standard LIMIT+1 Pagination Pattern ─────────────────────
        has_more = len(rows) > limit
        page_rows = rows[:limit]

        next_cursor = None
        next_last_seen_at = None
        if has_more and page_rows:
            next_cursor = page_rows[-1]["user_id"]
            next_last_seen_at = page_rows[-1]["last_seen_at"]

        logger.info(
            "drilldown_executed tenant_id=%s event_name=%s target_date=%s "
            "fetched_count=%s has_more=%s",
            tenant_id,
            event_name,
            target_date,
            len(page_rows),
            has_more,
        )

        return {
            "tenant_id": tenant_id,
            "event_name": event_name,
            "target_date": target_date.isoformat(),
            "segment": {"key": segment_key, "value": segment_value},
            "users": [dict(r) for r in page_rows],
            "next_cursor": next_cursor,
            "next_last_seen_at": next_last_seen_at,
            "has_more": has_more,
        }