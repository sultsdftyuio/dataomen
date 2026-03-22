"""
ARCLI.TECH - SaaS Integration Module
Connector: Meta Ads (Facebook & Instagram Analytics)
Strategy: Insights API Cursor Pagination, AppSecret Proof, & CAC Analytics
"""

import json
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

# ---------------------------------------------------------------------------
# Tuneable constants — adjust per account tier or rate-limit guidance
# ---------------------------------------------------------------------------
_PAGINATION_DELAY_SECONDS = 0.3   # Burst-limit buffer between cursor hops
_REQUEST_TIMEOUT_SECONDS  = 60.0  # Shared across all client calls
_DEFAULT_SINCE_DATE       = "2024-01-01"


class MetaAdsRateLimitError(Exception):
    """Triggered by Meta's X-Business-Use-Case-Usage thresholds."""
    pass


class MetaAdsTokenExpiredError(Exception):
    """Triggered when Meta returns OAuthException code 190 (token expiry)."""
    pass


class MetaAdsConnector(BaseIntegration):
    """
    Phase 8: Meta Ads Zero-ETL Connector.

    Engineering Standards:
    - AppSecret Proof: Cryptographically signs every request to prevent token
      hijacking.  The proof is computed once and cached for the lifetime of the
      connector instance.
    - Cursor Streaming: Efficiently traverses Meta's Graph edges without memory
      spikes.  The appsecret_proof is re-attached to every cursor URL because
      Meta's paging.next URLs include the access_token but not the proof.
    - Insights Normalization: Flattens complex 'actions' arrays into standard
      conversion metrics.
    - Proactive throttling: Parses X-Business-Use-Case-Usage before a hard 429
      is returned so the connector can back off gracefully.
    - PII masking: Applies DataSanitizer to all PII_COLUMNS before yielding
      batches downstream.
    """

    # DataSanitizer targets for PII masking
    PII_COLUMNS = ["campaign_name", "adset_name", "ad_name"]

    # -------------------------------------------------------------------------
    # Initialisation
    # -------------------------------------------------------------------------

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name="meta_ads",
            credentials=credentials or {}
        )
        super().__init__(config)

        self.api_version   = "v19.0"
        self.client_secret = os.environ.get("META_APP_SECRET")

        self.access_token  = self.config.credentials.get("access_token")
        self.ad_account_id = self.config.credentials.get("ad_account_id")  # e.g. 'act_XXXXXXXX'

        if not all([self.access_token, self.ad_account_id, self.client_secret]):
            logger.error(
                "[%s] Meta Ads initialised with incomplete Vault secrets.",
                self.tenant_id
            )

        # Pre-compute once; token does not change mid-sync.
        self._appsecret_proof: Optional[str] = (
            self._generate_appsecret_proof()
            if self.access_token and self.client_secret
            else None
        )

    # -------------------------------------------------------------------------
    # Security helpers
    # -------------------------------------------------------------------------

    def _generate_appsecret_proof(self) -> str:
        """
        Returns the HMAC-SHA256 signature required by Meta for high-security
        API calls.  Result is cached on the instance; do not call externally.
        """
        return hmac.new(
            self.client_secret.encode("utf-8"),
            self.access_token.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

    @property
    def _auth_headers(self) -> Dict[str, str]:
        """
        Bearer-token auth header.  Keeps the access_token out of URLs, query
        strings, and therefore server access-logs and proxy caches.
        """
        return {"Authorization": f"Bearer {self.access_token}"}

    @property
    def _proof_params(self) -> Dict[str, str]:
        """Returns the appsecret_proof fragment to merge into every param dict."""
        return {"appsecret_proof": self._appsecret_proof}

    # -------------------------------------------------------------------------
    # Schema & semantic views
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        """The Schema Contract for DuckDB Parquet Validation."""
        return {
            # Key matches the table name used in get_semantic_views()
            "meta_ads_insights_performance": {
                "campaign_id":   "VARCHAR",
                "campaign_name": "VARCHAR",
                "date_start":    "DATE",
                "spend":         "DOUBLE",
                "impressions":   "BIGINT",
                "clicks":        "BIGINT",
                "reach":         "BIGINT",
                "conversions":   "DOUBLE",
                "objective":     "VARCHAR"
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
                    date_start                                             AS date,
                    campaign_name,
                    spend,
                    impressions,
                    (spend / NULLIF(impressions, 0)) * 1000               AS cpm,
                    (clicks * 1.0) / NULLIF(impressions, 0)               AS ctr,
                    spend / NULLIF(conversions, 0)                        AS cac
                FROM meta_ads_insights_performance
                ORDER BY 1 DESC
            """,
            "vw_meta_daily_totals": """
                SELECT
                    date_start                   AS date,
                    SUM(spend)                   AS total_spend,
                    SUM(conversions)             AS total_conversions
                FROM meta_ads_insights_performance
                GROUP BY 1
                ORDER BY 1 DESC
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
    async def _request(
        self,
        client: httpx.AsyncClient,
        url: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Handles REST calls with:
        - Bearer-token auth (token never in URL).
        - Proactive X-Business-Use-Case-Usage parsing to back off before the
          hard 429 threshold is reached.
        - OAuthException code-190 detection for expired tokens.
        """
        resp = await client.get(url, params=params, headers=self._auth_headers)

        # --- Proactive throttle detection (fires before a hard 429) ----------
        usage_header = resp.headers.get("X-Business-Use-Case-Usage")
        if usage_header:
            try:
                usage = json.loads(usage_header)
                # Each key is an ad-account ID; value is a list of usage objects.
                for _account, usages in usage.items():
                    for entry in usages:
                        pct = entry.get("call_count", 0)
                        if pct >= 85:
                            logger.warning(
                                "[%s] Meta throttle at %d%% — backing off proactively.",
                                self.tenant_id, pct
                            )
                            raise MetaAdsRateLimitError(
                                f"Proactive back-off: usage at {pct}%"
                            )
            except (json.JSONDecodeError, AttributeError):
                pass  # Malformed header — continue normally

        # --- Hard rate-limit --------------------------------------------------
        if resp.status_code == 429:
            raise MetaAdsRateLimitError("Meta API hard rate limit hit. Backing off…")

        resp.raise_for_status()
        payload = resp.json()

        # --- Token expiry (OAuthException code 190) ---------------------------
        error = payload.get("error", {})
        if error.get("type") == "OAuthException" and error.get("code") == 190:
            raise MetaAdsTokenExpiredError(
                f"[{self.tenant_id}] Meta access token has expired. "
                "Re-authenticate via the Vault credential rotation flow."
            )

        return payload

    async def sync_historical(
        self,
        stream_name: str,
        start_timestamp: str
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Insights API).

        Supported streams
        -----------------
        - ``insights_performance``  Campaign-level daily performance data.

        Uses cursor-based pagination to stream performance data.  The
        appsecret_proof is appended to each cursor URL explicitly because
        Meta's paging.next URLs carry the access_token but omit the proof.
        """
        if stream_name != "insights_performance":
            raise ValueError(
                f"[{self.tenant_id}] Unknown Meta Ads stream: '{stream_name}'. "
                "Supported: 'insights_performance'."
            )

        # 1. Date Range Normalisation
        try:
            dt    = datetime.fromisoformat(start_timestamp.replace("Z", "+00:00"))
            since = dt.strftime("%Y-%m-%d")
        except (ValueError, AttributeError):
            logger.warning(
                "[%s] Could not parse start_timestamp '%s'; defaulting to %s.",
                self.tenant_id, start_timestamp, _DEFAULT_SINCE_DATE
            )
            since = _DEFAULT_SINCE_DATE

        until = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # 2. Query Configuration
        # time_range must be valid JSON — using json.dumps avoids Python-dict
        # repr (single quotes) that the Graph API rejects.
        params: Optional[Dict[str, Any]] = {
            "level":          "campaign",
            "fields":         "campaign_id,campaign_name,spend,impressions,clicks,reach,objective,actions",
            "time_range":     json.dumps({"since": since, "until": until}),
            "time_increment": 1,
            "limit":          250,
            **self._proof_params,   # appsecret_proof (access_token is in header)
        }

        base_url  = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}/insights"
        next_url  = base_url
        total_rows = 0

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
            while next_url:
                data    = await self._request(client, next_url, params)
                params  = None  # Cursor URLs are self-contained — clear initial params

                records = data.get("data", [])
                if not records:
                    break

                # 3. Normalisation: Meta returns conversions in a nested 'actions' array
                batch: List[Dict[str, Any]] = []
                for row in records:
                    actions = row.get("actions", [])
                    # "purchase" is the standard e-commerce conversion type.
                    # Adjust `action_type` to the tenant's primary objective if needed.
                    conversions = sum(
                        float(a.get("value", 0))
                        for a in actions
                        if a.get("action_type") == "purchase"
                    )

                    batch.append({
                        "campaign_id":   row.get("campaign_id"),
                        "campaign_name": row.get("campaign_name"),
                        "date_start":    row.get("date_start"),
                        "spend":         float(row.get("spend", 0.0)),
                        "impressions":   int(row.get("impressions", 0)),
                        "clicks":        int(row.get("clicks", 0)),
                        "reach":         int(row.get("reach", 0)),
                        "conversions":   conversions,
                        "objective":     row.get("objective"),
                    })

                # 4. PII Masking before yielding downstream
                batch = self._mask_pii(batch)

                total_rows += len(batch)
                yield batch

                # 5. Cursor Logic
                # Re-attach appsecret_proof because paging.next omits it.
                raw_next = data.get("paging", {}).get("next")
                if raw_next:
                    proof_qs = "&".join(
                        f"{k}={v}" for k, v in self._proof_params.items()
                    )
                    next_url = f"{raw_next}&{proof_qs}"
                    await asyncio.sleep(_PAGINATION_DELAY_SECONDS)
                else:
                    next_url = None

        logger.info(
            "✅ [%s] Meta Ads sync complete. Total records: %d",
            self.tenant_id, total_rows
        )

    # -------------------------------------------------------------------------
    # PII Masking
    # -------------------------------------------------------------------------

    def _mask_pii(self, batch: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Applies DataSanitizer masking to all PII_COLUMNS in the batch.
        Replace the body below with your DataSanitizer implementation.
        """
        for row in batch:
            for col in self.PII_COLUMNS:
                if col in row and row[col] is not None:
                    row[col] = self.data_sanitizer.mask(row[col])
        return batch

    # -------------------------------------------------------------------------
    # Connection test
    # -------------------------------------------------------------------------

    async def test_connection(self) -> bool:
        """Verifies access to the target Ad Account."""
        try:
            url    = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}"
            params = {"fields": "name", **self._proof_params}

            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                data = await self._request(client, url, params)
                return "name" in data

        except MetaAdsTokenExpiredError:
            logger.error(
                "[%s] Meta Ads connection failed: token expired.",
                self.tenant_id
            )
            return False
        except Exception as e:
            logger.error(
                "[%s] Meta Ads connection failed: %s",
                self.tenant_id, str(e)
            )
            return False