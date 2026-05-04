import logging
from typing import Dict, Any, Optional
from api.database import get_db_connection

logger = logging.getLogger(__name__)

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
        target_date: str,
        segment_key: Optional[str] = None,
        segment_value: Optional[str] = None,
        limit: int = 100,
        last_seen_user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetches users affected by an anomaly using cursor-based (keyset) pagination.
        Guarantees O(1) pagination performance and strict tenant isolation.
        """
        query_params = {
            "tenant_id": tenant_id,
            "event_name": event_name,
            "target_date": target_date,
            "limit": limit
        }

        # 1. Base WHERE clause (Refactored for Sargability)
        where_clauses = [
            "tenant_id = %(tenant_id)s",
            "event_name = %(event_name)s",
            "timestamp >= %(target_date)s::date",
            "timestamp < %(target_date)s::date + INTERVAL '1 day'"
        ]

        # 2. Append Segment Filtering
        if segment_key and segment_value and segment_key != 'overall':
            where_clauses.append("properties->>%(segment_key)s = %(segment_value)s")
            query_params["segment_key"] = segment_key
            query_params["segment_value"] = segment_value

        # 3. Append Keyset Cursor
        if last_seen_user_id:
            where_clauses.append("user_id > %(last_seen_user_id)s")
            query_params["last_seen_user_id"] = last_seen_user_id

        where_sql = " AND ".join(where_clauses)

        query = f"""
            SELECT user_id, MAX(timestamp) as last_seen_at
            FROM events
            WHERE {where_sql}
            GROUP BY user_id
            ORDER BY user_id ASC
            LIMIT %(limit)s;
        """

        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, query_params)
                    
                    columns = [desc[0] for desc in cur.description] if cur.description else []
                    results = [dict(zip(columns, row)) for row in cur.fetchall()]

            # Safely determine next cursor
            has_more = len(results) == limit
            next_cursor = results[-1]["user_id"] if (has_more and results) else None

            logger.info(
                f"Drilldown executed for {event_name} on {target_date} "
                f"[Tenant: {tenant_id}] - Fetched {len(results)} users."
            )

            return {
                "tenant_id": tenant_id,
                "event_name": event_name,
                "target_date": target_date,
                "segment": {"key": segment_key, "value": segment_value},
                "users": results,
                "next_cursor": next_cursor,
                "has_more": has_more
            }

        except Exception as e:
            logger.error(f"User drilldown failed for tenant {tenant_id}: {str(e)}")
            raise