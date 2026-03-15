# api/services/integrations/snowflake_connector.py

import logging
import anyio
import contextlib
import pandas as pd
from datetime import datetime
from typing import Dict, Any, List, AsyncGenerator, Optional

# --- Defensive Import Strategy ---
# We gracefully handle the import so the rest of the application doesn't crash 
# if this specific heavy connector isn't installed on a lightweight worker node.
try:
    import snowflake.connector
    from snowflake.connector.errors import DatabaseError
    SNOWFLAKE_AVAILABLE = True
except ImportError:
    SNOWFLAKE_AVAILABLE = False
    DatabaseError = Exception  # Fallback for typing

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class SnowflakeConnector(BaseIntegration):
    """
    Phase 3: Snowflake Zero-ETL Connector (Enterprise Data Warehouse).
    A direct database connector emphasizing Compute Pushdown and Async Threading.
    Leverages Pandas and Apache Arrow for high-throughput vectorized data extraction 
    without blocking the FastAPI event loop.
    """

    # DWs can contain anything, but we set a baseline for the DataSanitizer to hunt for
    PII_COLUMNS = ["EMAIL", "PHONE", "SSN", "FIRST_NAME", "LAST_NAME", "ADDRESS"]

    def __init__(self, tenant_id: str, credentials: Dict[str, str] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="snowflake", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        if not SNOWFLAKE_AVAILABLE:
            logger.error("Attempted to initialize SnowflakeConnector, but 'snowflake-connector-python' is missing.")
            raise ImportError(
                "The Snowflake driver is not installed. "
                "Please run: pip install 'snowflake-connector-python[pandas]>=3.8.0'"
            )

    @contextlib.asynccontextmanager
    async def _get_client(self) -> AsyncGenerator['snowflake.connector.SnowflakeConnection', None]:
        """
        Context manager for safely yielding a Snowflake connection.
        Because Snowflake's driver is inherently synchronous, we offload the network
        I/O of connecting and disconnecting to worker threads via `anyio` to prevent 
        blocking the async event loop.
        """
        creds = self.config.credentials
        
        def _connect():
            return snowflake.connector.connect(
                user=creds.get("user"),
                password=creds.get("password"),
                account=creds.get("account"),
                role=creds.get("role"),
                warehouse=creds.get("warehouse"),
                database=creds.get("database"),
                schema=creds.get("schema", "PUBLIC"),
                # Session parameters for optimal analytical extraction
                session_parameters={
                    'QUERY_TAG': f'dataomen_tenant_{self.tenant_id}',
                    'JDBC_USE_NATIVE_DATETIME': True
                }
            )

        conn = await anyio.to_thread.run_sync(_connect)
        try:
            yield conn
        finally:
            await anyio.to_thread.run_sync(conn.close)

    async def test_connection(self) -> bool:
        """
        Fail-fast connection validation via a lightweight compute query.
        """
        def _ping(conn) -> bool:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    result = cur.fetchone()
                    return result[0] == 1
            except DatabaseError as e:
                logger.error(f"[{self.tenant_id}] Snowflake ping failed: {str(e)}")
                return False

        try:
            async with self._get_client() as client:
                return await anyio.to_thread.run_sync(_ping, client)
        except Exception:
            return False

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        Phase 3.2: Schema Introspection & Contextual RAG.
        Builds a localized metadata graph of the tenant's exact Snowflake tables.
        Translates Snowflake types to strict DuckDB types to guarantee pipeline compatibility.
        """
        # Type mapping from Snowflake to DuckDB
        type_mapping = {
            "NUMBER": "DOUBLE",
            "FLOAT": "DOUBLE",
            "VARCHAR": "VARCHAR",
            "TEXT": "VARCHAR",
            "BOOLEAN": "BOOLEAN",
            "TIMESTAMP_LTZ": "TIMESTAMP",
            "TIMESTAMP_NTZ": "TIMESTAMP",
            "TIMESTAMP_TZ": "TIMESTAMP",
            "DATE": "DATE",
            "VARIANT": "VARCHAR", # JSON stringified
            "OBJECT": "VARCHAR",
            "ARRAY": "VARCHAR"
        }

        def _introspect(conn) -> Dict[str, Any]:
            schema_graph = {}
            query = """
                SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = CURRENT_SCHEMA()
                ORDER BY TABLE_NAME, ORDINAL_POSITION;
            """
            with conn.cursor() as cur:
                cur.execute(query)
                for row in cur.fetchall():
                    table_name, col_name, dtype = row[0], row[1], row[2]
                    
                    table_clean = table_name.lower()
                    
                    if table_clean not in schema_graph:
                        schema_graph[table_clean] = {}
                        
                    # Clean type (e.g., 'NUMBER(38,0)' -> 'NUMBER')
                    base_type = dtype.split("(")[0].upper()
                    duckdb_type = type_mapping.get(base_type, "VARCHAR")
                    
                    schema_graph[table_clean][col_name.lower()] = duckdb_type
                    
            return schema_graph

        async with self._get_client() as client:
            return await anyio.to_thread.run_sync(_introspect, client)

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Phase 3.3: High-Throughput Extraction Pipeline.
        Utilizes `fetch_pandas_batches()` to stream data natively in vectorized DataFrames,
        converts them to dictionaries, and yields them to the SyncEngine.
        """
        safe_table = "".join(c for c in stream_name if c.isalnum() or c == '_').upper()
        
        # Handle timestamp parsing safely
        ts_filter = "2000-01-01 00:00:00"
        if start_timestamp:
            try:
                dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
                ts_filter = dt.strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                pass
        
        # Assuming an UPDATED_AT column exists for delta syncing. 
        # In a generic DW connector, this might need to be configurable.
        query = f"""
            SELECT * FROM {safe_table} 
            WHERE UPDATED_AT >= '{ts_filter}'::TIMESTAMP_NTZ
        """

        def _execute_query(conn):
            cursor = conn.cursor()
            cursor.execute(query)
            # Utilizing the modern C++ backed pandas batch fetcher
            return cursor, cursor.fetch_pandas_batches()

        def _get_next_batch(iterator) -> Optional[List[Dict[str, Any]]]:
            """Helper to safely fetch and convert the next batch synchronously."""
            try:
                df_batch = next(iterator)
                if df_batch is None or df_batch.empty:
                    return None
                
                # Convert timestamps to strings or ints to ensure JSON/Polars serialization succeeds
                for col in df_batch.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]']).columns:
                    df_batch[col] = df_batch[col].astype(str)
                    
                # Convert to the List[Dict] format expected by SyncEngine
                return df_batch.to_dict(orient="records")
            except StopIteration:
                return None

        logger.info(f"[{self.config.tenant_id}] Executing Snowflake async extraction for {safe_table}...")

        async with self._get_client() as client:
            cursor, batch_iterator = await anyio.to_thread.run_sync(_execute_query, client)

            try:
                while True:
                    # Offload the network I/O and Pandas conversion to a separate thread
                    dict_batch = await anyio.to_thread.run_sync(_get_next_batch, batch_iterator)
                    
                    if dict_batch is None:
                        break
                        
                    if dict_batch:
                        yield dict_batch
                    
                    # Explicitly yield control back to the FastAPI event loop to keep the server highly responsive
                    await anyio.sleep(0)
                    
            finally:
                # Ensure the cursor is cleanly released
                await anyio.to_thread.run_sync(cursor.close)

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Option A (Federated Querying Context): 
        If DuckDB is configured with the 'snowflake' extension, we can query Snowflake 
        directly without duplicating data into S3/R2.
        """
        database = self.config.credentials.get("database")
        schema = self.config.credentials.get("schema", "PUBLIC")
        
        return {
            "vw_snowflake_live_accounts": f"""
                -- Federated query directly into the tenant's Snowflake instance
                SELECT * FROM snowflake_scan(
                    '{database}', 
                    '{schema}', 
                    'ACCOUNTS'
                )
            """
        }