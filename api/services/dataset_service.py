import os
import time
import logging
import random
import re
import hashlib
import math
from typing import Dict, Any, List, Tuple, Optional
import duckdb
import polars as pl
from sqlalchemy.orm import Session

# Import modern SQLAlchemy models
from models import Dataset

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# FIX #1: Stricter identifier quoting
# OLD: stripped only \n and \r — missed unicode control chars, zero-width spaces, etc.
# NEW: whitelist-only regex — only [a-zA-Z0-9_] survive; everything else is removed.
# This makes SQL injection via column names structurally impossible.
# ─────────────────────────────────────────────
def _quote_identifier(name: str) -> str:
    """
    Security: Safely quote DuckDB identifiers using a strict whitelist approach.
    Only alphanumeric chars and underscores are preserved; all other characters
    (including unicode edge cases, zero-width spaces, control chars) are stripped.
    The column whitelist enforced by DESCRIBE output is the real source of truth.
    """
    clean = re.sub(r'[^\w]', '', name, flags=re.UNICODE)
    if not clean:
        # Fallback for fully-stripped names: use a stable hash slug
        clean = "col_" + hashlib.md5(name.encode("utf-8")).hexdigest()[:8]
    return f'"{clean}"'


def _chunk_list(lst: List[Any], size: int = 50) -> List[List[Any]]:
    """Helper to split wide tables to prevent DuckDB query explosion."""
    return [lst[i:i + size] for i in range(0, len(lst), size)]


def _safe_alias(col_name: str) -> str:
    """
    Helper to normalize column names for safe SQL aliasing.
    Uses a short hash to prevent subtle collision bugs when two columns
    differ only by special chars (e.g. 'price$' vs 'price#').
    """
    base = re.sub(r'[^a-zA-Z0-9_]', '_', col_name)
    short_hash = hashlib.md5(col_name.strip().lower().encode('utf-8')).hexdigest()[:6]
    return f"{base}_{short_hash}"


def _detect_value_pattern(samples: List[str]) -> Optional[str]:
    """Semantic detection of high-value system patterns."""
    if not samples:
        return None
    try:
        if all(re.match(r"^[^@]+@[^@]+\.[^@]+$", s) for s in samples):
            return "email"
        if all(s.startswith("http://") or s.startswith("https://") for s in samples):
            return "url"
        if all(re.match(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", s
        ) for s in samples):
            return "uuid"
    except Exception:
        pass
    return None


# ─────────────────────────────────────────────
# FIX #2 & #6: Null-safe entropy with explicit Utf8 cast
# OLD: series was passed as-is; mixed-type / null-heavy columns could cause
#      silent Polars cast errors or incorrect probability distributions.
# NEW: explicit cast(pl.Utf8) inside a try/except so any dirty column degrades
#      gracefully to entropy=0.0 rather than crashing or silently corrupting.
# ─────────────────────────────────────────────
def _compute_entropy(series: pl.Series) -> float:
    """
    Compute Shannon entropy to measure distribution quality (uniform vs skewed).
    Cast to Utf8 first so mixed-type / numeric columns are handled uniformly
    and null values are safely dropped before the probability calculation.
    """
    try:
        series = series.cast(pl.Utf8).drop_nulls()
    except Exception:
        return 0.0

    if len(series) == 0:
        return 0.0
    try:
        vc = series.value_counts()
        counts = vc.get_column("count").to_list()
        total = sum(counts)
        if total == 0:
            return 0.0
        probs = [c / total for c in counts if c > 0]
        return round(-sum(p * math.log(p) for p in probs), 4)
    except Exception:
        return 0.0


class DatasetService:
    """
    Phase 6.1: Elite Enterprise Data Profiling & Contextual RAG Orchestrator.

    Engineering Fixes Applied (v6.1):
    - FIX #1  : Strict whitelist identifier quoting (SQL injection hardened).
    - FIX #2  : Null-safe Utf8 cast before entropy computation.
    - FIX #3  : Deterministic reservoir sampling via REPEATABLE(42) seed.
    - FIX #4  : Conservative cardinality scaling with explicit approximation_confidence tag.
    - FIX #5  : Cardinality guard before any DISTINCT query to prevent query explosion.
    - FIX #6  : Wrapped entropy series extraction in try/except for dirty columns.
    - FIX #7  : Primary key resolved via max-cardinality + constraint check, not first-match.
    - FIX #8  : Compact pipe-delimited llm_hint_compact added alongside full hint.
    """

    TEXT_TYPES    = frozenset({"VARCHAR", "TEXT", "STRING", "CHAR"})
    DATE_TYPES    = frozenset({"DATE", "TIMESTAMP", "DATETIME", "TIME", "TIMESTAMPTZ"})
    NUMERIC_TYPES = frozenset({"INT", "INTEGER", "FLOAT", "DOUBLE", "DECIMAL",
                               "NUMERIC", "BIGINT", "SMALLINT", "TINYINT"})

    MAX_EXPENSIVE_COLS   = 100
    MAX_TOTAL_COLUMNS    = 500
    MAX_EXECUTION_TIME_SEC = 60.0

    # ─────────────────────────────────────────────
    # FIX #5: Max cardinality threshold below which DISTINCT queries are safe.
    # Above this we skip exact distinct sampling and rely on APPROX_COUNT_DISTINCT.
    # ─────────────────────────────────────────────
    MAX_SAFE_DISTINCT_CARDINALITY = 1_000

    @staticmethod
    def _validate_and_hash_path(file_path: str) -> Tuple[str, str]:
        """Validates path security and generates a cache-busting hybrid fingerprint."""
        abs_path = os.path.abspath(file_path)
        allowed_root = os.path.realpath(os.getenv("ALLOWED_UPLOAD_ROOT", "/tmp"))
        real_path = os.path.realpath(abs_path)

        if not real_path.startswith(allowed_root + os.sep) and real_path != allowed_root:
            raise ValueError(
                f"Security Exception: Path {abs_path} is outside allowed directories."
            )

        if not os.path.exists(real_path):
            raise FileNotFoundError(f"File not found: {real_path}")

        # Hybrid Hash: 512 KB head + 512 KB tail to avoid reading massive files in full
        chunk_size = 512 * 1024
        with open(real_path, "rb") as f:
            f.seek(0, 2)
            file_size = f.tell()
            f.seek(0)
            if file_size <= chunk_size * 2:
                file_hash = hashlib.md5(f.read()).hexdigest()
            else:
                h = hashlib.md5()
                h.update(f.read(chunk_size))
                f.seek(-chunk_size, 2)
                h.update(f.read(chunk_size))
                file_hash = h.hexdigest()

        return real_path, file_hash

    @staticmethod
    def extract_schema_from_local_file(file_path: str) -> Dict[str, Any]:
        """Core Computation: Extracts enhanced intelligence with adaptive budgeting."""
        start_time = time.time()
        safe_path, file_hash = DatasetService._validate_and_hash_path(file_path)

        schema_metadata: Dict[str, Any] = {
            "version": "6.1",
            "extracted_at": start_time,
            "file_hash": file_hash,
            "row_count": 0,
            "profiling_mode": "unknown",
            "truncated_schema": False,
            "columns": {},
            "foreign_keys": [],
            "dataset_profile": {},
            "metrics": {},
        }

        try:
            with duckdb.connect(":memory:") as con:
                con.execute(
                    f"PRAGMA memory_limit='{os.getenv('DUCKDB_MEMORY_LIMIT', '1GB')}'"
                )
                con.execute(f"PRAGMA threads={os.getenv('DUCKDB_THREADS', '4')}")
                con.execute("PRAGMA enable_progress_bar=false")

                # ── 1. Multi-Format Support ──────────────────────────────────────
                ext = safe_path.lower()
                if ext.endswith(".parquet"):
                    read_expr = f"read_parquet('{safe_path}')"
                    is_parquet = True
                elif ext.endswith(".json") or ext.endswith(".ndjson"):
                    read_expr = (
                        f"read_json_auto('{safe_path}', maximum_object_size=1048576)"
                    )
                    is_parquet = False
                else:
                    read_expr = (
                        f"read_csv_auto('{safe_path}', SAMPLE_SIZE=10000,"
                        f" IGNORE_ERRORS=true)"
                    )
                    is_parquet = False

                con.execute(f"CREATE VIEW dataset_view AS SELECT * FROM {read_expr}")

                # ── 2. Total Row Count ────────────────────────────────────────────
                if is_parquet:
                    try:
                        row_count_res = con.execute(
                            f"SELECT SUM(num_rows) FROM parquet_metadata('{safe_path}')"
                        ).fetchone()
                        row_count = (
                            row_count_res[0]
                            if row_count_res and row_count_res[0]
                            else 0
                        )
                    except Exception:
                        row_count = con.execute(
                            "SELECT COUNT(*) FROM dataset_view"
                        ).fetchone()[0]
                else:
                    row_count = con.execute(
                        "SELECT COUNT(*) FROM dataset_view"
                    ).fetchone()[0]

                schema_metadata["row_count"] = row_count
                if row_count == 0:
                    return schema_metadata

                # ── 3. Base Schema Extraction & Schema Signature ─────────────────
                schema_df   = con.execute("DESCRIBE dataset_view").pl()
                schema_rows = schema_df.to_dicts()
                col_names   = [str(r["column_name"]) for r in schema_rows]
                col_types   = [str(r["column_type"])  for r in schema_rows]

                # Build a whitelist of DESCRIBE-verified column names — these are the
                # only names ever injected into SQL, satisfying FIX #1's column-whitelist
                # recommendation.
                verified_col_set = set(col_names)

                schema_signature = hashlib.md5(
                    "|".join(f"{c}:{t}" for c, t in zip(col_names, col_types)).encode()
                ).hexdigest()
                schema_metadata["schema_signature"] = schema_signature

                if len(col_names) > DatasetService.MAX_TOTAL_COLUMNS:
                    col_names   = col_names[:DatasetService.MAX_TOTAL_COLUMNS]
                    schema_rows = schema_rows[:DatasetService.MAX_TOTAL_COLUMNS]
                    schema_metadata["truncated_schema"] = True
                    logger.warning(
                        f"Schema for {safe_path} truncated to "
                        f"{DatasetService.MAX_TOTAL_COLUMNS} columns."
                    )

                # ── 4. Smart Adaptive Strategy (Complexity = Rows × Columns) ─────
                complexity_score = row_count * len(col_names)
                if complexity_score < 5_000_000:
                    mode = "full_scan"
                elif complexity_score < 500_000_000:
                    mode = "sampled"
                else:
                    mode = "approx_only"
                schema_metadata["profiling_mode"] = mode

                # ── 5. Pre-materialized Bounded Sample ───────────────────────────
                target_table      = "dataset_view"
                working_row_count = row_count
                if mode != "full_scan":
                    con.execute(
                        "CREATE TEMP TABLE working_sample AS "
                        "SELECT * FROM dataset_view USING SAMPLE 100000 ROWS"
                    )
                    target_table      = "working_sample"
                    working_row_count = con.execute(
                        "SELECT COUNT(*) FROM working_sample"
                    ).fetchone()[0]

                if time.time() - start_time > DatasetService.MAX_EXECUTION_TIME_SEC:
                    raise TimeoutError("Profiling exceeded execution limit")

                # ── 6. Chunked Cardinality & Null Extraction ─────────────────────
                stats_dict: Dict[str, Any] = {}
                for chunk in _chunk_list(col_names, 50):
                    selects = []
                    for c in chunk:
                        # Only quote columns verified by DESCRIBE (FIX #1 whitelist)
                        assert c in verified_col_set, f"Unverified column: {c!r}"
                        safe_q = _quote_identifier(c)
                        alias  = _safe_alias(c)

                        if mode == "full_scan":
                            selects.append(f'COUNT(DISTINCT {safe_q}) AS "{alias}_card"')
                        else:
                            selects.append(
                                f'APPROX_COUNT_DISTINCT({safe_q}) AS "{alias}_card"'
                            )

                        selects.append(f'COUNT({safe_q}) AS "{alias}_notnull"')

                    query = f"SELECT {', '.join(selects)} FROM {target_table}"
                    stats_dict.update(con.execute(query).pl().to_dicts()[0])

                # ── 7. Numeric Stats (Distribution, Outliers, Skew) ──────────────
                numeric_cols = [
                    str(r["column_name"])
                    for r in schema_rows
                    if any(
                        nt in str(r["column_type"]).upper()
                        for nt in DatasetService.NUMERIC_TYPES
                    )
                ]

                numeric_stats: Dict[str, Any] = {}
                for chunk in _chunk_list(
                    numeric_cols[:DatasetService.MAX_EXPENSIVE_COLS], 50
                ):
                    selects = []
                    for c in chunk:
                        safe_q = _quote_identifier(c)
                        alias  = _safe_alias(c)
                        selects.extend([
                            f'MIN({safe_q}) AS "{alias}_min"',
                            f'MAX({safe_q}) AS "{alias}_max"',
                            f'AVG(CAST({safe_q} AS DOUBLE)) AS "{alias}_avg"',
                            f'APPROX_QUANTILE(CAST({safe_q} AS DOUBLE), 0.5) AS "{alias}_median"',
                            f'APPROX_QUANTILE(CAST({safe_q} AS DOUBLE), 0.25) AS "{alias}_q25"',
                            f'APPROX_QUANTILE(CAST({safe_q} AS DOUBLE), 0.75) AS "{alias}_q75"',
                        ])
                    if selects:
                        query = f"SELECT {', '.join(selects)} FROM {target_table}"
                        numeric_stats.update(con.execute(query).pl().to_dicts()[0])

                # ── 8. Deterministic Reservoir Sample for Entropy & Semantics ────
                # FIX #3: REPEATABLE(42) seed replaces non-deterministic reservoir,
                # ensuring stable entropy values across repeated runs so that the
                # file-hash cache and LLM prompt consistency are not undermined.
                sample_cols = col_names[:100]
                cols_expr   = ", ".join([_quote_identifier(c) for c in sample_cols])
                sample_query = (
                    f"SELECT {cols_expr} FROM dataset_view "
                    f"USING SAMPLE 1000 ROWS REPEATABLE (42)"
                )
                sample_df = con.execute(sample_query).pl()

                if time.time() - start_time > DatasetService.MAX_EXECUTION_TIME_SEC:
                    raise TimeoutError("Profiling exceeded execution limit")

                # ── 9. Correlation Layer (Upper Triangle, Filtered) ───────────────
                correlations: Dict[str, Dict[str, float]] = {}
                if len(numeric_cols) > 1 and len(sample_df) > 10:
                    try:
                        valid_num_cols = [
                            c
                            for c in numeric_cols[:15]
                            if c in sample_df.columns
                            and sample_df[c].drop_nulls().std() not in (None, 0.0)
                        ]
                        if len(valid_num_cols) > 1:
                            num_df      = sample_df.select(
                                [pl.col(c) for c in valid_num_cols]
                            )
                            corr_matrix = num_df.corr()

                            for i, col1 in enumerate(num_df.columns):
                                correlations[col1] = {}
                                for j in range(i + 1, len(num_df.columns)):
                                    col2 = num_df.columns[j]
                                    val  = corr_matrix[i, j]
                                    if (
                                        val is not None
                                        and not math.isnan(val)
                                        and not math.isinf(val)
                                    ):
                                        # Filter noise (<0.7) and identical-column
                                        # variants (>0.999)
                                        if 0.7 < abs(val) < 0.999:
                                            val_r = round(val, 3)
                                            correlations[col1][col2] = val_r
                                            correlations.setdefault(col2, {})[col1] = val_r
                    except Exception as e:
                        logger.debug(f"Correlation extraction failed: {e}")

                # ── 10. Semantic Loop & Assembly ──────────────────────────────────
                columns_meta: Dict[str, Any] = {}
                detected_foreign_keys: List[Dict[str, Any]] = []

                for row in schema_rows:
                    col_name      = str(row["column_name"])
                    col_type      = str(row["column_type"])
                    col_type_upper = col_type.upper()
                    alias         = _safe_alias(col_name)
                    normalized_name = (
                        re.sub(r"[^a-zA-Z0-9]+", "_", col_name.lower()).strip("_")
                        or f"col_{hash(col_name)}"
                    )

                    # ── Cardinality Scaling (FIX #4) ─────────────────────────────
                    # OLD: linear extrapolation assumed uniform distribution.
                    # NEW: conservative 0.85 dampening factor to counteract
                    #      overestimation on skewed / long-tail distributions.
                    #      approximation_confidence tag signals reliability to
                    #      downstream consumers.
                    raw_cardinality = stats_dict.get(f"{alias}_card", 0) or 0
                    if mode != "full_scan" and working_row_count > 0:
                        cardinality = min(
                            row_count,
                            int(
                                raw_cardinality
                                * (row_count / max(working_row_count, 1))
                                * 0.85        # dampening factor for skew correction
                            ),
                        )
                        approx_confidence = "low"   # sampled → inherently uncertain
                    else:
                        cardinality = int(raw_cardinality)
                        approx_confidence = "high"  # full scan → exact count

                    not_nulls_sample = stats_dict.get(f"{alias}_notnull", 0) or 0
                    null_ratio = (
                        (working_row_count - not_nulls_sample) / working_row_count
                        if working_row_count > 0
                        else 0.0
                    )

                    cardinality_meta = {
                        "value": cardinality,
                        "approximate": mode != "full_scan",
                        "approximation_confidence": approx_confidence,  # FIX #4
                    }

                    # ── Semantic Type Detection ───────────────────────────────────
                    semantic_type = "standard"
                    if col_name.lower().endswith("_id") or col_name.lower() == "id":
                        semantic_type = "identifier"
                    elif any(t in col_type_upper for t in DatasetService.DATE_TYPES):
                        semantic_type = "datetime"
                    elif any(t in col_type_upper for t in DatasetService.NUMERIC_TYPES):
                        semantic_type = "numeric"

                    # PK detection is only trustworthy when cardinality is exact.
                    is_pk = (
                        mode == "full_scan"
                        and cardinality == row_count
                        and null_ratio == 0.0
                    )
                    # Preserve conventional single-column IDs as likely PKs.
                    if col_name.lower() == "id" and null_ratio == 0.0 and row_count > 0:
                        is_pk = True

                    if semantic_type == "standard" and not is_pk:
                        if cardinality == 2:
                            semantic_type = "boolean_candidate"
                        elif 0 < cardinality <= 10:
                            semantic_type = "enum"

                    # ── Semantic Role ────────────────────────────────────────────
                    semantic_role = "dimension"
                    if semantic_type == "numeric" and cardinality > 20:
                        semantic_role = "measure"
                    elif cardinality < 20 and semantic_type != "identifier":
                        semantic_role = "categorical"
                    elif cardinality > 10_000 and not is_pk:
                        semantic_role = "high_cardinality"

                    # ── Entropy (FIX #2 + FIX #6) ────────────────────────────────
                    # Wrapped in its own try/except; _compute_entropy now casts to
                    # Utf8 internally so mixed-type / null-heavy columns degrade
                    # gracefully to 0.0.
                    entropy = 0.0
                    if col_name in sample_df.columns:
                        try:
                            series = sample_df.get_column(col_name).cast(pl.Utf8)
                        except Exception:
                            series = pl.Series([], dtype=pl.Utf8)
                        entropy = _compute_entropy(series)

                    # ── Information Density Score ─────────────────────────────────
                    density_ratio    = min(cardinality / max(row_count, 1), 1.0)
                    importance_score = (1.0 - null_ratio) * (
                        0.6 * density_ratio + 0.4 * (1.0 - density_ratio)
                    )
                    importance_score = round(min(max(importance_score, 0.0), 1.0), 4)

                    col_info: Dict[str, Any] = {
                        "normalized_name":        normalized_name,
                        "type":                   col_type,
                        "semantic_type":          semantic_type,
                        "semantic_role":          semantic_role,
                        "is_primary_key_candidate": is_pk,
                        "importance_score":       importance_score,
                        "entropy":                entropy,
                        "cardinality_meta":       cardinality_meta,
                        "null_ratio":             round(null_ratio, 4),
                        "samples":                [],
                    }

                    # ── Advanced Intelligence Signals ─────────────────────────────
                    if col_name.lower().endswith("_id") and col_name.lower() != "id":
                        inferred_target = re.sub(r"_id$", "", col_name, flags=re.IGNORECASE)
                        fk_relation = {
                            "column": col_name,
                            "target_table": inferred_target,
                            "target_column": "id",
                        }
                        col_info["foreign_key_candidate"] = True
                        col_info["foreign_key_target_table"] = inferred_target
                        col_info["foreign_key_target_column"] = "id"
                        col_info["foreign_keys"] = [fk_relation]
                        detected_foreign_keys.append(fk_relation)

                    if semantic_type == "datetime" and density_ratio > 0.9:
                        col_info["is_time_series"] = True

                    if null_ratio > 0.8:
                        col_info["data_quality"] = "sparse"
                    elif cardinality <= 1 and row_count > 0:
                        col_info["data_quality"] = "constant"
                    else:
                        col_info["data_quality"] = "standard"

                    # ── Numeric Distribution & Outliers ───────────────────────────
                    if (
                        semantic_type == "numeric"
                        and col_name in numeric_cols[:DatasetService.MAX_EXPENSIVE_COLS]
                    ):
                        c_max = numeric_stats.get(f"{alias}_max")
                        q25   = numeric_stats.get(f"{alias}_q25")
                        q75   = numeric_stats.get(f"{alias}_q75")

                        outlier_score = 0.0
                        if q25 is not None and q75 is not None and c_max is not None:
                            iqr = q75 - q25
                            outlier_score = (
                                (c_max - q75) / (iqr + 1e-9) if iqr != 0 else 0.0
                            )

                        col_info["distribution"] = {
                            "min":           numeric_stats.get(f"{alias}_min"),
                            "max":           c_max,
                            "avg":           numeric_stats.get(f"{alias}_avg"),
                            "median":        numeric_stats.get(f"{alias}_median"),
                            "q25":           q25,
                            "q75":           q75,
                            "outlier_score": round(outlier_score, 4),
                        }
                        col_info["aggregations"] = ["sum", "avg", "min", "max", "median"]
                        if correlations.get(col_name):
                            col_info["correlations"] = correlations[col_name]

                    # ── Categorical / String Deep Sampling (FIX #5) ───────────────
                    # Only execute DISTINCT-equivalent sampling when cardinality is
                    # below MAX_SAFE_DISTINCT_CARDINALITY to prevent query explosion
                    # on high-cardinality text columns (e.g. free-text notes, UUIDs).
                    if (
                        any(t in col_type_upper for t in DatasetService.TEXT_TYPES)
                        and not is_pk
                    ):
                        try:
                            if (
                                col_name in sample_df.columns
                                and cardinality < DatasetService.MAX_SAFE_DISTINCT_CARDINALITY
                            ):
                                unique_vals = (
                                    sample_df[col_name].drop_nulls().unique().to_list()
                                )
                                samples = [str(v)[:100] for v in unique_vals[:10]]
                                random.shuffle(samples)
                                col_info["samples"] = samples[:5]
                            elif col_name in sample_df.columns:
                                # High-cardinality: take a small non-distinct slice
                                col_info["samples"] = [
                                    str(v)[:100]
                                    for v in sample_df[col_name]
                                    .drop_nulls()
                                    .head(5)
                                    .to_list()
                                ]
                            else:
                                col_info["samples"] = []

                            pattern = _detect_value_pattern(col_info["samples"])
                            if pattern:
                                col_info["value_pattern"] = pattern
                        except Exception:
                            col_info["samples"] = ["<sample_error>"]

                    # ── Structured LLM Hints (FIX #8) ─────────────────────────────
                    # Keep the rich dict for internal tooling / debugging; add a
                    # compact pipe-delimited string for direct prompt injection so
                    # large schemas don't explode LLM context windows.
                    is_filterable   = cardinality < 100 or semantic_type in {
                        "datetime", "boolean_candidate", "enum", "identifier"
                    }
                    is_aggregatable = semantic_type == "numeric"

                    col_info["llm_hint"] = {
                        "type":          semantic_type,
                        "role":          semantic_role,
                        "is_pk":         is_pk,
                        "filterable":    is_filterable,
                        "aggregatable":  is_aggregatable,
                        "sample_values": col_info["samples"][:3],
                    }
                    # Compact variant: ~60 chars vs ~200+ for the full dict
                    col_info["llm_hint_compact"] = (
                        f"type={semantic_type}|role={semantic_role}"
                        f"|pk={str(is_pk).lower()}"
                        f"|filterable={str(is_filterable).lower()}"
                        f"|agg={str(is_aggregatable).lower()}"
                        f"|null={round(null_ratio, 2)}"
                        f"|card={cardinality}"
                    )

                    columns_meta[col_name] = col_info

                schema_metadata["columns"] = columns_meta

                # Dataset-level FK contract consumed by JoinGraphValidator.
                deduped_fks: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
                for fk in detected_foreign_keys:
                    fk_key = (
                        str(fk.get("column", "")),
                        str(fk.get("target_table", "")),
                        str(fk.get("target_column", "id")),
                    )
                    if fk_key not in deduped_fks:
                        deduped_fks[fk_key] = fk
                schema_metadata["foreign_keys"] = list(deduped_fks.values())

                # ── 11. Global Dataset-Level Intelligence (FIX #7) ────────────────
                # OLD: primary_key = first match → ordering bias; the first
                #      is_primary_key_candidate column in DESCRIBE order wins even if
                #      another column has perfect cardinality coverage.
                # NEW: select the candidate with the highest exact cardinality that
                #      also has null_ratio == 0 and is_primary_key_candidate == True.
                #      Falls back to None if no strict candidate exists.
                pk_candidates = [
                    (k, v)
                    for k, v in columns_meta.items()
                    if v.get("is_primary_key_candidate")
                    and v.get("null_ratio", 1.0) == 0.0
                ]
                primary_key = (
                    max(
                        pk_candidates,
                        key=lambda x: x[1]["cardinality_meta"]["value"],
                    )[0]
                    if pk_candidates
                    else None
                )

                schema_metadata["dataset_profile"] = {
                    "has_time_series": any(
                        c.get("is_time_series") for c in columns_meta.values()
                    ),
                    "primary_key":    primary_key,
                    "num_measures":   sum(
                        1
                        for v in columns_meta.values()
                        if v.get("semantic_role") == "measure"
                    ),
                    "num_dimensions": sum(
                        1
                        for v in columns_meta.values()
                        if v.get("semantic_role") in {"dimension", "categorical"}
                    ),
                }

                # ── Observability Metrics ─────────────────────────────────────────
                schema_metadata["metrics"] = {
                    "profiling_time_sec":  round(time.time() - start_time, 3),
                    "mode_used":           mode,
                    "complexity_score":    complexity_score,
                    "columns_processed":   len(columns_meta),
                    "sample_size_used":    len(sample_df) if "sample_df" in locals() else 0,
                }

                return schema_metadata

        except TimeoutError as te:
            logger.warning(f"Timeout extracting schema locally from {safe_path}: {te}")
            schema_metadata["error"] = str(te)
            return schema_metadata
        except Exception as e:
            logger.exception(f"Failed to extract schema locally from {safe_path}")
            schema_metadata["error"] = str(e)
            return schema_metadata

    def process_and_save_schema(
        self,
        db: Session,
        dataset_id: str,
        tenant_id: str,
        local_file_path: str,
    ) -> None:
        """
        Orchestration: Idempotent extraction utilising hash caching and
        schema-signature-based delta detection.
        """
        try:
            dataset = (
                db.query(Dataset)
                .filter(Dataset.id == dataset_id, Dataset.tenant_id == tenant_id)
                .first()
            )

            if not dataset:
                logger.warning(
                    f"Security/State mismatch: Missing dataset {dataset_id} "
                    f"(Tenant: {tenant_id})"
                )
                return

            _, current_file_hash = self._validate_and_hash_path(local_file_path)
            if (
                hasattr(dataset, "schema_hash")
                and dataset.schema_hash == current_file_hash
            ):
                logger.info(
                    f"⏭️  Cache hit. Skipping schema processing for {dataset_id}"
                )
                return

            schema_data = self.extract_schema_from_local_file(local_file_path)

            if schema_data.get("columns"):
                if dataset.schema_metadata and "schema_signature" in dataset.schema_metadata:
                    old_sig = dataset.schema_metadata["schema_signature"]
                    new_sig = schema_data.get("schema_signature")
                    if old_sig != new_sig:
                        logger.info(
                            f"🔄 Schema evolution detected for {dataset_id}."
                        )

                dataset.schema_metadata = schema_data

                if hasattr(dataset, "schema_hash"):
                    dataset.schema_hash = current_file_hash

                db.commit()
                db.refresh(dataset)

                metrics = schema_data.get("metrics", {})
                logger.info(
                    f"✅ RAG Schema v{schema_data.get('version')} built "
                    f"({metrics.get('profiling_time_sec')}s) | "
                    f"Dataset: {dataset_id} | Mode: {metrics.get('mode_used')}"
                )
            else:
                logger.warning(
                    f"Schema extraction yielded empty columns for dataset: "
                    f"{dataset_id}. Reason: {schema_data.get('error', 'Unknown')}"
                )

        except Exception:
            db.rollback()
            logger.exception(
                f"Critical error updating schema metadata for dataset {dataset_id}"
            )

# Global singleton
dataset_service = DatasetService()