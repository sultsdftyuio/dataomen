from __future__ import annotations

import hashlib
import logging
import os
from typing import Optional

import dramatiq
import redis
from redis.exceptions import RedisError
from sqlalchemy import text

from api.database import SessionLocal
from api.worker.worker_core import REDIS_URL

logger = logging.getLogger("arcli_worker.identify")

IDENTIFY_DEBOUNCE_SECONDS = int(os.getenv("IDENTIFY_DEBOUNCE_SECONDS", "3600"))
IDENTIFY_PROCESSING_LOCK_SECONDS = int(
    os.getenv("IDENTIFY_PROCESSING_LOCK_SECONDS", "60")
)

_redis_client: Optional[redis.Redis] = None


def _get_redis_client() -> redis.Redis:
    global _redis_client

    if _redis_client is None:
        _redis_client = redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_timeout=2,
            socket_connect_timeout=2,
            health_check_interval=30,
        )

    return _redis_client


def _debounce_key(tenant_id: str, user_id: str) -> str:
    digest = hashlib.sha256(f"{tenant_id}:{user_id}".encode("utf-8")).hexdigest()
    return f"identify:debounce:{digest}"


@dramatiq.actor(max_retries=5, min_backoff=5_000, max_backoff=300_000)
def process_identify_payload(
    *,
    tenant_id: str,
    user_id: str,
    email: str,
    name: Optional[str] = None,
    plan: Optional[str] = None,
) -> None:
    if not tenant_id or not user_id or not email:
        logger.warning(
            "identify_payload_invalid tenant_present=%s user_present=%s email_present=%s",
            bool(tenant_id),
            bool(user_id),
            bool(email),
        )
        return

    redis_client = _get_redis_client()
    lock_key = _debounce_key(tenant_id, user_id)

    try:
        acquired = redis_client.set(
            lock_key,
            "processing",
            nx=True,
            ex=IDENTIFY_PROCESSING_LOCK_SECONDS,
        )
    except RedisError:
        logger.exception("identify_debounce_redis_unavailable tenant=%s", tenant_id)
        raise

    if not acquired:
        logger.debug("identify_debounced tenant=%s user_id=%s", tenant_id, user_id)
        return

    try:
        with SessionLocal() as db:
            db.execute(
                text(
                    """
                    INSERT INTO user_profiles (
                        tenant_id,
                        id,
                        email,
                        name,
                        plan,
                        last_seen_at,
                        updated_at
                    )
                    VALUES (
                        :tenant_id,
                        :user_id,
                        :email,
                        :name,
                        :plan,
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (tenant_id, id)
                    DO UPDATE SET
                        email = EXCLUDED.email,
                        name = COALESCE(EXCLUDED.name, user_profiles.name),
                        plan = COALESCE(EXCLUDED.plan, user_profiles.plan),
                        last_seen_at = NOW(),
                        updated_at = NOW()
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                    "email": email,
                    "name": name,
                    "plan": plan,
                },
            )
            db.commit()

    except Exception:
        try:
            redis_client.delete(lock_key)
        except RedisError:
            logger.warning(
                "identify_debounce_unlock_failed tenant=%s user_id=%s",
                tenant_id,
                user_id,
                exc_info=True,
            )
        logger.exception("identify_upsert_failed tenant=%s user_id=%s", tenant_id, user_id)
        raise

    try:
        redis_client.set(lock_key, "processed", ex=IDENTIFY_DEBOUNCE_SECONDS)
    except RedisError:
        logger.warning(
            "identify_debounce_finalize_failed tenant=%s user_id=%s",
            tenant_id,
            user_id,
            exc_info=True,
        )

    logger.debug("identify_upserted tenant=%s user_id=%s", tenant_id, user_id)
