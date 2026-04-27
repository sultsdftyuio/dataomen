# api/services/workspace_persistence.py

"""
Phase 3.1 — Workspace Persistence Layer

When the AnalyticalOrchestrator determines a chart/grid is needed, this
service saves the heavy payload (VegaLite schema, SQL AST, insight data)
to either Redis or Postgres under a new UUID.  Only the UUID and a short
text summary are returned to the SSE stream, keeping the chat feed
lightweight and decoupled from visualization state.
"""

import logging
import json
import os
import uuid
from typing import Optional, Dict, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Contract
# ---------------------------------------------------------------------------

class WorkspacePayload:
    """Immutable representation of a persisted analytical workspace."""

    __slots__ = (
        "workspace_id",
        "tenant_id",
        "prompt",
        "summary",
        "chart_spec",
        "sql_query",
        "insight_payload",
        "narrative",
        "data_snapshot",
        "created_at",
    )

    def __init__(
        self,
        *,
        workspace_id: str,
        tenant_id: str,
        prompt: str,
        summary: str,
        chart_spec: Optional[Dict[str, Any]] = None,
        sql_query: Optional[str] = None,
        insight_payload: Optional[Dict[str, Any]] = None,
        narrative: Optional[Dict[str, Any]] = None,
        data_snapshot: Optional[list] = None,
        created_at: Optional[str] = None,
    ):
        self.workspace_id = workspace_id
        self.tenant_id = tenant_id
        self.prompt = prompt
        self.summary = summary
        self.chart_spec = chart_spec
        self.sql_query = sql_query
        self.insight_payload = insight_payload
        self.narrative = narrative
        # Cap data snapshot to 500 rows to prevent mega-payloads in cache
        self.data_snapshot = (data_snapshot or [])[:500]
        self.created_at = created_at or datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "workspace_id": self.workspace_id,
            "tenant_id": self.tenant_id,
            "prompt": self.prompt,
            "summary": self.summary,
            "chart_spec": self.chart_spec,
            "sql_query": self.sql_query,
            "insight_payload": self.insight_payload,
            "narrative": self.narrative,
            "data_snapshot": self.data_snapshot,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Persistence Service (Redis-first, Postgres fallback)
# ---------------------------------------------------------------------------

# TTL for workspace documents in Redis (24 hours)
_WORKSPACE_TTL_SECONDS = 60 * 60 * 24

# In-process LRU cache for hot workspaces (prevents repeated Redis round-trips)
_local_cache: Dict[str, WorkspacePayload] = {}
_LOCAL_CACHE_MAX = 200

# Lazy Redis connection pool (singleton — avoids connection leak per call)
_redis_client = None
_redis_init_attempted = False


async def _get_redis():
    """
    Lazy-initialize a single shared async Redis client.
    Returns None if REDIS_URL is not set or connection fails.
    """
    global _redis_client, _redis_init_attempted
    if _redis_client is not None:
        return _redis_client
    if _redis_init_attempted:
        return None  # Already failed once, don't retry on every call
    _redis_init_attempted = True

    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None

    try:
        import redis.asyncio as aioredis
        _redis_client = aioredis.from_url(redis_url, decode_responses=True)
        # Verify connectivity
        await _redis_client.ping()
        return _redis_client
    except Exception as e:
        logger.warning(f"[workspace_persistence] Redis init failed (will use Postgres only): {e}")
        _redis_client = None
        return None


def _evict_local_cache() -> None:
    """Simple FIFO eviction when the local cache grows too large."""
    if len(_local_cache) <= _LOCAL_CACHE_MAX:
        return
    keys_to_remove = list(_local_cache.keys())[: len(_local_cache) - _LOCAL_CACHE_MAX]
    for key in keys_to_remove:
        _local_cache.pop(key, None)


async def save_workspace(payload: WorkspacePayload) -> str:
    """
    Persist a workspace payload and return the workspace UUID.

    Storage strategy:
      1. Write to in-process LRU cache (zero-latency read-back).
      2. Attempt Redis write (cross-node visibility, 24h TTL).
      3. Attempt Postgres write (permanent audit trail).

    Failures in Redis/Postgres are logged but never propagated —
    the caller always receives the workspace_id.
    """
    _local_cache[payload.workspace_id] = payload
    _evict_local_cache()

    # --- Redis ---
    try:
        client = await _get_redis()
        if client:
            key = f"workspace:{payload.workspace_id}"
            await client.setex(
                key,
                _WORKSPACE_TTL_SECONDS,
                json.dumps(payload.to_dict(), default=str),
            )
    except Exception as e:
        logger.warning(f"[workspace_persistence] Redis write failed (non-fatal): {e}")

    # --- Postgres (best-effort insert) ---
    try:
        from api.database import SessionLocal
        from sqlalchemy import text

        with SessionLocal() as db:
            db.execute(
                text("""
                    INSERT INTO workspaces (id, tenant_id, prompt, summary, chart_spec, sql_query,
                                            insight_payload, narrative, data_snapshot, created_at)
                    VALUES (:id, :tenant_id, :prompt, :summary, :chart_spec, :sql_query,
                            :insight_payload, :narrative, :data_snapshot, :created_at)
                    ON CONFLICT (id) DO NOTHING
                """),
                {
                    "id": payload.workspace_id,
                    "tenant_id": payload.tenant_id,
                    "prompt": payload.prompt,
                    "summary": payload.summary,
                    "chart_spec": json.dumps(payload.chart_spec, default=str) if payload.chart_spec else None,
                    "sql_query": payload.sql_query,
                    "insight_payload": json.dumps(payload.insight_payload, default=str) if payload.insight_payload else None,
                    "narrative": json.dumps(payload.narrative, default=str) if payload.narrative else None,
                    "data_snapshot": json.dumps(payload.data_snapshot, default=str) if payload.data_snapshot else None,
                    "created_at": payload.created_at,
                },
            )
            db.commit()
    except Exception as e:
        # Table might not exist yet — graceful degradation
        logger.warning(f"[workspace_persistence] Postgres write failed (non-fatal): {e}")

    return payload.workspace_id


async def load_workspace(workspace_id: str) -> Optional[WorkspacePayload]:
    """
    Load a workspace by UUID.  Checks local cache → Redis → Postgres.
    """
    # 1. Local cache
    cached = _local_cache.get(workspace_id)
    if cached:
        return cached

    # 2. Redis
    try:
        client = await _get_redis()
        if client:
            key = f"workspace:{workspace_id}"
            raw = await client.get(key)
            if raw:
                data = json.loads(raw)
                payload = WorkspacePayload(**data)
                _local_cache[workspace_id] = payload
                return payload
    except Exception as e:
        logger.warning(f"[workspace_persistence] Redis read failed: {e}")

    # 3. Postgres
    try:
        from api.database import SessionLocal
        from sqlalchemy import text

        with SessionLocal() as db:
            result = db.execute(
                text("SELECT * FROM workspaces WHERE id = :id"),
                {"id": workspace_id},
            ).mappings().first()

            if result:
                def _safe_json(val):
                    """Parse JSON string, return None on failure."""
                    if val is None:
                        return None
                    if isinstance(val, (dict, list)):
                        return val  # Already deserialized (e.g. JSONB column)
                    try:
                        return json.loads(val)
                    except (json.JSONDecodeError, TypeError):
                        return None

                payload = WorkspacePayload(
                    workspace_id=str(result["id"]),
                    tenant_id=str(result["tenant_id"]),
                    prompt=str(result.get("prompt", "")),
                    summary=str(result.get("summary", "")),
                    chart_spec=_safe_json(result.get("chart_spec")),
                    sql_query=result.get("sql_query"),
                    insight_payload=_safe_json(result.get("insight_payload")),
                    narrative=_safe_json(result.get("narrative")),
                    data_snapshot=_safe_json(result.get("data_snapshot")),
                    created_at=str(result.get("created_at", "")),
                )
                _local_cache[workspace_id] = payload
                return payload
    except Exception as e:
        logger.warning(f"[workspace_persistence] Postgres read failed: {e}")

    return None


def generate_workspace_id() -> str:
    """Generates a cryptographically random UUID for a new workspace."""
    return str(uuid.uuid4())
