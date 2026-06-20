"""
ARCLI.TECH — Stripe Connector: Schema Mappers & Semantic Views

Contains all record-mapping functions, the stream registry, the static schema
dictionary returned by fetch_schema(), and the semantic SQL views used for
analytics queries.  This module depends only on stripe_types (for the epoch
helper) and has no side-effects on import.
"""

from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Tuple


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_epoch() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp())


# ---------------------------------------------------------------------------
# Entity mappers — raw Stripe JSON → normalised Dict
# ---------------------------------------------------------------------------

def _map_charge(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": raw.get("id"),
        "created": raw.get("created", 0),
        "amount": int(raw.get("amount") or 0),
        "amount_refunded": int(raw.get("amount_refunded") or 0),
        "currency": raw.get("currency") or "unknown",
        "customer": raw.get("customer") if isinstance(raw.get("customer"), str) else None,
        "status": raw.get("status"),
        "paid": raw.get("paid", False),
        "receipt_email": raw.get("receipt_email"),
        # FIX #10: synced_at for idempotency tracking.
        "_synced_at": _now_epoch(),
    }


def _map_subscription(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    FIX #9: Stripe expansion (?expand[]=data.items.data.price) means the price
    object is already fully hydrated — no fallback chain required.
    """
    items_data = raw.get("items", {}).get("data", [])
    price_obj = items_data[0].get("price", {}) if items_data else {}
    # Retain plan fallback for tenants on legacy plans.
    plan_obj = items_data[0].get("plan", {}) if items_data else {}
    legacy_plan = raw.get("plan", {})
    resolved = price_obj or plan_obj or legacy_plan
    amount = resolved.get("amount")
    interval = resolved.get("interval", "month")

    return {
        "id": raw.get("id"),
        "created": raw.get("created", 0),
        # FIX #10: Track last mutation time for subscriptions (mutable object).
        "updated_ts": int(raw.get("updated") or raw.get("created") or 0),
        "customer": raw.get("customer") if isinstance(raw.get("customer"), str) else None,
        "status": raw.get("status"),
        "current_period_start": raw.get("current_period_start", 0),
        "current_period_end": raw.get("current_period_end", 0),
        "plan_amount": int(amount or 0),
        "plan_interval": interval,
        "_synced_at": _now_epoch(),
    }


def _map_customer(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": raw.get("id"),
        "created": raw.get("created", 0),
        # FIX #10: customers are mutable (email / name / phone can change).
        "updated_ts": int(raw.get("updated") or raw.get("created") or 0),
        "email": raw.get("email"),
        "name": raw.get("name"),
        "phone": raw.get("phone"),
        "_synced_at": _now_epoch(),
    }


def _map_invoice(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": raw.get("id"),
        "created": raw.get("created", 0),
        # FIX #10: invoices transition through multiple statuses.
        "updated_ts": int(raw.get("updated") or raw.get("created") or 0),
        "customer": raw.get("customer") if isinstance(raw.get("customer"), str) else None,
        "subscription": raw.get("subscription"),
        "status": raw.get("status"),
        "amount_due": int(raw.get("amount_due") or 0),
        "amount_paid": int(raw.get("amount_paid") or 0),
        "currency": raw.get("currency") or "unknown",
        "period_start": raw.get("period_start", 0),
        "period_end": raw.get("period_end", 0),
        "_synced_at": _now_epoch(),
    }


def _map_dispute(raw: Dict[str, Any]) -> Dict[str, Any]:
    charge_id = raw.get("charge")
    if isinstance(charge_id, dict):
        charge_id = charge_id.get("id")
    return {
        "id": raw.get("id"),
        "created": raw.get("created", 0),
        "charge": charge_id,
        "amount": int(raw.get("amount") or 0),
        "currency": raw.get("currency") or "unknown",
        "reason": raw.get("reason"),
        "status": raw.get("status"),
        "_synced_at": _now_epoch(),
    }


def _map_event(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Map Stripe event for CDC processing."""
    data_obj = raw.get("data", {}).get("object", {})
    return {
        "id": raw.get("id"),
        "created": raw.get("created", 0),
        "type": raw.get("type"),
        "api_version": raw.get("api_version"),
        "object_id": data_obj.get("id"),
        "object_type": data_obj.get("object"),
        "_event_data": raw,
        "_synced_at": _now_epoch(),
    }


# ---------------------------------------------------------------------------
# Stream registry: stream_name → (mapper_fn, pii_fields, expand_params)
# ---------------------------------------------------------------------------

# FIX #9: expand_params injected per stream to reduce API round-trips.
_STREAM_MAPPERS: Dict[str, Tuple[Callable, List[str], str]] = {
    "charges":       (_map_charge,       ["receipt_email"],          ""),
    "subscriptions": (_map_subscription, [],                         "expand[]=data.items.data.price"),
    "customers":     (_map_customer,     ["email", "phone", "name"], ""),
    "invoices":      (_map_invoice,      [],                         ""),
    "disputes":      (_map_dispute,      [],                         ""),
    "events":        (_map_event,        [],                         ""),
}


# ---------------------------------------------------------------------------
# Static schema (returned by StripeConnector.fetch_schema)
# ---------------------------------------------------------------------------

SCHEMA: Dict[str, Dict[str, str]] = {
    "stripe_charges": {
        "id": "VARCHAR",
        "amount": "BIGINT",
        "amount_refunded": "BIGINT",
        "currency": "VARCHAR",
        "customer": "VARCHAR",
        "created": "BIGINT",
        "status": "VARCHAR",
        "paid": "BOOLEAN",
        "receipt_email": "VARCHAR",
        "_synced_at": "BIGINT",
    },
    "stripe_subscriptions": {
        "id": "VARCHAR",
        "customer": "VARCHAR",
        "status": "VARCHAR",
        "created": "BIGINT",
        "updated_ts": "BIGINT",
        "current_period_start": "BIGINT",
        "current_period_end": "BIGINT",
        "plan_amount": "BIGINT",
        "plan_interval": "VARCHAR",
        "_synced_at": "BIGINT",
    },
    "stripe_customers": {
        "id": "VARCHAR",
        "email": "VARCHAR",
        "name": "VARCHAR",
        "phone": "VARCHAR",
        "created": "BIGINT",
        "updated_ts": "BIGINT",
        "_synced_at": "BIGINT",
    },
    "stripe_invoices": {
        "id": "VARCHAR",
        "customer": "VARCHAR",
        "subscription": "VARCHAR",
        "status": "VARCHAR",
        "amount_due": "BIGINT",
        "amount_paid": "BIGINT",
        "currency": "VARCHAR",
        "period_start": "BIGINT",
        "period_end": "BIGINT",
        "created": "BIGINT",
        "updated_ts": "BIGINT",
        "_synced_at": "BIGINT",
    },
    "stripe_disputes": {
        "id": "VARCHAR",
        "charge": "VARCHAR",
        "amount": "BIGINT",
        "currency": "VARCHAR",
        "reason": "VARCHAR",
        "status": "VARCHAR",
        "created": "BIGINT",
        "_synced_at": "BIGINT",
    },
    "stripe_events": {
        "id": "VARCHAR",
        "type": "VARCHAR",
        "created": "BIGINT",
        "api_version": "VARCHAR",
        "object_id": "VARCHAR",
        "object_type": "VARCHAR",
        "_synced_at": "BIGINT",
    },
}


# ---------------------------------------------------------------------------
# Semantic SQL views (returned by StripeConnector.get_semantic_views)
# ---------------------------------------------------------------------------

SEMANTIC_VIEWS: Dict[str, str] = {
    "vw_stripe_revenue": """
        SELECT
            date_trunc('day', to_timestamp(c.created))  AS date,
            SUM(c.amount)          / 100.0              AS gross_revenue,
            SUM(c.amount_refunded) / 100.0              AS refunded,
            COALESCE(SUM(d.amount), 0) / 100.0          AS disputed,
            (
                SUM(c.amount)
                - SUM(c.amount_refunded)
                - COALESCE(SUM(d.amount), 0)
            ) / 100.0                                   AS net
        FROM stripe_charges c
        LEFT JOIN stripe_disputes d ON d.charge = c.id
        WHERE c.paid = true AND c.status = 'succeeded'
        GROUP BY 1
        ORDER BY 1 DESC
    """,
    "vw_stripe_mrr": """
        SELECT
            date_trunc('month', to_timestamp(created)) AS month,
            SUM(plan_amount) / 100.0                   AS mrr
        FROM stripe_subscriptions
        WHERE status IN ('active', 'past_due')
        GROUP BY 1
    """,
    "vw_stripe_signups_24h": """
        SELECT
            COUNT(*)                                    AS signups_last_24h,
            date_trunc('hour', to_timestamp(created))  AS signup_hour
        FROM stripe_customers
        WHERE created >= epoch_s() - 86400
        GROUP BY 2
        ORDER BY 2 DESC
    """,
    "vw_stripe_churn_rate": """
        WITH monthly AS (
            SELECT
                date_trunc('month', to_timestamp(created)) AS month,
                COUNT(*) FILTER (WHERE status = 'canceled')                           AS canceled,
                COUNT(*) FILTER (WHERE status IN ('active', 'past_due', 'canceled'))  AS total
            FROM stripe_subscriptions
            GROUP BY 1
        )
        SELECT
            month,
            canceled,
            total,
            ROUND(
                CASE WHEN total > 0 THEN 100.0 * canceled / total ELSE NULL END,
                2
            ) AS churn_rate_pct
        FROM monthly
        ORDER BY month DESC
    """,
}