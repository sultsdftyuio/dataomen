"""
ARCLI.TECH - SaaS Integration Module
Connector: Snowflake (Enterprise Data Warehouse)
Strategy: Compute Pushdown, Vectorized Pandas Extraction, & Async Threading

Changelog v1.1:
- [FIX] Thread pool exhaustion: Dedicated CapacityLimiter(10) isolates Snowflake's
  blocking C-extensions from the global anyio thread pool.
- [FIX] Hung query protection: asyncio.timeout wraps every threaded call with a
  hard kill at QUERY_TIMEOUT_SECONDS + 300s.
"""

import asyncio
import logging
import contextlib
import time
from datetime import datetime
from typing import Dict, Any, List, AsyncGenerator, Optional

import anyio
from anyio import CapacityLimiter, to_thread
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

try:
    import snowflake.connector
    from snowflake.connector.errors import DatabaseError, OperationalError
    import pandas as pd
    import numpy as np
    SNOWFLAKE_AVAILABLE = True
except ImportError:
    SNOWFLAKE_AVAILABLE = False
    DatabaseError = Exception
    OperationalError = Exception

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FIX: Dedicated capacity limiter — prevents Snowflake's blocking C-extensions
# from starving the global anyio thread pool. Exactly 10 concurrent Snowflake
# threads system-wide, isolated from FastAPI worker threads.
# ---------------------------------------------------------------------------
_snowflake_limiter = CapacityLimiter(10)


class SnowflakeConnector(BaseIntegration):
    """
    Phase 8: Snowflake Zero-ETL Connector.

    Engineering Standards:
    - Vectorization: Uses `fetch_pandas_batches()` via Arrow to securely pull millions 
      of rows in highly-compressed columnar chunks, converting them directly to DuckDB formats.
    - Precision Mapping: Dynamically converts Snowflake's NUMBER(p,s) to either BIGINT
      or DECIMAL(p,s) depending on scale to prevent floating-point drift on financial data.
    - Async Threading: Wraps Snowflake's blocking native C-extensions in `anyio.to_thread`
      to prevent the FastAPI event loop from stalling during heavy EDW pulls.
    """

    PII_COLUMNS = ["EMAIL", "PHONE", "SSN", "FIRST_NAME", "LAST_NAME"]

    SCHEMA_CACHE_TTL = 600  # 10 minutes
    DEFAULT_BATCH_SIZE = 50000
    QUERY_TIMEOUT_SECONDS = 1800  # 30 min

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name="snowflake",
            credentials=credentials or {},
        )
        super().__init__(config)

        # Hard timeout = query timeout + 5 min buffer for connection + result transfer
        self._thread_timeout_seconds = self.QUERY_TIMEOUT_SECONDS + 300

        if not SNOWFLAKE_AVAILABLE:
            raise ImportError("snowflake-connector-python and pandas are required")

        self._schema_cache: Optional[Dict[str, Any]] = None
        self._schema_cache_time: float = 0

    # ---------------------------------------------------------------------
    # Connection Management
    # ---------------------------------------------------------------------

    # -----------------------------------------------------------------
    # FIX: Isolated thread execution with hard timeout
    # -----------------------------------------------------------------

    async def _execute_with_timeout(self, func, *args):
        """
        Run a blocking function in the dedicated Snowflake thread pool with
        a hard asyncio timeout. This prevents:
        1. Snowflake's C-extensions from starving the global anyio pool.
        2. A hung query from blocking the FastAPI worker indefinitely.
        """
        async with asyncio.timeout(self._thread_timeout_seconds):
            return await to_thread.run_sync(func, *args, limiter=_snowflake_limiter)

    @contextlib.asynccontextmanager
    async def _get_client(self):
        """Yields a thread-safe Snowflake connection."""
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
                session_parameters={
                    "QUERY_TAG": f"arcli_{self.tenant_id}",
                    "STATEMENT_TIMEOUT_IN_SECONDS": self.QUERY_TIMEOUT_SECONDS,
                },
            )

        @retry(
            retry=retry_if_exception_type((OperationalError, DatabaseError)),
            wait=wait_exponential(min=2, max=30),
            stop=stop_after_attempt(5),
        )
        def _connect_retry():
            return _connect()

        conn = await self._execute_with_timeout(_connect_retry)
        try:
            yield conn
        finally:
            await self._execute_with_timeout(conn.close)

    async def test_connection(self) -> bool:
        """Lightweight check invoked by the orchestrator to verify credentials."""
        try:
            async with self._get_client() as conn:
                def _test():
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                        return cur.fetchone() is not None
                return await self._execute_with_timeout(_test)
        except asyncio.TimeoutError:
            logger.error("[%s] Snowflake connection test timed out after %ds", self.tenant_id, self._thread_timeout_seconds)
            return False
        except Exception as e:
            logger.error("[%s] Snowflake connection failed: %s", self.tenant_id, str(e))
            return False

    # ---------------------------------------------------------------------
    # Schema Introspection (Cached + Precision Safe)
    # ---------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        """Maps Snowflake internal types to strict DuckDB / Parquet schemas."""
        now = time.time()

        if self._schema_cache and (now - self._schema_cache_time < self.SCHEMA_CACHE_TTL):
            return self._schema_cache

        def _introspect(conn) -> Dict[str, Any]:
            schema = {}

            query = """
                SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = CURRENT_SCHEMA()
                ORDER BY TABLE_NAME, ORDINAL_POSITION;
            """

            with conn.cursor() as cur:
                cur.execute(query)
                for table, col, dtype in cur.fetchall():
                    table = table.lower()
                    if table not in schema:
                        schema[table] = {}

                    clean = dtype.upper()
                    base = clean.split("(")[0]

                    # --- Precision-aware mapping ---
                    if base == "NUMBER":
                        if "," in clean:
                            precision_scale = clean.split("(")[1].rstrip(")")
                            precision, scale = map(int, precision_scale.split(","))
                            if scale == 0:
                                mapped = "BIGINT"
                            else:
                                mapped = f"DECIMAL({precision},{scale})"
                        else:
                            mapped = "DOUBLE"

                    elif base in ["FLOAT", "DOUBLE"]:
                        mapped = "DOUBLE"
                    elif base in ["VARCHAR", "TEXT", "STRING"]:
                        mapped = "VARCHAR"
                    elif base == "BOOLEAN":
                        mapped = "BOOLEAN"
                    elif "TIMESTAMP" in base:
                        mapped = "TIMESTAMP"
                    elif base == "DATE":
                        mapped = "DATE"
                    else:
                        mapped = "VARCHAR"

                    schema[table][col.lower()] = mapped

            return schema

        async with self._get_client() as conn:
            schema = await self._execute_with_timeout(_introspect, conn)

        self._schema_cache = schema
        self._schema_cache_time = now

        return schema

    # ---------------------------------------------------------------------
    # Core Sync Execution (Vectorized)
    # ---------------------------------------------------------------------

    async def sync_stream(
        self,
        stream_name: str,
        start_timestamp: Optional[str] = None,
        selected_columns: Optional[List[str]] = None,
        limit: Optional[int] = None,
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        
        # Sanitize against SQL injection in table name
        safe_table = "".join(c for c in stream_name if c.isalnum() or c == "_").upper()

        schema = await self.fetch_schema()
        table_schema = schema.get(safe_table.lower())

        if not table_schema:
            raise ValueError(f"Table {safe_table} not found in Snowflake schema")

        # Column projection pushdown
        if selected_columns:
            cols = [c for c in selected_columns if c.lower() in table_schema]
        else:
            cols = list(table_schema.keys())

        col_sql = ", ".join([f'"{c.upper()}"' for c in cols])

        # Auto-detect CDC / Incremental timestamp columns
        chrono_col = None
        for c in ["UPDATED_AT", "CREATED_AT", "MODIFIED_AT", "TIMESTAMP"]:
            if c.lower() in table_schema:
                chrono_col = c
                break

        query = f"SELECT {col_sql} FROM {safe_table}"

        if start_timestamp and chrono_col:
            dt = datetime.fromisoformat(start_timestamp.replace("Z", "+00:00"))
            ts = dt.strftime("%Y-%m-%d %H:%M:%S")
            query += f" WHERE {chrono_col.upper()} >= '{ts}'"

        if limit:
            query += f" LIMIT {limit}"

        logger.info("[%s] Executing Snowflake Pushdown: %s", self.tenant_id, safe_table)

        def _execute_and_fetch(conn):
            cur = conn.cursor()
            try:
                cur.execute(query)
                # fetch_pandas_batches is a massive memory/CPU optimization
                for df in cur.fetch_pandas_batches(self.DEFAULT_BATCH_SIZE):
                    if df is None or df.empty:
                        continue
                    
                    # Clean the dataframe
                    df = df.replace({np.nan: None})
                    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                        df[col] = df[col].astype(str).replace({"NaT": None})

                    yield df.to_dict(orient="records")
            finally:
                cur.close()

        # Isolate blocking generator iteration to the dedicated Snowflake thread pool.
        # Each call is wrapped in asyncio.timeout to prevent hung queries from
        # blocking the FastAPI worker indefinitely.
        async with self._get_client() as conn:
            iterator = await self._execute_with_timeout(_execute_and_fetch, conn)
            
            while True:
                try:
                    # Pull next chunk from the dedicated thread pool
                    batch = await self._execute_with_timeout(next, iterator)
                    
                    # Security boundary: Mask PII before yielding to async application space
                    batch = self._mask_pii(batch)
                    
                    yield batch
                    
                    # Yield event loop
                    await anyio.sleep(0)
                except (StopIteration, asyncio.TimeoutError) as exc:
                    if isinstance(exc, asyncio.TimeoutError):
                        logger.error(
                            "[%s] Snowflake query timed out after %ds during batch iteration",
                            self.tenant_id, self._thread_timeout_seconds,
                        )
                    break

    # ---------------------------------------------------------------------
    # Security & Masking
    # ---------------------------------------------------------------------

    def _mask_pii(self, batch: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Applies DataSanitizer masking securely across potential case variations."""
        if not hasattr(self, 'data_sanitizer') or not self.data_sanitizer:
            return batch

        for row in batch:
            # Snowflake standardizes columns to uppercase, but we check comprehensively
            for key in list(row.keys()):
                if key.upper() in self.PII_COLUMNS and row[key]:
                    row[key] = self.data_sanitizer.mask(row[key])
        return batch

    # ---------------------------------------------------------------------
    # Semantic Views
    # ---------------------------------------------------------------------

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Since EDWs don't have static schemas like SaaS tools, we map an empty 
        view dictionary here to prevent the AI orchestrator from throwing missing view errors.
        Dynamic view mapping for Snowflake is handled at the QueryPlanner RAG layer.
        """
        return {}