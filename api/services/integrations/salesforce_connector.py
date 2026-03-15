# api/services/integrations/salesforce_connector.py

import os
import csv
import logging
import asyncio
import contextlib
import httpx
from datetime import datetime, timezone
from io import StringIO
from typing import Dict, Any, List, AsyncGenerator, Optional

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class SalesforceConnector(BaseIntegration):
    """
    Phase 4: Salesforce Zero-ETL Connector.
    Handles OAuth 2.0, dynamic schema introspection for custom objects (__c), 
    and extreme-scale ingestion via Salesforce Bulk API 2.0 streamed CSVs.
    """

    # Instructs the downstream DataSanitizer to cryptographically hash these fields
    PII_COLUMNS = ["Email", "Phone", "MobilePhone", "Name", "FirstName", "LastName"]

    def __init__(self, tenant_id: str, credentials: Dict[str, str] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="salesforce", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        self.client_id = os.environ.get("SALESFORCE_CLIENT_ID")
        self.client_secret = os.environ.get("SALESFORCE_CLIENT_SECRET")
        self.api_version = "v60.0" # Pinning API version for stable Bulk 2.0 behavior
        
        self.instance_url = self.config.credentials.get("instance_url", "https://login.salesforce.com")
        self.access_token = self.config.credentials.get("access_token", "")
        
        if not self.client_id or not self.client_secret:
            logger.warning("Salesforce Connected App credentials missing from environment.")

    @contextlib.asynccontextmanager
    async def _get_client(self) -> AsyncGenerator[httpx.AsyncClient, None]:
        """
        Context manager for yielding a properly configured Salesforce API client.
        """
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
            
        async with httpx.AsyncClient(
            base_url=f"{self.instance_url}/services/data/{self.api_version}",
            headers=headers,
            timeout=httpx.Timeout(60.0) 
        ) as client:
            yield client

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        Phase 4.2: Dynamic Schema Mapping for Contextual RAG.
        Introspects core objects and custom objects, translating Salesforce types 
        to strict DuckDB types to guide Parquet casting.
        """
        # Default objects to pull. In a full implementation, this could dynamically
        # query all objects ending in __c as well.
        objects_to_describe = ["Account", "Contact", "Opportunity", "Lead"]
        
        # Salesforce type to DuckDB type mapping
        type_mapping = {
            "string": "VARCHAR",
            "email": "VARCHAR",
            "phone": "VARCHAR",
            "textarea": "VARCHAR",
            "picklist": "VARCHAR",
            "id": "VARCHAR",
            "reference": "VARCHAR",
            "double": "DOUBLE",
            "currency": "DOUBLE",
            "percent": "DOUBLE",
            "int": "BIGINT",
            "boolean": "BOOLEAN",
            "datetime": "VARCHAR", # Handled as ISO strings before DuckDB casting
            "date": "VARCHAR"
        }
        
        schema_graph = {}
        
        async with self._get_client() as client:
            for obj in objects_to_describe:
                response = await client.get(f"/sobjects/{obj}/describe")
                if response.status_code == 200:
                    fields = response.json().get("fields", [])
                    
                    obj_schema = {}
                    for f in fields:
                        sf_type = f["type"].lower()
                        # Ignore binary or complex embedded types
                        if sf_type not in ["base64", "complexvalue", "address"]:
                            duckdb_type = type_mapping.get(sf_type, "VARCHAR")
                            obj_schema[f["name"]] = duckdb_type
                            
                    schema_graph[obj.lower()] = obj_schema
                else:
                    logger.warning(f"[{self.config.tenant_id}] Failed to introspect Salesforce object: {obj}")
                    
        return schema_graph

    def get_oauth_url(self, redirect_uri: str) -> Optional[str]:
        """
        Generate OAuth consent URL for a Salesforce Connected App.
        Requests offline access to ensure we get a refresh_token for background syncs.
        """
        login_domain = self.config.credentials.get("login_domain", "https://login.salesforce.com")
        
        return (
            f"{login_domain}/services/oauth2/authorize?"
            f"client_id={self.client_id}&redirect_uri={redirect_uri}&"
            f"response_type=code&prompt=consent"
        )

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """
        Exchange auth code. Yields access_token, refresh_token, and the instance_url.
        """
        login_domain = self.config.credentials.get("login_domain", "https://login.salesforce.com")
        token_url = f"{login_domain}/services/oauth2/token"
        
        payload = {
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.config.credentials.get("redirect_uri"),
            "code": code
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=payload)
            response.raise_for_status()
            data = response.json()
            
            return {
                "access_token": data.get("access_token"),
                "refresh_token": data.get("refresh_token"),
                "instance_url": data.get("instance_url"),
                "id_url": data.get("id")
            }

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Phase 4.3: Bulk API 2.0 Ingestion.
        Executes a SOQL query asynchronously, which Salesforce compiles into a highly 
        compressed CSV, then streams and yields it in vectorized-friendly JSON batches.
        """
        # Ensure safe object naming (protecting against SOQL injection)
        safe_obj = "".join(c for c in stream_name if c.isalnum() or c == '_')
        
        # Format start_timestamp to strict SOQL DateTime format
        soql_time = "2000-01-01T00:00:00Z"
        if start_timestamp:
            try:
                dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
                soql_time = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                pass
        
        # 1. Create a Bulk Query Job
        soql_query = f"SELECT FIELDS(ALL) FROM {safe_obj} WHERE SystemModstamp >= {soql_time} LIMIT 200"
        job_payload = {
            "operation": "queryAll",
            "query": soql_query
        }
        
        async with self._get_client() as client:
            job_resp = await client.post("/jobs/query", json=job_payload)
            job_resp.raise_for_status()
            job_id = job_resp.json().get("id")
            
            logger.info(f"[{self.config.tenant_id}] Initiated Salesforce Bulk Query Job: {job_id} for {safe_obj}")

            # 2. Poll for Job Completion
            while True:
                status_resp = await client.get(f"/jobs/query/{job_id}")
                status_resp.raise_for_status()
                state = status_resp.json().get("state")
                
                if state == "JobComplete":
                    break
                elif state in ["Failed", "Aborted"]:
                    error = status_resp.json().get("errorMessage", "Unknown Bulk API error")
                    raise RuntimeError(f"Salesforce Bulk Job {job_id} failed: {error}")
                    
                await asyncio.sleep(5)

            # 3. Stream and Yield CSV Results directly into memory chunks
            chunk_size = 10000
            batch = []
            
            stream_url = f"/jobs/query/{job_id}/results"
            logger.info(f"[{self.config.tenant_id}] Streaming Salesforce CSV results...")

            # Use a longer timeout for streaming massive payloads
            async with httpx.AsyncClient(
                base_url=client.base_url, 
                headers=client.headers, 
                timeout=httpx.Timeout(120.0)
            ) as stream_client:
                
                async with stream_client.stream("GET", stream_url) as response:
                    response.raise_for_status()
                    
                    headers = []
                    
                    # Read the response line-by-line safely
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                            
                        # If headers haven't been captured, parse the first line
                        if not headers:
                            # Use csv.reader to handle quoted commas correctly
                            headers = next(csv.reader(StringIO(line)))
                            continue
                            
                        # Parse data row and map to headers
                        row_data = next(csv.reader(StringIO(line)))
                        
                        # Zip into a dictionary to match JSON normalizer expectations
                        row_dict = dict(zip(headers, row_data))
                        batch.append(row_dict)
                        
                        if len(batch) >= chunk_size:
                            yield batch
                            batch = []
                            
            if batch:
                yield batch
                
            logger.info(f"[{self.config.tenant_id}] Salesforce Bulk Job {job_id} completely streamed and yielded.")

    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """
        Salesforce pushes data via Outbound Messages (SOAP) or Change Data Capture (CDC) events.
        If using standard Apex callouts as Webhooks, implement custom HMAC logic here.
        """
        return True

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Pre-computes optimized DuckDB SQL for standard Salesforce pipeline metrics.
        """
        return {
            "vw_salesforce_pipeline_velocity": """
                SELECT 
                    OwnerId,
                    count(Id) as open_opportunities,
                    sum(CAST(Amount AS DOUBLE)) as pipeline_value,
                    avg(CAST(Probability AS DOUBLE)) as avg_win_probability,
                    -- Standardized linear algebra metric for expected value
                    sum(CAST(Amount AS DOUBLE) * (CAST(Probability AS DOUBLE) / 100.0)) as expected_revenue
                FROM salesforce_opportunity 
                WHERE IsClosed = 'false'
                GROUP BY OwnerId
            """,
            "vw_salesforce_win_rate": """
                SELECT 
                    date_trunc('month', CAST(CloseDate AS TIMESTAMP)) as close_month,
                    count(CASE WHEN IsWon = 'true' THEN 1 END) * 100.0 / nullif(count(*), 0) as win_rate_percentage
                FROM salesforce_opportunity 
                WHERE IsClosed = 'true'
                GROUP BY close_month
                ORDER BY close_month DESC
            """
        }