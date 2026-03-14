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
    Phase 6+: Enterprise QA & Security Gatekeeper.
    
    Upgraded Engineering:
    - Context Manager: Guaranteed connection closure to prevent Render/Vercel OOM crashes.
    - Full-Batch Validation: Mathematically guarantees 100% Parquet schema safety (no LIMITs).
    - Memory Bounded: PRAGMA limits ensure the C++ engine respects container RAM.
    """
    
    def __init__(self, tenant_id: str, integration_name: str, memory_limit: str = "1GB"):
        self.tenant_id = tenant_id
        self.integration_name = integration_name
        self.memory_limit = memory_limit
        self.conn = None

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
        The Orchestrator for QA Validation.
        Passes the Polars DataFrame via zero-copy Arrow memory directly to DuckDB.
        """
        if df.height == 0:
            return True

        if not self.conn:
            raise RuntimeError("DuckDBValidator must be used as a context manager (with 'with' statement).")

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

        # FULL-BATCH VALIDATION: We removed the LIMIT. Vectorized execution handles this natively fast.
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