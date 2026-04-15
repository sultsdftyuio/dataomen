"""
PolarsNormalizer — Phase 11.4: Production-Hardened Adaptive SaaS Normalization Engine.

CRITICAL FIXES (v11.3 → v11.4)
──────────────────────────────
C1  Circuit breaker half-open reset      — proper weighted counter reset
C2  Lineage type consistency             — LineageNode throughout, no mixing
C3  Strict projection sanitization fix   — consistent key derivation
C4  Memory estimator accuracy            — remove double-counting
C5  Async executor public API            — use max_workers property
C6  Deterministic lineage cache key      — stable dtype serialization
C7  Deep nesting telemetry               — emit metric on fallback
C8  Content-based schema caching         — replace id() with fingerprint
C9  Adaptive streaming                   — size-based collect() choice
C10 Extended tenant hash                 — 16 chars for collision safety
"""

import asyncio
import atexit
import logging
import os
import re
import sys
import time
import hmac
import hashlib
import functools
import random
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from threading import Lock
from typing import (
    AsyncIterator,
    Dict,
    Any,
    Iterator,
    List,
    Optional,
    Set,
    Tuple,
    Union,
    FrozenSet,
)

import polars as pl

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_raw_salt = os.environ.get("TENANT_SALT", "")
if not _raw_salt:
    logger.warning("TENANT_SALT not set — using fallback (set in production)")
_GLOBAL_TENANT_SALT = (_raw_salt or "default-tenant-salt").encode("utf-8")

_SANITIZE_TRANSLATE = str.maketrans(
    "!@#$%^&*()+-=[]{}|;':\",./<>?~` ",
    "_______________________________",
)

_MAX_NESTING_DEPTH = 10
_MAX_BATCH_BYTES = int(os.environ.get("NORMALIZER_MAX_BATCH_BYTES", 256 * 1024 * 1024))
_MAX_SKIP_LOG = 20
_MAX_LINEAGE_NODES = int(os.environ.get("NORMALIZER_MAX_LINEAGE_NODES", 5000))
_MAX_COLUMNS = int(os.environ.get("NORMALIZER_MAX_COLUMNS", 2000))
_MAX_EXECUTION_SECONDS = float(os.environ.get("NORMALIZER_MAX_EXECUTION_SECONDS", 300.0))

_CIRCUIT_BREAKER_THRESHOLD = int(os.environ.get("NORMALIZER_CIRCUIT_BREAKER_THRESHOLD", 5))
_CIRCUIT_BREAKER_RESET_SECONDS = float(os.environ.get("NORMALIZER_CIRCUIT_BREAKER_RESET_SECONDS", 60.0))
_CIRCUIT_BREAKER_BACKOFF_BASE = float(os.environ.get("NORMALIZER_CIRCUIT_BREAKER_BACKOFF_BASE", "2.0"))

_ASYNC_EXECUTOR_MAX_WORKERS = int(os.environ.get("NORMALIZER_ASYNC_MAX_WORKERS", 4))
_ASYNC_BACKPRESSURE_LIMIT = int(os.environ.get("NORMALIZER_ASYNC_BACKPRESSURE_LIMIT", 10))

_LOG_SAMPLE_RATE = int(os.environ.get("NORMALIZER_LOG_SAMPLE_RATE", 1))
_MEMORY_ESTIMATE_MAX_DEPTH = int(os.environ.get("NORMALIZER_MEMORY_ESTIMATE_MAX_DEPTH", 5))
_MEMORY_BUDGET_SHORT_CIRCUIT_ROWS = int(os.environ.get("NORMALIZER_MEMORY_SHORT_CIRCUIT_ROWS", 50000))

_LINEAGE_SAMPLING_RATE = float(os.environ.get("NORMALIZER_LINEAGE_SAMPLING_RATE", "1.0"))
_HASH_LOG_PATHS = os.environ.get("NORMALIZER_HASH_LOG_PATHS", "false").lower() == "true"


# ==============================================================================
# EXCEPTIONS
# ==============================================================================
class SchemaDriftError(Exception):
    """Critical schema mutations violate semantic contract."""


class CircuitBreakerOpenError(Exception):
    """Circuit breaker open due to repeated failures."""


class SchemaTooWideError(Exception):
    """Input schema exceeds MAX_COLUMNS limit."""


class ExecutionTimeoutError(Exception):
    """Execution exceeds configured timeout."""


class TypeCoercionError(Exception):
    """Strict type coercion failed."""


# ==============================================================================
# FAILURE TYPE
# ==============================================================================
class FailureType(Enum):
    TIMEOUT = "timeout"
    SCHEMA = "schema"
    MEMORY = "memory"
    INTERNAL = "internal"


# ==============================================================================
# DATA MODELS
# ==============================================================================
@dataclass(frozen=True)
class FieldRequest:
    """Downstream field request for AST pruning."""
    path: str
    required: bool = False
    type_hint: Optional[pl.DataType] = None


@dataclass(frozen=True)
class ExecutionPlan:
    """Physical execution decisions."""
    top_level_keys: FrozenSet[str]
    schema_paths: Tuple[Tuple[str, pl.DataType, Tuple], ...]
    cost_metrics: Dict[str, Union[int, float]]
    cost: float
    use_streaming: bool
    schema_signature: str
    available_columns: FrozenSet[str]
    row_count: int
    avg_field_size: float


@dataclass(frozen=True)
class LineageNode:
    """Immutable node in transformation DAG."""
    id: str
    source_paths: Tuple[str, ...]
    output_column: str
    transform: str
    parents: Tuple[str, ...]
    children: Tuple[str, ...]


@dataclass
class LineageDAG:
    """Queryable DAG for auditability and GDPR tracing."""
    nodes: Dict[str, LineageNode]
    degraded: bool = False

    def reverse_lookup(self, column: str) -> List[str]:
        """DFS upward to find all contributing source paths."""
        visited: Set[str] = set()

        def dfs(node_id: str) -> List[str]:
            if node_id in visited:
                return []
            visited.add(node_id)
            node = self.nodes.get(node_id)
            if not node:
                return []
            sources = list(node.source_paths)
            for parent_id in node.parents:
                if parent_id in self.nodes:
                    sources.extend(dfs(parent_id))
            return sources

        return list(dict.fromkeys(dfs(column)))  # Preserve order, dedupe

    def ancestors(self, column: str) -> List[str]:
        """Return all ancestor node IDs for column."""
        visited: Set[str] = set()

        def dfs(node_id: str) -> List[str]:
            if node_id in visited:
                return []
            visited.add(node_id)
            node = self.nodes.get(node_id)
            if not node:
                return []
            result = []
            for parent_id in node.parents:
                if parent_id in self.nodes:
                    result.append(parent_id)
                    result.extend(dfs(parent_id))
            return result

        return list(dict.fromkeys(dfs(column)))


# ==============================================================================
# MUTABLE LINEAGE BUILDER (internal only)
# ==============================================================================
@dataclass
class _LineageBuilder:
    """Mutable builder for constructing LineageDAG."""
    nodes: Dict[str, '_LineageBuilderNode'] = field(default_factory=dict)

    def add_node(self, node_id: str, source_paths: Set[str], output_column: str,
                 transform: str, parents: Set[str], children: Set[str]) -> None:
        if node_id not in self.nodes:
            self.nodes[node_id] = _LineageBuilderNode(
                id=node_id,
                source_paths=set(source_paths),
                output_column=output_column,
                transform=transform,
                parents=set(parents),
                children=set(children),
            )
        else:
            node = self.nodes[node_id]
            node.source_paths.update(source_paths)
            node.parents.update(parents)
            node.children.update(children)

    def to_dag(self) -> Dict[str, LineageNode]:
        """Convert to immutable LineageNode dict."""
        return {
            node_id: LineageNode(
                id=node.id,
                source_paths=tuple(sorted(node.source_paths)),
                output_column=node.output_column,
                transform=node.transform,
                parents=tuple(sorted(node.parents)),
                children=tuple(sorted(node.children)),
            )
            for node_id, node in self.nodes.items()
        }


@dataclass
class _LineageBuilderNode:
    """Mutable node during DAG construction."""
    id: str
    source_paths: Set[str]
    output_column: str
    transform: str
    parents: Set[str]
    children: Set[str]


# ==============================================================================
# LRU CACHE
# ==============================================================================
class _ThreadSafeLRU:
    """Thread-safe LRU cache with hit/miss tracking."""

    def __init__(self, maxsize: int = 2048) -> None:
        self._maxsize = maxsize
        self._cache: OrderedDict = OrderedDict()
        self._lock = Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key: Any) -> Any:
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None
            self._cache.move_to_end(key)
            self._hits += 1
            return self._cache[key]

    def set(self, key: Any, value: Any) -> None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            else:
                if len(self._cache) >= self._maxsize:
                    self._cache.popitem(last=False)
            self._cache[key] = value

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def get_stats(self) -> Dict[str, Union[int, float]]:
        with self._lock:
            total = self._hits + self._misses
            return {
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": self._hits / total if total > 0 else 0.0,
                "size": len(self._cache),
            }


# ==============================================================================
# SANITIZATION
# ==============================================================================
@functools.lru_cache(maxsize=4096)
def pure_sanitize_column_name(col: str) -> str:
    """Pure, stateless column sanitization."""
    clean = str(col).lower().translate(_SANITIZE_TRANSLATE).strip("_")
    # Normalize multiple underscores
    while "__" in clean:
        clean = clean.replace("__", "_")
    if not clean:
        return "field"
    if clean[0].isdigit():
        return f"v_{clean}"
    return clean


# ==============================================================================
# STABLE DTYPE SERIALIZATION (C6: deterministic)
# ==============================================================================
def _serialize_dtype(dtype: pl.DataType) -> str:
    """
    C6: Stable, deterministic string representation of a Polars DataType.
    Used for cache keys - must be consistent across runs.
    """
    if not isinstance(dtype, pl.DataType):
        return str(dtype)
    
    name = type(dtype).__name__
    
    # Handle nested types
    if isinstance(dtype, pl.List):
        inner = getattr(dtype, "inner", getattr(dtype, "dtype", None))
        if inner is not None:
            return f"List({_serialize_dtype(inner)})"
        return "List(Unknown)"
    
    if isinstance(dtype, pl.Struct):
        fields = getattr(dtype, "fields", [])
        if fields:
            field_strs = []
            for f in fields:
                f_name = getattr(f, "name", "unknown")
                f_dtype = getattr(f, "dtype", None)
                if f_dtype is not None:
                    field_strs.append(f"{f_name}:{_serialize_dtype(f_dtype)}")
            return f"Struct({','.join(field_strs)})"
        return "Struct()"
    
    # Handle temporal types with precision
    if isinstance(dtype, (pl.Datetime, pl.Duration)):
        time_unit = getattr(dtype, "time_unit", "us")
        time_zone = getattr(dtype, "time_zone", None)
        if time_zone:
            return f"{name}({time_unit},{time_zone})"
        return f"{name}({time_unit})"
    
    # Simple types
    return name


def _freeze_dtype(dtype: Any) -> Tuple:
    """Hashable fingerprint for DataType."""
    if not isinstance(dtype, pl.DataType):
        return (dtype,)
    return (_serialize_dtype(dtype),)


def _deep_freeze(x: Any) -> Any:
    """Recursively convert to hashable representation."""
    if isinstance(x, pl.DataType):
        return _freeze_dtype(x)
    if isinstance(x, list):
        return tuple(_deep_freeze(i) for i in x)
    if isinstance(x, dict):
        return tuple(sorted((k, _deep_freeze(v)) for k, v in x.items()))
    if isinstance(x, tuple):
        return tuple(_deep_freeze(i) for i in x)
    return x


def _schema_fingerprint(schema: Dict[str, pl.DataType]) -> str:
    """96-bit stable hash fingerprint for schema."""
    items = sorted((k, _serialize_dtype(v)) for k, v in schema.items())
    return hashlib.sha256(str(items).encode()).hexdigest()[:24]


# ==============================================================================
# STRING DTYPE DETECTION
# ==============================================================================
_STRING_TYPE_NAMES = frozenset({"String", "Utf8", "Categorical", "Enum"})


def _is_string_dtype(dtype: pl.DataType) -> bool:
    """Version-safe string type detection."""
    try:
        if dtype in (pl.String, pl.Utf8, pl.Categorical):
            return True
    except Exception:
        pass
    return type(dtype).__name__ in _STRING_TYPE_NAMES


# ==============================================================================
# METRICS BACKEND
# ==============================================================================
class MetricsBackend:
    """Pluggable metrics backend."""

    def emit(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        pass


class NoOpMetricsBackend(MetricsBackend):
    pass


# ==============================================================================
# WEIGHTED CIRCUIT BREAKER (C1: proper reset)
# ==============================================================================
class _WeightedCircuitBreaker:
    """
    C1: Circuit breaker with weighted failure types and proper half-open reset.
    """

    _WEIGHTS = {
        FailureType.INTERNAL: 1.0,
        FailureType.MEMORY: 0.8,
        FailureType.TIMEOUT: 0.5,
        FailureType.SCHEMA: 0.5,
    }

    def __init__(self, threshold: int = _CIRCUIT_BREAKER_THRESHOLD,
                 reset_seconds: float = _CIRCUIT_BREAKER_RESET_SECONDS) -> None:
        self._threshold = threshold
        self._reset_seconds = reset_seconds
        self._failures: Dict[FailureType, int] = {ft: 0 for ft in FailureType}
        self._weighted_total = 0.0
        self._last_failure_time: Optional[datetime] = None
        self._state = "closed"
        self._lock = Lock()
        self._half_open_attempts = 0
        self._backoff_seconds = 0.0

    def record_success(self) -> None:
        """C1: Full reset including half-open state."""
        with self._lock:
            self._failures = {ft: 0 for ft in FailureType}
            self._weighted_total = 0.0
            self._half_open_attempts = 0
            self._backoff_seconds = 0.0
            self._state = "closed"

    def record_failure(self, failure_type: FailureType) -> bool:
        """Returns True if circuit opens."""
        with self._lock:
            self._failures[failure_type] += 1
            self._weighted_total += self._WEIGHTS[failure_type]
            self._last_failure_time = datetime.now(timezone.utc)
            
            if self._weighted_total >= self._threshold:
                self._state = "open"
                self._backoff_seconds = _CIRCUIT_BREAKER_BACKOFF_BASE
                return True
            return False

    def can_execute(self) -> bool:
        """C1: Check with proper half-open handling."""
        with self._lock:
            if self._state == "closed":
                return True
            
            if self._state == "open":
                if self._last_failure_time is None:
                    return False
                elapsed = (datetime.now(timezone.utc) - self._last_failure_time).total_seconds()
                if elapsed >= self._reset_seconds + self._backoff_seconds:
                    # C1: Reset counters when transitioning to half-open
                    self._failures = {ft: 0 for ft in FailureType}
                    self._weighted_total = 0.0
                    self._half_open_attempts = 0
                    self._state = "half-open"
                    return True
                return False
            
            # Half-open: allow limited attempts
            if self._half_open_attempts < 1:
                self._half_open_attempts += 1
                return True
            
            # C1: Exponential backoff on repeated half-open failures
            self._backoff_seconds *= 2
            self._state = "open"
            return False

    @property
    def state(self) -> str:
        with self._lock:
            return self._state

    def get_stats(self) -> Dict[str, Union[int, float, str]]:
        with self._lock:
            return {
                "state": self._state,
                "weighted_total": self._weighted_total,
                **{ft.value: count for ft, count in self._failures.items()},
            }


# ==============================================================================
# LOGGING UTILS
# ==============================================================================
class _SampledLogger:
    """Sampled logging for high-volume environments."""

    def __init__(self, sample_rate: int = 1):
        self._sample_rate = max(1, sample_rate)
        self._counters: Dict[str, int] = {}
        self._lock = Lock()

    def should_log(self, key: str) -> bool:
        if self._sample_rate == 1:
            return True
        with self._lock:
            self._counters[key] = self._counters.get(key, 0) + 1
            return self._counters[key] % self._sample_rate == 0


def _hash_path_for_log(path: str) -> str:
    """Hash sensitive path for logging."""
    if not _HASH_LOG_PATHS:
        return path
    return hmac.new(_GLOBAL_TENANT_SALT, path.encode(), hashlib.sha256).hexdigest()[:12]


# ==============================================================================
# GLOBAL SHUTDOWN REGISTRY
# ==============================================================================
_shutdown_registry: Set['PolarsNormalizer'] = set()
_shutdown_registered = False


def _register_instance(instance: 'PolarsNormalizer') -> None:
    _shutdown_registry.add(instance)


def _unregister_instance(instance: 'PolarsNormalizer') -> None:
    _shutdown_registry.discard(instance)


def _global_shutdown() -> None:
    for inst in list(_shutdown_registry):
        try:
            inst.close()
        except Exception:
            pass


if not _shutdown_registered:
    atexit.register(_global_shutdown)
    _shutdown_registered = True


# ==============================================================================
# CORE ENGINE
# ==============================================================================
class PolarsNormalizer:
    """Phase 11.4 — Production-Hardened Adaptive SaaS Normalization Engine."""

    def __init__(
        self,
        tenant_id: str,
        integration_name: str,
        schema_infer_len: int = 1000,
        schema_contract: Optional[Dict[str, pl.DataType]] = None,
        strict_projection: bool = False,
        schema_version: Optional[str] = None,
        max_batch_bytes: Optional[int] = None,
        metrics_backend: Optional[MetricsBackend] = None,
        async_executor: Optional[ThreadPoolExecutor] = None,
        async_max_workers: Optional[int] = None,
        max_execution_seconds: Optional[float] = None,
        log_sample_rate: Optional[int] = None,
        strict_coercion: bool = True,
    ) -> None:
        if not tenant_id or not isinstance(tenant_id, str):
            raise ValueError("tenant_id must be non-empty string")
        if not integration_name or not isinstance(integration_name, str):
            raise ValueError("integration_name must be non-empty string")
        if schema_infer_len < 1:
            raise ValueError("schema_infer_len must be >= 1")

        self.tenant_id = tenant_id
        self.integration_name = integration_name
        self.schema_infer_len = schema_infer_len
        self.strict_projection = strict_projection
        self.schema_version = schema_version or "unversioned"
        self._max_batch_bytes = max_batch_bytes or _MAX_BATCH_BYTES
        self._max_execution_seconds = max_execution_seconds or _MAX_EXECUTION_SECONDS
        self._strict_coercion = strict_coercion

        # C10: Extended tenant hash (16 chars)
        self._safe_log_id = hmac.new(
            _GLOBAL_TENANT_SALT,
            tenant_id.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:16]

        self._sampled_logger = _SampledLogger(log_sample_rate or _LOG_SAMPLE_RATE)

        # C5: Use public max_workers property
        if async_executor is not None:
            self._async_executor = async_executor
            self._owns_executor = False
            # Try public property first, fall back to private
            self._executor_max_workers = getattr(
                async_executor, "max_workers",
                getattr(async_executor, "_max_workers", 4)
            )
        else:
            max_workers = async_max_workers or _ASYNC_EXECUTOR_MAX_WORKERS
            self._async_executor = ThreadPoolExecutor(
                max_workers=max_workers,
                thread_name_prefix=f"polars_norm_{self._safe_log_id}",
            )
            self._owns_executor = True
            self._executor_max_workers = max_workers

        _register_instance(self)
        self._circuit_breaker = _WeightedCircuitBreaker()
        self._metrics = metrics_backend or NoOpMetricsBackend()

        self._expr_cache: _ThreadSafeLRU = _ThreadSafeLRU(maxsize=2048)
        self._lineage_cache: _ThreadSafeLRU = _ThreadSafeLRU(maxsize=512)
        self._schema_fingerprint_cache: _ThreadSafeLRU = _ThreadSafeLRU(maxsize=256)

        self._cost_weights = {
            "columns": 1.0,
            "struct_depth": 2.5,
            "list_nodes": 3.0,
            "object_nodes": 4.0,
            "row_count": 0.001,
            "avg_field_size": 0.01,
        }

        # C3: Schema contract with consistent sanitization
        self.schema_contract: Dict[str, pl.DataType] = {}
        self._schema_contract_keys: Set[str] = set()  # Sanitized keys for fast lookup
        self._schema_contract_fingerprint: Optional[str] = None
        
        if schema_contract:
            contract_items = []
            for k, v in schema_contract.items():
                clean_k = pure_sanitize_column_name(k)
                if clean_k in self._schema_contract_keys:
                    raise ValueError(f"Schema contract collision: '{k}' → '{clean_k}'")
                self.schema_contract[clean_k] = v
                self._schema_contract_keys.add(clean_k)
                contract_items.append((clean_k, _serialize_dtype(v)))
            
            # Deterministic fingerprint from sorted items
            self._schema_contract_fingerprint = hashlib.sha256(
                str(sorted(contract_items)).encode()
            ).hexdigest()[:16]

        # Backward-compatibility shim for callers expecting DataFrame-only outputs.
        self._last_lineage: LineageDAG = LineageDAG({})

    def _emit_metric(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        final_tags = tags or {}
        final_tags["tenant"] = self._safe_log_id
        final_tags["integration"] = self.integration_name
        final_tags["schema_version"] = self.schema_version
        self._metrics.emit(name, value, final_tags)

    def _log_info(self, key: str, msg: str, *args, **kwargs) -> None:
        if self._sampled_logger.should_log(key):
            logger.info(msg, *args, **kwargs)

    def close(self) -> None:
        if self._owns_executor and self._async_executor:
            self._async_executor.shutdown(wait=True)
            self._owns_executor = False
        _unregister_instance(self)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def get_cache_stats(self) -> Dict[str, Dict[str, Any]]:
        return {
            "expression_cache": self._expr_cache.get_stats(),
            "lineage_cache": self._lineage_cache.get_stats(),
            "schema_fingerprint_cache": self._schema_fingerprint_cache.get_stats(),
        }

    # ==========================================================================
    # SCHEMA FINGERPRINT (C8: content-based, not id())
    # ==========================================================================
    def _get_cached_schema_fingerprint(self, schema: Dict[str, pl.DataType]) -> str:
        """C8: Content-based fingerprint caching."""
        fingerprint = _schema_fingerprint(schema)
        # Also cache the result to avoid recomputation
        cached = self._schema_fingerprint_cache.get(fingerprint)
        if cached is not None:
            return cached
        self._schema_fingerprint_cache.set(fingerprint, fingerprint)
        return fingerprint

    # ==========================================================================
    # ARROW CHUNKING
    # ==========================================================================
    def _arrow_chunked_from_dicts(
        self, data: List[Dict[str, Any]], chunk_size: int = 5000,
        infer_schema_length: Optional[int] = None,
    ) -> Iterator[pl.DataFrame]:
        """Yield DataFrames in chunks to prevent OOM."""
        for i in range(0, len(data), chunk_size):
            chunk = data[i:i + chunk_size]
            yield pl.from_dicts(chunk, infer_schema_length=infer_schema_length)

    # ==========================================================================
    # EXECUTION PLANNER
    # ==========================================================================
    def _create_execution_plan(
        self, raw_data: List[Dict[str, Any]],
        requested_fields: Optional[List[FieldRequest]],
        cost_threshold: float, stream_batch_size: int,
    ) -> ExecutionPlan:
        peek_len = min(self.schema_infer_len, max(1, len(raw_data)))

        all_sample_keys: Set[str] = set()
        for row in raw_data[:peek_len]:
            all_sample_keys.update(row.keys())

        if len(all_sample_keys) > _MAX_COLUMNS:
            raise SchemaTooWideError(
                f"[{self._safe_log_id}] Schema has {len(all_sample_keys)} columns"
            )

        # Peek with chunked loading
        df_peek = None
        for chunk_df in self._arrow_chunked_from_dicts(
            raw_data[:peek_len], chunk_size=1000, infer_schema_length=peek_len
        ):
            df_peek = chunk_df
            break

        if df_peek is None:
            df_peek = pl.DataFrame()

        schema_paths = self._extract_all_schema_paths(df_peek.schema)

        if len(schema_paths) > _MAX_COLUMNS:
            raise SchemaTooWideError(
                f"[{self._safe_log_id}] Extracted {len(schema_paths)} paths"
            )

        top_keys: Set[str] = set()
        if requested_fields:
            top_keys = {f.path.split(".")[0].split("[")[0] for f in requested_fields}
            schema_paths = self._prune_logical_schema(schema_paths, requested_fields)

        cost_metrics = self._compute_complexity(schema_paths)
        row_count = len(raw_data)
        avg_field_size = self._estimate_avg_field_size(raw_data[:peek_len]) if raw_data else 0.0
        cost = self._estimate_cost(cost_metrics, row_count, avg_field_size)
        use_streaming = cost > cost_threshold or len(raw_data) > stream_batch_size

        schema_signature = self._get_cached_schema_fingerprint(df_peek.schema)
        available_columns = frozenset(all_sample_keys)

        # Convert schema_paths to tuple for immutability
        schema_paths_tuple = tuple(
            (path, dtype, tuple(ops)) for path, dtype, ops in schema_paths
        )

        return ExecutionPlan(
            top_level_keys=frozenset(top_keys),
            schema_paths=schema_paths_tuple,
            cost_metrics=cost_metrics,
            cost=cost,
            use_streaming=use_streaming,
            schema_signature=schema_signature,
            available_columns=available_columns,
            row_count=row_count,
            avg_field_size=avg_field_size,
        )

    # ==========================================================================
    # COST ESTIMATION
    # ==========================================================================
    def _estimate_avg_field_size(self, sample_rows: List[Dict[str, Any]]) -> float:
        if not sample_rows:
            return 0.0
        total_size = 0
        total_fields = 0
        for row in sample_rows:
            for v in row.values():
                total_fields += 1
                if isinstance(v, (str, bytes)):
                    total_size += len(v)
                else:
                    total_size += sys.getsizeof(v)
        return total_size / max(total_fields, 1)

    def _estimate_cost(self, metrics: Dict[str, Union[int, float]],
                       row_count: int, avg_field_size: float) -> float:
        base = (
            metrics["columns"] * self._cost_weights["columns"]
            + metrics["struct_depth"] * self._cost_weights["struct_depth"]
            + metrics["list_nodes"] * self._cost_weights["list_nodes"]
            + metrics["object_nodes"] * self._cost_weights["object_nodes"]
        )
        base += row_count * self._cost_weights["row_count"]
        base += (avg_field_size / 1024) * self._cost_weights["avg_field_size"]
        return base

    # ==========================================================================
    # PUBLIC API
    # ==========================================================================
    def normalize_batch(
        self, raw_data: List[Dict[str, Any]],
        requested_fields: Optional[List[FieldRequest]] = None,
        include_lineage: bool = False,
    ) -> Union[pl.DataFrame, Tuple[pl.DataFrame, LineageDAG]]:
        """Normalize a single batch.

        By default returns only DataFrame for compatibility with existing call sites.
        Set include_lineage=True to receive (DataFrame, LineageDAG).
        """
        if not self._circuit_breaker.can_execute():
            raise CircuitBreakerOpenError(
                f"[{self._safe_log_id}] Circuit OPEN: {self._circuit_breaker.get_stats()}"
            )

        if not raw_data:
            empty_df = self._create_empty_audit_df()
            empty_lineage = LineageDAG({})
            self._last_lineage = empty_lineage
            return (empty_df, empty_lineage) if include_lineage else empty_df

        try:
            plan = self._create_execution_plan(
                raw_data, requested_fields, cost_threshold=50.0,
                stream_batch_size=len(raw_data) + 1
            )
            
            self._emit_metric("schema_width", plan.cost_metrics["columns"])
            self._emit_metric("schema_depth", plan.cost_metrics["struct_depth"])

            result_df, result_lineage = self._execute_plan(raw_data, plan)
            self._last_lineage = result_lineage
            self._circuit_breaker.record_success()
            if include_lineage:
                return result_df, result_lineage
            return result_df

        except (SchemaDriftError, SchemaTooWideError, ExecutionTimeoutError) as e:
            ft = FailureType.SCHEMA if isinstance(e, SchemaDriftError) else \
                 FailureType.TIMEOUT if isinstance(e, ExecutionTimeoutError) else FailureType.MEMORY
            if self._circuit_breaker.record_failure(ft):
                logger.error("[%s] Circuit OPEN: %s", self._safe_log_id, ft.value)
            raise
        except MemoryError:
            if self._circuit_breaker.record_failure(FailureType.MEMORY):
                logger.error("[%s] Circuit OPEN: memory", self._safe_log_id)
            raise
        except Exception:
            if self._circuit_breaker.record_failure(FailureType.INTERNAL):
                logger.error("[%s] Circuit OPEN: internal", self._safe_log_id)
            raise

    def normalize_stream(
        self, raw_data: List[Dict[str, Any]],
        requested_fields: Optional[List[FieldRequest]] = None,
        cost_threshold: float = 50.0,
        stream_batch_size: int = 10_000,
    ) -> Iterator[Tuple[pl.DataFrame, LineageDAG]]:
        """CHUNKED execution (not true streaming)."""
        if not self._circuit_breaker.can_execute():
            raise CircuitBreakerOpenError(f"[{self._safe_log_id}] Circuit OPEN")

        if not raw_data:
            yield self._create_empty_audit_df(), LineageDAG({})
            return

        plan = self._create_execution_plan(raw_data, requested_fields, cost_threshold, stream_batch_size)

        for batch in self._chunk_iterator(raw_data, stream_batch_size):
            if batch:
                try:
                    yield self._execute_plan(batch, plan)
                    self._circuit_breaker.record_success()
                except (SchemaDriftError, SchemaTooWideError, ExecutionTimeoutError) as e:
                    ft = FailureType.SCHEMA if isinstance(e, SchemaDriftError) else \
                         FailureType.TIMEOUT if isinstance(e, ExecutionTimeoutError) else FailureType.MEMORY
                    if self._circuit_breaker.record_failure(ft):
                        logger.error("[%s] Circuit OPEN: %s", self._safe_log_id, ft.value)
                    raise
                except MemoryError:
                    if self._circuit_breaker.record_failure(FailureType.MEMORY):
                        logger.error("[%s] Circuit OPEN: memory", self._safe_log_id)
                    raise
                except Exception:
                    if self._circuit_breaker.record_failure(FailureType.INTERNAL):
                        logger.error("[%s] Circuit OPEN: internal", self._safe_log_id)
                    raise

    async def normalize_stream_async(
        self, raw_data: List[Dict[str, Any]],
        requested_fields: Optional[List[FieldRequest]] = None,
        cost_threshold: float = 50.0,
        stream_batch_size: int = 10_000,
        backpressure_limit: Optional[int] = None,
    ) -> AsyncIterator[Tuple[pl.DataFrame, LineageDAG]]:
        """Async chunked generator with per-call backpressure."""
        effective_limit = min(
            backpressure_limit or _ASYNC_BACKPRESSURE_LIMIT,
            self._executor_max_workers
        )
        sem = asyncio.Semaphore(effective_limit)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            raise RuntimeError("Must be called from async context")

        plan = self._create_execution_plan(raw_data, requested_fields, cost_threshold, stream_batch_size)

        for batch in self._chunk_iterator(raw_data, stream_batch_size):
            if not batch:
                continue

            async with sem:
                if not self._circuit_breaker.can_execute():
                    raise CircuitBreakerOpenError(f"[{self._safe_log_id}] Circuit OPEN")

                try:
                    result = await asyncio.wait_for(
                        loop.run_in_executor(
                            self._async_executor, self._execute_plan, batch, plan
                        ),
                        timeout=self._max_execution_seconds,
                    )
                    self._circuit_breaker.record_success()
                    yield result

                except asyncio.TimeoutError:
                    if self._circuit_breaker.record_failure(FailureType.TIMEOUT):
                        logger.error("[%s] Circuit: timeout", self._safe_log_id)
                    raise ExecutionTimeoutError(f"[{self._safe_log_id}] Async timeout")
                except (SchemaDriftError, SchemaTooWideError) as e:
                    ft = FailureType.SCHEMA if isinstance(e, SchemaDriftError) else FailureType.MEMORY
                    if self._circuit_breaker.record_failure(ft):
                        logger.error("[%s] Circuit: %s", self._safe_log_id, ft.value)
                    raise
                except MemoryError:
                    if self._circuit_breaker.record_failure(FailureType.MEMORY):
                        logger.error("[%s] Circuit: memory", self._safe_log_id)
                    raise
                except Exception:
                    if self._circuit_breaker.record_failure(FailureType.INTERNAL):
                        logger.error("[%s] Circuit: internal", self._safe_log_id)
                    raise

    def _chunk_iterator(self, raw_data: List[Dict[str, Any]], batch_size: int) -> Iterator[List[Dict[str, Any]]]:
        for i in range(0, len(raw_data), batch_size):
            yield raw_data[i:i + batch_size]

    # ==========================================================================
    # CORE EXECUTION
    # ==========================================================================
    def _execute_plan(self, raw_data: List[Dict[str, Any]], plan: ExecutionPlan) -> Tuple[pl.DataFrame, LineageDAG]:
        t_start = time.perf_counter()
        deadline = t_start + self._max_execution_seconds

        try:
            self._check_memory_budget(raw_data)

            filtered_data = (
                [{k: v for k, v in row.items() if k in plan.top_level_keys} for row in raw_data]
                if plan.top_level_keys else raw_data
            )

            if time.perf_counter() > deadline:
                raise ExecutionTimeoutError(f"[{self._safe_log_id}] Timeout before Arrow")

            # Chunked loading for large batches
            if len(filtered_data) > 10000:
                dfs = list(self._arrow_chunked_from_dicts(
                    filtered_data, chunk_size=5000, infer_schema_length=self.schema_infer_len
                ))
                df = pl.concat(dfs) if dfs else pl.DataFrame()
            else:
                df = pl.from_dicts(filtered_data, infer_schema_length=self.schema_infer_len)

            if time.perf_counter() > deadline:
                raise ExecutionTimeoutError(f"[{self._safe_log_id}] Timeout after Arrow")

            validated_nodes = self._validate_and_build_graph(plan.schema_paths)

            if len(validated_nodes) > _MAX_COLUMNS:
                raise SchemaTooWideError(f"[{self._safe_log_id}] Nodes exceed limit")

            extraction_exprs, lineage_nodes = self._compile_ast_and_lineage(validated_nodes, plan)
            self._apply_sparse_contract_fill(extraction_exprs, lineage_nodes)

            if time.perf_counter() > deadline:
                raise ExecutionTimeoutError(f"[{self._safe_log_id}] Timeout before lazy")

            lf = df.lazy().select(extraction_exprs).with_columns(
                [
                    pl.lit(self.tenant_id).alias("_tenant_id"),
                    pl.lit(self.integration_name).alias("_integration_name"),
                    pl.lit(self.schema_version).alias("_schema_version"),
                    pl.lit(datetime.now(timezone.utc))
                    .cast(pl.Datetime(time_unit="us", time_zone="UTC"))
                    .alias("_extracted_at"),
                ]
            )

            # C9: Adaptive streaming based on data size
            use_streaming = len(filtered_data) > 50000 or plan.cost > 100
            final_df = lf.collect(streaming=use_streaming)

            t_exec = time.perf_counter() - t_start
            self._emit_metric("rows_normalised", final_df.height)
            self._emit_metric("exec_seconds", t_exec)

            degraded = len(lineage_nodes) >= _MAX_LINEAGE_NODES
            return final_df, LineageDAG(lineage_nodes, degraded=degraded)

        except SchemaDriftError:
            self._emit_metric("schema_drift_errors", 1.0)
            raise
        except SchemaTooWideError:
            self._emit_metric("schema_too_wide_errors", 1.0)
            raise
        except ExecutionTimeoutError:
            self._emit_metric("execution_timeouts", 1.0)
            raise
        except Exception as e:
            logger.error("[%s] Engine failure: %s", self._safe_log_id, e, exc_info=True)
            self._emit_metric("engine_errors", 1.0)
            raise RuntimeError(f"Compute Engine error: {e}") from e

    # ==========================================================================
    # C4: MEMORY BUDGET (no double-counting)
    # ==========================================================================
    def _check_memory_budget(self, raw_data: List[Dict[str, Any]]) -> None:
        """C4: Accurate memory estimation without double-counting."""
        if len(raw_data) > _MEMORY_BUDGET_SHORT_CIRCUIT_ROWS:
            return  # Trust streaming

        sample_size = min(50, len(raw_data))
        if sample_size == 0:
            return

        def estimate_value_size(v: Any, depth: int = 0) -> int:
            if depth > _MEMORY_ESTIMATE_MAX_DEPTH:
                return 64  # Conservative estimate
            if isinstance(v, (str, bytes)):
                return len(v)
            if isinstance(v, (list, tuple)):
                # C4: Don't count container overhead separately - just elements
                sample_count = min(10, len(v))
                elements = sum(estimate_value_size(item, depth + 1) for item in v[:sample_count])
                if len(v) > sample_count:
                    elements = int(elements * (len(v) / sample_count))
                return elements  # No sys.getsizeof(v) - avoids double-count
            if isinstance(v, dict):
                items = list(v.items())
                sample_count = min(10, len(items))
                item_sizes = sum(
                    estimate_value_size(k, depth + 1) + estimate_value_size(val, depth + 1)
                    for k, val in items[:sample_count]
                )
                if len(items) > sample_count:
                    item_sizes = int(item_sizes * (len(items) / sample_count))
                return item_sizes  # No sys.getsizeof(v)
            return sys.getsizeof(v)

        def estimate_row_size(row: Dict[str, Any]) -> int:
            # C4: Only count values, not row container overhead
            total = 0
            for v in row.values():
                total += estimate_value_size(v, depth=0)
            return total

        row_sizes = [estimate_row_size(row) for row in raw_data[:sample_size]]
        sample_bytes = sum(row_sizes)
        max_row_size = max(row_sizes) if row_sizes else 0

        if max_row_size > self._max_batch_bytes:
            raise MemoryError(f"[{self._safe_log_id}] Single row exceeds limit")

        estimated_bytes = (sample_bytes / sample_size) * len(raw_data)
        if estimated_bytes > self._max_batch_bytes:
            raise MemoryError(f"[{self._safe_log_id}] Estimated batch exceeds cap")

    # ==========================================================================
    # SCHEMA PRUNING
    # ==========================================================================
    def _prune_logical_schema(
        self,
        schema_paths: List[Tuple[str, pl.DataType, List[Tuple[str, Any]]]],
        requested_fields: List[FieldRequest],
    ) -> List[Tuple[str, pl.DataType, List[Tuple[str, Any]]]]:
        req_paths = {f.path for f in requested_fields}
        pruned = []
        for sp in schema_paths:
            base_path = sp[0].replace("[]", "").replace("[0]", "")
            if any(base_path == rp or base_path.startswith(rp + ".") for rp in req_paths):
                pruned.append(sp)
        return pruned

    # ==========================================================================
    # TYPE CASTING (C3: coercion visibility)
    # ==========================================================================
    def _apply_analytical_casts(
        self, clean_name: str, actual_dtype: pl.DataType,
        expr: pl.Expr, expected_type: Optional[pl.DataType] = None,
    ) -> pl.Expr:
        if self._is_unresolvable(actual_dtype):
            try:
                return (
                    pl.when(expr.is_not_null())
                    .then(expr.cast(pl.String, strict=False))
                    .otherwise(pl.lit(None, dtype=pl.String))
                    .alias(clean_name)
                )
            except Exception:
                import json as _json
                return expr.map_elements(
                    lambda x: _json.dumps(x, default=str) if x is not None else None,
                    return_dtype=pl.String,
                ).alias(clean_name)

        target_type = expected_type if expected_type is not None else self.schema_contract.get(clean_name)
        if target_type is not None:
            if target_type != actual_dtype:
                self._emit_metric("type_coercions", 1.0, {
                    "column": clean_name,
                    "from_type": type(actual_dtype).__name__,
                    "to_type": type(target_type).__name__,
                })
                
                if self._strict_coercion:
                    return expr.strict_cast(target_type).alias(clean_name)
            
            return expr.cast(target_type, strict=False).alias(clean_name)
        return expr.alias(clean_name)

    # ==========================================================================
    # UNRESOLVABLE CHECK (extended)
    # ==========================================================================
    def _is_unresolvable(self, dtype: pl.DataType, depth: int = 0) -> bool:
        if depth > _MAX_NESTING_DEPTH:
            return True
        if dtype == pl.Null:
            return True
        dtype_name = type(dtype).__name__
        if dtype_name in ("Unknown", "Object"):
            return True
        # Extended: Binary, Object subclasses
        if dtype_name in ("Binary",):
            return True
        if isinstance(dtype, pl.List):
            inner = getattr(dtype, "inner", getattr(dtype, "dtype", None))
            if inner is None:
                return True
            return self._is_unresolvable(inner, depth + 1)
        if isinstance(dtype, pl.Struct):
            fields = getattr(dtype, "fields", [])
            for field_obj in fields:
                f_dtype = getattr(field_obj, "dtype", None)
                if f_dtype is not None and self._is_unresolvable(f_dtype, depth + 1):
                    return True
        return False

    # ==========================================================================
    # SCHEMA PATH EXTRACTION
    # ==========================================================================
    def _extract_all_schema_paths(
        self, schema: Dict[str, pl.DataType]
    ) -> List[Tuple[str, pl.DataType, List[Tuple[str, Any]]]]:
        paths = []
        for col_name, dtype in schema.items():
            paths.extend(self._extract_schema_paths(dtype, col_name, [("COL", col_name)], depth=0))
        return paths

    def _extract_schema_paths(
        self, dtype: pl.DataType, current_path: str,
        ops: List[Tuple[str, Any]], depth: int = 0,
    ) -> List[Tuple[str, pl.DataType, List[Tuple[str, Any]]]]:
        if depth > _MAX_NESTING_DEPTH:
            # C7: Emit telemetry on deep nesting fallback
            self._emit_metric("deep_nesting_fallback", 1.0, {"path": current_path[:50]})
            logger.warning("[%s] Max depth at '%s'", self._safe_log_id, current_path[:50])
            return [(current_path, pl.String, ops)]

        if self._is_unresolvable(dtype):
            return [(current_path, pl.String, ops)]

        if isinstance(dtype, pl.Struct):
            fields = getattr(dtype, "fields", [])
            if not fields:
                return [(current_path, pl.String, ops)]
            result = []
            for field_obj in fields:
                # Handle both namedtuple-style and object-style field access
                f_name = getattr(field_obj, "name", None)
                if f_name is None:
                    # Fallback for tuple-based fields (older Polars)
                    if isinstance(field_obj, tuple) and len(field_obj) >= 1:
                        f_name = str(field_obj[0])
                    else:
                        f_name = str(field_obj)
                f_dtype = getattr(field_obj, "dtype", None)
                if f_dtype is not None:
                    result.extend(
                        self._extract_schema_paths(
                            f_dtype, f"{current_path}.{f_name}",
                            ops + [("STRUCT_FIELD", f_name)], depth=depth + 1
                        )
                    )
            return result

        if isinstance(dtype, pl.List):
            inner = getattr(dtype, "inner", getattr(dtype, "dtype", None))
            if inner:
                inner_paths = self._extract_schema_paths(inner, f"{current_path}[]", [], depth=depth + 1)
                result = []
                for sub_path, sub_dtype, sub_ops in inner_paths:
                    result.append((sub_path, pl.List(sub_dtype), ops + [("LIST_EVAL", sub_ops)]))
                if result:
                    return result
            return [(current_path, dtype, ops)]

        return [(current_path, dtype, ops)]

    # ==========================================================================
    # C3: GRAPH VALIDATION (consistent sanitization)
    # ==========================================================================
    def _validate_and_build_graph(
        self,
        schema_paths: Tuple[Tuple[str, pl.DataType, Tuple], ...],
    ) -> List[Tuple[str, str, pl.DataType, Optional[pl.DataType], Tuple]]:
        """
        C3: Consistent sanitization for schema contract matching.
        source_path → raw_name → clean_name for runtime.
        schema_contract keys are already sanitized.
        """
        validated_nodes = []
        seen_runtime_names: Set[str] = set()
        skipped_fields: List[str] = []

        for source_path, f_dtype, ops in schema_paths:
            # Derive runtime name from source path (consistent with contract keys)
            raw_name = source_path.replace(".", "_").replace("[]", "")
            clean_name = pure_sanitize_column_name(raw_name)

            # Handle collisions
            base_name = clean_name
            counter = 1
            while clean_name in seen_runtime_names:
                clean_name = f"{base_name}_{counter}"
                counter += 1
            seen_runtime_names.add(clean_name)

            # C3: Lookup in pre-sanitized contract keys
            expected_type = self.schema_contract.get(clean_name)

            # C3: Strict projection uses sanitized keys
            if self.strict_projection and self._schema_contract_keys:
                if clean_name not in self._schema_contract_keys:
                    skipped_fields.append(source_path)
                    continue

            if expected_type and not self._is_type_compatible(f_dtype, expected_type):
                raise SchemaDriftError(
                    f"Semantic drift on '{source_path}' → '{clean_name}'. "
                    f"Expected {expected_type}, got {f_dtype}."
                )

            validated_nodes.append((source_path, clean_name, f_dtype, expected_type, ops))

        if skipped_fields:
            shown = skipped_fields[:min(_MAX_SKIP_LOG, 10)]
            shown_hashed = [_hash_path_for_log(p) for p in shown]
            tail = f" … and {len(skipped_fields) - len(shown)} more" if len(skipped_fields) > len(shown) else ""
            logger.warning(
                "[%s] strict_projection dropped %d field(s): %s%s",
                self._safe_log_id, len(skipped_fields), shown_hashed, tail,
            )

        return validated_nodes

    # ==========================================================================
    # AST & LINEAGE COMPILATION (C2, C6)
    # ==========================================================================
    def _freeze_ops(self, ops: Tuple) -> Tuple:
        return _deep_freeze(ops)

    def _compile_ast_and_lineage(
        self,
        validated_nodes: List[Tuple[str, str, pl.DataType, Optional[pl.DataType], Tuple]],
        plan: ExecutionPlan,
    ) -> Tuple[List[pl.Expr], Dict[str, LineageNode]]:
        extraction_exprs: List[pl.Expr] = []
        lineage_builder = _LineageBuilder()

        # C6: Deterministic cache key using serialized dtypes
        validated_hash = hashlib.sha256(
            str([
                (vn[0], vn[1], _serialize_dtype(vn[2])) for vn in validated_nodes
            ]).encode()
        ).hexdigest()[:16]

        lineage_cache_key = (
            plan.schema_signature,
            validated_hash,
            self._schema_contract_fingerprint or "",
            self.strict_projection,
        )
        
        cached_lineage = self._lineage_cache.get(lineage_cache_key)
        reuse_lineage = cached_lineage is not None

        degrade_lineage = len(validated_nodes) >= _MAX_LINEAGE_NODES
        lineage_sampling = len(validated_nodes) > _MAX_LINEAGE_NODES and _LINEAGE_SAMPLING_RATE < 1.0

        for source_path, clean_name, f_dtype, expected_type, ops in validated_nodes:
            # C2: Simplified expression cache (no available_columns)
            expr_sig = (self._safe_log_id, plan.schema_signature, self._freeze_ops(ops))
            cached_raw = self._expr_cache.get(expr_sig)

            if cached_raw is not None:
                raw_expr = cached_raw
            else:
                raw_expr = self._build_expression(ops)
                self._expr_cache.set(expr_sig, raw_expr)

            final_expr = self._apply_analytical_casts(clean_name, f_dtype, raw_expr, expected_type)
            extraction_exprs.append(final_expr)

            if not degrade_lineage:
                if lineage_sampling and random.random() > _LINEAGE_SAMPLING_RATE:
                    continue
                    
                if reuse_lineage:
                    self._copy_lineage_from_template(source_path, clean_name, f_dtype, lineage_builder, cached_lineage)
                else:
                    self._register_lineage_chain(source_path, clean_name, f_dtype, lineage_builder)

        lineage_nodes = lineage_builder.to_dag()

        if not reuse_lineage and not degrade_lineage:
            lineage_template = self._create_lineage_template(lineage_builder)
            self._lineage_cache.set(lineage_cache_key, lineage_template)

        return extraction_exprs, lineage_nodes

    def _create_lineage_template(self, builder: _LineageBuilder) -> Dict[str, Any]:
        return {
            node_id: {
                "source_paths": frozenset(node.source_paths),
                "output_column": node.output_column,
                "transform": node.transform,
                "parents": frozenset(node.parents),
                "children": frozenset(node.children),
            }
            for node_id, node in builder.nodes.items()
        }

    def _copy_lineage_from_template(
        self, source_path: str, leaf_clean_name: str, f_dtype: pl.DataType,
        builder: _LineageBuilder, template: Dict[str, Any]
    ) -> None:
        segments = [s for s in source_path.replace("[]", "").split(".") if s]
        for i, _ in enumerate(segments):
            partial_path = ".".join(segments[: i + 1])
            node_id = pure_sanitize_column_name(partial_path.replace(".", "_"))
            is_leaf = i == len(segments) - 1

            if node_id not in builder.nodes and node_id in template:
                tmpl = template[node_id]
                builder.add_node(
                    node_id=node_id,
                    source_paths=set(tmpl["source_paths"]) if is_leaf else set(),
                    output_column=leaf_clean_name if is_leaf else tmpl["output_column"],
                    transform=tmpl["transform"] if not is_leaf else f"EXTRACT_{type(f_dtype).__name__}",
                    parents=set(tmpl["parents"]),
                    children=set(tmpl["children"]),
                )

    def _register_lineage_chain(
        self, source_path: str, leaf_clean_name: str,
        f_dtype: pl.DataType, builder: _LineageBuilder
    ) -> None:
        if len(builder.nodes) >= _MAX_LINEAGE_NODES:
            return

        segments = [s for s in source_path.replace("[]", "").split(".") if s]
        prev_node_id: Optional[str] = None

        for i, _ in enumerate(segments):
            if len(builder.nodes) >= _MAX_LINEAGE_NODES:
                logger.warning("[%s] Lineage truncated", self._safe_log_id)
                return

            partial_path = ".".join(segments[: i + 1])
            node_id = pure_sanitize_column_name(partial_path.replace(".", "_"))
            is_leaf = i == len(segments) - 1

            if node_id not in builder.nodes:
                builder.add_node(
                    node_id=node_id,
                    source_paths={partial_path} if is_leaf else set(),
                    output_column=leaf_clean_name if is_leaf else node_id,
                    transform=f"EXTRACT_{type(f_dtype).__name__}" if is_leaf else "INTERMEDIATE",
                    parents={prev_node_id} if prev_node_id else set(),
                    children=set(),
                )
            else:
                node = builder.nodes[node_id]
                if is_leaf:
                    node.source_paths.add(partial_path)
                if prev_node_id:
                    node.parents.add(prev_node_id)

            if prev_node_id and prev_node_id in builder.nodes:
                builder.nodes[prev_node_id].children.add(node_id)

            prev_node_id = node_id

    def _apply_sparse_contract_fill(
        self, extraction_exprs: List[pl.Expr], lineage_nodes: Dict[str, LineageNode]
    ) -> None:
        """C2: Always use LineageNode (immutable), consistent with builder output."""
        drift_log: List[str] = []
        for expected_col, expected_type in self.schema_contract.items():
            if expected_col not in lineage_nodes:
                extraction_exprs.append(pl.lit(None).cast(expected_type).alias(expected_col))
                if len(lineage_nodes) < _MAX_LINEAGE_NODES:
                    # C2: Create LineageNode directly (not mixing types)
                    lineage_nodes[expected_col] = LineageNode(
                        id=expected_col,
                        source_paths=(),
                        output_column=expected_col,
                        transform="SPARSE_FILL",
                        parents=(),
                        children=(),
                    )
                drift_log.append(expected_col)

        if drift_log:
            logger.warning("[%s] Sparse contract fill: %d field(s)", self._safe_log_id, len(drift_log))

    # ==========================================================================
    # EXPRESSION BUILDER
    # ==========================================================================
    def _build_inner_expression(self, ops: Tuple, base_expr: pl.Expr) -> pl.Expr:
        expr = base_expr
        for op_type, op_val in ops:
            if op_type == "STRUCT_FIELD":
                field_expr = expr.struct.field(op_val)
                # `fill_null(None)` is invalid in newer Polars; keep passthrough semantics.
                expr = field_expr
            elif op_type == "LIST_EVAL":
                inner_expr = self._build_inner_expression(op_val, pl.element())
                expr = pl.when(expr.is_not_null()).then(expr.list.eval(inner_expr)).otherwise(None)
        return expr

    def _build_expression(self, ops: Tuple) -> pl.Expr:
        if not ops or ops[0][0] != "COL":
            raise ValueError("Invalid AST: first operation must be 'COL'.")
        return self._build_inner_expression(ops[1:], pl.col(ops[0][1]))

    # ==========================================================================
    # TYPE COMPATIBILITY (extended)
    # ==========================================================================
    def _is_type_compatible(self, actual: pl.DataType, expected: pl.DataType) -> bool:
        if actual == expected:
            return True
        
        # Handle string family
        if _is_string_dtype(actual) and _is_string_dtype(expected):
            return True
        
        # Handle Categorical/Enum specially
        actual_name = type(actual).__name__
        expected_name = type(expected).__name__
        if actual_name in ("Categorical", "Enum") and expected_name in ("Categorical", "Enum", "String", "Utf8"):
            return True

        a_type = type(actual) if not isinstance(actual, type) else actual
        e_type = type(expected) if not isinstance(expected, type) else expected

        int_sizes = {
            pl.Int8: 1, pl.Int16: 2, pl.Int32: 4, pl.Int64: 8,
            pl.UInt8: 1, pl.UInt16: 2, pl.UInt32: 4, pl.UInt64: 8,
        }
        if a_type in int_sizes and e_type in int_sizes:
            a_signed = not a_type.__name__.startswith("UInt")
            e_signed = not e_type.__name__.startswith("UInt")
            if a_signed != e_signed:
                return (not a_signed and e_signed) and int_sizes[e_type] > int_sizes[a_type]
            return int_sizes[e_type] >= int_sizes[a_type]

        float_sizes = {pl.Float32: 4, pl.Float64: 8}
        if a_type in float_sizes and e_type in float_sizes:
            return float_sizes[e_type] >= float_sizes[a_type]

        if isinstance(actual, pl.Datetime) and isinstance(expected, pl.Datetime):
            res_order = {"ns": 3, "us": 2, "ms": 1}
            a_res = getattr(actual, "time_unit", "us")
            e_res = getattr(expected, "time_unit", "us")
            a_tz = getattr(actual, "time_zone", None)
            e_tz = getattr(expected, "time_zone", None)
            # Timezone must match for compatibility
            if a_tz != e_tz:
                return False
            return res_order.get(e_res, 0) >= res_order.get(a_res, 0)

        return False

    # ==========================================================================
    # COMPLEXITY
    # ==========================================================================
    def _compute_complexity(
        self, schema_paths: List[Tuple[str, pl.DataType, Any]]
    ) -> Dict[str, Union[int, float]]:
        if not schema_paths:
            return {"columns": 0, "struct_depth": 0, "list_nodes": 0, "object_nodes": 0}
        return {
            "columns": len(schema_paths),
            "struct_depth": max(len(ops) for _, _, ops in schema_paths),
            "list_nodes": sum(1 for _, dtype, _ in schema_paths if isinstance(dtype, pl.List)),
            "object_nodes": sum(1 for _, dtype, _ in schema_paths if self._is_unresolvable(dtype)),
        }

    # ==========================================================================
    # EMPTY FRAME
    # ==========================================================================
    def _create_empty_audit_df(self) -> pl.DataFrame:
        schema: Dict[str, pl.DataType] = {
            "_tenant_id": pl.String,
            "_integration_name": pl.String,
            "_schema_version": pl.String,
            "_extracted_at": pl.Datetime(time_unit="us", time_zone="UTC"),
        }
        if self.schema_contract:
            schema.update(self.schema_contract)
        return pl.DataFrame(schema=schema)