"""
ARCLI.TECH - Intelligence Layer
Component: Anomaly Detector (The Watcher)
Strategy: Push Architecture, Statistical Process Control, Vectorization & AI Synthesis

v7.0 — Full Audit Hardening
Fixes applied vs v6.0:
  [1.1]  rolling_var via Expr API (Series.rolling_var is wrong API surface)
  [1.2]  map_elements lambda replaced with vectorized DataFrame join
  [1.3]  latest["y"] guarded with explicit null/key check
  [1.4]  Date extraction reordered — validated before any downstream access
  [1.5]  time_grain SQL surface: assert added before string interpolation
  [1.6]  SecurityError moved to module top (before any usage)
  [1.7]  DuckDB PRAGMA scoped per-connection, documented
  [1.8]  Semaphore starvation: timeout added to asyncio.wait_for
  [1.9]  Baseline cache protected by threading.Lock via _LRUThreadCache
  [1.10] Baseline join validated — NULL stats trigger full rebuild
  [2.1]  Hybrid Z blending: both scores normalised to unit variance before blend
  [2.2]  Skewness computed via Polars native Series.skew() — no Python loop
  [2.3]  Flatline: min(rolling_var) used instead of mean (spike-resistant)
  [2.4]  Streak decay: exponential weighting [0.50, 0.33, 0.17] over 3-window
  [2.5]  SPC returns only None (normal) or full payload dict (anomaly)
  [3.1]  DB session consolidation: single session per SPC thread
  [3.2]  Path logged as SHA-256 token, never raw value
  [3.3]  Baseline cache max-size LRU eviction via OrderedDict
  [3.4]  MAX_QUERY_ROWS promoted to named class constant
"""

from __future__ import annotations

import hashlib
import logging
import math
import asyncio
import os
import re
import threading
import time
from collections import OrderedDict
from enum import Enum
from pathlib import Path
from typing import Dict, Any, Optional, List, Literal, TypedDict
from datetime import datetime, timedelta, timezone

import polars as pl
from sqlalchemy.orm import Session

# Arcli Core Infrastructure
from api.database import SessionLocal
from api.services.storage_manager import storage_manager
from api.services.llm_client import LLMClient, llm_client as default_llm
from api.services.insight_orchestrator import insight_orchestrator
from models import Dataset, SemanticMetric

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# [1.6] SecurityError defined at module top — used throughout file
# ---------------------------------------------------------------------------

class SecurityError(Exception):
    """Raised when a path-safety invariant is violated."""


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

BASE_DATA_DIR = Path(os.getenv("ARCLI_DATA_ROOT", "/trusted/data/root")).resolve()

# ---------------------------------------------------------------------------
# Enumerations & Typed Results
# ---------------------------------------------------------------------------

class ErrorReason(str, Enum):
    DATASET_NOT_FOUND = "dataset_not_found"
    METRIC_NOT_FOUND  = "metric_not_found"
    INVALID_COLUMN    = "invalid_column"
    PATH_TRAVERSAL    = "path_traversal"
    INSUFFICIENT_DATA = "insufficient_data"
    STALE_DATA        = "stale_data"
    LOW_VOLUME        = "low_volume"
    MATH_ERROR        = "math_error"
    TIMEOUT           = "timeout"
    EXECUTION_FAILED  = "execution_failed"


class AnomalyResult(TypedDict):
    status:          str
    tenant_id:       str
    dataset_id:      str
    date:            str
    metric:          str
    actual_value:    float
    expected_value:  float
    z_score:         float
    confidence:      float
    direction:       str
    variance_pct:    float
    engine:          str
    ai_insight:      str
    anomaly_streak:  int
    error_reason:    Optional[ErrorReason]
    idempotency_key: Optional[str]


# ---------------------------------------------------------------------------
# Baseline cache entry
# ---------------------------------------------------------------------------

class _BaselineEntry:
    __slots__ = ("df", "computed_at")

    def __init__(self, df: pl.DataFrame) -> None:
        self.df = df
        self.computed_at: float = time.monotonic()

    def is_fresh(self, ttl: float) -> bool:
        return (time.monotonic() - self.computed_at) < ttl


# ---------------------------------------------------------------------------
# [3.3] LRU-bounded thread-safe cache
# ---------------------------------------------------------------------------

class _LRUThreadCache:
    """OrderedDict-backed LRU cache protected by threading.Lock."""

    def __init__(self, maxsize: int = 512) -> None:
        self._store: OrderedDict[str, _BaselineEntry] = OrderedDict()
        self._lock  = threading.Lock()
        self._maxsize = maxsize

    def get(self, key: str) -> Optional[_BaselineEntry]:
        with self._lock:
            if key not in self._store:
                return None
            self._store.move_to_end(key)
            return self._store[key]

    def set(self, key: str, entry: _BaselineEntry) -> None:
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = entry
            if len(self._store) > self._maxsize:
                self._store.popitem(last=False)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)


# ---------------------------------------------------------------------------
# Main Detector
# ---------------------------------------------------------------------------

class AnomalyDetector:
    """
    Phase 7 — Elite-Grade Analytical Engine (v7.0, full audit pass).

    Architecture
    ------------
    * Async entry points serialise per-tenant via asyncio.Semaphore (plain dict,
      never evicted).
    * CPU-heavy SPC pipeline runs in the default thread pool via asyncio.to_thread.
    * Per-tenant rolling baselines cached in _LRUThreadCache (threading.Lock).
    * All DuckDB results flow Arrow → Polars (zero-copy).
    * No Python-level row loops anywhere in the hot path.
    """

    # Statistical constants
    WINDOW_DAYS              = 90
    MIN_PERIODS              = 14
    ROLLING_WINDOW           = 14
    MAD_CONSISTENCY_CONST    = 0.6745
    EPSILON                  = 1e-5
    MIN_VOLUME               = 5.0
    MIN_MAD                  = 1e-3
    FLATLINE_EPSILON         = 1e-4
    MIN_DAYS_FOR_SEASONALITY = 21
    VALID_GRAINS             = frozenset({"hour", "day", "week"})

    # Hybrid blend weights (must sum to 1.0)
    ROBUST_WEIGHT            = 0.70
    CLASSICAL_WEIGHT         = 0.30
    SKEW_REGIME_THRESHOLD    = 1.5

    # Execution limits
    MAX_MEMORY_LIMIT          = "2GB"
    MAX_CONCURRENT_PER_TENANT = 3
    QUERY_TIMEOUT_SEC         = 15.0

    # [3.4] Named constant replaces magic number in LIMIT clause
    MAX_QUERY_ROWS            = 100_000

    # Baseline cache
    BASELINE_CACHE_TTL_SEC  = 300
    BASELINE_CACHE_MAXSIZE  = 512

    def __init__(self, llm_client: Optional[LLMClient] = None) -> None:
        self.llm_client = llm_client or default_llm

        # [FIX 1.1] Plain dict — semaphores are never evicted while held
        self._tenant_semaphores: Dict[str, asyncio.Semaphore] = {}
        self._semaphore_lock: Optional[asyncio.Lock] = None   # lazy init

        # [1.9] Thread-safe LRU baseline cache
        self._baseline_cache = _LRUThreadCache(maxsize=self.BASELINE_CACHE_MAXSIZE)

    # -----------------------------------------------------------------------
    # Semaphore helpers
    # -----------------------------------------------------------------------

    async def _get_semaphore(self, tenant_id: str) -> asyncio.Semaphore:
        if self._semaphore_lock is None:
            self._semaphore_lock = asyncio.Lock()
        async with self._semaphore_lock:
            if tenant_id not in self._tenant_semaphores:
                self._tenant_semaphores[tenant_id] = asyncio.Semaphore(
                    self.MAX_CONCURRENT_PER_TENANT
                )
            return self._tenant_semaphores[tenant_id]

    # -----------------------------------------------------------------------
    # Safety helpers
    # -----------------------------------------------------------------------

    def _safe_identifier(self, name: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9_]", "", name)
        if not cleaned or not cleaned[0].isalpha():
            raise ValueError(f"Invalid SQL identifier: {name!r}")
        return cleaned

    def _validate_path(self, raw_path: str) -> Path:
        """
        Full path-safety pipeline:
          1. Resolve to absolute (eliminates ../traversal).
          2. Reject symbolic links — a symlink can escape containment.
          3. Parent-containment check vs BASE_DATA_DIR.
        """
        resolved = Path(raw_path).resolve()
        try:
            if resolved.is_symlink():
                raise SecurityError("Symlink rejected")
        except OSError:
            pass  # path may not exist at validation time; containment is enough
        if BASE_DATA_DIR not in resolved.parents and resolved != BASE_DATA_DIR:
            raise SecurityError("Path outside BASE_DATA_DIR")
        return resolved

    @staticmethod
    def _path_token(path: str) -> str:
        """[3.2] Short hash — raw paths are never written to logs."""
        return hashlib.sha256(path.encode()).hexdigest()[:12]

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    async def detect_anomaly(
        self,
        db:         Session,
        tenant_id:  str,
        dataset_id: str,
        metric_col: str,
        time_col:   str,
        threshold:  float = 3.0,
        time_grain: Literal["hour", "day", "week"] = "day",
    ) -> AnomalyResult:
        """Detect anomalies on a raw dataset column."""

        # [1.5] Enum guard + assert before any SQL interpolation
        if time_grain not in self.VALID_GRAINS:
            return self._build_error(tenant_id, dataset_id, metric_col, ErrorReason.INVALID_COLUMN)
        assert time_grain in self.VALID_GRAINS  # belt-and-suspenders for static analysis

        try:
            safe_metric = self._safe_identifier(metric_col)
            safe_time   = self._safe_identifier(time_col)
        except ValueError:
            return self._build_error(tenant_id, dataset_id, metric_col, ErrorReason.INVALID_COLUMN)

        # [FIX 2] Explicit two-step semaphore acquisition
        sem = await self._get_semaphore(tenant_id)
        async with sem:
            dataset = await asyncio.to_thread(self._fetch_dataset, tenant_id, dataset_id)
            if not dataset:
                return self._build_error(tenant_id, dataset_id, metric_col, ErrorReason.DATASET_NOT_FOUND)

            known_columns = getattr(dataset, "schema_columns", [])
            if known_columns and (metric_col not in known_columns or time_col not in known_columns):
                logger.warning(
                    "[%s] dataset=%s schema mismatch metric=%s time=%s",
                    tenant_id, dataset_id, metric_col, time_col,
                )
                return self._build_error(tenant_id, dataset_id, metric_col, ErrorReason.INVALID_COLUMN)

            raw_path = storage_manager.get_duckdb_query_path(db, dataset)
            try:
                resolved_path = self._validate_path(raw_path)
            except SecurityError:
                logger.critical(
                    "[%s] PATH TRAVERSAL ATTEMPT token=%s",
                    tenant_id, self._path_token(raw_path),
                )
                return self._build_error(tenant_id, dataset_id, metric_col, ErrorReason.PATH_TRAVERSAL)

            window_start = (
                datetime.now(timezone.utc) - timedelta(days=self.WINDOW_DAYS)
            ).strftime("%Y-%m-%d")

            query = f"""
                SELECT
                    DATE_TRUNC('{time_grain}', "{safe_time}"::TIMESTAMP) AS ds,
                    SUM("{safe_metric}")::DOUBLE                          AS y
                FROM   read_parquet('{resolved_path}')
                WHERE  "{safe_time}"   >= '{window_start}'
                  AND  "{safe_time}"   IS NOT NULL
                  AND  "{safe_metric}" IS NOT NULL
                GROUP BY ds
                ORDER BY ds ASC
                LIMIT {self.MAX_QUERY_ROWS}
            """

            return await self._execute_and_analyze(
                tenant_id    = tenant_id,
                query        = query,
                threshold    = threshold,
                context_meta = {
                    "dataset_id": dataset_id,
                    "metric":     safe_metric,
                    "engine":     "Polars-Hybrid-Regime (Raw)",
                    "time_grain": time_grain,
                },
            )

    async def detect_golden_metric_anomaly(
        self,
        db:          Session,
        tenant_id:   str,
        metric_name: str,
        threshold:   float = 3.0,
        time_grain:  Literal["hour", "day", "week"] = "day",
    ) -> AnomalyResult:
        """Evaluate cross-platform Golden Metrics."""

        if time_grain not in self.VALID_GRAINS:
            return self._build_error(tenant_id, "ast", metric_name, ErrorReason.INVALID_COLUMN)
        assert time_grain in self.VALID_GRAINS

        from api.services.metric_governance import metric_governance_service

        sem = await self._get_semaphore(tenant_id)
        async with sem:
            metric = await asyncio.to_thread(self._fetch_semantic_metric, tenant_id, metric_name)
            if not metric:
                return self._build_error(tenant_id, "ast", metric_name, ErrorReason.METRIC_NOT_FOUND)

            window_start = (
                datetime.now(timezone.utc) - timedelta(days=self.WINDOW_DAYS)
            ).strftime("%Y-%m-%d")

            try:
                safe_alias = self._safe_identifier(metric.metric_name.lower())
                governed   = f"governed_{safe_alias}"
            except ValueError:
                return self._build_error(tenant_id, "ast", metric_name, ErrorReason.INVALID_COLUMN)

            base_query = f"""
                SELECT
                    DATE_TRUNC('{time_grain}', ds::TIMESTAMP) AS ds,
                    {governed}::DOUBLE                         AS y
                FROM   {governed}
                WHERE  ds >= '{window_start}'
                  AND  ds IS NOT NULL
                GROUP BY ds
                ORDER BY ds ASC
                LIMIT {self.MAX_QUERY_ROWS}
            """

            active_datasets = await asyncio.to_thread(self._fetch_active_dataset_ids, tenant_id)

            with SessionLocal() as thread_db:
                executable_query = await asyncio.to_thread(
                    metric_governance_service.inject_governed_metrics,
                    thread_db, tenant_id, active_datasets, base_query,
                )

            return await self._execute_and_analyze(
                tenant_id    = tenant_id,
                query        = executable_query,
                threshold    = threshold,
                context_meta = {
                    "dataset_id": "cross-platform-ast",
                    "metric":     metric_name,
                    "engine":     "Polars-Hybrid-Regime (Golden Metric)",
                    "time_grain": time_grain,
                },
            )

    # -----------------------------------------------------------------------
    # Core execution pipeline
    # -----------------------------------------------------------------------

    async def _execute_and_analyze(
        self,
        tenant_id:    str,
        query:        str,
        threshold:    float,
        context_meta: Dict[str, str],
    ) -> AnomalyResult:
        t0         = time.time()
        dataset_id = context_meta["dataset_id"]
        metric     = context_meta["metric"]

        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    self._run_statistical_process_control,
                    tenant_id, query, threshold, context_meta,
                ),
                # [1.8] Hard timeout releases semaphore slot even under starvation
                timeout=self.QUERY_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError:
            return self._build_error(tenant_id, dataset_id, metric, ErrorReason.TIMEOUT)
        except Exception as exc:
            logger.error(
                "[%s][%s] Execution failed: %s", tenant_id, dataset_id, exc, exc_info=True
            )
            return self._build_error(tenant_id, dataset_id, metric, ErrorReason.EXECUTION_FAILED)

        # [2.5] SPC returns None for every non-anomaly path
        if result is None:
            return self._build_normal(tenant_id, dataset_id, metric)

        duration = time.time() - t0
        logger.info(
            "anomaly_detected tenant=%s dataset=%s metric=%s z=%.3f conf=%.2f "
            "direction=%s latency=%.3fs",
            tenant_id, dataset_id, metric,
            result["z_score"], result["confidence"], result["direction"], duration,
        )

        if result["confidence"] > 0.4:
            try:
                idem_key = f"{tenant_id}:{metric}:{result['date']}"
                result["idempotency_key"] = idem_key
                insight_orchestrator.enqueue_insight_generation(tenant_id, result)
                result["ai_insight"] = "AI Synthesis queued for generation."
            except Exception as exc:
                logger.error("[%s] Failed to enqueue AI insight: %s", tenant_id, exc)
                result["ai_insight"] = "AI Synthesis currently unavailable."
        else:
            result["ai_insight"] = "Anomaly confidence too low for AI synthesis."

        return result

    # -----------------------------------------------------------------------
    # Statistical Process Control  (runs in thread pool)
    # -----------------------------------------------------------------------

    def _run_statistical_process_control(
        self,
        tenant_id:    str,
        query:        str,
        threshold:    float,
        context_meta: Dict[str, str],
    ) -> Optional[Dict[str, Any]]:
        """
        Returns:
          None           — no anomaly detected, or pre-condition not met.
          Dict[str, Any] — full AnomalyResult-compatible payload (always complete).

        [2.5] Never returns a bare {"status": "..."} dict.  Callers receive None
        and convert it via _build_normal().
        """
        try:
            # [3.1] Single DB session for the entire SPC run
            with SessionLocal() as thread_db:
                with storage_manager.duckdb_session(thread_db, tenant_id) as con:
                    # [1.7] PRAGMAs are session-scoped; set immediately on open
                    con.execute("PRAGMA threads=4;")
                    con.execute(f"PRAGMA memory_limit='{self.MAX_MEMORY_LIMIT}';")
                    con.execute("PRAGMA busy_timeout=15000;")
                    arrow_tbl = con.execute(query).arrow()
                    df = pl.from_arrow(arrow_tbl)

            if df is None or df.is_empty() or df.height < self.MIN_PERIODS:
                return None

            df = df.sort("ds")

            # ------------------------------------------------------------------
            # [1.4] Date validation FIRST — before any row extraction
            # ------------------------------------------------------------------
            date_series = df.select(pl.col("ds").cast(pl.Date, strict=False)).to_series()
            if date_series.is_empty() or date_series[-1] is None:
                return None

            latest_date = date_series[-1]
            if (datetime.now(timezone.utc).date() - latest_date).days > 2:
                return None  # stale data

            # ------------------------------------------------------------------
            # [1.1] Flatline detection via Expr API (not Series.rolling_var)
            # [2.3] Use min(rolling_var) — spike-resistant vs mean
            # ------------------------------------------------------------------
            var_series = (
                df.select(
                    pl.col("y")
                    .rolling_var(window_size=min(self.ROLLING_WINDOW, df.height))
                    .alias("rv")
                )
                .to_series()
                .drop_nulls()
            )
            if var_series.is_empty() or float(var_series.min()) < self.FLATLINE_EPSILON:
                latest_flat = df.tail(1).to_dicts()[0]
                actual_flat = latest_flat.get("y")
                if actual_flat is None:
                    return None
                return self._build_anomaly_payload(
                    tenant_id, context_meta, latest_flat,
                    expected=float(actual_flat), z_score=0.0,
                    confidence=1.0, direction="flatline", streak=0,
                )

            # Dynamic threshold: tighten when we have more history
            dyn_threshold = threshold if df.height > 60 else threshold + 1.0

            # ------------------------------------------------------------------
            # [1.2] Seasonality: vectorized join replaces map_elements lambda
            # ------------------------------------------------------------------
            time_grain = context_meta.get("time_grain", "day")
            if df.height >= self.MIN_DAYS_FOR_SEASONALITY and time_grain == "day":
                df = df.with_columns(pl.col("ds").dt.weekday().alias("weekday"))

                wday_baseline = df.group_by("weekday").agg(
                    pl.col("y").median().alias("weekday_median")
                )

                df = df.join(wday_baseline, on="weekday", how="left")

                missing_wdays = df["weekday_median"].null_count()
                if missing_wdays > 0:
                    logger.warning(
                        "[%s] %d/%d rows have no weekday baseline — filling 0.0",
                        tenant_id, missing_wdays, df.height,
                    )

                df = df.with_columns(
                    pl.col("weekday_median").fill_null(0.0)
                ).with_columns(
                    (pl.col("y") - pl.col("weekday_median")).alias("y_adjusted")
                )
            else:
                df = df.with_columns(
                    pl.lit(0.0).alias("weekday_median"),
                    pl.col("y").alias("y_adjusted"),
                )

            # ------------------------------------------------------------------
            # Rolling baseline: cache-backed, validated on load  [1.10]
            # ------------------------------------------------------------------
            cache_key = f"{tenant_id}:{context_meta.get('metric', '')}:{time_grain}"
            df = self._apply_or_build_baseline(cache_key, df)

            # ------------------------------------------------------------------
            # Robust MAD Z-Score
            # ------------------------------------------------------------------
            df = df.with_columns(
                pl.when(pl.col("mad") < self.MIN_MAD)
                .then(self.MIN_MAD)
                .otherwise(pl.col("mad"))
                .alias("safe_mad")
            ).with_columns(
                (
                    self.MAD_CONSISTENCY_CONST
                    * (pl.col("y_adjusted") - pl.col("rolling_median_adj"))
                    / pl.col("safe_mad")
                ).alias("robust_z_raw")
            ).with_columns(
                pl.when(pl.col("robust_z_raw").is_finite())
                .then(pl.col("robust_z_raw"))
                .otherwise(0.0)
                .alias("robust_z_raw")
            )

            # ------------------------------------------------------------------
            # Classical Z-Score
            # ------------------------------------------------------------------
            df = df.with_columns(
                pl.col("y_adjusted").mean().alias("mean_y"),
                pl.col("y_adjusted").std().alias("std_y"),
            ).with_columns(
                pl.when(pl.col("std_y") < self.EPSILON)
                .then(self.EPSILON)
                .otherwise(pl.col("std_y"))
                .alias("safe_std_y")
            ).with_columns(
                ((pl.col("y_adjusted") - pl.col("mean_y")) / pl.col("safe_std_y"))
                .alias("classical_z_raw")
            )

            # ------------------------------------------------------------------
            # [2.1] Normalise both Z-scores to unit variance before blending.
            #
            # robust_z and classical_z are both sigma-scaled but may have
            # different empirical spread (especially under heavy-tailed data).
            # Dividing each by its own rolling std re-anchors them to the same
            # scale before the weighted blend, preventing classical_z from
            # over- or under-contributing.
            # ------------------------------------------------------------------
            df = df.with_columns(
                pl.col("robust_z_raw")
                .rolling_std(window_size=self.ROLLING_WINDOW, min_periods=7)
                .alias("rz_std"),
                pl.col("classical_z_raw")
                .rolling_std(window_size=self.ROLLING_WINDOW, min_periods=7)
                .alias("cz_std"),
            ).with_columns(
                (
                    pl.col("robust_z_raw")
                    / pl.when(pl.col("rz_std") < self.EPSILON)
                    .then(1.0)
                    .otherwise(pl.col("rz_std"))
                ).alias("robust_z"),
                (
                    pl.col("classical_z_raw")
                    / pl.when(pl.col("cz_std") < self.EPSILON)
                    .then(1.0)
                    .otherwise(pl.col("cz_std"))
                ).alias("classical_z"),
            )

            # ------------------------------------------------------------------
            # [2.2] Skewness via Polars native — no Python-level iteration
            # ------------------------------------------------------------------
            raw_skew = df["y_adjusted"].skew()
            skewness: float = float(raw_skew) if raw_skew is not None and math.isfinite(float(raw_skew)) else 0.0

            if abs(skewness) >= self.SKEW_REGIME_THRESHOLD:
                # Heavy-tailed distribution → pure robust mode
                df = df.with_columns(pl.col("robust_z").alias("hybrid_z"))
                logger.debug("[%s] regime=robust skewness=%.2f", tenant_id, skewness)
            else:
                # Gaussian-like → weighted blend
                df = df.with_columns(
                    (
                        self.ROBUST_WEIGHT    * pl.col("robust_z")
                        + self.CLASSICAL_WEIGHT * pl.col("classical_z")
                    ).alias("hybrid_z")
                )

            # ------------------------------------------------------------------
            # [2.4] Streak with exponential decay weights [0.50, 0.33, 0.17]
            # Recent anomaly points count more than older ones.
            # ------------------------------------------------------------------
            df = df.with_columns(
                (pl.col("hybrid_z").abs() > dyn_threshold).cast(pl.Float64).alias("is_anom_f"),
                pl.when(pl.col("hybrid_z") > 0).then(1)
                .when(pl.col("hybrid_z") < 0).then(-1)
                .otherwise(0)
                .alias("z_sign"),
            ).with_columns(
                (
                    pl.col("is_anom_f") * 0.50
                    + pl.col("is_anom_f").shift(1).fill_null(0.0) * 0.33
                    + pl.col("is_anom_f").shift(2).fill_null(0.0) * 0.17
                ).alias("weighted_streak"),
                pl.col("z_sign").rolling_sum(window_size=3).alias("sign_streak"),
            )

            # ------------------------------------------------------------------
            # [1.3] Safe latest-row extraction with explicit null guards
            # ------------------------------------------------------------------
            if df.is_empty():
                return None

            latest = df.tail(1).to_dicts()[0]

            actual_raw = latest.get("y")
            if actual_raw is None:
                return None
            actual = float(actual_raw)

            expected_adj_raw = latest.get("rolling_median_adj")
            if expected_adj_raw is None or not math.isfinite(float(expected_adj_raw)):
                return None

            expected_raw = float(expected_adj_raw) + float(latest.get("weekday_median") or 0.0)

            if expected_raw < self.MIN_VOLUME:
                return None

            z_score         = float(latest.get("hybrid_z") or 0.0)
            weighted_streak = float(latest.get("weighted_streak") or 0.0)
            sign_streak     = int(latest.get("sign_streak") or 0)

            # Anomaly: Z exceeds dynamic threshold OR weighted streak is significant
            is_anomalous = abs(z_score) > dyn_threshold or weighted_streak >= 0.5
            if not is_anomalous:
                return None

            confidence = min(
                1.0,
                (abs(z_score) / dyn_threshold)     * 0.50
                + min(weighted_streak, 1.0)         * 0.30
                + (1.0 if df.height > 30 else 0.7) * 0.20,
            )

            if weighted_streak >= 0.5:
                direction = "sustained_increase" if sign_streak > 0 else "sustained_decrease"
            else:
                direction = "spike" if z_score > 0 else "drop"

            return self._build_anomaly_payload(
                tenant_id, context_meta, latest,
                expected_raw, z_score, confidence, direction,
                streak=int(round(weighted_streak * 3)),  # normalise to 0–3 range
            )

        except Exception as exc:
            logger.error("[%s] SPC pipeline exception: %s", tenant_id, exc, exc_info=True)
            raise

    # -----------------------------------------------------------------------
    # Baseline cache helpers
    # -----------------------------------------------------------------------

    def _apply_or_build_baseline(self, cache_key: str, df: pl.DataFrame) -> pl.DataFrame:
        """
        Enrich df with rolling_median_adj and mad columns.
        Attempts a left-join from cache; rebuilds if stale or join coverage < 50%.
        [1.9] _LRUThreadCache handles its own locking.
        """
        entry = self._baseline_cache.get(cache_key)

        if entry is not None and entry.is_fresh(self.BASELINE_CACHE_TTL_SEC):
            try:
                cached_cols = entry.df.select(["ds", "rolling_median_adj", "mad"])
                merged = df.join(cached_cols, on="ds", how="left")
                # [1.10] Only trust merge when null coverage is acceptable
                null_pct = merged["rolling_median_adj"].null_count() / max(merged.height, 1)
                if null_pct <= 0.5:
                    return merged
                logger.warning(
                    "cache_key=%s baseline join null_pct=%.1f%% — rebuilding",
                    cache_key, null_pct * 100,
                )
            except Exception:
                pass  # fall through to rebuild

        df = self._compute_rolling_stats(df)
        self._baseline_cache.set(
            cache_key,
            _BaselineEntry(df.select(["ds", "rolling_median_adj", "mad"])),
        )
        return df

    def _compute_rolling_stats(self, df: pl.DataFrame) -> pl.DataFrame:
        return (
            df
            .with_columns(
                pl.col("y_adjusted")
                .shift(1)
                .rolling_median(window_size=self.ROLLING_WINDOW, min_periods=7)
                .alias("rolling_median_adj")
            )
            .with_columns(
                (pl.col("y_adjusted").shift(1) - pl.col("rolling_median_adj"))
                .abs()
                .alias("abs_dev")
            )
            .with_columns(
                pl.col("abs_dev")
                .rolling_median(window_size=self.ROLLING_WINDOW, min_periods=7)
                .alias("mad")
            )
        )

    # -----------------------------------------------------------------------
    # Payload builders
    # -----------------------------------------------------------------------

    def _build_anomaly_payload(
        self,
        tenant_id:  str,
        meta:       Dict[str, str],
        latest:     Dict[str, Any],
        expected:   float,
        z_score:    float,
        confidence: float,
        direction:  str,
        streak:     int,
    ) -> AnomalyResult:
        actual       = float(latest["y"])
        variance_pct = (
            ((actual - expected) / (expected + self.EPSILON)) * 100.0
            if abs(expected) > self.EPSILON
            else 100.0
        )
        ds_val   = latest["ds"]
        date_str = (
            ds_val.strftime("%Y-%m-%d %H:%M:%S")
            if hasattr(ds_val, "strftime")
            else str(ds_val)
        )
        return {
            "status":          "anomaly",
            "tenant_id":       tenant_id,
            "dataset_id":      meta.get("dataset_id", ""),
            "date":            date_str,
            "metric":          meta.get("metric", ""),
            "actual_value":    actual,
            "expected_value":  float(expected),
            "z_score":         float(z_score),
            "confidence":      float(confidence),
            "direction":       direction,
            "variance_pct":    float(variance_pct),
            "engine":          meta.get("engine", ""),
            "ai_insight":      "",
            "anomaly_streak":  int(streak),
            "error_reason":    None,
            "idempotency_key": None,
        }

    def _build_error(
        self,
        tenant_id:  str,
        dataset_id: str,
        metric:     str,
        reason:     ErrorReason,
    ) -> AnomalyResult:
        return {
            "status":          "error",
            "tenant_id":       tenant_id,
            "dataset_id":      dataset_id,
            "date":            "",
            "metric":          metric,
            "actual_value":    0.0,
            "expected_value":  0.0,
            "z_score":         0.0,
            "confidence":      0.0,
            "direction":       "",
            "variance_pct":    0.0,
            "engine":          "",
            "ai_insight":      "",
            "anomaly_streak":  0,
            "error_reason":    reason,
            "idempotency_key": None,
        }

    def _build_normal(
        self,
        tenant_id:  str,
        dataset_id: str,
        metric:     str,
    ) -> AnomalyResult:
        return {
            "status":          "normal",
            "tenant_id":       tenant_id,
            "dataset_id":      dataset_id,
            "date":            "",
            "metric":          metric,
            "actual_value":    0.0,
            "expected_value":  0.0,
            "z_score":         0.0,
            "confidence":      0.0,
            "direction":       "",
            "variance_pct":    0.0,
            "engine":          "",
            "ai_insight":      "",
            "anomaly_streak":  0,
            "error_reason":    None,
            "idempotency_key": None,
        }

    # -----------------------------------------------------------------------
    # DB helpers  [3.1] — short-lived session per fetch
    # -----------------------------------------------------------------------

    def _fetch_dataset(self, tenant_id: str, dataset_id: str) -> Optional[Dataset]:
        with SessionLocal() as db:
            return (
                db.query(Dataset)
                .filter(Dataset.id == dataset_id, Dataset.tenant_id == tenant_id)
                .first()
            )

    def _fetch_semantic_metric(
        self, tenant_id: str, metric_name: str
    ) -> Optional[SemanticMetric]:
        with SessionLocal() as db:
            return (
                db.query(SemanticMetric)
                .filter(
                    SemanticMetric.tenant_id   == tenant_id,
                    SemanticMetric.metric_name == metric_name,
                )
                .first()
            )

    def _fetch_active_dataset_ids(self, tenant_id: str) -> List[str]:
        with SessionLocal() as db:
            rows = (
                db.query(Dataset.id)
                .filter(Dataset.tenant_id == tenant_id, Dataset.status == "READY")
                .all()
            )
            return [str(r[0]) for r in rows]


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------

anomaly_detector = AnomalyDetector()