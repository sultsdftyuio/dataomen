import json
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

RECOVERY_EMAIL_TABLE = os.getenv("RECOVERY_EMAIL_TABLE", "recovery_emails")
RECOVERY_ATTRIBUTIONS_TABLE = os.getenv("RECOVERY_ATTRIBUTIONS_TABLE", "recovery_attributions")
DEFAULT_ATTRIBUTION_WINDOW_DAYS = int(os.getenv("RECOVERY_ATTRIBUTION_WINDOW_DAYS", "14"))
ATTRIBUTION_EVENT_NAMES = os.getenv(
    "RECOVERY_ATTRIBUTION_EVENT_NAMES",
    "subscription_payment_success,invoice_paid,charge_succeeded,order_paid",
)


class RecoveryAttributionService:
    def __init__(self, db: Session):
        self.db = db
        self._event_names = _normalize_event_names(ATTRIBUTION_EVENT_NAMES)

    def maybe_attribute_from_webhook(
        self,
        tenant_id: str,
        event_name: str,
        payload: Dict[str, Any],
        provider: str,
    ) -> None:
        if not tenant_id or not event_name:
            return

        normalized_event = event_name.strip().lower()
        if normalized_event not in self._event_names:
            return

        context = _extract_context(payload, provider)
        user_id = context.get("user_id")

        if not user_id:
            logger.info(
                "recovery_attribution_missing_user tenant=%s event=%s",
                tenant_id,
                normalized_event,
            )
            return

        recovery_row = self._find_recent_recovery(
            tenant_id=tenant_id,
            user_id=user_id,
            event_ts=context.get("event_ts"),
        )
        if not recovery_row:
            return

        inserted = self._insert_attribution(
            tenant_id=tenant_id,
            send_id=recovery_row["id"],
            user_id=user_id,
            event_name=normalized_event,
            event_ts=context.get("event_ts"),
            revenue=context.get("revenue"),
            metadata=context.get("metadata"),
        )

        if inserted:
            logger.info(
                "recovery_attributed tenant=%s send_id=%s event=%s",
                tenant_id,
                recovery_row["id"],
                normalized_event,
            )

    def _find_recent_recovery(
        self,
        tenant_id: str,
        user_id: Optional[str],
        event_ts: Optional[datetime],
    ) -> Optional[Dict[str, Any]]:
        sql = text(
            f"""
            select id, sent_at, created_at, attribution_window_days
            from {RECOVERY_EMAIL_TABLE}
            where tenant_id = :tenant_id
              and status = 'sent'
                            and user_id = :user_id
            order by sent_at desc nulls last, created_at desc
            limit 1
            """
        )

        params = {
            "tenant_id": tenant_id,
            "user_id": user_id or "",
        }

        row = self.db.execute(sql, params).mappings().first()
        if not row:
            return None

        sent_at = _parse_datetime(row.get("sent_at")) or _parse_datetime(row.get("created_at"))
        if not sent_at:
            return None

        window_days = row.get("attribution_window_days") or DEFAULT_ATTRIBUTION_WINDOW_DAYS
        try:
            window_days = int(window_days)
        except (TypeError, ValueError):
            window_days = DEFAULT_ATTRIBUTION_WINDOW_DAYS

        event_time = event_ts or datetime.now(timezone.utc)
        if event_time < sent_at:
            return None

        if event_time - sent_at > timedelta(days=window_days):
            return None

        return dict(row)

    def _insert_attribution(
        self,
        tenant_id: str,
        send_id: str,
        user_id: str,
        event_name: str,
        event_ts: Optional[datetime],
        revenue: Optional[float],
        metadata: Optional[Dict[str, Any]],
    ) -> bool:
        event_at = event_ts or datetime.now(timezone.utc)

        dedupe_sql = text(
            f"""
            select id
            from {RECOVERY_ATTRIBUTIONS_TABLE}
            where send_id = :send_id
              and event_name = :event_name
              and event_at = :event_at
            limit 1
            """
        )

        insert_sql = text(
            f"""
            insert into {RECOVERY_ATTRIBUTIONS_TABLE}
                (send_id, tenant_id, user_id, event_name, event_at, revenue, metadata)
            values
                (:send_id, :tenant_id, :user_id, :event_name, :event_at, :revenue, :metadata)
            returning id
            """
        )

        payload = {
            "send_id": send_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "event_name": event_name,
            "event_at": event_at.isoformat(),
            "revenue": revenue,
            "metadata": json.dumps(metadata or {}),
        }

        try:
            exists = self.db.execute(
                dedupe_sql,
                {
                    "send_id": send_id,
                    "event_name": event_name,
                    "event_at": payload["event_at"],
                },
            ).fetchone()
            if exists:
                return False

            row = self.db.execute(insert_sql, payload).fetchone()
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception(
                "recovery_attribution_insert_failed tenant=%s send_id=%s",
                tenant_id,
                send_id,
            )
            return False

        return row is not None


def _normalize_event_names(value: str) -> set:
    if not value:
        return set()
    return {part.strip().lower() for part in value.split(",") if part.strip()}


def _extract_context(payload: Dict[str, Any], provider: str) -> Dict[str, Any]:
    if provider == "stripe":
        return _extract_context_stripe(payload)
    return _extract_context_lemonsqueezy(payload, provider)


def _extract_context_lemonsqueezy(payload: Dict[str, Any], provider: str) -> Dict[str, Any]:
    event_ts = _parse_datetime(
        _find_in_paths(
            payload,
            [
                ["meta", "event_created_at"],
                ["data", "attributes", "paid_at"],
                ["data", "attributes", "created_at"],
                ["data", "attributes", "updated_at"],
            ],
        )
    )

    event_id = _find_in_paths(payload, [["meta", "event_id"], ["data", "id"]])
    invoice_id = _find_in_paths(
        payload,
        [
            ["meta", "custom_data", "invoice_id"],
            ["meta", "custom_data", "order_id"],
            ["meta", "custom_data", "charge_id"],
            ["data", "attributes", "invoice_id"],
            ["data", "attributes", "order_id"],
            ["data", "attributes", "order_number"],
            ["data", "attributes", "charge_id"],
            ["data", "id"],
        ],
    )

    user_id = _find_in_paths(
        payload,
        [
            ["meta", "custom_data", "user_id"],
            ["meta", "custom_data", "customer_id"],
            ["data", "attributes", "user_id"],
        ],
    )

    amount_raw = _find_in_paths(
        payload,
        [
            ["data", "attributes", "total"],
            ["data", "attributes", "subtotal"],
            ["data", "attributes", "amount"],
            ["data", "attributes", "total_usd"],
            ["data", "attributes", "total_amount"],
        ],
    )

    currency = _find_in_paths(
        payload,
        [
            ["data", "attributes", "currency"],
            ["data", "attributes", "currency_code"],
        ],
    )

    revenue = _coerce_revenue(amount_raw)

    metadata = {
        "provider": provider,
        "event_id": _coerce_string(event_id),
        "invoice_id": _coerce_string(invoice_id),
        "currency": _coerce_string(currency),
        "amount_raw": amount_raw,
    }

    return {
        "event_ts": event_ts,
        "user_id": _coerce_string(user_id),
        "revenue": revenue,
        "metadata": metadata,
    }


def _extract_context_stripe(payload: Dict[str, Any]) -> Dict[str, Any]:
    event_id = _coerce_string(payload.get("id"))
    event_ts = _parse_datetime(payload.get("created"))
    data_object = payload.get("data", {}).get("object", {}) if isinstance(payload, dict) else {}
    metadata = data_object.get("metadata", {}) if isinstance(data_object, dict) else {}

    user_id = _coerce_string(
        metadata.get("user_id")
        or metadata.get("tenant_user_id")
        or metadata.get("app_user_id")
    )

    invoice_id = _coerce_string(
        data_object.get("invoice")
        or data_object.get("id")
        or data_object.get("charge")
    )

    amount_raw = (
        data_object.get("amount_paid")
        or data_object.get("amount_due")
        or data_object.get("amount")
        or data_object.get("amount_received")
    )

    currency = _coerce_string(data_object.get("currency"))
    revenue = _coerce_revenue(amount_raw)

    meta_payload = {
        "provider": "stripe",
        "event_id": event_id,
        "invoice_id": invoice_id,
        "currency": currency,
        "amount_raw": amount_raw,
    }

    return {
        "event_ts": event_ts,
        "user_id": user_id,
        "revenue": revenue,
        "metadata": meta_payload,
    }


def _find_in_paths(payload: Dict[str, Any], paths: Iterable[Iterable[str]]) -> Any:
    for path in paths:
        current: Any = payload
        for key in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(key)
        if current is not None and current != "":
            return current
    return None


def _coerce_revenue(value: Any) -> Optional[float]:
    if value is None:
        return None

    try:
        if isinstance(value, str):
            value = value.replace(",", "")
        num = float(value)
    except (TypeError, ValueError):
        return None

    if isinstance(value, int) and value > 1000:
        return round(num / 100.0, 2)

    if num > 1000 and num.is_integer():
        return round(num / 100.0, 2)

    return round(num, 2)


def _coerce_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return str(value)


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            if candidate.endswith("Z"):
                candidate = candidate[:-1] + "+00:00"
            parsed = datetime.fromisoformat(candidate)
            return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None
