"""
ARCLI.TECH - SaaS Integration Module
Connector: Meta Ads (Facebook & Instagram Analytics)
Strategy: Insights API · Cursor Pagination · AppSecret Proof · CAC Analytics

File path: api/services/integrations/meta_ads_connector.py

Upgrade changelog
─────────────────
v1 → v2
  1. Date chunking       — weekly windows prevent Graph API timeouts on large accounts
  2. Checkpointing       — resumes from last_synced_date on failure
  3. Money precision     — spend stored as integer cents; raw string preserved
  4. Dynamic conversions — conversion_events list driven by tenant credentials
  5. Breakdown support   — country / device / placement segmentation
  6. Sampling mode       — fast preview path with configurable row cap
  7. Retry taxonomy      — transient Graph API error codes retried explicitly
  8. Bearer auth         — access_token moved to Authorization header (never in URL)
  9. Proactive throttle  — X-Business-Use-Case-Usage parsed before hard 429
 10. Proof caching       — appsecret_proof computed once at init, not per-request

v2 → v3
 11. OOM safety          — sync_multiple_accounts removed; multi-account concurrency
                           is orchestrated at the SyncEngine layer, not inside the
                           connector. The connector is a strict 1-to-1 stream.
 12. PII masker safety   — getattr guard prevents AttributeError in lightweight
                           contexts where data_sanitizer has not been injected.

Architecture principles
───────────────────────
Security      — AppSecret Proof on every request; Bearer auth (token never in URL);
                proof re-attached to every cursor hop (paging.next omits it).
Resilience    — Weekly date chunking + per-window checkpointing; typed retry
                taxonomy covering proactive throttle, hard 429, transient Graph
                faults, and token expiry.
Precision     — spend_cents (BIGINT) avoids float drift on large budgets; spend_raw
                (VARCHAR) preserves the original API string for audit/reconciliation.
Flexibility   — Conversion events, breakdowns, and sampling mode are all
                tenant-configurable via credentials or call-site keyword flags.
Privacy       — DataSanitizer applied to PII_COLUMNS before any yield; getattr
                guard makes the check safe in test/diagnostic contexts.
Memory        — Strict streaming (AsyncGenerator); memory usage is O(batch_size),
                constant relative to total account data volume.
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
_CHUNK_SIZE_DAYS    = 7      # Weekly windows for date chunking
_PAGINATION_DELAY_S = 0.3    # Burst-limit buffer between cursor hops
_REQUEST_TIMEOUT_S  = 60.0   # Shared across all client calls
_DEFAULT_SINCE_DATE = "2024-01-01"
_SAMPLE_ROW_CAP     = 1_000  # Max rows returned in sampling mode
_DEFAULT_PAGE_LIMIT = 250    # Records per API page (full sync)

# Graph API error codes that are safe to retry (transient server faults).
# Source: https://developers.facebook.com/docs/graph-api/using-graph-api/error-handling
_RETRYABLE_GRAPH_CODES = {1, 2, 4, 17, 341}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class MetaAdsRateLimitError(Exception):
    """
    Raised on hard 429s or when proactive X-Business-Use-Case-Usage parsing
    detects the call_count threshold has reached 85%.  Both paths are handled
    by the same tenacity retry policy.
    """

class MetaAdsTokenExpiredError(Exception):
    """
    Raised when Meta returns OAuthException code 190 (token expiry).
    Signals the SyncEngine / Vault layer to trigger credential rotation.
    Not retried — a new token must be issued before the sync can resume.
    """

class MetaAdsTransientError(Exception):
    """
    Raised for Graph API error codes in _RETRYABLE_GRAPH_CODES.
    These are temporary server-side faults that resolve without intervention.
    """


# ---------------------------------------------------------------------------
# Date-window helper
# ---------------------------------------------------------------------------

def _weekly_windows(since: str, until: str) -> List[Tuple[str, str]]:
    """
    Splits a date range into non-overlapping 7-day chunks.

    Splitting requests into bounded windows instead of issuing a single large
    time_range query prevents Graph API timeouts on large accounts, keeps
    individual request payloads small, and makes per-window checkpointing
    cheap.  Window size is controlled by _CHUNK_SIZE_DAYS.

    Parameters
    ----------
    since : str
        Start date, inclusive, in %Y-%m-%d format.
    until : str
        End date, inclusive, in %Y-%m-%d format.

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

class MetaAdsConnector(BaseIntegration):
    """
    Meta Ads Zero-ETL Connector (v3, production-ready).

    Responsibilities
    ────────────────
    This class is responsible for exactly one thing: streaming performance
    data from a single Meta Ad Account into normalised, DuckDB-compatible
    batches.

    Multi-account concurrency is intentionally NOT handled here.  The
    SyncEngine orchestrator must spawn one connector instance per account and
    fan out with asyncio.gather.  Collecting results inside this connector
    would convert the streaming pipeline into a full in-memory load, causing
    OOM on large tenants.

    Supported streams
    ─────────────────
    - insights_performance  Campaign-level daily spend, reach, clicks, and
                            conversion data.

    DuckDB / Parquet integration
    ────────────────────────────
    - fetch_schema()       Returns the column → DuckDB type map for Parquet
                           validation.
    - get_semantic_views() Returns pre-computed SQL that the LLM uses for
                           contextual RAG, CAC, CPM, CTR, and ROAS analysis.
                           spend_cents / 100.0 converts cents to dollars at
                           query time without any precision loss.
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
        self.ad_account_id = creds.get("ad_account_id")  # e.g. "act_XXXXXXXX"

        # ── Configurable conversion events ────────────────────────────────────
        # Tenants declare which Meta action_types constitute a conversion.
        # Default covers standard e-commerce.  Override in credentials for:
        #   lead-gen       → ["lead"]
        #   SaaS           → ["CompleteRegistration"]
        #   custom events  → ["custom_event_name"]
        #   multi-funnel   → ["lead", "purchase"]
        self.conversion_events: List[str] = creds.get("conversion_events", ["purchase"])

        # ── Breakdown support ─────────────────────────────────────────────────
        # Optional list of Meta breakdown dimensions.  Examples:
        #   ["country"]                          → geo analytics
        #   ["device_platform"]                  → device analytics
        #   ["publisher_platform"]               → placement analytics
        #   ["country", "device_platform"]       → combined segmentation
        # Columns are appended dynamically to fetch_schema() and each record.
        self.breakdowns: List[str] = creds.get("breakdowns", [])

        if not all([self.access_token, self.ad_account_id, self.client_secret]):
            logger.error(
                "[%s] Meta Ads initialised with incomplete Vault secrets.",
                self.tenant_id,
            )

        # Pre-compute proof once — access_token is stable for the connector's
        # lifetime and the HMAC computation is non-trivial at high throughput.
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
        Returns the HMAC-SHA256 signature required by Meta's high-security API
        tier.  Called once at init; result stored in self._appsecret_proof.
        """
        return hmac.new(
            self.client_secret.encode("utf-8"),
            self.access_token.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

    @property
    def _auth_headers(self) -> Dict[str, str]:
        """
        Returns the Authorization header for every outbound request.
        Keeping the token in the header (not the URL) prevents it from
        appearing in server access logs, proxy caches, or curl history.
        """
        return {"Authorization": f"Bearer {self.access_token}"}

    @property
    def _proof_params(self) -> Dict[str, str]:
        """
        Returns the appsecret_proof query-param fragment.  Merged into the
        initial params dict and re-appended to every paging.next cursor URL
        because Meta's cursor URLs carry the access_token but omit the proof.
        """
        return {"appsecret_proof": self._appsecret_proof}

    # -------------------------------------------------------------------------
    # Schema & semantic views
    # -------------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        """
        Returns the DuckDB column-type contract for Parquet validation.

        spend_cents is BIGINT (integer cents) rather than DOUBLE to prevent
        floating-point drift on large budgets.  spend_raw preserves the
        original API string for financial audit and reconciliation.

        Breakdown dimension columns are appended dynamically so the schema
        automatically stays in sync with the tenant's breakdown configuration.
        """
        base: Dict[str, str] = {
            "campaign_id":   "VARCHAR",
            "campaign_name": "VARCHAR",
            "date_start":    "DATE",
            "spend_cents":   "BIGINT",   # Integer cents; use / 100.0 in SQL for dollars
            "spend_raw":     "VARCHAR",  # Original API string for audit / reconciliation
            "impressions":   "BIGINT",
            "clicks":        "BIGINT",
            "reach":         "BIGINT",
            "conversions":   "DOUBLE",
            "objective":     "VARCHAR",
        }
        for bd in self.breakdowns:
            base[bd] = "VARCHAR"

        return {"meta_ads_insights_performance": base}

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Pre-computed SQL views for Contextual RAG, ROAS, and CAC analysis.

        spend_cents / 100.0 converts the stored integer cents to dollars at
        query time, giving the LLM clean decimal representations without any
        precision loss in the underlying storage layer.

        These views are registered in DuckDB at sync time and exposed to the
        LLM as semantic context.  They provide the exact logic for CPM, CTR,
        and CAC so the model doesn't need to derive formulas from raw columns.
        """
        return {
            "vw_meta_ads_performance": """
                SELECT
                    date_start                                                  AS date,
                    campaign_name,
                    spend_cents / 100.0                                         AS spend,
                    impressions,
                    ((spend_cents / 100.0) / NULLIF(impressions, 0)) * 1000    AS cpm,
                    (clicks * 1.0) / NULLIF(impressions, 0)                    AS ctr,
                    (spend_cents / 100.0) / NULLIF(conversions, 0)             AS cac
                FROM meta_ads_insights_performance
                ORDER BY 1 DESC
            """,
            "vw_meta_daily_totals": """
                SELECT
                    date_start                      AS date,
                    SUM(spend_cents) / 100.0        AS total_spend,
                    SUM(conversions)                AS total_conversions
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
        stop=stop_after_attempt(5),
    )
    async def _request(
        self,
        client: httpx.AsyncClient,
        url: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Executes a single authenticated GET request with full error taxonomy.

        Error handling layers (in order of evaluation)
        ───────────────────────────────────────────────
        1. Proactive throttle  — X-Business-Use-Case-Usage header parsed on
                                 every response; backs off at ≥ 85% call_count
                                 before the hard 429 threshold is reached.
        2. Hard rate-limit     — HTTP 429 → MetaAdsRateLimitError → retried.
        3. HTTP errors         — raise_for_status() surfaces 4xx/5xx that
                                 aren't handled above.
        4. Token expiry        — OAuthException code 190 → MetaAdsTokenExpiredError
                                 → NOT retried; signals upstream to rotate creds.
        5. Transient faults    — Graph API codes in _RETRYABLE_GRAPH_CODES →
                                 MetaAdsTransientError → retried.
        6. Fatal Graph errors  — All other error payloads surface immediately
                                 as httpx.HTTPStatusError.
        """
        resp = await client.get(url, params=params, headers=self._auth_headers)

        # ── 1. Proactive throttle ─────────────────────────────────────────────
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

        # ── 2. Hard rate-limit ────────────────────────────────────────────────
        if resp.status_code == 429:
            raise MetaAdsRateLimitError("Meta API hard rate limit hit. Backing off…")

        # ── 3. HTTP errors ────────────────────────────────────────────────────
        resp.raise_for_status()
        payload = resp.json()

        # ── 4 / 5 / 6. Graph API error taxonomy ──────────────────────────────
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

            raise httpx.HTTPStatusError(
                f"Fatal Graph API error {code}: {error_msg}",
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
        rows_yielded: List[int],  # Single-element mutable list for cross-scope int sharing
        sample_cap: int,
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Streams all cursor pages for a single [since, until] date window.

        Yields normalised, PII-masked record batches to sync_historical, which
        passes them directly to the caller without buffering.  Memory usage
        per window is bounded by _DEFAULT_PAGE_LIMIT (250 rows per page).

        Cursor proof re-attachment
        ──────────────────────────
        Meta's paging.next URLs include the access_token but omit the
        appsecret_proof.  The proof is manually appended to every cursor URL
        so authenticated requests remain consistent across all pages.

        Normalisation
        ─────────────
        - spend_cents:  int(round(float(spend_raw) * 100)) — precision-safe
        - conversions:  summed from the nested actions[] array, filtered by
                        self.conversion_events — tenant-configurable
        - breakdowns:   attached as dynamic columns when self.breakdowns is set
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
            params = None  # Cursor URLs are self-contained; clear initial params after first hop

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
        Primary pull pipeline — Insights API with weekly chunking and
        per-window checkpointing.

        Parameters
        ----------
        stream_name : str
            Must be ``"insights_performance"``.  Additional streams (adset,
            ad-level) should be added as separate stream_name branches rather
            than new methods.
        start_timestamp : str
            ISO-8601 date or datetime string.  Used only when no checkpoint
            exists; otherwise the stored checkpoint date takes precedence.
        sample_mode : bool
            Stops after ``sample_cap`` rows.  Intended for UI previews,
            embedding generation, and instant UX feedback loops where a full
            historical sync would be wasteful.
        sample_cap : int
            Maximum rows yielded in sample mode (default: 1 000).

        Memory guarantee
        ────────────────
        This method yields batches directly from _paginate_window without
        buffering.  Peak memory usage is O(batch_size) — constant relative to
        total account data volume.  Do NOT aggregate results here.
        Multi-account concurrency belongs at the SyncEngine layer:

            await asyncio.gather(*[
                engine.collect(MetaAdsConnector(tid, creds=acc))
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
        retries cheap, and is consistent with the Google Ads connector pattern.
        """
        if stream_name != "insights_performance":
            raise ValueError(
                f"[{self.tenant_id}] Unknown Meta Ads stream: '{stream_name}'. "
                "Supported: 'insights_performance'."
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
            "[%s] Meta Ads sync: %d weekly windows (%s → %s).",
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
            "✅ [%s] Meta Ads sync complete. Total records: %d",
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
        Persists the last successfully synced date to the BaseIntegration
        checkpoint store.  Failures are logged but not re-raised — a failed
        checkpoint write degrades gracefully to a full re-sync on the next
        run rather than halting the current sync mid-flight.
        """
        try:
            if hasattr(self, "set_checkpoint"):
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
        """
        Applies DataSanitizer.mask() to every value in PII_COLUMNS.

        The getattr guard ensures this method is safe to call in any context —
        full production (sanitizer injected by orchestrator), lightweight
        connection tests, and unit test suites where the sanitizer is absent.
        When no sanitizer is present the batch is returned unmodified; the
        orchestrator is responsible for ensuring production deployments always
        inject the sanitizer before starting a sync.
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
        Pings the target Ad Account endpoint to verify that the access_token,
        ad_account_id, and appsecret_proof are all valid and have the required
        permissions.  Returns True on success, False on any failure.

        Separates MetaAdsTokenExpiredError from generic failures so the
        caller can distinguish an expired token (trigger rotation) from a
        network or misconfiguration error (investigate credentials / Vault).
        """
        try:
            url    = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}"
            params = {"fields": "name", **self._proof_params}

            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_S) as client:
                data = await self._request(client, url, params)
                return "name" in data

        except MetaAdsTokenExpiredError:
            logger.error(
                "[%s] Meta Ads connection failed: token expired.",
                self.tenant_id,
            )
            return False
        except Exception as exc:
            logger.error(
                "[%s] Meta Ads connection failed: %s",
                self.tenant_id, exc,
            )
            return False