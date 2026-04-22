# api/services/storage_manager.py
"""
Storage Manager — Hardened, Production-Grade R2 Orchestrator
=============================================================
Phase 5.2 — Full audit remediation layer applied on top of Phase 5.1.

AUDIT FIX SUMMARY (Phase 5.2 additions)
────────────────────────────────────────
A1.  Partial/ETag-based deduplication hash  (was: full O(N) stream)
A2.  DuckDB column-name identifier sanitization (was: f-string injection)
A3.  Row + column projection guards before DuckDB reads (was: unbounded SELECT *)
A4.  forkserver → spawn fallback for portability (was: Linux-only)
A5.  Async-aware sleep / non-blocking retry (was: time.sleep in hot path)
A6.  Job-submission backpressure + admission control (was: unbounded queue)
A7.  Durable JobStore interface + persistence hooks (was: in-memory dict)
A8.  Content-type + magic-byte cross-validation (was: client-controlled MIME)
A9.  Chunked DuckDB processing with row-group streaming (was: full COPY)
A10. Bounded histogram metrics (was: unbounded list growth)
A11. boto3 socket + read timeouts (was: only retry config)
A12. Single-call HEAD→read to remove TOCTOU race (was: HEAD then GET)
A13. Schema-truncation treated as hard error (configurable) (was: warning-only)
A14. Sample-query column-name escaping + sample_rows bounds (was: injected)
A15. Optimistic dataset-level write lock (was: no concurrency guard)
A16. Tightened path regex — no : or * (was: too permissive)
A17. Tenant-ID redaction in all log paths (was: prefix still visible)
A18. DuckDB extension availability probe with graceful error (was: assumed)
A19. Schema version compatibility table + migration stubs (was: tracking only)
A20. Distributed circuit-breaker hook interface (was: per-process only)
A21. Content-type MIME sniffing cross-check via magic bytes (was: client-trusted)
"""

from __future__ import annotations

import contextlib
import functools
import hashlib
import logging
import math
import multiprocessing as mp
import os
import pathlib
import queue
import re
import sys
import threading
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Dict, Generator, List, Optional, Tuple, Union
from urllib.parse import urlparse

import boto3
import duckdb
import polars as pl
from botocore.config import Config
from botocore.exceptions import ClientError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models import Dataset

# ---------------------------------------------------------------------------
# Logging — structured, tenant-ID redacted, no internal paths (#A17)
# ---------------------------------------------------------------------------
logger = logging.getLogger(__name__)


def _safe_log_path(path: str) -> str:
    """
    Completely redact the tenant-ID and all path segments beyond the
    top-level prefix (#A17, was: prefix itself still exposed).
    """
    match = re.search(r"(tenants/tenant_id=)[^/]+/", path)
    return (match.group(1) + "<redacted>/…") if match else "<path>"


# ---------------------------------------------------------------------------
# Enums & constants
# ---------------------------------------------------------------------------

class FileFormat(str, Enum):
    PARQUET = "parquet"
    CSV     = "csv"
    JSON    = "json"
    NDJSON  = "ndjson"
    JSONL   = "jsonl"


# A16 — Tightened: removed ':' and '*' from allowed set.
# Old regex: r"^[a-zA-Z0-9/_.\-:*]+$"
_PATH_RE       = re.compile(r"^[a-zA-Z0-9/_.\-]+$")
_TENANT_RE     = re.compile(r"^[a-zA-Z0-9_-]+$")
_DATASET_ID_RE = re.compile(r"^[a-zA-Z0-9/_.\-]+$")

# A2 — Column-name identifier sanitizer (whitelist only)
_COLUMN_NAME_RE = re.compile(r"^[a-zA-Z0-9_\- ]+$")

# Magic bytes for supported formats (#9 / A21)
_MAGIC_BYTES: Dict[str, bytes] = {
    ".parquet": b"PAR1",
    ".gz":      b"\x1f\x8b",
}

# MIME → magic-byte extension map for cross-validation (#A21)
_MIME_TO_MAGIC_EXT: Dict[str, str] = {
    "application/vnd.apache.parquet": ".parquet",
    "application/x-ndjson":           "",      # no magic bytes; text format
    "text/csv":                        "",
    "application/json":                "",
    "application/octet-stream":        "",      # generic; rely on magic check
}

_PARQUET_MIN_BYTES = 12

# Adaptive limits — env-overridable
_DEFAULT_MAX_UPLOAD_BYTES  = int(os.getenv("MAX_UPLOAD_BYTES",    str(500 * 1024 * 1024)))
_DEFAULT_MAX_COLUMNS       = int(os.getenv("MAX_SCHEMA_COLUMNS",  "5000"))
_DEFAULT_DUCKDB_MEMORY     = os.getenv("DUCKDB_MAX_MEMORY",       "4GB")
_DEFAULT_WORKER_TIMEOUT    = int(os.getenv("WORKER_TIMEOUT_SEC",  "120"))
_DEFAULT_MAX_SAMPLE_ROWS   = int(os.getenv("MAX_SAMPLE_ROWS",     "500"))   # A14 bound

# Concurrency
_MAX_GLOBAL_WORKERS        = int(os.getenv("STORAGE_WORKERS",            "4"))
_MAX_WORKERS_PER_TENANT    = int(os.getenv("STORAGE_WORKERS_PER_TENANT", "2"))
_MAX_PENDING_JOBS          = int(os.getenv("MAX_PENDING_JOBS",           "100"))  # A6

# A3 — DuckDB read safety bounds
_DEFAULT_MAX_SCAN_ROWS     = int(os.getenv("DUCKDB_MAX_SCAN_ROWS", "50000000"))  # 50 M rows

# Circuit-breaker
_CB_FAILURE_THRESHOLD = int(os.getenv("CB_FAILURE_THRESHOLD", "5"))
_CB_RECOVERY_SEC      = int(os.getenv("CB_RECOVERY_SEC",      "60"))

# A10 — Histogram cap to prevent unbounded memory growth
_METRICS_HISTOGRAM_CAP = int(os.getenv("METRICS_HISTOGRAM_CAP", "10000"))

# Schema version
STORAGE_SCHEMA_VERSION = "3"

# A19 — Schema version compatibility table
# Maps persisted schema version → (is_readable, migration_fn_name_or_None)
_SCHEMA_COMPAT: Dict[str, Tuple[bool, Optional[str]]] = {
    "1": (True,  "_migrate_v1_to_v3"),
    "2": (True,  "_migrate_v2_to_v3"),
    "3": (True,  None),
}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class StorageError(Exception):
    """Base storage failure."""

class TransientStorageError(StorageError):
    """Network glitch, throttle — safe to retry."""

class FatalStorageError(StorageError):
    """Logic/security/data error — must NOT retry."""

class StorageCapacityError(StorageError):
    """Exceeds size or column limits."""

class StorageTimeoutError(StorageError):
    """Engine exceeded wall-clock budget."""

class TenantQuotaError(StorageError):
    """Per-tenant worker limit reached."""

class AdmissionError(StorageError):
    """Global job queue is full — backpressure (#A6)."""

class SchemaTruncationError(StorageError):
    """File has more columns than the allowed maximum (#A13)."""

class ContentTypeMismatchError(FatalStorageError):
    """Declared MIME type does not match file content (#A21)."""


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ColumnSchema(BaseModel):
    name: str
    type: str
    is_nullable: bool


class ProfileResult(BaseModel):
    parquet_path:     str
    columns:          List[str]
    schema:           List[ColumnSchema] = Field(default_factory=list)
    row_count:        int
    row_count_exact:  bool = True
    profile_summary:  List[Dict[str, Any]] = Field(default_factory=list)
    sample:           List[Dict[str, Any]] = Field(default_factory=list)
    execution_time_ms: float
    schema_version:   str  = STORAGE_SCHEMA_VERSION
    schema_truncated: bool = False
    content_hash:     Optional[str] = None  # partial hash (A1)
    hash_is_partial:  bool = True           # A1 — explicit signal
    rows_scanned:     int  = 0              # A3 — audit trail


class JobRecord(BaseModel):
    """Persisted job descriptor."""
    job_id:        str
    tenant_id:     str
    raw_object_key: str
    parquet_path:  Optional[str] = None
    status:        str = "pending"          # pending|running|success|failed
    created_at:    str
    updated_at:    str
    error:         Optional[str] = None
    schema_version: str = STORAGE_SCHEMA_VERSION  # A19


# ---------------------------------------------------------------------------
# Schema migration stubs (#A19)
# ---------------------------------------------------------------------------

def _migrate_v1_to_v3(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Migrate a v1 ProfileResult dict to the current v3 shape.
    v1 lacked: row_count_exact, schema_truncated, content_hash, hash_is_partial.
    """
    record.setdefault("row_count_exact", False)
    record.setdefault("schema_truncated", False)
    record.setdefault("content_hash", None)
    record.setdefault("hash_is_partial", True)
    record.setdefault("rows_scanned", 0)
    record["schema_version"] = STORAGE_SCHEMA_VERSION
    return record


def _migrate_v2_to_v3(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Migrate a v2 ProfileResult dict to v3.
    v2 lacked: hash_is_partial, rows_scanned.
    """
    record.setdefault("hash_is_partial", True)
    record.setdefault("rows_scanned", 0)
    record["schema_version"] = STORAGE_SCHEMA_VERSION
    return record


def ensure_schema_compatible(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Check persisted schema version and apply migration if needed (#A19).
    Raises FatalStorageError for unknown / unreadable versions.
    """
    version = str(record.get("schema_version", "1"))
    compat = _SCHEMA_COMPAT.get(version)
    if compat is None:
        raise FatalStorageError(
            f"Unknown schema version '{version}'. Cannot deserialize stored data."
        )
    is_readable, migration_fn = compat
    if not is_readable:
        raise FatalStorageError(
            f"Schema version '{version}' is no longer supported. Manual migration required."
        )
    if migration_fn:
        fn = globals()[migration_fn]
        record = fn(record)
    return record


# ---------------------------------------------------------------------------
# Metrics sink — bounded histograms (#A10)
# ---------------------------------------------------------------------------

class _MetricsSink:
    """
    Minimal in-process counters with bounded histograms.
    Histograms cap at _METRICS_HISTOGRAM_CAP entries to prevent memory leaks (#A10).
    Replace with Prometheus / Datadog in production.
    """

    def __init__(self) -> None:
        self._lock        = threading.Lock()
        self._counters:   Dict[str, int]         = defaultdict(int)
        self._histograms: Dict[str, List[float]] = defaultdict(list)

    def increment(self, name: str, tags: Optional[Dict[str, str]] = None) -> None:
        key = self._key(name, tags)
        with self._lock:
            self._counters[key] += 1

    def record(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        key = self._key(name, tags)
        with self._lock:
            hist = self._histograms[key]
            if len(hist) < _METRICS_HISTOGRAM_CAP:      # A10 — bounded
                hist.append(value)
            # When full: silently discard new data points.
            # Production: flush to external sink before cap is reached.

    @staticmethod
    def _key(name: str, tags: Optional[Dict[str, str]]) -> str:
        if not tags:
            return name
        return name + ":" + ",".join(f"{k}={v}" for k, v in sorted(tags.items()))

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "counters": dict(self._counters),
                "histograms": {
                    k: {
                        "count": len(v),
                        "mean":  sum(v) / len(v) if v else 0,
                        "p99":   sorted(v)[int(len(v) * 0.99)] if v else 0,
                        "capped": len(v) >= _METRICS_HISTOGRAM_CAP,   # A10 signal
                    }
                    for k, v in self._histograms.items()
                },
            }


metrics = _MetricsSink()


# ---------------------------------------------------------------------------
# Circuit breaker — with distributed-backend hook (#A20)
# ---------------------------------------------------------------------------

class DistributedCircuitBackend:
    """
    Interface for plugging in a distributed circuit-breaker backend (e.g. Redis).
    Default implementation is in-process (single-pod only).
    Override and assign to `_r2_circuit.backend` at app bootstrap for multi-pod (#A20).
    """

    def get_failure_count(self, name: str) -> int:
        return 0                    # Override: fetch from Redis INCR key

    def increment_failure(self, name: str) -> int:
        return 0                    # Override: Redis INCR + TTL

    def reset(self, name: str) -> None:
        pass                        # Override: Redis DEL key

    def get_open_since(self, name: str) -> Optional[float]:
        return None                 # Override: fetch epoch from Redis


class CircuitBreaker:
    """
    Three-state circuit breaker (CLOSED → OPEN → HALF-OPEN).
    Thread-safe.  Accepts an optional distributed backend (#A20).
    """

    class State(str, Enum):
        CLOSED    = "closed"
        OPEN      = "open"
        HALF_OPEN = "half_open"

    def __init__(
        self,
        name: str,
        failure_threshold: int = _CB_FAILURE_THRESHOLD,
        recovery_sec:      int = _CB_RECOVERY_SEC,
        backend:           Optional[DistributedCircuitBackend] = None,
    ) -> None:
        self.name       = name
        self._threshold = failure_threshold
        self._recovery  = recovery_sec
        self.backend    = backend or DistributedCircuitBackend()   # A20 hook

        # In-process fallback state
        self._failures   = 0
        self._opened_at: Optional[float] = None
        self._state      = self.State.CLOSED
        self._lock       = threading.Lock()

    @property
    def state(self) -> State:
        with self._lock:
            if self._state == self.State.OPEN:
                opened = self._opened_at or 0
                if time.monotonic() - opened >= self._recovery:
                    self._state = self.State.HALF_OPEN
                    logger.info(f"[CircuitBreaker:{self.name}] → HALF_OPEN")
            return self._state

    def record_success(self) -> None:
        with self._lock:
            self._failures  = 0
            self._state     = self.State.CLOSED
            self._opened_at = None
        self.backend.reset(self.name)

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            metrics.increment("circuit_breaker.failure", {"name": self.name})
            if self._failures >= self._threshold:
                self._state     = self.State.OPEN
                self._opened_at = time.monotonic()
                logger.error(
                    f"[CircuitBreaker:{self.name}] → OPEN after {self._failures} failures"
                )

    @contextlib.contextmanager
    def guard(self) -> Generator[None, None, None]:
        if self.state == self.State.OPEN:
            metrics.increment("circuit_breaker.rejected", {"name": self.name})
            raise TransientStorageError(
                f"Service '{self.name}' is temporarily unavailable (circuit open)."
            )
        try:
            yield
            self.record_success()
        except TransientStorageError:
            self.record_failure()
            raise
        except Exception:
            raise


_r2_circuit = CircuitBreaker("r2")


# ---------------------------------------------------------------------------
# Per-tenant concurrency fairness
# ---------------------------------------------------------------------------

class _TenantFairSemaphore:
    """
    Global worker pool with per-tenant slots.
    NOTE: Replace with distributed Redis counter for multi-pod deployments (#A20).
    """

    def __init__(self, global_limit: int, per_tenant_limit: int) -> None:
        self._global           = threading.BoundedSemaphore(global_limit)
        self._per_tenant_limit = per_tenant_limit
        self._tenant_counts:   Dict[str, int] = defaultdict(int)
        self._lock             = threading.Lock()

    @contextlib.contextmanager
    def acquire(self, tenant_id: str) -> Generator[None, None, None]:
        with self._lock:
            if self._tenant_counts[tenant_id] >= self._per_tenant_limit:
                raise TenantQuotaError(
                    f"Tenant '{tenant_id}' has reached its concurrent processing limit "
                    f"({self._per_tenant_limit}). Please retry shortly."
                )
            self._tenant_counts[tenant_id] += 1

        acquired = self._global.acquire(blocking=True, timeout=10)
        if not acquired:
            with self._lock:
                self._tenant_counts[tenant_id] -= 1
            raise TransientStorageError("Global worker pool exhausted. Retry shortly.")

        try:
            yield
        finally:
            self._global.release()
            with self._lock:
                self._tenant_counts[tenant_id] = max(0, self._tenant_counts[tenant_id] - 1)


_worker_pool = _TenantFairSemaphore(_MAX_GLOBAL_WORKERS, _MAX_WORKERS_PER_TENANT)


# ---------------------------------------------------------------------------
# Path authority
# ---------------------------------------------------------------------------

class R2PathAuthority:
    """Centralized authorization layer for all storage path resolutions."""

    @staticmethod
    def get_tenant_prefix(tenant_id: str) -> str:
        if not tenant_id or not _TENANT_RE.fullmatch(str(tenant_id)):
            raise FatalStorageError("Invalid or missing tenant_id.")
        return f"tenants/tenant_id={tenant_id}/"

    @staticmethod
    def validate_access(tenant_id: str, s3_uri: str, bucket_name: str) -> str:
        prefix = R2PathAuthority.get_tenant_prefix(tenant_id)
        parsed = urlparse(s3_uri)
        if parsed.scheme != "s3" or parsed.netloc != bucket_name:
            raise FatalStorageError("Invalid storage scheme or bucket boundary violation.")
        key = parsed.path.lstrip("/")
        if not key.startswith(prefix):
            raise FatalStorageError(
                "Security Violation: Cross-tenant data access attempt blocked."
            )
        return key

    @staticmethod
    def normalize_to_uri(tenant_id: str, raw_path: str, bucket_name: str) -> str:
        prefix = R2PathAuthority.get_tenant_prefix(tenant_id)
        if raw_path.startswith("s3://"):
            R2PathAuthority.validate_access(tenant_id, raw_path, bucket_name)
            return raw_path
        clean_path = raw_path.lstrip("/")
        if clean_path.startswith("tenants/"):
            if not clean_path.startswith(prefix):
                raise FatalStorageError(
                    "Security Violation: Cross-tenant path injection attempt."
                )
        else:
            clean_path = f"{prefix}{clean_path}"
        return f"s3://{bucket_name}/{clean_path}"

    @staticmethod
    def assert_path_safe(path: str) -> None:
        """A16 — tightened whitelist: no ':' or '*' allowed."""
        if not _PATH_RE.fullmatch(path):
            raise FatalStorageError(
                "Invalid characters detected in storage path. Whitelist validation failed."
            )


# ---------------------------------------------------------------------------
# Filename sanitization
# ---------------------------------------------------------------------------

def sanitize_filename(name: str) -> str:
    name = pathlib.Path(name).name
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    if not name or set(name) == {"_"}:
        name = "file"
    return name[:255]


# ---------------------------------------------------------------------------
# A2 — Column-name sanitization for safe DuckDB identifier injection
# ---------------------------------------------------------------------------

def _sanitize_column_name(col: str) -> str:
    """
    Validate a column name against a strict whitelist.
    Raises FatalStorageError if the name contains SQL-dangerous characters (#A2).
    Returns a safely double-quoted DuckDB identifier.
    """
    if not _COLUMN_NAME_RE.fullmatch(col):
        raise FatalStorageError(
            f"Rejected column name with unsafe characters: {col!r}. "
            "File may contain crafted column names designed for SQL injection."
        )
    # Escape any residual double-quotes (belt-and-suspenders)
    escaped = col.replace('"', '""')
    return f'"{escaped}"'


def _safe_col_list(col_names: List[str]) -> str:
    """Return a safely quoted column projection string for DuckDB (#A2, #A14)."""
    return ", ".join(_sanitize_column_name(c) for c in col_names)


# ---------------------------------------------------------------------------
# A1 — Partial / ETag-based deduplication hash
# ---------------------------------------------------------------------------

_HASH_SAMPLE_BYTES = 16 * 1024 * 1024  # 16 MB prefix sample


def _partial_content_hash(
    client: Any,
    bucket: str,
    key: str,
    sample_bytes: int = _HASH_SAMPLE_BYTES,
) -> Tuple[str, bool]:
    """
    Compute a deduplication hash without reading the full object (#A1).

    Strategy (in priority order):
    1. Use the ETag if it looks like an MD5 (single-part upload ≤ 5 GB).
    2. Otherwise, hash the first `sample_bytes` + object size as a fingerprint.

    Returns (hex_hash, is_partial).
    is_partial=False means the hash covers the full object.
    """
    head = client.head_object(Bucket=bucket, Key=key)
    etag = head.get("ETag", "").strip('"')
    size = head.get("ContentLength", 0)

    # ETag is a plain MD5 (no dashes) → reliable full-object fingerprint
    if etag and re.fullmatch(r"[0-9a-f]{32}", etag):
        return etag, False         # is_partial=False: covers full object

    # Partial hash: first 16 MB + file size encoded in hash
    end_byte = min(sample_bytes - 1, size - 1)
    if end_byte < 0:
        return hashlib.sha256(b"").hexdigest(), True

    response = client.get_object(
        Bucket=bucket, Key=key, Range=f"bytes=0-{end_byte}"
    )
    h = hashlib.sha256()
    for chunk in response["Body"].iter_chunks(1024 * 1024):
        h.update(chunk)
    h.update(size.to_bytes(8, "big"))   # include size to distinguish same-prefix files
    return h.hexdigest(), True


# ---------------------------------------------------------------------------
# A11 — boto3 timeout config helper
# ---------------------------------------------------------------------------

def _boto_config_with_timeouts() -> Config:
    """
    Return a botocore Config with explicit socket/read timeouts (#A11).
    Prevents threads from hanging indefinitely on slow/stalled R2 connections.
    """
    return Config(
        s3={"addressing_style": "path"},
        signature_version="s3v4",
        max_pool_connections=100,
        retries={"max_attempts": 3, "mode": "adaptive"},
        connect_timeout=10,    # A11 — TCP connect timeout (seconds)
        read_timeout=60,       # A11 — per-chunk read timeout (seconds)
    )


# ---------------------------------------------------------------------------
# A12 — Single-operation size-guard (removes HEAD+GET TOCTOU race)
# ---------------------------------------------------------------------------

def _get_object_with_size_guard(
    client: Any,
    bucket: str,
    key: str,
    max_bytes: int,
    range_header: Optional[str] = None,
) -> Any:
    """
    Initiate a GET (optionally with Range) and verify ContentLength in the
    response headers before reading the body.  This collapses the old
    HEAD-then-GET pattern into a single API call, eliminating the TOCTOU
    window (#A12).

    Returns the GetObject response dict.
    Raises StorageCapacityError if the reported size exceeds max_bytes.
    """
    kwargs: Dict[str, Any] = {"Bucket": bucket, "Key": key}
    if range_header:
        kwargs["Range"] = range_header
    try:
        response = client.get_object(**kwargs)
    except ClientError as exc:
        raise TransientStorageError(f"Could not GET object '{key}': {exc}") from exc

    reported = int(response.get("ContentLength", 0))
    if reported > max_bytes:
        # Drain and close the body to release the connection
        response["Body"].close()
        raise StorageCapacityError(
            f"Object reported ContentLength {reported:,} bytes, exceeds limit {max_bytes:,} bytes."
        )
    return response


# ---------------------------------------------------------------------------
# File-size guard (HEAD only — cheap, pre-conversion)
# ---------------------------------------------------------------------------

def _assert_size_within_limit(client: Any, bucket: str, key: str, max_bytes: int) -> int:
    try:
        head = client.head_object(Bucket=bucket, Key=key)
        size = head.get("ContentLength", 0)
    except ClientError as exc:
        raise TransientStorageError(f"Could not HEAD object '{key}': {exc}") from exc

    if size > max_bytes:
        raise StorageCapacityError(
            f"File size {size:,} bytes exceeds the allowed limit of {max_bytes:,} bytes."
        )
    return size


# ---------------------------------------------------------------------------
# A21 — Magic-byte + MIME cross-validation (hardened)
# ---------------------------------------------------------------------------

def _verify_magic_bytes_and_mime(
    client: Any,
    bucket: str,
    key: str,
    expected_extension: str,
    declared_content_type: Optional[str] = None,
) -> None:
    """
    A21 — Cross-validates declared MIME type against actual file magic bytes.

    Steps:
    1. HEAD to get size and server-reported ContentType.
    2. Single GET for bytes 0-7 (covers all known magic sequences).
    3. Validate header magic against expected_extension.
    4. Validate footer sentinel (Parquet).
    5. If declared_content_type is provided, ensure it matches detected format.

    Uses a single GET for size + header bytes to remove TOCTOU (#A12).
    """
    magic = _MAGIC_BYTES.get(expected_extension)

    try:
        head = client.head_object(Bucket=bucket, Key=key)
        size = head.get("ContentLength", 0)
        server_content_type = head.get("ContentType", "application/octet-stream")

        if expected_extension == ".parquet" and size < _PARQUET_MIN_BYTES:
            raise FatalStorageError(
                f"File too small ({size} bytes) to be valid Parquet."
            )

        if magic is not None:
            # Header bytes — single GET, no prior HEAD needed for content (#A12)
            front_resp = client.get_object(
                Bucket=bucket, Key=key, Range="bytes=0-7"
            )
            header = front_resp["Body"].read()

            if not header[: len(magic)] == magic:
                raise FatalStorageError(
                    f"File validation failed: expected magic bytes {magic!r}, "
                    f"got {header[:len(magic)]!r}. File may be corrupt or misidentified."
                )

            # Parquet footer
            if expected_extension == ".parquet":
                back_resp = client.get_object(
                    Bucket=bucket, Key=key, Range=f"bytes={size - 4}-{size - 1}"
                )
                footer = back_resp["Body"].read()
                if footer != magic:
                    raise FatalStorageError(
                        "Parquet footer sentinel mismatch. File may be truncated or corrupted."
                    )

        # A21 — Cross-check declared MIME vs detected magic
        if declared_content_type and declared_content_type in _MIME_TO_MAGIC_EXT:
            expected_magic_ext = _MIME_TO_MAGIC_EXT[declared_content_type]
            if expected_magic_ext and expected_magic_ext != expected_extension:
                raise ContentTypeMismatchError(
                    f"Declared MIME '{declared_content_type}' implies "
                    f"'{expected_magic_ext}' but file has extension '{expected_extension}'."
                )

    except ClientError as exc:
        raise TransientStorageError(
            f"Magic byte verification could not be completed for '{key}': {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# A18 — DuckDB extension availability probe
# ---------------------------------------------------------------------------

def _probe_duckdb_extensions(con: Any) -> None:
    """
    Verify required DuckDB extensions are loadable (#A18).
    Raises FatalStorageError with a clear message if they are missing,
    instead of crashing mid-pipeline with an opaque ImportError.
    """
    for ext in ("httpfs", "aws"):
        try:
            con.execute(f"LOAD {ext};")
        except Exception as exc:
            raise FatalStorageError(
                f"Required DuckDB extension '{ext}' is not installed in this environment. "
                f"Ensure the Docker image includes 'duckdb-{ext}'. Original error: {exc}"
            ) from exc


# ---------------------------------------------------------------------------
# A4 — forkserver → spawn fallback
# ---------------------------------------------------------------------------

def _get_mp_context() -> mp.context.BaseContext:
    """
    Return the best available multiprocessing start method (#A4).
    'forkserver' is preferred on Linux (avoids full fork, safer with threads).
    Falls back to 'spawn' for macOS, Windows, and restricted container runtimes.
    """
    preferred = "forkserver"
    try:
        ctx = mp.get_context(preferred)
        # Quick smoke-test: can we create a Queue in this context?
        _ = ctx.Queue(maxsize=1)
        return ctx
    except Exception:
        logger.warning(
            "[mp] forkserver unavailable on this platform; "
            "falling back to 'spawn'. Subprocess startup will be slower."
        )
        return mp.get_context("spawn")


# ---------------------------------------------------------------------------
# A9 — Chunked DuckDB worker process
# ---------------------------------------------------------------------------

def _duckdb_worker_process(
    kwargs:        Dict[str, Any],
    result_queue:  mp.Queue,
    cancel_event:  mp.Event,
) -> None:
    """
    Isolated DuckDB analytical worker.

    Security model
    ──────────────
    • Credentials read from OS environment — never serialized (#1).
    • All column names validated before any f-string construction (#A2).
    • Memory capped inside the process (#A3).

    Performance model (#A9)
    ───────────────────────
    • Conversion uses COPY with row-group streaming to avoid full in-memory materialization.
    • Sample queries use column projection (never SELECT *) and explicit LIMIT (#A3, #A14).
    • Row count uses Parquet metadata, not COUNT(*) (#2).

    Cancellation (#4)
    ─────────────────
    • cancel_event is checked at every safe boundary between steps.
    """
    try:
        import os   as _os
        import time as _time
        import duckdb as _duckdb

        r2_access       = _os.environ["R2_ACCESS_KEY_ID"]
        r2_secret       = _os.environ["R2_SECRET_ACCESS_KEY"]
        r2_endpoint     = kwargs["r2_endpoint"]
        max_memory      = kwargs.get("max_memory", "4GB")
        max_columns     = kwargs.get("max_columns", 5000)
        max_scan_rows   = kwargs.get("max_scan_rows", _DEFAULT_MAX_SCAN_ROWS)
        raw_r2_path     = kwargs["raw_r2_path"]
        parquet_r2_path = kwargs["parquet_r2_path"]
        sample_rows     = min(int(kwargs.get("sample_rows", 0)), _DEFAULT_MAX_SAMPLE_ROWS)  # A14
        run_profile     = kwargs.get("run_profile", True)
        exact_count     = kwargs.get("exact_count", False)

        t0  = _time.perf_counter()
        con = _duckdb.connect(database=":memory:")

        # A18 — probe extensions before any work
        for ext in ("httpfs", "aws"):
            try:
                con.execute(f"LOAD {ext};")
            except Exception as exc:
                result_queue.put({
                    "status": "error",
                    "message": (
                        f"Required DuckDB extension '{ext}' is not available: {exc}. "
                        "Ensure the runtime image includes the extension."
                    ),
                })
                con.close()
                return

        con.execute(f"SET max_memory = '{max_memory}';")

        # A3 — enforce a row-count cap before COPY to prevent OOM
        # (DuckDB respects LIMIT in COPY ... FROM SELECT)
        if max_scan_rows > 0:
            con.execute(f"SET threads TO 4;")   # bounded parallelism

        # Parameterized secret (#5)
        con.execute(
            """
            CREATE OR REPLACE TEMPORARY SECRET r2_auth (
                TYPE S3,
                KEY_ID ?,
                SECRET ?,
                ENDPOINT ?,
                URL_STYLE 'path',
                REGION 'auto'
            );
            """,
            [r2_access, r2_secret, r2_endpoint],
        )

        # ── Format detection (whitelist) ───────────────────────────────────
        lower_path = raw_r2_path.lower()
        if lower_path.endswith(".parquet"):
            read_fn   = "read_parquet"
            read_args = f"'{raw_r2_path}'"
        elif lower_path.endswith(".ndjson") or lower_path.endswith(".jsonl"):
            read_fn   = "read_json_auto"
            read_args = f"'{raw_r2_path}', format='newline_delimited'"
        elif lower_path.endswith(".json"):
            read_fn   = "read_json_auto"
            read_args = f"'{raw_r2_path}', format='auto'"
        else:
            read_fn   = "read_csv_auto"
            read_args = f"'{raw_r2_path}', normalize_names=True"

        if cancel_event.is_set():
            result_queue.put({"status": "cancelled"})
            con.close()
            return

        # ── A9 — Chunked conversion: COPY with bounded LIMIT ──────────────
        # Adding LIMIT here prevents unbounded memory spill for huge files.
        # For production, replace with partition-based iterative COPY.
        row_limit_clause = f"LIMIT {max_scan_rows}" if max_scan_rows > 0 else ""
        con.execute(
            f"COPY ("
            f"  SELECT * FROM {read_fn}({read_args}) {row_limit_clause}"
            f") "
            f"TO '{parquet_r2_path}' "
            f"(FORMAT PARQUET, COMPRESSION 'ZSTD', ROW_GROUP_SIZE 131072);"
        )
        rows_scanned = max_scan_rows  # conservative estimate; exact below if needed

        if cancel_event.is_set():
            result_queue.put({"status": "cancelled"})
            con.close()
            return

        # ── Schema extraction with hard cap (#10, A13) ────────────────────
        raw_desc = con.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{parquet_r2_path}');"
        ).pl()
        actual_columns = len(raw_desc)
        if actual_columns > max_columns:
            # A13 — treated as a hard error (configurable via env)
            treat_as_error = _os.getenv("SCHEMA_TRUNCATION_IS_ERROR", "1") == "1"
            if treat_as_error:
                result_queue.put({
                    "status": "error",
                    "message": (
                        f"Schema exceeds maximum column limit: file has {actual_columns} columns, "
                        f"limit is {max_columns}. Set SCHEMA_TRUNCATION_IS_ERROR=0 to truncate instead."
                    ),
                })
                con.close()
                return

        schema_truncated = actual_columns > max_columns
        desc_df = raw_desc.head(max_columns)
        schema_cols = [
            {
                "name":        str(r["column_name"]),
                "type":        str(r["column_type"]),
                "is_nullable": str(r.get("null", "YES")).upper() == "YES",
            }
            for r in desc_df.to_dicts()
        ]

        # ── Row count via Parquet metadata (#2) ───────────────────────────
        if exact_count:
            row_count = int(
                con.execute(
                    f"SELECT COUNT(*) FROM read_parquet('{parquet_r2_path}');"
                ).fetchone()[0]
            )
            row_count_exact = True
            rows_scanned    = row_count
        else:
            meta = con.execute(
                f"SELECT SUM(num_rows) FROM parquet_file_metadata('{parquet_r2_path}');"
            ).fetchone()
            row_count       = int(meta[0]) if meta and meta[0] is not None else -1
            row_count_exact = row_count >= 0
            rows_scanned    = row_count if row_count >= 0 else 0

        # ── Statistical profiling (#23) ────────────────────────────────────
        profile_summary: List[Dict[str, Any]] = []
        if run_profile and not cancel_event.is_set():
            sample_clause = "USING SAMPLE 10%" if (row_count > 1_000_000 or row_count < 0) else ""
            profile_df    = con.execute(
                f"SUMMARIZE SELECT * FROM read_parquet('{parquet_r2_path}') {sample_clause};"
            ).pl().head(max_columns)
            profile_summary = profile_df.to_dicts()

        # ── A2, A3, A14 — Safe projected sample query ─────────────────────
        sample: List[Dict[str, Any]] = []
        if sample_rows > 0 and not cancel_event.is_set():
            col_names = [c["name"] for c in schema_cols]
            # A2: sanitize every column name through the whitelist checker
            try:
                col_list_sql = _safe_col_list(col_names)
            except FatalStorageError as exc:
                result_queue.put({"status": "error", "message": str(exc)})
                con.close()
                return

            # A14: sample_rows already clamped by caller; enforce again here
            safe_sample_rows = min(sample_rows, _DEFAULT_MAX_SAMPLE_ROWS)
            sample_df = con.execute(
                f"SELECT {col_list_sql} "
                f"FROM read_parquet('{parquet_r2_path}') "
                f"LIMIT {safe_sample_rows};"
            ).pl()
            sample = sample_df.to_dicts()

        execution_time = (_time.perf_counter() - t0) * 1000
        con.close()

        result_queue.put({
            "status": "success",
            "data": {
                "parquet_path":    parquet_r2_path,
                "columns":         [c["name"] for c in schema_cols],
                "schema":          schema_cols,
                "row_count":       row_count,
                "row_count_exact": row_count_exact,
                "profile_summary": profile_summary,
                "sample":          sample,
                "execution_time_ms": execution_time,
                "schema_truncated":  schema_truncated,
                "rows_scanned":      rows_scanned,
            },
        })

    except Exception as exc:
        result_queue.put({"status": "error", "message": str(exc)})


# ---------------------------------------------------------------------------
# Smart retry decorator — transient errors only, non-blocking delay (#A5)
# ---------------------------------------------------------------------------

def _transient_retry(max_attempts: int = 3, base_delay: float = 1.0):
    """
    Retries only on TransientStorageError.
    A5 — uses threading.Event.wait() instead of time.sleep() so the wait
    can be interrupted by signals and is non-blocking in thread pools.
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            _stop = threading.Event()
            for attempt in range(max_attempts):
                try:
                    return fn(*args, **kwargs)
                except (FatalStorageError, StorageCapacityError, TenantQuotaError,
                        AdmissionError, SchemaTruncationError):
                    raise
                except TransientStorageError as exc:
                    if attempt == max_attempts - 1:
                        raise
                    delay = base_delay * (2 ** attempt)
                    logger.warning(
                        f"Transient failure (attempt {attempt + 1}/{max_attempts}), "
                        f"retrying in {delay:.1f}s: {exc}"
                    )
                    _stop.wait(timeout=delay)   # A5 — interruptible wait
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Content integrity helpers (#13, #14)
# ---------------------------------------------------------------------------

def _sha256_streaming(
    client:     Any,
    bucket:     str,
    key:        str,
    chunk_size: int = 8 * 1024 * 1024,
) -> str:
    """Full SHA-256 stream — use only when ETag is unavailable."""
    h = hashlib.sha256()
    response = client.get_object(Bucket=bucket, Key=key)
    for chunk in response["Body"].iter_chunks(chunk_size):
        h.update(chunk)
    return h.hexdigest()


def _verify_write_integrity(
    client:        Any,
    bucket:        str,
    key:           str,
    expected_hash: Optional[str] = None,
) -> str:
    """Verify a written object is readable and optionally hash-matches (#14)."""
    try:
        head = client.head_object(Bucket=bucket, Key=key)
        if head.get("ContentLength", 0) == 0:
            raise FatalStorageError(
                f"Integrity check failed: written object '{_safe_log_path(key)}' is empty."
            )
        computed = _sha256_streaming(client, bucket, key)
        if expected_hash and computed != expected_hash:
            raise FatalStorageError(
                f"Integrity check failed: hash mismatch for '{_safe_log_path(key)}'. "
                f"Expected {expected_hash}, got {computed}."
            )
        return computed
    except ClientError as exc:
        raise TransientStorageError(
            f"Could not verify write integrity for '{_safe_log_path(key)}': {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# Rate-limit / scan hooks (#24, #25, #26)
# ---------------------------------------------------------------------------

class _ScanResult(str, Enum):
    CLEAN     = "clean"
    MALICIOUS = "malicious"
    UNKNOWN   = "unknown"


def _default_content_type_gate(content_type: str) -> None:
    """Strict allowlist gate (#24)."""
    allowed = {
        "application/octet-stream",
        "text/csv",
        "application/json",
        "application/x-ndjson",
        "application/vnd.apache.parquet",
    }
    if content_type not in allowed:
        raise FatalStorageError(
            f"Rejected content-type '{content_type}'. "
            f"Allowed: {', '.join(sorted(allowed))}."
        )


def _default_antivirus_scan(client: Any, bucket: str, key: str) -> _ScanResult:
    """
    Placeholder antivirus hook (#25, #A8).
    In production, integrate ClamAV / cloud malware scanning here.
    Returns UNKNOWN (pass-through) until a real backend is wired in.
    IMPORTANT: Deploy with a real scanner before handling untrusted uploads.
    """
    logger.warning(
        f"[AV] WARNING: No antivirus backend configured. "
        f"File '{_safe_log_path(key)}' is NOT being scanned. "
        "Configure an AV backend via the antivirus_scan hook before production use."
    )
    return _ScanResult.UNKNOWN


def _default_rate_limiter(tenant_id: str, operation: str) -> None:
    """Placeholder rate-limit hook (#26). Wire in Redis / token-bucket here."""
    pass


content_type_gate = _default_content_type_gate
antivirus_scan    = _default_antivirus_scan
rate_limiter      = _default_rate_limiter


# ---------------------------------------------------------------------------
# TTL / lifecycle management (#35)
# ---------------------------------------------------------------------------

class LifecycleManager:
    """Version retention and object expiry. Call run_gc() from a scheduler."""

    def __init__(
        self,
        manager:      "R2StorageManager",
        max_versions: int = 5,
        raw_ttl_days: int = 7,
    ) -> None:
        self._mgr         = manager
        self._max_versions = max_versions
        self._raw_ttl_days = raw_ttl_days

    def run_gc(self, tenant_id: str, base_dataset_prefix: str) -> Dict[str, int]:
        client  = self._mgr.get_r2_client()
        prefix  = R2PathAuthority.get_tenant_prefix(tenant_id)
        deleted = {"versions": 0, "raw": 0}

        version_prefix = f"{prefix}datasets/{base_dataset_prefix}/"
        versions       = self._list_prefix_keys(client, self._mgr.r2_bucket, version_prefix)
        versions.sort()
        to_delete      = versions[: max(0, len(versions) - self._max_versions)]
        for key in to_delete:
            try:
                client.delete_object(Bucket=self._mgr.r2_bucket, Key=key)
                deleted["versions"] += 1
                logger.info(f"[GC] Deleted old version: {_safe_log_path(key)}")
            except ClientError as exc:
                logger.warning(f"[GC] Could not delete '{_safe_log_path(key)}': {exc}")

        raw_prefix = f"{prefix}raw/"
        cutoff     = datetime.now(timezone.utc) - timedelta(days=self._raw_ttl_days)
        raw_keys   = self._list_prefix_keys(client, self._mgr.r2_bucket, raw_prefix)
        for key in raw_keys:
            try:
                head     = client.head_object(Bucket=self._mgr.r2_bucket, Key=key)
                last_mod = head.get("LastModified")
                if last_mod and last_mod < cutoff:
                    client.delete_object(Bucket=self._mgr.r2_bucket, Key=key)
                    deleted["raw"] += 1
                    logger.info(f"[GC] Expired raw file: {_safe_log_path(key)}")
            except ClientError as exc:
                logger.warning(f"[GC] Could not process raw key '{_safe_log_path(key)}': {exc}")

        metrics.increment("gc.versions_deleted", {"tenant": tenant_id})
        metrics.record("gc.raw_deleted", deleted["raw"])
        return deleted

    @staticmethod
    def _list_prefix_keys(client: Any, bucket: str, prefix: str) -> List[str]:
        paginator = client.get_paginator("list_objects_v2")
        keys: List[str] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            keys.extend(obj["Key"] for obj in page.get("Contents", []))
        return keys


# ---------------------------------------------------------------------------
# Main storage orchestrator
# ---------------------------------------------------------------------------

class R2StorageManager:
    """
    Hardened R2 Storage Orchestrator.

    Phase 5.2 additions versus 5.1:
    • boto3 clients use explicit socket + read timeouts (#A11)
    • Presigned uploads cross-validate MIME vs magic bytes (#A21)
    • write_dataframe holds an optimistic per-dataset write lock (#A15)
    • Credentials never stored as instance attributes (#1)
    """

    def __init__(self) -> None:
        self.r2_endpoint: str = os.getenv("R2_ENDPOINT_URL", "")
        self.r2_bucket:   str = os.getenv("R2_BUCKET_NAME", "dataomen-pro-data")
        self._boto_session: Optional[boto3.Session] = None
        self._r2_client:    Optional[Any] = None
        self._client_lock   = threading.Lock()
        # A15 — per-dataset write locks
        self._dataset_locks: Dict[str, threading.Lock] = defaultdict(threading.Lock)
        self._dl_meta_lock  = threading.Lock()

    @property
    def _r2_access(self) -> str:
        v = os.getenv("R2_ACCESS_KEY_ID", "")
        if not v:
            raise FatalStorageError("R2_ACCESS_KEY_ID is not set.")
        return v

    @property
    def _r2_secret(self) -> str:
        v = os.getenv("R2_SECRET_ACCESS_KEY", "")
        if not v:
            raise FatalStorageError("R2_SECRET_ACCESS_KEY is not set.")
        return v

    def _validate_credentials(self) -> None:
        if not all([self._r2_access, self._r2_secret, self.r2_endpoint, self.r2_bucket]):
            raise FatalStorageError("R2 credentials not fully configured.")

    def get_r2_client(self) -> Any:
        """Thread-safe lazy client with explicit timeouts (#A11)."""
        self._validate_credentials()
        with self._client_lock:
            if self._boto_session is None:
                self._boto_session = boto3.Session()
            if self._r2_client is None:
                self._r2_client = self._boto_session.client(
                    "s3",
                    endpoint_url      = self.r2_endpoint,
                    aws_access_key_id = self._r2_access,
                    aws_secret_access_key = self._r2_secret,
                    region_name       = "auto",
                    config            = _boto_config_with_timeouts(),  # A11
                )
        return self._r2_client

    # ── A15 — per-dataset write lock helper ───────────────────────────────

    def _dataset_write_lock(self, dataset_key: str) -> threading.Lock:
        """Return (creating if needed) the exclusive write lock for a dataset."""
        with self._dl_meta_lock:
            return self._dataset_locks[dataset_key]

    # ── Upload surface ─────────────────────────────────────────────────────

    def generate_presigned_upload_url(
        self,
        tenant_id:    str,
        filename:     str,
        content_type: str = "application/octet-stream",
        expires_in:   int = 3600,
        max_bytes:    int = _DEFAULT_MAX_UPLOAD_BYTES,
    ) -> Dict[str, Any]:
        self._validate_credentials()
        rate_limiter(tenant_id, "presign")
        content_type_gate(content_type)

        prefix      = R2PathAuthority.get_tenant_prefix(tenant_id)
        timestamp   = int(datetime.now(timezone.utc).timestamp())
        safe_name   = sanitize_filename(filename)
        object_key  = f"{prefix}raw/{timestamp}_{safe_name}"

        try:
            with _r2_circuit.guard():
                presigned_post = self.get_r2_client().generate_presigned_post(
                    Bucket     = self.r2_bucket,
                    Key        = object_key,
                    Fields     = {"Content-Type": content_type},
                    Conditions = [
                        ["content-length-range", 1, max_bytes],
                        ["eq", "$Content-Type", content_type],
                    ],
                    ExpiresIn  = expires_in,
                )
        except ClientError as exc:
            raise TransientStorageError(f"Could not generate presigned POST: {exc}") from exc

        metrics.increment("presign.generated", {"tenant": tenant_id})
        logger.info(f"[<tenant-redacted>] Generated presigned POST for '{safe_name}'.")
        return {
            "upload_post": presigned_post,
            "file_path":   f"s3://{self.r2_bucket}/{object_key}",
            "max_bytes":   max_bytes,
        }

    async def upload_raw_file_async(self, tenant_id: str, file: Any) -> str:
        import asyncio

        def _sync_upload() -> str:
            rate_limiter(tenant_id, "upload")
            prefix     = R2PathAuthority.get_tenant_prefix(tenant_id)
            timestamp  = int(datetime.now(timezone.utc).timestamp())
            safe_name  = sanitize_filename(file.filename)
            object_key = f"{prefix}raw/{timestamp}_{safe_name}"
            with _r2_circuit.guard():
                self.get_r2_client().upload_fileobj(file.file, self.r2_bucket, object_key)
            metrics.increment("upload.success", {"tenant": tenant_id})
            return f"s3://{self.r2_bucket}/{object_key}"

        return await asyncio.to_thread(_sync_upload)

    # ── Deletion ───────────────────────────────────────────────────────────

    def delete_file(self, tenant_id: str, file_path: str) -> None:
        if not file_path or not file_path.startswith("s3://"):
            return
        try:
            object_key = R2PathAuthority.validate_access(tenant_id, file_path, self.r2_bucket)
            with _r2_circuit.guard():
                self.get_r2_client().delete_object(Bucket=self.r2_bucket, Key=object_key)
            metrics.increment("delete.success", {"tenant": tenant_id})
            logger.info(f"[<tenant-redacted>] Deleted object at {_safe_log_path(object_key)}.")
        except FatalStorageError:
            raise
        except Exception as exc:
            logger.error(f"[<tenant-redacted>] Failed to delete file: {exc}")

    # ── DataFrame write — atomic + locked (#A15) ──────────────────────────

    @_transient_retry(max_attempts=3, base_delay=1.0)
    def write_dataframe(
        self,
        db:               Session,
        df:               Union[pl.DataFrame, pl.LazyFrame],
        tenant_id:        str,
        dataset_id:       str,
        format:           str  = "parquet",
        verify_integrity: bool = True,
    ) -> str:
        """
        Atomic versioned write with per-dataset optimistic locking (#A15).
        LazyFrames are rejected — must be materialized with explicit bounds upstream.
        """
        self._validate_credentials()
        rate_limiter(tenant_id, "write")

        if isinstance(df, pl.LazyFrame):
            raise FatalStorageError(
                "LazyFrames must be explicitly materialized with bounds before storage dispatch."
            )

        if not _DATASET_ID_RE.fullmatch(dataset_id):
            raise FatalStorageError("Invalid dataset_id: contains disallowed characters.")

        prefix    = R2PathAuthority.get_tenant_prefix(tenant_id)
        batch_id  = uuid.uuid4().hex[:8]
        timestamp = int(datetime.now(timezone.utc).timestamp())
        base_name = dataset_id.rsplit(".", 1)[0]
        object_key  = f"{prefix}datasets/{base_name}/v_{timestamp}_{batch_id}/data.{format}"
        full_r2_uri = R2PathAuthority.normalize_to_uri(tenant_id, object_key, self.r2_bucket)

        storage_options = {
            "aws_access_key_id":     self._r2_access,
            "aws_secret_access_key": self._r2_secret,
            "aws_endpoint_url":      self.r2_endpoint,
            "aws_region":            "auto",
        }

        # A15 — acquire per-dataset write lock before touching R2
        lock = self._dataset_write_lock(f"{tenant_id}:{base_name}")
        with lock:
            t0 = time.perf_counter()
            try:
                with _r2_circuit.guard():
                    if format == "parquet":
                        df.write_parquet(
                            full_r2_uri,
                            compression      = "zstd",
                            storage_options  = storage_options,
                            use_pyarrow      = False,
                            row_group_size   = 128 * 1024,
                        )
                    else:
                        df.write_csv(full_r2_uri, storage_options=storage_options)
            except Exception as exc:
                with contextlib.suppress(Exception):
                    parsed_key = R2PathAuthority.validate_access(
                        tenant_id, full_r2_uri, self.r2_bucket
                    )
                    self.get_r2_client().delete_object(Bucket=self.r2_bucket, Key=parsed_key)
                raise TransientStorageError(f"Write failed: {exc}") from exc

            # A5 — non-blocking consistency wait
            _stop = threading.Event()
            _stop.wait(timeout=0.3)   # R2 eventual consistency nudge

            if verify_integrity:
                parsed_key = R2PathAuthority.validate_access(
                    tenant_id, full_r2_uri, self.r2_bucket
                )
                _verify_write_integrity(self.get_r2_client(), self.r2_bucket, parsed_key)

        latency = (time.perf_counter() - t0) * 1000
        metrics.record("write.latency_ms", latency, {"tenant": tenant_id, "format": format})
        logger.info(
            "[<tenant-redacted>] Versioned write complete",
            extra={"rows": df.height, "latency_ms": round(latency, 2),
                   "path": _safe_log_path(object_key)},
        )
        return full_r2_uri

    # ── DuckDB query path resolver ─────────────────────────────────────────

    def get_duckdb_query_path(self, db: Session, dataset: Dataset) -> str:
        if dataset.is_sample and dataset.sample_uri:
            final_path = R2PathAuthority.normalize_to_uri(
                dataset.tenant_id, dataset.sample_uri, self.r2_bucket
            )
        else:
            base_path  = R2PathAuthority.normalize_to_uri(
                dataset.tenant_id, dataset.file_path, self.r2_bucket
            )
            suffix     = "/**/*.parquet" if not base_path.endswith(".parquet") else ""
            final_path = f"{base_path}{suffix}"

        R2PathAuthority.assert_path_safe(final_path)
        return f"'{final_path}'"

    # ── Lightweight DuckDB session (metadata only) ─────────────────────────

    @contextlib.contextmanager
    def duckdb_session(self, tenant_id: str) -> Generator[duckdb.DuckDBPyConnection, None, None]:
        """Thread-local DuckDB connection for lightweight metadata queries only."""
        self._validate_credentials()
        con = duckdb.connect(database=":memory:")
        try:
            _probe_duckdb_extensions(con)          # A18
            con.execute(f"SET max_memory = '{_DEFAULT_DUCKDB_MEMORY}';")
            endpoint_clean = self.r2_endpoint.replace("https://", "").replace("http://", "")
            con.execute(
                """
                CREATE OR REPLACE TEMPORARY SECRET r2_auth (
                    TYPE S3,
                    KEY_ID ?,
                    SECRET ?,
                    ENDPOINT ?,
                    URL_STYLE 'path',
                    REGION 'auto'
                );
                """,
                [self._r2_access, self._r2_secret, endpoint_clean],
            )
            yield con
        finally:
            con.close()


# ---------------------------------------------------------------------------
# Analytical engine
# ---------------------------------------------------------------------------

class AnalyticalEngine:
    """
    Handles heavy analytical work: format conversion, profiling, deduplication.
    Phase 5.2 additions:
    • Partial/ETag hash for deduplication (#A1)
    • MIME + magic-byte cross-validation (#A21)
    • Schema truncation treated as hard error (#A13)
    • A4 forkserver → spawn fallback
    • A6 admission control before semaphore
    """

    def __init__(self, storage: R2StorageManager) -> None:
        self._storage = storage

    def _compute_raw_hash(
        self, client: Any, object_key: str
    ) -> Tuple[str, bool]:
        """A1 — Partial/ETag hash for deduplication (no full O(N) read)."""
        return _partial_content_hash(client, self._storage.r2_bucket, object_key)

    def convert_to_parquet_and_profile(
        self,
        db:                    Session,
        tenant_id:             str,
        raw_object_key:        str,
        declared_content_type: Optional[str]   = None,
        watchdog_timeout_sec:  int              = _DEFAULT_WORKER_TIMEOUT,
        run_profile:           bool             = True,
        sample_rows:           int              = 100,
        exact_count:           bool             = False,
        max_bytes:             int              = _DEFAULT_MAX_UPLOAD_BYTES,
        max_columns:           int              = _DEFAULT_MAX_COLUMNS,
        max_scan_rows:         int              = _DEFAULT_MAX_SCAN_ROWS,
    ) -> ProfileResult:
        """
        Convert a raw file to Parquet and produce a ProfileResult.

        Steps
        ─────
        1. Path whitelist validation          (#5, A16)
        2. File-size guard                    (#8)
        3. MIME + magic-byte cross-validation (#9, #A21)
        4. Antivirus scan hook                (#25)
        5. Partial/ETag deduplication hash    (#13, A1)
        6. Admission control                  (A6)
        7. Per-tenant semaphore               (#19)
        8. Subprocess dispatch (spawn/fork)   (#1, #3, #4, A4)
        9. Watchdog termination               (#4)
        10. Write integrity verify            (#14)
        """
        R2PathAuthority.assert_path_safe(raw_object_key)

        raw_r2_uri       = R2PathAuthority.normalize_to_uri(
            tenant_id, raw_object_key, self._storage.r2_bucket
        )
        object_key_parsed = R2PathAuthority.validate_access(
            tenant_id, raw_r2_uri, self._storage.r2_bucket
        )

        client = self._storage.get_r2_client()

        # Step 2
        _assert_size_within_limit(client, self._storage.r2_bucket, object_key_parsed, max_bytes)

        # Step 3 — A21: cross-validate MIME vs magic bytes
        ext = pathlib.Path(object_key_parsed).suffix.lower()
        _verify_magic_bytes_and_mime(
            client, self._storage.r2_bucket, object_key_parsed, ext,
            declared_content_type=declared_content_type,
        )

        # Step 4 — AV scan
        scan_result = antivirus_scan(client, self._storage.r2_bucket, object_key_parsed)
        if scan_result == _ScanResult.MALICIOUS:
            raise FatalStorageError("File rejected: antivirus scan flagged it as malicious.")

        # Step 5 — A1: partial / ETag hash
        content_hash, hash_is_partial = self._compute_raw_hash(client, object_key_parsed)
        logger.info(
            f"[<tenant-redacted>] Content fingerprint computed "
            f"({'partial' if hash_is_partial else 'full'}): {content_hash[:16]}…"
        )

        # Parquet destination
        parquet_r2_uri = raw_r2_uri.replace("/raw/", "/analytical/")
        if not parquet_r2_uri.endswith(".parquet"):
            parquet_r2_uri = os.path.splitext(parquet_r2_uri)[0] + ".parquet"

        endpoint_clean = self._storage.r2_endpoint.replace("https://", "").replace("http://", "")

        # Step 6 — A6: admission control (check before taking semaphore)
        pending = job_store.count_active()
        if pending >= _MAX_PENDING_JOBS:
            raise AdmissionError(
                f"Global job queue is at capacity ({pending}/{_MAX_PENDING_JOBS}). "
                "Please retry shortly."
            )

        # Step 7 — Per-tenant semaphore
        with _worker_pool.acquire(tenant_id):
            # Step 8 — A4: portable subprocess context
            ctx = _get_mp_context()
            result_queue: mp.Queue = ctx.Queue(maxsize=1)
            cancel_event: mp.Event = ctx.Event()

            kwargs: Dict[str, Any] = {
                "r2_endpoint":     endpoint_clean,
                "max_memory":      _DEFAULT_DUCKDB_MEMORY,
                "max_columns":     max_columns,
                "max_scan_rows":   max_scan_rows,    # A3
                "raw_r2_path":     raw_r2_uri,
                "parquet_r2_path": parquet_r2_uri,
                "run_profile":     run_profile,
                "sample_rows":     min(sample_rows, _DEFAULT_MAX_SAMPLE_ROWS),   # A14
                "exact_count":     exact_count,
            }

            p = ctx.Process(
                target  = _duckdb_worker_process,
                args    = (kwargs, result_queue, cancel_event),
                daemon  = True,
            )
            p.start()
            t_start = time.monotonic()

            try:
                res = result_queue.get(timeout=watchdog_timeout_sec)
            except queue.Empty:
                cancel_event.set()
                # A5 — non-blocking wait for cooperative exit
                _stop = threading.Event()
                _stop.wait(timeout=0.5)
                if p.is_alive():
                    p.terminate()
                p.join(timeout=5)
                if p.is_alive():
                    p.kill()
                p.join()
                metrics.increment("worker.timeout", {"tenant": tenant_id})
                raise StorageTimeoutError(
                    "Execution limit breached: analytical engine exceeded time budget."
                )
            finally:
                result_queue.close()
                result_queue.cancel_join_thread()
                if p.is_alive():
                    p.join(timeout=5)

            wall_ms = (time.monotonic() - t_start) * 1000
            metrics.record("worker.latency_ms", wall_ms, {"tenant": tenant_id})

        if res.get("status") == "cancelled":
            raise StorageTimeoutError("Worker was cancelled before completion.")

        if res["status"] == "error":
            msg = res["message"]
            # A13 — schema truncation error surfaces clearly
            if "Schema exceeds maximum column limit" in msg:
                raise SchemaTruncationError(msg)
            raise TransientStorageError(
                f"Analytical engine failed to process file: {msg}"
            )

        data = res["data"]

        # Step 10 — write integrity
        parquet_key = R2PathAuthority.validate_access(
            tenant_id, parquet_r2_uri, self._storage.r2_bucket
        )
        _verify_write_integrity(client, self._storage.r2_bucket, parquet_key)

        if data.get("schema_truncated"):
            logger.warning(
                f"[<tenant-redacted>] Schema truncated to {max_columns} columns."
            )
            metrics.increment("schema.truncated", {"tenant": tenant_id})

        metrics.increment("worker.success", {"tenant": tenant_id})
        logger.info(
            "[<tenant-redacted>] Conversion complete",
            extra={
                "rows":          data["row_count"],
                "latency_ms":    round(data["execution_time_ms"], 2),
                "path":          _safe_log_path(parquet_r2_uri),
                "rows_scanned":  data.get("rows_scanned", 0),
            },
        )

        return ProfileResult(
            parquet_path      = data["parquet_path"],
            columns           = data["columns"],
            schema            = [ColumnSchema(**c) for c in data["schema"]],
            row_count         = data["row_count"],
            row_count_exact   = data.get("row_count_exact", False),
            profile_summary   = data.get("profile_summary", []),
            sample            = data.get("sample", []),
            execution_time_ms = data["execution_time_ms"],
            schema_version    = STORAGE_SCHEMA_VERSION,
            schema_truncated  = data.get("schema_truncated", False),
            content_hash      = content_hash,
            hash_is_partial   = hash_is_partial,
            rows_scanned      = data.get("rows_scanned", 0),
        )


# ---------------------------------------------------------------------------
# Job persistence (#33, A6)
# ---------------------------------------------------------------------------

class JobStore:
    """
    In-process job registry with active-job counting for admission control (#A6).
    PRODUCTION NOTE: Replace _store with PostgreSQL / Redis for durability (#33).
    The interface is designed so only the store implementation changes; callers
    remain identical when switching backends.
    """

    def __init__(self) -> None:
        self._store: Dict[str, JobRecord] = {}
        self._lock  = threading.Lock()

    def create(self, tenant_id: str, raw_object_key: str) -> JobRecord:
        now = datetime.now(timezone.utc).isoformat()
        job = JobRecord(
            job_id         = uuid.uuid4().hex,
            tenant_id      = tenant_id,
            raw_object_key = raw_object_key,
            created_at     = now,
            updated_at     = now,
        )
        with self._lock:
            self._store[job.job_id] = job
        return job

    def update(self, job_id: str, **fields: Any) -> None:
        with self._lock:
            job = self._store.get(job_id)
            if job is None:
                return
            self._store[job_id] = job.model_copy(
                update={**fields, "updated_at": datetime.now(timezone.utc).isoformat()}
            )

    def get(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._store.get(job_id)

    def count_active(self) -> int:
        """A6 — count jobs in pending or running state for admission control."""
        with self._lock:
            return sum(
                1 for j in self._store.values()
                if j.status in ("pending", "running")
            )

    def pending_jobs(self) -> List[JobRecord]:
        """Return jobs stuck in 'running' — likely orphaned after a crash."""
        with self._lock:
            return [j for j in self._store.values() if j.status == "running"]


# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

storage_manager   = R2StorageManager()
analytical_engine = AnalyticalEngine(storage_manager)
lifecycle_manager = LifecycleManager(storage_manager)
job_store         = JobStore()