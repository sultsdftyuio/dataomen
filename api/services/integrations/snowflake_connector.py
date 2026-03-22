"""
ARCLI.TECH - SaaS Integration Module
Connector: Snowflake (Enterprise Data Warehouse)
Strategy: Compute Pushdown, Precision Mapping, Projection Pushdown, & Async Vectorization
"""

import logging
import contextlib
import time
from datetime import datetime
from typing import Dict, Any, List, AsyncGenerator, Optional

import anyio
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

try:
    import snowflake.connector
    from snowflake.connector.errors import DatabaseError, OperationalError
    import numpy as np
    SNOWFLAKE_AVAILABLE = True
except ImportError:
    SNOWFLAKE_AVAILABLE = False
    DatabaseError = Exception
    OperationalError = Exception

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)


class SnowflakeConnector(BaseIntegration):

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

        if not SNOWFLAKE_AVAILABLE:
            raise ImportError("snowflake-connector-python is required")

        self._schema_cache: Optional[Dict[str, Any]] = None
        self._schema_cache_time: float = 0

    # ---------------------------------------------------------------------
    # Connection
    # ---------------------------------------------------------------------

    @contextlib.asynccontextmanager
    async def _get_client(self):
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

        conn = await anyio.to_thread.run_sync(_connect_retry)
        try:
            yield conn
        finally:
            await anyio.to_thread.run_sync(conn.close)

    # ---------------------------------------------------------------------
    # Schema (Cached + Precision Safe)
    # ---------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        now = time.time()

        if self._schema_cache and (now - self._schema_cache_time < self.SCHEMA_CACHE_TTL):
            return self._schema_cache

        def _introspect(conn):
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
                    elif base in ["VARCHAR", "TEXT"]:
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
            schema = await anyio.to_thread.run_sync(_introspect, conn)

        self._schema_cache = schema
        self._schema_cache_time = now

        return schema

    # ---------------------------------------------------------------------
    # Sync
    # ---------------------------------------------------------------------

    async def sync_stream(
        self,
        stream_name: str,
        start_timestamp: Optional[str] = None,
        selected_columns: Optional[List[str]] = None,
        limit: Optional[int] = None,
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:

        safe_table = "".join(c for c in stream_name if c.isalnum() or c == "_").upper()

        schema = await self.fetch_schema()
        table_schema = schema.get(safe_table.lower())

        if not table_schema:
            raise ValueError(f"Table {safe_table} not found")

        # --- Column projection ---
        if selected_columns:
            cols = [c for c in selected_columns if c.lower() in table_schema]
        else:
            cols = list(table_schema.keys())

        col_sql = ", ".join([f'"{c.upper()}"' for c in cols])

        # --- Detect timestamp column ---
        chrono_col = None
        for c in ["updated_at", "created_at", "modified_at"]:
            if c in table_schema:
                chrono_col = c
                break

        query = f"SELECT {col_sql} FROM {safe_table}"

        if start_timestamp and chrono_col:
            dt = datetime.fromisoformat(start_timestamp.replace("Z", "+00:00"))
            ts = dt.strftime("%Y-%m-%d %H:%M:%S")
            query += f" WHERE {chrono_col.upper()} >= '{ts}'"

        if limit:
            query += f" LIMIT {limit}"

        logger.info(f"[{self.tenant_id}] Querying {safe_table}")

        def _execute(conn):
            cur = conn.cursor()
            cur.execute(query)
            return cur, cur.fetch_pandas_batches(self.DEFAULT_BATCH_SIZE)

        def _next_batch(iterator):
            try:
                df = next(iterator)
                if df is None or df.empty:
                    return None

                df = df.replace({np.nan: None})

                for col in df.select_dtypes(include=["datetime64[ns]"]).columns:
                    df[col] = df[col].astype(str).replace({"NaT": None})

                return df.to_dict(orient="records")

            except StopIteration:
                return None

        async with self._get_client() as conn:
            cursor, iterator = await anyio.to_thread.run_sync(_execute, conn)

            try:
                while True:
                    batch = await anyio.to_thread.run_sync(_next_batch, iterator)

                    if batch is None:
                        break

                    yield batch

                    await anyio.sleep(0)

            finally:
                await anyio.to_thread.run_sync(cursor.close)

    # ---------------------------------------------------------------------
    # Sampling Mode (Fast UX)
    # ---------------------------------------------------------------------

    async def sample_table(self, table: str, limit: int = 1000):
        async for batch in self.sync_stream(table, limit=limit):
            return batch
        return []

    # ---------------------------------------------------------------------
    # Semantic Views
    # ---------------------------------------------------------------------

    def get_semantic_views(self) -> Dict[str, str]:
        db = self.config.credentials.get("database")
        schema = self.config.credentials.get("schema", "PUBLIC")

        return {
            "vw_snowflake_live": f"""
                SELECT * FROM snowflake_scan('{db}', '{schema}', 'SOME_TABLE')
            """
        }