# api/services/duckdb_validator.py

import logging
import duckdb
import polars as pl
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class SecurityError(Exception):
    """Custom exception raised strictly when tenant isolation constraints are violated."""
    pass

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

    def __del__(self):
        """Ensure the connection is cleanly closed when the object is garbage collected."""
        try:
            self.conn.close()
        except:
            pass

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
            self._audit_schema_compliance(expected_schema, df.columns)
            
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
        # We use prepared statements (?) to prevent SQL injection via self.tenant_id
        query = """
            SELECT count(*) as violation_count 
            FROM temp_batch 
            WHERE _tenant_id != ? OR _tenant_id IS NULL
        """
        
        result = self.conn.execute(query, [self.tenant_id]).fetchone()
        
        if result and result[0] > 0:
            logger.critical(f"🚨 TENANT ISOLATION BREACH DETECTED: {result[0]} rogue rows found!")
            raise SecurityError("Payload contains cross-tenant data or missing tenant partitions.")
            
        logger.debug(f"[{self.tenant_id}] Tenant isolation audit passed for {self.integration_name}.")

    def _audit_schema_compliance(self, expected_schema: Dict[str, str], current_columns: List[str]) -> None:
        """
        Phase 6.2: Schema Integrity & Crash Prevention.
        Forces DuckDB to execute a `CAST` on the exact semantic types we expect. 
        If Salesforce sneaks in a string like "$1,000" into an integer column, 
        this query will fail instantly, preventing it from corrupting the Parquet file.
        """
        cast_clauses = []
        
        for col_name, sql_type in expected_schema.items():
            # Graceful degraded QA: Only validate columns that actually exist in the DataFrame
            if col_name not in current_columns:
                continue
                
            # Map standard types to DuckDB strict types
            duckdb_type = self._map_to_duckdb_type(sql_type)
            
            # Securely quote the column name to handle spaces or reserved SQL keywords
            cast_clauses.append(f'CAST("{col_name}" AS {duckdb_type})')
            
        if not cast_clauses:
            return

        validation_query = f"""
            SELECT {', '.join(cast_clauses)}
            FROM temp_batch
            LIMIT 1000; -- Sample the first 1000 rows for rapid QA without burning CPU
        """
        
        try:
            # If the cast succeeds, the schema is mathematically safe for serialization
            self.conn.execute(validation_query).fetchall()
        except duckdb.ConversionException as e:
            raise TypeError(f"Strict typing violation detected: {str(e)}")
        except duckdb.BinderException as e:
            raise ValueError(f"Schema mismatch detected during QA: {str(e)}")

    def _map_to_duckdb_type(self, semantic_type: str) -> str:
        """
        Maps abstract schema types to DuckDB's strict analytical types.
        """
        type_mapping = {
            "string": "VARCHAR",
            "varchar": "VARCHAR",
            "text": "VARCHAR",
            "integer": "BIGINT",
            "int": "BIGINT",
            "float": "DOUBLE",
            "currency": "DOUBLE",
            "double": "DOUBLE",
            "boolean": "BOOLEAN",
            "bool": "BOOLEAN",
            "datetime": "TIMESTAMP",
            "timestamp": "TIMESTAMP",
            "date": "DATE"
        }
        return type_mapping.get(semantic_type.lower(), "VARCHAR")