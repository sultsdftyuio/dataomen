"""
ARCLI.TECH - SaaS Integration Module
Connector: Stripe (Financial Analytics)
Strategy: Async Chunking, Zero-ETL Vectorization, & Security by Design
"""

import os
import time
import hmac
import hashlib
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, AsyncGenerator, Optional

import aiohttp
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class StripeRateLimitError(Exception):
    """Custom exception to trigger Tenacity backoff specifically for HTTP 429s."""
    pass

class StripeConnector(BaseIntegration):
    """
    High-throughput asynchronous connector for the Stripe API.
    Handles strict OAuth consent, cursor pagination for historical data, 
    webhook signature verification, and dynamic DuckDB schema enforcement.
    """
    
    # Security by Design: Instructs the downstream DataSanitizer to cryptographically hash these fields
    PII_COLUMNS = ["email", "phone", "name", "customer_email", "receipt_email"]

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        """
        Initializes the connector securely, mapping credentials from the Vault 
        into the parent BaseIntegration config.
        """
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="stripe", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        self.api_base = "https://api.stripe.com/v1"
        self.client_token = self._initialize_client()

    def _initialize_client(self) -> str:
        """
        Extract the Stripe API key or OAuth access token from the isolated tenant credentials.
        """
        token = self.config.credentials.get("access_token") or self.config.credentials.get("api_key", "")
        if not token:
            logger.warning(f"[{self.tenant_id}] Stripe integration initialized without a valid token.")
        return token

    # -------------------------------------------------------------------------
    # Schema & Contextual RAG Definitions
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        The Schema Contract for the SyncEngine.
        Defines the expected flattened JSON structure for core Stripe objects so the 
        DuckDB Validator can enforce strict Parquet typing.
        """
        return {
            "charges": {
                "id": "VARCHAR",
                "object": "VARCHAR",
                "amount": "DOUBLE",           # Stored as DOUBLE for native mathematical precision
                "amount_captured": "DOUBLE",
                "amount_refunded": "DOUBLE",
                "balance_transaction": "VARCHAR",
                "calculated_statement_descriptor": "VARCHAR",
                "captured": "BOOLEAN",
                "created": "BIGINT",
                "currency": "VARCHAR",
                "customer": "VARCHAR",
                "description": "VARCHAR",
                "invoice": "VARCHAR",
                "paid": "BOOLEAN",
                "payment_method": "VARCHAR",
                "receipt_email": "VARCHAR",
                "status": "VARCHAR"
            },
            "subscriptions": {
                "id": "VARCHAR",
                "object": "VARCHAR",
                "cancel_at_period_end": "BOOLEAN",
                "canceled_at": "BIGINT",
                "collection_method": "VARCHAR",
                "created": "BIGINT",
                "current_period_end": "BIGINT",
                "current_period_start": "BIGINT",
                "customer": "VARCHAR",
                "status": "VARCHAR",
                "plan_amount": "DOUBLE",      # Assumes nested 'plan.amount' was flattened by normalizer
                "plan_interval": "VARCHAR"
            },
            "customers": {
                "id": "VARCHAR",
                "object": "VARCHAR",
                "balance": "DOUBLE",
                "created": "BIGINT",
                "currency": "VARCHAR",
                "default_source": "VARCHAR",
                "delinquent": "BOOLEAN",
                "email": "VARCHAR",
                "name": "VARCHAR",
                "phone": "VARCHAR"
            }
        }

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Contextual RAG Optimization: The 'Secret Sauce' Pre-Built Analytical Views.
        These DuckDB views are injected into the semantic router so the LLM 
        understands exactly how to query Stripe data reliably without hallucinating logic.
        """
        return {
            "vw_stripe_revenue": """
                SELECT 
                    time_bucket(INTERVAL '1 day', to_timestamp(created)) as date,
                    sum(amount) / 100.0 as gross_revenue,
                    sum(amount_refunded) / 100.0 as refunded_revenue,
                    (sum(amount) - sum(amount_refunded)) / 100.0 as net_revenue,
                    currency
                FROM stripe_charges
                WHERE paid = true AND status = 'succeeded'
                GROUP BY 1, currency
                ORDER BY 1 DESC
            """,
            "vw_stripe_mrr": """
                SELECT 
                    time_bucket(INTERVAL '1 month', to_timestamp(created)) as month,
                    -- Note: The JSON normalizer flattens nested fields. 'plan.amount' becomes 'plan_amount'
                    sum(plan_amount) / 100.0 as mrr
                FROM stripe_subscriptions
                WHERE status IN ('active', 'past_due')
                GROUP BY 1
                ORDER BY 1 DESC
            """
        }

    # -------------------------------------------------------------------------
    # Authentication & Security
    # -------------------------------------------------------------------------

    def get_oauth_url(self, redirect_uri: str) -> str:
        """Generate the Stripe OAuth URL for standard connect with read-only scopes."""
        client_id = os.environ.get("STRIPE_CLIENT_ID", "")
        # read_only scope ensures least-privilege access for data pipelining
        return f"https://connect.stripe.com/oauth/authorize?response_type=code&client_id={client_id}&scope=read_only&redirect_uri={redirect_uri}"

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """Exchange the authorization code for Stripe access tokens."""
        async with aiohttp.ClientSession() as session:
            payload = {
                "grant_type": "authorization_code",
                "client_id": os.environ.get("STRIPE_CLIENT_ID", ""),
                "client_secret": os.environ.get("STRIPE_SECRET_KEY", ""),
                "code": code
            }
            async with session.post("https://connect.stripe.com/oauth/token", data=payload) as resp:
                resp.raise_for_status()
                return await resp.json()

    async def verify_webhook_signature(self, payload: str, signature_header: str) -> bool:
        """
        The Push Pipeline Security (Webhooks).
        Cryptographically verify the Stripe payload to prevent impersonation at the Edge.
        """
        endpoint_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        if not endpoint_secret:
            logger.error("STRIPE_WEBHOOK_SECRET is not configured. Rejecting webhook.")
            return False

        try:
            # Parse the signature header safely: "t=timestamp,v1=signature"
            sig_parts = dict(part.split("=") for part in signature_header.split(",") if "=" in part)
            timestamp = sig_parts.get("t")
            v1_sig = sig_parts.get("v1")

            if not timestamp or not v1_sig:
                return False

            # Prevent replay attacks (reject payloads older than 5 minutes)
            if time.time() - int(timestamp) > 300:
                logger.warning(f"[{self.tenant_id}] Stripe webhook rejected: Payload too old (replay attack risk).")
                return False

            signed_payload = f"{timestamp}.{payload}"
            
            mac = hmac.new(
                endpoint_secret.encode('utf-8'),
                signed_payload.encode('utf-8'),
                hashlib.sha256
            )
            expected_sig = mac.hexdigest()

            return hmac.compare_digest(expected_sig, v1_sig)
        except Exception as e:
            logger.error(f"[{self.tenant_id}] Webhook signature verification failed: {str(e)}")
            return False

    async def test_connection(self) -> bool:
        """Fast validation to ensure credentials haven't been revoked."""
        if not self.client_token:
            return False
        headers = {"Authorization": f"Bearer {self.client_token}", "Stripe-Version": "2023-10-16"}
        try:
            async with aiohttp.ClientSession(headers=headers) as session:
                # Fetch a single charge just to verify auth
                async with session.get(f"{self.api_base}/charges?limit=1") as resp:
                    return resp.status == 200
        except Exception:
            return False

    # -------------------------------------------------------------------------
    # Core Data Ingestion (Execution Layer)
    # -------------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type((StripeRateLimitError, aiohttp.ServerDisconnectedError, aiohttp.ClientError)),
        wait=wait_exponential(multiplier=2, min=2, max=60), 
        stop=stop_after_attempt(5)
    )
    async def _fetch_page(self, session: aiohttp.ClientSession, url: str) -> Dict[str, Any]:
        """Centralized HTTP execution with robust exponential backoff for network resilience."""
        async with session.get(url) as resp:
            if resp.status == 429:
                logger.warning(f"[{self.tenant_id}] Stripe API rate limit hit. Tenacity backing off...")
                raise StripeRateLimitError("Rate limit exceeded")
            resp.raise_for_status()
            return await resp.json()

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Polling).
        Yields raw JSON batches to the Polars Normalizer using async Stripe pagination.
        Ensures OOM safety by never holding the entire dataset in RAM.
        """
        has_more = True
        starting_after = None
        limit = 100  # Stripe's maximum allowed limit per page
        total_fetched = 0

        headers = {
            "Authorization": f"Bearer {self.client_token}",
            "Stripe-Version": "2023-10-16"
        }

        # Convert ISO start_timestamp to UNIX for Stripe API filtering
        unix_start = 0
        if start_timestamp:
            try:
                # Normalize Z to +00:00 for strict ISO 8601 parsing
                dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
                unix_start = int(dt.timestamp())
            except ValueError:
                logger.warning(f"[{self.tenant_id}] Invalid start_timestamp format. Defaulting to pull all historical data.")

        base_query = f"?limit={limit}"
        if unix_start > 0:
            base_query += f"&created[gte]={unix_start}"

        logger.info(f"[{self.tenant_id}] Starting Stripe ingestion for stream: {stream_name}")

        # Use a single connection pool across the entire pagination loop
        async with aiohttp.ClientSession(headers=headers) as session:
            while has_more:
                url = f"{self.api_base}/{stream_name}{base_query}"
                if starting_after:
                    url += f"&starting_after={starting_after}"
                
                try:
                    data = await self._fetch_page(session, url)
                except Exception as e:
                    logger.error(f"[{self.tenant_id}] Fatal error fetching page from {stream_name}: {str(e)}")
                    raise

                items = data.get("data", [])
                if not items:
                    break
                    
                total_fetched += len(items)
                logger.debug(f"[{self.tenant_id}] Fetched {len(items)} records (Total: {total_fetched}) from {stream_name}")

                # Yield the batch to the SyncEngine to be vectorized and saved as Parquet immediately
                yield items
                
                has_more = data.get("has_more", False)
                if has_more:
                    starting_after = items[-1]["id"]
                    
        logger.info(f"✅ [{self.tenant_id}] Completed Stripe ingestion for {stream_name}. Total records: {total_fetched}")