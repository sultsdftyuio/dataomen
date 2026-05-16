import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from supabase import create_client, Client

logger = logging.getLogger(__name__)

EVENTS_TABLE = os.getenv("EVENTS_TABLE", "events")

_supabase_client: Optional[Client] = None


def _get_supabase_client() -> Optional[Client]:
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        logger.error("supabase_credentials_missing")
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
            return {
                "status": "inserted",
                "event_id": resp.data[0].get("id"),
                "anomalies": [],
            }

        error = getattr(resp, "error", None)
        if _is_duplicate_error(error):
            return {
                "status": "deduped",
                "event_id": None,
                "anomalies": [],
            }

        logger.warning(
            "event_insert_failed tenant=%s error=%s",
            tenant_id,
            error,
        )
        raise RuntimeError("event_insert_failed")