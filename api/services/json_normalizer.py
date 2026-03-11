# api/services/json_normalizer.py

import logging
import re
import polars as pl
from datetime import datetime, timezone
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class PolarsNormalizer:
    """
    The Computation Layer: Vectorized Normalization Engine.
    Instantly flattens deeply nested JSON structures from SaaS APIs into 
    strictly typed, columnar DataFrames optimized for Parquet/DuckDB.
    
    Upgrades: 
    - Parallelized Expression Graph (Groups operations for C++ multithreading).
    - Regex-powered column sanitization for strict DuckDB compliance.
    - Timezone-aware audit telemetry.
    """
    
    def __init__(self, tenant_id: str, integration_name: str):
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
            # Fallback for empty strings after regex
            clean_mapping[col] = clean_name if clean_name else "unnamed_col"
        return clean_mapping

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

        # 2. Collision-Proof Dynamic Unnesting
        # Standard unnesting causes crashes if {"customer": {"id": 1}} and {"id": 2} exist.
        # We manually unnest and prefix fields (e.g., -> "customer_id").
        
        # Use schema.items() for newer Polars compatibility
        struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]
        
        while struct_cols:
            exprs = []
            for col in struct_cols:
                # Extract the sub-fields of the nested object using the schema
                fields = df[col].struct.fields
                
                # Create aliased expressions to flatten them with a prefix
                exprs.extend([
                    pl.col(col).struct.field(f.name).alias(f"{col}_{f.name}") 
                    for f in fields
                ])
                
            # Apply all unnesting expressions in parallel via the C++ engine, then drop the parent structs
            df = df.with_columns(exprs).drop(struct_cols)
            
            # Re-evaluate in case the unnested structs contained deeper structs
            struct_cols = [col for col, dtype in df.schema.items() if isinstance(dtype, pl.Struct)]

        # Note on Lists/Arrays (e.g., Shopify line_items):
        # We DO NOT explode them here. Exploding creates massive row-duplication. 
        # We leave them as pl.List so DuckDB can use UNNEST() natively at query time.

        # 3. Parquet Schema Safety (Type Coercion)
        # Cloudflare R2 / Parquet writers will immediately crash if they encounter a purely 
        # 'Null' column or a Python 'Object' column. We must sanitize them.
        type_cast_exprs = []
        
        for col, dtype in df.schema.items():
            if dtype == pl.Null:
                type_cast_exprs.append(pl.lit(None).cast(pl.Utf8).alias(col))
            elif dtype == pl.Object:
                # Coerce unsupported Object columns to JSON Strings
                type_cast_exprs.append(pl.col(col).cast(pl.Utf8).alias(col))
                
        if type_cast_exprs:
            df = df.with_columns(type_cast_exprs)

        # 4. Standardize column names for DuckDB SQL querying
        clean_columns = self._sanitize_column_names(df.columns)
        df = df.rename(clean_columns)

        # 5. Security & Audit Metadata Injection
        # We use pl.lit() to broadcast the scalar value across millions of rows instantly via C++.
        # Prefixed with '_' to guarantee they never collide with the SaaS tool's native data columns.
        df = df.with_columns([
            pl.lit(self.tenant_id).alias("_tenant_id"),
            pl.lit(self.integration_name).alias("_integration_name"),
            pl.lit(datetime.now(timezone.utc)).alias("_extracted_at")
        ])

        return df