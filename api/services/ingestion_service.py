import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from supabase import create_client, Client

from api.services.cost_controls import TenantQuotaGuard, env_int

logger = logging.getLogger(__name__)

EVENTS_TABLE = os.getenv("EVENTS_TABLE", "events")
INGESTION_QUOTA_COUNTER = "event_ingestion"
INGESTION_QUOTA_DEFAULT_LIMIT = 10_000
INGESTION_QUOTA_DEFAULT_WINDOW_SECONDS = 3_600

_supabase_client: Optional[Client] = None


def _get_supabase_client() -> Optional[Client]:
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        logger.error(
            "supabase_credentials_missing supabase_url_configured=%s supabase_key_configured=%s",
            bool(supabase_url),
            bool(supabase_key),
        )
        return None

    _supabase_client = create_client(supabase_url, supabase_key)
    return _supabase_client


def _is_duplicate_error(error: Any) -> bool:
    if not error:
        return False
    text = str(error).lower()
    return "duplicate" in text or "unique" in text or "23505" in text


def _coerce_timestamp(value: Any) -> str:
    if isinstance(value, datetime):
        ts = value
    elif isinstance(value, str):
        try:
            ts = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            ts = datetime.now(timezone.utc)
    else:
        ts = datetime.now(timezone.utc)

    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc).isoformat()


class IngestionService:
    """
    Idempotent event ingestion using Supabase.
    """

    def __init__(self):
        self._client: Optional[Client] = None
        self._quota_guard = TenantQuotaGuard()

    def _client_or_raise(self) -> Client:
        if self._client is None:
            self._client = _get_supabase_client()
        if not self._client:
            raise RuntimeError("Supabase client unavailable")
        return self._client

    async def process_raw_event(
        self,
        tenant_id: str,
        event_name: str,
        user_id: Optional[str],
        idempotency_key: str,
        timestamp: Any,
        properties: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(
            self.process_raw_event_sync,
            tenant_id,
            event_name,
            user_id,
            idempotency_key,
            timestamp,
            properties,
        )

    def process_raw_event_sync(
        self,
        tenant_id: str,
        event_name: str,
        user_id: Optional[str],
        idempotency_key: str,
        timestamp: Any,
        properties: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not tenant_id:
            raise ValueError("tenant_id is required")
        if not event_name:
            raise ValueError("event_name is required")
        if not idempotency_key:
            raise ValueError("idempotency_key is required")

        client = self._client_or_raise()
        safe_properties = properties or {}
        quota = self._quota_guard.check_and_increment(
            tenant_id=tenant_id,
            counter_name=INGESTION_QUOTA_COUNTER,
            limit=env_int("ARCLI_HOURLY_INGESTION_LIMIT", INGESTION_QUOTA_DEFAULT_LIMIT),
            window_seconds=env_int(
                "ARCLI_HOURLY_INGESTION_WINDOW_SECONDS",
                INGESTION_QUOTA_DEFAULT_WINDOW_SECONDS,
            ),
        )
        if not quota.allowed:
            logger.warning(
                "event_ingestion_rejected tenant_id=%s event_name=%s user_id=%s idempotency_key=%s rejection_reason=%s current_count=%s limit=%s window_seconds=%s",
                tenant_id,
                event_name,
                user_id,
                idempotency_key,
                quota.rejection_reason,
                quota.current_count,
                quota.limit,
                quota.window_seconds,
            )
            raise RuntimeError("tenant_ingestion_quota_exceeded")

        existing = (
            client
            .table(EVENTS_TABLE)
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("idempotency_key", idempotency_key)
            .limit(1)
            .execute()
        )

        if existing.data:
            logger.info(
                "event_ingestion_deduped tenant_id=%s event_name=%s user_id=%s idempotency_key=%s event_id=%s",
                tenant_id,
                event_name,
                user_id,
                idempotency_key,
                existing.data[0].get("id"),
            )
            return {
                "status": "deduped",
                "event_id": existing.data[0].get("id"),
                "anomalies": [],
            }

        payload = {
            "tenant_id": tenant_id,
            "event_name": event_name,
            "user_id": user_id,
            "idempotency_key": idempotency_key,
            "timestamp": _coerce_timestamp(timestamp),
            "properties": safe_properties,
        }

        resp = client.table(EVENTS_TABLE).insert(payload).execute()

        if resp.data:
            logger.info(
                "event_ingestion_inserted tenant_id=%s event_name=%s user_id=%s idempotency_key=%s event_id=%s current_count=%s limit=%s",
                tenant_id,
                event_name,
                user_id,
                idempotency_key,
                resp.data[0].get("id"),
                quota.current_count,
                quota.limit,
            )
            return {
                "status": "inserted",
                "event_id": resp.data[0].get("id"),
                "anomalies": [],
            }

        error = getattr(resp, "error", None)
        if _is_duplicate_error(error):
            logger.info(
                "event_ingestion_deduped tenant_id=%s event_name=%s user_id=%s idempotency_key=%s dedupe_source=%s",
                tenant_id,
                event_name,
                user_id,
                idempotency_key,
                "insert_conflict",
            )
            return {
                "status": "deduped",
                "event_id": None,
                "anomalies": [],
            }

        logger.warning(
            "event_insert_failed tenant_id=%s event_name=%s user_id=%s idempotency_key=%s error=%s",
            tenant_id,
            event_name,
            user_id,
            idempotency_key,
            error,
        )
        raise RuntimeError("event_insert_failed")
