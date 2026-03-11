# api/services/data_sanitizer.py

import logging
import hashlib
import polars as pl
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class DataSanitizer:
    def __init__(self, tenant_id: str, integration_name: str):
        self.tenant_id = tenant_id
        self.integration_name = integration_name
        self._tenant_salt = hashlib.sha256(tenant_id.encode()).hexdigest()[:16]

    def sanitize_pii(self, df: pl.DataFrame, pii_columns: List[str]) -> pl.DataFrame:
        existing_pii_cols = [col for col in pii_columns if col in df.columns]
        if not existing_pii_cols:
            return df

        hash_exprs = []
        for col in existing_pii_cols:
            # Cast to string, trim, lower
            hashed_col = pl.col(col).cast(pl.Utf8).str.to_lowercase().str.strip_chars()
            
            # Use pl.when() to skip hashing if the string is empty or null
            secure_hash_expr = pl.when(hashed_col.is_null() | (hashed_col == "")).then(pl.lit("")).otherwise(
                pl.concat_str([hashed_col, pl.lit(self._tenant_salt)])
                .hash()
                .cast(pl.Utf8)
            ).alias(col)
            
            hash_exprs.append(secure_hash_expr)

        return df.with_columns(hash_exprs)

    def enforce_duckdb_schema(self, df: pl.DataFrame, expected_schema: Dict[str, Any]) -> pl.DataFrame:
        cast_exprs = []
        for col, expected_type in expected_schema.items():
            if col not in df.columns:
                cast_exprs.append(pl.lit(None).cast(self._map_to_polars_type(expected_type)).alias(col))
                continue

            current_type = df.schema[col]
            target_type = self._map_to_polars_type(expected_type)
            
            if current_type != target_type:
                if target_type in [pl.Float64, pl.Int64] and current_type == pl.Utf8:
                    # FIX: Use regex to remove BOTH commas and currency symbols like $
                    cast_exprs.append(
                        pl.col(col).str.replace_all(r"[$,]", "").cast(target_type, strict=False).alias(col)
                    )
                else:
                    cast_exprs.append(pl.col(col).cast(target_type, strict=False).alias(col))

        if cast_exprs:
            df = df.with_columns(cast_exprs)
        return df

    def _map_to_polars_type(self, semantic_type: str) -> pl.DataType:
        type_mapping = {
            "string": pl.Utf8, "varchar": pl.Utf8, "text": pl.Utf8,
            "integer": pl.Int64, "int": pl.Int64,
            "float": pl.Float64, "double": pl.Float64, "currency": pl.Float64,
            "boolean": pl.Boolean, "bool": pl.Boolean,
            "datetime": pl.Datetime("us", "UTC"), "timestamp": pl.Datetime("us", "UTC"),
            "date": pl.Date,
        }
        return type_mapping.get(semantic_type.lower(), pl.Utf8)

    def process_batch(self, df: pl.DataFrame, pii_columns: Optional[List[str]] = None, expected_schema: Optional[Dict[str, Any]] = None) -> pl.DataFrame:
        if pii_columns:
            df = self.sanitize_pii(df, pii_columns)
        if expected_schema:
            df = self.enforce_duckdb_schema(df, expected_schema)
        return df