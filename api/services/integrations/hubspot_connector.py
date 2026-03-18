"""
ARCLI.TECH - SaaS Integration Module
Connector: HubSpot (Enterprise CRM & Marketing Automation)
Strategy: Async Search API (Delta Sync), Pagination Cursors, & Contextual RAG
"""

import os
import logging
import asyncio
import contextlib
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, List, AsyncGenerator, Optional

import httpx
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class HubSpotRateLimitError(Exception):
    """Custom exception to trigger Tenacity backoff for HTTP 429s (HubSpot allows 100-150 requests/10s)."""
    pass

class HubSpotConnector(BaseIntegration):
    """
    Phase 5: HubSpot Zero-ETL Connector.
    
    Engineering Standards:
    - Compute Pushdown: Uses HubSpot's `/search` API to push timestamp filters to the server.
    - Zero-ETL Unnesting: Yields the raw `properties` struct, relying on PolarsNormalizer to flatten it.
    - Least Privilege: Connects via Private App Tokens or OAuth 2.0.
    """

    # Instructs the downstream DataSanitizer to cryptographically hash these fields
    PII_COLUMNS = ["email", "phone", "mobilephone", "firstname", "lastname", "company", "hs_object_id"]

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="hubspot", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        # HubSpot supports OAuth or Private App Tokens. 
        self.access_token = self.config.credentials.get("access_token", "")
        self.client_id = os.environ.get("HUBSPOT_CLIENT_ID")
        self.client_secret = os.environ.get("HUBSPOT_CLIENT_SECRET")
        
        if not self.access_token:
            logger.warning(f"[{self.tenant_id}] HubSpot initialized without an access_token.")

    @contextlib.asynccontextmanager
    async def _get_client(self) -> AsyncGenerator[httpx.AsyncClient, None]:
        """Context manager for yielding a properly configured HubSpot API client."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}"
        }
        
        async with httpx.AsyncClient(
            base_url="https://api.hubapi.com/crm/v3",
            headers=headers,
            timeout=httpx.Timeout(45.0) 
        ) as client:
            yield client

    # -------------------------------------------------------------------------
    # Schema & Contextual RAG Definitions
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        The Schema Contract for DuckDB Parquet Validation.
        Note: Because PolarsNormalizer flattens structs (properties.amount -> properties_amount),
        we map the flattened names here.
        """
        return {
            "deals": {
                "id": "VARCHAR",
                "createdAt": "BIGINT",
                "updatedAt": "BIGINT",
                "properties_dealname": "VARCHAR",
                "properties_amount": "DOUBLE",
                "properties_dealstage": "VARCHAR",
                "properties_pipeline": "VARCHAR",
                "properties_closedate": "VARCHAR",
                "properties_hs_is_closed": "VARCHAR",
                "properties_hubspot_owner_id": "VARCHAR"
            },
            "contacts": {
                "id": "VARCHAR",
                "createdAt": "BIGINT",
                "updatedAt": "BIGINT",
                "properties_email": "VARCHAR",
                "properties_firstname": "VARCHAR",
                "properties_lastname": "VARCHAR",
                "properties_lifecyclestage": "VARCHAR",
                "properties_hs_lead_status": "VARCHAR"
            },
            "companies": {
                "id": "VARCHAR",
                "createdAt": "BIGINT",
                "updatedAt": "BIGINT",
                "properties_name": "VARCHAR",
                "properties_domain": "VARCHAR",
                "properties_industry": "VARCHAR",
                "properties_annualrevenue": "DOUBLE"
            }
        }

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Contextual RAG: Pre-computes optimized DuckDB SQL for standard HubSpot metrics.
        Prevents LLMs from hallucinating how to calculate Revenue or Lead Conversion rates.
        """
        return {
            "vw_hubspot_deal_velocity": """
                SELECT 
                    properties_hubspot_owner_id AS owner_id,
                    count(id) AS total_deals,
                    sum(CAST(properties_amount AS DOUBLE)) AS total_pipeline_value,
                    -- Deals closed won (HubSpot's default closed-won stage is often 'closedwon')
                    count(CASE WHEN properties_hs_is_closed = 'true' THEN 1 END) AS closed_deals
                FROM hubspot_deals
                GROUP BY 1
            """,
            "vw_hubspot_lead_funnel": """
                SELECT 
                    properties_lifecyclestage AS lifecycle_stage,
                    count(id) AS volume
                FROM hubspot_contacts
                GROUP BY 1
                ORDER BY volume DESC
            """
        }

    # -------------------------------------------------------------------------
    # Authentication & Security
    # -------------------------------------------------------------------------

    def get_oauth_url(self, redirect_uri: str) -> Optional[str]:
        """Generate OAuth consent URL for a HubSpot Public App."""
        if not self.client_id:
            raise ValueError("HUBSPOT_CLIENT_ID missing from environment.")
            
        scopes = "crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read"
        return (
            f"https://app.hubspot.com/oauth/authorize?"
            f"client_id={self.client_id}&redirect_uri={redirect_uri}&scope={scopes}"
        )

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """Exchange the authorization code for HubSpot access and refresh tokens."""
        redirect_uri = self.config.credentials.get("redirect_uri")
        payload = {
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": redirect_uri,
            "code": code
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post("https://api.hubapi.com/oauth/v1/token", data=payload)
            response.raise_for_status()
            data = response.json()
            
            return {
                "access_token": data.get("access_token"),
                "refresh_token": data.get("refresh_token"),
                "expires_in": data.get("expires_in")
            }

    async def test_connection(self) -> bool:
        """Fast validation using the minimal contacts endpoint."""
        try:
            async with self._get_client() as client:
                resp = await client.get("/objects/contacts?limit=1")
                return resp.status_code == 200
        except Exception:
            return False

    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """
        HubSpot Webhooks use a SHA-256 hash of the app secret + payload.
        """
        if not self.client_secret:
            return False
            
        source_string = self.client_secret + payload
        computed_hash = hashlib.sha256(source_string.encode('utf-8')).hexdigest()
        
        return hmac.compare_digest(computed_hash, signature)

    # -------------------------------------------------------------------------
    # Core Data Ingestion (Execution Layer)
    # -------------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type((HubSpotRateLimitError, httpx.NetworkError, httpx.TimeoutException)),
        wait=wait_exponential(multiplier=2, min=2, max=60), 
        stop=stop_after_attempt(8)
    )
    async def _execute_hubspot_request(self, client: httpx.AsyncClient, method: str, url: str, **kwargs) -> Dict[str, Any]:
        """Centralized HTTP execution with robust Tenacity backoff for strict HubSpot rate limits."""
        response = await client.request(method, url, **kwargs)
        
        if response.status_code == 429:
            logger.warning(f"[{self.tenant_id}] HubSpot Rate Limit Hit. Tenacity backing off...")
            raise HubSpotRateLimitError("HubSpot 429 Rate Limit exceeded.")
            
        response.raise_for_status()
        return response.json()

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Delta Sync via Search API).
        HubSpot's Search API allows us to push the timestamp filter directly to their compute,
        saving massive amounts of network egress.
        """
        # HubSpot CRM object routing
        valid_streams = ["contacts", "companies", "deals", "tickets", "products"]
        safe_stream = stream_name.lower()
        if safe_stream not in valid_streams:
            raise ValueError(f"[{self.tenant_id}] Stream '{safe_stream}' is not a standard HubSpot CRM object.")

        # 1. Properties Context: 
        # By default, HubSpot only returns 3-4 properties. We must request the ones we defined in fetch_schema.
        schema = await self.fetch_schema()
        stream_schema = schema.get(safe_stream, {})
        
        # Reverse map from our flattened schema back to HubSpot's native property names
        # e.g., 'properties_dealname' -> 'dealname'
        properties_to_fetch = [
            k.replace("properties_", "") for k in stream_schema.keys() if k.startswith("properties_")
        ]

        # 2. Build the Compute Pushdown Search Payload
        search_payload = {
            "limit": 100, # Max allowed by Search API
            "properties": properties_to_fetch,
            "sorts": [{"propertyName": "hs_lastmodifieddate", "direction": "ASC"}]
        }

        # Inject Delta Sync filter if provided
        if start_timestamp:
            try:
                # Ensure ISO 8601 strict compliance for HubSpot (requires milliseconds)
                dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
                hs_time = dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
                
                search_payload["filterGroups"] = [{
                    "filters": [{
                        "propertyName": "hs_lastmodifieddate",
                        "operator": "GTE",
                        "value": hs_time
                    }]
                }]
                logger.info(f"[{self.tenant_id}] Applying HubSpot Delta Sync: hs_lastmodifieddate >= {hs_time}")
            except ValueError:
                logger.warning(f"[{self.tenant_id}] Invalid start_timestamp. Proceeding with full historical sync.")

        logger.info(f"[{self.tenant_id}] Starting HubSpot ingestion for: {safe_stream}")

        total_fetched = 0
        has_more = True
        
        async with self._get_client() as client:
            while has_more:
                try:
                    data = await self._execute_hubspot_request(
                        client, 
                        method="POST", 
                        url=f"/objects/{safe_stream}/search", 
                        json=search_payload
                    )
                except Exception as e:
                    logger.error(f"[{self.tenant_id}] Fatal error fetching HubSpot {safe_stream}: {str(e)}")
                    raise

                results = data.get("results", [])
                if not results:
                    break
                    
                total_fetched += len(results)
                
                # 3. Yield to SyncEngine
                # Note: We yield the raw JSON directly. HubSpot returns: {"id": "1", "properties": {"dealname": "X"}}
                # Our PolarsNormalizer's `_flatten_structs` will seamlessly convert this to top-level columns!
                yield results

                # 4. Handle Pagination
                paging = data.get("paging", {}).get("next", {})
                if paging and "after" in paging:
                    search_payload["after"] = paging["after"]
                else:
                    has_more = False
                    
                # Polite crawler pacing
                await asyncio.sleep(0.1)
                
        logger.info(f"✅ [{self.tenant_id}] HubSpot sync complete for {safe_stream}. Yielded {total_fetched} records.")