# api/services/duckdb_validator.py

import logging
import duckdb
import polars as pl
import sqlglot
from sqlglot import exp
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

class SecurityError(Exception):
    """Custom exception raised strictly when tenant isolation constraints or SQL guardrails are violated."""
    pass

class DuckDBValidator:
    """
    Phase 1.3 & Phase 6+: Enterprise QA & Security Gatekeeper.
    
    Acts as the absolute perimeter defense for the Analytical Engine:
    1. SQL Execution Guardrails: Uses AST parsing to categorically block destructive LLM queries.
    2. Data Ingestion QA: Context Manager that enforces schema compliance and row-level tenant isolation.
    3. Container Protection: Hardbounds the C++ engine memory to prevent Render/Vercel OOM crashes.
    """
    
    # CRITICAL RENDER FIX: Changed default memory limit from 1GB to 256MB
    # This ensures it stays well under the 512MB strict container limit and forces DuckDB
    # to page safely to disk instead of crashing the server when analyzing massive files.
    def __init__(self, tenant_id: Optional[str] = None, integration_name: Optional[str] = "analytical_engine", memory_limit: str = "256MB"):
        self.tenant_id = tenant_id
        self.integration_name = integration_name
        self.memory_limit = memory_limit
        self.conn = None

    # =========================================================================
    # Phase 1.3: Hard SQL Guardrails (Execution Layer)
    # =========================================================================

    def validate_sql(self, sql_query: str) -> bool:
        """
        Parses the AST of LLM-generated SQL to prevent Prompt Injection 
        and destructive mutations from reaching the database.
        """
        try:
            # Parse the query using DuckDB dialect
            parsed = sqlglot.parse_one(sql_query, read="duckdb")
        except Exception as e:
            # If it can't be parsed, it's either invalid or intentionally obfuscated.
            logger.error(f"SQL parsing failed, query rejected: {e}")
            raise SecurityError(f"Invalid SQL syntax. Execution blocked for safety.")

        # List of forbidden AST node types that mutate state
        forbidden_nodes = (
            exp.Drop,
            exp.Delete,
            exp.Update,
            exp.Insert,
            exp.AlterTable,
            exp.Create,
            exp.Command,  # Blocks PRAGMA or COPY commands injected by LLMs
            exp.Commit,
            exp.Rollback,
        )

        for node_type in forbidden_nodes:
            if list(parsed.find_all(node_type)):
                logger.critical(f"🚨 SECURITY BREACH BLOCKED: Detected destructive SQL command: {node_type.__name__}")
                raise SecurityError(f"Destructive SQL blocked: {node_type.__name__} operations are strictly prohibited.")
        
        # Verify it's structurally a read-only query (SELECT / CTE)
        is_select = isinstance(parsed, (exp.Select, exp.Union))
        has_select = list(parsed.find_all(exp.Select))
        
        if not is_select and not has_select:
             logger.critical(f"🚨 SECURITY BREACH BLOCKED: Query is not a recognized read operation.")
             raise SecurityError("Only read-only SELECT queries are authorized.")
        
        logger.debug("SQL Guardrails passed. Query is read-only and mathematically safe.")
        return True

    # =========================================================================
    # Phase 6+: Data Ingestion QA (Storage Layer)
    # =========================================================================

    def __enter__(self):
        """
        Context Manager Entry: Initializes a highly constrained, ephemeral engine.
        """
        self.conn = duckdb.connect(database=':memory:')
        # Prevent the analytical engine from crashing the container memory
        self.conn.execute(f"PRAGMA memory_limit='{self.memory_limit}'")
        self.conn.execute("PRAGMA threads=4") # Optimize for typical worker core counts
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """
        Context Manager Exit: Mathematically guarantees resource deallocation.
        """
        if self.conn:
            try:
                self.conn.close()
            except Exception as e:
                logger.warning(f"Failed to cleanly close QA DuckDB connection: {e}")
            finally:
                self.conn = None

    def validate_batch(self, df: pl.DataFrame, expected_schema: Dict[str, str]) -> bool:
        """
        The Orchestrator for Ingestion QA Validation.
        Passes the Polars DataFrame via zero-copy Arrow memory directly to DuckDB.
        """
        if df.height == 0:
            return True

        if not self.conn:
            raise RuntimeError("DuckDBValidator must be used as a context manager to validate data batches.")
        
        if not self.tenant_id:
            raise RuntimeError("tenant_id must be provided to validate ingestion batches.")

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
            # Instantly unregister the view to free up Arrow memory
            try:
                self.conn.unregister("temp_batch")
            except:
                pass

    def _audit_tenant_isolation(self) -> None:
        """
        Phase 6.3: Tenant Isolation Audit.
        Runs a hyper-fast vectorized check to ensure EVERY row belongs to the current tenant.
        """
        # We use parameterized execution (?) to mathematically prevent SQL injection.
        query = """
            SELECT count(*) as violation_count 
            FROM temp_batch 
            WHERE _tenant_id != ? OR _tenant_id IS NULL
        """
        
        result = self.conn.execute(query, [self.tenant_id]).fetchone()
        
        if result and result[0] > 0:
            logger.critical(f"🚨 TENANT ISOLATION BREACH DETECTED: {result[0]} rogue rows found for {self.tenant_id}!")
            raise SecurityError("Payload contains cross-tenant data or missing tenant partitions.")
            
        logger.debug(f"[{self.tenant_id}] Tenant isolation audit passed for {self.integration_name}.")

    def _audit_schema_compliance(self, expected_schema: Dict[str, str], current_columns: List[str]) -> None:
        """
        Phase 6.2: Enterprise Schema Integrity.
        Forces DuckDB to execute a `CAST` across the ENTIRE dataset. 
        If row 999,999 has a corrupted string in an integer column, the ingestion fails securely 
        before it can corrupt the analytical Parquet store.
        """
        cast_clauses = []
        
        for col_name, sql_type in expected_schema.items():
            if col_name not in current_columns:
                continue
                
            duckdb_type = self._map_to_duckdb_type(sql_type)
            
            # Security Layer: Escape double quotes in column names to prevent syntax injection
            safe_col_name = col_name.replace('"', '""')
            
            # We wrap the CAST to ensure DuckDB touches the data but doesn't pull it all into Python memory
            cast_clauses.append(f'MAX(CAST("{safe_col_name}" AS {duckdb_type}))')
            
        if not cast_clauses:
            return

        # FULL-BATCH VALIDATION: Vectorized execution handles this natively fast.
        validation_query = f"""
            SELECT {', '.join(cast_clauses)}
            FROM temp_batch
        """
        
        try:
            # Execution proves the dataset is mathematically safe for columnar serialization
            self.conn.execute(validation_query).fetchall()
        except duckdb.ConversionException as e:
            raise TypeError(f"Strict typing violation detected in payload: {str(e)}")
        except duckdb.BinderException as e:
            raise ValueError(f"Schema mismatch or invalid structure detected: {str(e)}")

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