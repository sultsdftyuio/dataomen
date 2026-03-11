# api/services/integrations/stripe_connector.py

import os
import time
import hmac
import hashlib
import logging
from typing import Dict, Any, List, AsyncGenerator
import aiohttp
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class StripeRateLimitError(Exception):
    pass

class StripeIntegration(BaseIntegration):
    """
    Stripe Zero-ETL Connector.
    Handles strict OAuth consent, async pagination for historical data, 
    webhook signature verification, and pre-built semantic analytical views.
    """

    def __init__(self, config: IntegrationConfig):
        super().__init__(config)
        self.api_base = "https://api.stripe.com/v1"
        self.client_token = self._initialize_client()

    def _initialize_client(self) -> str:
        """
        Extract the Stripe API key or OAuth access token from the isolated tenant credentials.
        Returns the bearer token string.
        """
        token = self.config.credentials.get("access_token") or self.config.credentials.get("api_key", "")
        if not token:
            logger.warning(f"[{self.config.tenant_id}] Stripe integration initialized without a valid token.")
        return token

    def get_oauth_url(self, redirect_uri: str) -> str:
        """
        Generate the Stripe OAuth URL for standard connect with read-only analytical scopes.
        """
        client_id = os.environ.get("STRIPE_CLIENT_ID", "")
        # read_only scope ensures least-privilege access for data pipelining
        return f"https://connect.stripe.com/oauth/authorize?response_type=code&client_id={client_id}&scope=read_only&redirect_uri={redirect_uri}"

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """
        Exchange the authorization code for Stripe access and refresh tokens.
        These should subsequently be stored in Supabase Vault.
        """
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

    # Apply exponential backoff strictly for HTTP 429 (Rate Limit) and 50x errors
    @retry(
        retry=retry_if_exception_type((StripeRateLimitError, aiohttp.ServerDisconnectedError)),
        wait=wait_exponential(multiplier=2, min=2, max=60), 
        stop=stop_after_attempt(5)
    )
    async def _fetch_page(self, session: aiohttp.ClientSession, url: str) -> Dict[str, Any]:
        async with session.get(url) as resp:
            if resp.status == 429:
                logger.warning(f"[{self.config.tenant_id}] Stripe API rate limit hit. Backing off...")
                raise StripeRateLimitError("Rate limit exceeded")
            resp.raise_for_status()
            return await resp.json()

    async def pull_historical_data(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Polling).
        Yields raw JSON batches to the Polars Normalizer using async Stripe pagination.
        Handles rate limiting gracefully via Tenacity exponential backoff.
        
        :param stream_name: The Stripe API endpoint (e.g., 'charges', 'invoices', 'subscriptions')
        :param start_timestamp: ISO 8601 string to restrict historical pulls
        """
        has_more = True
        starting_after = None
        limit = 100  # Stripe's maximum allowed limit per page
        total_fetched = 0

        headers = {
            "Authorization": f"Bearer {self.client_token}",
            "Stripe-Version": "2023-10-16"
        }

        # Query parameters can include created[gte]=UNIX_TIMESTAMP to limit historical scope
        logger.info(f"[{self.config.tenant_id}] Starting Stripe ingestion for stream: {stream_name}")

        async with aiohttp.ClientSession(headers=headers) as session:
            while has_more:
                url = f"{self.api_base}/{stream_name}?limit={limit}"
                if starting_after:
                    url += f"&starting_after={starting_after}"
                
                try:
                    data = await self._fetch_page(session, url)
                except Exception as e:
                    logger.error(f"[{self.config.tenant_id}] Failed to fetch page from {stream_name}: {str(e)}")
                    raise

                items = data.get("data", [])
                if not items:
                    break
                    
                total_fetched += len(items)
                logger.debug(f"[{self.config.tenant_id}] Fetched {len(items)} records (Total: {total_fetched}) from {stream_name}")

                # Yield the batch to be vectorized and saved as Parquet immediately
                yield items
                
                has_more = data.get("has_more", False)
                if has_more:
                    starting_after = items[-1]["id"]
                    
        logger.info(f"[{self.config.tenant_id}] Completed Stripe ingestion for {stream_name}. Total records: {total_fetched}")

    async def verify_webhook_signature(self, payload: str, signature_header: str) -> bool:
        """
        The Push Pipeline Security (Webhooks).
        Cryptographically verify the Stripe payload before accepting it at the Edge.
        """
        endpoint_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        if not endpoint_secret:
            logger.error("STRIPE_WEBHOOK_SECRET is not configured.")
            return False

        try:
            # Parse the signature header: "t=timestamp,v1=signature" safely
            sig_parts = dict(part.split("=") for part in signature_header.split(",") if "=" in part)
            timestamp = sig_parts.get("t")
            v1_sig = sig_parts.get("v1")

            if not timestamp or not v1_sig:
                return False

            # Prevent replay attacks (reject payloads older than 5 minutes)
            if time.time() - int(timestamp) > 300:
                logger.warning("Stripe webhook rejected: Payload timestamp too old (replay attack risk).")
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
            logger.error(f"Webhook signature verification failed: {str(e)}")
            return False

    def get_semantic_views(self) -> Dict[str, str]:
        """
        The 'Secret Sauce' Pre-Built Analytical Views.
        These DuckDB views are automatically injected into the semantic router
        so the LLM understands exactly how to query Stripe data reliably without hallucinating logic.
        """
        return {
            "vw_stripe_revenue": """
                SELECT 
                    date_trunc('day', to_timestamp(created)) as date,
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
                    date_trunc('month', to_timestamp(created)) as month,
                    -- Note: The JSON normalizer flattens nested fields. 'plan.amount' becomes 'plan_amount'
                    sum(plan_amount * quantity) / 100.0 as mrr
                FROM stripe_subscriptions
                WHERE status IN ('active', 'past_due')
                GROUP BY 1
                ORDER BY 1 DESC
            """
        }