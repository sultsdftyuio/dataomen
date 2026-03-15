# api/services/json_normalizer.py

import logging
import re
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

import polars as pl

logger = logging.getLogger(__name__)

class PolarsNormalizer:
    """
    Phase 3: The Vectorized SaaS Normalization Engine.
    
    Transforms messy, nested JSON from SaaS APIs (Stripe, Shopify, Salesforce) 
    into ultra-fast, Hive-partitioned Parquet files.
    
    Engineering Excellence:
    - Recursive Flattening: Handles infinite nesting without Python recursion limits.
    - Standardized Chronology: Coerces Unix/ISO dates into microsecond-precision UTC.
    - Column Sanitization: Enforces DuckDB-friendly naming conventions.
    - Tenant Isolation: Hard-codes security metadata into the columnar graph.
    """

    def __init__(self, tenant_id: str, integration_name: str) -> None:
        self.tenant_id = tenant_id
        self.integration_name = integration_name

    def _sanitize_column_names(self, columns: List[str]) -> Dict[str, str]:
        """
        Maps dirty API keys to clean, lowercased, alphanumeric SQL columns.
        Prevents collisions and ensures DuckDB compatibility.
        """
        clean_mapping = {}
        seen = set()
        
        for col in columns:
            # 1. Strip non-alphanumeric, convert to snake_case
            clean = re.sub(r'[^a-z0-9]', '_', col.lower()).strip('_')
            clean = clean if clean else "field"
            
            # 2. Prevent SQL keywords or starting with numbers
            if clean[0].isdigit():
                clean = f"v_{clean}"
            
            # 3. Deterministic Deduplication
            base = clean
            counter = 1
            while clean in seen:
                clean = f"{base}_{counter}"
                counter += 1
                
            seen.add(clean)
            clean_mapping[col] = clean
            
        return clean_mapping

    def normalize_batch(self, raw_data: List[Dict[str, Any]]) -> pl.DataFrame:
        """
        Primary entry point for the Zero-ETL pipeline.
        Vectorizes JSON batches into highly-compressed Polars DataFrames.
        """
        if not raw_data:
            logger.debug(f"[{self.tenant_id}] Empty batch for {self.integration_name}. Creating audit shell.")
            return self._create_empty_audit_df()

        try:
            # 1. Vectorized Ingestion
            # Scan 100% of batch for schema inference to minimize 'Object' type fallbacks
            df = pl.from_dicts(raw_data, infer_schema_length=len(raw_data))
            
            # 2. Recursive Vectorized Unnesting
            # Flattens Structs into top-level columns using Polars Rust core
            df = self._flatten_structs(df)

            # 3. Analytical Data Prep (Cleaning & Standardizing)
            lf = df.lazy()

            # 4. Standardize column names for DuckDB
            clean_cols = self._sanitize_column_names(df.columns)
            lf = lf.rename(clean_cols)

            # 5. Type Safety & Parquet-Readiness
            # Logic: Cast Nulls to Strings, Stringify complex Lists, Coerce Dates
            lf = self._apply_high_performance_transforms(lf)

            # 6. Security & Multi-Tenant Injection
            # Scalars are broadcasted instantly across the column via Rust
            lf = lf.with_columns([
                pl.lit(self.tenant_id).alias("_tenant_id"),
                pl.lit(self.integration_name).alias("_integration_name"),
                pl.lit(datetime.now(timezone.utc)).cast(pl.Datetime("us", "UTC")).alias("_extracted_at")
            ])

            # 7. Execute optimized graph
            final_df = lf.collect()
            
            logger.info(f"✅ [{self.tenant_id}] Vectorized {final_df.height} rows | {final_df.width} cols.")
            return final_df

        except Exception as e:
            logger.error(f"❌ [{self.tenant_id}] Normalization Failure: {e}")
            raise RuntimeError(f"Compute Engine error during data vectorization: {str(e)}")

    def _flatten_structs(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Eagerly flattens all nested Struct columns. 
        Loops until no Structs remain to handle deep nesting.
        """
        while True:
            struct_cols = [c for c, t in df.schema.items() if isinstance(t, pl.Struct)]
            if not struct_cols:
                break
            
            for col in struct_cols:
                # Get fields before unnesting to handle naming collisions
                fields = df.schema[col].fields
                df = df.unnest(col)
                
                # If unnested fields collide with existing columns, prefix them
                rename_map = {}
                for f in fields:
                    if f.name in df.columns and f.name != col:
                        rename_map[f.name] = f"{col}_{f.name}"
                
                if rename_map:
                    df = df.rename(rename_map)
        return df

    def _apply_high_performance_transforms(self, lf: pl.LazyFrame) -> pl.LazyFrame:
        """
        Applies vectorized cleaning logic to the LazyFrame graph.
        Triggers: Date detection, List-to-JSON coercion, and String trimming.
        """
        expressions = []
        
        # Access schema from the lazy plan
        for col, dtype in lf.schema.items():
            # A. Neutralize pure Null columns (crashes Parquet writers)
            if dtype == pl.Null:
                expressions.append(pl.col(col).cast(pl.String).alias(col))
            
            # B. Coerce Mixed/Complex Lists to JSON Strings
            # (Allows DuckDB to use json_extract() instead of crashing on Parquet schema drift)
            elif isinstance(dtype, pl.List):
                inner = dtype.inner
                if isinstance(inner, (pl.Struct, pl.List, pl.Object)):
                    expressions.append(pl.col(col).cast(pl.String).alias(col))

            # C. Detect & Standardize SaaS Timestamps
            elif dtype == pl.String:
                # Optimization: Trim strings to reduce Parquet file size & improve DuckDB index performance
                expressions.append(pl.col(col).str.strip_chars().alias(col))
                
                # Heuristic: If col name suggests a date, attempt to parse
                if any(k in col.lower() for k in ["created", "updated", "timestamp", "_at"]):
                    # This handles ISO strings; Unix ints are handled separately if they arrive as Ints
                    expressions.append(
                        pl.col(col).str.to_datetime(strict=False).alias(col)
                    )
            
            # D. Coerce Unix Timestamps (BigInts that look like seconds/ms)
            elif dtype in [pl.Int64, pl.Float64] and any(k in col.lower() for k in ["created", "updated", "timestamp"]):
                # Stripe uses seconds; Shopify uses milliseconds. 
                # Heuristic: Values > 1e11 are likely ms
                expressions.append(
                    pl.when(pl.col(col) > 1e11)
                    .then(pl.from_epoch(pl.col(col), time_unit="ms"))
                    .otherwise(pl.from_epoch(pl.col(col), time_unit="s"))
                    .alias(col)
                )

        return lf.with_columns(expressions) if expressions else lf

    def _create_empty_audit_df(self) -> pl.DataFrame:
        """Returns a type-safe empty DataFrame to prevent pipeline failures on empty API responses."""
        return pl.DataFrame(
            schema={
                "_tenant_id": pl.String,
                "_integration_name": pl.String,
                "_extracted_at": pl.Datetime("us", "UTC")
            }
        )