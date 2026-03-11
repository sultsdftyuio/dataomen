# api/services/json_normalizer.py

import logging
import re
import polars as pl
from datetime import datetime, timezone
from typing import List, Dict, Any

# Setup structured logger
logger = logging.getLogger(__name__)

class PolarsNormalizer:
    """
    The Computation Layer: Vectorized Normalization Engine.
    
    Instantly flattens deeply nested JSON structures from SaaS APIs into 
    strictly typed, columnar DataFrames optimized for Parquet/DuckDB.
    
    Upgrades Applied (Hybrid Performance Paradigm): 
    - Lazy Evaluation Graph: Transitions to pl.LazyFrame for multithreaded C++/Rust execution.
    - Collision-Proof Unnesting: Safely prefixes child fields to prevent schema collisions.
    - Strict Parquet Type Coercion: Neutralizes pure Null/Object columns that crash Parquet writers.
    - Security by Design: Injects `tenant_id` at the CPU level before storage.
    """
    
    def __init__(self, tenant_id: str, integration_name: str) -> None:
        self.tenant_id = tenant_id
        self.integration_name = integration_name

    def _sanitize_column_names(self, columns: List[str]) -> Dict[str, str]:
        """
        Ensures column names are strictly alphanumeric and lowercase, preventing 
        DuckDB syntax errors without needing double-quotes around every field.
        """
        clean_mapping = {}
        for col in columns:
            # Lowercase, replace any non-alphanumeric character with an underscore, 
            # and strip trailing/leading underscores.
            clean_name = re.sub(r'[^a-z0-9]', '_', col.lower()).strip('_')
            
            # Defensive fallback to prevent empty column headers from crashing the engine
            clean_mapping[col] = clean_name if clean_name else "unnamed_col"
            
        return clean_mapping

    def normalize_batch(self, raw_data: List[Dict[str, Any]]) -> pl.DataFrame:
        """
        Ingests raw JSON, flattens it safely, enforces schema rules, 
        and prepares it for high-speed DuckDB analytical queries via Parquet.
        """
        if not raw_data:
            logger.warning(f"[{self.tenant_id}] Empty payload received for {self.integration_name}. Returning empty audit schema.")
            # Return an empty dataframe with strict audit schema to prevent pipeline crashes
            return pl.DataFrame(
                schema={
                    "_tenant_id": pl.Utf8, 
                    "_integration_name": pl.Utf8, 
                    "_extracted_at": pl.Datetime("us", "UTC")
                }
            )

        try:
            # 1. Vectorized Load & Schema Inference
            # infer_schema_length=10000 ensures we scan enough rows to accurately 
            # upcast types (e.g., catching floats hidden inside mostly integer columns)
            df = pl.from_dicts(raw_data, infer_schema_length=10000)
        except Exception as e:
            logger.error(f"❌ [{self.tenant_id}] Failed to vectorize JSON for {self.integration_name}: {e}")
            raise ValueError(f"Data format exception during vectorization: {str(e)}")

        # 2. Collision-Proof Dynamic Unnesting (Eager Phase)
        # We must perform this eagerly because the schema of nested structs is unknown until inspected.
        # We manually unnest and prefix fields (e.g., {"customer": {"id": 1}} -> "customer_id")
        # to prevent collisions with top-level "id" columns.
        struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]
        
        while struct_cols:
            exprs = []
            for col in struct_cols:
                # Extract the sub-fields of the nested object safely
                struct_dtype = df.schema[col]
                # Polars structurally stores fields within the Struct dtype
                for field in struct_dtype.fields:
                    field_name = field.name
                    exprs.append(
                        pl.col(col).struct.field(field_name).alias(f"{col}_{field_name}")
                    )
            
            # Apply unpacking and drop the parent struct column
            df = df.with_columns(exprs).drop(struct_cols)
            # Re-evaluate in case of deeply nested JSON (Structs within Structs)
            struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]

        # Note on Lists/Arrays (e.g., Shopify line_items):
        # We DO NOT explode them here. Exploding creates massive memory duplication. 
        # We leave them as pl.List so the DuckDB Compute Engine can use UNNEST() natively at query time.

        # ==========================================
        # 3. HYBRID PERFORMANCE PARADIGM: Shift to Lazy Evaluation
        # ==========================================
        # Now that the dynamic schema is flattened, we build an optimized execution graph
        lf = df.lazy()

        # 4. Parquet Schema Safety (Type Coercion)
        # Cloudflare R2 / Parquet writers will immediately crash if they encounter a purely 
        # 'Null' column or a Python 'Object' column. We must cast them safely.
        type_cast_exprs = []
        for col, dtype in df.schema.items():
            if dtype == pl.Null:
                type_cast_exprs.append(pl.lit(None).cast(pl.Utf8).alias(col))
            elif dtype == pl.Object:
                # Coerce unsupported Object columns to JSON Strings
                type_cast_exprs.append(pl.col(col).cast(pl.Utf8).alias(col))
                
        if type_cast_exprs:
            lf = lf.with_columns(type_cast_exprs)

        # 5. Standardize column names for DuckDB SQL querying
        # Execute the rename operation in the lazy graph
        clean_columns = self._sanitize_column_names(df.columns)
        lf = lf.rename(clean_columns)

        # 6. Security by Design & Audit Metadata Injection
        # We use pl.lit() to broadcast the scalar value across millions of rows instantly via C++.
        # Prefixed with '_' to guarantee they never collide with the SaaS tool's native data columns.
        lf = lf.with_columns([
            pl.lit(self.tenant_id).cast(pl.Utf8).alias("_tenant_id"),
            pl.lit(self.integration_name).cast(pl.Utf8).alias("_integration_name"),
            pl.lit(datetime.now(timezone.utc)).cast(pl.Datetime("us", "UTC")).alias("_extracted_at")
        ])

        # 7. Execute the graph!
        # Rust Engine optimizes the operations and runs them across all available CPU threads
        final_df = lf.collect()
        
        logger.info(f"✅ [{self.tenant_id}] Normalized {final_df.height} rows and {final_df.width} columns for {self.integration_name}.")
        return final_df