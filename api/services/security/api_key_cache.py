import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional, Tuple

import redis.asyncio as redis
from fastapi import HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.services.security.api_keys import ApiKeyVault

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=True)

LIVE_PREFIX = os.getenv("API_KEY_LIVE_PREFIX", "arcli_live_")
TEST_PREFIX = os.getenv("API_KEY_TEST_PREFIX", "arcli_test_")
AUTH_CACHE_TTL_SECONDS = int(os.getenv("API_KEY_AUTH_CACHE_TTL_SECONDS", "604800"))
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_client: Optional[redis.Redis] = None


def _cache_key(key_id: str) -> str:
    return f"api_key_auth:{key_id}"


def _parse_api_key(raw: str) -> Optional[Tuple[str, str]]:
    if not raw:
        return None

    if raw.startswith(LIVE_PREFIX):
        prefix_len = len(LIVE_PREFIX)
    elif raw.startswith(TEST_PREFIX):
        prefix_len = len(TEST_PREFIX)
    else:
        return None

    trimmed = raw[prefix_len:]
    if "_" not in trimmed:
        return None

    key_id, secret = trimmed.split("_", 1)
    if not key_id or not secret:
        return None

    return key_id, secret


def get_api_key_cache_redis() -> redis.Redis:
    global _redis_client

    if _redis_client is None:
        _redis_client = redis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=2,
            socket_connect_timeout=2,
            health_check_interval=30,
        )

    return _redis_client


async def cache_api_key_auth_record(
    *,
    key_id: str,
    tenant_id: str,
    key_hash: str,
    revoked_at: Optional[str] = None,
) -> None:
    if not key_id or not tenant_id or not key_hash:
        raise ValueError("key_id, tenant_id, and key_hash are required")

    payload = {
        "tenant_id": tenant_id,
        "key_hash": key_hash,
        "revoked_at": revoked_at,
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }

    client = get_api_key_cache_redis()
    await client.set(
        _cache_key(key_id),
        json.dumps(payload, separators=(",", ":")),
        ex=AUTH_CACHE_TTL_SECONDS,
    )


async def delete_api_key_auth_record(key_id: str) -> None:
    if not key_id:
        return

    client = get_api_key_cache_redis()
    await client.delete(_cache_key(key_id))


async def warm_api_key_auth_cache_from_supabase(supabase, limit: int = 1000) -> int:
    response = (
        supabase.table("api_keys")
        .select("key_id, tenant_id, key_hash, revoked_at")
        .is_("revoked_at", "null")
        .limit(limit)
        .execute()
    )

    warmed = 0
    for row in response.data or []:
        key_id = row.get("key_id")
        tenant_id = row.get("tenant_id")
        key_hash = row.get("key_hash")
        if not key_id or not tenant_id or not key_hash:
            continue

        await cache_api_key_auth_record(
            key_id=str(key_id),
            tenant_id=str(tenant_id),
            key_hash=str(key_hash),
            revoked_at=None,
        )
        warmed += 1

    return warmed


async def resolve_cached_api_key_tenant(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """Resolve tenant_id from Redis only.

    This dependency intentionally performs no database lookups.  It is meant for
    ultra-hot ingestion routes where an API key must already be present in the
    auth cache.  Cache misses fail closed.
    """
    parsed = _parse_api_key(credentials.credentials)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )

    key_id, secret = parsed
    try:
        key_hash = ApiKeyVault.hash_key(secret)
    except Exception:
        logger.exception("api_key_hash_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error",
        )

    try:
        raw_record = await get_api_key_cache_redis().get(_cache_key(key_id))
    except redis.RedisError:
        logger.exception("api_key_auth_cache_unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API key authentication cache unavailable",
        )

    if not raw_record:
        logger.warning(
            "api_key_auth_cache_miss",
            extra={"key_id_hash": hashlib.sha256(key_id.encode()).hexdigest()},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )

    try:
        record = json.loads(raw_record)
    except json.JSONDecodeError:
        logger.warning("api_key_auth_cache_corrupt")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )

    stored_hash = str(record.get("key_hash") or "")
    tenant_id = str(record.get("tenant_id") or "").strip()
    revoked_at = record.get("revoked_at")

    if revoked_at or not tenant_id or not hmac.compare_digest(key_hash, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )

    request.state.api_key_id = key_id
    return tenant_id
