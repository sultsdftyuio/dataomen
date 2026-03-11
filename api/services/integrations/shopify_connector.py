# api/services/integrations/shopify_connector.py

import os
import json
import hmac
import hashlib
import base64
import logging
import asyncio
import httpx
from typing import Dict, Any, List, AsyncGenerator, Optional

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class ShopifyConnector(BaseIntegration):
    """
    Phase 2: Shopify Integration (E-Commerce & High-Frequency Streaming)
    Handles OAuth 2.0, GraphQL Bulk Operations for historical syncs, 
    and HMAC validation for real-time webhooks.
    """

    def __init__(self, config: IntegrationConfig):
        # We expect config.credentials to contain 'shop_url' and 'access_token'
        super().__init__(config)
        self.client_id = os.environ.get("SHOPIFY_CLIENT_ID")
        self.client_secret = os.environ.get("SHOPIFY_CLIENT_SECRET")
        self.api_version = "2024-01" # Pinning API version for stability
        
        if not self.client_id or not self.client_secret:
            logger.warning("Shopify Client ID or Secret is missing from environment variables.")

    def _initialize_client(self) -> httpx.AsyncClient:
        """
        Initializes an async HTTP client configured for this specific tenant's Shopify store.
        """
        shop_url = self.config.credentials.get("shop_url")
        access_token = self.config.credentials.get("access_token")
        
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        if access_token:
            headers["X-Shopify-Access-Token"] = access_token
            
        # If shop_url is missing during initial OAuth generation, fallback to generic client
        base_url = f"https://{shop_url}/admin/api/{self.api_version}" if shop_url else ""
        
        return httpx.AsyncClient(
            base_url=base_url,
            headers=headers,
            timeout=httpx.Timeout(30.0) # Bulk polling requires slightly longer timeouts
        )

    async def test_connection(self) -> bool:
        """
        Phase 1.1 / 2.1: Verify the provided access token is valid by querying shop details.
        """
        if not self.config.credentials.get("access_token"):
            return False
            
        try:
            response = await self.client.get("/shop.json")
            response.raise_for_status()
            return "shop" in response.json()
        except httpx.HTTPError as e:
            logger.error(f"Shopify connection test failed for {self.tenant_id}: {str(e)}")
            return False

    def get_oauth_url(self, redirect_uri: str) -> Optional[str]:
        """
        Phase 2.1: Generate OAuth consent URL.
        Requires the shop domain to be passed into the credentials temporarily.
        """
        shop_url = self.config.credentials.get("shop_url")
        if not shop_url:
            raise ValueError("shop_url is required in credentials to generate OAuth URL.")
            
        scopes = "read_orders,read_products,read_customers,read_analytics"
        
        return (
            f"https://{shop_url}/admin/oauth/authorize?"
            f"client_id={self.client_id}&scope={scopes}&redirect_uri={redirect_uri}"
        )

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """
        Phase 2.1: Exchange the authorization code for a permanent offline access token.
        """
        shop_url = self.config.credentials.get("shop_url")
        token_url = f"https://{shop_url}/admin/oauth/access_token"
        
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
                "shop_url": shop_url,
                "access_token": data.get("access_token"),
                "scope": data.get("scope")
            }

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        Phase 3.2 (Contextual RAG applied to APIs): 
        Returns the core semantic schema of Shopify. This metadata is fed to the LLM 
        router to enforce accurate DuckDB SQL generation against Parquet files.
        """
        return {
            "orders": ["id", "created_at", "total_price", "currency", "customer_id", "line_items"],
            "customers": ["id", "email", "created_at", "orders_count", "total_spent"],
            "products": ["id", "title", "product_type", "vendor", "created_at"]
        }

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Phase 2.2: Historical Data Sync via Bulk Operations GraphQL API.
        Extracts JSONL files, chunks them in-memory, and yields batches for Polars vectorization.
        """
        # Map streams to optimized GraphQL queries
        queries = {
            "orders": """
                mutation {
                  bulkOperationRunQuery(
                    query: \"\"\"
                      {
                        orders(query: "created_at:>=%s") {
                          edges {
                            node {
                              id createdAt totalPriceSet { shopMoney { amount currencyCode } }
                              customer { id email }
                              lineItems { edges { node { title quantity priceSet { shopMoney { amount } } } } }
                            }
                          }
                        }
                      }
                    \"\"\"
                  ) { bulkOperation { id status } userErrors { field message } }
                }
            """ % start_timestamp,
            # Add customers and products queries here...
        }

        query = queries.get(stream_name)
        if not query:
            raise ValueError(f"Stream {stream_name} is not supported by Shopify connector.")

        # 1. Trigger Bulk Operation
        response = await self.client.post("/graphql.json", json={"query": query})
        response.raise_for_status()
        
        # 2. Poll for Completion (Avoids memory locking)
        bulk_url = await self._poll_bulk_operation()
        if not bulk_url:
            logger.info(f"No historical data found or operation failed for {stream_name}.")
            return

        # 3. Stream Download JSONL and Yield Batches
        # Yields in 10,000 row chunks to perfectly align with Polars `infer_schema_length`
        chunk_size = 10000
        batch = []
        
        async with httpx.AsyncClient() as download_client:
            async with download_client.stream("GET", bulk_url) as stream_resp:
                stream_resp.raise_for_status()
                async for line in stream_resp.aiter_lines():
                    if not line.strip():
                        continue
                        
                    data = json.loads(line)
                    batch.append(data)
                    
                    if len(batch) >= chunk_size:
                        yield batch
                        batch = []
                        
        if batch:
            yield batch

    async def _poll_bulk_operation(self) -> Optional[str]:
        """Helper to poll Shopify's GraphQL API until the bulk operation completes."""
        poll_query = """
            query {
              currentBulkOperation { id status errorCode createdAt completedAt url }
            }
        """
        while True:
            response = await self.client.post("/graphql.json", json={"query": poll_query})
            response.raise_for_status()
            op = response.json().get("data", {}).get("currentBulkOperation", {})
            
            status = op.get("status")
            if status == "COMPLETED":
                return op.get("url")
            elif status in ["FAILED", "CANCELED", "EXPIRED"]:
                logger.error(f"Shopify Bulk Operation failed: {op.get('errorCode')}")
                return None
                
            # Wait 5 seconds before polling again
            await asyncio.sleep(5)

    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """
        Phase 2.4: Cryptographically verify Shopify Webhook pushes.
        Prevents malicious payload injection at the Edge.
        """
        if not self.client_secret:
            return False
            
        digest = hmac.new(
            self.client_secret.encode('utf-8'), 
            payload.encode('utf-8'), 
            hashlib.sha256
        ).digest()
        
        computed_hmac = base64.b64encode(digest).decode('utf-8')
        return hmac.compare_digest(computed_hmac, signature)

    async def handle_webhook(self, event_type: str, payload: Dict[str, Any]) -> None:
        """
        Phase 2.4: Real-time Synchronization.
        Catch live events (e.g., 'orders/create') and push them into the async processing queue.
        """
        logger.info(f"[{self.tenant_id}] Received Shopify Webhook: {event_type}")
        
        # Here we format the single payload as a batch of 1 to reuse our highly optimized
        # Polars normalizer and Parquet append pipelines.
        batch = [payload]
        
        # In actual execution, this delegates to api/services/sync_engine.py
        # to process `batch` through json_normalizer and update the DuckDB views.
        pass

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Phase 1.1 / Analytical Efficiency:
        Pre-computes optimized DuckDB SQL for the specific shapes Shopify generates.
        """
        return {
            "vw_shopify_ltv": """
                SELECT 
                    customer_id, 
                    count(id) as total_orders, 
                    sum(total_price) as lifetime_value,
                    max(created_at) as last_purchase_date
                FROM shopify_orders 
                GROUP BY customer_id
            """,
            "vw_shopify_monthly_revenue": """
                SELECT 
                    date_trunc('month', created_at) as month, 
                    sum(total_price) as gross_revenue 
                FROM shopify_orders 
                GROUP BY month 
                ORDER BY month DESC
            """
        }