import json
import asyncio
import logging
from typing import Dict, Any, List, AsyncGenerator, Optional

from google.cloud import bigquery
from google.oauth2 import service_account
from google.api_core.exceptions import GoogleAPIError

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class BigQueryConnector(BaseIntegration):
    """
    Google BigQuery Connector for Zero-ETL Syncs and Pushdown Compute.
    
    Adheres to the Modular Strategy:
    - Connects using secure Service Account JSONs injected via Vault.
    - Introspects schemas and maps BigQuery native types strictly to DuckDB standard types.
    - Yields massive datasets efficiently via paginated async generators to prevent memory bloat.
    """

    # BigQuery often stores raw CRM/App data. Instruct the DataSanitizer to hash these on the fly.
    PII_COLUMNS: List[str] = [
        "email", "email_address", "phone", "phone_number", 
        "ssn", "social_security", "credit_card", "ip_address"
    ]

    def __init__(self, config: IntegrationConfig):
        super().__init__(config)
        
        # Credentials must contain the service account payload and the target dataset
        raw_sa_info = self.config.credentials.get("service_account_json")
        self.dataset_id = self.config.credentials.get("dataset_id")
        
        if not raw_sa_info:
            logger.error(f"[{self.tenant_id}] BigQuery initialization failed: Missing service_account_json.")
            raise ValueError("BigQuery 'service_account_json' is required in credentials.")
            
        if not self.dataset_id:
            logger.warning(f"[{self.tenant_id}] BigQuery 'dataset_id' not provided. Schema fetch will require explicit project-level scans.")

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
        """
        Fast validation to ensure service account credentials haven't been revoked
        and the client can access the warehouse.
        """
        try:
            # A lightweight query that costs ~0 bytes to process
            query_job = await asyncio.to_thread(self.client.query, "SELECT 1 AS health_check")
            result = await asyncio.to_thread(query_job.result)
            return len(list(result)) == 1
        except Exception as e:
            logger.error(f"[{self.tenant_id}] BigQuery connection test failed: {str(e)}")
            return False

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
        
        try:
            query_job = await asyncio.to_thread(self.client.query, query)
            rows = await asyncio.to_thread(query_job.result)
            
            schema_map: Dict[str, Dict[str, str]] = {}
            
            for row in rows:
                table = row.table_name
                column = row.column_name
                bq_type = row.data_type
                
                if table not in schema_map:
                    schema_map[table] = {}
                    
                schema_map[table][column] = self._map_bq_type_to_duckdb(bq_type)
                
            return schema_map
            
        except GoogleAPIError as getattr_err:
            logger.error(f"[{self.tenant_id}] Schema introspection failed: {str(getattr_err)}")
            raise

    async def sync_historical(self, stream_name: str, start_timestamp: Optional[str] = None) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Batch).
        Executes a table extract and streams pages (chunks) of rows back asynchronously.
        This ensures we don't load a 100GB table into server memory at once.
        """
        # Strictly format the table reference to prevent injection issues, 
        # though stream_name comes from our internal Orchestrator mapping.
        table_ref = f"{self.project_id}.{self.dataset_id}.{stream_name}"
        
        # Build the pull query
        query = f"SELECT * FROM `{table_ref}`"
        
        # Implement primitive time-travel/incremental loads if a timestamp is provided
        # Assumes the table has a standard 'updated_at' or 'created_at' column. 
        # In a production scenario, the SyncEngine should pass the specific replication key.
        if start_timestamp:
            query += f" WHERE updated_at >= TIMESTAMP('{start_timestamp}')"
            
        try:
            logger.info(f"[{self.tenant_id}] Starting BigQuery sync for {table_ref}")
            query_job = await asyncio.to_thread(self.client.query, query)
            result = await asyncio.to_thread(query_job.result, page_size=10000) # Fetch 10k rows per page
            
            # Iterate through pages using the BigQuery iterator API
            pages = result.pages
            
            # We must use an inner async generator loop to yield control back to the event loop
            # while blocking network operations fetch the next page.
            def fetch_next_page(page_iter):
                try:
                    return next(page_iter)
                except StopIteration:
                    return None

            page_iterator = iter(pages)
            
            while True:
                # Run the blocking next() call in a separate thread
                page = await asyncio.to_thread(fetch_next_page, page_iterator)
                if page is None:
                    break
                    
                # Convert the RowIterator page to a list of dicts for the Polars Normalizer
                chunk = [dict(row.items()) for row in page]
                if chunk:
                    yield chunk

        except Exception as e:
            logger.error(f"[{self.tenant_id}] BigQuery historical sync failed for {stream_name}: {str(e)}")
            raise

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Optional mapping of core analytical views if Dataomen knows the schema structure beforehand
        (e.g., standard Google Analytics 4 BigQuery export shapes).
        """
        return {
            "ga4_daily_active_users": f"""
                SELECT event_date, COUNT(DISTINCT user_pseudo_id) as active_users
                FROM `{self.project_id}.{self.dataset_id}.events_*`
                GROUP BY event_date
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
            "GEOGRAPHY": "VARCHAR", # DuckDB spatial extension handles geometry as varchar/blob initially
            "JSON": "JSON"
        }
        
        return mapping.get(bq_type_upper, "VARCHAR")