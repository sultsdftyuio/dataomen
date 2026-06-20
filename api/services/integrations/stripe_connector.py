"""
ARCLI.TECH - SaaS Integration Module
Connector: Stripe (Financial Analytics)
Strategy: Async Cursor Pagination, Strict Schema Mapping, Zero-ETL Vectorization, Security by Design

Changelog (v6):
- CRITICAL FIX #1: Tenacity before_sleep binding — retry moved out of decorator;
  applied dynamically in _fetch_page_with_backpressure so `self` is always bound.
- CRITICAL FIX #2: Concurrent shard memory bomb — replaced single gather+accumulate
  with asyncio.as_completed streaming; batches yielded as shards complete.
- CRITICAL FIX #3: Adaptive window was computed but never used — now applied to
  ceil_ts and shard window size.
- CRITICAL FIX #4: Events API duplication/ordering — added 60-second rewind window
  and dual checkpoint (last_event_id + created_ts) to guard against late arrivals.
- CRITICAL FIX #5: HTTP requests now carry aiohttp.ClientTimeout(total=30) to
  prevent hanging sockets and stalled workers.
- IMPROVEMENT #6: Deterministic sampling via hash(id) % 100 — reproducible datasets.
- IMPROVEMENT #7: BoundedSet (LRU-evicting ordered dict) replaces unbounded set for
  dedup to prevent OOM on large syncs.
- IMPROVEMENT #8: Adaptive concurrency — _adapt_concurrency() adjusts semaphore
  limit based on retry rate and p95 latency after every page.
- IMPROVEMENT #9: Stripe field expansion — subscriptions use
  ?expand[]=data.items.data.price to reduce round-trips and simplify mapping.
- IMPROVEMENT #10: updated_ts field added to mutable objects (subscriptions,
  invoices, customers); _synced_at epoch added to every record for idempotency.

Changelog (v5):
- CRITICAL FIX: True concurrent shard fetching - gather ALL shards in parallel
- CRITICAL FIX: Checkpoint now uses max(created) instead of last_record
- CRITICAL FIX: Retry callback properly wired to _on_retry for accurate metrics
- CRITICAL FIX: Added deduplication within batch to handle concurrent shard overlaps
- CRITICAL FIX: Added semaphore-based backpressure for proactive rate control
- CRITICAL FIX: PII masking now has fallback mode (STRICT_PII flag) instead of hard fail
- CRITICAL FIX: Safer pagination using time windows without cursor mixing
- FEATURE: Events API implementation for true CDC (Change Data Capture)
- FEATURE: Stream priorities for differentiated sync scheduling
- FEATURE: Adaptive window sizing based on data volume
- FEATURE: Sampling mode for huge tenants
- SECURITY: Enhanced PII handling with fallback masking
"""

import asyncio
import contextlib
import hashlib
import hmac
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, AsyncIterator, Dict, List, Optional, Tuple

import aiohttp

from api.services.integrations.base_integration import (
    BaseIntegration,
    IntegrationConfig,
)

from .stripe_types import (
    BoundedSet,
    SyncCheckpoint,
    SyncBatch,
    SyncMetrics,
    _make_checkpoint,
    _DEFAULT_INCREMENTAL_WINDOW_SECS,
    _MAX_PAGES_DEFAULT,
    _STRIPE_API_VERSION,
    STREAM_PRIORITY,
    DEFAULT_SEMAPHORE_LIMIT,
    StripeAuthError,
)
from .stripe_mappers import (
    _map_event,
    _STREAM_MAPPERS,
    SCHEMA,
    SEMANTIC_VIEWS,
)
from .stripe_sync import StripeSyncMixin

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Connector
# ---------------------------------------------------------------------------


class StripeConnector(BaseIntegration, StripeSyncMixin):
    """
    Phase 9 (v6): Stripe Zero-ETL Connector with Full CDC Support.

    Key guarantees
    --------------
    - **Correct retry binding**: Retry decorator applied dynamically so the
      before_sleep callback is always bound to the live instance.
    - **Streaming shard merge**: as_completed replaces gather+accumulate;
      batches are yielded as each shard lands — no OOM risk.
    - **Adaptive window used**: calculated window_secs applied to ceil_ts.
    - **Events rewind**: 60-second lookback guards against late Stripe events.
    - **HTTP timeout**: every request carries ClientTimeout(total=30).
    - **Deterministic sampling**: hash(id)-based — reproducible across runs.
    - **Bounded dedup**: LRU-evicting BoundedSet prevents unbounded memory.
    - **Adaptive concurrency**: semaphore limit self-tunes on retry rate / p95.
    - **Field expansion**: subscriptions expand price objects server-side.
    - **updated_ts**: mutable objects carry last-mutation epoch for UPSERT.
    """

    SUPPORTED_STREAMS = list(_STREAM_MAPPERS.keys())

    def __init__(
        self,
        tenant_id: str,
        credentials: Optional[Dict[str, Any]] = None,
        session: Optional[aiohttp.ClientSession] = None,
        connected_account_id: Optional[str] = None,
        llm_client: Optional[Any] = None,
        incremental_window_secs: int = _DEFAULT_INCREMENTAL_WINDOW_SECS,
        max_pages: int = _MAX_PAGES_DEFAULT,
        concurrent_shards: int = 1,
        semaphore_limit: int = DEFAULT_SEMAPHORE_LIMIT,
        sampling_rate: Optional[float] = None,
        adaptive_window: bool = False,
        adaptive_concurrency: bool = True,
    ):
        """
        Parameters
        ----------
        concurrent_shards:    Number of time-window shards fetched in parallel.
        semaphore_limit:      Initial max concurrent requests (auto-tuned if
                              adaptive_concurrency=True).
        sampling_rate:        If set (0–1), deterministically sample records.
        adaptive_window:      Dynamically adjust window size based on priority.
        adaptive_concurrency: Auto-tune semaphore limit from retry / latency.
        """
        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name="stripe",
            credentials=credentials or {},
        )
        super().__init__(config)

        self.api_base = "https://api.stripe.com/v1"
        self.client_token = self._initialize_client()
        self.webhook_secret = (credentials or {}).get("webhook_secret", "")
        self._external_session = session
        self._connected_account_id = connected_account_id
        self._llm_client = llm_client
        self._incremental_window_secs = incremental_window_secs
        self._max_pages = max_pages
        self._concurrent_shards = max(1, concurrent_shards)
        self._semaphore_limit = semaphore_limit
        self._semaphore = asyncio.Semaphore(semaphore_limit)
        self._sampling_rate = sampling_rate
        self._adaptive_window = adaptive_window
        self._adaptive_concurrency = adaptive_concurrency

        # Active metrics reference for dynamic retry callback (FIX #1).
        self._active_metrics: Optional[SyncMetrics] = None

    # -----------------------------------------------------------------------
    # Initialisation helpers
    # -----------------------------------------------------------------------

    def _initialize_client(self) -> str:
        token = (
            self.config.credentials.get("access_token")
            or self.config.credentials.get("api_key", "")
        )
        if not token:
            logger.warning("[%s] Stripe initialized without token.", self.tenant_id)
        return token

    def validate_stream(self, stream_name: str) -> None:
        if stream_name not in _STREAM_MAPPERS:
            raise ValueError(
                f"[{self.tenant_id}] Unsupported stream: '{stream_name}'. "
                f"Supported: {self.SUPPORTED_STREAMS}"
            )

    @contextlib.asynccontextmanager
    async def _get_session(self) -> AsyncIterator[aiohttp.ClientSession]:
        if self._external_session:
            yield self._external_session
            return

        headers: Dict[str, str] = {
            "Authorization": f"Bearer {self.client_token}",
            "Stripe-Version": _STRIPE_API_VERSION,
        }
        if self._connected_account_id:
            headers["Stripe-Account"] = self._connected_account_id

        connector = aiohttp.TCPConnector(limit=10, ttl_dns_cache=300)
        async with aiohttp.ClientSession(headers=headers, connector=connector) as s:
            yield s

    # -----------------------------------------------------------------------
    # Schema & semantic views
    # -----------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        if self._llm_client is not None:
            asyncio.create_task(self._prewarm_semantic_router(SCHEMA))
        return SCHEMA

    async def _prewarm_semantic_router(self, schema: Dict[str, Any]) -> None:
        try:
            logger.debug(
                "[%s] Pre-warming semantic router (%d tables).",
                self.tenant_id,
                len(schema),
            )
            await self._llm_client.index_schema(
                integration="stripe",
                tenant_id=self.tenant_id,
                schema=schema,
            )
            logger.info("[%s] Semantic router pre-warm complete.", self.tenant_id)
        except Exception as exc:
            logger.warning(
                "[%s] Semantic router pre-warm failed (non-fatal): %s",
                self.tenant_id,
                exc,
            )

    def get_semantic_views(self) -> Dict[str, str]:
        return SEMANTIC_VIEWS

    # -----------------------------------------------------------------------
    # Webhook verification
    # -----------------------------------------------------------------------

    def verify_webhook(self, payload: bytes, sig_header: str) -> bool:
        if not self.webhook_secret:
            logger.error(
                "[%s] Webhook verification skipped: no webhook_secret.", self.tenant_id
            )
            return False

        try:
            parts = dict(
                item.split("=", 1) for item in sig_header.split(",") if "=" in item
            )
            timestamp = parts.get("t")
            signatures = [v for k, v in parts.items() if k == "v1"]

            if not timestamp or not signatures:
                logger.warning("[%s] Malformed Stripe-Signature header.", self.tenant_id)
                return False

            age = abs(time.time() - int(timestamp))
            if age > 300:
                logger.warning(
                    "[%s] Webhook timestamp too old (age=%ds). Possible replay attack.",
                    self.tenant_id,
                    int(age),
                )
                return False

            signed_payload = f"{timestamp}.".encode() + payload
            expected = hmac.new(
                self.webhook_secret.encode("utf-8"),
                signed_payload,
                hashlib.sha256,
            ).hexdigest()

            if not any(hmac.compare_digest(expected, sig) for sig in signatures):
                logger.warning("[%s] Webhook signature mismatch.", self.tenant_id)
                return False

            return True

        except Exception as exc:
            logger.error("[%s] Webhook verification error: %s", self.tenant_id, exc)
            return False

    # -----------------------------------------------------------------------
    # Core sync entry point
    # -----------------------------------------------------------------------

    async def sync_historical(
        self,
        stream_name: str,
        start_timestamp: Optional[str] = None,
        checkpoint: Optional[SyncCheckpoint] = None,
    ) -> AsyncGenerator[SyncBatch, None]:
        """
        Yields SyncBatch envelopes of normalised, PII-masked records.
        """
        self.validate_stream(stream_name)

        metrics = SyncMetrics(stream=stream_name)
        self._active_metrics = metrics

        now_ts = int(datetime.now(tz=timezone.utc).timestamp())
        floor_ts = now_ts - self._incremental_window_secs

        if checkpoint and checkpoint.get("stream") == stream_name:
            floor_ts = max(floor_ts, checkpoint.get("created_ts", 0) - 1)

        if start_timestamp:
            try:
                dt = datetime.fromisoformat(start_timestamp.replace("Z", "+00:00"))
                floor_ts = int(dt.timestamp())
            except ValueError:
                logger.warning(
                    "[%s] Could not parse start_timestamp '%s' — using rolling window.",
                    self.tenant_id,
                    start_timestamp,
                )

        resume_id: Optional[str] = (
            (checkpoint or {}).get("last_id") if not start_timestamp else None
        )

        mapper_fn, pii_fields, expand_params = _STREAM_MAPPERS[stream_name]

        # FIX #3: Apply adaptive window to ceil_ts, not just compute it.
        ceil_ts = now_ts
        if self._adaptive_window:
            window_secs = self._calculate_adaptive_window(stream_name, floor_ts, now_ts)
            ceil_ts = floor_ts + window_secs
            logger.debug(
                "[%s] Adaptive window for '%s': floor=%d ceil=%d (window=%ds)",
                self.tenant_id,
                stream_name,
                floor_ts,
                ceil_ts,
                window_secs,
            )

        if self._concurrent_shards > 1:
            async for batch in self._sync_concurrent(
                stream_name,
                floor_ts,
                ceil_ts,
                mapper_fn,
                pii_fields,
                expand_params,
                metrics,
            ):
                yield batch
        else:
            async for batch in self._sync_serial(
                stream_name,
                floor_ts,
                resume_id,
                mapper_fn,
                pii_fields,
                expand_params,
                metrics,
            ):
                yield batch

        self.sync_metrics = metrics.to_log_dict()  # Expose to notification router.
        logger.info(
            "✅ [%s] Stripe sync complete | %s",
            self.tenant_id,
            metrics.to_log_dict(),
        )
        self._active_metrics = None

    def _calculate_adaptive_window(
        self, stream_name: str, floor_ts: int, ceil_ts: int
    ) -> int:
        """
        FIX #3: Returns effective window size in seconds based on stream priority.
        High-priority streams get smaller windows (fresher data, more frequent runs).
        """
        priority = STREAM_PRIORITY.get(stream_name, 2)
        base_window = ceil_ts - floor_ts

        if priority == 1:
            return min(base_window, 24 * 3600)  # ≤ 1 day
        elif priority == 2:
            return min(base_window, 7 * 24 * 3600)  # ≤ 7 days
        else:
            return min(base_window, 30 * 24 * 3600)  # ≤ 30 days

    # -----------------------------------------------------------------------
    # Serial pagination
    # -----------------------------------------------------------------------

    async def _sync_serial(
        self,
        stream_name: str,
        floor_ts: int,
        resume_id: Optional[str],
        mapper_fn: Any,
        pii_fields: List[str],
        expand_params: str,
        metrics: SyncMetrics,
    ) -> AsyncGenerator[SyncBatch, None]:
        limit = 100
        has_more = True
        starting_after = resume_id
        page_count = 0

        async with self._get_session() as session:
            while has_more:
                if page_count >= self._max_pages:
                    logger.error(
                        "[%s] max_pages=%d reached for '%s' — aborting.",
                        self.tenant_id,
                        self._max_pages,
                        stream_name,
                    )
                    break

                url = f"{self.api_base}/{stream_name}?limit={limit}&created[gte]={floor_ts}"
                # FIX #9: Append server-side expansion params when available.
                if expand_params:
                    url += f"&{expand_params}"
                if starting_after:
                    url += f"&starting_after={starting_after}"

                data = await self._fetch_page_with_backpressure(session, url, metrics)
                items = data.get("data", [])
                page_count += 1

                if not items:
                    break

                batch, max_record = self._process_items(
                    items, stream_name, mapper_fn, pii_fields, metrics
                )

                if batch:
                    metrics.rows_synced += len(batch)
                    yield SyncBatch(
                        records=batch,
                        primary_key="id",
                        source_stream=stream_name,
                        checkpoint=_make_checkpoint(max_record, stream_name),
                    )

                has_more = data.get("has_more", False)
                if has_more and items:
                    starting_after = items[-1].get("id")

    # -----------------------------------------------------------------------
    # FIX #2: Concurrent shard fetching — streaming via as_completed.
    # Shards are yielded as they complete; memory is never accumulated.
    # -----------------------------------------------------------------------

    async def _sync_concurrent(
        self,
        stream_name: str,
        floor_ts: int,
        ceil_ts: int,
        mapper_fn: Any,
        pii_fields: List[str],
        expand_params: str,
        metrics: SyncMetrics,
    ) -> AsyncGenerator[SyncBatch, None]:
        """
        FIX #2: Splits [floor_ts, ceil_ts] into concurrent_shards windows and
        processes shards with asyncio.as_completed so batches stream out as
        each shard lands — no full accumulation in memory.

        FIX #7: Cross-shard dedup via BoundedSet (LRU-evicting, memory-safe).
        """
        window = (ceil_ts - floor_ts) / self._concurrent_shards
        shard_ranges = [
            (
                floor_ts + int(i * window),
                floor_ts + int((i + 1) * window),
            )
            for i in range(self._concurrent_shards)
        ]

        # Global bounded dedup set shared across all shards.
        global_seen: BoundedSet = BoundedSet()

        async with self._get_session() as session:
            tasks = [
                asyncio.ensure_future(
                    self._fetch_shard_page(
                        session,
                        stream_name,
                        shard_floor,
                        shard_ceil,
                        mapper_fn,
                        pii_fields,
                        expand_params,
                        metrics,
                    )
                )
                for (shard_floor, shard_ceil) in shard_ranges
            ]

            for coro in asyncio.as_completed(tasks):
                try:
                    shard_result: List[
                        Tuple[List[Dict[str, Any]], Dict[str, Any]]
                    ] = await coro
                except Exception as exc:
                    logger.error("[%s] Shard failed: %s", self.tenant_id, exc)
                    continue

                for batch, max_record in shard_result:
                    # Cross-shard dedup using BoundedSet.
                    clean_batch = []
                    for record in batch:
                        record_id = record.get("id")
                        if record_id and record_id not in global_seen:
                            global_seen.add(record_id)
                            clean_batch.append(record)
                        elif record_id:
                            metrics.deduped_count += 1

                    if clean_batch:
                        metrics.rows_synced += len(clean_batch)
                        yield SyncBatch(
                            records=clean_batch,
                            primary_key="id",
                            source_stream=stream_name,
                            checkpoint=_make_checkpoint(max_record, stream_name),
                        )

    # -----------------------------------------------------------------------
    # Event replay
    # -----------------------------------------------------------------------

    async def replay_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Replay a specific event by ID for debugging or recovery."""
        async with self._get_session() as session:
            url = f"{self.api_base}/events/{event_id}"
            try:
                data = await self._fetch_page_with_backpressure(session, url)
                return _map_event(data)
            except Exception as exc:
                logger.error(
                    "[%s] Failed to replay event %s: %s",
                    self.tenant_id,
                    event_id,
                    exc,
                )
                return None

    # -----------------------------------------------------------------------
    # Connection verification
    # -----------------------------------------------------------------------

    async def test_connection(self) -> bool:
        if not self.client_token:
            logger.warning("[%s] test_connection: no token configured.", self.tenant_id)
            return False

        try:
            async with self._get_session() as session:
                # FIX #5: Timeout applies here too (via _fetch_page_with_backpressure).
                url = f"{self.api_base}/charges?limit=1"
                await self._fetch_page_with_backpressure(session, url)
                return True

        except StripeAuthError:
            logger.warning("[%s] test_connection: StripeAuthError.", self.tenant_id)
            return False
        except Exception as exc:
            logger.error("[%s] test_connection failed: %s", self.tenant_id, exc)
            return False