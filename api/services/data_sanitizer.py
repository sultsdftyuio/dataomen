import os
import time
import logging
import hmac
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any, Literal, Callable, Set, Optional, Mapping
from collections import deque

import polars as pl
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Precompiled regex patterns to prevent Polars expression recompilation overhead
NUMERIC_CLEANUP_REGEX = r"[^\d,.\-]"
NUMERIC_VALIDATION_REGEX = r"^-?\d+([.,]\d+)?$"
WHITESPACE_REGEX = r"\s+"


class ColumnSchema(BaseModel):
    """Explicit schema contract for predictable validation."""
    name: str
    type: Literal["string", "int", "float", "bool", "date", "datetime", "currency"]
    nullable: bool = True
    pii: bool = False


class DataSanitizer:
    def __init__(
        self, 
        tenant_id: str, 
        version: str = "v1", 
        mode: Literal[
            "fast_analytics_hash",
            "secure_identity_hash",
            "fast_session_hash",
            "pseudonymization_fast",
            "cryptographic_hmac",
        ] = "fast_analytics_hash",
        strict_mode: bool = False
    ):
        self.tenant_id = tenant_id
        self.version = version
        self.mode = self._normalize_mode(mode)
        
        # Universal Strict Mode Policy: Determines fail-fast vs. safe-coalesce globally
        self.strict_mode = strict_mode
        
        # Explicit evaluation of streaming capabilities. 
        # Streaming degrades if UDFs (map_batches) or complex stateful operations are injected.
        self.streaming_safe = (self.mode == "fast_analytics_hash")
        
        # Explicit deterministic ordering of system columns
        self._system_columns = ["_tenant_id", "_ingested_at", "_batch_id", "_source_file"]
        
        # Internal state for exact observability lineage
        self._active_pii_columns: List[str] = []
        self._schema_fingerprint: Optional[str] = None
        
        # Unified, fully-initialized metrics structure for safe exporter scraping
        self.metrics = {
            "pii_columns_configured": 0,
            "null_injections": 0,
            "columns_casted": 0,
            "stage_times_ms": {},
            "execution": {
                "rows_input": 0,
                "rows_output": 0,
                "rows_dropped": 0,
                "pii_cells_transformed": 0,
                "total_execution_ms": 0.0
            }
        }
        
        # Bounded audit buffer to prevent memory leaks in long-running services
        self.audit_log = deque(maxlen=10_000)

        master_key = os.environ.get("DATA_VAULT_MASTER_KEY")
        if not master_key:
            raise EnvironmentError(f"[{self.tenant_id}] CRITICAL: DATA_VAULT_MASTER_KEY not set.")

        # Hardened key derivation (PBKDF2)
        self._tenant_key = hashlib.pbkdf2_hmac(
            'sha256',
            master_key.encode("utf-8"),
            f"{tenant_id}:{version}".encode("utf-8"),
            100000
        )

    def _normalize_mode(self, mode: str) -> str:
        """Normalizes mode aliases without breaking legacy callers."""
        aliases = {
            "fast_analytics_hash": "fast_analytics_hash",
            "fast_session_hash": "fast_analytics_hash",
            "pseudonymization_fast": "fast_analytics_hash",
            "secure_identity_hash": "secure_identity_hash",
            "cryptographic_hmac": "secure_identity_hash",
        }
        normalized_mode = aliases.get(mode)
        if not normalized_mode:
            allowed_modes = ", ".join(sorted(aliases.keys()))
            raise ValueError(f"[{self.tenant_id}] Unsupported mode '{mode}'. Allowed modes: {allowed_modes}")

        if mode != normalized_mode:
            logger.info(
                "[%s] DataSanitizer mode alias '%s' normalized to '%s'.",
                self.tenant_id,
                mode,
                normalized_mode,
            )

        if normalized_mode == "fast_analytics_hash":
            logger.warning(
                "[%s] Mode 'fast_analytics_hash' is analytics-oriented pseudonymization "
                "and is not guaranteed stable across Polars versions or external systems.",
                self.tenant_id,
            )

        return normalized_mode

    # ---------------------------------------------------------------------
    # PII NORMALIZATION & SECURE HASHING
    # ---------------------------------------------------------------------

    def _pii_hash_batch(self, s: pl.Series) -> pl.Series:
        """Slow path: Python UDF for strict cryptographic compliance."""
        unique_map = {
            val: hmac.new(self._tenant_key, val.encode(), hashlib.sha256).hexdigest()
            for val in s.unique().drop_nulls()
        }
        return s.replace(unique_map, default=s)

    def _sanitize_pii_stage(self, expected_schema: List[ColumnSchema], existing_cols: Set[str]) -> Callable[[pl.LazyFrame], pl.LazyFrame]:
        """Stage 1: PII Isolation & Hashing. Uses externally frozen schema snapshot."""
        def _stage(lf: pl.LazyFrame) -> pl.LazyFrame:
            stage_start = time.time()
            
            # Identify valid PII targets based on the frozen ingestion boundary
            self._active_pii_columns = [col.name for col in expected_schema if col.pii and col.name in existing_cols]
            self.metrics["pii_columns_configured"] = len(self._active_pii_columns)
            
            if not self._active_pii_columns:
                return lf

            exprs = []
            for col in self._active_pii_columns:
                # Security Hardening: Strict normalization to avoid hash gaps
                base_expr = (
                    pl.col(col).cast(pl.String, strict=self.strict_mode)
                    .str.strip_chars()
                    .str.to_lowercase()
                    .str.replace_all(WHITESPACE_REGEX, " ")
                )

                if self.mode == "fast_analytics_hash":
                    seed = int.from_bytes(self._tenant_key[:8], "little")
                    expr = pl.when(base_expr.is_null()).then(
                        pl.lit(None, dtype=pl.String)
                    ).otherwise(
                        base_expr.hash(seed=seed).cast(pl.String, strict=self.strict_mode)
                    ).alias(col)
                else:
                    expr = base_expr.map_batches(self._pii_hash_batch, return_dtype=pl.String).alias(col)
                    
                exprs.append(expr)
            
            self.audit_log.append({
                "stage": "sanitize_pii",
                "mode": self.mode,
                "columns_hashed": self._active_pii_columns,
                "timestamp_utc": datetime.now(timezone.utc).isoformat()
            })

            self.metrics["stage_times_ms"]["sanitize_pii"] = round((time.time() - stage_start) * 1000, 2)
            return lf.with_columns(exprs)
        return _stage

    def sanitize_pii(
        self,
        expected_schema: Any,
        existing_cols: Optional[Set[str]] = None,
        pii_columns: Optional[List[str]] = None,
    ) -> Any:
        """
        Dual-mode API for backward compatibility.

        New API:
            sanitize_pii(expected_schema, existing_cols) -> LazyFrame stage callable

        Legacy API:
            sanitize_pii(df, pii_columns=[...]) -> DataFrame
        """
        if isinstance(expected_schema, pl.DataFrame):
            df = expected_schema
            pii_set = set(pii_columns or [])
            legacy_schema = [
                ColumnSchema(name=col, type="string", nullable=True, pii=(col in pii_set))
                for col in df.columns
            ]
            stage = self._sanitize_pii_stage(legacy_schema, set(df.columns))
            return stage(df.lazy()).collect(streaming=self.streaming_safe)

        if existing_cols is None:
            raise ValueError(f"[{self.tenant_id}] sanitize_pii requires existing_cols with schema mode.")

        return self._sanitize_pii_stage(expected_schema, existing_cols)

    # ---------------------------------------------------------------------
    # DETERMINISTIC NUMERIC CASCADES
    # ---------------------------------------------------------------------

    def _safe_numeric_cast(self, col: str, target_type: pl.DataType) -> pl.Expr:
        """Stage 2 helper: Single-pass numeric normalization with consistent global strict semantics."""
        normalized_str = (
            pl.col(col).cast(pl.String, strict=self.strict_mode)
            .str.replace_all(NUMERIC_CLEANUP_REGEX, "") 
            # Compatibility: connectors often emit grouped numerics like "$2,500.00".
            .str.replace_all(",", "")
        )
        
        if self.strict_mode:
            # True Strict Mode: Bypass coalesce guardrails entirely. Malformed data WILL crash the pipeline.
            return normalized_str.cast(target_type, strict=True).alias(col)

        # Safe-Coerce Mode: Coalesce invalid to Null predictably using precompiled regex mapping
        is_valid_numeric = normalized_str.str.contains(NUMERIC_VALIDATION_REGEX)
        return pl.when(is_valid_numeric).then(
            normalized_str.cast(target_type, strict=False)
        ).otherwise(
            pl.lit(None).cast(target_type)
        ).alias(col)

    # ---------------------------------------------------------------------
    # SCHEMA ENFORCEMENT & SYSTEM INJECTION
    # ---------------------------------------------------------------------

    def enforce_schema(self, expected_schema: List[ColumnSchema], existing_cols: Set[str]) -> Callable[[pl.LazyFrame], pl.LazyFrame]:
        """Stage 3 & 4: Contract enforcement and system column injection."""
        def _stage(lf: pl.LazyFrame) -> pl.LazyFrame:
            stage_start = time.time()

            final_exprs = []

            # 1. System Columns First (Deterministic Alignment)
            for sys_col in self._system_columns:
                if sys_col in existing_cols:
                    final_exprs.append(pl.col(sys_col))

            # 2. Enforce Expected Schema via Projection
            for col_schema in expected_schema:
                col = col_schema.name
                t_type = self._map_to_polars_type(col_schema.type)
                
                if col not in existing_cols:
                    # Explicit injection marker
                    logger.warning(f"[{self.tenant_id}] Missing column injected: {col}")
                    self.metrics["null_injections"] += 1
                    final_exprs.append(pl.lit(None).cast(t_type).alias(col))
                else:
                    self.metrics["columns_casted"] += 1
                    if t_type.is_numeric():
                        final_exprs.append(self._safe_numeric_cast(col, t_type))
                    else:
                        final_exprs.append(pl.col(col).cast(t_type, strict=self.strict_mode).alias(col))

            self.audit_log.append({
                "stage": "enforce_schema",
                "columns_retained": [c.name for c in expected_schema],
                "timestamp_utc": datetime.now(timezone.utc).isoformat()
            })

            self.metrics["stage_times_ms"]["enforce_schema"] = round((time.time() - stage_start) * 1000, 2)
            return lf.select(final_exprs)
        return _stage

    def _map_to_polars_type(self, semantic_type: str) -> pl.DataType:
        mapping = {
            "string": pl.String, 
            "int": pl.Int64, 
            "float": pl.Float64,
            "bool": pl.Boolean, 
            "date": pl.Date, 
            "datetime": pl.Datetime("us", "UTC"),
            "currency": pl.Decimal(precision=18, scale=2)
        }
        return mapping.get(semantic_type.lower(), pl.String)

    def _normalize_semantic_type(self, semantic_type: str) -> str:
        """Maps legacy/connector schema aliases into ColumnSchema semantic types."""
        value = str(semantic_type or "").strip().lower()
        aliases = {
            "string": "string",
            "varchar": "string",
            "text": "string",
            "int": "int",
            "integer": "int",
            "bigint": "int",
            "smallint": "int",
            "float": "float",
            "double": "float",
            "double precision": "float",
            "real": "float",
            "numeric": "float",
            "decimal": "float",
            "bool": "bool",
            "boolean": "bool",
            "date": "date",
            "datetime": "datetime",
            "timestamp": "datetime",
            "currency": "currency",
        }
        return aliases.get(value, "string")

    def enforce_duckdb_schema(self, df: pl.DataFrame, expected_schema: Dict[str, str]) -> pl.DataFrame:
        """Legacy compatibility API: enforce schema on an eager DataFrame."""
        schema_contract = [
            ColumnSchema(
                name=col_name,
                type=self._normalize_semantic_type(col_type),
                nullable=True,
                pii=False,
            )
            for col_name, col_type in expected_schema.items()
        ]
        stage = self.enforce_schema(schema_contract, set(df.columns))
        return stage(df.lazy()).collect(streaming=self.streaming_safe)

    def _schema_column_names(self, schema: Mapping[str, Any]) -> List[str]:
        """Reads schema names from either Polars Schema or mapping snapshots."""
        if hasattr(schema, "names"):
            return list(schema.names())
        return list(schema.keys())

    def _compute_schema_fingerprint(self, ingestion_schema: Mapping[str, Any]) -> str:
        """Deterministic typed schema fingerprint (name + dtype + order)."""
        entries = [
            f"{column}:{str(ingestion_schema[column])}"
            for column in self._schema_column_names(ingestion_schema)
        ]
        fingerprint_input = "|".join(entries)
        return hashlib.sha256(fingerprint_input.encode("utf-8")).hexdigest()

    # ---------------------------------------------------------------------
    # PIPELINE ORCHESTRATION & ZERO-TRUST BOUNDARIES
    # ---------------------------------------------------------------------

    def validate_contract(self, existing_cols: Set[str], expected_schema: List[ColumnSchema]) -> None:
        """Pre-flight check against the frozen schema footprint."""
        expected_names = {col.name for col in expected_schema}
        
        missing_required = [
            col.name for col in expected_schema 
            if not col.nullable and col.name not in existing_cols
        ]
        if missing_required:
            raise ValueError(f"[{self.tenant_id}] Contract violation. Missing required columns: {missing_required}")

        if self.strict_mode:
            unexpected_cols = existing_cols - expected_names - set(self._system_columns)
            if unexpected_cols:
                raise ValueError(f"[{self.tenant_id}] Strict mode violation. Unexpected columns present: {unexpected_cols}")

    def build_pipeline(
        self,
        lf: pl.LazyFrame,
        expected_schema: List[ColumnSchema],
        ingestion_schema: Optional[Mapping[str, Any]] = None,
    ) -> pl.LazyFrame:
        """
        Composable DAG Construction using a Zero-Trust Schema Boundary.
        Prefer passing a pre-frozen ingestion_schema from the ingestion boundary to
        preserve lazy DAG guarantees. Internal fallback is retained for compatibility.
        """
        # Zero-Trust Boundary: Freeze the ingestion schema state once.
        if ingestion_schema is None:
            logger.warning(
                "[%s] build_pipeline called without ingestion_schema snapshot; "
                "falling back to lf.collect_schema(), which may partially evaluate in some Polars versions.",
                self.tenant_id,
            )
            ingestion_schema = lf.collect_schema()

        existing_cols = set(self._schema_column_names(ingestion_schema))
        
        # Compute deterministic typed schema fingerprint for auditability
        self._schema_fingerprint = self._compute_schema_fingerprint(ingestion_schema)
        logger.info(f"[{self.tenant_id}] Schema boundary locked. Fingerprint: {self._schema_fingerprint}")
        
        self.validate_contract(existing_cols, expected_schema)
        
        return (
            lf
            .pipe(self.sanitize_pii(expected_schema, existing_cols))
            .pipe(self.enforce_schema(expected_schema, existing_cols))
        )

    def process_batch(
        self,
        df: pl.DataFrame,
        pii_columns: List[str],
        expected_schema: Dict[str, str],
    ) -> pl.DataFrame:
        """Legacy compatibility API used by SyncEngine."""
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
        pipeline = self.build_pipeline(df.lazy(), schema_contract, ingestion_schema=df.schema)
        return self.execute(pipeline, initial_row_count=df.height, streaming=self.streaming_safe)

    def execute(self, lf: pl.LazyFrame, initial_row_count: int, streaming: bool = True) -> pl.DataFrame:
        """
        Executes the pipeline and records exact observability lineage.
        """
        if not self.streaming_safe and streaming:
            logger.warning(f"[{self.tenant_id}] Streaming disabled: Current mode '{self.mode}' breaks Polars streaming guarantees.")
            streaming = False
            
        execution_start = time.time()
        df = lf.collect(streaming=streaming)
        
        # Exact Observability Lineage Extraction
        final_height = df.height
        
        # Metric semantics: transformed cells attempted = output rows x active PII columns.
        exact_cells_transformed = 0
        if self._active_pii_columns and final_height > 0:
            exact_cells_transformed = final_height * len(self._active_pii_columns)

        # Populate fully initialized metrics schema
        self.metrics["execution"]["rows_input"] = initial_row_count
        self.metrics["execution"]["rows_output"] = final_height
        self.metrics["execution"]["rows_dropped"] = initial_row_count - final_height
        self.metrics["execution"]["pii_cells_transformed"] = exact_cells_transformed
        self.metrics["execution"]["total_execution_ms"] = round((time.time() - execution_start) * 1000, 2)
        
        logger.info(f"[{self.tenant_id}] Execution complete. Fingerprint: {self._schema_fingerprint}. Metrics: {self.metrics['execution']}")
        
        return df

    def export_metrics(self) -> Dict[str, Any]:
        """OpenTelemetry-friendly metric payload exporter."""
        return {
            "tenant_id": self.tenant_id,
            "version": self.version,
            "schema_fingerprint": self._schema_fingerprint,
            "mode": self.mode,
            "strict_mode": self.strict_mode,
            "metrics": self.metrics,
            "timestamp_utc": datetime.now(timezone.utc).isoformat()
        }