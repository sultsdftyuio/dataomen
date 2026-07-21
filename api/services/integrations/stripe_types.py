"""
ARCLI.TECH — Stripe Connector: Core Types, Constants & Observability

This module is fully self-contained and has no internal dependencies on other
stripe_*.py modules.  It defines:
  • Environment-driven constants
  • Exception hierarchy
  • BoundedSet (LRU-evicting dedup container)
  • SyncCheckpoint / SyncBatch TypedDicts
  • SyncMetrics telemetry dataclass
"""

import logging
import time
from collections import OrderedDict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, TypedDict

import aiohttp

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

import os

_STRIPE_API_VERSION: str = os.environ.get("STRIPE_API_VERSION", "2023-10-16")

_DEFAULT_INCREMENTAL_WINDOW_SECS: int = int(
    os.environ.get("STRIPE_INCREMENTAL_WINDOW_SECS", 7 * 24 * 3600)
)

_MAX_PAGES_DEFAULT: int = 10_000

# FIX #5: Default timeout applied to every outbound HTTP request.
_HTTP_TIMEOUT = aiohttp.ClientTimeout(total=30)

# FIX #7: Max IDs held in memory for deduplication before LRU eviction.
_DEDUP_MAX_SIZE: int = int(os.environ.get("STRIPE_DEDUP_MAX_SIZE", "200000"))
_LATENCY_SAMPLE_MAX_SIZE: int = int(
    os.environ.get("STRIPE_LATENCY_SAMPLE_MAX_SIZE", "2048")
)

# FIX #8: Concurrency adaptation thresholds.
_CONCURRENCY_RETRY_HIGH: float = 0.10   # retry rate above this → back off
_CONCURRENCY_RETRY_LOW:  float = 0.02   # retry rate below this → speed up
_CONCURRENCY_P95_HIGH:   float = 5_000  # ms — back off when p95 is this slow
_CONCURRENCY_P95_LOW:    float = 1_000  # ms — safe to speed up below this
_CONCURRENCY_MIN:        int   = 1
_CONCURRENCY_MAX:        int   = 10

# Stream priorities for differentiated sync scheduling (lower = higher priority)
STREAM_PRIORITY: Dict[str, int] = {
    "charges": 1,
    "invoices": 1,
    "subscriptions": 2,
    "customers": 3,
    "disputes": 2,
}

# PII strict mode — if False, uses fallback masking instead of hard fail.
STRICT_PII: bool = os.environ.get("STRIPE_STRICT_PII", "false").lower() == "true"

# Default concurrent request limit for backpressure.
DEFAULT_SEMAPHORE_LIMIT: int = int(os.environ.get("STRIPE_SEMAPHORE_LIMIT", "5"))

# FIX #4: Rewind window (seconds) for Events API to handle late arrivals.
_EVENTS_REWIND_SECS: int = int(os.environ.get("STRIPE_EVENTS_REWIND_SECS", "60"))

# FIX #4 (v7): Nightly reconciliation — streams to re-sync and lookback depth.
_RECONCILIATION_STREAMS: List[str] = ["charges", "subscriptions", "invoices"]
_RECONCILIATION_LOOKBACK_HOURS: int = int(
    os.environ.get("STRIPE_RECONCILIATION_LOOKBACK_HOURS", "48")
)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class StripeRateLimitError(Exception):
    """Triggered by HTTP 429 from Stripe API."""


class StripeAuthError(Exception):
    """Triggered by HTTP 401 from Stripe API."""


class StripePIISanitizerMissing(RuntimeError):
    """Raised when PII masking is attempted without a data_sanitizer attached."""


# ---------------------------------------------------------------------------
# FIX #7: Bounded dedup set — LRU-evicting, safe for long-running syncs.
# ---------------------------------------------------------------------------


class BoundedSet:
    """
    An ordered set that evicts the oldest entry when it exceeds `maxsize`.
    Thread-safe for single-threaded asyncio usage (no explicit lock needed).
    """

    def __init__(self, maxsize: int = _DEDUP_MAX_SIZE) -> None:
        self._data: "OrderedDict[str, None]" = OrderedDict()
        self._maxsize = maxsize

    def __contains__(self, item: str) -> bool:
        return item in self._data

    def add(self, item: str) -> None:
        if item in self._data:
            # Refresh position so it is not evicted early.
            self._data.move_to_end(item)
            return
        if len(self._data) >= self._maxsize:
            self._data.popitem(last=False)  # Evict oldest.
        self._data[item] = None

    def __len__(self) -> int:
        return len(self._data)


# ---------------------------------------------------------------------------
# Checkpoint (structured, durable)
# ---------------------------------------------------------------------------


class SyncCheckpoint(TypedDict):
    """Durable cursor persisted by the SyncEngine between runs."""

    last_id: str
    created_ts: int
    stream: str
    version: str


def _make_checkpoint(max_record: Dict[str, Any], stream: str) -> SyncCheckpoint:
    """Create checkpoint from max created timestamp record (prevents drift)."""
    return SyncCheckpoint(
        last_id=max_record.get("id", ""),
        created_ts=int(max_record.get("created", 0)),
        stream=stream,
        version="v1",
    )


# ---------------------------------------------------------------------------
# Sync batch envelope
# ---------------------------------------------------------------------------


class SyncBatch(TypedDict):
    """Wraps each yielded batch with UPSERT metadata."""

    records: List[Dict[str, Any]]
    primary_key: str
    source_stream: str
    checkpoint: SyncCheckpoint


# ---------------------------------------------------------------------------
# Observability
# ---------------------------------------------------------------------------


@dataclass
class SyncMetrics:
    """Lightweight telemetry collected for every sync_historical call."""

    stream: str
    rows_synced: int = 0
    pages_fetched: int = 0
    dlq_count: int = 0
    retry_count: int = 0
    deduped_count: int = 0
    started_at: float = field(default_factory=time.monotonic)
    _latencies_ms: deque[float] = field(
        default_factory=lambda: deque(maxlen=max(1, _LATENCY_SAMPLE_MAX_SIZE)),
        repr=False,
    )

    def record_latency(self, ms: float) -> None:
        self._latencies_ms.append(ms)

    @property
    def p50_latency_ms(self) -> Optional[float]:
        return self._percentile(50)

    @property
    def p95_latency_ms(self) -> Optional[float]:
        return self._percentile(95)

    def _percentile(self, pct: int) -> Optional[float]:
        if not self._latencies_ms:
            return None
        s = sorted(self._latencies_ms)
        idx = max(0, int(len(s) * pct / 100) - 1)
        return round(s[idx], 2)

    def elapsed_secs(self) -> float:
        return time.monotonic() - self.started_at

    def rows_per_sec(self) -> float:
        elapsed = self.elapsed_secs()
        return round(self.rows_synced / elapsed, 1) if elapsed > 0 else 0.0

    def retry_rate(self) -> float:
        return self.retry_count / max(self.pages_fetched, 1)

    def to_log_dict(self) -> Dict[str, Any]:
        return {
            "stream": self.stream,
            "rows_synced": self.rows_synced,
            "pages_fetched": self.pages_fetched,
            "dlq_count": self.dlq_count,
            "retry_count": self.retry_count,
            "deduped_count": self.deduped_count,
            "elapsed_secs": round(self.elapsed_secs(), 2),
            "rows_per_sec": self.rows_per_sec(),
            "p50_latency_ms": self.p50_latency_ms,
            "p95_latency_ms": self.p95_latency_ms,
        }
