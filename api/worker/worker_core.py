"""
Arcli Worker — Core Infrastructure, Config & Utilities

Contains: Supabase/Redis/dramatiq setup, tenant status management,
signup handlers, metrics sink, pipeline configuration constants,
Postgrest cursor helpers, Dodo webhook handler, backpressure utility.
"""

from __future__ import annotations

import logging
import os
import time
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from sqlalchemy import text
from supabase import Client, ClientOptions, create_client

from api.database import SessionLocal

logger = logging.getLogger("arcli_worker")

# ---------------------------------------------------------------------------
# BROKER SETUP
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
dramatiq.set_broker(RedisBroker(url=REDIS_URL))

SUPABASE_TIMEOUT_SEC = float(os.getenv("SUPABASE_TIMEOUT_SEC", "15.0"))

_thread_local = threading.local()

# ---------------------------------------------------------------------------
# TENANT STATUS
# ---------------------------------------------------------------------------
_TENANT_STATUS_RANKS: dict[str, int] = {
    "PROVISIONING": 10,
    "INTEGRATION": 20,
    "ACTIVE": 30,
    "FAILED": 40,
}


def _tenant_status_rank(status: Optional[str]) -> int:
    if not status:
        return 0
    return _TENANT_STATUS_RANKS.get(status.strip().upper(), 0)


def _get_supabase_client() -> Client:
    if hasattr(_thread_local, "supabase_client"):
        return _thread_local.supabase_client

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        logger.critical("supabase_credentials_missing_service_role")
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY and URL are required for background workers."
        )

    options = ClientOptions(postgrest_client_timeout=SUPABASE_TIMEOUT_SEC)
    client = create_client(supabase_url, supabase_key, options=options)
    _thread_local.supabase_client = client
    return client


def _extract_tenant_id(payload: Any) -> Optional[str]:
    if payload is None:
        return None

    if isinstance(payload, str):
        tenant_id = payload.strip()
        return tenant_id or None

    if isinstance(payload, dict):
        tenant_id = (
            payload.get("tenant_id") or payload.get("tenantId") or payload.get("id")
        )
        if tenant_id:
            return str(tenant_id)
        return None

    if isinstance(payload, list):
        for item in payload:
            tenant_id = _extract_tenant_id(item)
            if tenant_id:
                return tenant_id

    return None


def _upsert_tenant_status(tenant_id: str, status: str) -> None:
    try:
        supabase = _get_supabase_client()
    except Exception:
        logger.exception(
            "tenant_status_update_failed tenant_id=%s status=%s",
            tenant_id,
            status,
        )
        return

    try:
        current_resp = (
            supabase.table("tenants")
            .select("status")
            .eq("tenant_id", tenant_id)
            .limit(1)
            .execute()
        )

        current_status = None
        if current_resp.data:
            current_status = (
                str(current_resp.data[0].get("status") or "").strip() or None
            )

        if _tenant_status_rank(current_status) >= _tenant_status_rank(status):
            logger.debug(
                "tenant_status_update_skipped tenant_id=%s current_status=%s "
                "requested_status=%s",
                tenant_id,
                current_status,
                status,
            )
            return

        supabase.table("tenants").update({"status": status}).eq(
            "tenant_id", tenant_id
        ).execute()
    except Exception:
        logger.exception(
            "tenant_status_update_failed tenant_id=%s status=%s",
            tenant_id,
            status,
        )


# ---------------------------------------------------------------------------
# SIGNUP HANDLERS
# ---------------------------------------------------------------------------
def log_critical_error(error: Exception) -> None:
    logger.exception("signup_provisioning_critical_error error=%s", repr(error))


def mark_tenant_failed(user_id: str) -> None:
    supabase = _get_supabase_client()

    try:
        mapping_resp = (
            supabase.table("tenant_users")
            .select("tenant_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        tenant_id = None
        if mapping_resp.data:
            tenant_id = (
                str(mapping_resp.data[0].get("tenant_id") or "").strip() or None
            )
        if tenant_id:
            _upsert_tenant_status(tenant_id, "FAILED")

        supabase.rpc(
            "mark_tenant_failed",
            {"target_user_id": user_id},
        ).execute()
    except Exception:
        logger.exception("tenant_failure_mark_failed user_id=%s", user_id)


@dramatiq.actor(max_retries=4, min_backoff=5_000, max_backoff=120_000)
def setup_stripe_customer_async(tenant_id: str, user_id: str) -> None:
    logger.info(
        "stripe_customer_setup_started tenant=%s user=%s",
        tenant_id,
        user_id,
    )
    _upsert_tenant_status(tenant_id, "INTEGRATION")


def handle_user_signup(user_id: str) -> Optional[str]:
    try:
        supabase = _get_supabase_client()

        response = supabase.rpc(
            "provision_initial_workspace",
            {
                "target_user_id": user_id,
                "default_name": "My Workspace",
            },
        ).execute()

        tenant_id = _extract_tenant_id(response.data)
        if tenant_id is None:
            raise RuntimeError("Workspace provisioning returned no tenant_id")

        _upsert_tenant_status(tenant_id, "PROVISIONING")
        setup_stripe_customer_async.delay(tenant_id=tenant_id, user_id=user_id)
        return tenant_id

    except Exception as error:
        mark_tenant_failed(user_id)
        log_critical_error(error)
        return None


# ---------------------------------------------------------------------------
# METRICS
# ---------------------------------------------------------------------------
class MetricsSink:
    def increment(
        self,
        name: str,
        value: int = 1,
        tags: Optional[Dict[str, str]] = None,
    ) -> None:
        logger.debug("metric_increment name=%s value=%s tags=%s", name, value, tags)

    def timing(
        self,
        name: str,
        value: float,
        tags: Optional[Dict[str, str]] = None,
    ) -> None:
        logger.debug(
            "metric_timing name=%s value=%s tags=%s", name, round(value, 6), tags
        )


METRICS = MetricsSink()


# ---------------------------------------------------------------------------
# PIPELINE CONFIGURATION
# ---------------------------------------------------------------------------
MAX_TENANT_RUNTIME_SEC = int(os.getenv("MAX_TENANT_RUNTIME_SEC", "60"))
USER_BATCH_SIZE = int(os.getenv("USER_BATCH_SIZE", "500"))
USER_PROFILE_CURSOR_FIELD = (
    os.getenv("USER_PROFILE_CURSOR_FIELD", "id").strip() or "id"
)
ALLOWED_CURSOR_FIELDS = {"id", "created_at"}
MAX_USERS_PER_TENANT_RUN = int(os.getenv("MAX_USERS_PER_TENANT_RUN", "10000"))
MAX_EMAILS_PER_TENANT_RUN = int(os.getenv("MAX_EMAILS_PER_TENANT_RUN", "500"))

PIPELINE_BATCH_TARGET_DURATION_SEC = float(
    os.getenv("PIPELINE_BATCH_TARGET_DURATION_SEC", "0.35")
)
PIPELINE_BATCH_MIN_SLEEP_SEC = float(
    os.getenv("PIPELINE_BATCH_MIN_SLEEP_SEC", "0.02")
)
PIPELINE_BATCH_MAX_SLEEP_SEC = float(
    os.getenv("PIPELINE_BATCH_MAX_SLEEP_SEC", "0.4")
)


# ---------------------------------------------------------------------------
# CURSOR / SAFETY UTILITIES
# ---------------------------------------------------------------------------
def _normalize_cursor_field(raw_field: str) -> str:
    field = (raw_field or "").strip()
    return field if field else "id"


def _is_safe_column_name(name: str) -> bool:
    if not name:
        return False
    return name.replace("_", "").isalnum()


def _format_postgrest_value(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    safe = str(value).replace('"', '\\"')
    return f'"{safe}"'


# ---------------------------------------------------------------------------
# DODO WEBHOOK HANDLER
# ---------------------------------------------------------------------------
@dramatiq.actor(max_retries=3, time_limit=30000)
def process_dodo_webhook(webhook_id: str) -> None:
    with SessionLocal() as db:
        try:
            event = db.execute(
                text("""
                    SELECT payload, tenant_id FROM dodo_webhook_events
                    WHERE webhook_id = :webhook_id AND status = 'pending'
                    FOR UPDATE SKIP LOCKED;
                """),
                {"webhook_id": webhook_id},
            ).mappings().fetchone()

            if not event:
                return

            tenant_id = event["tenant_id"]
            payload = event["payload"]
            event_type = payload.get("type")
            data = payload.get("data", {})

            # 1. New Subscription or Successful Renewal
            if event_type in ["subscription.active", "subscription.renewed"]:
                db.execute(
                    text("""
                        UPDATE tenants
                        SET billing_status = 'active',
                            dodo_customer_id = :customer_id,
                            dodo_subscription_id = :subscription_id,
                            current_period_end = :current_period_end
                        WHERE id = :tenant_id
                    """),
                    {
                        "customer_id": data.get("customer_id"),
                        "subscription_id": data.get("subscription_id"),
                        "current_period_end": data.get("current_period_end"),
                        "tenant_id": tenant_id,
                    },
                )

            # 2. Payment Failure (Grace Period Logic)
            elif event_type == "subscription.payment_failed":
                db.execute(
                    text("""
                        UPDATE tenants
                        SET billing_status = 'past_due'
                        WHERE id = :tenant_id
                    """),
                    {"tenant_id": tenant_id},
                )

            # 3. Cancellation (Downgrade to Free/Locked)
            elif event_type == "subscription.canceled":
                db.execute(
                    text("""
                        UPDATE tenants
                        SET billing_status = 'canceled',
                            dodo_subscription_id = NULL
                        WHERE id = :tenant_id
                    """),
                    {"tenant_id": tenant_id},
                )

            # Mark as completed
            db.execute(
                text(
                    "UPDATE dodo_webhook_events SET status = 'completed' "
                    "WHERE webhook_id = :webhook_id"
                ),
                {"webhook_id": webhook_id},
            )
            db.commit()

        except Exception as e:
            db.rollback()
            db.execute(
                text(
                    "UPDATE dodo_webhook_events SET status = 'failed' "
                    "WHERE webhook_id = :webhook_id"
                ),
                {"webhook_id": webhook_id},
            )
            db.commit()
            raise e


# ---------------------------------------------------------------------------
# BACKPRESSURE
# ---------------------------------------------------------------------------
def _apply_pipeline_backpressure(
    batch_duration: float,
    batch_size: int,
    tenant_id: str,
    run_id: str,
) -> None:
    if PIPELINE_BATCH_TARGET_DURATION_SEC <= 0:
        return
    if batch_duration >= PIPELINE_BATCH_TARGET_DURATION_SEC:
        return

    fullness = min(1.0, batch_size / max(1, USER_BATCH_SIZE))
    sleep_for = (
        PIPELINE_BATCH_TARGET_DURATION_SEC - batch_duration
    ) * fullness
    sleep_for = min(
        PIPELINE_BATCH_MAX_SLEEP_SEC,
        max(PIPELINE_BATCH_MIN_SLEEP_SEC, sleep_for),
    )

    if sleep_for <= 0:
        return

    logger.debug(
        "pipeline_backpressure_sleep tenant=%s run_id=%s sleep=%ss "
        "batch_duration=%ss batch_size=%d",
        tenant_id,
        run_id,
        round(sleep_for, 3),
        round(batch_duration, 3),
        batch_size,
    )
    time.sleep(sleep_for)