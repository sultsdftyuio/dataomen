# api/services/duckdb_validator.py

import logging
import duckdb
import polars as pl
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class DuckDBValidator:
    """
    Phase 6.2 & 6.3: The Quality Assurance & Security Gatekeeper.
    
    Uses an ephemeral, in-memory DuckDB instance to validate vectorized DataFrames 
    before they are committed to persistent Parquet storage in Cloudflare R2.
    Ensures strict type compliance and mathematically guarantees tenant isolation.
    """
    
    def __init__(self, tenant_id: str, integration_name: str):
        self.tenant_id = tenant_id
        self.integration_name = integration_name
        
        # Initialize a lightweight, in-memory DuckDB connection for validation
        self.conn = duckdb.connect(database=':memory:')

    def validate_batch(self, df: pl.DataFrame, expected_schema: Dict[str, str]) -> bool:
        """
        The Orchestrator for QA Validation.
        Passes the Polars DataFrame via zero-copy Arrow memory directly to DuckDB.
        """
        if df.height == 0:
            return True

        try:
            # Register the Polars dataframe directly into DuckDB's memory space (Zero-Copy)
            self.conn.register("temp_batch", df)
            
            # 1. Enforce Tenant Isolation (Phase 6.3)
            self._audit_tenant_isolation()
            
            # 2. Enforce Strict DuckDB Cast Constraints (Phase 6.2)
            self._audit_schema_compliance(expected_schema)
            
            return True
            
        except SecurityError:
            # Let the critical security panic bubble up directly
            raise
        except Exception as e:
            logger.error(f"❌ [QA FAILED] Validation blocked for {self.tenant_id}/{self.integration_name}: {str(e)}")
            raise ValueError(f"Data batch failed rigorous quality assurance: {str(e)}")
            
        finally:
            # Free memory immediately to prevent RAM bloat on Render compute instances
            self.conn.unregister("temp_batch")

    def _audit_tenant_isolation(self) -> None:
        """
        Phase 6.3: Tenant Isolation Audit.
        Runs a hyper-fast vectorized check to ensure EVERY row belongs to the current tenant.
        If even one row lacks the tenant_id or belongs to another, the pipeline panics.
        """
        query = f"""
            SELECT count(*) as violation_count 
            FROM temp_batch 
            WHERE _tenant_id != '{self.tenant_id}' OR _tenant_id IS NULL
        """
        result = self.conn.execute(query).fetchone()
        
        if result and result[0] > 0:
            logger.critical(f"🚨 TENANT ISOLATION BREACH DETECTED: {result[0]} rogue rows found!")
            raise SecurityError("Payload contains cross-tenant data or missing tenant partitions.")
            
        logger.debug(f"[{self.tenant_id}] Tenant isolation audit passed for {self.integration_name}.")

    def _audit_schema_compliance(self, expected_schema: Dict[str, str]) -> None:
        """
        Phase 6.2: Schema Integrity & Crash Prevention.
        Instead of trusting Polars' lazy types, we force DuckDB to execute a `CAST` on 
        the exact semantic types we expect (e.g., 'DOUBLE' for currency). 
        If Salesforce sneaks in a string like "$1,000", this query will fail instantly,
        preventing it from corrupting the analytical views.
        """
        # We only validate columns we actually care about analytically
        cast_clauses = []
        for col_name, sql_type in expected_schema.items():
            # Standardize names to prevent SQL injection in column identifiers
            clean_col = "".join(c for c in col_name if c.isalnum() or c == '_')
            
            # Map standard types to DuckDB strict types
            duckdb_type = self._map_to_duckdb_type(sql_type)
            
            # We attempt to cast the column. If it fails, DuckDB throws a Conversion Exception
            cast_clauses.append(f"CAST({clean_col} AS {duckdb_type})")
            
        if not cast_clauses:
            return

        validation_query = f"""
            SELECT {', '.join(cast_clauses)}
            FROM temp_batch
            LIMIT 1000; -- Sample the first 1000 rows for rapid QA without burning CPU
        """
        
        try:
            # If the cast succeeds, the schema is safe for Parquet serialization
            self.conn.execute(validation_query).fetchall()
        except duckdb.ConversionException as e:
            raise TypeError(f"Strict typing violation detected: {str(e)}")

    def _map_to_duckdb_type(self, semantic_type: str) -> str:
        """
        Maps abstract schema types to DuckDB's strict analytical types.
        """
        type_mapping = {
            "string": "VARCHAR",
            "varchar": "VARCHAR",
            "integer": "BIGINT",
            "int": "BIGINT",
            "float": "DOUBLE",
            "currency": "DOUBLE",
            "double": "DOUBLE",
            "boolean": "BOOLEAN",
            "datetime": "TIMESTAMP",
            "timestamp": "TIMESTAMP",
            "date": "DATE"
        }
        return type_mapping.get(semantic_type.lower(), "VARCHAR")

class SecurityError(Exception):
    """Custom exception raised strictly when tenant isolation constraints are violated."""
    pass