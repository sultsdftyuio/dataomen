# api/services/integrations/stripe_connector.py

import os
import time
import hmac
import hashlib
from typing import Dict, Any, List, AsyncGenerator
import aiohttp

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

class StripeIntegration(BaseIntegration):
    """
    Stripe Zero-ETL Connector.
    Handles strict OAuth consent, async pagination for historical data, 
    webhook signature verification, and pre-built semantic analytical views.
    """

    def __init__(self, config: IntegrationConfig):
        super().__init__(config)
        self.api_base = "https://api.stripe.com/v1"

    def _initialize_client(self) -> str:
        """
        Extract the Stripe API key or OAuth access token from the isolated tenant credentials.
        Returns the bearer token string.
        """
        return self.config.credentials.get("access_token") or self.config.credentials.get("api_key", "")

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

    async def pull_historical_data(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Polling).
        Yields raw JSON batches to the Polars Normalizer using async Stripe pagination.
        
        :param stream_name: The Stripe API endpoint (e.g., 'charges', 'invoices', 'subscriptions')
        :param start_timestamp: ISO 8601 string to restrict historical pulls
        """
        has_more = True
        starting_after = None
        limit = 100  # Stripe's maximum allowed limit per page

        headers = {
            "Authorization": f"Bearer {self.client}",
            "Stripe-Version": "2023-10-16"
        }

        async with aiohttp.ClientSession(headers=headers) as session:
            while has_more:
                url = f"{self.api_base}/{stream_name}?limit={limit}"
                if starting_after:
                    url += f"&starting_after={starting_after}"
                
                async with session.get(url) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    
                    items = data.get("data", [])
                    if not items:
                        break
                        
                    # Yield the batch to be vectorized and saved as Parquet immediately
                    yield items
                    
                    has_more = data.get("has_more", False)
                    if has_more:
                        starting_after = items[-1]["id"]

    async def verify_webhook_signature(self, payload: str, signature_header: str) -> bool:
        """
        The Push Pipeline Security (Webhooks).
        Cryptographically verify the Stripe payload before accepting it at the Edge.
        """
        endpoint_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        if not endpoint_secret:
            return False

        try:
            # Parse the signature header: "t=timestamp,v1=signature"
            sig_parts = dict(part.split("=") for part in signature_header.split(","))
            timestamp = sig_parts.get("t")
            v1_sig = sig_parts.get("v1")

            if not timestamp or not v1_sig:
                return False

            # Prevent replay attacks (reject payloads older than 5 minutes)
            if time.time() - int(timestamp) > 300:
                return False

            signed_payload = f"{timestamp}.{payload}"
            
            mac = hmac.new(
                endpoint_secret.encode('utf-8'),
                signed_payload.encode('utf-8'),
                hashlib.sha256
            )
            expected_sig = mac.hexdigest()

            return hmac.compare_digest(expected_sig, v1_sig)
        except Exception:
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
                    sum(plan_amount * quantity) / 100.0 as mrr
                FROM stripe_subscriptions
                WHERE status IN ('active', 'past_due')
                GROUP BY 1
                ORDER BY 1 DESC
            """
        }