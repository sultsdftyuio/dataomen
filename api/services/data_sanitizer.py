import os
import logging
import hmac
import hashlib
from typing import List, Dict, Any, Optional, Set

import polars as pl

logger = logging.getLogger(__name__)

class DataSanitizer:
    def __init__(self, tenant_id: str, version: str = "v1"):
        self.tenant_id = tenant_id
        self.version = version
        self._system_columns = {"_tenant_id", "_ingested_at", "_batch_id", "_source_file"}

        master_key = os.environ.get("DATA_VAULT_MASTER_KEY")
        if not master_key:
            raise EnvironmentError(f"[{self.tenant_id}] CRITICAL: DATA_VAULT_MASTER_KEY not set.")

        self._tenant_key = hmac.new(
            master_key.encode("utf-8"),
            f"{tenant_id}:{version}".encode("utf-8"),
            hashlib.sha256,
        ).digest()

    # ---------------------------------------------------------------------
    # SECURE BATCH HASHING (Vectorized-ish)
    # ---------------------------------------------------------------------

    def _pii_hash_batch(self, s: pl.Series) -> pl.Series:
        """
        Processes a Series batch. Still Python-bound, but map_batches 
        is more stable for the execution graph than map_elements.
        """
        # Optimized: Only compute hashes for unique non-null values in this batch
        unique_map = {
            val: hmac.new(self._tenant_key, val.encode(), hashlib.sha256).hexdigest()
            for val in s.unique().drop_nulls()
        }
        return s.replace(unique_map, default=None)

    def sanitize_pii(self, lf: pl.LazyFrame, pii_columns: List[str], existing_cols: Set[str]) -> pl.LazyFrame:
        valid_pii = [c for c in pii_columns if c in existing_cols]
        if not valid_pii:
            return lf

        return lf.with_columns([
            pl.col(col).cast(pl.String).str.strip_chars().str.to_lowercase()
            .map_batches(self._pii_hash_batch, return_dtype=pl.String)
            .alias(col)
            for col in valid_pii
        ])

    # ---------------------------------------------------------------------
    # DETERMINISTIC NUMERIC CASCADES
    # ---------------------------------------------------------------------

    def _safe_numeric_cast(self, col: str, target_type: pl.DataType) -> pl.Expr:
        """
        Fixes Issue 1 & 4: Uses escaped regex and strict validation logic.
        """
        # Cleanup: Remove whitespace and currency symbols
        base = pl.col(col).cast(pl.String).str.replace_all(r"[\s\$€£]", "")

        # US Parse: Remove comma, keep escaped dot
        us_parse = base.str.replace_all(",", "").cast(target_type, strict=False)

        # EU Parse: Remove escaped dot, replace comma with dot
        eu_parse = (
            base.str.replace_all(r"\.", "")
            .str.replace(",", ".")
            .cast(target_type, strict=False)
        )

        # Result: If both fail, it's null. Prevents silent coercion of 'abc' to 0.
        return pl.coalesce(us_parse, eu_parse).alias(col)

    # ---------------------------------------------------------------------
    # SCHEMA ENFORCEMENT (With Pre-flight Guard)
    # ---------------------------------------------------------------------

    def build_pipeline(
        self, 
        lf: pl.LazyFrame, 
        expected_schema: Dict[str, str], 
        pii_columns: Optional[List[str]] = None
    ) -> pl.LazyFrame:
        """
        The only time we 'collect_schema' is once at the start to prevent 
        runtime crashes on missing columns.
        """
        try:
            existing_cols = set(lf.collect_schema().names())
        except Exception as e:
            logger.error(f"Failed to resolve schema: {e}")
            raise

        # 1. Sanitize PII
        if pii_columns:
            lf = self.sanitize_pii(lf, pii_columns, existing_cols)

        # 2. Enforce Types and Inject Missing
        final_exprs = []
        for col, s_type in expected_schema.items():
            t_type = self._map_to_polars_type(s_type)
            
            if col not in existing_cols:
                # Injection: Safe and explicit
                final_exprs.append(pl.lit(None).cast(t_type).alias(col))
            else:
                if t_type.is_numeric():
                    final_exprs.append(self._safe_numeric_cast(col, t_type))
                else:
                    final_exprs.append(pl.col(col).cast(t_type, strict=False).alias(col))

        # 3. Guarded System Column Selection (Issue 5)
        for sys_col in self._system_columns:
            if sys_col in existing_cols and sys_col not in expected_schema:
                final_exprs.append(pl.col(sys_col))

        return lf.select(final_exprs)

    def _map_to_polars_type(self, semantic_type: str) -> pl.DataType:
        mapping = {
            "string": pl.String, "int": pl.Int64, "float": pl.Float64,
            "bool": pl.Boolean, "date": pl.Date, "datetime": pl.Datetime("us", "UTC"),
            "currency": pl.Decimal(precision=18, scale=2)
        }
        return mapping.get(semantic_type.lower(), pl.String)

    def execute(self, lf: pl.LazyFrame, streaming: bool = False) -> pl.DataFrame:
        """
        Streaming is disabled by default because Python UDFs (HMAC) 
        cause Polars to fall back to eager collection for those nodes.
        """
        return lf.collect(streaming=streaming)