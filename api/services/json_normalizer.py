# api/services/json_normalizer.py

import logging
import polars as pl
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class PolarsNormalizer:
    """
    The Computation Layer: Vectorized Normalization Engine.
    Flattens deeply nested JSON structures from SaaS APIs (Stripe, Shopify, etc.)
    into columnar, Parquet-ready DataFrames. 
    Handles schema evolution dynamically and enforces multi-tenant security.
    """
    
    def __init__(self, tenant_id: str, integration_name: str):
        self.tenant_id = tenant_id
        self.integration_name = integration_name

    def normalize_batch(self, raw_data: List[Dict[str, Any]]) -> pl.DataFrame:
        """
        Ingests a batch of raw JSON objects, infers the schema, flattens nested dictionaries,
        and injects the mandatory multi-tenant partitioning columns.
        
        :param raw_data: A list of raw JSON dictionaries from an API pagination run.
        :return: A Polars DataFrame fully normalized and ready for R2 partitioned storage.
        """
        if not raw_data:
            # Return an empty dataframe with strict schema to prevent downstream pipeline crashes
            return pl.DataFrame(
                schema={"tenant_id": pl.Utf8, "integration_name": pl.Utf8}
            )

        try:
            # 1. Vectorized Load & Schema Inference
            # infer_schema_length=10000 ensures we scan enough rows to correctly 
            # type upcast fields (e.g., catching floats inside integer columns)
            df = pl.from_dicts(raw_data, infer_schema_length=10000)
        except Exception as e:
            logger.error(f"[{self.tenant_id}] Failed to load raw JSON into Polars for {self.integration_name}: {e}")
            raise ValueError(f"Data format exception during vectorization: {str(e)}")

        # 2. Dynamic Unnesting (Schema Evolution Resilience)
        # We loop to recursively flatten nested JSON objects (Structs in Polars).
        # E.g., {"customer": {"name": "John", "address": {"city": "NY"}}} 
        # becomes -> customer_name, customer_address_city
        fully_unnested = False
        while not fully_unnested:
            fully_unnested = True
            
            # Find all columns that are typed as nested Structs
            struct_cols = [
                col_name for col_name, dtype in zip(df.columns, df.dtypes) 
                if isinstance(dtype, pl.Struct)
            ]
            
            if struct_cols:
                # Unnest them into top-level columns automatically
                df = df.unnest(struct_cols)
                fully_unnested = False  # Re-evaluate in case the unnested structs contained deeper structs

        # Note on Lists/Arrays (e.g., Shopify line_items):
        # Polars retains them as pl.List. DuckDB natively supports Parquet ARRAY types, 
        # so we DO NOT explode them here. Exploding creates massive row-duplication. 
        # We keep the engine efficient by leaving arrays intact for DuckDB UNNEST() at query time.

        # 3. Security by Design: Inject Tenant Isolation Keys
        # We use pl.lit() to broadcast the scalar value across millions of rows instantly via C++ 
        df = df.with_columns([
            pl.lit(self.tenant_id).alias("tenant_id"),
            pl.lit(self.integration_name).alias("integration_name")
        ])

        # 4. Standardize column names (lowercase, replace spaces with underscores) 
        # to ensure flawless DuckDB SQL querying later
        clean_columns = {col: col.strip().lower().replace(" ", "_").replace(".", "_") for col in df.columns}
        df = df.rename(clean_columns)

        return df