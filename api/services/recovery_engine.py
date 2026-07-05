import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# DEFENSIVE TABLE NAME LOCKDOWN
# ---------------------------------------------------------
RECOVERY_EMAIL_TABLE = "recovery_emails"
RECOVERY_ATTRIBUTIONS_TABLE = "recovery_attributions"

# Fail fast if constants are ever tampered with at import time
if RECOVERY_EMAIL_TABLE != "recovery_emails":
    raise RuntimeError(f"Invalid recovery email table name: {RECOVERY_EMAIL_TABLE}")
if RECOVERY_ATTRIBUTIONS_TABLE != "recovery_attributions":
    raise RuntimeError(f"Invalid recovery attributions table name: {RECOVERY_ATTRIBUTIONS_TABLE}")

DEFAULT_ATTRIBUTION_WINDOW_DAYS = int(os.getenv("RECOVERY_ATTRIBUTION_WINDOW_DAYS", "14"))
ATTRIBUTION_EVENT_NAMES = os.getenv(
    "RECOVERY_ATTRIBUTION_EVENT_NAMES",
    "subscription_payment_success,invoice_paid,invoice.paid,charge_succeeded,charge.succeeded,order_paid",
)

# Clock skew tolerance: events slightly before sent_at are still valid
CLOCK_SKEW_TOLERANCE_MINUTES = 5

# Standard zero-decimal currencies (Stripe / LemonSqueezy do NOT use cents)
ZERO_DECIMAL_CURRENCIES = {
    "jpy", "vnd", "krw", "clp", "pyg", "bif", "djf", "gnf",
    "kmf", "mga", "rwf", "ugx", "vuv", "xaf", "xof", "xpf"
}


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
    ) -> bool:
        """
        Process a webhook payload for recovery attribution.
        Returns True if a new attribution row was inserted.
        """
        if not tenant_id or not event_name:
            logger.warning(
                "recovery_attribution_invalid_input",
                extra={
                    "tenant_id": tenant_id,
                    "event_name": event_name,
                    "reason": "missing_input",
                }
            )
            return False

        normalized_event = _canonical_event_name(event_name)
        if normalized_event not in self._event_names:
            logger.info(
                "recovery_attribution_event_filtered",
                extra={
                    "tenant_id": tenant_id,
                    "event_name": normalized_event,
                    "reason": "not_in_allowlist",
                }
            )
            return False

        context = _extract_context(payload, provider)

        # Fallback chain: user_id -> email -> customer_id
        user_id = (
            context.get("user_id")
            or context.get("email")
            or context.get("customer_id")
        )

        if not user_id:
            logger.warning(
                "recovery_attribution_missing_user",
                extra={
                    "tenant_id": tenant_id,
                    "event_name": normalized_event,
                    "provider": provider,
                    "reason": "missing_user_id_email_customer_id",
                }
            )
            return False

        recovery_row = self._find_recent_recovery(
            tenant_id=tenant_id,
            user_id=user_id,
            email=context.get("email"),
            event_ts=context.get("event_ts"),
        )
        if not recovery_row:
            logger.info(
                "recovery_attribution_no_recovery_found",
                extra={
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                    "event_name": normalized_event,
                    "reason": "no_recent_recovery",
                }
            )
            return False

        inserted = self._insert_attribution(
            tenant_id=tenant_id,
            send_id=recovery_row["id"],
            user_id=user_id,
            campaign_type=recovery_row.get("campaign_type"),
            event_name=normalized_event,
            event_ts=context.get("event_ts"),
            revenue=context.get("revenue"),
            metadata=context.get("metadata"),
            event_id=context.get("metadata", {}).get("event_id"),
        )

        if inserted:
            logger.info(
                "recovery_attributed",
                extra={
                    "tenant_id": tenant_id,
                    "send_id": recovery_row["id"],
                    "event_name": normalized_event,
                    "revenue": context.get("revenue"),
                    "provider": provider,
                }
            )
            return True
        else:
            logger.info(
                "recovery_attribution_duplicate_prevented",
                extra={
                    "tenant_id": tenant_id,
                    "send_id": recovery_row["id"],
                    "event_name": normalized_event,
                    "reason": "idempotency_conflict",
                }
            )
            return False

    def _find_recent_recovery(
        self,
        tenant_id: str,
        user_id: Optional[str],
        email: Optional[str],
        event_ts: Optional[datetime],
    ) -> Optional[Dict[str, Any]]:
        sql = text(
            f"""
            SELECT id, campaign_type, sent_at, provider_accepted_at, created_at, attribution_window_days
            FROM {RECOVERY_EMAIL_TABLE}
            WHERE tenant_id = :tenant_id
              AND status IN ('provider_accepted', 'delivered', 'sent')
              AND (
                    user_id = :user_id
                 OR (:email <> '' AND LOWER(email) = LOWER(:email))
              )
            ORDER BY COALESCE(provider_accepted_at, sent_at, created_at) DESC, created_at DESC
            LIMIT 1
            """
        )

        params = {
            "tenant_id": tenant_id,
            "user_id": user_id or "",
            "email": email or "",
        }

        row = self.db.execute(sql, params).mappings().first()
        if not row:
            return None

        sent_at = (
            _parse_datetime(row.get("provider_accepted_at"))
            or _parse_datetime(row.get("sent_at"))
            or _parse_datetime(row.get("created_at"))
        )
        if not sent_at:
            return None

        window_days = row.get("attribution_window_days") or DEFAULT_ATTRIBUTION_WINDOW_DAYS
        try:
            window_days = int(window_days)
        except (TypeError, ValueError):
            window_days = DEFAULT_ATTRIBUTION_WINDOW_DAYS

        event_time = event_ts or datetime.now(timezone.utc)

        # Clock skew tolerance: allow events slightly before sent_at
        if event_time < sent_at - timedelta(minutes=CLOCK_SKEW_TOLERANCE_MINUTES):
            logger.info(
                "recovery_attribution_future_event",
                extra={
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                    "event_time": event_time.isoformat(),
                    "sent_at": sent_at.isoformat(),
                    "reason": "event_before_sent_with_tolerance",
                }
            )
            return None

        # Enforce attribution window
        if event_time - sent_at > timedelta(days=window_days):
            logger.info(
                "recovery_attribution_out_of_window",
                extra={
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                    "window_days": window_days,
                    "event_time": event_time.isoformat(),
                    "sent_at": sent_at.isoformat(),
                    "reason": "outside_attribution_window",
                }
            )
            return None

        return dict(row)

    def _insert_attribution(
        self,
        tenant_id: str,
        send_id: str,
        user_id: str,
        campaign_type: Optional[str],
        event_name: str,
        event_ts: Optional[datetime],
        revenue: Optional[float],
        metadata: Optional[Dict[str, Any]],
        event_id: Optional[str] = None,
    ) -> bool:
        event_at = event_ts or datetime.now(timezone.utc)

        # Stable idempotency key: event_id is the true external identifier.
        # If missing, fall back to a deterministic composite (last resort).
        if event_id:
            idempotency_key = event_id
        else:
            idempotency_key = f"{send_id}:{event_name}:{event_at.isoformat()}"
            logger.warning(
                "recovery_attribution_unstable_idempotency_key",
                extra={
                    "tenant_id": tenant_id,
                    "send_id": send_id,
                    "event_name": event_name,
                    "reason": "missing_event_id",
                }
            )

        # True database-level idempotency when the recovery_campaign_contract
        # migration has created uq_recovery_attributions_tenant_event_id.
        insert_sql = text(
            f"""
            INSERT INTO {RECOVERY_ATTRIBUTIONS_TABLE}
                (
                    email_id, send_id, tenant_id, user_id, campaign_type,
                    event_name, event_at, revenue, metadata, event_id,
                    attributed_at
                )
            VALUES
                (
                    :send_id, :send_id, :tenant_id, :user_id, :campaign_type,
                    :event_name, :event_at, :revenue, :metadata, :event_id,
                    :event_at
                )
            ON CONFLICT DO NOTHING
            RETURNING id
            """
        )

        payload = {
            "send_id": send_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "campaign_type": campaign_type,
            "event_name": event_name,
            "event_at": event_at,
            "revenue": revenue,
            "metadata": metadata or {},  # Pass dict directly for JSONB
            "event_id": idempotency_key,
        }

        # Retry loop for transient DB failures (deadlocks, connection drops)
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                row = self.db.execute(insert_sql, payload).fetchone()
                self.db.commit()
                return row is not None
            except Exception as e:
                self.db.rollback()
                if attempt < max_retries:
                    logger.warning(
                        "recovery_attribution_insert_retry",
                        extra={
                            "tenant_id": tenant_id,
                            "send_id": send_id,
                            "attempt": attempt + 1,
                            "error": str(e),
                        }
                    )
                    time.sleep(0.1 * (attempt + 1))  # Simple backoff
                else:
                    logger.exception(
                        "recovery_attribution_insert_failed",
                        extra={"tenant_id": tenant_id, "send_id": send_id}
                    )
                    return False

        return False


def _normalize_event_names(value: str) -> set:
    if not value:
        return set()
    return {_canonical_event_name(part) for part in value.split(",") if part.strip()}


def _canonical_event_name(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized.startswith("stripe."):
        normalized = normalized.removeprefix("stripe.")
    aliases = {
        "invoice.paid": "invoice_paid",
        "charge.succeeded": "charge_succeeded",
        "customer.subscription.updated": "subscription_restored",
        "subscription.payment_success": "subscription_payment_success",
    }
    return aliases.get(normalized, normalized.replace(".", "_"))


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

    email = _find_in_paths(
        payload,
        [
            ["data", "attributes", "user_email"],
            ["data", "attributes", "customer_email"],
            ["meta", "custom_data", "email"],
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

    currency = _coerce_string(
        _find_in_paths(
            payload,
            [
                ["data", "attributes", "currency"],
                ["data", "attributes", "currency_code"],
            ],
        )
    )

    revenue = _coerce_revenue(amount_raw, currency, provider)

    metadata = {
        "provider": provider,
        "event_id": _coerce_string(event_id),
        "invoice_id": _coerce_string(invoice_id),
        "currency": currency,
        "amount_raw": amount_raw,
        "email": _coerce_string(email),
    }

    return {
        "event_ts": event_ts,
        "user_id": _coerce_string(user_id),
        "email": _coerce_string(email),
        "revenue": revenue,
        "metadata": metadata,
    }


def _extract_context_stripe(payload: Dict[str, Any]) -> Dict[str, Any]:
    event_id = _coerce_string(payload.get("id"))
    event_ts = _parse_datetime(payload.get("created"))
    data_object = (payload.get("data") or {}).get("object") or {}
    metadata = data_object.get("metadata") or {}

    user_id = _coerce_string(
        metadata.get("user_id")
        or metadata.get("tenant_user_id")
        or metadata.get("app_user_id")
    )

    customer_id = _coerce_string(data_object.get("customer") or metadata.get("customer_id"))

    email = _coerce_string(
        metadata.get("email")
        or data_object.get("customer_email")
        or data_object.get("receipt_email")
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
    revenue = _coerce_revenue(amount_raw, currency, "stripe")

    meta_payload = {
        "provider": "stripe",
        "event_id": event_id,
        "invoice_id": invoice_id,
        "customer_id": customer_id,
        "currency": currency,
        "amount_raw": amount_raw,
        "email": email,
    }

    return {
        "event_ts": event_ts,
        "user_id": user_id,
        "customer_id": customer_id,
        "email": email,
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


def _coerce_revenue(amount_raw: Any, currency: Optional[str], provider: str) -> Optional[float]:
    """
    Deterministically convert raw gateway amounts into floating dollar values.
    Provider-aware to eliminate dangerous universal heuristics.
    """
    if amount_raw is None:
        return None

    try:
        if isinstance(amount_raw, str):
            amount_raw = amount_raw.replace(",", "")
        num = float(amount_raw)

        # Zero-decimal currencies never divide by 100
        is_zero_decimal = currency and currency.lower() in ZERO_DECIMAL_CURRENCIES

        if provider == "stripe":
            # Stripe amounts are always in smallest currency unit (cents)
            return round(num, 2) if is_zero_decimal else round(num / 100.0, 2)

        elif provider in ("lemonsqueezy", "lemon_squeezy"):
            # LemonSqueezy API v1+ returns amounts in cents (consistent with Stripe).
            # If your integration uses a legacy decimal format, adjust here.
            return round(num, 2) if is_zero_decimal else round(num / 100.0, 2)

        else:
            # Unknown provider: conservative default
            return round(num, 2) if is_zero_decimal else round(num / 100.0, 2)

    except (TypeError, ValueError):
        return None


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
