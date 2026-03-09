# api/services/json_normalizer.py

import logging
import polars as pl
from datetime import datetime
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class PolarsNormalizer:
    """
    The Computation Layer: Vectorized Normalization Engine.
    Instantly flattens deeply nested JSON structures from SaaS APIs into 
    strictly typed, columnar DataFrames optimized for Parquet/DuckDB.
    
    Upgrades: 
    - Collision-proof struct unnesting (prefixes nested keys).
    - Parquet schema safety (coerces Null/Object types to Utf8).
    - Audit telemetry injection (_extracted_at).
    """
    
    def __init__(self, tenant_id: str, integration_name: str):
        self.tenant_id = tenant_id
        self.integration_name = integration_name

    def normalize_batch(self, raw_data: List[Dict[str, Any]]) -> pl.DataFrame:
        """
        Ingests raw JSON, flattens it safely, enforces schema rules, 
        and prepares it for high-speed DuckDB analytical queries.
        """
        if not raw_data:
            # Return an empty dataframe with strict audit schema to prevent pipeline crashes
            return pl.DataFrame(
                schema={
                    "_tenant_id": pl.Utf8, 
                    "_integration_name": pl.Utf8, 
                    "_extracted_at": pl.Datetime
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

        # 2. Collision-Proof Dynamic Unnesting
        # Standard unnesting causes crashes if {"customer": {"id": 1}} and {"id": 2} exist.
        # We manually unnest and prefix fields (e.g., -> "customer_id").
        struct_cols = [col for col, dtype in zip(df.columns, df.dtypes) if isinstance(dtype, pl.Struct)]
        
        while struct_cols:
            for col in struct_cols:
                # Extract the sub-fields of the nested object
                fields = df[col].struct.fields
                
                # Create aliased expressions to flatten them with a prefix
                exprs = [
                    pl.col(col).struct.field(f).alias(f"{col}_{f}") 
                    for f in fields
                ]
                
                # Apply the new flattened columns and drop the original nested struct
                df = df.with_columns(exprs).drop(col)
                
            # Re-evaluate in case the unnested structs contained deeper structs
            struct_cols = [col for col, dtype in zip(df.columns, df.dtypes) if isinstance(dtype, pl.Struct)]

        # Note on Lists/Arrays (e.g., Shopify line_items):
        # We DO NOT explode them here. Exploding creates massive row-duplication. 
        # We leave them as pl.List so DuckDB can use UNNEST() natively at query time.

        # 3. Parquet Schema Safety (Type Coercion)
        # Cloudflare R2 / Parquet writers will immediately crash if they encounter a purely 
        # 'Null' column or a Python 'Object' column. We must sanitize them.
        
        # Coerce Null columns to String (Utf8)
        null_cols = [col for col, dtype in zip(df.columns, df.dtypes) if dtype == pl.Null]
        if null_cols:
            df = df.with_columns([
                pl.lit(None).cast(pl.Utf8).alias(col) for col in null_cols
            ])
            
        # Coerce unsupported Object columns (often weird, mixed-type JSON arrays) to JSON Strings
        object_cols = [col for col, dtype in zip(df.columns, df.dtypes) if dtype == pl.Object]
        if object_cols:
            df = df.with_columns([
                pl.col(col).cast(pl.Utf8).alias(col) for col in object_cols
            ])

        # 4. Standardize column names for DuckDB SQL querying
        # Lowercase, replace spaces/dots with underscores
        clean_columns = {
            col: col.strip().lower().replace(" ", "_").replace(".", "_") 
            for col in df.columns
        }
        df = df.rename(clean_columns)

        # 5. Security & Audit Metadata Injection
        # We use pl.lit() to broadcast the scalar value across millions of rows instantly via C++.
        # Prefixed with '_' to guarantee they never collide with the SaaS tool's native data columns.
        df = df.with_columns([
            pl.lit(self.tenant_id).alias("_tenant_id"),
            pl.lit(self.integration_name).alias("_integration_name"),
            pl.lit(datetime.utcnow()).alias("_extracted_at")
        ])

        return df