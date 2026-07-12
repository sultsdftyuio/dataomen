import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from supabase import create_client, Client

from api.services.cost_controls import TenantQuotaGuard, env_int

logger = logging.getLogger(__name__)

EVENTS_TABLE = os.getenv("EVENTS_TABLE", "events")
INGESTION_QUOTA_COUNTER = "event_ingestion"
INGESTION_QUOTA_DEFAULT_LIMIT = 10_000
INGESTION_QUOTA_DEFAULT_WINDOW_SECONDS = 3_600
PUBLIC_INGESTION_QUEUE_NAME = os.getenv(
    "ARCLI_PUBLIC_INGESTION_QUEUE_NAME",
    "ingestion",
)

_supabase_client: Optional[Client] = None


def _configure_dramatiq_broker() -> None:
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return

    current_broker = dramatiq.get_broker()
    if isinstance(current_broker, RedisBroker):
        return

    dramatiq.set_broker(RedisBroker(url=redis_url))
    logger.info(
        "dramatiq_redis_broker_configured broker=%s redis_url_configured=%s",
        "redis",
        True,
    )


def _require_redis_broker() -> None:
    if not os.getenv("REDIS_URL", "").strip():
        raise RuntimeError("REDIS_URL is required to enqueue ingestion jobs.")

    _configure_dramatiq_broker()


def _post_internal_pipeline_trigger(
    *,
    endpoint: str | None,
    tenant_id: str,
    service_profile_id: str | None,
    phase: str,
) -> bool:
    if not endpoint:
        logger.info(
            "initial_public_ingestion_phase_skipped tenant_id=%s service_profile_id=%s phase=%s skip_reason=%s",
            tenant_id,
            service_profile_id,
            phase,
            "trigger_endpoint_not_configured",
        )
        return False

    payload = json.dumps(
        {
            "tenant_id": tenant_id,
            "service_profile_id": service_profile_id,
            "source": "service_profile_embedding_completed",
            "phase": phase,
        }
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    worker_secret = os.getenv("INTERNAL_WORKER_SECRET", "").strip()
    if worker_secret:
        headers["Authorization"] = f"Bearer {worker_secret}"

    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status_code = response.getcode()
            if 200 <= status_code < 300:
                logger.info(
                    "initial_public_ingestion_phase_triggered tenant_id=%s service_profile_id=%s phase=%s endpoint=%s status=%s",
                    tenant_id,
                    service_profile_id,
                    phase,
                    endpoint,
                    status_code,
                )
                return True

            logger.warning(
                "initial_public_ingestion_phase_trigger_failed tenant_id=%s service_profile_id=%s phase=%s endpoint=%s status=%s",
                tenant_id,
                service_profile_id,
                phase,
                endpoint,
                status_code,
            )
            return False
    except urllib.error.HTTPError as exc:
        body = exc.read(500).decode("utf-8", errors="replace")
        logger.warning(
            "initial_public_ingestion_phase_trigger_failed tenant_id=%s service_profile_id=%s phase=%s endpoint=%s status=%s body=%s",
            tenant_id,
            service_profile_id,
            phase,
            endpoint,
            exc.code,
            body,
        )
        return False
    except Exception as exc:
        logger.warning(
            "initial_public_ingestion_phase_trigger_unavailable tenant_id=%s service_profile_id=%s phase=%s endpoint=%s error_type=%s error=%s",
            tenant_id,
            service_profile_id,
            phase,
            endpoint,
            exc.__class__.__name__,
            exc,
        )
        return False


def enqueue_initial_public_ingestion_job(
    tenant_id: str,
    service_profile_id: str | None,
) -> str:
    _require_redis_broker()
    message = process_initial_public_ingestion_job.send(
        tenant_id,
        service_profile_id,
    )
    logger.info(
        "initial_public_ingestion_job_enqueued tenant_id=%s service_profile_id=%s message_id=%s",
        tenant_id,
        service_profile_id,
        message.message_id,
    )
    return message.message_id


_configure_dramatiq_broker()


@dramatiq.actor(queue_name=PUBLIC_INGESTION_QUEUE_NAME, max_retries=3)
def process_initial_public_ingestion_job(
    tenant_id: str,
    service_profile_id: str | None = None,
) -> None:
    ingestion_triggered = _post_internal_pipeline_trigger(
        endpoint=os.getenv("ARCLI_PUBLIC_INGESTION_TRIGGER_URL", "").strip() or None,
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        phase="public_social_ingestion",
    )
    matching_triggered = _post_internal_pipeline_trigger(
        endpoint=os.getenv("ARCLI_MATCHING_TRIGGER_URL", "").strip() or None,
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        phase="matching",
    )

    logger.info(
        "initial_public_ingestion_job_completed tenant_id=%s service_profile_id=%s ingestion_triggered=%s matching_triggered=%s",
        tenant_id,
        service_profile_id,
        ingestion_triggered,
        matching_triggered,
    )


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
