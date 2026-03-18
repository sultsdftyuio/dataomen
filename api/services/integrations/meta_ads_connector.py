"""
ARCLI.TECH - SaaS Integration Module
Connector: Meta Ads (Facebook & Instagram Analytics)
Strategy: Insights API Cursor Pagination, AppSecret Proof, & CAC Analytics
"""

import os
import hmac
import hashlib
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, AsyncGenerator, Optional

import httpx
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class MetaAdsRateLimitError(Exception):
    """Triggered by Meta's X-Business-Use-Case-Usage thresholds."""
    pass

class MetaAdsConnector(BaseIntegration):
    """
    Phase 8: Meta Ads Zero-ETL Connector.
    
    Engineering Standards:
    - AppSecret Proof: Cryptographically signs every request to prevent token hijacking.
    - Cursor Streaming: Efficiently traverses Meta's Graph edges without memory spikes.
    - Insights Normalization: Flattens complex 'actions' arrays into standard conversion metrics.
    """

    # DataSanitizer targets for PII masking
    PII_COLUMNS = ["campaign_name", "adset_name", "ad_name"]

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="meta_ads", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        self.api_version = "v19.0"
        self.client_secret = os.environ.get("META_APP_SECRET")
        
        self.access_token = self.config.credentials.get("access_token")
        self.ad_account_id = self.config.credentials.get("ad_account_id") # Format: 'act_XXXXXXXX'

        if not all([self.access_token, self.ad_account_id, self.client_secret]):
            logger.error(f"[{self.tenant_id}] Meta Ads initialized with incomplete Vault secrets.")

    def _generate_appsecret_proof(self) -> str:
        """
        Generates the HMAC-SHA256 signature required by Meta for high-security API calls.
        """
        return hmac.new(
            self.client_secret.encode('utf-8'),
            self.access_token.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

    async def fetch_schema(self) -> Dict[str, Any]:
        """The Schema Contract for DuckDB Parquet Validation."""
        return {
            "insights_performance": {
                "campaign_id": "VARCHAR",
                "campaign_name": "VARCHAR",
                "date_start": "DATE",
                "spend": "DOUBLE",
                "impressions": "BIGINT",
                "clicks": "BIGINT",
                "reach": "BIGINT",
                "conversions": "DOUBLE",
                "objective": "VARCHAR"
            }
        }

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Contextual RAG: Pre-computed SQL for ROAS and CAC analysis.
        Provides the LLM with the exact logic to calculate cross-platform CPM.
        """
        return {
            "vw_meta_ads_performance": """
                SELECT 
                    date_start AS date,
                    campaign_name,
                    spend,
                    impressions,
                    (spend / NULLIF(impressions, 0)) * 1000 AS cpm,
                    (clicks * 1.0) / NULLIF(impressions, 0) AS ctr,
                    spend / NULLIF(conversions, 0) AS cac
                FROM meta_ads_insights_performance
                ORDER BY 1 DESC
            """,
            "vw_meta_daily_totals": """
                SELECT 
                    date_start AS date,
                    sum(spend) AS total_spend,
                    sum(conversions) AS total_conversions
                FROM meta_ads_insights_performance
                GROUP BY 1 ORDER BY 1 DESC
            """
        }

    # -------------------------------------------------------------------------
    # Core Data Ingestion (Execution Layer)
    # -------------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type((MetaAdsRateLimitError, httpx.NetworkError)),
        wait=wait_exponential(multiplier=2, min=5, max=60),
        stop=stop_after_attempt(5)
    )
    async def _request(self, client: httpx.AsyncClient, url: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Handles REST calls with native Meta rate-limit inspection."""
        resp = await client.get(url, params=params)
        
        # Meta returns 'X-Business-Use-Case-Usage' in headers; 429 indicates threshold hit
        if resp.status_code == 429:
            raise MetaAdsRateLimitError("Meta API Rate Limit hit. Backing off...")
            
        resp.raise_for_status()
        return resp.json()

    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Insights API).
        Uses cursor-based pagination to stream performance data.
        """
        # 1. Date Range Normalization
        try:
            dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
            since = dt.strftime("%Y-%m-%d")
            until = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        except:
            since = "2024-01-01"
            until = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # 2. Query Configuration
        params = {
            "level": "campaign",
            "fields": "campaign_id,campaign_name,spend,impressions,clicks,reach,objective,actions",
            "time_range": f"{{'since':'{since}','until':'{until}'}}",
            "time_increment": 1, 
            "access_token": self.access_token,
            "appsecret_proof": self._generate_appsecret_proof(),
            "limit": 250 
        }

        url = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}/insights"
        total_rows = 0

        async with httpx.AsyncClient(timeout=60.0) as client:
            while url:
                data = await self._request(client, url, params if total_rows == 0 else None)
                params = None # Cursors are absolute URLs containing tokens/params
                
                records = data.get("data", [])
                if not records:
                    break

                # 3. Normalization: Meta returns conversions in a nested 'actions' array
                batch = []
                for row in records:
                    actions = row.get("actions", [])
                    # Common conversion type for E-commerce; adjust based on tenant's primary goal
                    conversions = sum([float(a.get("value", 0)) for a in actions if a.get("action_type") == "purchase"])
                    
                    batch.append({
                        "campaign_id": row.get("campaign_id"),
                        "campaign_name": row.get("campaign_name"),
                        "date_start": row.get("date_start"),
                        "spend": float(row.get("spend", 0.0)),
                        "impressions": int(row.get("impressions", 0)),
                        "clicks": int(row.get("clicks", 0)),
                        "reach": int(row.get("reach", 0)),
                        "conversions": conversions,
                        "objective": row.get("objective")
                    })

                total_rows += len(batch)
                yield batch

                # 4. Cursor Logic
                url = data.get("paging", {}).get("next")
                if url:
                    await asyncio.sleep(0.3) # Avoid burst limit violations

        logger.info(f"✅ [{self.tenant_id}] Meta Ads sync complete. Total records: {total_rows}")

    async def test_connection(self) -> bool:
        """Verifies access to the target Ad Account."""
        try:
            url = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}"
            params = {
                "fields": "name",
                "access_token": self.access_token,
                "appsecret_proof": self._generate_appsecret_proof()
            }
            async with httpx.AsyncClient() as client:
                data = await self._request(client, url, params)
                return "name" in data
        except Exception as e:
            logger.error(f"[{self.tenant_id}] Meta Ads connection failed: {str(e)}")
            return False