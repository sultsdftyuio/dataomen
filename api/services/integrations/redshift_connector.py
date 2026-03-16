import asyncio
import logging
from typing import Dict, Any, List, AsyncGenerator, Optional

# AWS official driver for Redshift. Highly optimized for columnar fetching.
import redshift_connector 

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class RedshiftConnector(BaseIntegration):
    """
    Amazon Redshift Connector for Zero-ETL Syncs and Pushdown Compute.
    
    Adheres to the Modular Strategy:
    - Connects using secure credentials injected via Supabase Vault.
    - Introspects schemas and strictly maps Postgres/Redshift types to DuckDB standard types.
    - Streams massive datasets efficiently via server-side cursors and fetchmany() to prevent memory bloat.
    """

    # Redshift often acts as a central data warehouse containing PII.
    PII_COLUMNS: List[str] = [
        "email", "email_address", "phone", "phone_number", 
        "ssn", "social_security", "credit_card", "ip_address", "first_name", "last_name"
    ]

    def __init__(self, config: IntegrationConfig):
        super().__init__(config)
        
        # Extract connection properties from secure Vault payload
        self.host = self.config.credentials.get("host")
        self.port = self.config.credentials.get("port", 5439)
        self.database = self.config.credentials.get("database")
        self.user = self.config.credentials.get("user")
        self.password = self.config.credentials.get("password")
        self.schema = self.config.credentials.get("schema", "public")
        
        if not all([self.host, self.database, self.user, self.password]):
            logger.error(f"[{self.tenant_id}] Redshift initialization failed: Missing connection parameters.")
            raise ValueError("Redshift requires 'host', 'database', 'user', and 'password' in credentials.")

    def _get_connection(self) -> redshift_connector.Connection:
        """
        Synchronous connection factory. To be executed in a thread pool.
        """
        return redshift_connector.connect(
            host=self.host,
            database=self.database,
            port=self.port,
            user=self.user,
            password=self.password
        )

    async def test_connection(self) -> bool:
        """
        Fast validation to ensure DB credentials are valid and IP isn't blocked by VPC rules.
        """
        def _test():
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT 1 AS health_check")
                    return cursor.fetchone() is not None

        try:
            result = await asyncio.to_thread(_test)
            return result
        except Exception as e:
            logger.error(f"[{self.tenant_id}] Redshift connection test failed: {str(e)}")
            return False

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        The Schema Contract.
        Introspects the Redshift INFORMATION_SCHEMA and maps native types to DuckDB.
        """
        query = f"""
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = '{self.schema}'
        """
        
        def _fetch():
            schema_map: Dict[str, Dict[str, str]] = {}
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(query)
                    rows = cursor.fetchall()
                    
                    for row in rows:
                        table, column, rs_type = row[0], row[1], row[2]
                        if table not in schema_map:
                            schema_map[table] = {}
                        schema_map[table][column] = self._map_redshift_type_to_duckdb(rs_type)
            return schema_map

        try:
            return await asyncio.to_thread(_fetch)
        except Exception as e:
            logger.error(f"[{self.tenant_id}] Redshift schema introspection failed: {str(e)}")
            raise

    async def sync_historical(self, stream_name: str, start_timestamp: Optional[str] = None) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Batch).
        Uses a server-side cursor to fetch massive tables in 10,000 row chunks.
        """
        # Strict formatting to avoid injection, though stream_name comes from the platform
        table_ref = f'"{self.schema}"."{stream_name}"'
        
        query = f"SELECT * FROM {table_ref}"
        
        # Incremental sync / time-travel logic
        if start_timestamp:
            # Assuming a standard updated_at col. SyncEngine should dictate this in production.
            query += f" WHERE updated_at >= '{start_timestamp}'::timestamp"

        def _get_cursor_and_conn():
            conn = self._get_connection()
            # Must set autocommit to false for server-side cursors in PostgreSQL/Redshift
            conn.autocommit = False 
            cursor = conn.cursor()
            cursor.execute(query)
            # Retrieve column names for dict mapping
            columns = [desc[0] for desc in cursor.description]
            return conn, cursor, columns

        def _fetch_chunk(cursor, columns, chunk_size=10000):
            rows = cursor.fetchmany(chunk_size)
            if not rows:
                return None
            # Vectorized-friendly row-to-dict conversion
            return [dict(zip(columns, row)) for row in rows]

        try:
            logger.info(f"[{self.tenant_id}] Starting Redshift sync for {table_ref}")
            
            # Initialize connection and cursor in a thread
            conn, cursor, columns = await asyncio.to_thread(_get_cursor_and_conn)
            
            try:
                while True:
                    # Fetch next chunk asynchronously to unblock the event loop
                    chunk = await asyncio.to_thread(_fetch_chunk, cursor, columns)
                    if not chunk:
                        break
                        
                    yield chunk
            finally:
                # Always clean up DB connections immediately to prevent pool exhaustion
                def _cleanup():
                    cursor.close()
                    conn.rollback() # Required to close the transaction block cleanly
                    conn.close()
                await asyncio.to_thread(_cleanup)

        except Exception as e:
            logger.error(f"[{self.tenant_id}] Redshift historical sync failed for {stream_name}: {str(e)}")
            raise

    # -------------------------------------------------------------------------
    # Internal Helpers
    # -------------------------------------------------------------------------

    def _map_redshift_type_to_duckdb(self, rs_type: str) -> str:
        """
        Translates Redshift (Postgres-like) Data Types into DuckDB native types.
        Ensures strict Parquet type compliance downstream.
        """
        rs_type_upper = rs_type.upper()
        
        # Handle parameterized types e.g., VARCHAR(255) or NUMERIC(10,2)
        base_type = rs_type_upper.split('(')[0].strip()

        mapping = {
            "SMALLINT": "SMALLINT",
            "INT2": "SMALLINT",
            "INTEGER": "INTEGER",
            "INT": "INTEGER",
            "INT4": "INTEGER",
            "BIGINT": "BIGINT",
            "INT8": "BIGINT",
            "DECIMAL": "DECIMAL",
            "NUMERIC": "DECIMAL",
            "REAL": "FLOAT",
            "FLOAT4": "FLOAT",
            "DOUBLE PRECISION": "DOUBLE",
            "FLOAT8": "DOUBLE",
            "FLOAT": "DOUBLE",
            "BOOLEAN": "BOOLEAN",
            "BOOL": "BOOLEAN",
            "CHAR": "VARCHAR",
            "CHARACTER": "VARCHAR",
            "NCHAR": "VARCHAR",
            "VARCHAR": "VARCHAR",
            "CHARACTER VARYING": "VARCHAR",
            "NVARCHAR": "VARCHAR",
            "TEXT": "VARCHAR",
            "DATE": "DATE",
            "TIMESTAMP": "TIMESTAMP",
            "TIMESTAMP WITHOUT TIME ZONE": "TIMESTAMP",
            "TIMESTAMPTZ": "TIMESTAMP", # DuckDB handles timezones differently, standardize to TIMESTAMP
            "TIMESTAMP WITH TIME ZONE": "TIMESTAMP",
            "TIME": "TIME",
            "TIME WITHOUT TIME ZONE": "TIME",
            "TIMETZ": "TIME",
            "TIME WITH TIME ZONE": "TIME",
            "GEOMETRY": "VARCHAR",
            "SUPER": "JSON", # Redshift's SUPER type maps best to JSON
            "HLLSKETCH": "BLOB"
        }
        
        return mapping.get(base_type, "VARCHAR")