"""
ARCLI.TECH - SaaS Integration Module
Connector: Amazon Redshift (Enterprise Data Warehouse)
Strategy: Compute Pushdown, Vectorized Chunking, & Federated Querying
"""

import logging
import contextlib
from datetime import datetime
from typing import Dict, Any, List, AsyncGenerator, Optional

import anyio
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# --- Defensive Import Strategy ---
try:
    import redshift_connector
    from redshift_connector.error import InterfaceError, DatabaseError
    import pandas as pd
    import numpy as np
    REDSHIFT_AVAILABLE = True
except ImportError:
    REDSHIFT_AVAILABLE = False
    InterfaceError = Exception
    DatabaseError = Exception

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class RedshiftConnector(BaseIntegration):
    """
    Amazon Redshift Connector for Zero-ETL Syncs and Pushdown Compute.
    
    Engineering Upgrades:
    - Vectorized Extraction: Buffers `fetchmany` into Pandas DataFrames for C++ speed serialization.
    - Dynamic Delta Sync: Introspects schemas to safely push timestamp filters to Redshift compute.
    - Resilience: Exponential backoff via Tenacity handles paused Serverless Redshift clusters.
    """

    # Redshift often acts as a central data warehouse containing PII.
    PII_COLUMNS: List[str] = [
        "email", "email_address", "phone", "phone_number", 
        "ssn", "social_security", "credit_card", "ip_address", "first_name", "last_name"
    ]

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="redshift", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        # Extract connection properties from secure Vault payload
        self.host = self.config.credentials.get("host")
        self.port = self.config.credentials.get("port", 5439)
        self.database = self.config.credentials.get("database")
        self.user = self.config.credentials.get("user")
        self.password = self.config.credentials.get("password")
        self.schema = self.config.credentials.get("schema", "public")
        
        if not REDSHIFT_AVAILABLE:
            logger.critical(f"[{self.tenant_id}] Missing 'redshift_connector'.")
            raise ImportError("Please run: pip install redshift_connector pandas")
            
        if not all([self.host, self.database, self.user, self.password]):
            logger.error(f"[{self.tenant_id}] Redshift initialization failed: Missing parameters.")
            raise ValueError("Redshift requires 'host', 'database', 'user', and 'password'.")

    @contextlib.asynccontextmanager
    async def _get_client(self) -> AsyncGenerator['redshift_connector.Connection', None]:
        """
        Context manager for safely yielding a Redshift connection.
        Offloads synchronous TCP handshakes to an anyio worker thread.
        """
        def _connect():
            return redshift_connector.connect(
                host=self.host,
                database=self.database,
                port=self.port,
                user=self.user,
                password=self.password
            )

        # Wrap connection in retry logic to survive Redshift Serverless cold starts
        @retry(
            retry=retry_if_exception_type((InterfaceError, DatabaseError, TimeoutError)),
            wait=wait_exponential(multiplier=2, min=2, max=30),
            stop=stop_after_attempt(5)
        )
        def _connect_with_retry():
            return _connect()

        conn = await anyio.to_thread.run_sync(_connect_with_retry)
        try:
            yield conn
        finally:
            await anyio.to_thread.run_sync(conn.close)

    async def test_connection(self) -> bool:
        """Fast validation to ensure DB credentials are valid and IP isn't blocked."""
        def _ping(conn) -> bool:
            try:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT 1 AS health_check")
                    result = cursor.fetchone()
                    return result is not None
            except Exception as e:
                logger.error(f"[{self.tenant_id}] Redshift ping failed: {str(e)}")
                return False

        try:
            async with self._get_client() as client:
                return await anyio.to_thread.run_sync(_ping, client)
        except Exception:
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
        
        def _fetch(conn):
            schema_map: Dict[str, Dict[str, str]] = {}
            with conn.cursor() as cursor:
                cursor.execute(query)
                for row in cursor.fetchall():
                    table, column, rs_type = row[0], row[1], row[2]
                    table_clean = table.lower()
                    
                    if table_clean not in schema_map:
                        schema_map[table_clean] = {}
                        
                    schema_map[table_clean][column.lower()] = self._map_redshift_type_to_duckdb(rs_type)
            return schema_map

        try:
            async with self._get_client() as client:
                return await anyio.to_thread.run_sync(_fetch, client)
        except Exception as e:
            logger.error(f"[{self.tenant_id}] Redshift schema introspection failed: {str(e)}")
            raise

    async def sync_historical(self, stream_name: str, start_timestamp: Optional[str] = None) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Phase 3.3: High-Throughput Extraction Pipeline.
        Uses server-side cursors to fetch 10,000 row chunks, loads them into Pandas 
        for vectorized NaN/NaT sanitization, and yields pure dict batches to the SyncEngine.
        """
        # Strict formatting to avoid injection
        safe_table = "".join(c for c in stream_name if c.isalnum() or c == '_').lower()
        table_ref = f'"{self.schema}"."{safe_table}"'
        
        # 1. Fetch schema to discover the correct timestamp column for Delta Syncs
        schema_graph = await self.fetch_schema()
        table_schema = schema_graph.get(safe_table, {})
        
        chronology_col = None
        for col in ["updated_at", "modified_at", "created_at", "timestamp"]:
            if col in table_schema:
                chronology_col = col
                break

        # 2. Compute Pushdown Query
        ts_filter = "2000-01-01 00:00:00"
        query = f"SELECT * FROM {table_ref}"
        
        if start_timestamp and chronology_col:
            try:
                dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
                ts_filter = dt.strftime("%Y-%m-%d %H:%M:%S")
                # Push computation to Redshift to minimize network egress
                query += f" WHERE {chronology_col} >= '{ts_filter}'::timestamp"
                logger.info(f"[{self.tenant_id}] Applying Redshift Compute Pushdown: {chronology_col} >= {ts_filter}")
            except ValueError:
                pass

        def _execute_and_get_cursor(conn):
            conn.autocommit = False # Required for server-side cursors in Postgres/Redshift
            cursor = conn.cursor()
            cursor.execute(query)
            columns = [desc[0] for desc in cursor.description]
            return cursor, columns

        def _fetch_vectorized_chunk(cursor, columns, chunk_size=10000) -> Optional[List[Dict[str, Any]]]:
            """Uses Pandas to execute vectorized cleansing on the raw tuple chunk."""
            rows = cursor.fetchmany(chunk_size)
            if not rows:
                return None
                
            # Convert to Pandas for zero-cost type coercion and NaN handling
            df_batch = pd.DataFrame(rows, columns=columns)
            
            # Protect JSON Serialization: Convert Pandas NaT / NaN to pure Python None
            df_batch = df_batch.replace({np.nan: None})
            
            for col in df_batch.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]']).columns:
                df_batch[col] = df_batch[col].astype(str).replace({'NaT': None, 'nan': None})
                
            return df_batch.to_dict(orient="records")

        logger.info(f"[{self.tenant_id}] Starting Redshift sync for {table_ref}")

        async with self._get_client() as client:
            cursor, columns = await anyio.to_thread.run_sync(_execute_and_get_cursor, client)
            try:
                while True:
                    # Offload fetch and Pandas vectorization to a background thread
                    chunk = await anyio.to_thread.run_sync(_fetch_vectorized_chunk, cursor, columns)
                    if not chunk:
                        break
                        
                    yield chunk
                    
                    # Yield to event loop to prevent blocking the FastAPI server
                    await anyio.sleep(0)
            finally:
                # Always clean up cursors to prevent Redshift memory leaks
                def _cleanup():
                    cursor.close()
                    client.rollback()
                await anyio.to_thread.run_sync(_cleanup)

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Contextual RAG & Federated Querying Context.
        DuckDB can attach directly to Redshift using the Postgres scanner extension!
        """
        return {
            "vw_redshift_live_revenue": f"""
                -- Federated query: AI Agents can query Redshift in real-time without Zero-ETL 
                -- by attaching the database via DuckDB's postgres_scanner.
                SELECT 
                    date_trunc('day', created_at) AS day,
                    sum(amount) AS daily_revenue
                FROM postgres_scan(
                    'host={self.host} port={self.port} dbname={self.database} user={self.user} password={self.password}', 
                    '{self.schema}', 
                    'transactions'
                )
                GROUP BY 1 ORDER BY 1 DESC
            """
        }

    # -------------------------------------------------------------------------
    # Internal Helpers
    # -------------------------------------------------------------------------

    def _map_redshift_type_to_duckdb(self, rs_type: str) -> str:
        """
        Translates Redshift Data Types into DuckDB native types.
        Ensures strict Parquet type compliance downstream.
        """
        rs_type_upper = rs_type.upper()
        base_type = rs_type_upper.split('(')[0].strip()

        mapping = {
            "SMALLINT": "SMALLINT", "INT2": "SMALLINT",
            "INTEGER": "INTEGER", "INT": "INTEGER", "INT4": "INTEGER",
            "BIGINT": "BIGINT", "INT8": "BIGINT",
            "DECIMAL": "DECIMAL", "NUMERIC": "DECIMAL",
            "REAL": "FLOAT", "FLOAT4": "FLOAT",
            "DOUBLE PRECISION": "DOUBLE", "FLOAT8": "DOUBLE", "FLOAT": "DOUBLE",
            "BOOLEAN": "BOOLEAN", "BOOL": "BOOLEAN",
            "CHAR": "VARCHAR", "CHARACTER": "VARCHAR", "NCHAR": "VARCHAR",
            "VARCHAR": "VARCHAR", "CHARACTER VARYING": "VARCHAR", "NVARCHAR": "VARCHAR", "TEXT": "VARCHAR",
            "DATE": "DATE",
            "TIMESTAMP": "TIMESTAMP", "TIMESTAMP WITHOUT TIME ZONE": "TIMESTAMP",
            "TIMESTAMPTZ": "TIMESTAMP", "TIMESTAMP WITH TIME ZONE": "TIMESTAMP",
            "TIME": "TIME", "TIME WITHOUT TIME ZONE": "TIME",
            "TIMETZ": "TIME", "TIME WITH TIME ZONE": "TIME",
            "GEOMETRY": "VARCHAR",
            "SUPER": "JSON", # Redshift's SUPER type maps best to JSON strings
            "HLLSKETCH": "BLOB"
        }
        
        return mapping.get(base_type, "VARCHAR")