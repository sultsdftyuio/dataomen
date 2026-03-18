"""
ARCLI.TECH - SaaS Integration Module
Connector: Shopify (E-Commerce Analytics)
Strategy: GraphQL Bulk Operations, Async JSONL Streaming, & Contextual RAG
"""

import os
import json
import hmac
import hashlib
import base64
import logging
import asyncio
import contextlib
from datetime import datetime, timezone
from typing import Dict, Any, List, AsyncGenerator, Optional

import httpx
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class ShopifyNetworkError(Exception):
    """Custom exception to trigger Tenacity backoff for transient Shopify API errors."""
    pass

class ShopifyConnector(BaseIntegration):
    """
    Phase 3: Shopify Zero-ETL Connector.
    Handles strict OAuth 2.0 consent, GraphQL Bulk Operations for massive historical syncs, 
    memory-safe JSONL streaming, and cryptographic HMAC validation for real-time webhooks.
    """

    # Security by Design: Instructs DataSanitizer to cryptographically hash these fields
    PII_COLUMNS = ["email", "phone", "first_name", "last_name", "customer_email"]

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="shopify", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        self.client_id = os.environ.get("SHOPIFY_CLIENT_ID")
        self.client_secret = os.environ.get("SHOPIFY_CLIENT_SECRET")
        self.api_version = "2024-01"  # Pin API version for absolute schema stability
        
        self.shop_url = self.config.credentials.get("shop_url", "")
        self.access_token = self.config.credentials.get("access_token", "")
        
        if not self.client_id or not self.client_secret:
            logger.warning(f"[{self.tenant_id}] Shopify Client ID or Secret missing. OAuth/Webhooks will fail.")

    @contextlib.asynccontextmanager
    async def _get_client(self) -> AsyncGenerator[httpx.AsyncClient, None]:
        """
        Context manager for yielding a properly configured Shopify API client.
        Ensures connections are cleanly closed after long-running bulk operations.
        """
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        if self.access_token:
            headers["X-Shopify-Access-Token"] = self.access_token
            
        base_url = f"https://{self.shop_url}/admin/api/{self.api_version}" if self.shop_url else ""
        
        # Extended timeout for GraphQL parsing on Shopify's edge
        async with httpx.AsyncClient(base_url=base_url, headers=headers, timeout=httpx.Timeout(60.0)) as client:
            yield client

    # -------------------------------------------------------------------------
    # Schema & Contextual RAG Definitions
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        The Schema Contract for the SyncEngine.
        Defines the expected flattened JSON structure for DuckDB Parquet enforcement.
        """
        return {
            "orders": {
                "id": "VARCHAR",
                "created_at": "BIGINT",
                "total_price": "DOUBLE",
                "currency": "VARCHAR",
                "customer_id": "VARCHAR",
                "customer_email": "VARCHAR",
                "status": "VARCHAR"
            },
            "customers": {
                "id": "VARCHAR",
                "email": "VARCHAR",
                "created_at": "BIGINT",
                "orders_count": "BIGINT",
                "total_spent": "DOUBLE",
                "currency": "VARCHAR"
            },
            "products": {
                "id": "VARCHAR",
                "title": "VARCHAR",
                "product_type": "VARCHAR",
                "vendor": "VARCHAR",
                "created_at": "BIGINT",
                "status": "VARCHAR"
            }
        }

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Contextual RAG Optimization: Pre-Built Analytical Views.
        Injected into the Semantic Router to ensure the LLM generates mathematically 
        perfect SQL for common E-Commerce metrics.
        """
        return {
            "vw_shopify_daily_revenue": """
                SELECT 
                    time_bucket(INTERVAL '1 day', to_timestamp(created_at / 1000)) AS date,
                    sum(total_price) AS daily_revenue,
                    count(id) AS order_volume,
                    currency
                FROM shopify_orders
                GROUP BY 1, 4
                ORDER BY 1 DESC
            """,
            "vw_shopify_aov": """
                SELECT 
                    time_bucket(INTERVAL '1 month', to_timestamp(created_at / 1000)) AS month,
                    sum(total_price) / count(id) AS average_order_value,
                    currency
                FROM shopify_orders
                GROUP BY 1, 3
                ORDER BY 1 DESC
            """
        }

    # -------------------------------------------------------------------------
    # Authentication & Security
    # -------------------------------------------------------------------------

    def get_oauth_url(self, redirect_uri: str) -> Optional[str]:
        """Generate OAuth consent URL requiring least-privilege analytical scopes."""
        if not self.shop_url:
            raise ValueError("shop_url is required in credentials to generate OAuth URL.")
            
        scopes = "read_orders,read_products,read_customers,read_analytics"
        return f"https://{self.shop_url}/admin/oauth/authorize?client_id={self.client_id}&scope={scopes}&redirect_uri={redirect_uri}"

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """Exchange the authorization code for a permanent offline access token."""
        token_url = f"https://{self.shop_url}/admin/oauth/access_token"
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, json=payload)
            response.raise_for_status()
            data = response.json()
            
            return {
                "shop_url": self.shop_url,
                "access_token": data.get("access_token"),
                "scope": data.get("scope")
            }

    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """
        The Push Pipeline Security.
        Cryptographically verify incoming webhooks from Shopify using HMAC-SHA256.
        """
        if not self.client_secret:
            logger.error("SHOPIFY_CLIENT_SECRET missing. Cannot verify webhook.")
            return False
            
        digest = hmac.new(
            self.client_secret.encode('utf-8'), 
            payload.encode('utf-8'), 
            hashlib.sha256
        ).digest()
        
        computed_hmac = base64.b64encode(digest).decode('utf-8')
        return hmac.compare_digest(computed_hmac, signature)

    # -------------------------------------------------------------------------
    # Core Data Ingestion (Execution Layer)
    # -------------------------------------------------------------------------

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline.
        Triggers a GraphQL Bulk Operation, polls for completion, and streams the 
        resulting JSONL file in 10,000-row chunks to perfectly align with Polars memory limits.
        """
        dt_start = start_timestamp if start_timestamp else "2020-01-01T00:00:00Z"

        # GraphQL Bulk Queries perfectly mapped to our `fetch_schema` contract
        queries = {
            "orders": """
                mutation {
                  bulkOperationRunQuery(
                    query: \"\"\"
                      {
                        orders(query: "created_at:>=%s") {
                          edges {
                            node {
                              id createdAt displayFinancialStatus
                              totalPriceSet { shopMoney { amount currencyCode } }
                              customer { id email }
                            }
                          }
                        }
                      }
                    \"\"\"
                  ) { bulkOperation { id status } userErrors { field message } }
                }
            """ % dt_start,
            "customers": """
                mutation {
                  bulkOperationRunQuery(
                    query: \"\"\"
                      {
                        customers(query: "created_at:>=%s") {
                          edges {
                            node {
                              id email createdAt ordersCount amountSpent { amount currencyCode }
                            }
                          }
                        }
                      }
                    \"\"\"
                  ) { bulkOperation { id status } userErrors { field message } }
                }
            """ % dt_start
        }

        query = queries.get(stream_name)
        if not query:
            logger.warning(f"[{self.tenant_id}] Stream '{stream_name}' not mapped to a Bulk Query. Aborting.")
            return

        async with self._get_client() as client:
            # 1. Trigger Bulk Operation
            response = await client.post("/graphql.json", json={"query": query})
            response.raise_for_status()
            
            res_data = response.json()
            user_errors = res_data.get("data", {}).get("bulkOperationRunQuery", {}).get("userErrors", [])
            if user_errors:
                raise RuntimeError(f"Shopify Bulk Query Error: {user_errors}")
            
            # 2. Poll for Completion with Exponential Backoff
            logger.info(f"[{self.tenant_id}] Triggered Shopify Bulk GraphQL for {stream_name}. Polling...")
            bulk_url = await self._poll_bulk_operation(client)
            
            if not bulk_url:
                logger.info(f"[{self.tenant_id}] No data found or operation failed for {stream_name}.")
                return

        # 3. Stream Download JSONL and Yield Batches
        chunk_size = 10000
        batch = []
        total_rows = 0
        
        logger.info(f"[{self.tenant_id}] Streaming JSONL file from Shopify Cloud Storage...")
        
        async with httpx.AsyncClient() as download_client:
            async with download_client.stream("GET", bulk_url) as stream_resp:
                stream_resp.raise_for_status()
                
                async for line in stream_resp.aiter_lines():
                    if not line.strip():
                        continue
                        
                    data = json.loads(line)
                    # Filter out nested connection nodes (Shopify JSONL specific)
                    if "__parentId" in data:
                        continue 
                        
                    flat_data = self._flatten_graphql_node(data, stream_name)
                    batch.append(flat_data)
                    total_rows += 1
                    
                    if len(batch) >= chunk_size:
                        yield batch
                        batch = []
                        
        if batch:
            yield batch
            
        logger.info(f"✅ [{self.tenant_id}] Shopify {stream_name} sync complete. Yielded {total_rows} rows.")

    @retry(
        retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException, ShopifyNetworkError)),
        wait=wait_exponential(multiplier=2, min=5, max=60),
        stop=stop_after_attempt(10)
    )
    async def _poll_bulk_operation(self, client: httpx.AsyncClient) -> Optional[str]:
        """
        Polls Shopify's GraphQL API until the bulk operation completes.
        Wrapped in Tenacity to survive transient 502/504 errors during long syncs.
        """
        poll_query = """
            query {
              currentBulkOperation { id status errorCode createdAt completedAt url }
            }
        """
        while True:
            response = await client.post("/graphql.json", json={"query": poll_query})
            if response.status_code >= 500:
                raise ShopifyNetworkError("Transient Shopify Server Error during polling.")
            response.raise_for_status()
            
            op = response.json().get("data", {}).get("currentBulkOperation", {})
            if not op:
                return None
                
            status = op.get("status")
            if status == "COMPLETED":
                return op.get("url") # Signed Google Cloud Storage URL
            elif status in ["FAILED", "CANCELED", "EXPIRED"]:
                logger.error(f"[{self.tenant_id}] Shopify Bulk Operation failed. Status: {status}, Error: {op.get('errorCode')}")
                return None
                
            # Sleep safely via asyncio before polling again (Celery worker remains unblocked)
            await asyncio.sleep(5)

    def _flatten_graphql_node(self, node: Dict[str, Any], stream_name: str) -> Dict[str, Any]:
        """
        Dynamic flattener that extracts core metrics from verbose GraphQL nodes 
        based on the active stream.
        """
        flat = {"id": str(node.get("id", "")).split("/")[-1]} # Extract standard ID from GID
        
        # Chronology Normalization
        if "createdAt" in node:
            try:
                dt = datetime.fromisoformat(node["createdAt"].replace('Z', '+00:00'))
                flat["created_at"] = int(dt.timestamp() * 1000)
            except:
                flat["created_at"] = 0

        # Stream-Specific Extractions
        if stream_name == "orders":
            if "totalPriceSet" in node:
                flat["total_price"] = float(node["totalPriceSet"].get("shopMoney", {}).get("amount", 0.0))
                flat["currency"] = node["totalPriceSet"].get("shopMoney", {}).get("currencyCode", "USD")
            if "customer" in node and node["customer"]:
                flat["customer_id"] = str(node["customer"].get("id", "")).split("/")[-1]
                flat["customer_email"] = node["customer"].get("email", "")
            flat["status"] = node.get("displayFinancialStatus", "UNKNOWN")

        elif stream_name == "customers":
            flat["email"] = node.get("email", "")
            flat["orders_count"] = int(node.get("ordersCount", 0))
            if "amountSpent" in node and node["amountSpent"]:
                flat["total_spent"] = float(node["amountSpent"].get("amount", 0.0))
                flat["currency"] = node["amountSpent"].get("currencyCode", "USD")

        return flat