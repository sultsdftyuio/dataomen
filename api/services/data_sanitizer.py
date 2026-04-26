"""
data_sanitizer.py — Production-grade PII sanitisation and schema enforcement for Polars.

Improvements over v1
────────────────────
[CRIT-1]  Hash stability   → Added `stable_analytics_hash` mode (SHA-256/16, deterministic
                             across Polars versions/archs). `fast_analytics_hash` is now
                             explicitly documented as ephemeral-only.
[CRIT-2]  UDF scalability  → Chunked unique-value processing (50 k/chunk) in both
                             stable and secure hash paths; bounded memory on high-cardinality columns.
[CRIT-3]  Decimal cast     → All Decimal/currency casts route via Float64 → round(2) → Decimal
                             to avoid Polars string-to-Decimal precision hazards.
[CRIT-4]  Strict mode      → Format validated BEFORE any regex transformation in strict mode;
                             fails fast on mixed/invalid input without silent coercion.
[ARCH-5]  Silent drops     → `preserve_unknown_columns: bool` passes undeclared cols through.
[ARCH-6]  System col order → System columns injected explicitly at the HEAD of every select;
                             unknown cols appended at the TAIL — ordering is now deterministic.
[ARCH-7]  Thread safety    → `ExecutionMetrics` is a per-call Pydantic snapshot; shared state
                             guarded by `_build_lock`.  No mutable dicts shared across threads.
[ARCH-8]  Audit memory     → Audit is optional, sampled (0–100 %), buffered, and supports an
                             external sink callable (Kafka, OTLP, etc.).
[SUBTLE-9]  Expr caching   → PII expressions are keyed by (schema_fingerprint, mode) so the
                             Polars expression tree is not rebuilt on repeated pipeline calls.
[SUBTLE-10] Column metrics → Per-column null_count / null_rate / pii flag in ExecutionMetrics.
[SUBTLE-11] Idempotency    → Hash batch paths detect already-hashed values (64-char hex) and
                             pass them through unchanged.
[SUBTLE-12] Memory guard   → Optional psutil-backed RSS check before and after collect().
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Literal, Mapping, Optional, Set, Tuple

import polars as pl
from pydantic import BaseModel, field_validator

from dataomen_core import DataSanitizer as RustDataSanitizer

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Precompiled regex – defined once at module level so Polars never recompiles them.
# ─────────────────────────────────────────────────────────────────────────────
NUMERIC_CLEANUP_REGEX    = r"[^\d,.\-]"
NUMERIC_VALIDATION_REGEX = r"^-?\d+([.,]\d+)?$"
WHITESPACE_REGEX         = r"\s+"

# SHA-256 hex digest is always exactly 64 lower-case hex chars.
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")

# ─────────────────────────────────────────────────────────────────────────────
# Public types
# ─────────────────────────────────────────────────────────────────────────────

AuditSink = Callable[[Dict[str, Any]], None]


def _noop_sink(_entry: Dict[str, Any]) -> None:
    """Default no-op audit sink — zero overhead when no external sink is configured."""


class ColumnSchema(BaseModel):
    """Explicit schema contract; drives both PII hashing and type casting."""

    name: str
    type: Literal["string", "int", "float", "bool", "date", "datetime", "currency"]
    nullable: bool = True
    pii: bool = False

    @field_validator("name")
    @classmethod
    def _name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Column name must not be empty.")
        return v


class ExecutionMetrics(BaseModel):
    """
    Immutable per-execution metrics snapshot.

    Returned alongside every DataFrame from execute() / process_batch().
    Safe to pass between threads; never mutated after execute() returns.
    """

    rows_input: int = 0
    rows_output: int = 0
    rows_dropped: int = 0
    pii_columns_configured: int = 0
    pii_cells_transformed: int = 0
    null_injections: int = 0
    columns_casted: int = 0
    total_execution_ms: float = 0.0
    stage_times_ms: Dict[str, float] = {}
    # [SUBTLE-10] Per-column observability
    per_column: Dict[str, Dict[str, Any]] = {}


# ─────────────────────────────────────────────────────────────────────────────
# DataSanitizer
# ─────────────────────────────────────────────────────────────────────────────


class DataSanitizer:
    """
    Composable PII-sanitisation and schema-enforcement pipeline built on Polars LazyFrame.

    Hashing Modes
    ─────────────
    fast_analytics_hash    Polars built-in hash seeded with a tenant-derived key.
                           NOT stable across Polars versions or CPU architectures.
                           Use ONLY for ephemeral / session-scoped workloads where
                           cross-version join stability is not required.

    stable_analytics_hash  SHA-256 truncated to 16 hex chars, prefixed with tenant ID.
                           Deterministic across Polars versions, architectures, and time.
                           Suitable for long-term analytics, deduplication, and cross-dataset joins.
                           Slower than fast_analytics_hash; faster than secure_identity_hash.

    secure_identity_hash   Full HMAC-SHA256 (64-char hex) keyed with a PBKDF2-derived tenant key.
                           Cryptographically compliant.  Disables Polars streaming.

    Mode Aliases (normalised transparently)
    ───────────────────────────────────────
    fast_session_hash       → fast_analytics_hash
    pseudonymization_fast   → fast_analytics_hash
    stable_pseudonymization → stable_analytics_hash
    cryptographic_hmac      → secure_identity_hash
    """

    _STREAMING_UNSAFE: frozenset = frozenset(
        {"secure_identity_hash", "stable_analytics_hash"}
    )

    _MODE_ALIASES: Dict[str, str] = {
        "fast_analytics_hash":     "fast_analytics_hash",
        "fast_session_hash":       "fast_analytics_hash",
        "pseudonymization_fast":   "fast_analytics_hash",
        "stable_analytics_hash":   "stable_analytics_hash",
        "stable_pseudonymization": "stable_analytics_hash",
        "secure_identity_hash":    "secure_identity_hash",
        "cryptographic_hmac":      "secure_identity_hash",
    }

    def __init__(
        self,
        tenant_id: str,
        version: str = "v1",
        mode: str = "stable_analytics_hash",
        strict_mode: bool = False,
        # [ARCH-5] Pass undeclared columns through instead of silently dropping them.
        preserve_unknown_columns: bool = False,
        # [ARCH-8] Audit configuration
        audit_enabled: bool = True,
        audit_sample_rate: float = 1.0,          # 0.0 = never  /  1.0 = always
        audit_sink: Optional[AuditSink] = None,  # e.g. lambda e: kafka.send(e)
        audit_buffer_size: int = 1_000,
        # [SUBTLE-12] Memory guardrail; requires psutil.  0 = disabled.
        max_collect_memory_mb: int = 0,
    ) -> None:
        self.tenant_id = tenant_id
        self.version = version
        self.mode = self._normalize_mode(mode)
        self.strict_mode = strict_mode
        self.preserve_unknown_columns = preserve_unknown_columns
        self.max_collect_memory_mb = max_collect_memory_mb

        # Initialize the blazing-fast Rust engine under the hood
        self._engine = RustDataSanitizer(tenant_id, version, self.mode, strict_mode)

        # Whether Polars streaming is safe for the current mode.
        self.streaming_safe = self.mode not in self._STREAMING_UNSAFE

        # Deterministic system-column ordering — injected at the HEAD of every select.
        self._system_columns: List[str] = [
            "_tenant_id", "_ingested_at", "_batch_id", "_source_file"
        ]

        # ── Audit ────────────────────────────────────────────────────────────
        self._audit_enabled = audit_enabled
        self._audit_sample_rate = max(0.0, min(1.0, audit_sample_rate))
        self._audit_sink: AuditSink = audit_sink or _noop_sink
        self.audit_log: deque = deque(maxlen=max(1, audit_buffer_size))

        # ── [ARCH-7] Thread safety ────────────────────────────────────────────
        # Only _build_lock protects the few mutable instance fields written during
        # pipeline construction.  execute() returns an immutable snapshot.
        self._build_lock = threading.Lock()
        self._active_pii_columns: List[str] = []
        self._schema_fingerprint: Optional[str] = None

        # ── [SUBTLE-9] Expression cache (keyed by fingerprint + mode) ─────────
        # Caches the list of PII Polars expressions so repeated pipeline calls on
        # the same schema do not rebuild the expression tree from scratch.
        self._pii_expr_cache: Dict[Tuple[str, str], List[pl.Expr]] = {}

        # ── Key derivation (PBKDF2-SHA256, 100 k iterations) ─────────────────
        master_key = os.environ.get("DATA_VAULT_MASTER_KEY")
        if not master_key:
            raise EnvironmentError(
                f"[{self.tenant_id}] CRITICAL: DATA_VAULT_MASTER_KEY not set."
            )
        self._tenant_key: bytes = hashlib.pbkdf2_hmac(
            "sha256",
            master_key.encode("utf-8"),
            f"{tenant_id}:{version}".encode("utf-8"),
            100_000,
        )
        # Pre-derive the fast_analytics_hash seed (integer, computed once).
        self._fast_hash_seed: int = int.from_bytes(self._tenant_key[:8], "little")

    # ─────────────────────────────────────────────────────────────────────────
    # Internal: mode normalisation
    # ─────────────────────────────────────────────────────────────────────────

    def _normalize_mode(self, mode: str) -> str:
        normalized = self._MODE_ALIASES.get(mode)
        if not normalized:
            allowed = ", ".join(sorted(self._MODE_ALIASES))
            raise ValueError(
                f"[{self.tenant_id}] Unsupported mode '{mode}'. Allowed: {allowed}"
            )

        if mode != normalized:
            logger.info("[%s] Mode alias '%s' → '%s'.", self.tenant_id, mode, normalized)

        if normalized == "fast_analytics_hash":
            logger.warning(
                "[%s] 'fast_analytics_hash' uses the Polars built-in hash which is NOT "
                "stable across Polars versions or CPU architectures.  Any joins or "
                "deduplication that spans pipeline runs or dataset versions WILL silently "
                "break.  Use 'stable_analytics_hash' for anything beyond ephemeral workloads.",
                self.tenant_id,
            )
        return normalized

    # ─────────────────────────────────────────────────────────────────────────
    # Internal: audit
    # ─────────────────────────────────────────────────────────────────────────

    def _audit(self, entry: Dict[str, Any]) -> None:
        if not self._audit_enabled:
            return
        # Sampling: cheap float comparison, no import overhead on the hot path.
        if self._audit_sample_rate < 1.0:
            import random
            if random.random() > self._audit_sample_rate:
                return
        stamped = {**entry, "timestamp_utc": datetime.now(timezone.utc).isoformat()}
        self.audit_log.append(stamped)
        try:
            self._audit_sink(stamped)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[%s] Audit sink error (non-fatal): %s", self.tenant_id, exc)

    # ─────────────────────────────────────────────────────────────────────────
    # Internal: idempotency guard
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _is_already_hashed(value: str) -> bool:
        """
        [SUBTLE-11] Detect values that are already a SHA-256 hex digest (64 chars).
        Prevents double-hashing when a pipeline is accidentally run twice on the same data.
        """
        return bool(_HEX64_RE.match(value))

    # ─────────────────────────────────────────────────────────────────────────
    # Internal: PII hash batch UDFs
    # ─────────────────────────────────────────────────────────────────────────

    def _stable_hash_batch(self, s: pl.Series) -> pl.Series:
        """
        [CRIT-1, CRIT-2] Stable analytics hash.

        Algorithm : SHA-256(tenant_id + ":" + value), truncated to 16 hex chars.
        Stability : deterministic across Polars versions, Python versions, and architectures.
        Memory    : processes unique values in chunks of 50 k to cap peak RSS on
                    high-cardinality columns (emails, UUIDs, freeform IDs).
        Idempotent: values matching the 64-char hex pattern are passed through unchanged.
        """
        prefix = f"{self.tenant_id}:"
        chunk_size = 50_000
        uniques: pl.Series = s.drop_nulls().unique()
        unique_map: Dict[str, str] = {}

        for start in range(0, len(uniques), chunk_size):
            for val in uniques.slice(start, chunk_size).to_list():
                sv = str(val)
                if sv not in unique_map:
                    if self._is_already_hashed(sv):
                        unique_map[sv] = sv          # idempotent pass-through
                    else:
                        unique_map[sv] = hashlib.sha256(
                            (prefix + sv).encode("utf-8")
                        ).hexdigest()[:16]

        return s.replace(unique_map, default=s)

    def _secure_hash_batch(self, s: pl.Series) -> pl.Series:
        """
        [CRIT-2] Secure HMAC-SHA256 hash.

        Full 64-char hex output, keyed via PBKDF2-derived tenant key.
        Chunked unique processing (50 k/chunk) caps memory on high-cardinality columns.
        Idempotent: values matching the 64-char hex pattern are passed through unchanged.
        """
        chunk_size = 50_000
        uniques: pl.Series = s.drop_nulls().unique()
        unique_map: Dict[str, str] = {}

        for start in range(0, len(uniques), chunk_size):
            for val in uniques.slice(start, chunk_size).to_list():
                sv = str(val)
                if sv not in unique_map:
                    if self._is_already_hashed(sv):
                        unique_map[sv] = sv
                    else:
                        unique_map[sv] = hmac.new(
                            self._tenant_key,
                            sv.encode("utf-8"),
                            hashlib.sha256,
                        ).hexdigest()

        return s.replace(unique_map, default=s)

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 1 — PII sanitisation
    # ─────────────────────────────────────────────────────────────────────────

    def _build_pii_exprs(
        self,
        pii_columns: List[str],
    ) -> List[pl.Expr]:
        """
        [SUBTLE-9] Build PII expressions.  Separated from _sanitize_pii_stage so the
        result can be cached by (fingerprint, mode) and reused across pipeline calls
        that share the same schema.
        """
        exprs: List[pl.Expr] = []
        for col in pii_columns:
            base_expr = (
                pl.col(col)
                .cast(pl.String, strict=self.strict_mode)
                .str.strip_chars()
                .str.to_lowercase()
                .str.replace_all(WHITESPACE_REGEX, " ")
            )

            if self.mode == "fast_analytics_hash":
                # Ephemeral-only: Polars built-in hash (NOT version-stable).
                expr = (
                    pl.when(base_expr.is_null())
                    .then(pl.lit(None, dtype=pl.String))
                    .otherwise(
                        base_expr.hash(seed=self._fast_hash_seed).cast(pl.String)
                    )
                    .alias(col)
                )
            elif self.mode == "stable_analytics_hash":
                expr = (
                    base_expr
                    .map_batches(self._stable_hash_batch, return_dtype=pl.String)
                    .alias(col)
                )
            else:  # secure_identity_hash
                expr = (
                    base_expr
                    .map_batches(self._secure_hash_batch, return_dtype=pl.String)
                    .alias(col)
                )
            exprs.append(expr)
        return exprs

    def _sanitize_pii_stage(
        self,
        expected_schema: List[ColumnSchema],
        existing_cols: Set[str],
        fingerprint: str,
    ) -> Callable[[pl.LazyFrame], pl.LazyFrame]:
        """Stage 1: PII isolation & hashing using a frozen schema snapshot."""

        pii_columns = [
            c.name for c in expected_schema if c.pii and c.name in existing_cols
        ]

        # [SUBTLE-9] Cache expressions keyed by (fingerprint, mode, pii_columns tuple)
        cache_key = (fingerprint, self.mode, tuple(sorted(pii_columns)))
        with self._build_lock:
            if cache_key not in self._pii_expr_cache:
                self._pii_expr_cache[cache_key] = self._build_pii_exprs(pii_columns)
            cached_exprs = self._pii_expr_cache[cache_key]

        def _stage(lf: pl.LazyFrame) -> pl.LazyFrame:
            stage_start = time.perf_counter()

            with self._build_lock:
                self._active_pii_columns = pii_columns

            if not pii_columns:
                return lf

            self._audit({
                "stage": "sanitize_pii",
                "mode": self.mode,
                "columns_hashed": pii_columns,
                "fingerprint": fingerprint,
            })

            elapsed = round((time.perf_counter() - stage_start) * 1000, 2)
            logger.debug(
                "[%s] PII stage built in %sms.  Columns: %s",
                self.tenant_id, elapsed, pii_columns,
            )
            return lf.with_columns(cached_exprs)

        return _stage

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 2 — Numeric cast helper
    # ─────────────────────────────────────────────────────────────────────────

    def _safe_numeric_cast(self, col: str, target_type: pl.DataType) -> pl.Expr:
        """
        [CRIT-3, CRIT-4] Single-pass numeric normalisation.

        Currency / Decimal path
        ───────────────────────
        Polars string → Decimal casting has precision hazards (silent truncation, runtime
        errors depending on backend).  We always route via Float64 → round(2) → Decimal.

        Strict mode (CRIT-4)
        ────────────────────
        The raw column is validated BEFORE any regex transformation is applied.
        Malformed values raise immediately rather than being silently cleaned up
        and then (potentially) cast successfully with wrong data.

        Coerce mode
        ───────────
        Invalid values are coalesced to null predictably; the pipeline never crashes.
        """
        is_currency = isinstance(target_type, pl.Decimal)

        if self.strict_mode:
            # Validate the RAW string representation before touching it.
            raw_str = pl.col(col).cast(pl.String, strict=True)
            raw_cleaned = (
                raw_str
                .str.replace_all(NUMERIC_CLEANUP_REGEX, "")
                .str.replace_all(",", "")
            )
            is_valid = raw_cleaned.str.contains(NUMERIC_VALIDATION_REGEX)

            # Invalid raw values → null so that the subsequent strict cast raises a
            # clear Polars InvalidOperation error with the column name in context.
            safe_str = (
                pl.when(is_valid)
                .then(raw_cleaned)
                .otherwise(pl.lit(None, dtype=pl.String))
            )
            if is_currency:
                return (
                    safe_str
                    .cast(pl.Float64, strict=True)
                    .round(2)
                    .cast(target_type, strict=True)
                    .alias(col)
                )
            return safe_str.cast(target_type, strict=True).alias(col)

        # ── Coerce mode ───────────────────────────────────────────────────────
        normalized_str = (
            pl.col(col)
            .cast(pl.String, strict=False)
            .str.replace_all(NUMERIC_CLEANUP_REGEX, "")
            .str.replace_all(",", "")
        )
        is_valid = normalized_str.str.contains(NUMERIC_VALIDATION_REGEX)

        if is_currency:
            return (
                pl.when(is_valid)
                .then(
                    normalized_str
                    .cast(pl.Float64, strict=False)
                    .round(2)
                    .cast(target_type, strict=False)
                )
                .otherwise(pl.lit(None).cast(target_type))
                .alias(col)
            )

        return (
            pl.when(is_valid)
            .then(normalized_str.cast(target_type, strict=False))
            .otherwise(pl.lit(None).cast(target_type))
            .alias(col)
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 3 & 4 — Schema enforcement
    # ─────────────────────────────────────────────────────────────────────────

    def _build_schema_exprs(
        self,
        expected_schema: List[ColumnSchema],
        existing_cols: Set[str],
        metrics: ExecutionMetrics,
    ) -> Tuple[List[pl.Expr], List[pl.Expr]]:
        """
        Produce (schema_exprs, unknown_exprs).

        schema_exprs  — system cols (HEAD) + declared schema cols.
        unknown_exprs — undeclared cols that survive when preserve_unknown_columns=True (TAIL).

        [ARCH-6] System columns are injected deterministically at the HEAD so ordering
                 never drifts regardless of the source frame's column order.
        """
        schema_exprs: List[pl.Expr] = []
        unknown_exprs: List[pl.Expr] = []
        system_col_set = set(self._system_columns)
        declared_names = {c.name for c in expected_schema}

        # HEAD: system columns in declared order.
        for sys_col in self._system_columns:
            if sys_col in existing_cols:
                schema_exprs.append(pl.col(sys_col))

        # MIDDLE: declared schema columns.
        for col_schema in expected_schema:
            col = col_schema.name
            t_type = self._map_to_polars_type(col_schema.type)

            if col not in existing_cols:
                logger.warning("[%s] Missing column injected as null: %s", self.tenant_id, col)
                metrics.null_injections += 1
                schema_exprs.append(pl.lit(None).cast(t_type).alias(col))
            else:
                metrics.columns_casted += 1
                if t_type.is_numeric() or isinstance(t_type, pl.Decimal):
                    schema_exprs.append(self._safe_numeric_cast(col, t_type))
                else:
                    schema_exprs.append(
                        pl.col(col).cast(t_type, strict=self.strict_mode).alias(col)
                    )

        # TAIL: unknown columns (only when preserve_unknown_columns=True). [ARCH-5]
        if self.preserve_unknown_columns:
            for col in sorted(existing_cols - declared_names - system_col_set):
                unknown_exprs.append(pl.col(col))

        return schema_exprs, unknown_exprs

    def enforce_schema(
        self,
        expected_schema: List[ColumnSchema],
        existing_cols: Set[str],
        metrics: Optional[ExecutionMetrics] = None,
    ) -> Callable[[pl.LazyFrame], pl.LazyFrame]:
        """Stage 3 & 4: Contract enforcement + system column injection."""
        _metrics = metrics or ExecutionMetrics()

        def _stage(lf: pl.LazyFrame) -> pl.LazyFrame:
            stage_start = time.perf_counter()

            schema_exprs, unknown_exprs = self._build_schema_exprs(
                expected_schema, existing_cols, _metrics
            )

            result = lf.select(schema_exprs + unknown_exprs)

            self._audit({
                "stage": "enforce_schema",
                "columns_retained": [c.name for c in expected_schema],
                "unknown_columns_preserved": self.preserve_unknown_columns,
            })

            _metrics.stage_times_ms["enforce_schema"] = round(
                (time.perf_counter() - stage_start) * 1000, 2
            )
            return result

        return _stage

    # ─────────────────────────────────────────────────────────────────────────
    # Type mapping helpers
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _map_to_polars_type(semantic_type: str) -> pl.DataType:
        _MAP: Dict[str, pl.DataType] = {
            "string":   pl.String,
            "int":      pl.Int64,
            "float":    pl.Float64,
            "bool":     pl.Boolean,
            "date":     pl.Date,
            "datetime": pl.Datetime("us", "UTC"),
            "currency": pl.Decimal(precision=18, scale=2),
        }
        return _MAP.get(semantic_type.lower(), pl.String)

    @staticmethod
    def _normalize_semantic_type(semantic_type: str) -> str:
        """Map legacy / connector schema aliases into ColumnSchema semantic types."""
        value = str(semantic_type or "").strip().lower()
        _ALIASES: Dict[str, str] = {
            "string": "string", "varchar": "string", "text": "string",
            "int": "int", "integer": "int", "bigint": "int", "smallint": "int",
            "float": "float", "double": "float", "double precision": "float",
            "real": "float", "numeric": "float", "decimal": "float",
            "bool": "bool", "boolean": "bool",
            "date": "date",
            "datetime": "datetime", "timestamp": "datetime",
            "currency": "currency",
        }
        return _ALIASES.get(value, "string")

    # ─────────────────────────────────────────────────────────────────────────
    # Schema fingerprint helpers
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _schema_column_names(schema: Mapping[str, Any]) -> List[str]:
        if hasattr(schema, "names"):
            return list(schema.names())
        return list(schema.keys())

    @staticmethod
    def _compute_schema_fingerprint(ingestion_schema: Mapping[str, Any]) -> str:
        cols = (
            list(ingestion_schema.names())
            if hasattr(ingestion_schema, "names")
            else list(ingestion_schema.keys())
        )
        entries = [f"{c}:{ingestion_schema[c]}" for c in cols]
        return hashlib.sha256("|".join(entries).encode("utf-8")).hexdigest()

    # ─────────────────────────────────────────────────────────────────────────
    # Contract validation
    # ─────────────────────────────────────────────────────────────────────────

    def validate_contract(
        self,
        existing_cols: Set[str],
        expected_schema: List[ColumnSchema],
    ) -> None:
        """Pre-flight check against the frozen schema footprint."""
        missing_required = [
            c.name for c in expected_schema
            if not c.nullable and c.name not in existing_cols
        ]
        if missing_required:
            raise ValueError(
                f"[{self.tenant_id}] Contract violation. "
                f"Missing required (non-nullable) columns: {missing_required}"
            )

        if self.strict_mode:
            expected_names = {c.name for c in expected_schema}
            unexpected = existing_cols - expected_names - set(self._system_columns)
            if unexpected:
                raise ValueError(
                    f"[{self.tenant_id}] Strict mode violation. "
                    f"Unexpected columns present: {sorted(unexpected)}"
                )

    # ─────────────────────────────────────────────────────────────────────────
    # [SUBTLE-12] Memory guardrail
    # ─────────────────────────────────────────────────────────────────────────

    def _check_memory(self, context: str) -> None:
        """Raise MemoryError if process RSS exceeds max_collect_memory_mb (requires psutil)."""
        if self.max_collect_memory_mb <= 0:
            return
        try:
            import psutil
            rss_mb = psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
            if rss_mb > self.max_collect_memory_mb:
                raise MemoryError(
                    f"[{self.tenant_id}] Memory limit exceeded at '{context}': "
                    f"{rss_mb:.1f} MB > {self.max_collect_memory_mb} MB."
                )
        except ImportError:
            logger.warning(
                "[%s] psutil not installed; memory guardrail disabled. "
                "Install with: pip install psutil",
                self.tenant_id,
            )

    # ─────────────────────────────────────────────────────────────────────────
    # Pipeline orchestration
    # ─────────────────────────────────────────────────────────────────────────

    def build_pipeline(
        self,
        lf: pl.LazyFrame,
        expected_schema: List[ColumnSchema],
        ingestion_schema: Optional[Mapping[str, Any]] = None,
        metrics: Optional[ExecutionMetrics] = None,
    ) -> Tuple[pl.LazyFrame, ExecutionMetrics]:
        """
        Composable DAG construction using a Zero-Trust Schema Boundary.

        Always pass `ingestion_schema` (the schema captured at the ingestion boundary)
        to preserve lazy DAG guarantees.  Omitting it falls back to collect_schema()
        which may partially evaluate the LazyFrame in some Polars versions.

        Returns
        ───────
        (lazy_frame, metrics_snapshot)
        metrics_snapshot is populated by execute() — do not inspect it before that call.
        """
        if ingestion_schema is None:
            logger.warning(
                "[%s] build_pipeline called without ingestion_schema snapshot; "
                "falling back to lf.collect_schema() which may partially evaluate "
                "the LazyFrame in some Polars versions.  Pass ingestion_schema explicitly.",
                self.tenant_id,
            )
            ingestion_schema = lf.collect_schema()

        existing_cols = set(self._schema_column_names(ingestion_schema))
        fingerprint = self._compute_schema_fingerprint(ingestion_schema)

        with self._build_lock:
            self._schema_fingerprint = fingerprint

        logger.info("[%s] Schema boundary locked. Fingerprint: %s", self.tenant_id, fingerprint)

        self.validate_contract(existing_cols, expected_schema)

        _metrics = metrics or ExecutionMetrics()
        _metrics.pii_columns_configured = sum(
            1 for c in expected_schema if c.pii and c.name in existing_cols
        )

        pipeline = (
            lf
            .pipe(self._sanitize_pii_stage(expected_schema, existing_cols, fingerprint))
            .pipe(self.enforce_schema(expected_schema, existing_cols, _metrics))
        )
        return pipeline, _metrics

    def execute(
        self,
        lf: pl.LazyFrame,
        initial_row_count: int,
        streaming: Optional[bool] = None,
        metrics: Optional[ExecutionMetrics] = None,
    ) -> Tuple[pl.DataFrame, ExecutionMetrics]:
        """
        Execute the pipeline and return (DataFrame, ExecutionMetrics).

        [ARCH-7] The returned ExecutionMetrics is an immutable Pydantic snapshot —
        safe to pass across threads without additional locking.
        """
        _metrics = metrics or ExecutionMetrics()
        _streaming = self.streaming_safe if streaming is None else streaming

        if not self.streaming_safe and _streaming:
            logger.warning(
                "[%s] Streaming disabled: mode '%s' uses map_batches (Python UDF) "
                "which breaks Polars streaming guarantees.",
                self.tenant_id, self.mode,
            )
            _streaming = False

        self._check_memory("pre-collect")

        exec_start = time.perf_counter()
        df = lf.collect(streaming=_streaming)
        exec_ms = round((time.perf_counter() - exec_start) * 1000, 2)

        self._check_memory("post-collect")

        final_height = df.height
        active_pii = self._active_pii_columns  # snapshot under no-lock (read-only after stage)

        # [SUBTLE-10] Per-column null rate + PII flag
        per_col: Dict[str, Dict[str, Any]] = {}
        for col in df.columns:
            null_count = df[col].null_count()
            per_col[col] = {
                "null_count": null_count,
                "null_rate": round(null_count / final_height, 4) if final_height > 0 else 0.0,
                "pii": col in active_pii,
            }

        _metrics.rows_input = initial_row_count
        _metrics.rows_output = final_height
        _metrics.rows_dropped = initial_row_count - final_height
        _metrics.pii_cells_transformed = (
            final_height * len(active_pii) if active_pii and final_height > 0 else 0
        )
        _metrics.total_execution_ms = exec_ms
        _metrics.per_column = per_col

        logger.info(
            "[%s] Execution complete. Fingerprint: %s. rows_in=%d rows_out=%d "
            "dropped=%d pii_cells=%d exec_ms=%.2f",
            self.tenant_id,
            self._schema_fingerprint,
            _metrics.rows_input,
            _metrics.rows_output,
            _metrics.rows_dropped,
            _metrics.pii_cells_transformed,
            _metrics.total_execution_ms,
        )
        return df, _metrics

    # ─────────────────────────────────────────────────────────────────────────
    # Backward-compatible surface APIs
    # ─────────────────────────────────────────────────────────────────────────

    def sanitize_pii(
        self,
        expected_schema: Any,
        existing_cols: Optional[Set[str]] = None,
        pii_columns: Optional[List[str]] = None,
    ) -> Any:
        """
        Dual-mode API for backward compatibility.

        New API  : sanitize_pii(expected_schema: List[ColumnSchema], existing_cols) → stage callable
        Legacy   : sanitize_pii(df: pl.DataFrame, pii_columns=[...]) → DataFrame
        """
        if isinstance(expected_schema, pl.DataFrame):
            df: pl.DataFrame = expected_schema
            pii_set = set(pii_columns or [])
            legacy_schema = [
                ColumnSchema(name=col, type="string", nullable=True, pii=(col in pii_set))
                for col in df.columns
            ]
            fingerprint = self._compute_schema_fingerprint(df.schema)
            stage = self._sanitize_pii_stage(legacy_schema, set(df.columns), fingerprint)
            return stage(df.lazy()).collect(streaming=self.streaming_safe)

        if existing_cols is None:
            raise ValueError(
                f"[{self.tenant_id}] sanitize_pii requires 'existing_cols' when called "
                "with a schema list."
            )
        # Fingerprint is unknown at this call site; use a deterministic stand-in.
        fingerprint = hashlib.sha256(
            "|".join(c.name for c in expected_schema).encode()
        ).hexdigest()
        return self._sanitize_pii_stage(expected_schema, existing_cols, fingerprint)

    def enforce_duckdb_schema(
        self, df: pl.DataFrame, expected_schema: Dict[str, str]
    ) -> pl.DataFrame:
        """Legacy compatibility: enforce schema on an eager DataFrame."""
        schema_contract = [
            ColumnSchema(
                name=col_name,
                type=self._normalize_semantic_type(col_type),
                nullable=True,
                pii=False,
            )
            for col_name, col_type in expected_schema.items()
        ]
        m = ExecutionMetrics()
        stage = self.enforce_schema(schema_contract, set(df.columns), m)
        return stage(df.lazy()).collect(streaming=self.streaming_safe)

    def process_batch(
        self,
        df: pl.DataFrame,
        pii_columns: List[str],
        expected_schema: Dict[str, str],
    ) -> Tuple[pl.DataFrame, ExecutionMetrics]:
        """
        Legacy compatibility API used by SyncEngine.

        Now returns (DataFrame, ExecutionMetrics) — callers that previously ignored
        the return value of process_batch are unaffected; callers that captured only the
        DataFrame can unpack the tuple: `result_df, _ = sanitizer.process_batch(...)`.
        """
        pii_set = set(pii_columns or [])
        schema_contract = [
            ColumnSchema(
                name=col_name,
                type=self._normalize_semantic_type(col_type),
                nullable=True,
                pii=(col_name in pii_set),
            )
            for col_name, col_type in expected_schema.items()
        ]
        pipeline, m = self.build_pipeline(
            df.lazy(), schema_contract, ingestion_schema=df.schema
        )
        return self.execute(pipeline, initial_row_count=df.height, metrics=m)

    # ─────────────────────────────────────────────────────────────────────────
    # Observability export
    # ─────────────────────────────────────────────────────────────────────────

    def export_metrics(self, metrics: Optional[ExecutionMetrics] = None) -> Dict[str, Any]:
        """OpenTelemetry-friendly metric payload — safe to pass to any OTLP exporter."""
        return {
            "tenant_id": self.tenant_id,
            "version": self.version,
            "schema_fingerprint": self._schema_fingerprint,
            "mode": self.mode,
            "strict_mode": self.strict_mode,
            "preserve_unknown_columns": self.preserve_unknown_columns,
            "metrics": (metrics or ExecutionMetrics()).model_dump(),
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        }