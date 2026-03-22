"""
ARCLI.TECH - SaaS Integration Module
Connector: Shopify (Production Grade E-Commerce Analytics)
Strategy: Hybrid Sync (Bulk + Incremental), JSONL Streaming, & Security by Design
"""

import os
import re
import json
import hmac
import hashlib
import base64
import logging
import asyncio
import time
import contextlib
import random
from datetime import datetime, timezone
from typing import Dict, Any, List, AsyncGenerator, Optional

import httpx
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

# ISO 8601 UTC datetime — e.g. "2024-03-15T00:00:00Z"
_ISO8601_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


# -------------------------------------------------------------------------
# Exceptions
# -------------------------------------------------------------------------

class ShopifyNetworkError(Exception):
    pass

class ShopifyBulkTimeout(Exception):
    pass

class ShopifyBulkConflictError(Exception):
    """Triggered when another Bulk Operation is already running on the store."""
    pass

class ShopifyPIIError(Exception):
    """Raised when PII masking is required but no data_sanitizer is configured."""
    pass


# -------------------------------------------------------------------------
# Connector Implementation
# -------------------------------------------------------------------------

class ShopifyConnector(BaseIntegration):
    """
    Shopify Zero-ETL Connector.

    Engineering Standards:
    - Hybrid Mode: Uses Bulk API for >2 days history, Standard GraphQL for incremental.
    - JSONL Chunking: Streams the resulting file directly into memory in chunks.
    - DuckDB Alignment: Flattens deeply nested GraphQL nodes into standard tables.
    - Security: Deterministic PII masking and HMAC Webhook verification.
    """

    PII_COLUMNS = ["email", "phone", "first_name", "last_name", "customer_email"]
    SUPPORTED_STREAMS = ["orders", "customers"]

    BULK_TIMEOUT_SECONDS = 3600
    CONFLICT_RETRY_ATTEMPTS = 5
    CONFLICT_RETRY_BASE_WAIT = 15
    CONFLICT_RETRY_MAX_WAIT = 120
    INCREMENTAL_WINDOW_DAYS = 2  # Switch to fast incremental queries if recent

    def __init__(
        self,
        tenant_id: str,
        credentials: Optional[Dict[str, Any]] = None,
        client: Optional[httpx.AsyncClient] = None,
        chunk_size: int = 5000,
        default_start_timestamp: str = "2020-01-01T00:00:00Z",
        sample_rate: Optional[float] = None,
    ):
        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name="shopify",
            credentials=credentials or {},
        )
        super().__init__(config)

        self.client_id = os.environ.get("SHOPIFY_CLIENT_ID")
        self.client_secret = os.environ.get("SHOPIFY_CLIENT_SECRET")
        self.api_version = "2025-01"

        # Format: tenant-store.myshopify.com
        self.shop_url = self.config.credentials.get("shop_url", "").replace("https://", "")
        self.access_token = self.config.credentials.get("access_token", "")

        self._external_client = client
        self.chunk_size = chunk_size
        self.default_start_timestamp = default_start_timestamp
        self.sample_rate = sample_rate

    # -------------------------------------------------------------------------
    # HTTP Client Wrapper
    # -------------------------------------------------------------------------

    @contextlib.asynccontextmanager
    async def _get_client(self) -> AsyncGenerator[httpx.AsyncClient, None]:
        if self._external_client:
            yield self._external_client
            return

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Shopify-Access-Token": self.access_token,
        }

        base_url = f"https://{self.shop_url}/admin/api/{self.api_version}"

        async with httpx.AsyncClient(
            base_url=base_url,
            headers=headers,
            timeout=httpx.Timeout(60.0),
        ) as client:
            yield client

    # -------------------------------------------------------------------------
    # Webhook Verification
    # -------------------------------------------------------------------------

    def verify_webhook(self, raw_body: bytes, hmac_header: str) -> bool:
        """Verifies incoming Shopify webhook payloads to prevent spoofing."""
        if not self.client_secret:
            logger.error("[%s] Webhook verify failed: SHOPIFY_CLIENT_SECRET missing.", self.tenant_id)
            return False

        digest = hmac.new(
            self.client_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).digest()
        computed = base64.b64encode(digest).decode("utf-8")

        return hmac.compare_digest(computed, hmac_header)

    # -------------------------------------------------------------------------
    # Schema & Semantic Views
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        return {
            "shopify_orders": {
                "id":             "VARCHAR",
                "created_at":     "BIGINT",   # Unix epoch ms
                "updated_at":     "BIGINT",
                "total_price":    "DECIMAL(18,2)",
                "currency":       "VARCHAR",
                "customer_id":    "VARCHAR",
                "customer_email": "VARCHAR",
                "status":         "VARCHAR",
            },
            "shopify_customers": {
                "id":             "VARCHAR",
                "email":          "VARCHAR",
                "created_at":     "BIGINT",
                "updated_at":     "BIGINT",
                "orders_count":   "BIGINT",
                "total_spent":    "DECIMAL(18,2)",
                "currency":       "VARCHAR",
            },
        }

    def get_semantic_views(self) -> Dict[str, str]:
        """Pre-computed Vector-Ready SQL views for DuckDB."""
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
                    SUM(total_price) / NULLIF(COUNT(id), 0) AS aov,
                    currency
                FROM shopify_orders
                GROUP BY 1, 3
            """,
        }

    # -------------------------------------------------------------------------
    # BaseIntegration Contract
    # -------------------------------------------------------------------------

    async def sync_historical(
        self,
        stream_name: str,
        checkpoint: Optional[Dict[str, Any]] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        
        start_timestamp = self._resolve_checkpoint(checkpoint)

        if stream_name not in self.SUPPORTED_STREAMS:
            raise ValueError(f"[{self.tenant_id}] Unsupported stream: {stream_name}")

        if not self._has_sanitizer():
            raise ShopifyPIIError(f"[{self.tenant_id}] data_sanitizer required to prevent unmasked PII leakage.")

        if self._should_use_bulk(start_timestamp):
            logger.info("[%s] Shopify %s: Using BULK Sync strategy.", self.tenant_id, stream_name)
            generator = self._sync_bulk(stream_name, start_timestamp)
        else:
            logger.info("[%s] Shopify %s: Using INCREMENTAL Sync strategy.", self.tenant_id, stream_name)
            generator = self._sync_incremental(stream_name, start_timestamp)

        async for payload in generator:
            yield payload

    # -------------------------------------------------------------------------
    # Sync Strategies
    # -------------------------------------------------------------------------

    async def _sync_bulk(
        self,
        stream_name: str,
        start: str
    ) -> AsyncGenerator[Dict[str, Any], None]:

        query = self._get_graphql_query(stream_name, start, is_bulk=True)
        bulk_url: Optional[str] = None

        for attempt in range(self.CONFLICT_RETRY_ATTEMPTS):
            async with self._get_client() as client:
                resp = await client.post("/graphql.json", json={"query": query})
                resp.raise_for_status()

                data = resp.json().get("data", {}).get("bulkOperationRunQuery", {})
                user_errors = data.get("userErrors", [])

                if user_errors:
                    msg = user_errors[0].get("message", "")
                    if "already in progress" in msg.lower():
                        wait = min(self.CONFLICT_RETRY_BASE_WAIT * (2 ** attempt), self.CONFLICT_RETRY_MAX_WAIT)
                        logger.warning("[%s] Bulk conflict. Retrying in %ds...", self.tenant_id, wait)
                        await asyncio.sleep(wait)
                        continue
                    raise ValueError(f"[{self.tenant_id}] Shopify GraphQL error: {msg}")

                bulk_url = await self._poll_bulk_operation(client)
                break

        if not bulk_url:
            return

        async for payload in self._stream_jsonl(bulk_url, stream_name):
            yield payload

    async def _sync_incremental(
        self,
        stream_name: str,
        start: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        
        query = self._get_graphql_query(stream_name, start, is_bulk=False)

        async with self._get_client() as client:
            resp = await client.post("/graphql.json", json={"query": query})
            resp.raise_for_status()
            data = resp.json().get("data", {}).get(stream_name, {}).get("edges", [])

        batch = []
        for edge in data:
            if "__parentId" in edge.get("node", {}):
                continue
            flat = self._flatten(edge["node"], stream_name)
            batch.append(flat)

        if batch:
            yield self._emit_batch(batch)

    # -------------------------------------------------------------------------
    # Streaming & Parsing
    # -------------------------------------------------------------------------

    async def _stream_jsonl(self, url: str, stream: str) -> AsyncGenerator[Dict[str, Any], None]:
        batch = []
        download_timeout = httpx.Timeout(connect=10.0, read=300.0, write=None, pool=5.0)

        async with httpx.AsyncClient(timeout=download_timeout) as dl:
            async with dl.stream("GET", url) as r:
                r.raise_for_status()

                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        node = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if "__parentId" in node:
                        continue

                    flat = self._flatten(node, stream)
                    batch.append(flat)

                    if len(batch) >= self.chunk_size:
                        yield self._emit_batch(batch)
                        batch = []

        if batch:
            yield self._emit_batch(batch)

    # -------------------------------------------------------------------------
    # Transformers & State
    # -------------------------------------------------------------------------

    def _emit_batch(self, batch: List[Dict[str, Any]]) -> Dict[str, Any]:
        for row in batch:
            row["_id"] = str(row.get("id"))

        if self.sample_rate:
            batch = [r for r in batch if random.random() < self.sample_rate]

        batch = self._mask_pii(batch)
        return {
            "records": batch,
            "checkpoint": self._build_checkpoint(batch)
        }

    def _flatten(self, node: Dict[str, Any], stream: str) -> Dict[str, Any]:
        
        def to_ms(val: Optional[str]) -> Optional[int]:
            if not val: return None
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                return int(dt.timestamp() * 1000)
            except (ValueError, AttributeError):
                return None

        flat: Dict[str, Any] = {
            "id": str(node.get("id", "")).split("/")[-1],
            "created_at": to_ms(node.get("createdAt")),
            "updated_at": to_ms(node.get("updatedAt")),
        }

        if stream == "orders":
            money = node.get("totalPriceSet", {}).get("shopMoney", {})
            flat["total_price"] = float(money.get("amount", 0))
            flat["currency"] = money.get("currencyCode", "USD")

            cust = node.get("customer") or {}
            flat["customer_id"] = str(cust.get("id", "")).split("/")[-1]
            flat["customer_email"] = cust.get("email", "")
            flat["status"] = node.get("displayFinancialStatus", "")

        elif stream == "customers":
            flat["email"] = node.get("email", "")
            flat["orders_count"] = int(node.get("numberOfOrders", node.get("ordersCount", 0)))
            
            spent = node.get("amountSpent") or {}
            flat["total_spent"] = float(spent.get("amount", 0))
            flat["currency"] = spent.get("currencyCode", "USD")

        return flat

    def _mask_pii(self, batch: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Using .hash() for deterministic analytics (so same users match across records)
        for row in batch:
            for col in self.PII_COLUMNS:
                if col in row and row[col]:
                    # Depending on API, ensure .hash() or .mask() matches data_sanitizer design
                    row[col] = self.data_sanitizer.hash(row[col]) if hasattr(self.data_sanitizer, 'hash') else self.data_sanitizer.mask(row[col])
        return batch

    # -------------------------------------------------------------------------
    # Helper Utilities
    # -------------------------------------------------------------------------

    def _has_sanitizer(self) -> bool:
        return hasattr(self, "data_sanitizer") and bool(self.data_sanitizer)

    def _should_use_bulk(self, start_timestamp: str) -> bool:
        try:
            dt = datetime.fromisoformat(start_timestamp.replace("Z", "+00:00"))
            return (datetime.now(timezone.utc) - dt).days > self.INCREMENTAL_WINDOW_DAYS
        except ValueError:
            return True # Fallback to bulk if bad timestamp

    def _resolve_checkpoint(self, checkpoint: Optional[Dict[str, Any]]) -> str:
        return checkpoint.get("updated_at", self.default_start_timestamp) if checkpoint else self.default_start_timestamp

    def _build_checkpoint(self, batch: List[Dict[str, Any]]) -> Dict[str, Any]:
        max_updated = max((row.get("updated_at") for row in batch if row.get("updated_at")), default=None)
        
        if not max_updated:
            return {"updated_at": self.default_start_timestamp}
            
        # Convert ms back to ISO string for next Shopify query
        dt = datetime.fromtimestamp(max_updated / 1000, tz=timezone.utc)
        return {"updated_at": dt.strftime("%Y-%m-%dT%H:%M:%SZ")}

    def _get_graphql_query(self, stream: str, start: str, is_bulk: bool) -> str:
        if stream == "orders":
            node_fields = """
                id createdAt updatedAt displayFinancialStatus
                totalPriceSet { shopMoney { amount currencyCode } }
                customer { id email }
            """
        else:
            node_fields = """
                id email createdAt updatedAt numberOfOrders
                amountSpent { amount currencyCode }
            """

        if is_bulk:
            return f"""
                mutation {{
                    bulkOperationRunQuery(query: \"\"\"
                    {{
                        {stream}(query: "updated_at:>={start}") {{
                            edges {{ node {{ {node_fields} }} }}
                        }}
                    }}
                    \"\"\") {{
                        bulkOperation {{ id status }}
                        userErrors {{ field message }}
                    }}
                }}
            """
        else:
            return f"""
                query {{
                    {stream}(first: 100, query: "updated_at:>={start}") {{
                        edges {{ node {{ {node_fields} }} }}
                    }}
                }}
            """

    @retry(
        retry=retry_if_exception_type((httpx.NetworkError, ShopifyNetworkError)),
        wait=wait_exponential(min=5, max=60),
        stop=stop_after_attempt(10),
    )
    async def _poll_bulk_operation(self, client: httpx.AsyncClient) -> Optional[str]:
        query = """query { currentBulkOperation { id status errorCode url } }"""
        start_time = time.time()

        while True:
            if time.time() - start_time > self.BULK_TIMEOUT_SECONDS:
                raise ShopifyBulkTimeout(f"[{self.tenant_id}] Shopify Bulk Op timed out.")

            resp = await client.post("/graphql.json", json={"query": query})
            resp.raise_for_status()

            op = resp.json().get("data", {}).get("currentBulkOperation")
            if not op:
                return None

            status = op.get("status")
            if status == "COMPLETED":
                return op.get("url")
            elif status in ["FAILED", "CANCELED", "EXPIRED"]:
                logger.error("[%s] Bulk Op failed. Status: %s, Err: %s", self.tenant_id, status, op.get("errorCode"))
                return None

            await asyncio.sleep(5)

    async def test_connection(self) -> bool:
        """Lightweight check to verify token health."""
        try:
            async with self._get_client() as client:
                resp = await client.post("/graphql.json", json={"query": "{ shop { name } }"})
                return resp.status_code == 200 and "data" in resp.json()
        except Exception as e:
            logger.error("[%s] Shopify connection test failed: %s", self.tenant_id, str(e))
            return False