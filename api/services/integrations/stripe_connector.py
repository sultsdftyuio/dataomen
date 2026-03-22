"""
ARCLI.TECH - SaaS Integration Module
Connector: Stripe (Financial Analytics)
Strategy: Async Chunking, Incremental Sync, Zero-ETL Vectorization, Security by Design
"""

import os
import time
import hmac
import hashlib
import logging
import asyncio
from datetime import datetime
from typing import Dict, Any, List, AsyncGenerator, Optional

import aiohttp
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)


# -------------------------------------------------------------------------
# Exceptions
# -------------------------------------------------------------------------

class StripeRateLimitError(Exception):
    pass


class StripeConnector(BaseIntegration):

    PII_COLUMNS = ["email", "phone", "name", "customer_email", "receipt_email"]

    SUPPORTED_STREAMS = ["charges", "customers", "subscriptions"]

    # -------------------------------------------------------------------------
    # Init
    # -------------------------------------------------------------------------

    def __init__(
        self,
        tenant_id: str,
        credentials: Optional[Dict[str, Any]] = None,
        session: Optional[aiohttp.ClientSession] = None,
    ):
        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name="stripe",
            credentials=credentials or {},
        )
        super().__init__(config)

        self.api_base = "https://api.stripe.com/v1"
        self.client_token = self._initialize_client()

        # Reusable session (performance optimization)
        self._external_session = session

    def _initialize_client(self) -> str:
        token = (
            self.config.credentials.get("access_token")
            or self.config.credentials.get("api_key", "")
        )
        if not token:
            logger.warning(f"[{self.tenant_id}] Stripe initialized without token.")
        return token

    # -------------------------------------------------------------------------
    # Session Management
    # -------------------------------------------------------------------------

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._external_session:
            return self._external_session

        headers = {
            "Authorization": f"Bearer {self.client_token}",
            "Stripe-Version": "2023-10-16",
        }

        return aiohttp.ClientSession(headers=headers)

    # -------------------------------------------------------------------------
    # Schema
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        return {
            "charges": {
                "id": "VARCHAR",
                "amount": "BIGINT",  # FIXED: no floating point
                "amount_refunded": "BIGINT",
                "currency": "VARCHAR",
                "customer": "VARCHAR",
                "created": "BIGINT",
                "status": "VARCHAR",
                "paid": "BOOLEAN",
                "receipt_email": "VARCHAR",
            },
            "subscriptions": {
                "id": "VARCHAR",
                "customer": "VARCHAR",
                "status": "VARCHAR",
                "created": "BIGINT",
                "current_period_start": "BIGINT",
                "current_period_end": "BIGINT",
                "plan_amount": "BIGINT",
                "plan_interval": "VARCHAR",
            },
            "customers": {
                "id": "VARCHAR",
                "email": "VARCHAR",
                "name": "VARCHAR",
                "phone": "VARCHAR",
                "created": "BIGINT",
            },
        }

    # -------------------------------------------------------------------------
    # Semantic Views
    # -------------------------------------------------------------------------

    def get_semantic_views(self) -> Dict[str, str]:
        return {
            "vw_stripe_revenue": """
                SELECT 
                    date_trunc('day', to_timestamp(created)) as date,
                    SUM(amount) / 100.0 as gross_revenue,
                    SUM(amount_refunded) / 100.0 as refunded,
                    (SUM(amount) - SUM(amount_refunded)) / 100.0 as net
                FROM stripe_charges
                WHERE paid = true AND status = 'succeeded'
                GROUP BY 1
                ORDER BY 1 DESC
            """,
            "vw_stripe_mrr": """
                SELECT 
                    date_trunc('month', to_timestamp(created)) as month,
                    SUM(plan_amount) / 100.0 as mrr
                FROM stripe_subscriptions
                WHERE status IN ('active', 'past_due')
                GROUP BY 1
            """,
        }

    # -------------------------------------------------------------------------
    # OAuth
    # -------------------------------------------------------------------------

    def get_oauth_url(self, redirect_uri: str) -> str:
        client_id = os.environ.get("STRIPE_CLIENT_ID", "")
        return (
            f"https://connect.stripe.com/oauth/authorize"
            f"?response_type=code&client_id={client_id}"
            f"&scope=read_only&redirect_uri={redirect_uri}"
        )

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            payload = {
                "grant_type": "authorization_code",
                "client_id": os.environ.get("STRIPE_CLIENT_ID", ""),
                "client_secret": os.environ.get("STRIPE_SECRET_KEY", ""),
                "code": code,
            }
            async with session.post(
                "https://connect.stripe.com/oauth/token", data=payload
            ) as resp:
                resp.raise_for_status()
                return await resp.json()

    # -------------------------------------------------------------------------
    # Webhook Security
    # -------------------------------------------------------------------------

    async def verify_webhook_signature(self, payload: str, signature_header: str) -> bool:
        secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        if not secret:
            return False

        try:
            parts = dict(p.split("=") for p in signature_header.split(","))
            timestamp = parts.get("t")
            signature = parts.get("v1")

            if not timestamp or not signature:
                return False

            if time.time() - int(timestamp) > 300:
                return False

            signed_payload = f"{timestamp}.{payload}"

            mac = hmac.new(
                secret.encode(),
                signed_payload.encode(),
                hashlib.sha256,
            )

            expected = mac.hexdigest()
            return hmac.compare_digest(expected, signature)

        except Exception:
            return False

    # -------------------------------------------------------------------------
    # Connection Test
    # -------------------------------------------------------------------------

    async def test_connection(self) -> bool:
        if not self.client_token:
            return False

        session = await self._get_session()

        try:
            async with session.get(f"{self.api_base}/charges?limit=1") as resp:
                return resp.status == 200
        except Exception:
            return False

    # -------------------------------------------------------------------------
    # HTTP Layer
    # -------------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type(
            (StripeRateLimitError, aiohttp.ClientError)
        ),
        wait=wait_exponential(min=2, max=60),
        stop=stop_after_attempt(5),
    )
    async def _fetch_page(self, session: aiohttp.ClientSession, url: str):
        async with session.get(url) as resp:
            if resp.status == 429:
                raise StripeRateLimitError()
            resp.raise_for_status()
            return await resp.json()

    # -------------------------------------------------------------------------
    # Checkpoint Helpers
    # -------------------------------------------------------------------------

    def _build_query(self, limit: int, start_ts: Optional[int]):
        query = f"?limit={limit}"
        if start_ts:
            query += f"&created[gte]={start_ts}"
        return query

    # -------------------------------------------------------------------------
    # Core Sync (Incremental + Streaming)
    # -------------------------------------------------------------------------

    async def sync_stream(
        self,
        stream_name: str,
        start_timestamp: Optional[str] = None,
        checkpoint: Optional[str] = None,
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:

        assert stream_name in self.SUPPORTED_STREAMS

        limit = 100
        has_more = True
        starting_after = checkpoint

        start_ts = None
        if start_timestamp:
            try:
                dt = datetime.fromisoformat(start_timestamp.replace("Z", "+00:00"))
                start_ts = int(dt.timestamp())
            except Exception:
                pass

        session = await self._get_session()
        base_query = self._build_query(limit, start_ts)

        total = 0

        while has_more:
            url = f"{self.api_base}/{stream_name}{base_query}"

            if starting_after:
                url += f"&starting_after={starting_after}"

            data = await self._fetch_page(session, url)

            items = data.get("data", [])
            if not items:
                break

            total += len(items)

            yield items

            has_more = data.get("has_more", False)
            if has_more:
                starting_after = items[-1]["id"]

        logger.info(f"[{self.tenant_id}] Synced {stream_name}: {total} records")

    # -------------------------------------------------------------------------
    # Parallel Sync (Multi-stream)
    # -------------------------------------------------------------------------

    async def sync_all_streams(
        self,
        start_timestamp: Optional[str] = None,
    ):
        tasks = [
            self.sync_stream(stream, start_timestamp)
            for stream in self.SUPPORTED_STREAMS
        ]
        return await asyncio.gather(*tasks)