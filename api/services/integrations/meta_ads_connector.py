"""
ARCLI.TECH - SaaS Integration Module
Connector: Meta Ads (Facebook & Instagram Analytics)
Strategy: Insights API · Cursor Pagination · AppSecret Proof · CAC Analytics

Upgrade changelog (v2)
──────────────────────
1. Date chunking       — weekly windows prevent OOM on large accounts
2. Checkpointing       — resumes from last_synced_date on failure
3. Money precision     — spend stored as integer cents; raw string preserved
4. Dynamic conversions — conversion_events list driven by tenant credentials
5. Breakdown support   — country / device / placement segmentation
6. Sampling mode       — fast preview path with configurable row cap
7. Retry taxonomy      — transient Graph API error codes retried explicitly
8. Concurrency         — asyncio.gather across multiple ad accounts / streams
"""

import json
import os
import hmac
import hashlib
import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level tuneable constants
# ---------------------------------------------------------------------------
_CHUNK_SIZE_DAYS     = 7          # Weekly windows for date chunking
_PAGINATION_DELAY_S  = 0.3        # Burst-limit buffer between cursor hops
_REQUEST_TIMEOUT_S   = 60.0       # Shared across all client calls
_DEFAULT_SINCE_DATE  = "2024-01-01"
_SAMPLE_ROW_CAP      = 1_000      # Max rows returned in sampling mode
_DEFAULT_PAGE_LIMIT  = 250        # Records per API page (full sync)

# Graph API error codes that are safe to retry (transient server faults)
_RETRYABLE_GRAPH_CODES = {1, 2, 4, 17, 341}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class MetaAdsRateLimitError(Exception):
    """Triggered by hard 429s or proactive X-Business-Use-Case-Usage threshold."""


class MetaAdsTokenExpiredError(Exception):
    """Triggered when Meta returns OAuthException code 190 (token expiry)."""


class MetaAdsTransientError(Exception):
    """Triggered by retryable Graph API error codes (1, 2, 4, 17, 341)."""


# ---------------------------------------------------------------------------
# Date-window helper
# ---------------------------------------------------------------------------

def _weekly_windows(since: str, until: str) -> List[Tuple[str, str]]:
    """
    Splits [since, until] into non-overlapping 7-day chunks.

    Example
    -------
    _weekly_windows("2024-01-01", "2024-01-20")
    → [("2024-01-01", "2024-01-07"),
       ("2024-01-08", "2024-01-14"),
       ("2024-01-15", "2024-01-20")]
    """
    fmt     = "%Y-%m-%d"
    start   = datetime.strptime(since, fmt)
    end     = datetime.strptime(until, fmt)
    windows: List[Tuple[str, str]] = []

    cursor = start
    while cursor <= end:
        window_end = min(cursor + timedelta(days=_CHUNK_SIZE_DAYS - 1), end)
        windows.append((cursor.strftime(fmt), window_end.strftime(fmt)))
        cursor = window_end + timedelta(days=1)

    return windows


# ---------------------------------------------------------------------------
# Connector
# ---------------------------------------------------------------------------

class MetaAdsConnector(BaseIntegration):
    """
    Phase 8 (v2): Meta Ads Zero-ETL Connector.

    Key design principles
    ─────────────────────
    Security    — AppSecret Proof on every request; Bearer auth (token never
                  in URL); proof re-attached to every cursor hop.
    Resilience  — Weekly date chunking + checkpointing; typed retry taxonomy.
    Precision   — Spend stored as integer cents + raw string to avoid float
                  drift on large budgets.
    Flexibility — Conversion events, breakdowns, and sampling mode are all
                  tenant-configurable via credentials / call-site flags.
    Scale       — asyncio.gather for multi-account / multi-stream concurrency.
    Privacy     — DataSanitizer applied to PII_COLUMNS before any yield.
    """

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

        creds = self.config.credentials
        self.access_token  = creds.get("access_token")
        self.ad_account_id = creds.get("ad_account_id")   # e.g. "act_XXXXXXXX"

        # ── Configurable conversion events ────────────────────────────────────
        # Tenants specify which Meta action_types count as a conversion.
        # Default covers standard e-commerce; override in credentials for
        # lead-gen ("lead"), SaaS ("CompleteRegistration"), or custom events.
        self.conversion_events: List[str] = creds.get(
            "conversion_events", ["purchase"]
        )

        # ── Breakdown support ─────────────────────────────────────────────────
        # Optional list; e.g. ["country", "device_platform", "publisher_platform"]
        # Unlocks geo dashboards, device analytics, and placement segmentation.
        self.breakdowns: List[str] = creds.get("breakdowns", [])

        if not all([self.access_token, self.ad_account_id, self.client_secret]):
            logger.error(
                "[%s] Meta Ads initialised with incomplete Vault secrets.",
                self.tenant_id
            )

        # Pre-compute proof once — token is stable for the connector's lifetime
        self._appsecret_proof: Optional[str] = (
            self._generate_appsecret_proof()
            if self.access_token and self.client_secret
            else None
        )

    # -------------------------------------------------------------------------
    # Security helpers
    # -------------------------------------------------------------------------

    def _generate_appsecret_proof(self) -> str:
        """HMAC-SHA256 proof for Meta's high-security API tier."""
        return hmac.new(
            self.client_secret.encode("utf-8"),
            self.access_token.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

    @property
    def _auth_headers(self) -> Dict[str, str]:
        """Bearer-token header keeps the access_token out of URLs and logs."""
        return {"Authorization": f"Bearer {self.access_token}"}

    @property
    def _proof_params(self) -> Dict[str, str]:
        """appsecret_proof fragment merged into every outgoing param dict."""
        return {"appsecret_proof": self._appsecret_proof}

    # -------------------------------------------------------------------------
    # Schema & semantic views
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        """Schema contract for DuckDB Parquet validation."""
        base: Dict[str, str] = {
            "campaign_id":   "VARCHAR",
            "campaign_name": "VARCHAR",
            "date_start":    "DATE",
            # Spend as integer cents avoids float drift on large budgets.
            # Use: spend_cents / 100.0 for dollar presentation in SQL.
            "spend_cents":   "BIGINT",
            "spend_raw":     "VARCHAR",   # Original API string for audit / reconciliation
            "impressions":   "BIGINT",
            "clicks":        "BIGINT",
            "reach":         "BIGINT",
            "conversions":   "DOUBLE",
            "objective":     "VARCHAR",
        }
        # Append breakdown dimension columns dynamically so the schema
        # stays in sync with whatever breakdowns the tenant has enabled.
        for bd in self.breakdowns:
            base[bd] = "VARCHAR"

        return {"meta_ads_insights_performance": base}

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Pre-computed SQL for ROAS and CAC analysis.
        Spend is stored in cents → divide by 100 for dollar presentation.
        """
        return {
            "vw_meta_ads_performance": """
                SELECT
                    date_start                                                   AS date,
                    campaign_name,
                    spend_cents / 100.0                                          AS spend,
                    impressions,
                    ((spend_cents / 100.0) / NULLIF(impressions, 0)) * 1000     AS cpm,
                    (clicks * 1.0) / NULLIF(impressions, 0)                     AS ctr,
                    (spend_cents / 100.0) / NULLIF(conversions, 0)              AS cac
                FROM meta_ads_insights_performance
                ORDER BY 1 DESC
            """,
            "vw_meta_daily_totals": """
                SELECT
                    date_start                       AS date,
                    SUM(spend_cents) / 100.0         AS total_spend,
                    SUM(conversions)                 AS total_conversions
                FROM meta_ads_insights_performance
                GROUP BY 1
                ORDER BY 1 DESC
            """
        }

    # -------------------------------------------------------------------------
    # HTTP layer
    # -------------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type(
            (MetaAdsRateLimitError, MetaAdsTransientError, httpx.NetworkError)
        ),
        wait=wait_exponential(multiplier=2, min=5, max=60),
        stop=stop_after_attempt(5)
    )
    async def _request(
        self,
        client: httpx.AsyncClient,
        url: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Single authenticated GET with:
        - Proactive throttle detection via X-Business-Use-Case-Usage header
        - Hard 429 handling
        - Typed Graph API error taxonomy (retryable vs fatal)
        - OAuthException code-190 detection for token expiry
        """
        resp = await client.get(url, params=params, headers=self._auth_headers)

        # ── Proactive throttle (fires before the hard 429) ────────────────────
        usage_header = resp.headers.get("X-Business-Use-Case-Usage")
        if usage_header:
            try:
                for _account, usages in json.loads(usage_header).items():
                    for entry in usages:
                        pct = entry.get("call_count", 0)
                        if pct >= 85:
                            logger.warning(
                                "[%s] Meta throttle at %d%% — proactive back-off.",
                                self.tenant_id, pct,
                            )
                            raise MetaAdsRateLimitError(
                                f"Proactive back-off: usage at {pct}%"
                            )
            except (json.JSONDecodeError, AttributeError):
                pass  # Malformed header — continue normally

        # ── Hard rate-limit ───────────────────────────────────────────────────
        if resp.status_code == 429:
            raise MetaAdsRateLimitError("Meta API hard rate limit hit. Backing off…")

        resp.raise_for_status()
        payload = resp.json()

        # ── Graph API error taxonomy ──────────────────────────────────────────
        error = payload.get("error", {})
        if error:
            code      = error.get("code")
            error_msg = error.get("message", "Unknown error")

            if error.get("type") == "OAuthException" and code == 190:
                raise MetaAdsTokenExpiredError(
                    f"[{self.tenant_id}] Access token expired — "
                    "trigger Vault credential rotation."
                )

            if code in _RETRYABLE_GRAPH_CODES:
                raise MetaAdsTransientError(
                    f"Transient Graph API error {code}: {error_msg}"
                )

            # Non-retryable Graph errors — surface immediately
            raise httpx.HTTPStatusError(
                f"Graph API error {code}: {error_msg}",
                request=resp.request,
                response=resp,
            )

        return payload

    # -------------------------------------------------------------------------
    # Date-chunked paginator (internal)
    # -------------------------------------------------------------------------

    async def _paginate_window(
        self,
        client: httpx.AsyncClient,
        since: str,
        until: str,
        sample_mode: bool,
        rows_yielded: List[int],   # Single-element list; mutable int for cross-scope sharing
        sample_cap: int,
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Fetches all cursor pages for a single [since, until] window and
        yields normalised, PII-masked batches.

        The appsecret_proof is re-appended to every cursor URL because
        Meta's paging.next URLs carry the access_token but omit the proof.
        """
        params: Optional[Dict[str, Any]] = {
            "level":          "campaign",
            "fields":         (
                "campaign_id,campaign_name,spend,impressions,"
                "clicks,reach,objective,actions,date_start"
            ),
            "time_range":     json.dumps({"since": since, "until": until}),
            "time_increment": 1,
            "limit":          _SAMPLE_ROW_CAP if sample_mode else _DEFAULT_PAGE_LIMIT,
            **self._proof_params,
        }

        if self.breakdowns:
            params["breakdowns"] = ",".join(self.breakdowns)

        next_url: Optional[str] = (
            f"https://graph.facebook.com/{self.api_version}"
            f"/{self.ad_account_id}/insights"
        )

        while next_url:
            data   = await self._request(client, next_url, params)
            params = None   # Cursor URLs are self-contained; clear initial params

            records = data.get("data", [])
            if not records:
                break

            batch: List[Dict[str, Any]] = []
            for row in records:
                if sample_mode and rows_yielded[0] >= sample_cap:
                    break

                # ── Money precision ───────────────────────────────────────────
                spend_raw   = row.get("spend", "0")
                spend_cents = int(round(float(spend_raw) * 100))

                # ── Dynamic conversion aggregation ────────────────────────────
                actions     = row.get("actions", [])
                conversions = sum(
                    float(a.get("value", 0))
                    for a in actions
                    if a.get("action_type") in self.conversion_events
                )

                record: Dict[str, Any] = {
                    "campaign_id":   row.get("campaign_id"),
                    "campaign_name": row.get("campaign_name"),
                    "date_start":    row.get("date_start"),
                    "spend_cents":   spend_cents,
                    "spend_raw":     spend_raw,
                    "impressions":   int(row.get("impressions", 0)),
                    "clicks":        int(row.get("clicks", 0)),
                    "reach":         int(row.get("reach", 0)),
                    "conversions":   conversions,
                    "objective":     row.get("objective"),
                }

                # Attach breakdown dimension columns dynamically
                for bd in self.breakdowns:
                    record[bd] = row.get(bd)

                batch.append(record)

            if batch:
                batch            = self._mask_pii(batch)
                rows_yielded[0] += len(batch)
                yield batch

            if sample_mode and rows_yielded[0] >= sample_cap:
                logger.info(
                    "[%s] Sample cap (%d rows) reached — stopping early.",
                    self.tenant_id, sample_cap,
                )
                return

            # Re-attach proof to cursor URL (paging.next omits it)
            raw_next = data.get("paging", {}).get("next")
            if raw_next:
                proof_qs = "&".join(f"{k}={v}" for k, v in self._proof_params.items())
                next_url = f"{raw_next}&{proof_qs}"
                await asyncio.sleep(_PAGINATION_DELAY_S)
            else:
                next_url = None

    # -------------------------------------------------------------------------
    # Public sync entry-point  (chunked + checkpointed)
    # -------------------------------------------------------------------------

    async def sync_historical(
        self,
        stream_name: str,
        start_timestamp: str,
        *,
        sample_mode: bool = False,
        sample_cap: int   = _SAMPLE_ROW_CAP,
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Pull pipeline — Insights API with weekly date chunking & checkpointing.

        Parameters
        ----------
        stream_name
            Must be ``"insights_performance"``.
        start_timestamp
            ISO-8601 string.  Sync resumes from the stored checkpoint if one
            exists, falling back to this value only when no checkpoint is found.
        sample_mode
            When ``True``, stops after ``sample_cap`` rows — ideal for UI
            previews, embedding generation, and instant UX feedback loops.
        sample_cap
            Row limit for sample mode (default 1 000).

        Checkpointing
        -------------
        ``last_synced_date`` is read from the Vault / Redis checkpoint store
        before starting and written after each successfully completed weekly
        window.  A mid-sync failure therefore resumes from the last complete
        week rather than restarting from scratch.

        Date chunking
        -------------
        The full date range is split into ``_CHUNK_SIZE_DAYS``-day windows
        before any API call is made.  This prevents single requests from
        pulling millions of rows, keeps retries cheap, and matches the
        Google Ads connector's chunking pattern for architectural consistency.
        """
        if stream_name != "insights_performance":
            raise ValueError(
                f"[{self.tenant_id}] Unknown Meta Ads stream: '{stream_name}'. "
                "Supported: 'insights_performance'."
            )

        # ── Resolve effective start date (checkpoint beats argument) ──────────
        checkpoint = await self._load_checkpoint(stream_name)
        if checkpoint:
            since = checkpoint
            logger.info("[%s] Resuming from checkpoint: %s", self.tenant_id, since)
        else:
            try:
                dt    = datetime.fromisoformat(start_timestamp.replace("Z", "+00:00"))
                since = dt.strftime("%Y-%m-%d")
            except (ValueError, AttributeError):
                logger.warning(
                    "[%s] Cannot parse start_timestamp '%s'; defaulting to %s.",
                    self.tenant_id, start_timestamp, _DEFAULT_SINCE_DATE,
                )
                since = _DEFAULT_SINCE_DATE

        until   = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        windows = _weekly_windows(since, until)
        logger.info(
            "[%s] Meta Ads sync: %d weekly windows (%s → %s).",
            self.tenant_id, len(windows), since, until,
        )

        rows_yielded: List[int] = [0]   # Mutable counter shared with _paginate_window

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_S) as client:
            for window_since, window_until in windows:
                logger.debug(
                    "[%s] Fetching window %s → %s.",
                    self.tenant_id, window_since, window_until,
                )
                async for batch in self._paginate_window(
                    client, window_since, window_until,
                    sample_mode, rows_yielded, sample_cap,
                ):
                    yield batch

                # Checkpoint written after each successfully completed window
                await self._save_checkpoint(stream_name, window_until)

                if sample_mode and rows_yielded[0] >= sample_cap:
                    break

        logger.info(
            "✅ [%s] Meta Ads sync complete. Total records: %d",
            self.tenant_id, rows_yielded[0],
        )

    # -------------------------------------------------------------------------
    # Multi-account concurrency
    # -------------------------------------------------------------------------

    async def sync_multiple_accounts(
        self,
        account_ids: List[str],
        stream_name: str,
        start_timestamp: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Runs sync_historical concurrently across multiple ad account IDs using
        asyncio.gather.  Each account gets its own connector instance so
        credentials, checkpoints, and appsecret proofs remain fully isolated.

        Returns a dict keyed by account_id.  Errors per account are caught,
        logged, and stored as ``{"error": ...}`` so one bad account never
        blocks the others.
        """
        async def _collect(account_id: str) -> Tuple[str, Any]:
            connector = MetaAdsConnector(
                tenant_id=self.tenant_id,
                credentials={**self.config.credentials, "ad_account_id": account_id},
            )
            rows: List[Dict[str, Any]] = []
            try:
                async for batch in connector.sync_historical(
                    stream_name, start_timestamp, **kwargs
                ):
                    rows.extend(batch)
            except Exception as exc:
                logger.error(
                    "[%s] Account %s failed during concurrent sync: %s",
                    self.tenant_id, account_id, exc,
                )
                return account_id, {"error": str(exc)}
            return account_id, rows

        results = await asyncio.gather(*[_collect(aid) for aid in account_ids])
        return dict(results)

    # -------------------------------------------------------------------------
    # Checkpointing  (delegates to BaseIntegration store)
    # -------------------------------------------------------------------------

    async def _load_checkpoint(self, stream_name: str) -> Optional[str]:
        """
        Returns the last successfully synced date for this stream, or None.
        Reads from the Vault / Redis checkpoint store via BaseIntegration.
        """
        try:
            cp = await self.get_checkpoint(f"meta_ads_{stream_name}")
            return cp.get("last_synced_date") if cp else None
        except Exception as exc:
            logger.warning(
                "[%s] Could not load checkpoint: %s — starting from scratch.",
                self.tenant_id, exc,
            )
            return None

    async def _save_checkpoint(self, stream_name: str, last_date: str) -> None:
        """
        Persists the last successfully synced date for this stream.
        Writes to the Vault / Redis checkpoint store via BaseIntegration.
        """
        try:
            await self.set_checkpoint(
                f"meta_ads_{stream_name}",
                {"last_synced_date": last_date},
            )
        except Exception as exc:
            logger.error(
                "[%s] Failed to save checkpoint for date %s: %s",
                self.tenant_id, last_date, exc,
            )

    # -------------------------------------------------------------------------
    # PII masking
    # -------------------------------------------------------------------------

    def _mask_pii(self, batch: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Applies DataSanitizer to all PII_COLUMNS before yielding downstream."""
        for row in batch:
            for col in self.PII_COLUMNS:
                if col in row and row[col] is not None:
                    row[col] = self.data_sanitizer.mask(row[col])
        return batch

    # -------------------------------------------------------------------------
    # Connection test
    # -------------------------------------------------------------------------

    async def test_connection(self) -> bool:
        """Verifies authenticated access to the target Ad Account."""
        try:
            url    = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}"
            params = {"fields": "name", **self._proof_params}

            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_S) as client:
                data = await self._request(client, url, params)
                return "name" in data

        except MetaAdsTokenExpiredError:
            logger.error("[%s] Meta Ads: token expired.", self.tenant_id)
            return False
        except Exception as exc:
            logger.error("[%s] Meta Ads connection failed: %s", self.tenant_id, exc)
            return False