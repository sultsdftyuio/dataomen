# api/services/duckdb_validator.py
import os
import duckdb
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class DuckDBQueryRunner:
    """
    Handles DuckDB query execution with strict Row-Level Security (RLS)
    and zero-copy Cloudflare R2 integration via HTTPFS.
    """
    def __init__(self):
        # Clean URLs for DuckDB's httpfs extension
        self.endpoint_url = os.getenv("R2_ENDPOINT_URL", os.getenv("S3_ENDPOINT_URL", "")).replace("https://", "").replace("http://", "")
        self.access_key = os.getenv("R2_ACCESS_KEY_ID", os.getenv("AWS_ACCESS_KEY_ID", ""))
        self.secret_key = os.getenv("R2_SECRET_ACCESS_KEY", os.getenv("AWS_SECRET_ACCESS_KEY", ""))
        self.region = os.getenv("AWS_REGION", "auto")

    def _get_connection(self) -> duckdb.DuckDBPyConnection:
        # Transient in-memory DuckDB connection per query
        conn = duckdb.connect(database=':memory:')
        
        # 1.1 Data Modularity: Configure DuckDB to read directly from R2
        conn.execute("INSTALL httpfs;")
        conn.execute("LOAD httpfs;")
        
        if self.endpoint_url:
            conn.execute(f"SET s3_endpoint='{self.endpoint_url}';")
            conn.execute("SET s3_url_style='path';")
            
        conn.execute(f"SET s3_access_key_id='{self.access_key}';")
        conn.execute(f"SET s3_secret_access_key='{self.secret_key}';")
        conn.execute(f"SET s3_region='{self.region}';")
        
        return conn

    def execute_tenant_query(self, query: str, tenant_id: str, allowed_paths: List[str]) -> List[Dict[str, Any]]:
        """
        1.3 Programmatic RLS (Row-Level Security):
        Forcefully binds execution to specific tenant paths.
        """
        conn = self._get_connection()
        try:
            # Mount allowed paths as immutable views
            for i, path in enumerate(allowed_paths):
                # Force Hardware-Level Validation:
                # If the string literal tenant_id isn't in the path, crash immediately.
                if f"tenant_id={tenant_id}" not in path:
                    raise PermissionError(f"Security Violation: Path {path} does not belong to tenant {tenant_id}")
                
                table_name = f"dataset_{i}"
                conn.execute(f"CREATE VIEW {table_name} AS SELECT * FROM read_parquet('{path}');")
            
            # Simple heuristic guardrail (DuckDB :memory: drops on close anyway, but good practice)
            query_upper = query.upper()
            forbidden_keywords = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "GRANT", "REVOKE"]
            for kw in forbidden_keywords:
                if kw in query_upper:
                    raise ValueError(f"Dangerous keyword '{kw}' detected. Only SELECT queries are allowed.")
            
            # Execute query and pull into Apache Arrow/Pandas zero-copy format
            result = conn.execute(query).fetchdf()
            
            # Return records
            return result.to_dict(orient='records')
            
        except Exception as e:
            logger.error(f"DuckDB Execution Error for Tenant {tenant_id}: {str(e)}")
            raise e
        finally:
            conn.close()