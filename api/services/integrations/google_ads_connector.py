"""
ARCLI.TECH - SaaS Integration Module
Connector: Google Ads (Performance Marketing Analytics)
Strategy: GAQL Compute Pushdown, Native Protobuf Streaming, & MMM Semantic Views
"""

import os
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, AsyncGenerator, Optional

import anyio
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# --- Defensive Import Strategy ---
try:
    from google.ads.googleads.client import GoogleAdsClient
    from google.ads.googleads.errors import GoogleAdsException
    GOOGLE_ADS_AVAILABLE = True
except ImportError:
    GOOGLE_ADS_AVAILABLE = False
    GoogleAdsException = Exception

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

class GoogleAdsConnector(BaseIntegration):
    """
    Phase 7: Google Ads Zero-ETL Connector.
    
    Engineering Standards:
    - Native Protobuf: Disables proto-plus for 5x faster report deserialization.
    - GAQL Pushdown: Pushes time-series filtering directly to Google's gRPC backend.
    - MMM Optimization: Standardizes cost_micros to standard currency floats.
    """

    # Marketing data isolation for DataSanitizer
    PII_COLUMNS = ["campaign_name", "ad_group_name", "ad_name", "keyword_text"]

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name="google_ads", 
            credentials=credentials or {}
        )
        super().__init__(config)
        
        if not GOOGLE_ADS_AVAILABLE:
            logger.critical(f"[{self.tenant_id}] Missing 'google-ads' library.")
            raise ImportError("Please run: pip install google-ads")

        # Required Credentials for Google Ads API
        self.developer_token = self.config.credentials.get("developer_token")
        self.refresh_token = self.config.credentials.get("refresh_token")
        self.target_customer_id = self.config.credentials.get("customer_id")
        self.login_customer_id = self.config.credentials.get("login_customer_id")

        if not all([self.developer_token, self.refresh_token, self.target_customer_id]):
            logger.error(f"[{self.tenant_id}] Google Ads initialized with incomplete vault credentials.")

    def _get_client(self) -> GoogleAdsClient:
        """Initializes the synchronous Google Ads Client with high-performance settings."""
        google_ads_config = {
            "developer_token": self.developer_token,
            "client_id": os.environ.get("GOOGLE_ADS_CLIENT_ID"),
            "client_secret": os.environ.get("GOOGLE_ADS_CLIENT_SECRET"),
            "refresh_token": self.refresh_token,
            # PERFORMANCE CRITICAL: Use standard Protobuf messages instead of Proto-plus
            "use_proto_plus": False 
        }
        if self.login_customer_id:
            google_ads_config["login_customer_id"] = self.login_customer_id
            
        return GoogleAdsClient.load_from_dict(google_ads_config)

    # -------------------------------------------------------------------------
    # Schema & Contextual RAG Definitions
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        The Schema Contract. 
        Provides strict typing for MMM-ready performance reports.
        """
        return {
            "campaign_performance": {
                "campaign_id": "BIGINT",
                "campaign_name": "VARCHAR",
                "segments_date": "DATE",
                "metrics_impressions": "BIGINT",
                "metrics_clicks": "BIGINT",
                "metrics_cost": "DOUBLE",       # Normalized from micros
                "metrics_conversions": "DOUBLE",
                "campaign_status": "VARCHAR"
            },
            "keyword_performance": {
                "keyword_id": "BIGINT",
                "keyword_text": "VARCHAR",
                "segments_date": "DATE",
                "metrics_impressions": "BIGINT",
                "metrics_clicks": "BIGINT",
                "metrics_cost": "DOUBLE"
            }
        }

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Contextual RAG Views: Pre-computed SQL for Marketing Mix Modeling.
        Standardizes 'Cost' logic so LLMs don't hallucinate the 1,000,000 divisor.
        """
        return {
            "vw_google_ads_efficiency": """
                SELECT 
                    segments_date AS date,
                    campaign_name,
                    metrics_cost AS spend,
                    metrics_conversions AS conversions,
                    metrics_cost / NULLIF(metrics_conversions, 0) AS cost_per_acquisition,
                    (metrics_clicks * 1.0) / NULLIF(metrics_impressions, 0) AS ctr
                FROM google_ads_campaign_performance
                ORDER BY 1 DESC
            """,
            "vw_google_ads_daily_totals": """
                SELECT 
                    segments_date AS date,
                    sum(metrics_cost) AS total_spend,
                    sum(metrics_conversions) AS total_conversions
                FROM google_ads_campaign_performance
                GROUP BY 1 ORDER BY 1 DESC
            """
        }

    # -------------------------------------------------------------------------
    # Core Data Ingestion (Execution Layer)
    # -------------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type((GoogleAdsException, ConnectionError)),
        wait=wait_exponential(multiplier=2, min=5, max=60),
        stop=stop_after_attempt(5)
    )
    async def sync_historical(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (GAQL SearchStream).
        Streams data via gRPC, offloading iteration to a thread pool to protect the event loop.
        """
        # 1. Date Normalization for GAQL
        try:
            dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
            gaql_date = dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            gaql_date = "2024-01-01"

        # 2. Dynamic GAQL Generation
        if stream_name == "campaign_performance":
            resource = "campaign"
            fields = "campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, campaign.status"
        elif stream_name == "keyword_performance":
            resource = "ad_group_criterion"
            fields = "ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros"
        else:
            raise ValueError(f"Stream '{stream_name}' is not supported by the Google Ads Connector.")

        query = f"SELECT {fields} FROM {resource} WHERE segments.date >= '{gaql_date}' AND campaign.status != 'REMOVED'"

        def _execute_stream(client):
            ga_service = client.get_service("GoogleAdsService")
            return ga_service.search_stream(customer_id=self.target_customer_id, query=query)

        logger.info(f"[{self.tenant_id}] Initiating GAQL stream for {stream_name} since {gaql_date}")

        client = self._get_client()
        stream_iterator = await anyio.to_thread.run_sync(_execute_stream, client)

        chunk_size = 5000
        batch = []
        
        # 3. Stream Processing
        async for response in self._async_grpc_wrapper(stream_iterator):
            for row in response.results:
                # Row extraction logic depends on the specific resource
                if stream_name == "campaign_performance":
                    record = {
                        "campaign_id": row.campaign.id,
                        "campaign_name": row.campaign.name,
                        "segments_date": row.segments.date,
                        "metrics_impressions": row.metrics.impressions,
                        "metrics_clicks": row.metrics.clicks,
                        "metrics_cost": row.metrics.cost_micros / 1000000.0, # MICROS to Currency
                        "metrics_conversions": row.metrics.conversions,
                        "campaign_status": row.campaign.status.name
                    }
                else: # keyword_performance
                    record = {
                        "keyword_id": row.ad_group_criterion.criterion_id,
                        "keyword_text": row.ad_group_criterion.keyword.text,
                        "segments_date": row.segments.date,
                        "metrics_impressions": row.metrics.impressions,
                        "metrics_clicks": row.metrics.clicks,
                        "metrics_cost": row.metrics.cost_micros / 1000000.0
                    }
                
                batch.append(record)
                if len(batch) >= chunk_size:
                    yield batch
                    batch = []
                    await asyncio.sleep(0) # Context switch for event loop health

        if batch:
            yield batch

    async def _async_grpc_wrapper(self, sync_iterator):
        """Standard anyio wrapper to prevent gRPC next() from blocking the event loop."""
        while True:
            try:
                page = await anyio.to_thread.run_sync(next, sync_iterator, None)
                if page is None:
                    break
                yield page
            except StopIteration:
                break

    async def test_connection(self) -> bool:
        """Lightweight check to verify Developer Token and OAuth validity."""
        try:
            client = self._get_client()
            ga_service = client.get_service("GoogleAdsService")
            query = "SELECT campaign.id FROM campaign LIMIT 1"
            # We use search() instead of search_stream() for simple health checks
            await anyio.to_thread.run_sync(ga_service.search, customer_id=self.target_customer_id, query=query)
            return True
        except Exception as e:
            logger.error(f"[{self.tenant_id}] Google Ads connection failed: {str(e)}")
            return False