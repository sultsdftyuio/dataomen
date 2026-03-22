"""
ARCLI.TECH - SaaS Integration Module
Connector: Shopify (E-Commerce Analytics)
Strategy: GraphQL Bulk Ops, Incremental Sync, JSONL Streaming, & Security by Design
"""

import os
import json
import hmac
import hashlib
import base64
import logging
import asyncio
import time
import contextlib
from datetime import datetime
from typing import Dict, Any, List, AsyncGenerator, Optional

import httpx
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)


# -------------------------------------------------------------------------
# Exceptions
# -------------------------------------------------------------------------

class ShopifyNetworkError(Exception):
    pass


class ShopifyBulkTimeout(Exception):
    pass


# -------------------------------------------------------------------------
# Connector
# -------------------------------------------------------------------------

class ShopifyConnector(BaseIntegration):

    PII_COLUMNS = ["email", "phone", "first_name", "last_name", "customer_email"]

    SUPPORTED_STREAMS = ["orders", "customers"]

    BULK_TIMEOUT_SECONDS = 3600  # 1 hour max

    # -------------------------------------------------------------------------
    # Init
    # -------------------------------------------------------------------------

    def __init__(
        self,
        tenant_id: str,
        credentials: Optional[Dict[str, Any]] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name="shopify",
            credentials=credentials or {},
        )
        super().__init__(config)

        self.client_id = os.environ.get("SHOPIFY_CLIENT_ID")
        self.client_secret = os.environ.get("SHOPIFY_CLIENT_SECRET")
        self.api_version = "2024-01"

        self.shop_url = self.config.credentials.get("shop_url", "")
        self.access_token = self.config.credentials.get("access_token", "")

        self._external_client = client

    # -------------------------------------------------------------------------
    # HTTP Client
    # -------------------------------------------------------------------------

    @contextlib.asynccontextmanager
    async def _get_client(self) -> AsyncGenerator[httpx.AsyncClient, None]:
        if self._external_client:
            yield self._external_client
            return

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if self.access_token:
            headers["X-Shopify-Access-Token"] = self.access_token

        base_url = f"https://{self.shop_url}/admin/api/{self.api_version}"

        async with httpx.AsyncClient(
            base_url=base_url,
            headers=headers,
            timeout=httpx.Timeout(60.0),
        ) as client:
            yield client

    # -------------------------------------------------------------------------
    # Schema
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        return {
            "orders": {
                "id": "VARCHAR",
                "created_at": "BIGINT",
                "total_price": "DECIMAL(18,2)",  # FIXED
                "currency": "VARCHAR",
                "customer_id": "VARCHAR",
                "customer_email": "VARCHAR",
                "status": "VARCHAR",
            },
            "customers": {
                "id": "VARCHAR",
                "email": "VARCHAR",
                "created_at": "BIGINT",
                "orders_count": "BIGINT",
                "total_spent": "DECIMAL(18,2)",
                "currency": "VARCHAR",
            },
        }

    # -------------------------------------------------------------------------
    # Semantic Views
    # -------------------------------------------------------------------------

    def get_semantic_views(self) -> Dict[str, str]:
        return {
            "vw_shopify_daily_revenue": """
                SELECT 
                    date_trunc('day', to_timestamp(created_at / 1000)) AS date,
                    SUM(total_price) AS revenue,
                    COUNT(id) AS orders,
                    currency
                FROM shopify_orders
                GROUP BY 1, 4
                ORDER BY 1 DESC
            """,
            "vw_shopify_aov": """
                SELECT 
                    date_trunc('month', to_timestamp(created_at / 1000)) AS month,
                    SUM(total_price) / COUNT(id) AS aov,
                    currency
                FROM shopify_orders
                GROUP BY 1, 3
            """,
        }

    # -------------------------------------------------------------------------
    # OAuth
    # -------------------------------------------------------------------------

    def get_oauth_url(self, redirect_uri: str) -> str:
        scopes = "read_orders,read_products,read_customers"
        return (
            f"https://{self.shop_url}/admin/oauth/authorize"
            f"?client_id={self.client_id}"
            f"&scope={scopes}"
            f"&redirect_uri={redirect_uri}"
        )

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        url = f"https://{self.shop_url}/admin/oauth/access_token"

        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        return {
            "shop_url": self.shop_url,
            "access_token": data.get("access_token"),
        }

    # -------------------------------------------------------------------------
    # Webhook Verification
    # -------------------------------------------------------------------------

    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        if not self.client_secret:
            return False

        digest = hmac.new(
            self.client_secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).digest()

        computed = base64.b64encode(digest).decode()

        return hmac.compare_digest(computed, signature)

    # -------------------------------------------------------------------------
    # Bulk Polling
    # -------------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type((httpx.NetworkError, ShopifyNetworkError)),
        wait=wait_exponential(min=5, max=60),
        stop=stop_after_attempt(10),
    )
    async def _poll_bulk_operation(
        self,
        client: httpx.AsyncClient,
        start_time: float,
    ) -> Optional[str]:

        query = """
        query {
          currentBulkOperation {
            id status errorCode createdAt completedAt url
          }
        }
        """

        while True:
            if time.time() - start_time > self.BULK_TIMEOUT_SECONDS:
                raise ShopifyBulkTimeout("Bulk operation timed out")

            resp = await client.post("/graphql.json", json={"query": query})

            if resp.status_code >= 500:
                raise ShopifyNetworkError()

            resp.raise_for_status()
            op = resp.json().get("data", {}).get("currentBulkOperation")

            if not op:
                return None

            status = op.get("status")

            if status == "COMPLETED":
                return op.get("url")

            if status in ["FAILED", "CANCELED", "EXPIRED"]:
                logger.error(f"[{self.tenant_id}] Bulk failed: {status}")
                return None

            await asyncio.sleep(5)

    # -------------------------------------------------------------------------
    # Sync (Bulk + Streaming + Checkpoint-ready)
    # -------------------------------------------------------------------------

    async def sync_stream(
        self,
        stream_name: str,
        start_timestamp: Optional[str] = None,
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:

        assert stream_name in self.SUPPORTED_STREAMS

        start = start_timestamp or "2020-01-01T00:00:00Z"

        queries = {
            "orders": f"""
                mutation {{
                  bulkOperationRunQuery(query: \"\"\"
                  {{
                    orders(query: "created_at:>={start}") {{
                      edges {{
                        node {{
                          id createdAt displayFinancialStatus
                          totalPriceSet {{ shopMoney {{ amount currencyCode }} }}
                          customer {{ id email }}
                        }}
                      }}
                    }}
                  }}
                  \"\"\") {{
                    bulkOperation {{ id status }}
                    userErrors {{ field message }}
                  }}
                }}
            """,
            "customers": f"""
                mutation {{
                  bulkOperationRunQuery(query: \"\"\"
                  {{
                    customers(query: "created_at:>={start}") {{
                      edges {{
                        node {{
                          id email createdAt ordersCount
                          amountSpent {{ amount currencyCode }}
                        }}
                      }}
                    }}
                  }}
                  \"\"\") {{
                    bulkOperation {{ id status }}
                    userErrors {{ field message }}
                  }}
                }}
            """,
        }

        query = queries[stream_name]

        async with self._get_client() as client:
            resp = await client.post("/graphql.json", json={"query": query})
            resp.raise_for_status()

            start_time = time.time()

            bulk_url = await self._poll_bulk_operation(client, start_time)
            if not bulk_url:
                return

        # Streaming JSONL
        chunk_size = 10000
        batch = []
        total = 0

        async with httpx.AsyncClient(timeout=None) as dl:
            async with dl.stream("GET", bulk_url) as r:
                r.raise_for_status()

                async for line in r.aiter_lines():
                    if not line.strip():
                        continue

                    try:
                        data = json.loads(line)
                    except Exception:
                        continue  # skip bad lines

                    if "__parentId" in data:
                        continue

                    flat = self._flatten(data, stream_name)

                    batch.append(flat)
                    total += 1

                    if len(batch) >= chunk_size:
                        yield batch
                        batch = []

        if batch:
            yield batch

        logger.info(f"[{self.tenant_id}] Synced {stream_name}: {total} rows")

    # -------------------------------------------------------------------------
    # Flatten
    # -------------------------------------------------------------------------

    def _flatten(self, node: Dict[str, Any], stream: str) -> Dict[str, Any]:
        flat = {
            "id": str(node.get("id", "")).split("/")[-1]
        }

        if "createdAt" in node:
            try:
                dt = datetime.fromisoformat(node["createdAt"].replace("Z", "+00:00"))
                flat["created_at"] = int(dt.timestamp() * 1000)
            except:
                flat["created_at"] = 0

        if stream == "orders":
            money = node.get("totalPriceSet", {}).get("shopMoney", {})
            flat["total_price"] = float(money.get("amount", 0))  # safe decimal input
            flat["currency"] = money.get("currencyCode", "USD")

            cust = node.get("customer") or {}
            flat["customer_id"] = str(cust.get("id", "")).split("/")[-1]
            flat["customer_email"] = cust.get("email", "")

            flat["status"] = node.get("displayFinancialStatus", "")

        elif stream == "customers":
            flat["email"] = node.get("email", "")
            flat["orders_count"] = int(node.get("ordersCount", 0))

            spent = node.get("amountSpent") or {}
            flat["total_spent"] = float(spent.get("amount", 0))
            flat["currency"] = spent.get("currencyCode", "USD")

        return flat

    # -------------------------------------------------------------------------
    # Parallel Sync Entry
    # -------------------------------------------------------------------------

    async def sync_all_streams(self, start_timestamp: Optional[str] = None):
        tasks = [
            self.sync_stream(stream, start_timestamp)
            for stream in self.SUPPORTED_STREAMS
        ]
        return await asyncio.gather(*tasks)