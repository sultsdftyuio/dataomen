# api/services/data_sanitizer.py

import logging
import hashlib
import polars as pl
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class DataSanitizer:
    """
    Stateless, multi-tenant data sanitizer.
    Executes purely via vectorized Rust bindings (Polars) for maximum throughput.
    """
    def __init__(self, tenant_id: str, integration_name: str):
        self.tenant_id = tenant_id
        self.integration_name = integration_name
        # Tenant-specific salt ensures deterministic but secure hashing per organization
        self._tenant_salt = hashlib.sha256(tenant_id.encode()).hexdigest()[:16]

    def sanitize_pii(self, df: pl.DataFrame, pii_columns: List[str]) -> pl.DataFrame:
        """
        Vectorized PII anonymization. 
        Replaces sensitive strings with secure hashes without breaking analytical cardinality.
        """
        existing_pii_cols = [col for col in pii_columns if col in df.columns]
        if not existing_pii_cols:
            return df

        hash_exprs = []
        for col in existing_pii_cols:
            # Cast to modern String type, trim, and lower for deterministic hashing
            hashed_col = pl.col(col).cast(pl.String).str.to_lowercase().str.strip_chars()
            
            # Use pl.when() to skip hashing empty strings, returning true NULLs for DuckDB
            secure_hash_expr = pl.when(hashed_col.is_null() | (hashed_col == "")).then(pl.lit(None)).otherwise(
                pl.concat_str([hashed_col, pl.lit(self._tenant_salt)])
                .hash()
                .cast(pl.String)
            ).alias(col)
            
            hash_exprs.append(secure_hash_expr)

        return df.with_columns(hash_exprs)

    def enforce_duckdb_schema(self, df: pl.DataFrame, expected_schema: Dict[str, Any]) -> pl.DataFrame:
        """
        Security by Design: Enforces strict data types AND drops any unknown columns 
        to prevent unintentional PII leaks or schema drift.
        """
        cast_exprs = []
        expected_cols = list(expected_schema.keys())

        for col, expected_type in expected_schema.items():
            if col not in df.columns:
                # Inject missing columns as pure Nulls of the correct type
                target_type = self._map_to_polars_type(expected_type)
                cast_exprs.append(pl.lit(None).cast(target_type).alias(col))
                continue

            current_type = df.schema[col]
            target_type = self._map_to_polars_type(expected_type)
            
            if current_type != target_type:
                if target_type in [pl.Float64, pl.Int64] and current_type == pl.String:
                    # Vectorized cleanup for financial/numeric strings (e.g., "$1,000.50")
                    cleaned_num = pl.col(col).str.replace_all(r"[$,]", "")
                    cast_exprs.append(cleaned_num.cast(target_type, strict=False).alias(col))
                
                elif target_type in [pl.Date, pl.Datetime] and current_type == pl.String:
                    # Vectorized robust date parsing (prevents null-wipeouts from basic casting)
                    cast_exprs.append(pl.col(col).str.to_datetime(strict=False).cast(target_type).alias(col))
                
                else:
                    # Standard fallback cast
                    cast_exprs.append(pl.col(col).cast(target_type, strict=False).alias(col))

        # 1. Apply type castings efficiently in memory
        if cast_exprs:
            df = df.with_columns(cast_exprs)
        
        # 2. Schema Jailing: Strictly drop any columns NOT in the expected schema.
        # This prevents rogue data (like an API silently adding 'credit_card_info') from saving to disk.
        return df.select(expected_cols)

    def _map_to_polars_type(self, semantic_type: str) -> pl.DataType:
        """Maps abstract schema definitions to highly-performant Polars data types."""
        type_mapping = {
            "string": pl.String, "varchar": pl.String, "text": pl.String,
            "integer": pl.Int64, "int": pl.Int64,
            "float": pl.Float64, "double": pl.Float64, "currency": pl.Float64,
            "boolean": pl.Boolean, "bool": pl.Boolean,
            # Force timezone-aware datetimes for global SaaS analytical consistency
            "datetime": pl.Datetime("us", "UTC"), "timestamp": pl.Datetime("us", "UTC"),
            "date": pl.Date,
        }
        return type_mapping.get(semantic_type.lower(), pl.String)

    def process_batch(self, df: pl.DataFrame, pii_columns: Optional[List[str]] = None, expected_schema: Optional[Dict[str, Any]] = None) -> pl.DataFrame:
        """Orchestrates the data sanitization and typing pipeline statelessly."""
        if pii_columns:
            df = self.sanitize_pii(df, pii_columns)
        if expected_schema:
            df = self.enforce_duckdb_schema(df, expected_schema)
        return df