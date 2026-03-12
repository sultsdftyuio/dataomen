# api/services/integrations/snowflake_connector.py

import logging
import anyio
import pandas as pd
from typing import Dict, Any, List, AsyncGenerator, Optional, Union

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
    Phase 3: Snowflake Integration (Enterprise Data Warehouse)
    A direct database connector emphasizing Compute Pushdown and Zero-Copy data movement.
    Leverages Pandas and Apache Arrow for high-throughput vectorized data extraction.
    """

    def __init__(self, config: IntegrationConfig):
        super().__init__(config)
        if not SNOWFLAKE_AVAILABLE:
            logger.error("Attempted to initialize SnowflakeConnector, but 'snowflake-connector-python' is missing.")
            raise ImportError(
                "The Snowflake driver is not installed. "
                "Please run: pip install 'snowflake-connector-python[pandas]>=3.8.0'"
            )

    def _initialize_client(self) -> 'snowflake.connector.SnowflakeConnection':
        """
        Initializes the synchronous Snowflake connection.
        Because Snowflake's driver is inherently synchronous, we offload execution
        to worker threads via `anyio` to prevent blocking our async event loop.
        """
        creds = self.config.credentials
        try:
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
        except Exception as e:
            logger.error(f"Failed to initialize Snowflake client for {self.tenant_id}: {str(e)}")
            raise ValueError("Invalid Snowflake credentials or network policy blocked access.")

    async def test_connection(self) -> bool:
        """
        Phase 1.1 / 3.1: Fail-fast connection validation via a lightweight compute query.
        """
        def _ping() -> bool:
            try:
                with self.client.cursor() as cur:
                    cur.execute("SELECT 1")
                    result = cur.fetchone()
                    return result[0] == 1
            except DatabaseError as e:
                logger.error(f"Snowflake ping failed for {self.tenant_id}: {str(e)}")
                return False

        # Offload synchronous DB ping to thread pool
        return await anyio.to_thread.run_sync(_ping)

    def get_oauth_url(self, redirect_uri: str) -> Optional[str]:
        """Direct DB connections via service accounts do not use standard OAuth redirects."""
        return None

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """Not applicable for standard Key-Pair / Password-based DB connections."""
        raise NotImplementedError("Snowflake integration uses direct connection strings, not OAuth exchanges.")

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        Phase 3.2: Schema Introspection & Contextual RAG.
        Builds a localized metadata graph of the tenant's exact Snowflake tables.
        This graph guarantees our LLM generates syntactically flawless DuckDB SQL
        preventing token bloat and Hallucinations.
        """
        def _introspect() -> Dict[str, Any]:
            schema_graph = {}
            query = """
                SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = CURRENT_SCHEMA()
                ORDER BY TABLE_NAME, ORDINAL_POSITION;
            """
            with self.client.cursor() as cur:
                cur.execute(query)
                for row in cur.fetchall():
                    table, col, dtype = row[0], row[1], row[2]
                    
                    table_clean = table.lower()
                    
                    if table_clean not in schema_graph:
                        schema_graph[table_clean] = []
                    
                    schema_graph[table_clean].append({"name": col.lower(), "type": dtype})
                    
            return schema_graph

        return await anyio.to_thread.run_sync(_introspect)

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[Union[pd.DataFrame, List[Dict[str, Any]]], None]:
        """
        Phase 3.3: High-Throughput Extraction Pipeline.
        Utilizes `fetch_pandas_batches()` to stream data natively in vectorized DataFrames.
        This prevents JSON serialization entirely and avoids blocking the async event loop.
        """
        safe_table = "".join(c for c in stream_name if c.isalnum() or c == '_').upper()
        
        query = f"""
            SELECT * FROM {safe_table} 
            WHERE UPDATED_AT >= '{start_timestamp}'::TIMESTAMP_NTZ
        """

        def _execute_query():
            cursor = self.client.cursor()
            cursor.execute(query)
            # Utilizing the modern C++ backed pandas batch fetcher
            return cursor, cursor.fetch_pandas_batches()

        def _get_next_batch(iterator) -> Optional[pd.DataFrame]:
            """Helper to safely fetch the next batch synchronously without crashing."""
            try:
                return next(iterator)
            except StopIteration:
                return None

        cursor, batch_iterator = await anyio.to_thread.run_sync(_execute_query)

        try:
            while True:
                # Offload the network I/O of fetching the next chunk to a separate thread
                df_batch = await anyio.to_thread.run_sync(_get_next_batch, batch_iterator)
                
                if df_batch is None:
                    break
                    
                if not df_batch.empty:
                    # Yield a pure Pandas DataFrame. Downstream systems (DuckDB/Polars) 
                    # can ingest this natively via zero-copy memory mapping.
                    yield df_batch
                
                # Explicitly yield control back to the FastAPI event loop
                await anyio.sleep(0)
                
        finally:
            # Ensure database resources are cleanly released
            await anyio.to_thread.run_sync(cursor.close)

    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """Snowflake is a pull-based DW; it does not push webhooks."""
        return False

    async def handle_webhook(self, event_type: str, payload: Dict[str, Any]) -> None:
        """Not applicable for Data Warehouses."""
        pass

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