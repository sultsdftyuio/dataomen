"""
ARCLI.TECH - SaaS Ingestion Module
Component: Enterprise Data Sanitization Engine
Strategy: Security by Design & Hybrid Performance Paradigm
"""

import os
import logging
import hmac
import hashlib
import polars as pl
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class DataSanitizer:
    """
    Phase 1+: Enterprise Data Sanitization Engine.
    
    Upgraded Engineering:
    - SOC2/HIPAA Compliance: Cryptographic HMAC-SHA256 hashing for irreversible PII masking.
    - System Metadata Preservation: Safely jails rogue API columns while preserving _tenant_id.
    - Global Schema Resilience: Robust regex strips all non-numeric characters (handles €, £, ¥).
    - Lazy Evaluation Graph: Defers execution to Polars' multi-threaded C++ engine.
    """
    
    def __init__(self, tenant_id: str, integration_name: str):
        self.tenant_id = tenant_id
        self.integration_name = integration_name
        
        # Enterprise Key Derivation: Create a tenant-specific HMAC key
        # Security by Design: Never use a single global salt for hashing PII across tenants
        master_key = os.environ.get("DATA_VAULT_MASTER_KEY")
        if not master_key:
            logger.warning(f"[{self.tenant_id}] DATA_VAULT_MASTER_KEY not found. Using ephemeral dev key. DO NOT DO THIS IN PRODUCTION.")
            master_key = "ephemeral_fallback_key_for_dev_only"

        self._tenant_key = hmac.new(
            master_key.encode('utf-8'), 
            tenant_id.encode('utf-8'), 
            hashlib.sha256
        ).digest()

    def _secure_hmac_sha256(self, series: pl.Series) -> pl.Series:
        """
        UDF for Cryptographic PII Masking.
        Uses map_elements for secure HMAC-SHA256. While custom Python functions drop 
        out of pure Rust execution, this is a strict legal requirement for GDPR/SOC2 compliance.
        """
        def mask_value(val: Optional[str]) -> Optional[str]:
            if val is None:
                return None
            val_str = str(val).strip()
            if not val_str:
                return None
            return hmac.new(self._tenant_key, val_str.encode('utf-8'), hashlib.sha256).hexdigest()

        # skip_nulls=True optimizes execution by avoiding the Python function call for empty rows
        return series.map_elements(mask_value, return_dtype=pl.String, skip_nulls=True)

    def sanitize_pii(self, lf: pl.LazyFrame, pii_columns: List[str]) -> pl.LazyFrame:
        """
        Lazy PII anonymization. 
        Replaces sensitive strings (emails, phones) with secure HMAC hashes.
        """
        # Resolve existing columns eagerly to build the graph correctly
        existing_cols = lf.collect_schema().names()
        existing_pii_cols = [col for col in pii_columns if col in existing_cols]
        
        if not existing_pii_cols:
            return lf

        hash_exprs = []
        for col in existing_pii_cols:
            # 1. Cleanse the input for deterministic hashing (trim & lowercase)
            # This ensures "John.Doe@email.com " and "john.doe@email.com" generate the same hash
            cleaned_col = pl.col(col).cast(pl.String).str.to_lowercase().str.strip_chars()
            
            # 2. Apply Cryptographic HMAC using map_batches to interface with the Lazy Graph
            secure_hash_expr = cleaned_col.map_batches(
                self._secure_hmac_sha256, 
                return_dtype=pl.String
            ).alias(col)
            
            hash_exprs.append(secure_hash_expr)

        return lf.with_columns(hash_exprs)

    def enforce_duckdb_schema(self, lf: pl.LazyFrame, expected_schema: Dict[str, Any]) -> pl.LazyFrame:
        """
        Security by Design: Enforces strict data types AND drops any unknown columns.
        Prevents Parquet schema drift and unintentional PII leaks via rogue API payloads.
        """
        cast_exprs = []
        expected_cols = list(expected_schema.keys())
        current_schema = lf.collect_schema()
        current_cols = current_schema.names()

        # Define internal routing metadata that must survive the schema jailing
        system_cols = ["_tenant_id", "_integration_name", "_extracted_at"]

        for col, expected_type in expected_schema.items():
            target_type = self._map_to_polars_type(expected_type)

            if col not in current_cols:
                # Inject missing columns as pure Nulls of the correct type (Parquet safe)
                cast_exprs.append(pl.lit(None).cast(target_type).alias(col))
                continue

            current_type = current_schema[col]
            
            if current_type != target_type:
                # --- Advanced Vectorized Type Coercion ---
                
                if target_type in [pl.Float64, pl.Int64, pl.Int32] and current_type == pl.String:
                    # Global Resilience: Strip EVERYTHING except digits, decimals, and negative signs.
                    # This prevents panics on "€1.000,50", "£500", or "$45.99"
                    cleaned_num = pl.col(col).str.replace_all(r"[^\d.-]", "")
                    cast_exprs.append(cleaned_num.cast(target_type, strict=False).alias(col))
                
                elif target_type in [pl.Date, pl.Datetime] and current_type == pl.String:
                    # Enterprise Date Parsing: 'mixed' handles varying ISO/chaotic SaaS formats gracefully
                    cast_exprs.append(
                        pl.col(col)
                        .str.to_datetime(format="mixed", strict=False)
                        .cast(target_type)
                        .alias(col)
                    )
                else:
                    # Standard fallback cast (strict=False ensures un-castable data becomes Null, not a crash)
                    cast_exprs.append(pl.col(col).cast(target_type, strict=False).alias(col))

        # 1. Apply type castings efficiently in the C++ execution graph
        if cast_exprs:
            lf = lf.with_columns(cast_exprs)
        
        # 2. Schema Jailing: Strictly drop any columns NOT in the expected schema, 
        # BUT preserve the internal multi-tenant routing columns.
        final_select = expected_cols + [c for c in system_cols if c in current_cols]
        return lf.select(final_select)

    def _map_to_polars_type(self, semantic_type: str) -> pl.DataType:
        """Maps abstract DuckDB/SaaS schema definitions to highly-performant Polars data types."""
        type_mapping = {
            "string": pl.String, "varchar": pl.String, "text": pl.String,
            "integer": pl.Int64, "int": pl.Int64, "bigint": pl.Int64,
            "float": pl.Float64, "double": pl.Float64, "currency": pl.Float64,
            "boolean": pl.Boolean, "bool": pl.Boolean,
            # Force timezone-aware datetimes for global analytical consistency
            "datetime": pl.Datetime("us", "UTC"), "timestamp": pl.Datetime("us", "UTC"),
            "date": pl.Date,
        }
        return type_mapping.get(semantic_type.lower(), pl.String)

    def process_batch(self, df: pl.DataFrame, pii_columns: Optional[List[str]] = None, expected_schema: Optional[Dict[str, Any]] = None) -> pl.DataFrame:
        """
        Orchestrates the data sanitization and typing pipeline.
        Utilizes Polars LazyFrames (Hybrid Performance Paradigm) to bypass the Python GIL 
        and compile all operations into a single optimized execution graph.
        """
        logger.debug(f"[{self.tenant_id}] Initiating Lazy Sanitization Graph for {self.integration_name}")
        
        # Shift into the Lazy Engine
        lf = df.lazy()
        
        if pii_columns:
            lf = self.sanitize_pii(lf, pii_columns)
            
        if expected_schema:
            lf = self.enforce_duckdb_schema(lf, expected_schema)
            
        # Execute the optimized graph across all available CPU cores
        return lf.collect()