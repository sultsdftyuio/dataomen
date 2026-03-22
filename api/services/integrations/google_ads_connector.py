"""
ARCLI.TECH - SaaS Integration Module
Connector: Google Ads Analytics
Strategy: Zero-ETL GAQL Streaming · Dynamic OAuth2 Token Refresh · Chunking · DuckDB Mapping

File path: api/services/integrations/google_ads_connector.py

Upgrade changelog
─────────────────
v1 → v2
  1. Spend precision     — costMicros stored as BIGINT (spend_micros); spend_raw
                           VARCHAR preserved for audit; float division deferred
                           to query time to eliminate float drift on large budgets
  2. Checkpointing       — resumes from last_synced_date per window on failure
  3. Sampling mode       — fast preview path with configurable row cap
  4. Retry taxonomy      — GoogleAdsTransientError covers server-side transient
                           faults; 401 raises GoogleAdsTokenRefreshNeeded (retried)
                           so token rotation is clean and typed, not a NetworkError hack
  5. _paginate_window    — inner pagination extracted from sync_historical to
                           mirror the Meta connector's architecture boundary
  6. PII masker safety   — getattr guard replaces per-row hasattr check
  7. Module constants    — _DEFAULT_PAGE_LIMIT, _SAMPLE_ROW_CAP extracted
  8. Second semantic view— vw_google_ads_daily_totals added for cross-platform
                           aggregation and LLM CAC / ROAS context
  9. Full docstrings     — architecture rationale documented at every boundary

Architecture principles
───────────────────────
Security      — OAuth2 access tokens fetched at runtime; never stored at rest.
                401 responses clear the cached token and trigger a typed retry
                so the token rotation path is explicit and observable.
Resilience    — Weekly date chunking + per-window checkpointing; typed retry
                taxonomy covering token refresh, quota exhaustion, and transient
                server faults.
Precision     — spend_micros (BIGINT) is the canonical spend column; integer
                micros eliminate float drift.  spend_raw (VARCHAR) preserves the
                original API value for financial audit and reconciliation.
Memory        — Strict streaming (AsyncGenerator); peak memory is O(page_size),
                constant relative to total account data.
Privacy       — DataSanitizer applied to PII_COLUMNS before any yield; getattr
                guard makes the check safe in test/diagnostic contexts.
"""

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
_CHUNK_SIZE_DAYS    = 7       # Weekly windows for date chunking
_PAGINATION_DELAY_S = 0.2     # Burst-limit buffer between page hops
_REQUEST_TIMEOUT_S  = 60.0    # Shared across all sync client calls
_AUTH_TIMEOUT_S     = 15.0    # Tighter timeout for token refresh calls
_DEFAULT_SINCE_DATE = "2024-01-01"
_SAMPLE_ROW_CAP     = 1_000   # Max rows returned in sampling mode
_DEFAULT_PAGE_LIMIT = 1_000   # Records per GAQL page (Google max)

# Google Ads API error codes that are safe to retry (transient server faults)
# Source: https://developers.google.com/google-ads/api/docs/best-practices/error-codes
_RETRYABLE_GAQL_CODES = {
    "TRANSIENT_ERROR",
    "INTERNAL_ERROR",
    "DEADLINE_EXCEEDED",
    "RESOURCE_EXHAUSTED",
}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class GoogleAdsRateLimitError(Exception):
    """
    Raised on HTTP 429 (quota exceeded).
    Covered by tenacity retry policy with exponential back-off.
    """

class GoogleAdsAuthError(Exception):
    """
    Raised when the OAuth2 token rotation call itself fails (non-200 from
    Google's token endpoint).  Not retried — a misconfigured credential
    (wrong client_id, revoked refresh_token) will not self-heal.
    """

class GoogleAdsTokenRefreshNeeded(Exception):
    """
    Raised on HTTP 401 during a GAQL request.  The cached access token has
    expired; clearing it and retrying causes _get_auth_headers to issue a
    fresh access token on the next attempt.  Covered by tenacity retry policy.
    """

class GoogleAdsTransientError(Exception):
    """
    Raised for GAQL error codes in _RETRYABLE_GAQL_CODES.
    These are temporary server-side faults that resolve without intervention.
    """


# ---------------------------------------------------------------------------
# Date-window helper
# ---------------------------------------------------------------------------

def _weekly_windows(since: str, until: str) -> List[Tuple[str, str]]:
    """
    Splits a date range into non-overlapping 7-day chunks.

    Splitting into bounded windows prevents GAQL timeouts on high-spend
    accounts, keeps individual request payloads small, and enables cheap
    per-window checkpointing.  Window size is controlled by _CHUNK_SIZE_DAYS.

    Parameters
    ----------
    since : str   Start date, inclusive, %Y-%m-%d.
    until : str   End date, inclusive, %Y-%m-%d.

    Returns
    -------
    List[Tuple[str, str]]
        Ordered list of (window_since, window_until) pairs.

    Example
    -------
    _weekly_windows("2024-01-01", "2024-01-20")
    → [("2024-01-01", "2024-01-07"),
       ("2024-01-08", "2024-01-14"),
       ("2024-01-15", "2024-01-20")]
    """
    fmt    = "%Y-%m-%d"
    start  = datetime.strptime(since, fmt)
    end    = datetime.strptime(until, fmt)
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

class GoogleAdsConnector(BaseIntegration):
    """
    Google Ads Zero-ETL Connector (v2, production-ready).

    Responsibilities
    ────────────────
    Streams campaign-level performance data from a single Google Ads customer
    account into normalised, DuckDB-compatible batches.

    Multi-account concurrency is intentionally NOT handled here.  The
    SyncEngine orchestrator must spawn one connector instance per customer and
    fan out with asyncio.gather.  Collecting results inside this connector
    would convert the streaming pipeline into a full in-memory load, causing
    OOM on large tenants.

    Supported streams
    ─────────────────
    - campaign_performance  Daily spend, impressions, clicks, and conversions
                            at campaign level via GAQL.

    DuckDB / Parquet integration
    ────────────────────────────
    - fetch_schema()        Returns the column → DuckDB type map.
    - get_semantic_views()  Returns pre-computed SQL for contextual RAG, CAC,
                            CPM, CTR, and ROAS analysis.  spend_micros is
                            divided by 1_000_000.0 at query time to present
                            clean dollar values without precision loss.

    OAuth2 token lifecycle
    ──────────────────────
    Access tokens are fetched lazily on first request and cached for the
    connector's lifetime.  On HTTP 401, the cached token is cleared and a
    GoogleAdsTokenRefreshNeeded exception triggers a tenacity retry, causing
    _get_auth_headers to issue a fresh access token transparently.
    """

    PII_COLUMNS = ["campaign_name", "ad_group_name"]

    # -------------------------------------------------------------------------
    # Initialisation
    # -------------------------------------------------------------------------

    def __init__(self, tenant_id: str, credentials: Optional[Dict[str, Any]] = None):
        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name="google_ads",
            credentials=credentials or {}
        )
        super().__init__(config)

        self.api_version = "v16"

        creds = self.config.credentials
        self.developer_token    = creds.get("developer_token")
        self.client_id          = creds.get("client_id")
        self.client_secret      = creds.get("client_secret")
        self.refresh_token      = creds.get("refresh_token")
        self.customer_id        = creds.get("customer_id")
        self.login_customer_id  = creds.get("login_customer_id")  # MCC / manager account

        # Access token is fetched lazily and cached until a 401 invalidates it
        self._access_token: Optional[str] = None

        if not all([
            self.developer_token, self.client_id, self.client_secret,
            self.refresh_token, self.customer_id
        ]):
            logger.error(
                "[%s] Google Ads initialised with incomplete Vault secrets.",
                self.tenant_id,
            )

    # -------------------------------------------------------------------------
    # OAuth2 token management
    # -------------------------------------------------------------------------

    async def _rotate_access_token(self) -> str:
        """
        Exchanges the long-lived refresh_token for a short-lived access_token.

        Called lazily by _get_auth_headers on first request and on every
        GoogleAdsTokenRefreshNeeded retry.  Raises GoogleAdsAuthError (not
        retried) if the token endpoint itself returns a non-200, which
        indicates a misconfigured or revoked credential.
        """
        url     = "https://oauth2.googleapis.com/token"
        payload = {
            "client_id":     self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
            "grant_type":    "refresh_token",
        }

        async with httpx.AsyncClient(timeout=_AUTH_TIMEOUT_S) as client:
            resp = await client.post(url, data=payload)

            if resp.status_code != 200:
                logger.error(
                    "[%s] Google Ads token rotation failed: %s",
                    self.tenant_id, resp.text,
                )
                raise GoogleAdsAuthError(
                    f"[{self.tenant_id}] Failed to rotate Google Ads OAuth token. "
                    "Verify client_id, client_secret, and refresh_token in Vault."
                )

            self._access_token = resp.json().get("access_token")
            return self._access_token

    async def _get_auth_headers(self) -> Dict[str, str]:
        """
        Returns the complete header set for a GAQL request.
        Lazily rotates the access_token if not yet cached.
        """
        if not self._access_token:
            await self._rotate_access_token()

        headers = {
            "Authorization":  f"Bearer {self._access_token}",
            "developer-token": self.developer_token,
            "Content-Type":   "application/json",
        }

        # Required only for MCC (manager) accounts accessing a sub-account
        if self.login_customer_id:
            headers["login-customer-id"] = str(self.login_customer_id)

        return headers

    # -------------------------------------------------------------------------
    # Schema & semantic views
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        DuckDB column-type contract for Parquet validation.

        spend_micros is BIGINT (integer micros) rather than DOUBLE to prevent
        floating-point drift on large budgets.  spend_raw preserves the original
        costMicros string from the API for financial audit and reconciliation.
        """
        return {
            "google_ads_campaign_performance": {
                "campaign_id":   "VARCHAR",
                "campaign_name": "VARCHAR",
                "date_start":    "DATE",
                "spend_micros":  "BIGINT",   # Integer micros; use / 1_000_000.0 in SQL for dollars
                "spend_raw":     "VARCHAR",  # Original costMicros string for audit / reconciliation
                "impressions":   "BIGINT",
                "clicks":        "BIGINT",
                "conversions":   "DOUBLE",
                "status":        "VARCHAR",
            }
        }

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Pre-computed SQL views for Contextual RAG, ROAS, and CAC analysis.

        spend_micros / 1_000_000.0 converts the stored integer micros to dollars
        at query time, giving the LLM clean decimal representations without any
        precision loss in the underlying storage layer.
        """
        return {
            "vw_google_ads_performance": """
                SELECT
                    date_start                                                     AS date,
                    campaign_name,
                    spend_micros / 1000000.0                                       AS spend,
                    impressions,
                    ((spend_micros / 1000000.0) / NULLIF(impressions, 0)) * 1000  AS cpm,
                    (clicks * 1.0) / NULLIF(impressions, 0)                       AS ctr,
                    (spend_micros / 1000000.0) / NULLIF(conversions, 0)           AS cac
                FROM google_ads_campaign_performance
                ORDER BY 1 DESC
            """,
            "vw_google_ads_daily_totals": """
                SELECT
                    date_start                              AS date,
                    SUM(spend_micros) / 1000000.0           AS total_spend,
                    SUM(conversions)                        AS total_conversions
                FROM google_ads_campaign_performance
                GROUP BY 1
                ORDER BY 1 DESC
            """
        }

    # -------------------------------------------------------------------------
    # HTTP layer
    # -------------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type(
            (GoogleAdsRateLimitError, GoogleAdsTokenRefreshNeeded, GoogleAdsTransientError, httpx.NetworkError)
        ),
        wait=wait_exponential(multiplier=2, min=5, max=60),
        stop=stop_after_attempt(5),
    )
    async def _execute_gaql(
        self,
        client: httpx.AsyncClient,
        url: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Executes a single GAQL POST request with full error taxonomy.

        Error handling layers (in order of evaluation)
        ───────────────────────────────────────────────
        1. Token expiry    — HTTP 401 clears the cached access_token and raises
                             GoogleAdsTokenRefreshNeeded → retried; _get_auth_headers
                             will issue a fresh token on the next attempt.
        2. Rate limit      — HTTP 429 → GoogleAdsRateLimitError → retried.
        3. HTTP errors     — raise_for_status() surfaces other 4xx/5xx.
        4. Transient faults— GAQL error codes in _RETRYABLE_GAQL_CODES →
                             GoogleAdsTransientError → retried.
        5. Fatal errors    — All other GAQL error payloads surface immediately.

        Headers are fetched inside this method (not passed in) so that a
        token refresh on retry always produces a fresh Authorization header.
        """
        headers = await self._get_auth_headers()
        resp    = await client.post(url, headers=headers, json=payload)

        # ── 1. Token expiry ───────────────────────────────────────────────────
        if resp.status_code == 401:
            logger.warning(
                "[%s] Google Ads 401 — clearing cached token for refresh.",
                self.tenant_id,
            )
            self._access_token = None
            raise GoogleAdsTokenRefreshNeeded(
                "Access token expired; refreshing on next retry."
            )

        # ── 2. Rate limit ─────────────────────────────────────────────────────
        if resp.status_code == 429:
            logger.warning("[%s] Google Ads rate limit hit. Backing off.", self.tenant_id)
            raise GoogleAdsRateLimitError("Google Ads API quota exceeded.")

        # ── 3. HTTP errors ────────────────────────────────────────────────────
        resp.raise_for_status()
        data = resp.json()

        # ── 4 / 5. GAQL error taxonomy ────────────────────────────────────────
        # Google returns 200 with an error body on some fault types
        errors = data.get("partialFailureError") or data.get("errors", [])
        if errors:
            code = (
                errors.get("code", "") if isinstance(errors, dict)
                else errors[0].get("errorCode", {}).get("requestError", "UNKNOWN")
            )
            message = (
                errors.get("message", "Unknown error") if isinstance(errors, dict)
                else errors[0].get("message", "Unknown error")
            )

            if code in _RETRYABLE_GAQL_CODES:
                raise GoogleAdsTransientError(
                    f"Transient GAQL error '{code}': {message}"
                )

            raise httpx.HTTPStatusError(
                f"Fatal GAQL error '{code}': {message}",
                request=resp.request,
                response=resp,
            )

        return data

    # -------------------------------------------------------------------------
    # Date-chunked paginator (internal)
    # -------------------------------------------------------------------------

    async def _paginate_window(
        self,
        client: httpx.AsyncClient,
        since: str,
        until: str,
        sample_mode: bool,
        rows_yielded: List[int],  # Single-element mutable list for cross-scope int sharing
        sample_cap: int,
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Fetches all GAQL pages for a single [since, until] date window and
        yields normalised, PII-masked record batches.

        Memory usage per window is bounded by _DEFAULT_PAGE_LIMIT (1 000 rows
        per page).  Batches are yielded directly without buffering.

        Spend precision
        ───────────────
        costMicros is already an integer in the API response.  It is cast to
        int() and stored as spend_micros (BIGINT).  spend_raw preserves the
        original string.  Dollar conversion (/ 1_000_000.0) is deferred to
        query time in the semantic views.
        """
        url = (
            f"https://googleads.googleapis.com/{self.api_version}"
            f"/customers/{self.customer_id}/googleAds:search"
        )

        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions
            FROM campaign
            WHERE segments.date BETWEEN '{since}' AND '{until}'
            ORDER BY segments.date ASC
        """

        payload: Dict[str, Any] = {
            "query":    query,
            "pageSize": _SAMPLE_ROW_CAP if sample_mode else _DEFAULT_PAGE_LIMIT,
        }

        while True:
            data    = await self._execute_gaql(client, url, payload)
            results = data.get("results", [])

            if not results:
                break

            batch: List[Dict[str, Any]] = []
            for row in results:
                if sample_mode and rows_yielded[0] >= sample_cap:
                    break

                campaign   = row.get("campaign", {})
                segments   = row.get("segments", {})
                metrics    = row.get("metrics", {})

                # ── Spend precision ───────────────────────────────────────────
                cost_raw    = metrics.get("costMicros", "0")
                spend_micros = int(cost_raw) if cost_raw else 0

                record: Dict[str, Any] = {
                    "campaign_id":   str(campaign.get("id", "")),
                    "campaign_name": campaign.get("name", ""),
                    "date_start":    segments.get("date"),
                    "spend_micros":  spend_micros,
                    "spend_raw":     str(cost_raw),
                    "impressions":   int(metrics.get("impressions", 0)),
                    "clicks":        int(metrics.get("clicks", 0)),
                    "conversions":   float(metrics.get("conversions", 0.0)),
                    "status":        campaign.get("status", ""),
                }

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

            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break

            payload["pageToken"] = next_page_token
            await asyncio.sleep(_PAGINATION_DELAY_S)

    # -------------------------------------------------------------------------
    # Public sync entry-point
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
        Primary pull pipeline — GAQL with weekly chunking and per-window
        checkpointing.

        Parameters
        ----------
        stream_name : str
            Must be ``"campaign_performance"``.  Additional streams (ad_group,
            keyword) should be added as separate stream_name branches.
        start_timestamp : str
            ISO-8601 date or datetime string.  Used only when no checkpoint
            exists; the stored checkpoint date always takes precedence.
        sample_mode : bool
            Stops after ``sample_cap`` rows.  Intended for UI previews,
            embedding generation, and instant UX feedback loops.
        sample_cap : int
            Maximum rows yielded in sample mode (default: 1 000).

        Memory guarantee
        ────────────────
        This method yields batches directly from _paginate_window without
        buffering.  Peak memory usage is O(page_size) — constant relative to
        total account data volume.  Multi-account concurrency belongs at the
        SyncEngine layer:

            await asyncio.gather(*[
                engine.collect(GoogleAdsConnector(tid, creds=acc))
                for acc in accounts
            ])

        Checkpointing
        ─────────────
        _load_checkpoint() is called before the first window.  On success,
        _save_checkpoint() is written after each completed window so that a
        mid-sync crash resumes from the last complete week rather than
        restarting the full historical range.

        Date chunking
        ─────────────
        _weekly_windows() splits the full range into _CHUNK_SIZE_DAYS-day
        windows before any API call is issued.  This keeps each request small,
        retries cheap, and is consistent with the Meta Ads connector pattern.
        """
        if stream_name != "campaign_performance":
            raise ValueError(
                f"[{self.tenant_id}] Unknown Google Ads stream: '{stream_name}'. "
                "Supported: 'campaign_performance'."
            )

        # ── PII compliance enforcement ─────────────────────────────────────────
        # A connector must never fail silently on security.  If PII_COLUMNS are
        # declared but the orchestrator has not injected data_sanitizer, raw
        # campaign names and ad group names would be written to storage in plain
        # text.  Raising here — before any data is fetched — surfaces the
        # misconfiguration immediately and prevents a silent compliance breach.
        # test_connection() and fetch_schema() are intentionally excluded from
        # this check because they never touch PII-bearing data.
        if self.PII_COLUMNS and not getattr(self, "data_sanitizer", None):
            raise RuntimeError(
                f"[{self.tenant_id}] data_sanitizer has not been injected. "
                f"PII columns {self.PII_COLUMNS} cannot be masked before storage. "
                "Ensure the SyncEngine injects the sanitizer before calling sync_historical()."
            )

        # ── Resolve effective start date ──────────────────────────────────────
        # Checkpoint beats start_timestamp — always resume from last success.
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
            "[%s] Google Ads sync: %d weekly windows (%s → %s).",
            self.tenant_id, len(windows), since, until,
        )

        rows_yielded: List[int] = [0]  # Mutable counter shared into _paginate_window

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

                # Checkpoint written only after the full window completes.
                # A failure mid-window leaves the previous checkpoint intact
                # so the window is retried cleanly on the next run.
                await self._save_checkpoint(stream_name, window_until)

                if sample_mode and rows_yielded[0] >= sample_cap:
                    break

        logger.info(
            "✅ [%s] Google Ads sync complete. Total records: %d",
            self.tenant_id, rows_yielded[0],
        )

    # -------------------------------------------------------------------------
    # Checkpointing
    # -------------------------------------------------------------------------

    async def _load_checkpoint(self, stream_name: str) -> Optional[str]:
        """
        Reads the last successfully synced date from the BaseIntegration
        checkpoint store (Vault / Redis / DB, depending on deployment).
        Returns None if no checkpoint exists or the store is unavailable,
        causing sync_historical to fall back to start_timestamp.
        """
        try:
            if hasattr(self, "get_checkpoint"):
                cp = await self.get_checkpoint(f"google_ads_{stream_name}")
                return cp.get("last_synced_date") if cp else None
        except Exception as exc:
            logger.warning(
                "[%s] Could not load checkpoint: %s — starting from scratch.",
                self.tenant_id, exc,
            )
        return None

    async def _save_checkpoint(self, stream_name: str, last_date: str) -> None:
        """
        Persists the last successfully synced date to the BaseIntegration
        checkpoint store.  Failures are logged but not re-raised — a failed
        checkpoint write degrades gracefully to a full re-sync on the next
        run rather than halting the current sync mid-flight.
        """
        try:
            if hasattr(self, "set_checkpoint"):
                await self.set_checkpoint(
                    f"google_ads_{stream_name}",
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
        """
        Applies DataSanitizer.mask() to every value in PII_COLUMNS.

        Security contract
        ─────────────────
        This method must only be reached via sync_historical, which enforces a
        hard RuntimeError at entry if data_sanitizer has not been injected.
        The getattr guard here is a defensive fallback for utility paths
        (test_connection, fetch_schema) that never handle PII-bearing data and
        legitimately operate without a sanitizer injected.

        In all production sync paths, the guard in sync_historical guarantees
        that a missing sanitizer fails loudly before any data is fetched —
        never silently after PII has already been written to storage.
        """
        sanitizer = getattr(self, "data_sanitizer", None)
        if not sanitizer:
            return batch

        for row in batch:
            for col in self.PII_COLUMNS:
                if col in row and row[col] is not None:
                    row[col] = sanitizer.mask(row[col])
        return batch

    # -------------------------------------------------------------------------
    # Connection test
    # -------------------------------------------------------------------------

    async def test_connection(self) -> bool:
        """
        Issues a minimal GAQL query to verify that the access_token,
        customer_id, and developer_token are all valid and have the required
        permissions.  Returns True on success, False on any failure.

        Separates GoogleAdsAuthError (credential misconfiguration) from
        generic failures (network, permissions) so the caller can route to
        the appropriate remediation path.
        """
        try:
            url     = (
                f"https://googleads.googleapis.com/{self.api_version}"
                f"/customers/{self.customer_id}/googleAds:search"
            )
            payload = {
                "query":    "SELECT customer.id FROM customer LIMIT 1",
                "pageSize": 1,
            }

            async with httpx.AsyncClient(timeout=_AUTH_TIMEOUT_S) as client:
                data = await self._execute_gaql(client, url, payload)
                return "results" in data

        except GoogleAdsAuthError:
            logger.error(
                "[%s] Google Ads connection failed: OAuth credential error.",
                self.tenant_id,
            )
            return False
        except Exception as exc:
            logger.error(
                "[%s] Google Ads connection failed: %s",
                self.tenant_id, exc,
            )
            return False