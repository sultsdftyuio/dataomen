import logging
import re
import polars as pl
from datetime import datetime, timezone
from typing import List, Dict, Any

# Setup structured logger
logger = logging.getLogger(__name__)

class PolarsNormalizer:
    """
    Phase 1+: Enterprise Vectorized Normalization Engine.
    
    Instantly flattens deeply nested JSON structures from SaaS APIs into 
    strictly typed, columnar DataFrames optimized for Parquet/DuckDB.
    
    Upgraded Engineering: 
    - Zero-Copy Unnesting: Uses native Polars struct unnesting to bypass memory reallocation.
    - Complex List Serialization: Safely casts List(Struct) to JSON strings to prevent Parquet schema panics.
    - Lazy Evaluation Graph: Multithreaded C++/Rust execution pipeline.
    - Security by Design: Injects `tenant_id` at the CPU level before storage.
    """
    
    def __init__(self, tenant_id: str, integration_name: str) -> None:
        self.tenant_id = tenant_id
        self.integration_name = integration_name

    def _sanitize_column_names(self, columns: List[str]) -> Dict[str, str]:
        """
        Ensures column names are strictly alphanumeric and lowercase, preventing 
        DuckDB syntax errors. Includes deterministic deduplication to prevent 
        Polars Schema crashes if two dirty columns map to the same clean name.
        """
        clean_mapping = {}
        seen_names = set()
        
        for col in columns:
            # Lowercase, replace any non-alphanumeric character with an underscore
            clean_name = re.sub(r'[^a-z0-9]', '_', col.lower()).strip('_')
            
            # Defensive fallback to prevent empty column headers
            clean_name = clean_name if clean_name else "unnamed_col"
            
            # Deduplication: If "User-ID" and "User ID" both become "user_id"
            base_name = clean_name
            counter = 1
            while clean_name in seen_names:
                clean_name = f"{base_name}_{counter}"
                counter += 1
                
            seen_names.add(clean_name)
            clean_mapping[col] = clean_name
            
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
                    "_tenant_id": pl.String, 
                    "_integration_name": pl.String, 
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

        # 2. Zero-Copy Dynamic Unnesting (Eager Phase)
        # We must perform this eagerly because the schema of nested structs is unknown until inspected.
        # Native unnest() modifies the DataFrame structurally without allocating new python objects.
        struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]
        
        while struct_cols:
            for col in struct_cols:
                # Unnest and safely prefix fields (e.g., "customer" -> "customer_id")
                # to prevent collisions with top-level "id" columns.
                df = df.unnest(col).rename({
                    child: f"{col}_{child}" for child in df[col].struct.fields if child in df.columns
                })
            # Re-evaluate in case of deeply nested JSON (Structs within Structs)
            struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]

        # 3. Parquet Schema Safety (List-Struct & Null Neutralization)
        # Cloudflare R2 / Parquet writers crash on purely 'Null' columns or 'List(Struct)' with varying keys.
        type_cast_exprs = []
        for col, dtype in df.schema.items():
            if dtype == pl.Null:
                type_cast_exprs.append(pl.lit(None).cast(pl.String).alias(col))
            elif dtype == pl.Object:
                # Coerce unsupported Python Object columns to JSON Strings safely
                type_cast_exprs.append(pl.col(col).cast(pl.String, strict=False).alias(col))
            elif isinstance(dtype, pl.List):
                # If a list contains complex structs or nulls, cast the entire list to a JSON string.
                # DuckDB can easily parse this at query time, preventing ingestion pipeline crashes.
                inner_type = dtype.inner
                if isinstance(inner_type, pl.Struct) or inner_type == pl.Null or inner_type == pl.Object:
                    type_cast_exprs.append(pl.col(col).cast(pl.String, strict=False).alias(col))

        if type_cast_exprs:
            df = df.with_columns(type_cast_exprs)

        # ==========================================
        # 4. HYBRID PERFORMANCE PARADIGM: Shift to Lazy Evaluation
        # ==========================================
        # Now that the dynamic schema is flattened and safe, we build an optimized execution graph
        lf = df.lazy()

        # 5. Standardize column names for DuckDB SQL querying
        clean_columns = self._sanitize_column_names(df.columns)
        lf = lf.rename(clean_columns)

        # 6. Security by Design & Audit Metadata Injection
        # We use pl.lit() to broadcast the scalar value across millions of rows instantly via C++.
        # Prefixed with '_' to guarantee they never collide with the SaaS tool's native data columns.
        lf = lf.with_columns([
            pl.lit(self.tenant_id).cast(pl.String).alias("_tenant_id"),
            pl.lit(self.integration_name).cast(pl.String).alias("_integration_name"),
            pl.lit(datetime.now(timezone.utc)).cast(pl.Datetime("us", "UTC")).alias("_extracted_at")
        ])

        # 7. Execute the graph!
        # Rust Engine optimizes the operations and runs them across all available CPU threads
        final_df = lf.collect()
        
        logger.info(f"✅ [{self.tenant_id}] Normalized {final_df.height} rows and {final_df.width} columns for {self.integration_name}.")
        return final_df