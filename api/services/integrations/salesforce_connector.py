# api/services/integrations/salesforce_connector.py

import os
import csv
import logging
import asyncio
import httpx
from io import StringIO
from typing import Dict, Any, List, AsyncGenerator, Optional

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class SalesforceConnector(BaseIntegration):
    """
    Phase 4: Salesforce Integration (Custom CRM Schemas)
    Handles OAuth 2.0 with refresh tokens, dynamic schema introspection for custom objects (__c), 
    and extreme-scale ingestion via Salesforce Bulk API 2.0.
    """

    def __init__(self, config: IntegrationConfig):
        super().__init__(config)
        self.client_id = os.environ.get("SALESFORCE_CLIENT_ID")
        self.client_secret = os.environ.get("SALESFORCE_CLIENT_SECRET")
        self.api_version = "v60.0" # Pinning API version for stable Bulk 2.0 behavior
        
        if not self.client_id or not self.client_secret:
            logger.warning("Salesforce Connected App credentials missing from environment.")

    def _initialize_client(self) -> httpx.AsyncClient:
        """
        Initializes an async HTTP client configured for the tenant's specific Salesforce instance.
        """
        instance_url = self.config.credentials.get("instance_url", "https://login.salesforce.com")
        access_token = self.config.credentials.get("access_token")
        
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
            
        return httpx.AsyncClient(
            base_url=f"{instance_url}/services/data/{self.api_version}",
            headers=headers,
            timeout=httpx.Timeout(45.0) 
        )

    async def test_connection(self) -> bool:
        """
        Phase 1.1 / 4.1: Fast validation to ensure tokens haven't been revoked.
        """
        if not self.config.credentials.get("access_token"):
            return False
            
        try:
            # Ping the limits endpoint—it's fast, lightweight, and confirms token validity
            response = await self.client.get("/limits")
            response.raise_for_status()
            return True
        except httpx.HTTPError as e:
            logger.error(f"Salesforce connection test failed for {self.tenant_id}: {str(e)}")
            return False

    def get_oauth_url(self, redirect_uri: str) -> Optional[str]:
        """
        Phase 4.1: Generate OAuth consent URL for a Salesforce Connected App.
        Requests offline access to ensure we get a refresh_token for background syncs.
        """
        # Can be overriden to test.salesforce.com for sandbox environments
        login_domain = self.config.credentials.get("login_domain", "https://login.salesforce.com")
        
        return (
            f"{login_domain}/services/oauth2/authorize?"
            f"client_id={self.client_id}&redirect_uri={redirect_uri}&"
            f"response_type=code&prompt=consent"
        )

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """
        Phase 4.1: Exchange auth code. Yields access_token, refresh_token, and the instance_url 
        (which dictates where all future API calls must be routed).
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
            # Salesforce requires data to be sent as form-urlencoded, not JSON
            response = await client.post(token_url, data=payload)
            response.raise_for_status()
            data = response.json()
            
            return {
                "access_token": data.get("access_token"),
                "refresh_token": data.get("refresh_token"),
                "instance_url": data.get("instance_url"),
                "id_url": data.get("id")
            }

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        Phase 4.2: Dynamic Schema Mapping for Contextual RAG.
        Salesforce schemas are highly fluid. We dynamically introspect core objects 
        and any custom `__c` objects, pulling field types to guide strict Parquet casting.
        """
        objects_to_describe = ["Account", "Contact", "Opportunity", "Lead"]
        
        # We could also do a global describe to find all custom objects ending in __c
        # For performance in this template, we stick to the core + requested streams.
        
        schema_graph = {}
        for obj in objects_to_describe:
            response = await self.client.get(f"/sobjects/{obj}/describe")
            if response.status_code == 200:
                fields = response.json().get("fields", [])
                
                # Filter down to essential analytical metadata to prevent LLM token bloat
                schema_graph[obj.lower()] = [
                    {"name": f["name"].lower(), "type": f["type"], "custom": f["custom"]}
                    for f in fields if f["type"] not in ["base64", "complexvalue"]
                ]
                
        return schema_graph

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Phase 4.3: Bulk API 2.0 Ingestion.
        Salesforce standard REST APIs fail on large datasets. We use Bulk API v2 to execute 
        a SOQL query asynchronously, which Salesforce compiles into a highly compressed CSV.
        """
        # Ensure safe object naming (protecting against SOQL injection)
        safe_obj = "".join(c for c in stream_name if c.isalnum() or c == '_')
        
        # 1. Create a Bulk Query Job
        soql_query = f"SELECT FIELDS(ALL) FROM {safe_obj} WHERE SystemModstamp >= {start_timestamp} LIMIT 200"
        job_payload = {
            "operation": "queryAll",
            "query": soql_query
        }
        
        job_resp = await self.client.post("/jobs/query", json=job_payload)
        job_resp.raise_for_status()
        job_id = job_resp.json().get("id")
        
        logger.info(f"[{self.tenant_id}] Initiated Salesforce Bulk Query Job: {job_id}")

        # 2. Poll for Job Completion
        while True:
            status_resp = await self.client.get(f"/jobs/query/{job_id}")
            status_resp.raise_for_status()
            state = status_resp.json().get("state")
            
            if state == "JobComplete":
                break
            elif state in ["Failed", "Aborted"]:
                error = status_resp.json().get("errorMessage", "Unknown Bulk API error")
                raise RuntimeError(f"Salesforce Bulk Job {job_id} failed: {error}")
                
            await asyncio.sleep(5)

        # 3. Stream and Yield CSV Results directly into memory chunks
        # Salesforce Bulk API 2.0 returns raw CSV data. We stream it, parse it via csv.DictReader, 
        # and yield it in vectorized-friendly batches for our pipeline.
        chunk_size = 10000
        batch = []
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as stream_client:
            stream_url = f"{self.client.base_url}/jobs/query/{job_id}/results"
            
            async with stream_client.stream("GET", stream_url, headers=self.client.headers) as response:
                response.raise_for_status()
                
                # Read chunks of lines manually to prevent pulling gigabytes into RAM at once
                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    if '\n' in buffer:
                        lines = buffer.split('\n')
                        # Keep the incomplete last line in the buffer
                        buffer = lines.pop()
                        
                        # Initialize DictReader on the first line (headers)
                        if not hasattr(self, '_csv_headers'):
                            self._csv_headers = lines.pop(0)
                            
                        # Parse the lines
                        if lines:
                            csv_data = self._csv_headers + '\n' + '\n'.join(lines)
                            reader = csv.DictReader(StringIO(csv_data))
                            batch.extend([row for row in reader])
                            
                    if len(batch) >= chunk_size:
                        yield batch
                        batch = []
                        
                # Catch the trailing buffer
                if buffer:
                    csv_data = self._csv_headers + '\n' + buffer
                    reader = csv.DictReader(StringIO(csv_data))
                    batch.extend([row for row in reader])
                    
                if batch:
                    yield batch
                    
        # Cleanup instance variable
        if hasattr(self, '_csv_headers'):
            del self._csv_headers

    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """
        Salesforce pushes data via Outbound Messages (SOAP) or Change Data Capture (CDC) events.
        CDC via Pub/Sub API is preferred but requires a gRPC streaming connection, not standard webhooks.
        If using standard Apex callouts as Webhooks, implement custom HMAC logic here.
        """
        # Implement logic depending on how the tenant's Salesforce triggers are built
        return True

    async def handle_webhook(self, event_type: str, payload: Dict[str, Any]) -> None:
        """Process streaming changes (e.g. Opportunity Stage changes for real-time win-rates)."""
        pass

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Phase 1.1 / Analytical Efficiency:
        Baseline SQL views to instantly deliver value to GTM teams on top of the Parquet layers.
        """
        return {
            "vw_salesforce_pipeline_velocity": """
                SELECT 
                    ownerid,
                    count(id) as open_opportunities,
                    sum(amount) as pipeline_value,
                    avg(probability) as avg_win_probability,
                    -- Standardized linear algebra metric for expected value
                    sum(amount * (probability / 100.0)) as expected_revenue
                FROM salesforce_opportunity 
                WHERE isclosed = 'false'
                GROUP BY ownerid
            """,
            "vw_salesforce_win_rate": """
                SELECT 
                    date_trunc('month', closedate) as close_month,
                    count(CASE WHEN iswon = 'true' THEN 1 END) * 100.0 / nullif(count(*), 0) as win_rate_percentage
                FROM salesforce_opportunity 
                WHERE isclosed = 'true'
                GROUP BY close_month
                ORDER BY close_month DESC
            """
        }