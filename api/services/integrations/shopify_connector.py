# api/services/integrations/shopify_connector.py

import os
import json
import hmac
import hashlib
import base64
import logging
import asyncio
import contextlib
import httpx
from datetime import datetime, timezone
from typing import Dict, Any, List, AsyncGenerator, Optional

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class ShopifyConnector(BaseIntegration):
    """
    Phase 3: Shopify Zero-ETL Connector.
    Handles OAuth 2.0, GraphQL Bulk Operations for massive historical syncs, 
    memory-safe JSONL streaming, and HMAC validation for real-time webhooks.
    """

    # Instructs the downstream DataSanitizer to cryptographically hash these fields
    PII_COLUMNS = ["email", "phone", "first_name", "last_name", "customer_email"]

    def __init__(self, tenant_id: str, credentials: Dict[str, str] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="shopify", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        self.client_id = os.environ.get("SHOPIFY_CLIENT_ID")
        self.client_secret = os.environ.get("SHOPIFY_CLIENT_SECRET")
        self.api_version = "2024-01"  # Pinning API version for stability
        
        self.shop_url = self.config.credentials.get("shop_url", "")
        self.access_token = self.config.credentials.get("access_token", "")
        
        if not self.client_id or not self.client_secret:
            logger.warning("Shopify Client ID or Secret is missing from environment variables.")

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
        
        async with httpx.AsyncClient(base_url=base_url, headers=headers, timeout=httpx.Timeout(60.0)) as client:
            yield client

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        The Schema Contract for the SyncEngine.
        Defines the expected flattened JSON structure for core Shopify objects.
        """
        return {
            "orders": {
                "id": "VARCHAR",
                "created_at": "BIGINT",
                "total_price": "DOUBLE",
                "currency": "VARCHAR",
                "customer_id": "VARCHAR",
                "customer_email": "VARCHAR",
                "line_items_count": "BIGINT"
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

    def get_oauth_url(self, redirect_uri: str) -> Optional[str]:
        """
        Generate OAuth consent URL. Requires shop_url to be injected temporarily.
        """
        if not self.shop_url:
            raise ValueError("shop_url is required in credentials to generate OAuth URL.")
            
        scopes = "read_orders,read_products,read_customers,read_analytics"
        return f"https://{self.shop_url}/admin/oauth/authorize?client_id={self.client_id}&scope={scopes}&redirect_uri={redirect_uri}"

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """
        Exchange the authorization code for a permanent offline access token.
        """
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

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline.
        Uses Shopify's GraphQL Bulk Operations to extract data, chunks the massive JSONL 
        file in-memory, and yields batches for Polars vectorization.
        """
        # Format timestamp for Shopify's query syntax
        dt_start = start_timestamp if start_timestamp else "2020-01-01T00:00:00Z"

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
            """ % dt_start,
            # Add customers and products queries as needed...
        }

        query = queries.get(stream_name)
        if not query:
            logger.warning(f"Stream {stream_name} defaults to orders due to missing explicit map.")
            query = queries["orders"]

        async with self._get_client() as client:
            # 1. Trigger Bulk Operation
            response = await client.post("/graphql.json", json={"query": query})
            response.raise_for_status()
            
            res_data = response.json()
            user_errors = res_data.get("data", {}).get("bulkOperationRunQuery", {}).get("userErrors", [])
            if user_errors:
                raise RuntimeError(f"Shopify Bulk Query Error: {user_errors}")
            
            # 2. Poll for Completion (Prevents timeouts)
            logger.info(f"[{self.config.tenant_id}] Triggered Shopify Bulk GraphQL operation for {stream_name}. Polling...")
            bulk_url = await self._poll_bulk_operation(client)
            
            if not bulk_url:
                logger.info(f"[{self.config.tenant_id}] No historical data found or operation failed for {stream_name}.")
                return

        # 3. Stream Download JSONL and Yield Batches
        # Yields in 10,000 row chunks to perfectly align with Polars vectorization limits
        chunk_size = 10000
        batch = []
        total_rows = 0
        
        logger.info(f"[{self.config.tenant_id}] Streaming JSONL file from Shopify...")
        
        async with httpx.AsyncClient() as download_client:
            async with download_client.stream("GET", bulk_url) as stream_resp:
                stream_resp.raise_for_status()
                
                async for line in stream_resp.aiter_lines():
                    if not line.strip():
                        continue
                        
                    data = json.loads(line)
                    # Simple flattening of GraphQL nested nodes for Polars
                    flat_data = self._flatten_graphql_node(data)
                    batch.append(flat_data)
                    total_rows += 1
                    
                    if len(batch) >= chunk_size:
                        yield batch
                        batch = []
                        
        if batch:
            yield batch
            
        logger.info(f"[{self.config.tenant_id}] Shopify streaming complete. Yielded {total_rows} rows.")

    async def _poll_bulk_operation(self, client: httpx.AsyncClient) -> Optional[str]:
        """Helper to poll Shopify's GraphQL API until the bulk operation completes."""
        poll_query = """
            query {
              currentBulkOperation { id status errorCode createdAt completedAt url }
            }
        """
        while True:
            response = await client.post("/graphql.json", json={"query": poll_query})
            response.raise_for_status()
            op = response.json().get("data", {}).get("currentBulkOperation", {})
            
            if not op:
                return None
                
            status = op.get("status")
            if status == "COMPLETED":
                return op.get("url") # This is the signed Google Cloud Storage URL
            elif status in ["FAILED", "CANCELED", "EXPIRED"]:
                logger.error(f"Shopify Bulk Operation failed: {op.get('errorCode')}")
                return None
                
            # Wait 5 seconds before polling again
            await asyncio.sleep(5)

    def _flatten_graphql_node(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """
        Flattens Shopify's verbose GraphQL node structures into a clean dictionary
        for the DuckDB/Polars engines.
        """
        flat = {"id": str(node.get("id", ""))}
        if "createdAt" in node:
            try:
                dt = datetime.fromisoformat(node["createdAt"].replace('Z', '+00:00'))
                flat["created_at"] = int(dt.timestamp() * 1000)
            except:
                flat["created_at"] = 0
                
        if "totalPriceSet" in node:
            flat["total_price"] = float(node["totalPriceSet"].get("shopMoney", {}).get("amount", 0.0))
            flat["currency"] = node["totalPriceSet"].get("shopMoney", {}).get("currencyCode", "USD")
            
        if "customer" in node and node["customer"]:
            flat["customer_id"] = str(node["customer"].get("id", ""))
            flat["customer_email"] = node["customer"].get("email", "")
            
        return flat

    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """
        Phase 2.4: Cryptographically verify Shopify Webhook pushes.
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