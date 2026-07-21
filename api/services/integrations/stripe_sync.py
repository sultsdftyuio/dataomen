"""
ARCLI.TECH — Stripe Connector: Sync Engine Mixin

StripeSyncMixin is consumed by StripeConnector via multiple inheritance.  It
encapsulates:
  • Network layer (retry + backpressure + adaptive concurrency)
  • Record-level processing (mapping, DLQ, PII masking, dedup, sampling)
  • Shard-level page fetching for concurrent historical syncs
  • Event-driven CDC sync (dual checkpoint + rewind window)
  • Nightly reconciliation pass for late-arriving mutations

All methods reference `self` attributes that are guaranteed to exist on the
final StripeConnector instance (initialised in that class' __init__ and/or
provided by BaseIntegration).
"""

import asyncio
import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Tuple

import aiohttp
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    RetryCallState,
)

from .stripe_mappers import (
    _map_event,
    _STREAM_MAPPERS,
)
from .stripe_types import (
    BoundedSet,
    SyncCheckpoint,
    SyncBatch,
    SyncMetrics,
    _make_checkpoint,
    StripeRateLimitError,
    StripeAuthError,
    StripePIISanitizerMissing,
    STRICT_PII,
    _HTTP_TIMEOUT,
    _EVENTS_REWIND_SECS,
    _RECONCILIATION_STREAMS,
    _RECONCILIATION_LOOKBACK_HOURS,
    _CONCURRENCY_RETRY_HIGH,
    _CONCURRENCY_RETRY_LOW,
    _CONCURRENCY_P95_HIGH,
    _CONCURRENCY_P95_LOW,
    _CONCURRENCY_MIN,
    _CONCURRENCY_MAX,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Mixin class
# ---------------------------------------------------------------------------


class StripeSyncMixin:
    """
    Provides the heavy machinery used by StripeConnector:
      • Retry-decorated HTTP fetch with semaphore backpressure
      • Adaptive concurrency tuning
      • Record processing (mapping, DLQ, PII masking, dedup, sampling)
      • Per-shard page fetching for concurrent historical syncs
      • Event-driven CDC sync with rewind-window dedup
      • Nightly reconciliation for late-arriving mutations
    """

    # -- assumed to be provided by the concrete StripeConnector class --------
    # tenant_id: str
    # api_base: str
    # client_token: str
    # _semaphore: asyncio.Semaphore
    # _semaphore_limit: int
    # _active_metrics: Optional[SyncMetrics]
    # _adaptive_concurrency: bool
    # _adaptive_window: bool
    # _sampling_rate: Optional[float]
    # _max_pages: int
    # _incremental_window_secs: int
    # _concurrent_shards: int
    # raw_storage_sink: Optional[Any]
    # data_sanitizer: Optional[Any]
    # _get_session: Callable[..., Any]

    # -----------------------------------------------------------------------
    # FIX #1: Correct retry binding — applied dynamically.
    # -----------------------------------------------------------------------

    def _make_retry_decorator(self) -> Callable:
        """
        Returns a fully bound tenacity retry decorator.
        Created per-call so before_sleep always closes over the current `self`.
        """

        def _before_sleep_callback(retry_state: RetryCallState) -> None:
            if self._active_metrics is not None:
                self._active_metrics.retry_count += 1
            wait = getattr(retry_state.next_action, "sleep", None)
            logger.warning(
                "[%s] Retrying after error (attempt %d): %s — waiting %.1fs",
                self.tenant_id,
                retry_state.attempt_number,
                retry_state.outcome.exception() if retry_state.outcome else "unknown",
                wait or 0,
            )

        return retry(
            retry=retry_if_exception_type((StripeRateLimitError, aiohttp.ClientError)),
            wait=wait_exponential(min=2, max=60),
            stop=stop_after_attempt(5),
            before_sleep=_before_sleep_callback,
            reraise=True,
        )

    # -----------------------------------------------------------------------
    # Network layer — backpressure + FIX #5 timeout + FIX #1 retry binding
    # -----------------------------------------------------------------------

    async def _fetch_page_with_backpressure(
        self,
        session: aiohttp.ClientSession,
        url: str,
        metrics: Optional[SyncMetrics] = None,
    ) -> Dict[str, Any]:
        """
        Acquires semaphore slot (backpressure), then applies a dynamically
        bound retry decorator (FIX #1) around the raw HTTP call.
        Adapts concurrency after every successful page (FIX #8).
        """
        async with self._semaphore:
            retrying_fetch = self._make_retry_decorator()(self._fetch_page_inner)
            result = await retrying_fetch(session, url, metrics)

        # FIX #8: Tune concurrency after we release the semaphore slot.
        if metrics and self._adaptive_concurrency:
            self._adapt_concurrency(metrics)

        return result

    async def _fetch_page_inner(
        self,
        session: aiohttp.ClientSession,
        url: str,
        metrics: Optional[SyncMetrics] = None,
    ) -> Dict[str, Any]:
        """
        Raw HTTP GET. FIX #5: ClientTimeout(total=30) prevents hanging sockets.
        Raises StripeRateLimitError / StripeAuthError for tenacity to handle.
        """
        logger.debug("[%s] GET %s", self.tenant_id, url)
        t0 = time.monotonic()

        # FIX #5: Explicit timeout on every request.
        async with session.get(url, timeout=_HTTP_TIMEOUT) as resp:
            elapsed_ms = (time.monotonic() - t0) * 1000
            if metrics:
                metrics.record_latency(elapsed_ms)
                metrics.pages_fetched += 1

            if resp.status == 429:
                retry_after = resp.headers.get("Retry-After")
                if retry_after:
                    wait_secs = float(retry_after)
                    logger.warning(
                        "[%s] Rate limit hit. Honouring Retry-After: %.1fs",
                        self.tenant_id,
                        wait_secs,
                    )
                    await asyncio.sleep(wait_secs)
                raise StripeRateLimitError("Stripe API rate limit exceeded.")

            if resp.status == 401:
                raise StripeAuthError(
                    f"[{self.tenant_id}] Stripe 401 — check API key or access token."
                )

            resp.raise_for_status()
            return await resp.json()

    # -----------------------------------------------------------------------
    # FIX #8: Adaptive concurrency control
    # -----------------------------------------------------------------------

    def _adapt_concurrency(self, metrics: SyncMetrics) -> None:
        """
        Self-tunes self._semaphore based on observed retry rate and p95 latency.
        Called after every page so the connector backs off quickly when throttled
        and speeds up when headroom allows.
        Requires at least 10 pages of data before acting to avoid early jitter.
        """
        if metrics.pages_fetched < 10:
            return

        retry_rate = metrics.retry_rate()
        p95 = metrics.p95_latency_ms or 0.0

        high_pressure = (
            retry_rate > _CONCURRENCY_RETRY_HIGH or p95 > _CONCURRENCY_P95_HIGH
        )
        low_pressure = retry_rate < _CONCURRENCY_RETRY_LOW and (
            p95 == 0 or p95 < _CONCURRENCY_P95_LOW
        )

        if high_pressure:
            new_limit = max(_CONCURRENCY_MIN, self._semaphore_limit - 1)
        elif low_pressure:
            new_limit = min(_CONCURRENCY_MAX, self._semaphore_limit + 1)
        else:
            return

        if new_limit != self._semaphore_limit:
            self._semaphore_limit = new_limit
            self._semaphore = asyncio.Semaphore(new_limit)
            logger.info(
                "[%s] Concurrency adapted: limit=%d (retry_rate=%.2f p95=%.0fms)",
                self.tenant_id,
                new_limit,
                retry_rate,
                p95,
            )

    # -----------------------------------------------------------------------
    # DLQ
    # -----------------------------------------------------------------------

    def _send_to_dlq(
        self,
        raw: Dict[str, Any],
        stream: str,
        exc: Exception,
        metrics: Optional[SyncMetrics] = None,
    ) -> None:
        if metrics:
            metrics.dlq_count += 1
        logger.error(
            "[%s] DLQ | stream=%s id=%s error=%s raw_keys=%s",
            self.tenant_id,
            stream,
            raw.get("id", "<no-id>"),
            exc,
            list(raw.keys()),
        )

    # -----------------------------------------------------------------------
    # Shard page fetcher (used by _sync_concurrent in the connector)
    # -----------------------------------------------------------------------

    async def _fetch_shard_page(
        self,
        session: aiohttp.ClientSession,
        stream_name: str,
        floor_ts: int,
        ceil_ts: int,
        mapper_fn: Callable,
        pii_fields: List[str],
        expand_params: str,
        metrics: SyncMetrics,
    ) -> List[Tuple[List[Dict[str, Any]], Dict[str, Any]]]:
        """Fetches and maps all pages within a single time-window shard."""
        results: List[Tuple[List[Dict[str, Any]], Dict[str, Any]]] = []
        has_more = True
        after: Optional[str] = None
        page_count = 0
        limit = 100

        while has_more:
            if page_count >= self._max_pages:
                logger.error(
                    "[%s] max_pages=%d reached in shard [%d-%d].",
                    self.tenant_id,
                    self._max_pages,
                    floor_ts,
                    ceil_ts,
                )
                break

            url = (
                f"{self.api_base}/{stream_name}"
                f"?limit={limit}&created[gte]={floor_ts}&created[lte]={ceil_ts}"
            )
            # FIX #9: Server-side expansion.
            if expand_params:
                url += f"&{expand_params}"
            if after:
                url += f"&starting_after={after}"

            data = await self._fetch_page_with_backpressure(session, url, metrics)
            items = data.get("data", [])
            page_count += 1

            if not items:
                break

            batch, max_record = self._process_items(
                items, stream_name, mapper_fn, pii_fields, metrics
            )
            if batch:
                results.append((batch, max_record))

            has_more = data.get("has_more", False)
            if has_more and items:
                after = items[-1].get("id")

        return results

    # -----------------------------------------------------------------------
    # Record processing (mapping + DLQ + PII masking + dedup + sampling)
    # -----------------------------------------------------------------------

    def _process_items(
        self,
        items: List[Dict[str, Any]],
        stream_name: str,
        mapper_fn: Callable,
        pii_fields: List[str],
        metrics: SyncMetrics,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Maps raw Stripe objects, applies within-page dedup and sampling.
        Returns (clean_batch, max_created_record).
        """
        batch: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()  # Within-page dedup only (bounded by page size).

        # FIX #5 (cold storage): Archive raw records before transformation.
        if self.raw_storage_sink and items:
            try:
                asyncio.get_running_loop()
                self._schedule_background_task(
                    self.raw_storage_sink.write_raw(
                        self.tenant_id, "stripe", stream_name, items
                    )
                )
            except RuntimeError:
                # No running event loop — skip cold storage silently.
                pass

        for raw in items:
            # FIX #6: Deterministic sampling — same record always in or always out.
            if self._sampling_rate is not None:
                record_id = raw.get("id", "")
                bucket = int(hashlib.md5(record_id.encode()).hexdigest(), 16) % 100
                if bucket >= int(self._sampling_rate * 100):
                    continue

            mapped = self._map_record_safe(raw, stream_name, mapper_fn, metrics)
            if mapped is not None:
                record_id = mapped.get("id")
                if record_id and record_id not in seen_ids:
                    seen_ids.add(record_id)
                    batch.append(mapped)
                elif record_id:
                    metrics.deduped_count += 1

        if batch:
            batch = self._mask_pii(batch, pii_fields)
            max_record = max(batch, key=lambda r: r.get("created", 0))
        else:
            max_record = {}

        return batch, max_record

    def _map_record_safe(
        self,
        raw: Dict[str, Any],
        stream_name: str,
        mapper_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
        metrics: Optional[SyncMetrics] = None,
    ) -> Optional[Dict[str, Any]]:
        try:
            mapped = mapper_fn(raw)
            logger.debug("[%s] Mapped record id=%s", self.tenant_id, mapped.get("id"))
            return mapped
        except Exception as exc:
            self._send_to_dlq(raw, stream_name, exc, metrics)
            return None

    def _mask_pii(
        self,
        batch: List[Dict[str, Any]],
        pii_fields: List[str],
    ) -> List[Dict[str, Any]]:
        if not pii_fields:
            return batch

        sanitizer = getattr(self, "data_sanitizer", None)

        if sanitizer is None:
            if STRICT_PII:
                raise StripePIISanitizerMissing(
                    f"[{self.tenant_id}] data_sanitizer is None but PII masking was requested "
                    f"for fields: {pii_fields}. Attach a sanitizer before syncing."
                )
            logger.warning(
                "[%s] data_sanitizer missing — using fallback hash masking for fields: %s",
                self.tenant_id,
                pii_fields,
            )
            for row in batch:
                for col in pii_fields:
                    if col in row and row[col]:
                        value = str(row[col])
                        row[col] = f"***{hashlib.sha256(value.encode()).hexdigest()[:8]}***"
            return batch

        for row in batch:
            for col in pii_fields:
                if col in row and row[col]:
                    row[col] = sanitizer.mask(row[col])

        return batch

    # -----------------------------------------------------------------------
    # FIX #4: Event-driven CDC — dual checkpoint + 60-second rewind.
    # -----------------------------------------------------------------------

    async def sync_events(
        self,
        event_types: Optional[List[str]] = None,
        start_checkpoint: Optional[SyncCheckpoint] = None,
        limit: int = 100,
    ) -> AsyncGenerator[SyncBatch, None]:
        """
        Poll /v1/events for true CDC (Change Data Capture).

        FIX #4: Stripe events are not strictly ordered and can arrive late.
        We maintain a dual checkpoint (last_event_id + last_created_ts) and
        apply a _EVENTS_REWIND_SECS lookback so late arrivals are not missed.

        Parameters
        ----------
        event_types:       Filter by event type (e.g., ['charge.succeeded']).
        start_checkpoint:  SyncCheckpoint from the previous run.
        limit:             Events per page (max 100).
        """
        metrics = SyncMetrics(stream="events")
        self._active_metrics = metrics

        # FIX #4: Rewind by _EVENTS_REWIND_SECS to catch late-arriving events.
        last_created_ts: Optional[int] = None
        starting_after: Optional[str] = None

        if start_checkpoint:
            last_created_ts = start_checkpoint.get("created_ts")
            starting_after = start_checkpoint.get("last_id") or None

        # BoundedSet protects against re-processing during the rewind window.
        event_seen: BoundedSet = BoundedSet()

        has_more = True

        async with self._get_session() as session:
            while has_more:
                url = f"{self.api_base}/events?limit={limit}"

                # FIX #4: Apply rewind window using created[gte] instead of
                # relying purely on cursor order (which Stripe does not guarantee).
                if last_created_ts is not None:
                    rewind_ts = max(0, last_created_ts - _EVENTS_REWIND_SECS)
                    url += f"&created[gte]={rewind_ts}"

                if event_types:
                    for et in event_types:
                        url += f"&type={et}"

                if starting_after:
                    url += f"&starting_after={starting_after}"

                data = await self._fetch_page_with_backpressure(session, url, metrics)
                raw_events = data.get("data", [])

                if not raw_events:
                    break

                batch: List[Dict[str, Any]] = []
                max_created: int = 0
                last_event_id: str = ""

                for raw_event in raw_events:
                    event_id = raw_event.get("id", "")

                    # FIX #4: Skip events already seen in this run (rewind overlap).
                    if event_id in event_seen:
                        metrics.deduped_count += 1
                        continue
                    event_seen.add(event_id)

                    mapped = self._map_record_safe(
                        raw_event, "events", _map_event, metrics
                    )
                    if mapped:
                        batch.append(mapped)
                        evt_ts = int(raw_event.get("created", 0))
                        if evt_ts > max_created:
                            max_created = evt_ts
                            last_event_id = event_id

                if batch:
                    metrics.rows_synced += len(batch)
                    # FIX #4: Dual checkpoint — both event ID and created timestamp.
                    checkpoint = SyncCheckpoint(
                        last_id=last_event_id,
                        created_ts=max_created,
                        stream="events",
                        version="v1",
                    )
                    yield SyncBatch(
                        records=batch,
                        primary_key="id",
                        source_stream="events",
                        checkpoint=checkpoint,
                    )
                    # Advance last_created_ts for the next page's rewind window.
                    last_created_ts = max(last_created_ts or 0, max_created)

                has_more = data.get("has_more", False)
                if has_more and raw_events:
                    starting_after = raw_events[-1].get("id")

        logger.info(
            "✅ [%s] Stripe events sync complete | %s",
            self.tenant_id,
            metrics.to_log_dict(),
        )
        self._active_metrics = None

    # -----------------------------------------------------------------------
    # FIX #4 (v7): Nightly Reconciliation Sync
    # -----------------------------------------------------------------------

    async def sync_reconciliation(
        self,
        lookback_hours: int = _RECONCILIATION_LOOKBACK_HOURS,
        streams: Optional[List[str]] = None,
    ) -> AsyncGenerator[SyncBatch, None]:
        """
        Hybrid "Reconciliation" Pattern for Stripe CDC late arrivals.

        Runs a standard sync_historical call for mutable financial streams
        (charges, subscriptions, invoices) using `created[gte] = NOW() - lookback`.
        Default lookback is 48 hours.

        Because _synced_at and upsert logic `_meta: {op: upsert}` are idempotent,
        this safely "patches" any financial data that arrived late or was dropped
        by the events stream, without duplicating rows in the warehouse.

        Intended to be triggered once every 24 hours by the orchestrator/scheduler.

        Parameters
        ----------
        lookback_hours:  How far back to look for late-arriving mutations (default: 48h).
        streams:         Override which streams to reconcile. Defaults to
                         charges, subscriptions, invoices.
        """
        target_streams = streams or _RECONCILIATION_STREAMS
        now_ts = int(datetime.now(tz=timezone.utc).timestamp())
        reconcile_floor = now_ts - (lookback_hours * 3600)
        start_iso = datetime.fromtimestamp(reconcile_floor, tz=timezone.utc).isoformat()

        logger.info(
            "[%s] Starting Stripe reconciliation sync | streams=%s lookback=%dh floor=%s",
            self.tenant_id,
            target_streams,
            lookback_hours,
            start_iso,
        )

        for stream_name in target_streams:
            if stream_name not in _STREAM_MAPPERS:
                logger.warning(
                    "[%s] Reconciliation: skipping unsupported stream '%s'",
                    self.tenant_id,
                    stream_name,
                )
                continue

            try:
                async for batch in self.sync_historical(
                    stream_name=stream_name,
                    start_timestamp=start_iso,
                    checkpoint=None,  # Fresh pull, no checkpoint resume
                ):
                    yield batch

                logger.info(
                    "[%s] Reconciliation complete for '%s'",
                    self.tenant_id,
                    stream_name,
                )
            except Exception as exc:
                logger.error(
                    "[%s] Reconciliation failed for '%s': %s",
                    self.tenant_id,
                    stream_name,
                    exc,
                )
                # Continue with remaining streams — don't let one failure block others.
                continue

        logger.info(
            "[%s] ✅ Stripe reconciliation sync complete for all streams",
            self.tenant_id,
        )
