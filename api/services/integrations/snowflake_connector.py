"""
ARCLI.TECH - SaaS Integration Module
Connector: Snowflake (Enterprise Data Warehouse)
Strategy: Compute Pushdown, Async Threading, & Vectorized Extraction
"""

import logging
import contextlib
from datetime import datetime
from typing import Dict, Any, List, AsyncGenerator, Optional

import anyio
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# --- Defensive Import Strategy ---
# Gracefully handle the import so the application doesn't crash 
# if this heavy connector isn't installed on lightweight edge nodes.
try:
    import snowflake.connector
    from snowflake.connector.errors import DatabaseError, OperationalError
    import pandas as pd
    import numpy as np
    SNOWFLAKE_AVAILABLE = True
except ImportError:
    SNOWFLAKE_AVAILABLE = False
    DatabaseError = Exception  # Fallback for typing
    OperationalError = Exception

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class SnowflakeConnector(BaseIntegration):
    """
    Phase 3: Snowflake Zero-ETL Connector (Enterprise Data Warehouse).
    Leverages Pandas and Apache Arrow for high-throughput vectorized data extraction 
    without blocking the FastAPI event loop.
    """

    # Data Warehouses can contain anything, but we set a baseline for the DataSanitizer to hunt for
    PII_COLUMNS = ["EMAIL", "PHONE", "SSN", "FIRST_NAME", "LAST_NAME", "ADDRESS", "CUSTOMER_EMAIL"]

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="snowflake", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        if not SNOWFLAKE_AVAILABLE:
            logger.critical(f"[{self.tenant_id}] Missing 'snowflake-connector-python'.")
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
        blocking the async event loop (Hybrid Performance Paradigm).
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

        # Wrap connection in retry logic to survive transient warehouse wake-up timeouts
        @retry(
            retry=retry_if_exception_type((OperationalError, DatabaseError)),
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
        """Fail-fast connection validation via a lightweight compute query."""
        def _ping(conn) -> bool:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    result = cur.fetchone()
                    return result is not None and result[0] == 1
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
        safely serializes NaN/NaT, and yields batches to the SyncEngine.
        """
        safe_table = "".join(c for c in stream_name if c.isalnum() or c == '_').upper()
        
        # 1. Fetch current schema to intelligently inject Delta Sync logic
        schema_graph = await self.fetch_schema()
        table_schema = schema_graph.get(safe_table.lower(), {})
        
        # Detect chronology column for Compute Pushdown (Delta Sync)
        chronology_col = None
        for col in ["UPDATED_AT", "MODIFIED_AT", "CREATED_AT", "TIMESTAMP"]:
            if col.lower() in table_schema:
                chronology_col = col
                break

        # 2. Construct Safe SQL Query
        ts_filter = "2000-01-01 00:00:00"
        query = f"SELECT * FROM {safe_table}"
        
        if start_timestamp and chronology_col:
            try:
                dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
                ts_filter = dt.strftime("%Y-%m-%d %H:%M:%S")
                # Push down the filter to Snowflake's compute engine
                query += f" WHERE {chronology_col} >= '{ts_filter}'::TIMESTAMP_NTZ"
                logger.info(f"[{self.tenant_id}] Applying Compute Pushdown Delta Sync via {chronology_col} >= {ts_filter}")
            except ValueError:
                logger.warning(f"[{self.tenant_id}] Invalid start_timestamp. Defaulting to full table scan.")

        # 3. Execution Helpers
        def _execute_query(conn):
            cursor = conn.cursor()
            cursor.execute(query)
            # Utilizing the modern C++ backed pandas batch fetcher (Zero-Copy extraction)
            return cursor, cursor.fetch_pandas_batches()

        def _get_next_batch(iterator) -> Optional[List[Dict[str, Any]]]:
            """Helper to safely fetch, sanitize, and convert the next batch synchronously."""
            try:
                df_batch = next(iterator)
                if df_batch is None or df_batch.empty:
                    return None
                
                # A. Protect JSON Serialization: Convert Pandas NaT / NaN to pure Python None
                df_batch = df_batch.replace({np.nan: None})
                
                # B. Stringify timestamps to prevent Polars type coercion panics down the line
                for col in df_batch.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]']).columns:
                    # fillna strictly required again after type conversion
                    df_batch[col] = df_batch[col].astype(str).replace({'NaT': None, 'nan': None})
                    
                # C. Convert to the List[Dict] format expected by SyncEngine
                return df_batch.to_dict(orient="records")
            except StopIteration:
                return None
            except Exception as e:
                logger.error(f"[{self.tenant_id}] Pandas Batch Conversion Error: {str(e)}")
                raise

        logger.info(f"[{self.config.tenant_id}] Executing Snowflake async extraction for {safe_table}...")

        async with self._get_client() as client:
            cursor, batch_iterator = await anyio.to_thread.run_sync(_execute_query, client)

            try:
                while True:
                    # Offload the Pandas manipulation to a thread to keep the Event Loop free
                    dict_batch = await anyio.to_thread.run_sync(_get_next_batch, batch_iterator)
                    
                    if dict_batch is None:
                        break
                        
                    if dict_batch:
                        yield dict_batch
                    
                    # Explicitly yield control back to the FastAPI event loop
                    await anyio.sleep(0)
                    
            finally:
                # Ensure the cursor is cleanly released to free up Snowflake warehouse memory
                await anyio.to_thread.run_sync(cursor.close)

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Option A (Federated Querying Context): 
        If DuckDB is configured with the 'snowflake' extension, we can inject this into
        the Contextual RAG to query Snowflake directly without duplicating data into S3/R2.
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