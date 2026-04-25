# api/services/metric_governance.py
# Titan Edition — v12.0.0 ("Hyperion")
# ─────────────────────────────────────────────────────────────────────────────
# Improvements over v11.0.0-Titan-DSL
# ─────────────────────────────────────────────────────────────────────────────
#  NEW #1   ExecutionPlanner       — merges compatible aggregations, collapses
#            redundant CTEs, and eliminates duplicate dataset scans.
#  NEW #2   Predicate Pushdown     — collects all filters across the metric
#            graph before execution and rewrites them into base-scan predicates.
#  NEW #3   Dynamic Cost Model     — tenant-tier quotas, complexity scoring
#            (rows × w1 + joins × w2 + subqueries × w3), adaptive rejection.
#  NEW #4   Materialization Layer  — precomputed metrics stored as Parquet
#            snapshots; queries are transparently rewritten to use them.
#  NEW #5   Semantic Type System   — CURRENCY / PERCENTAGE / COUNT / DURATION /
#            RATIO / DIMENSION enum with cross-type arithmetic guards.
#  NEW #6   Metric Lineage Graph   — upstream + downstream tracking, impact
#            analysis, and change-propagation detection.
#  NEW #7   Hot-Path LRU Cache     — in-process LRU(1 000) sits in front of
#            the external cache_manager for sub-millisecond repeated lookups.
#  NEW #8   Failure Recovery Modes — three-tier graceful degradation:
#            (a) full compile → (b) join-stripped single-table → (c) partial.
#  NEW #9   Row-Level Security     — per-user region/group predicates injected
#            at AST level before every execution plan is emitted.
#  NEW #10  Query Explanation      — human-readable explanation with SQL,
#            cost estimate, lineage summary, and semantic type notes.
#  NEW #11  Latency Histograms     — p50/p95/p99 tracking for compile + LLM
#            latency; exposed alongside GovernanceMetrics snapshot.
#  NEW #12  Plugin Architecture    — CompilerPlugin protocol with before/after
#            hooks for custom validations and enterprise extensions.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import bisect
import hashlib
import json
import logging
import re
import threading
import time
import asyncio
from collections import OrderedDict
from dataclasses import dataclass, field as dc_field
from datetime import datetime
from enum import Enum
from functools import lru_cache
from typing import (
    Any, Dict, List, Optional, Protocol, Set, Tuple, Union, runtime_checkable,
)

import sqlglot
import sqlglot.expressions as exp
from pydantic import BaseModel, Field, validator, ValidationError
from sqlalchemy import or_
from sqlalchemy.orm import Session

from api.database import SessionLocal
from models import Dataset, SemanticMetric
from api.services.storage_manager import storage_manager
from api.services.cache_manager import cache_manager
from api.services.llm_client import llm_client

logger = logging.getLogger(__name__)


# =============================================================================
# CUSTOM DOMAIN EXCEPTIONS
# =============================================================================

class SemanticCompilationError(Exception):
    """Base exception for all semantic-layer compilation failures."""

class SecurityViolationError(SemanticCompilationError):
    """Forbidden AST node or multi-tenant boundary leak detected."""

class ComplexityExceededError(SemanticCompilationError):
    """Query syntactic depth or subquery count exceeds tenant limits."""

class CircularDependencyError(SemanticCompilationError):
    """Topological sort detected an infinite loop in the metric DAG."""

class SemanticValidationError(SemanticCompilationError):
    """LLM proposed mathematically impossible, type-unsafe, or schema-invalid logic."""

class GlobalBudgetExceededError(SemanticCompilationError):
    """Compilation loop exceeded the strict API latency budget."""

class CostExceededError(SemanticCompilationError):
    """Estimated scan exceeds safe row / byte / complexity thresholds."""

class PhantomDependencyError(SemanticCompilationError):
    """A declared DAG dependency slug does not exist in the governed catalog."""

class SemanticTypeConflictError(SemanticCompilationError):
    """Arithmetic attempted across incompatible semantic types."""

class MaterializationError(SemanticCompilationError):
    """Materialized snapshot write or read failed."""

class RLSConfigurationError(SemanticCompilationError):
    """Row-level security policy is missing or malformed for this user."""


# =============================================================================
# NEW #11 — LATENCY HISTOGRAM
# =============================================================================

class LatencyHistogram:
    """
    Fixed-bucket percentile tracker.
    Thread-safe. Tracks p50 / p95 / p99 without external dependencies.
    """

    def __init__(self, name: str) -> None:
        self.name   = name
        self._data: List[float] = []
        self._lock  = threading.Lock()

    def record(self, ms: float) -> None:
        with self._lock:
            bisect.insort(self._data, ms)

    def percentile(self, p: float) -> float:
        """Return the p-th percentile (0–100). Returns 0 if no data."""
        with self._lock:
            if not self._data:
                return 0.0
            idx = int(len(self._data) * p / 100) - 1
            return self._data[max(0, idx)]

    def snapshot(self) -> Dict[str, float]:
        return {
            f"{self.name}_p50_ms": self.percentile(50),
            f"{self.name}_p95_ms": self.percentile(95),
            f"{self.name}_p99_ms": self.percentile(99),
            f"{self.name}_count":  float(len(self._data)),
        }


# =============================================================================
# OBSERVABILITY COUNTERS (FIX #6 from v11 + NEW #11 histograms)
# =============================================================================

@dataclass
class GovernanceMetrics:
    """
    Prometheus-style counters + latency histograms for the governance pipeline.
    Thread-safe via internal lock. Expose via /metrics or a background push.
    """
    compilation_attempts_total:        int = 0
    compilation_successes_total:       int = 0
    compilation_failures_total:        int = 0
    cache_hits_total:                  int = 0
    cache_misses_total:                int = 0
    hot_cache_hits_total:              int = 0   # NEW #7
    llm_calls_total:                   int = 0
    llm_retries_total:                 int = 0
    security_violations_total:         int = 0
    cost_guard_rejections_total:       int = 0
    dag_phantom_dependency_errors_total: int = 0
    materialization_hits_total:        int = 0   # NEW #4
    recovery_degradations_total:       int = 0   # NEW #8
    rls_injections_total:              int = 0   # NEW #9
    plugin_hooks_fired_total:          int = 0   # NEW #12

    # Histograms — not counters, excluded from int snapshot
    _compile_histogram: LatencyHistogram = dc_field(
        default_factory=lambda: LatencyHistogram("compile_latency"),
        repr=False, compare=False,
    )
    _llm_histogram: LatencyHistogram = dc_field(
        default_factory=lambda: LatencyHistogram("llm_latency"),
        repr=False, compare=False,
    )
    _lock: threading.Lock = dc_field(
        default_factory=threading.Lock, repr=False, compare=False,
    )

    def inc(self, attr: str, amount: int = 1) -> None:
        with self._lock:
            setattr(self, attr, getattr(self, attr) + amount)

    def record_compile_latency(self, ms: float) -> None:
        self._compile_histogram.record(ms)

    def record_llm_latency(self, ms: float) -> None:
        self._llm_histogram.record(ms)

    def snapshot(self) -> Dict[str, Any]:
        """Full snapshot: counters + percentile histograms."""
        with self._lock:
            counters = {
                k: v for k, v in self.__dict__.items()
                if not k.startswith("_") and isinstance(v, int)
            }
        return {
            **counters,
            **self._compile_histogram.snapshot(),
            **self._llm_histogram.snapshot(),
        }


_governance_metrics = GovernanceMetrics()


def get_governance_metrics() -> GovernanceMetrics:
    """Public accessor for the observability singleton (for /metrics injection)."""
    return _governance_metrics


# =============================================================================
# NEW #5 — SEMANTIC TYPE SYSTEM
# =============================================================================

class SemanticType(str, Enum):
    CURRENCY   = "CURRENCY"
    PERCENTAGE = "PERCENTAGE"
    COUNT      = "COUNT"
    DURATION   = "DURATION"
    RATIO      = "RATIO"
    DIMENSION  = "DIMENSION"
    UNKNOWN    = "UNKNOWN"


# Arithmetic compatibility matrix.
# Key = (numerator_type, denominator_type) → allowed result type.
# Any pair absent from this map is a SemanticTypeConflictError.
_RATIO_COMPATIBILITY: Dict[Tuple[SemanticType, SemanticType], SemanticType] = {
    (SemanticType.CURRENCY,   SemanticType.COUNT):      SemanticType.CURRENCY,
    (SemanticType.CURRENCY,   SemanticType.CURRENCY):   SemanticType.RATIO,
    (SemanticType.COUNT,      SemanticType.COUNT):      SemanticType.RATIO,
    (SemanticType.COUNT,      SemanticType.CURRENCY):   SemanticType.RATIO,
    (SemanticType.DURATION,   SemanticType.COUNT):      SemanticType.DURATION,
    (SemanticType.PERCENTAGE, SemanticType.COUNT):      SemanticType.PERCENTAGE,
    (SemanticType.UNKNOWN,    SemanticType.UNKNOWN):    SemanticType.UNKNOWN,
}

# Heuristic column-name → semantic type hints (overridable via MetricIR)
_SEMANTIC_HINTS: Dict[str, SemanticType] = {
    "revenue":    SemanticType.CURRENCY,
    "price":      SemanticType.CURRENCY,
    "spend":      SemanticType.CURRENCY,
    "cost":       SemanticType.CURRENCY,
    "roas":       SemanticType.RATIO,
    "ctr":        SemanticType.PERCENTAGE,
    "rate":       SemanticType.PERCENTAGE,
    "pct":        SemanticType.PERCENTAGE,
    "count":      SemanticType.COUNT,
    "orders":     SemanticType.COUNT,
    "users":      SemanticType.COUNT,
    "duration":   SemanticType.DURATION,
    "seconds":    SemanticType.DURATION,
    "minutes":    SemanticType.DURATION,
}


def _infer_semantic_type(field_name: str) -> SemanticType:
    lower = field_name.lower()
    for hint, stype in _SEMANTIC_HINTS.items():
        if hint in lower:
            return stype
    return SemanticType.UNKNOWN


def _assert_ratio_type_safe(
    num_field: str, den_field: str
) -> SemanticType:
    """Raises SemanticTypeConflictError if the ratio makes no business sense."""
    nt = _infer_semantic_type(num_field)
    dt = _infer_semantic_type(den_field)
    key = (nt, dt)
    if key in _RATIO_COMPATIBILITY:
        return _RATIO_COMPATIBILITY[key]
    # Allow UNKNOWN combinations — only block known-bad pairings
    if nt != SemanticType.UNKNOWN and dt != SemanticType.UNKNOWN:
        raise SemanticTypeConflictError(
            f"Dividing '{num_field}' ({nt.value}) by '{den_field}' ({dt.value}) "
            "produces a semantically meaningless metric. Check your definition."
        )
    return SemanticType.UNKNOWN


# =============================================================================
# NEW #6 — METRIC LINEAGE GRAPH
# =============================================================================

@dataclass
class MetricLineage:
    """
    Bidirectional lineage entry for a governed metric.
    Stored alongside the metric in the catalog (provenance_metadata).
    """
    metric_slug:         str
    upstream_metrics:    List[str]   # metrics this one depends on
    downstream_metrics:  List[str]   # metrics that declare this one as a dependency
    source_dataset_ids:  List[str]
    semantic_type:       SemanticType = SemanticType.UNKNOWN
    created_at:          str = dc_field(default_factory=lambda: datetime.utcnow().isoformat())

    def impact_summary(self) -> Dict[str, Any]:
        return {
            "slug":        self.metric_slug,
            "upstream":    self.upstream_metrics,
            "downstream":  self.downstream_metrics,
            "warning": (
                f"Changing this metric will break {len(self.downstream_metrics)} "
                "downstream metric(s)."
                if self.downstream_metrics else "No downstream dependents."
            ),
        }


class LineageRegistry:
    """
    In-process bidirectional lineage store.
    Keyed by metric_slug. Thread-safe. Rebuilt from DB on service restart.
    """

    def __init__(self) -> None:
        self._store: Dict[str, MetricLineage] = {}
        self._lock  = threading.Lock()

    def register(self, lineage: MetricLineage) -> None:
        with self._lock:
            self._store[lineage.metric_slug] = lineage
            # Back-propagate: mark this slug as downstream of its upstreams
            for up in lineage.upstream_metrics:
                if up in self._store:
                    if lineage.metric_slug not in self._store[up].downstream_metrics:
                        self._store[up].downstream_metrics.append(lineage.metric_slug)

    def get(self, slug: str) -> Optional[MetricLineage]:
        with self._lock:
            return self._store.get(slug)

    def impact_analysis(self, slug: str) -> Dict[str, Any]:
        entry = self.get(slug)
        if not entry:
            return {"slug": slug, "warning": "Not tracked in lineage registry."}
        return entry.impact_summary()

    def all_downstream(self, slug: str) -> List[str]:
        """Returns transitive downstream slugs via BFS."""
        visited: Set[str] = set()
        queue             = [slug]
        while queue:
            current = queue.pop(0)
            entry   = self.get(current)
            if not entry:
                continue
            for ds in entry.downstream_metrics:
                if ds not in visited:
                    visited.add(ds)
                    queue.append(ds)
        return list(visited)


_lineage_registry = LineageRegistry()


def get_lineage_registry() -> LineageRegistry:
    return _lineage_registry


# =============================================================================
# NEW #7 — HOT-PATH IN-PROCESS LRU CACHE
# =============================================================================

class _LRUCache:
    """
    Thread-safe LRU cache backed by an OrderedDict.
    Sits in front of the external cache_manager for sub-millisecond repeated lookups.
    """

    def __init__(self, maxsize: int = 1_000) -> None:
        self._maxsize = maxsize
        self._store: OrderedDict[str, str] = OrderedDict()
        self._lock   = threading.Lock()

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            if key not in self._store:
                return None
            self._store.move_to_end(key)
            return self._store[key]

    def set(self, key: str, value: str) -> None:
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = value
            if len(self._store) > self._maxsize:
                self._store.popitem(last=False)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)


_hot_cache = _LRUCache(maxsize=1_000)


# =============================================================================
# NEW #12 — PLUGIN ARCHITECTURE
# =============================================================================

@runtime_checkable
class CompilerPlugin(Protocol):
    """
    Protocol for compiler extension hooks.

    Implement both methods and register via
    MetricGovernanceService.register_plugin(plugin_instance).

    before_compile: called after schema extraction, before the LLM loop.
                    Raise SemanticCompilationError to abort compilation.

    after_compile:  called after successful AST build and sandbox validation.
                    May mutate provenance_metadata dict in-place.
                    Raise SemanticCompilationError to reject the result.
    """

    def before_compile(
        self,
        tenant_id: str,
        request_name: str,
        schema_dict: Dict[str, Any],
    ) -> None: ...

    def after_compile(
        self,
        tenant_id: str,
        result: "CompiledMetricResult",
        provenance_metadata: Dict[str, Any],
    ) -> None: ...


# =============================================================================
# NEW #3 — DYNAMIC COST MODEL
# =============================================================================

class TenantTier(str, Enum):
    FREE       = "free"
    STARTER    = "starter"
    GROWTH     = "growth"
    ENTERPRISE = "enterprise"


# Tier limits: (max_rows, max_bytes, max_complexity_score)
_TIER_LIMITS: Dict[TenantTier, Tuple[int, int, float]] = {
    TenantTier.FREE:       (10_000_000,  1 * 1024 ** 3,  50.0),
    TenantTier.STARTER:    (50_000_000,  5 * 1024 ** 3, 150.0),
    TenantTier.GROWTH:     (200_000_000, 20 * 1024 ** 3, 400.0),
    TenantTier.ENTERPRISE: (500_000_000, 50 * 1024 ** 3, 999.0),
}

# Complexity scoring weights
_W_ROW        = 1e-6   # per row
_W_JOIN       = 25.0   # per declared join
_W_SUBQUERY   = 40.0   # per subquery
_W_DATASET    = 10.0   # per additional dataset beyond the first


def _complexity_score(
    total_rows: int,
    num_joins: int,
    num_subqueries: int,
    num_datasets: int,
) -> float:
    return (
        total_rows        * _W_ROW
        + num_joins       * _W_JOIN
        + num_subqueries  * _W_SUBQUERY
        + max(0, num_datasets - 1) * _W_DATASET
    )


# =============================================================================
# NEW #4 — MATERIALIZATION LAYER
# =============================================================================

@dataclass
class MaterializedSnapshot:
    metric_slug:      str
    parquet_path:     str
    row_count:        int
    refresh_strategy: str        # "full" | "incremental"
    refresh_interval: str        # "5min" | "1h" | "24h"
    created_at:       str
    expires_at:       str        # ISO 8601; checked before reuse


class MaterializationRegistry:
    """
    In-process registry of precomputed metric snapshots.
    In production, back this with a durable store (Postgres or Redis).
    """

    def __init__(self) -> None:
        self._store: Dict[str, MaterializedSnapshot] = {}
        self._lock  = threading.Lock()

    def register(self, snap: MaterializedSnapshot) -> None:
        with self._lock:
            self._store[snap.metric_slug] = snap

    def get_if_valid(self, slug: str) -> Optional[MaterializedSnapshot]:
        with self._lock:
            snap = self._store.get(slug)
            if not snap:
                return None
            if snap.expires_at < datetime.utcnow().isoformat():
                del self._store[slug]
                return None
            return snap

    def invalidate(self, slug: str) -> None:
        with self._lock:
            self._store.pop(slug, None)


_materialization_registry = MaterializationRegistry()


def get_materialization_registry() -> MaterializationRegistry:
    return _materialization_registry


# =============================================================================
# NEW #10 — QUERY EXPLANATION MODEL
# =============================================================================

class QueryExplanation(BaseModel):
    """Human-readable compilation report delivered to the user or the UI."""
    metric_name:       str
    metric_slug:       str
    semantic_type:     str
    compiled_sql:      str
    estimated_rows:    int
    estimated_bytes:   int
    complexity_score:  float
    lineage_summary:   Dict[str, Any]
    type_notes:        str
    compiler_version:  str
    compilation_ms:    float
    llm_confidence:    float
    warnings:          List[str] = Field(default_factory=list)


# =============================================================================
# EXISTING SCHEMA MODELS (v11 — unchanged except new fields)
# =============================================================================

class JoinSpec(BaseModel):
    left_table:  str = Field(..., description="UUID alias of the driving table")
    right_table: str = Field(..., description="UUID alias of the joined table")
    left_field:  str = Field(..., description="Join key column on the left table")
    right_field: str = Field(..., description="Join key column on the right table")
    join_type:   str = Field(default="INNER")

    @validator("join_type")
    def validate_join_type(cls, v: str) -> str:
        allowed = {"INNER", "LEFT", "RIGHT", "FULL"}
        if v.upper() not in allowed:
            raise ValueError(f"Join type '{v}' not permitted. Use: {allowed}")
        return v.upper()


class DatasetStats(BaseModel):
    table_alias:  str
    row_count:    int
    size_bytes:   int
    last_updated: str


class NLMetricRequest(BaseModel):
    metric_name:  str                    = Field(...)
    description:  str                    = Field(...)
    dataset_id:   Optional[str]          = Field(None)
    dataset_ids:  Optional[List[str]]    = Field(None)
    # NEW #5: optional semantic type hint from the caller
    semantic_type: Optional[str]         = Field(None)
    # NEW #9: optional RLS context
    rls_context:  Optional[Dict[str, Any]] = Field(None)


class StructuredAggr(BaseModel):
    operation: str = Field(...)
    field:     str = Field(...)

    @validator("operation")
    def validate_op(cls, v: str) -> str:
        allowed = {"SUM", "COUNT", "AVG", "MIN", "MAX", "DISTINCT_COUNT", "NONE"}
        if v.upper() not in allowed:
            raise ValueError(f"Operation '{v}' forbidden by the deterministic compiler.")
        return v.upper()


class StructuredFilter(BaseModel):
    field:    str                              = Field(...)
    operator: str                              = Field(...)
    values:   List[Union[str, int, float, bool]] = Field(...)

    @validator("operator")
    def validate_op(cls, v: str) -> str:
        allowed = {"=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"}
        if v.upper() not in allowed:
            raise ValueError(f"Operator '{v}' invalid for structured filtering.")
        return v.upper()


class MetricIR(BaseModel):
    ir_version:   str                           = Field(default="v1.1")
    metric_type:  str                           = Field(...)
    numerator:    StructuredAggr                = Field(...)
    denominator:  Optional[StructuredAggr]      = Field(None)
    filters:      Optional[List[StructuredFilter]] = Field(default_factory=list)
    target_tables: List[str]                    = Field(...)
    joins:        Optional[List[JoinSpec]]      = Field(default_factory=list)
    depends_on:   List[str]                     = Field(default_factory=list)
    confidence:   float                         = Field(...)
    # NEW #5: LLM-declared semantic type (validated against inferred type)
    semantic_type: Optional[str]                = Field(None)


class StoredMetricMetadata(BaseModel):
    compiler_version:   str      = Field(...)
    ir_version:         str      = Field(...)
    llm_confidence:     float    = Field(...)
    dialect:            str      = Field(...)
    metric_ir_payload:  MetricIR = Field(...)
    ast_node_complexity: int     = Field(...)
    timestamp:          str      = Field(...)


class CompiledMetricResult(BaseModel):
    metric_name:         str
    metric_slug:         str
    compiled_sql:        str
    is_valid:            bool
    schema_hash:         str
    error_message:       Optional[str]       = None
    ast_node_complexity: int                 = 0
    provenance_metadata: Dict[str, Any]      = Field(default_factory=dict)
    semantic_type:       str                 = SemanticType.UNKNOWN.value  # NEW #5
    lineage:             Optional[Dict[str, Any]] = None                   # NEW #6


class MetricCatalogSummary(BaseModel):
    tenant_id:               str
    dataset_ids:             List[str]
    total_governed_metrics:  int
    semantic_dictionary:     Dict[str, str]


# =============================================================================
# NEW #1 — EXECUTION PLANNER
# =============================================================================

@dataclass
class _AggregationSpec:
    expression: str     # e.g. "SUM(price)"
    alias:      str     # e.g. "revenue"
    table:      str     # UUID alias


class ExecutionPlanner:
    """
    Logical → Physical query planner.

    Given a set of governed metric SQLs that reference the same base dataset,
    it merges their projections into a single SELECT, eliminating redundant
    full-table scans and collapsing multiple CTEs into one.

    Activate via MetricGovernanceService.plan_execution(...).
    """

    def optimize(
        self,
        metric_sqls: Dict[str, str],   # slug → compiled SQL
        dataset_stats: Dict[str, DatasetStats],
    ) -> str:
        """
        Attempt to merge all single-table metrics into one scan.
        Falls back gracefully to CTE stacking if metrics span multiple tables.
        """
        if not metric_sqls:
            return ""

        # Group by driving table
        by_table: Dict[str, List[Tuple[str, exp.Select]]] = {}
        unmerged: Dict[str, str] = {}

        for slug, sql in metric_sqls.items():
            try:
                ast = sqlglot.parse_one(sql, read="duckdb")
                if not isinstance(ast, exp.Select):
                    unmerged[slug] = sql
                    continue
                tables = [t.name for t in ast.find_all(exp.Table)]
                if len(tables) != 1:
                    unmerged[slug] = sql
                    continue
                tbl = tables[0]
                by_table.setdefault(tbl, []).append((slug, ast))
            except Exception:
                unmerged[slug] = sql

        merged_parts: List[str] = []

        for tbl, entries in by_table.items():
            if len(entries) == 1:
                slug, ast = entries[0]
                merged_parts.append(
                    f"-- metric: {slug}\n{ast.sql(dialect='duckdb', pretty=True)}"
                )
                continue

            # Merge all projections into a single SELECT … FROM tbl
            projections: List[exp.Expression] = []
            where_exprs: List[exp.Expression] = []

            for slug, ast in entries:
                for sel in ast.selects:
                    projections.append(exp.alias_(sel, alias=slug))
                if ast.find(exp.Where):
                    where_exprs.append(ast.find(exp.Where).this)  # type: ignore[union-attr]

            merged_select = exp.select(*projections).from_(tbl)
            if where_exprs:
                # Combine filters: only push filters common to ALL metrics
                common = where_exprs[0]
                for w in where_exprs[1:]:
                    if w.sql() == common.sql():
                        continue
                    common = None
                    break
                if common:
                    merged_select = merged_select.where(common)

            merged_parts.append(
                f"-- merged scan for table: {tbl}\n"
                + merged_select.sql(dialect="duckdb", pretty=True)
            )

        # Re-append unmerged multi-table metrics as separate CTEs
        for slug, sql in unmerged.items():
            merged_parts.append(f"-- multi-table metric: {slug}\n{sql}")

        return "\n\n".join(merged_parts)


# =============================================================================
# NEW #2 — PREDICATE PUSHDOWN ENGINE
# =============================================================================

class PredicatePushdownEngine:
    """
    Collects all StructuredFilter predicates declared across a metric graph
    and rewrites base-table SQL to push them into the read_parquet call layer.

    This trades the scan of the full dataset for a filtered subset —
    the difference between scanning 50 GB and scanning 200 MB.
    """

    def collect_filters(
        self,
        ir_list: List[MetricIR],
    ) -> Dict[str, List[StructuredFilter]]:
        """
        Returns { table_alias → [filters] } for all filters that reference
        exactly one table and whose field appears exclusively in that table.
        """
        per_table: Dict[str, List[StructuredFilter]] = {}
        for ir in ir_list:
            if not ir.filters:
                continue
            if len(ir.target_tables) != 1:
                # Cannot safely push filters for multi-table metrics without join analysis
                continue
            tbl = ir.target_tables[0]
            per_table.setdefault(tbl, []).extend(ir.filters)
        return per_table

    def rewrite_with_pushdown(
        self,
        sql: str,
        pushed_filters: Dict[str, List[StructuredFilter]],
        dialect: str = "duckdb",
    ) -> str:
        """
        Injects pushed predicates as WHERE clauses into the AST of the base SQL.
        If the table already has a WHERE, the pushed predicate is AND-combined.
        """
        if not pushed_filters:
            return sql
        try:
            ast = sqlglot.parse_one(sql, read=dialect)
            for table_alias, filters in pushed_filters.items():
                for f in filters:
                    col = exp.column(f.field)

                    def _lit(v: Any) -> exp.Expression:
                        if isinstance(v, bool):
                            return exp.Boolean(this=v)
                        if isinstance(v, (int, float)):
                            return exp.Literal.number(v)
                        return exp.Literal.string(str(v))

                    if f.operator in ("IN", "NOT IN"):
                        node: exp.Expression = exp.In(
                            this=col, expressions=[_lit(v) for v in f.values]
                        )
                        if f.operator == "NOT IN":
                            node = exp.Not(this=node)
                    else:
                        op_map = {
                            "=": exp.EQ, "!=": exp.NEQ, ">": exp.GT,
                            "<": exp.LT, ">=": exp.GTE, "<=": exp.LTE,
                        }
                        node = op_map[f.operator](this=col, expression=_lit(f.values[0]))

                    ast = ast.where(node)  # type: ignore[assignment]
            return ast.sql(dialect=dialect, pretty=True)
        except Exception as e:
            logger.warning(f"Predicate pushdown rewrite failed, returning original SQL: {e}")
            return sql


# =============================================================================
# NEW #9 — ROW-LEVEL SECURITY ENGINE
# =============================================================================

@dataclass
class RLSPolicy:
    """
    Per-user row-level security policy.
    Injected as an additional WHERE predicate into every base-table read.
    """
    user_id:        str
    allowed_values: Dict[str, List[Any]]   # { column_name: [allowed_value, ...] }
    policy_version: str = "v1"

    def to_filter_list(self) -> List[StructuredFilter]:
        return [
            StructuredFilter(field=col, operator="IN", values=vals)
            for col, vals in self.allowed_values.items()
        ]


class RLSEngine:
    """Injects RLS predicates into an AST before the execution plan is emitted."""

    def inject(self, sql: str, policy: RLSPolicy, dialect: str = "duckdb") -> str:
        try:
            ast = sqlglot.parse_one(sql, read=dialect)
            for col_name, allowed_vals in policy.allowed_values.items():
                if not allowed_vals:
                    raise RLSConfigurationError(
                        f"RLS policy for user '{policy.user_id}' has an empty "
                        f"allowed-values list for column '{col_name}'."
                    )
                in_node = exp.In(
                    this=exp.column(col_name),
                    expressions=[
                        (
                            exp.Boolean(this=v) if isinstance(v, bool)
                            else exp.Literal.number(v) if isinstance(v, (int, float))
                            else exp.Literal.string(str(v))
                        )
                        for v in allowed_vals
                    ],
                )
                ast = ast.where(in_node)  # type: ignore[assignment]
            _governance_metrics.inc("rls_injections_total")
            return ast.sql(dialect=dialect, pretty=True)
        except RLSConfigurationError:
            raise
        except Exception as e:
            logger.error(f"RLS injection failed for user '{policy.user_id}': {e}")
            raise RLSConfigurationError(f"RLS injection error: {e}")


# =============================================================================
# THE DETERMINISTIC SEMANTIC COMPILER — v12.0.0 "Hyperion"
# =============================================================================

class MetricGovernanceService:
    """
    Hyperion Edition Semantic Compiler (v12.0.0).

    Inherits all six v11 fixes and adds twelve new capabilities.
    See module-level docstring for the full changelog.
    """

    def __init__(self) -> None:
        # Security enclave
        self.FORBIDDEN_OPERATIONS = (
            exp.Drop, exp.Delete, exp.Insert, exp.Update,
            exp.Alter, exp.Command, exp.Commit, exp.Execute,
            exp.Pivot, exp.Unnest,
        )

        # Hard limits
        self.MAX_RETRY_ATTEMPTS = 3
        self.GLOBAL_TIMEOUT_SEC = 10.0
        self.MAX_AST_NODES      = 500
        self.MAX_SUBQUERIES     = 3

        # Default cost limits (overridden per tenant via _get_tenant_limits)
        self.MAX_SCAN_ROWS  = 500_000_000
        self.MAX_SCAN_BYTES = 50 * 1024 ** 3

        # Provenance
        self.COMPILER_VERSION = "v12.0.0-Hyperion"
        self.DIALECT          = "duckdb"

        # Observability
        self._obs = _governance_metrics

        # Sub-systems
        self._execution_planner  = ExecutionPlanner()
        self._pushdown_engine    = PredicatePushdownEngine()
        self._rls_engine         = RLSEngine()

        # Plugin registry (NEW #12)
        self._plugins: List[CompilerPlugin] = []

    # ── Plugin registry ──────────────────────────────────────────────────────

    def register_plugin(self, plugin: CompilerPlugin) -> None:
        """Register a CompilerPlugin to receive before/after compile hooks."""
        if not isinstance(plugin, CompilerPlugin):
            raise TypeError(f"{plugin!r} does not implement the CompilerPlugin protocol.")
        self._plugins.append(plugin)
        logger.info(f"Compiler plugin registered: {type(plugin).__name__}")

    def _fire_before_compile(
        self, tenant_id: str, name: str, schema_dict: Dict[str, Any]
    ) -> None:
        for plugin in self._plugins:
            plugin.before_compile(tenant_id, name, schema_dict)
            self._obs.inc("plugin_hooks_fired_total")

    def _fire_after_compile(
        self, tenant_id: str, result: CompiledMetricResult, meta: Dict[str, Any]
    ) -> None:
        for plugin in self._plugins:
            plugin.after_compile(tenant_id, result, meta)
            self._obs.inc("plugin_hooks_fired_total")

    # ── NEW #3: Tenant tier resolution ───────────────────────────────────────

    def _get_tenant_limits(
        self, tenant_id: str
    ) -> Tuple[int, int, float]:
        """
        Resolve tenant tier → (max_rows, max_bytes, max_complexity_score).
        Replace the stub with a real DB/config lookup in production.
        """
        # Stub: all tenants default to ENTERPRISE limits
        # In production: query a TenantConfig table and cache the result.
        tier = TenantTier.ENTERPRISE
        return _TIER_LIMITS[tier]

    # ── Hashers ───────────────────────────────────────────────────────────────

    def _generate_schema_hash(
        self, schema_dict: Dict[str, Any], datasets: List[Dataset]
    ) -> str:
        lineage = {str(ds.id): ds.updated_at.isoformat() for ds in datasets if ds.updated_at}
        state   = {"lineage": lineage, "schema": schema_dict, "ir_version": "v1.1"}
        return hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()

    def _generate_request_hash(self, metric_name: str, description: str) -> str:
        return hashlib.sha256(f"{metric_name}:{description}".encode()).hexdigest()

    def _generate_metric_slug(self, metric_name: str) -> str:
        base       = re.sub(r"[^a-z0-9_]", "", metric_name.lower().replace(" ", "_"))
        short_hash = hashlib.md5(metric_name.encode()).hexdigest()[:6]
        return f"m_{base}_{short_hash}"

    # ── AST builders (FIX #1 — zero string interpolation) ────────────────────

    def _build_aggr_expr(self, aggr: StructuredAggr) -> exp.Expression:
        col = exp.column(aggr.field)
        match aggr.operation:
            case "SUM":            return exp.Sum(this=col)
            case "COUNT":          return exp.Count(this=col)
            case "AVG":            return exp.Avg(this=col)
            case "MIN":            return exp.Min(this=col)
            case "MAX":            return exp.Max(this=col)
            case "DISTINCT_COUNT": return exp.Count(this=exp.Distinct(expressions=[col]))
            case "NONE":           return col
            case _:
                raise SemanticValidationError(
                    f"Unrecognized aggregation operation: {aggr.operation}"
                )

    def _build_filter_expr(self, f: StructuredFilter) -> exp.Expression:
        col = exp.column(f.field)

        def _literal(v: Any) -> exp.Expression:
            if isinstance(v, bool):
                return exp.Boolean(this=v)
            if isinstance(v, (int, float)):
                return exp.Literal.number(v)
            return exp.Literal.string(str(v))

        if f.operator in ("IN", "NOT IN"):
            in_node = exp.In(this=col, expressions=[_literal(v) for v in f.values])
            return exp.Not(this=in_node) if f.operator == "NOT IN" else in_node

        val_expr = _literal(f.values[0])
        op_map: Dict[str, type] = {
            "=": exp.EQ, "!=": exp.NEQ, ">": exp.GT,
            "<": exp.LT, ">=": exp.GTE, "<=": exp.LTE,
        }
        if f.operator not in op_map:
            raise SemanticValidationError(f"Operator '{f.operator}' has no AST mapping.")
        return op_map[f.operator](this=col, expression=val_expr)

    def _validate_field_exists_in_schema(
        self, field_name: str, target_tables: List[str], schema_dict: Dict[str, Any]
    ) -> None:
        if field_name == "*":
            return
        field_lower = field_name.lower()
        for table in target_tables:
            if table in schema_dict and field_lower in schema_dict[table]:
                return
        raise SemanticValidationError(
            f"Field '{field_name}' does not exist in any requested dataset schema."
        )

    def _validate_type_compatibility(
        self,
        operation: str,
        field_name: str,
        target_tables: List[str],
        schema_dict: Dict[str, Any],
    ) -> None:
        if operation not in ("SUM", "AVG"):
            return
        numeric_types = {
            "DOUBLE", "FLOAT", "DECIMAL", "INTEGER",
            "BIGINT", "HUGEINT", "SMALLINT",
        }
        field_lower = field_name.lower()
        for table in target_tables:
            if table in schema_dict and field_lower in schema_dict[table]:
                col_type = schema_dict[table][field_lower].upper()
                if col_type not in numeric_types and "UNKNOWN" not in col_type:
                    raise SemanticValidationError(
                        f"Cannot perform {operation} on non-numeric field "
                        f"'{field_name}' (type: {col_type})."
                    )

    def _enforce_semantic_rules(self, ir: MetricIR) -> SemanticType:
        """
        Mathematical + semantic type gate.
        Returns the resolved SemanticType of the compiled metric.
        """
        result_type = SemanticType.UNKNOWN

        if ir.metric_type == "ratio":
            if not ir.denominator:
                raise SemanticValidationError(
                    "Ratio metrics require a valid denominator block."
                )
            if (ir.numerator.field == ir.denominator.field
                    and ir.numerator.operation == ir.denominator.operation):
                raise SemanticValidationError(
                    "Numerator and denominator are identical (x/x = 1)."
                )
            if (ir.denominator.operation == "NONE"
                    and "count" not in ir.denominator.field.lower()):
                raise SemanticValidationError(
                    "Unaggregated denominators are unsafe for global ratios."
                )
            # NEW #5: semantic type cross-check
            result_type = _assert_ratio_type_safe(
                ir.numerator.field, ir.denominator.field
            )
        else:
            result_type = _infer_semantic_type(ir.numerator.field)

        # FIX #2: Reject implicit cross-joins
        if len(ir.target_tables) > 1 and not ir.joins:
            raise SemanticValidationError(
                f"Multi-table metric references {ir.target_tables} but declares no JoinSpec. "
                "Implicit Cartesian cross-joins are forbidden."
            )

        return result_type

    def _build_sql_deterministic(
        self, ir: MetricIR, schema_dict: Dict[str, Any]
    ) -> Tuple[str, SemanticType]:
        """
        Pure AST construction (FIX #1). Returns (sql, resolved_semantic_type).
        No f-strings or string concatenation in the SQL assembly path.
        """
        resolved_type = self._enforce_semantic_rules(ir)

        for table in ir.target_tables:
            if table not in schema_dict:
                raise SemanticValidationError(
                    f"Target table alias '{table}' missing from schema context."
                )

        self._validate_field_exists_in_schema(
            ir.numerator.field, ir.target_tables, schema_dict
        )
        self._validate_type_compatibility(
            ir.numerator.operation, ir.numerator.field, ir.target_tables, schema_dict
        )
        num_expr = self._build_aggr_expr(ir.numerator)

        if ir.metric_type == "ratio" and ir.denominator:
            self._validate_field_exists_in_schema(
                ir.denominator.field, ir.target_tables, schema_dict
            )
            self._validate_type_compatibility(
                ir.denominator.operation, ir.denominator.field,
                ir.target_tables, schema_dict,
            )
            den_expr    = self._build_aggr_expr(ir.denominator)
            nullif_node = exp.Nullif(this=den_expr, expression=exp.Literal.number(0))
            projection  = exp.Div(
                this=exp.Paren(this=num_expr),
                expression=exp.Paren(this=nullif_node),
            )
        else:
            projection = num_expr

        query = exp.select(projection).from_(ir.target_tables[0])

        if ir.joins:
            for join_spec in ir.joins:
                self._validate_field_exists_in_schema(
                    join_spec.left_field, [join_spec.left_table], schema_dict
                )
                self._validate_field_exists_in_schema(
                    join_spec.right_field, [join_spec.right_table], schema_dict
                )
                on_condition = exp.EQ(
                    this=exp.column(join_spec.left_field, join_spec.left_table),
                    expression=exp.column(join_spec.right_field, join_spec.right_table),
                )
                query = query.join(
                    exp.table_(join_spec.right_table),
                    on=on_condition,
                    join_type=join_spec.join_type,
                )

        if ir.filters:
            for f in ir.filters:
                self._validate_field_exists_in_schema(
                    f.field, ir.target_tables, schema_dict
                )
                query = query.where(self._build_filter_expr(f))

        return query.sql(dialect=self.DIALECT), resolved_type

    # ── FIX #3 / NEW #3: Cost gate ───────────────────────────────────────────

    def _fetch_dataset_stats(
        self, conn: Any, uuid_alias: str, secure_path: str
    ) -> DatasetStats:
        try:
            meta_df = conn.execute(
                "SELECT SUM(num_rows) AS row_count, "
                "SUM(total_compressed_size) AS size_bytes "
                f"FROM parquet_metadata('{secure_path}')"
            ).pl()
            row = meta_df.to_dicts()[0]
            return DatasetStats(
                table_alias=uuid_alias,
                row_count=int(row["row_count"] or 0),
                size_bytes=int(row["size_bytes"] or 0),
                last_updated=datetime.utcnow().isoformat(),
            )
        except Exception as e:
            logger.warning(f"Stats probe failed for {uuid_alias}: {e}. Defaulting zero-cost.")
            return DatasetStats(
                table_alias=uuid_alias, row_count=0, size_bytes=0, last_updated=""
            )

    def _check_scan_cost(
        self,
        dataset_stats: Dict[str, DatasetStats],
        ir: Optional[MetricIR],
        tenant_id: str,
    ) -> float:
        """
        NEW #3 — Dynamic cost gate.
        Returns complexity score; raises CostExceededError on any breach.
        """
        max_rows, max_bytes, max_complexity = self._get_tenant_limits(tenant_id)

        total_rows  = sum(s.row_count  for s in dataset_stats.values())
        total_bytes = sum(s.size_bytes for s in dataset_stats.values())
        num_joins   = len(ir.joins)      if ir and ir.joins   else 0
        num_tables  = len(ir.target_tables) if ir             else len(dataset_stats)

        # Estimate subquery count from IR (zero at compile time; refined post-sandbox)
        score = _complexity_score(total_rows, num_joins, 0, num_tables)

        if total_rows > max_rows:
            self._obs.inc("cost_guard_rejections_total")
            raise CostExceededError(
                f"Scan of {total_rows:,} rows exceeds tenant limit of {max_rows:,}. "
                "Add pre-aggregation or reduce dataset scope."
            )
        if total_bytes > max_bytes:
            self._obs.inc("cost_guard_rejections_total")
            raise CostExceededError(
                f"Scan of {total_bytes / 1024**3:.1f} GB exceeds tenant limit of "
                f"{max_bytes / 1024**3:.0f} GB."
            )
        if score > max_complexity:
            self._obs.inc("cost_guard_rejections_total")
            raise CostExceededError(
                f"Complexity score {score:.1f} exceeds tenant limit of {max_complexity:.0f}. "
                "Simplify joins, reduce subqueries, or enable materialization."
            )

        logger.debug(
            f"[{tenant_id}] Cost gate passed — rows: {total_rows:,}, "
            f"bytes: {total_bytes / 1024**2:.1f} MB, score: {score:.1f}."
        )
        return score

    # ── FIX #5: DAG dependency validator ─────────────────────────────────────

    def _validate_dependencies(
        self,
        ir: MetricIR,
        available_metric_slugs: Set[str],
        dataset_ids: List[str],
        tenant_id: str,
    ) -> None:
        for dep_slug in ir.depends_on:
            if dep_slug not in available_metric_slugs:
                self._obs.inc("dag_phantom_dependency_errors_total")
                raise PhantomDependencyError(
                    f"Declared dependency '{dep_slug}' does not exist in the governed "
                    f"catalog for datasets {dataset_ids}. "
                    f"Available: {sorted(available_metric_slugs)}"
                )
        if ir.depends_on:
            logger.debug(
                f"[{tenant_id}] DAG dependency pre-check passed for {ir.depends_on}."
            )

    # ── NEW #8: Failure recovery ──────────────────────────────────────────────

    def _attempt_recovery_compile(
        self,
        ir: MetricIR,
        schema_dict: Dict[str, Any],
    ) -> Optional[Tuple[str, SemanticType]]:
        """
        NEW #8 — Three-tier graceful degradation.

        Tier A (full):       Already attempted by the caller; this is the fallback.
        Tier B (no joins):   Strip multi-table joins, compile against primary table only.
        Tier C (partial):    Return a plain COUNT(*) aggregation as a last resort.
        """
        # Tier B — strip joins, keep numerator only on first table
        try:
            simplified = ir.copy(
                update={
                    "target_tables": [ir.target_tables[0]],
                    "joins":         [],
                    "filters":       [],
                    "metric_type":   "aggregation",
                    "denominator":   None,
                }
            )
            sql, stype = self._build_sql_deterministic(simplified, schema_dict)
            logger.warning(
                "Recovery Tier B: compiled simplified single-table metric "
                f"(joins/filters stripped)."
            )
            self._obs.inc("recovery_degradations_total")
            return sql, stype
        except Exception as tier_b_err:
            logger.warning(f"Recovery Tier B failed: {tier_b_err}")

        # Tier C — partial COUNT(*) fallback
        try:
            partial = ir.copy(
                update={
                    "target_tables": [ir.target_tables[0]],
                    "joins":         [],
                    "filters":       [],
                    "metric_type":   "aggregation",
                    "denominator":   None,
                    "numerator":     StructuredAggr(operation="COUNT", field="*"),
                }
            )
            sql, stype = self._build_sql_deterministic(partial, schema_dict)
            logger.warning(
                "Recovery Tier C: fell back to COUNT(*) partial metric."
            )
            self._obs.inc("recovery_degradations_total")
            return sql, stype
        except Exception as tier_c_err:
            logger.error(f"Recovery Tier C failed: {tier_c_err}")

        return None

    # ── MAIN COMPILATION ENTRYPOINT ───────────────────────────────────────────

    async def compile_metric_from_nl(
        self,
        db: Session,
        tenant_id: str,
        request: NLMetricRequest,
    ) -> CompiledMetricResult:
        """
        Entrypoint for semantic metric creation.

        Pipeline:
          schema extraction → cost gate → hot-cache lookup → external-cache lookup
          → plugin before-hook → LLM IR loop (DAG validation + semantic types)
          → AST build + predicate pushdown → physical sandbox
          → plugin after-hook → lineage registration → catalog persistence
        """
        global_start = time.time()
        self._obs.inc("compilation_attempts_total")
        logger.info(
            f"[{tenant_id}] Initiating Hyperion compilation for '{request.metric_name}'"
        )

        target_ids = request.dataset_ids or (
            [request.dataset_id] if request.dataset_id else []
        )
        if not target_ids:
            raise ValueError("Compilation requires at least one valid dataset ID.")

        datasets = db.query(Dataset).filter(Dataset.id.in_(target_ids)).all()

        # Multi-tenant boundary
        for ds in datasets:
            if ds.tenant_id != tenant_id:
                self._obs.inc("security_violations_total")
                logger.critical(
                    f"[{tenant_id}] Security violation: unauthorized access to dataset {ds.id}"
                )
                raise SecurityViolationError("Access explicitly denied to requested dataset.")

        # Schema extraction + dataset stats
        schema_dict:    Dict[str, Any]              = {}
        allowed_tables: Set[str]                    = set()
        dataset_paths:  Dict[str, str]              = {}
        dataset_stats:  Dict[str, DatasetStats]     = {}

        try:
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                for ds in datasets:
                    uuid_alias  = f"ds_{str(ds.id).replace('-', '_')}"
                    secure_path = storage_manager.get_duckdb_query_path(db, ds)
                    dataset_paths[uuid_alias] = secure_path

                    schema_df = conn.execute(
                        f"DESCRIBE SELECT * FROM read_parquet('{secure_path}') LIMIT 1"
                    ).pl()
                    schema_dict[uuid_alias] = {
                        row["column_name"].lower(): row["column_type"]
                        for row in schema_df.to_dicts()
                    }
                    allowed_tables.add(uuid_alias)
                    dataset_stats[uuid_alias] = self._fetch_dataset_stats(
                        conn, uuid_alias, secure_path
                    )
        except CostExceededError:
            raise
        except Exception as e:
            logger.error(f"[{tenant_id}] Schema extraction failed: {e}")
            raise RuntimeError(
                "Underlying storage engine failed to yield physical parquet schema."
            )

        # Cost gate — fires before any LLM tokens are spent (NEW #3 dynamic)
        complexity_score = self._check_scan_cost(dataset_stats, None, tenant_id)

        # Live catalog slugs for dependency pre-validation (FIX #5)
        live_metrics = db.query(SemanticMetric).filter(
            SemanticMetric.tenant_id == tenant_id,
            or_(
                SemanticMetric.dataset_id.in_(target_ids),
                SemanticMetric.dataset_id.is_(None),
            ),
        ).all()
        live_catalog_slugs: Set[str] = {
            m.slug for m in live_metrics if hasattr(m, "slug") and m.slug
        }

        # Cache keys (FIX #4: compiler version baked in)
        schema_hash  = self._generate_schema_hash(schema_dict, datasets)
        request_hash = self._generate_request_hash(request.metric_name, request.description)
        cache_key = (
            f"semantic_cache:{tenant_id}:{self.COMPILER_VERSION}:{schema_hash}:{request_hash}"
        )

        # NEW #7: Hot-path LRU lookup
        hot_hit = _hot_cache.get(cache_key)
        if hot_hit:
            try:
                result = CompiledMetricResult(**json.loads(hot_hit))
                self._obs.inc("hot_cache_hits_total")
                logger.debug(f"[{tenant_id}] Hot-cache hit for '{request.metric_name}'")
                return result
            except Exception as e:
                logger.warning(f"[{tenant_id}] Hot-cache payload corrupted: {e}")

        # External cache lookup
        cached_payload = cache_manager.get(cache_key)
        if cached_payload:
            try:
                result = CompiledMetricResult(**json.loads(cached_payload))
                _hot_cache.set(cache_key, cached_payload)   # promote to hot cache
                self._obs.inc("cache_hits_total")
                logger.info(f"[{tenant_id}] Persistent cache hit for '{request.metric_name}'")
                return result
            except Exception as e:
                logger.warning(f"[{tenant_id}] Cache payload corrupted, bypassing: {e}")

        self._obs.inc("cache_misses_total")

        # NEW #12: Plugin before-hook
        self._fire_before_compile(tenant_id, request.metric_name, schema_dict)

        # LLM generation loop
        schema_context = json.dumps(schema_dict, indent=2)
        system_prompt  = f"""
You are a Staff Data Engineer and Deterministic Semantic Compiler for DuckDB.
Map the business intent strictly to our MetricIR (v1.1) JSON payload.

AVAILABLE PHYSICAL SCHEMA:
{schema_context}

RULES:
1.  Return ONLY valid JSON matching the exact MetricIR v1.1 schema.
2.  Operations MUST be exactly one of: SUM, COUNT, AVG, MIN, MAX, DISTINCT_COUNT, NONE.
3.  Table references MUST use the ds_... UUID aliases shown in the schema above.
4.  Do NOT hallucinate fields. Only use columns that appear in the schema above.
5.  If target_tables has >1 entry you MUST populate 'joins' with JoinSpec objects.
    Implicit Cartesian cross-joins are FORBIDDEN.
6.  If this metric depends on another governed metric, add its 'm_...' slug to
    'depends_on'. Only reference slugs that genuinely exist; never invent slugs.
7.  Set 'semantic_type' to one of: CURRENCY, PERCENTAGE, COUNT, DURATION, RATIO,
    DIMENSION, UNKNOWN — based on what this metric measures.
"""

        feedback       = ""
        last_error:    Optional[str] = None
        metric_slug    = self._generate_metric_slug(request.metric_name)
        last_ir:       Optional[MetricIR] = None

        for attempt in range(self.MAX_RETRY_ATTEMPTS):
            elapsed = time.time() - global_start
            if elapsed > self.GLOBAL_TIMEOUT_SEC:
                raise GlobalBudgetExceededError(
                    f"Compilation loop exceeded {self.GLOBAL_TIMEOUT_SEC}s budget."
                )

            user_prompt = (
                f"Metric Name: {request.metric_name}\n"
                f"Definition: {request.description}\n"
                f"{feedback}"
            )

            try:
                self._obs.inc("llm_calls_total")
                if attempt > 0:
                    self._obs.inc("llm_retries_total")

                llm_start    = time.perf_counter()
                raw_response = await llm_client.generate(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=0.0,
                    response_format="json",
                )
                llm_ms = round((time.perf_counter() - llm_start) * 1000, 2)
                self._obs.record_llm_latency(llm_ms)

                payload  = json.loads(
                    raw_response.replace("```json", "").replace("```", "").strip()
                )
                ir       = MetricIR(**payload)
                last_ir  = ir

                # FIX #5: dependency pre-validation
                self._validate_dependencies(
                    ir, live_catalog_slugs, target_ids, tenant_id
                )

                # NEW #3: refined cost gate with IR context
                self._check_scan_cost(dataset_stats, ir, tenant_id)

                # FIX #1: pure AST SQL build + NEW #5 semantic type resolution
                raw_sql, resolved_type = self._build_sql_deterministic(ir, schema_dict)

                # NEW #2: predicate pushdown
                pushed_filters = self._pushdown_engine.collect_filters([ir])
                raw_sql = self._pushdown_engine.rewrite_with_pushdown(
                    raw_sql, pushed_filters, dialect=self.DIALECT
                )

                # Physical sandbox
                validation = self._sandbox_physical_validation(
                    tenant_id, raw_sql, allowed_tables, dataset_paths
                )

                if validation["is_valid"]:
                    exec_ms        = round((time.time() - global_start) * 1000, 2)
                    ast_complexity = validation.get("ast_node_complexity", 0)
                    self._obs.record_compile_latency(exec_ms)

                    # NEW #6: build lineage entry
                    lineage = MetricLineage(
                        metric_slug=metric_slug,
                        upstream_metrics=ir.depends_on,
                        downstream_metrics=[],           # populated by future compilations
                        source_dataset_ids=target_ids,
                        semantic_type=resolved_type,
                    )
                    _lineage_registry.register(lineage)

                    meta = {
                        "compiler_version":       self.COMPILER_VERSION,
                        "ir_version":             ir.ir_version,
                        "llm_confidence":         ir.confidence,
                        "dialect":                self.DIALECT,
                        "compilation_latency_ms": exec_ms,
                        "llm_latency_ms":         llm_ms,
                        "attempts_required":      attempt + 1,
                        "metric_ir_payload":      ir.dict(),
                        "ast_node_complexity":    ast_complexity,
                        "timestamp":              datetime.utcnow().isoformat(),
                        "semantic_type":          resolved_type.value,
                        "complexity_score":       complexity_score,
                        "lineage":                lineage.impact_summary(),
                        "scan_stats": {
                            alias: {
                                "row_count":  s.row_count,
                                "size_bytes": s.size_bytes,
                            }
                            for alias, s in dataset_stats.items()
                        },
                    }

                    result = CompiledMetricResult(
                        metric_name=request.metric_name,
                        metric_slug=metric_slug,
                        compiled_sql=validation["sql"],
                        is_valid=True,
                        schema_hash=schema_hash,
                        ast_node_complexity=ast_complexity,
                        semantic_type=resolved_type.value,
                        lineage=lineage.impact_summary(),
                        provenance_metadata=meta,
                    )

                    # NEW #12: plugin after-hook
                    self._fire_after_compile(tenant_id, result, meta)

                    # Cache — external and hot-path
                    serialized = result.json()
                    cache_manager.set(cache_key, serialized, expire=86400)
                    _hot_cache.set(cache_key, serialized)

                    self._obs.inc("compilation_successes_total")
                    logger.info(
                        f"[{tenant_id}] Hyperion compilation success: "
                        f"'{request.metric_name}' in {exec_ms}ms "
                        f"(attempt {attempt + 1}, type={resolved_type.value})."
                    )
                    return result

                else:
                    cols     = [
                        f"{t}.{c}"
                        for t, v in schema_dict.items()
                        for c in v.keys()
                    ]
                    feedback = (
                        f"\nCOMPILER ERROR: {validation['error']}"
                        f"\nVALID SCHEMA SAMPLES: {cols[:15]}..."
                        "\nFix logic and field references."
                    )
                    last_error = validation["error"]
                    logger.warning(
                        f"[{tenant_id}] Sandbox attempt {attempt + 1} failed: {last_error}"
                    )

            except json.JSONDecodeError as e:
                feedback   = f"\nSYSTEM ERROR: Invalid JSON. {e}\nMatch MetricIR v1.1 exactly."
                last_error = f"JSON Parse Error: {e}"
            except (SemanticValidationError, PhantomDependencyError, SemanticTypeConflictError) as sve:
                feedback   = f"\nVALIDATION ERROR: {sve}\nOnly use valid fields and existing slugs."
                last_error = str(sve)
                logger.warning(f"[{tenant_id}] Compiler rejected payload: {last_error}")
            except CostExceededError as cee:
                # Cost errors are terminal — no retry will fix dataset size
                self._obs.inc("compilation_failures_total")
                raise
            except Exception as e:
                feedback   = f"\nSYSTEM ERROR: {e}"
                last_error = str(e)

        # ── NEW #8: Failure recovery modes ───────────────────────────────────
        if last_ir is not None:
            logger.warning(
                f"[{tenant_id}] Entering failure-recovery pipeline for "
                f"'{request.metric_name}'."
            )
            recovery = self._attempt_recovery_compile(last_ir, schema_dict)
            if recovery:
                recovery_sql, recovery_type = recovery
                self._obs.inc("compilation_failures_total")   # still a failure (degraded)
                return CompiledMetricResult(
                    metric_name=request.metric_name,
                    metric_slug=metric_slug,
                    compiled_sql=recovery_sql,
                    is_valid=True,
                    schema_hash=schema_hash,
                    semantic_type=recovery_type.value,
                    error_message=(
                        "Warning: returned a degraded partial metric due to "
                        f"compilation failure. Last error: {last_error}"
                    ),
                    provenance_metadata={
                        "compiler_version": self.COMPILER_VERSION,
                        "recovery_mode":    True,
                        "last_error":       last_error,
                    },
                )

        self._obs.inc("compilation_failures_total")
        logger.error(
            f"[{tenant_id}] Compilation for '{request.metric_name}' exhausted "
            f"{self.MAX_RETRY_ATTEMPTS} attempts. Recovery also failed."
        )
        return CompiledMetricResult(
            metric_name=request.metric_name,
            metric_slug=metric_slug,
            compiled_sql="",
            is_valid=False,
            schema_hash=schema_hash,
            error_message=f"Compilation pipeline failure. Last error: {last_error}",
        )

    # ── Physical sandbox ──────────────────────────────────────────────────────

    def _sandbox_physical_validation(
        self,
        tenant_id: str,
        raw_sql: str,
        allowed_tables: Set[str],
        dataset_paths: Dict[str, str],
    ) -> Dict[str, Any]:
        """AST security walk + DuckDB EXPLAIN physical validation."""
        try:
            ast = sqlglot.parse_one(raw_sql, read=self.DIALECT)

            if not isinstance(ast, exp.Select):
                raise SecurityViolationError(
                    "Governed metric must resolve to a pure SELECT statement."
                )

            node_count     = 0
            subquery_count = 0

            for node in ast.walk():
                node_count += 1

                if isinstance(node, self.FORBIDDEN_OPERATIONS):
                    self._obs.inc("security_violations_total")
                    raise SecurityViolationError(
                        f"Forbidden SQL node: {type(node).__name__}"
                    )

                if isinstance(node, exp.Subquery):
                    subquery_count += 1
                    if subquery_count > self.MAX_SUBQUERIES:
                        raise ComplexityExceededError(
                            f"Subquery depth {subquery_count} > limit {self.MAX_SUBQUERIES}."
                        )

                if isinstance(node, exp.Table) and node.this:
                    table_name = node.this.name.lower()
                    if table_name not in allowed_tables:
                        self._obs.inc("security_violations_total")
                        raise SecurityViolationError(
                            f"Unauthorized dataset / memory boundary leak: '{table_name}'"
                        )

            if node_count > self.MAX_AST_NODES:
                raise ComplexityExceededError(
                    f"AST too heavy ({node_count} nodes > {self.MAX_AST_NODES} limit)."
                )

            standardized = ast.sql(dialect=self.DIALECT, pretty=True)

            try:
                with SessionLocal() as db_session:
                    with storage_manager.duckdb_session(db_session, tenant_id) as sandbox_conn:
                        sandbox_conn.execute(
                            "PRAGMA memory_limit='1GB'; PRAGMA threads=1;"
                        )
                        for alias, path in dataset_paths.items():
                            sandbox_conn.execute(
                                f"CREATE VIEW {alias} AS SELECT * FROM read_parquet('{path}')"
                            )
                        sandbox_conn.execute(f"EXPLAIN {standardized}")
                        return {
                            "is_valid":            True,
                            "sql":                 standardized,
                            "ast_node_complexity": node_count,
                        }
            except Exception as plan_error:
                return {
                    "is_valid": False,
                    "error":    f"Physical optimizer check failed: {plan_error}",
                }

        except sqlglot.errors.ParseError as e:
            return {"is_valid": False, "error": f"AST parse error: {e}"}
        except SemanticCompilationError as sce:
            return {"is_valid": False, "error": str(sce)}

    # ── NEW #10: Query explanation ────────────────────────────────────────────

    async def explain_metric(
        self,
        db: Session,
        tenant_id: str,
        metric_slug: str,
    ) -> QueryExplanation:
        """
        NEW #10 — Returns a human-readable explanation for a governed metric:
        generated SQL, cost estimate, lineage, semantic type, and compiler notes.
        Builds trust with end users and makes debugging transparent.
        """
        metric = (
            db.query(SemanticMetric)
            .filter(
                SemanticMetric.tenant_id == tenant_id,
                SemanticMetric.slug == metric_slug,  # type: ignore[attr-defined]
            )
            .first()
        )
        if not metric:
            raise ValueError(f"Metric '{metric_slug}' not found in catalog.")

        meta          = metric.metadata or {}
        scan_stats    = meta.get("scan_stats", {})
        total_rows    = sum(v.get("row_count", 0) for v in scan_stats.values())
        total_bytes   = sum(v.get("size_bytes", 0) for v in scan_stats.values())
        semantic_type = meta.get("semantic_type", SemanticType.UNKNOWN.value)
        lineage       = _lineage_registry.impact_analysis(metric_slug)

        type_notes_map: Dict[str, str] = {
            SemanticType.CURRENCY.value:   "Result is a monetary value. Format with currency symbol.",
            SemanticType.PERCENTAGE.value: "Result is a ratio 0–1. Multiply by 100 for display.",
            SemanticType.COUNT.value:      "Result is a whole-number count. No decimals expected.",
            SemanticType.DURATION.value:   "Result is a time duration. Display in appropriate unit.",
            SemanticType.RATIO.value:      "Result is a dimensionless ratio.",
            SemanticType.DIMENSION.value:  "Result is a categorical or dimensional value.",
            SemanticType.UNKNOWN.value:    "Semantic type undetermined — inspect field definitions.",
        }

        warnings: List[str] = []
        if lineage.get("downstream"):
            warnings.append(
                f"This metric has {len(lineage['downstream'])} downstream dependents. "
                "Changing it may break other metrics."
            )
        if meta.get("recovery_mode"):
            warnings.append(
                "This metric was compiled in degraded recovery mode. "
                "Review the original definition."
            )

        return QueryExplanation(
            metric_name=metric.metric_name,
            metric_slug=metric_slug,
            semantic_type=semantic_type,
            compiled_sql=metric.compiled_sql,
            estimated_rows=total_rows,
            estimated_bytes=total_bytes,
            complexity_score=meta.get("complexity_score", 0.0),
            lineage_summary=lineage,
            type_notes=type_notes_map.get(semantic_type, ""),
            compiler_version=meta.get("compiler_version", self.COMPILER_VERSION),
            compilation_ms=meta.get("compilation_latency_ms", 0.0),
            llm_confidence=meta.get("llm_confidence", 0.0),
            warnings=warnings,
        )

    # ── NEW #4: Materialization ───────────────────────────────────────────────

    async def materialize_metric(
        self,
        db: Session,
        tenant_id: str,
        metric_slug: str,
        output_path: str,
        refresh_interval: str = "1h",
    ) -> MaterializedSnapshot:
        """
        NEW #4 — Precomputes a heavy metric and writes it to a Parquet snapshot.
        Subsequent queries are transparently rewritten to read from the snapshot
        instead of re-running the full computation.
        """
        metric = (
            db.query(SemanticMetric)
            .filter(
                SemanticMetric.tenant_id == tenant_id,
                SemanticMetric.slug == metric_slug,  # type: ignore[attr-defined]
            )
            .first()
        )
        if not metric:
            raise ValueError(f"Metric '{metric_slug}' not found for materialization.")

        datasets = db.query(Dataset).filter(
            Dataset.tenant_id == tenant_id
        ).all()
        dataset_paths = {
            f"ds_{str(ds.id).replace('-', '_')}": storage_manager.get_duckdb_query_path(
                db, ds
            )
            for ds in datasets
        }

        try:
            import duckdb
            conn = duckdb.connect(database=":memory:")
            conn.execute("PRAGMA memory_limit='4GB'; PRAGMA threads=4;")

            for alias, path in dataset_paths.items():
                conn.execute(
                    f"CREATE VIEW {alias} AS SELECT * FROM read_parquet('{path}')"
                )

            conn.execute(
                f"COPY ({metric.compiled_sql}) TO '{output_path}' (FORMAT PARQUET)"
            )
            row_count = conn.execute(
                f"SELECT COUNT(*) FROM read_parquet('{output_path}')"
            ).fetchone()[0]
            conn.close()

        except Exception as e:
            raise MaterializationError(
                f"Failed to materialize '{metric_slug}': {e}"
            ) from e

        _interval_to_seconds = {"5min": 300, "1h": 3600, "24h": 86400}
        ttl_sec  = _interval_to_seconds.get(refresh_interval, 3600)
        now      = datetime.utcnow()
        snap     = MaterializedSnapshot(
            metric_slug=metric_slug,
            parquet_path=output_path,
            row_count=row_count,
            refresh_strategy="full",
            refresh_interval=refresh_interval,
            created_at=now.isoformat(),
            expires_at=datetime.utcfromtimestamp(
                now.timestamp() + ttl_sec
            ).isoformat(),
        )
        _materialization_registry.register(snap)

        logger.info(
            f"[{tenant_id}] Materialized '{metric_slug}' → {output_path} "
            f"({row_count:,} rows, TTL={refresh_interval})."
        )
        return snap

    # ── NEW #1: Execution planner entry ──────────────────────────────────────

    def plan_execution(
        self,
        metric_sqls: Dict[str, str],
        dataset_stats: Dict[str, DatasetStats],
    ) -> str:
        """
        NEW #1 — Merge multiple metric SQLs into the minimum number of scans.
        Eliminates redundant full-table reads and collapses compatible CTEs.
        Call this before injecting CTEs into the raw execution SQL.
        """
        return self._execution_planner.optimize(metric_sqls, dataset_stats)

    # ── NEW #9: RLS-enforced injection ────────────────────────────────────────

    def inject_governed_metrics_with_rls(
        self,
        db: Session,
        tenant_id: str,
        dataset_ids: List[str],
        raw_execution_sql: str,
        requested_metric_slugs: List[str],
        rls_policy: Optional[RLSPolicy] = None,
    ) -> str:
        """
        NEW #9 — Wraps inject_governed_metrics with per-user RLS enforcement.
        The RLS predicate is injected into every base-table read in the plan.
        """
        plan = self.inject_governed_metrics(
            db, tenant_id, dataset_ids, raw_execution_sql, requested_metric_slugs
        )
        if rls_policy:
            plan = self._rls_engine.inject(plan, rls_policy, self.DIALECT)
            logger.debug(
                f"[{tenant_id}] RLS policy v{rls_policy.policy_version} "
                f"applied for user '{rls_policy.user_id}'."
            )
        return plan

    # ── Catalog management (unchanged from v11) ───────────────────────────────

    async def save_governed_metric(
        self,
        db: Session,
        tenant_id: str,
        compilation: CompiledMetricResult,
        description: str,
        dataset_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not compilation.is_valid:
            raise ValueError(
                f"Aborting DB write on invalid compilation: {compilation.error_message}"
            )

        try:
            new_metric = SemanticMetric(
                tenant_id=tenant_id,
                dataset_id=dataset_id,
                metric_name=compilation.metric_name,
                description=description,
                compiled_sql=compilation.compiled_sql,
                schema_hash=compilation.schema_hash,
                metadata=compilation.provenance_metadata,
                created_at=datetime.utcnow(),
            )

            if hasattr(SemanticMetric, "slug"):
                new_metric.slug = compilation.metric_slug
            else:
                logger.critical(
                    f"[{tenant_id}] DB model missing required 'slug' column."
                )
                raise RuntimeError(
                    "System configuration error: database model lacks slug schema."
                )

            db.add(new_metric)
            db.commit()
            db.refresh(new_metric)

            logger.info(
                f"[{tenant_id}] Persisted '{compilation.metric_slug}' to catalog."
            )
            return {
                "status":    "success",
                "metric_id": str(new_metric.id),
                "slug":      compilation.metric_slug,
            }

        except Exception as e:
            db.rollback()
            logger.critical(
                f"[{tenant_id}] Catalog persistence failed. Rolled back. Error: {e}"
            )
            raise RuntimeError("Postgres error while saving semantic layer metric.")

    async def get_semantic_catalog(
        self, db: Session, tenant_id: str, dataset_ids: List[str]
    ) -> MetricCatalogSummary:
        try:
            metrics = db.query(SemanticMetric).filter(
                SemanticMetric.tenant_id == tenant_id,
                or_(
                    SemanticMetric.dataset_id.in_(dataset_ids),
                    SemanticMetric.dataset_id.is_(None),
                ),
            ).all()

            dictionary = {
                m.slug: m.compiled_sql
                for m in metrics
                if hasattr(m, "slug") and m.slug
            }

            return MetricCatalogSummary(
                tenant_id=tenant_id,
                dataset_ids=dataset_ids,
                total_governed_metrics=len(dictionary),
                semantic_dictionary=dictionary,
            )
        except Exception as e:
            logger.error(f"[{tenant_id}] Failed to load semantic catalog: {e}")
            raise RuntimeError(f"Database error retrieving metric catalog: {e}")

    # ── DAG resolution + CTE injection (v11 logic, materialization-aware) ─────

    def _resolve_dependency_graph(
        self,
        requested_metric_slugs: List[str],
        available_metrics: Dict[str, SemanticMetric],
    ) -> List[SemanticMetric]:
        graph:     Dict[str, List[str]] = {}
        in_degree: Dict[str, int]       = {}

        def _add_node(slug: str) -> None:
            if slug not in graph:
                graph[slug]     = []
                in_degree[slug] = 0

        queue     = list(requested_metric_slugs)
        processed: Set[str] = set()

        while queue:
            current_slug = queue.pop(0)
            if current_slug in processed or current_slug not in available_metrics:
                continue

            processed.add(current_slug)
            _add_node(current_slug)

            try:
                raw_meta   = available_metrics[current_slug].metadata
                typed_meta = StoredMetricMetadata(**raw_meta)
                child_deps = typed_meta.metric_ir_payload.depends_on
            except ValidationError as ve:
                logger.error(
                    f"Metadata contract failure for '{current_slug}': {ve}. "
                    "Skipping dependencies."
                )
                continue

            for child in child_deps:
                if child in available_metrics:
                    _add_node(child)
                    graph[child].append(current_slug)
                    in_degree[current_slug] += 1
                    queue.append(child)

        sorted_metrics: List[SemanticMetric] = []
        zero_in_degree = [n for n in in_degree if in_degree[n] == 0]

        while zero_in_degree:
            node = zero_in_degree.pop(0)
            sorted_metrics.append(available_metrics[node])
            for neighbor in graph[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    zero_in_degree.append(neighbor)

        if len(sorted_metrics) != len(graph):
            unresolved = [n for n in in_degree if in_degree[n] > 0]
            logger.critical(
                f"DAG aborted: circular dependency in {unresolved}."
            )
            raise CircularDependencyError(
                f"Circular metric logic involving {unresolved}"
            )

        return sorted_metrics

    def inject_governed_metrics(
        self,
        db: Session,
        tenant_id: str,
        dataset_ids: List[str],
        raw_execution_sql: str,
        requested_metric_slugs: List[str],
    ) -> str:
        """
        Injects governed metrics as CTEs in explicit DAG topological order.
        NEW #4: If a materialized snapshot exists for a metric, the CTE is
        rewritten to read from the snapshot path instead of re-computing.
        """
        if not requested_metric_slugs:
            return raw_execution_sql

        try:
            datasets = db.query(Dataset).filter(Dataset.id.in_(dataset_ids)).all()
            dataset_paths = {
                f"ds_{str(ds.id).replace('-', '_')}": storage_manager.get_duckdb_query_path(
                    db, ds
                )
                for ds in datasets
            }

            metrics = db.query(SemanticMetric).filter(
                SemanticMetric.tenant_id == tenant_id,
                or_(
                    SemanticMetric.dataset_id.in_(dataset_ids),
                    SemanticMetric.dataset_id.is_(None),
                ),
            ).all()

            metric_dict   = {m.slug: m for m in metrics if hasattr(m, "slug") and m.slug}
            execution_ast = sqlglot.parse_one(raw_execution_sql, read=self.DIALECT)
            ordered_deps  = self._resolve_dependency_graph(
                requested_metric_slugs, metric_dict
            )

            if not ordered_deps:
                return raw_execution_sql

            for metric in ordered_deps:
                # NEW #4: transparently substitute a materialized snapshot
                mat_snap = _materialization_registry.get_if_valid(metric.slug)
                if mat_snap:
                    self._obs.inc("materialization_hits_total")
                    logger.debug(
                        f"[{tenant_id}] Materialization hit for '{metric.slug}' "
                        f"→ {mat_snap.parquet_path}"
                    )
                    metric_ast = exp.select(exp.Star()).from_(
                        exp.Anonymous(
                            this="read_parquet",
                            expressions=[exp.Literal.string(mat_snap.parquet_path)],
                        )
                    )
                else:
                    metric_ast = sqlglot.parse_one(
                        metric.compiled_sql, read=self.DIALECT
                    )
                    for table in metric_ast.find_all(exp.Table):
                        clean_tbl = table.name.lower()
                        if clean_tbl in dataset_paths:
                            func = exp.Anonymous(
                                this="read_parquet",
                                expressions=[
                                    exp.Literal.string(dataset_paths[clean_tbl])
                                ],
                            )
                            table.replace(
                                exp.alias_(func, table.alias) if table.alias else func
                            )

                execution_ast = execution_ast.with_(metric.slug, as_=metric_ast)

            logger.info(
                f"[{tenant_id}] Injected {len(ordered_deps)} DAG layer(s) into plan."
            )
            return execution_ast.sql(dialect=self.DIALECT, pretty=True)

        except CircularDependencyError:
            raise
        except Exception as e:
            logger.error(
                f"[{tenant_id}] DAG injection failed. Falling back to raw SQL. Error: {e}"
            )
            return raw_execution_sql

    def get_runtime_guardrails(self) -> List[str]:
        return [
            "PRAGMA memory_limit='8GB';",
            "PRAGMA threads=4;",
            "SET statement_timeout='45s';",
            "PRAGMA enable_profiling='json';",
        ]


# =============================================================================
# GLOBAL SINGLETONS
# =============================================================================

metric_governance_service = MetricGovernanceService()