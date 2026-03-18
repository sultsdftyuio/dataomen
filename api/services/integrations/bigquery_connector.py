"""
ARCLI.TECH - SaaS Integration Module
Connector: Google BigQuery (Enterprise Data Warehouse)
Strategy: Storage API Vectorization, Compute Pushdown, & Async Threading
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any, List, AsyncGenerator, Optional

import anyio
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# --- Defensive Import Strategy ---
try:
    from google.cloud import bigquery
    from google.oauth2 import service_account
    from google.api_core.exceptions import GoogleAPIError, RetryError
    import pandas as pd
    import numpy as np
    BIGQUERY_AVAILABLE = True
except ImportError:
    BIGQUERY_AVAILABLE = False
    GoogleAPIError = Exception
    RetryError = Exception

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class BigQueryNetworkError(Exception):
    """Custom exception to trigger Tenacity backoff for transient GCP errors."""
    pass

class BigQueryConnector(BaseIntegration):
    """
    Google BigQuery Connector for Zero-ETL Syncs and Pushdown Compute.
    
    Engineering Upgrades:
    - Vectorized Extraction: Uses BigQuery Storage API & Pandas for zero-copy memory transfers.
    - Dynamic Delta Sync: Introspects schemas to safely push timestamp filters to GCP compute.
    - Resilience: Exponential backoff via Tenacity handles transient Google API quotas.
    """

    # BQ often stores raw CRM/App data. Instruct the DataSanitizer to hash these on the fly.
    PII_COLUMNS: List[str] = [
        "email", "email_address", "phone", "phone_number", 
        "ssn", "social_security", "credit_card", "ip_address", "first_name", "last_name"
    ]

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="bigquery", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        if not BIGQUERY_AVAILABLE:
            logger.critical(f"[{self.tenant_id}] Missing 'google-cloud-bigquery'.")
            raise ImportError(
                "The BigQuery driver is not installed. "
                "Please run: pip install 'google-cloud-bigquery[pandas,pyarrow]'"
            )

        # Credentials must contain the service account payload and the target dataset
        raw_sa_info = self.config.credentials.get("service_account_json")
        self.dataset_id = self.config.credentials.get("dataset_id")
        
        if not raw_sa_info:
            logger.error(f"[{self.tenant_id}] BigQuery initialization failed: Missing service_account_json.")
            raise ValueError("BigQuery 'service_account_json' is required in credentials.")
            
        if not self.dataset_id:
            logger.warning(f"[{self.tenant_id}] BigQuery 'dataset_id' not provided. Operations will require explicit project-level scans.")

        # Parse stringified JSON if stored as a secure string in Supabase Vault
        sa_info = json.loads(raw_sa_info) if isinstance(raw_sa_info, str) else raw_sa_info
        self.project_id = sa_info.get("project_id")
        
        try:
            gcp_creds = service_account.Credentials.from_service_account_info(sa_info)
            # Initialize the thread-safe BQ Client
            self.client = bigquery.Client(credentials=gcp_creds, project=self.project_id)
        except Exception as e:
            logger.error(f"[{self.tenant_id}] Failed to authenticate BigQuery client: {str(e)}")
            raise

    async def test_connection(self) -> bool:
        """Fast validation to ensure service account credentials haven't been revoked."""
        def _ping() -> bool:
            try:
                # A lightweight query that costs 0 bytes to process
                query_job = self.client.query("SELECT 1 AS health_check")
                result = query_job.result()
                return len(list(result)) == 1
            except Exception as e:
                logger.error(f"[{self.tenant_id}] BigQuery connection test failed: {str(e)}")
                return False

        try:
            return await anyio.to_thread.run_sync(_ping)
        except Exception:
            return False

    @retry(
        retry=retry_if_exception_type((GoogleAPIError, RetryError, BigQueryNetworkError)),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        stop=stop_after_attempt(5)
    )
    async def fetch_schema(self) -> Dict[str, Any]:
        """
        The Schema Contract.
        Introspects the BigQuery INFORMATION_SCHEMA and maps Google SQL types to DuckDB.
        """
        if not self.dataset_id:
            raise ValueError("A dataset_id must be configured to fetch the schema.")

        query = f"""
            SELECT table_name, column_name, data_type
            FROM `{self.project_id}.{self.dataset_id}.INFORMATION_SCHEMA.COLUMNS`
        """
        
        def _fetch():
            query_job = self.client.query(query)
            rows = query_job.result()
            
            schema_map: Dict[str, Dict[str, str]] = {}
            for row in rows:
                table = row.table_name.lower()
                column = row.column_name.lower()
                bq_type = row.data_type
                
                if table not in schema_map:
                    schema_map[table] = {}
                    
                schema_map[table][column] = self._map_bq_type_to_duckdb(bq_type)
            return schema_map

        try:
            return await anyio.to_thread.run_sync(_fetch)
        except Exception as getattr_err:
            logger.error(f"[{self.tenant_id}] Schema introspection failed: {str(getattr_err)}")
            raise

    async def sync_historical(self, stream_name: str, start_timestamp: Optional[str] = None) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Phase 3.3: High-Throughput Extraction Pipeline.
        Executes a table extract and streams pages back using the BigQuery Storage API 
        (Apache Arrow -> Pandas) to prevent massive memory bloat while maximizing speed.
        """
        safe_table = "".join(c for c in stream_name if c.isalnum() or c == '_')
        table_ref = f"{self.project_id}.{self.dataset_id}.{safe_table}"
        
        # 1. Fetch schema to discover the correct timestamp column for Delta Syncs
        schema_graph = await self.fetch_schema()
        table_schema = schema_graph.get(safe_table.lower(), {})
        
        chronology_col = None
        for col in ["updated_at", "modified_at", "created_at", "timestamp", "_partitiontime"]:
            if col in table_schema:
                chronology_col = col
                break

        # 2. Compute Pushdown Query
        query = f"SELECT * FROM `{table_ref}`"
        ts_filter = "2000-01-01 00:00:00"
        
        if start_timestamp and chronology_col:
            try:
                dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
                ts_filter = dt.strftime("%Y-%m-%d %H:%M:%S")
                # Push computation to BQ to minimize network egress
                query += f" WHERE {chronology_col} >= TIMESTAMP('{ts_filter}')"
                logger.info(f"[{self.tenant_id}] Applying BQ Compute Pushdown: {chronology_col} >= {ts_filter}")
            except ValueError:
                pass

        def _execute_and_get_iterator():
            """Executes query and returns a highly-optimized Pandas dataframe iterator."""
            query_job = self.client.query(query)
            result = query_job.result()
            # BQ Storage API automatically converts Arrow batches to Pandas
            return result.to_dataframe_iterable(max_results=10000)

        def _fetch_vectorized_chunk(iterator) -> Optional[List[Dict[str, Any]]]:
            """Safely fetches, cleanses, and converts the next Pandas batch."""
            try:
                df_batch = next(iterator)
                if df_batch is None or df_batch.empty:
                    return None
                
                # Protect JSON Serialization: Convert Pandas NaT / NaN to pure Python None
                df_batch = df_batch.replace({np.nan: None})
                
                # BigQuery returns TZ-aware datetimes. Clean them for Polars string parsing.
                for col in df_batch.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]', 'datetimetz']).columns:
                    df_batch[col] = df_batch[col].astype(str).replace({'NaT': None, 'nan': None})
                    
                return df_batch.to_dict(orient="records")
            except StopIteration:
                return None

        logger.info(f"[{self.tenant_id}] Starting BigQuery sync for {table_ref}")

        try:
            batch_iterator = await anyio.to_thread.run_sync(_execute_and_get_iterator)
            
            while True:
                # Offload vectorization to background thread
                chunk = await anyio.to_thread.run_sync(_fetch_vectorized_chunk, batch_iterator)
                if not chunk:
                    break
                    
                yield chunk
                
                # Explicitly yield control back to the FastAPI event loop
                await anyio.sleep(0)

        except Exception as e:
            logger.error(f"[{self.tenant_id}] BigQuery historical sync failed for {stream_name}: {str(e)}")
            raise

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Contextual RAG Mapping.
        If Dataomen detects standard BQ exports (like Google Analytics 4), 
        inject pre-calculated views to prevent LLM hallucination.
        """
        return {
            "vw_ga4_daily_active_users": f"""
                -- DuckDB Macro mapped to standard GA4 BigQuery Schema
                SELECT 
                    event_date, 
                    COUNT(DISTINCT user_pseudo_id) as active_users
                FROM `{self.project_id}.{self.dataset_id}.events_*`
                GROUP BY event_date
                ORDER BY event_date DESC
            """,
            "vw_ga4_purchase_revenue": f"""
                SELECT 
                    event_date,
                    SUM(CAST(event_value_in_usd AS DOUBLE)) as daily_revenue
                FROM `{self.project_id}.{self.dataset_id}.events_*`
                WHERE event_name = 'purchase'
                GROUP BY event_date
                ORDER BY event_date DESC
            """
        }

    # -------------------------------------------------------------------------
    # Internal Helpers
    # -------------------------------------------------------------------------

    def _map_bq_type_to_duckdb(self, bq_type: str) -> str:
        """
        Translates BigQuery Standard SQL Data Types into DuckDB native types
        to ensure Parquet compatibility downstream.
        """
        bq_type_upper = bq_type.upper()
        
        # Handle Array types e.g., ARRAY<STRING>
        if bq_type_upper.startswith("ARRAY"):
            return "LIST"
        # Handle Struct types
        if bq_type_upper.startswith("STRUCT"):
            return "STRUCT"

        mapping = {
            "INT64": "BIGINT",
            "FLOAT64": "DOUBLE",
            "NUMERIC": "DECIMAL",
            "BIGNUMERIC": "DECIMAL",
            "BOOL": "BOOLEAN",
            "STRING": "VARCHAR",
            "BYTES": "BLOB",
            "DATE": "DATE",
            "DATETIME": "TIMESTAMP",
            "TIME": "TIME",
            "TIMESTAMP": "TIMESTAMP",
            "GEOGRAPHY": "VARCHAR", # DuckDB spatial handles geometry as varchar initially
            "JSON": "JSON"
        }
        
        return mapping.get(bq_type_upper, "VARCHAR")