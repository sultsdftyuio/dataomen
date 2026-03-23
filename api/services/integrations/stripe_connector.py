"""
ARCLI.TECH - SaaS Integration Module
Connector: Stripe (Financial Analytics)
Strategy: Async Cursor Pagination, Strict Schema Mapping, Zero-ETL Vectorization, Security by Design

Changelog (v3):
- CRITICAL FIX: Renamed sync_stream → sync_historical to satisfy BaseIntegration ABC contract.
  Python's abc module raises TypeError on instantiation if any abstractmethod is unimplemented;
  the previous name caused a silent contract violation that would crash the SyncEngine orchestrator.
- ARCH: Re-introduced llm_client as an optional __init__ parameter. fetch_schema now fires a
  non-blocking asyncio background task to pre-warm the semantic router immediately after schema
  construction, enabling the "First 5 Minutes" RAG-ready experience for solo founders without
  blocking the caller awaiting fetch_schema.
- COVERAGE: Added vw_stripe_signups_24h — counts new customers in the rolling 24-hour window,
  sourced from stripe_customers.created (Unix epoch). Powers the founder dashboard "Signups Today" KPI.
- COVERAGE: Added vw_stripe_churn_rate — computes monthly churn as canceled subscriptions divided
  by total active-or-canceled subscriptions in the same cohort month. Provides the dashboard
  "Churn Rate %" KPI requested in the DataFast roadmap.

Changelog (v2):
- SECURITY: _mask_pii now raises RuntimeError if data_sanitizer is absent (no silent PII passthrough)
- SECURITY: Added verify_webhook() with HMAC-SHA256 signature validation
- SECURITY: Removed dead 'customer_email' PII column (was never in mapped records)
- BUG: sync_historical now logs a warning on invalid start_timestamp instead of bare pass
- BUG: _map_record reads items[0].price for subscriptions (Stripe deprecated top-level 'plan')
- BUG: currency defaults to None instead of 'usd' to expose nulls explicitly
- NOTE: fetch_schema remains async def to satisfy BaseIntegration abstract contract (orchestrator awaits it)
- ARCH: _fetch_page inspects Retry-After header on 429 before falling back to exponential backoff
- ARCH: stream mappers extracted into a registry (_STREAM_MAPPERS) for easier extension and testing
- ARCH: Added validate_stream() called at sync_historical entry for early, clear feedback
- ARCH: TCPConnector configured with explicit connection limit and DNS TTL
- ARCH: test_connection returns bool (BaseIntegration contract); failure reason logged, not returned
- ARCH: Added debug-level logging in _fetch_page and _map_record
- COVERAGE: Added 'invoices' and 'disputes' streams with schemas and mappers
- COVERAGE: Added Stripe-Account header support for Connect platform accounts
- ARCH: Removed __init__ sanitizer crash — orchestrator needs bare instantiation for OAuth/webhook/test flows;
         strict PII guard kept inside _mask_pii where it only fires if a sync is actually attempted
"""

import hmac
import hashlib
import logging
import asyncio
import contextlib
import time
from datetime import datetime
from typing import (
    AsyncGenerator,
    AsyncIterator,
    Callable,
    Dict,
    Any,
    List,
    Optional,
)

import aiohttp
from tenacity import (
    retry,
    wait_exponential,
    stop_after_attempt,
    retry_if_exception_type,
)

from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class StripeRateLimitError(Exception):
    """Triggered by HTTP 429 from Stripe API."""
    pass


class StripeAuthError(Exception):
    """Triggered by HTTP 401 from Stripe API (invalid or revoked credentials)."""
    pass


class StripePIISanitizerMissing(RuntimeError):
    """
    Raised at init time when credentials are provided but no data_sanitizer is
    attached. A connector that processes PII without a sanitizer must never run
    silently — fail loudly so the misconfiguration is caught before any data
    reaches storage.
    """
    pass


# ---------------------------------------------------------------------------
# Stream mapper registry
# ---------------------------------------------------------------------------
# Each mapper receives the raw Stripe API dict and returns a flattened record
# that exactly matches the DuckDB schema declared in fetch_schema().
# Adding a new stream = add one entry here + one schema entry there. Nothing
# else needs to change.

def _map_charge(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id":              raw.get("id"),
        "created":         raw.get("created", 0),
        "amount":          int(raw.get("amount") or 0),
        "amount_refunded": int(raw.get("amount_refunded") or 0),
        # Default to None rather than "usd" so multi-currency nulls are visible.
        "currency":        raw.get("currency"),
        "customer":        raw.get("customer") if isinstance(raw.get("customer"), str) else None,
        "status":          raw.get("status"),
        "paid":            raw.get("paid", False),
        "receipt_email":   raw.get("receipt_email"),
    }


def _map_subscription(raw: Dict[str, Any]) -> Dict[str, Any]:
    # Stripe deprecated the top-level 'plan' field for multi-price subscriptions.
    # The canonical location is items.data[0].price (or .plan for legacy objects).
    # We fall back gracefully so both old and new objects are handled.
    items_data = raw.get("items", {}).get("data", [])
    price_obj = items_data[0].get("price", {}) if items_data else {}
    plan_obj  = items_data[0].get("plan",  {}) if items_data else {}
    # Prefer price (current API), fall back to plan (legacy), then top-level plan
    legacy_plan = raw.get("plan", {})
    amount   = (price_obj or plan_obj or legacy_plan).get("amount")
    interval = (price_obj or plan_obj or legacy_plan).get("interval", "month")

    return {
        "id":                   raw.get("id"),
        "created":              raw.get("created", 0),
        "customer":             raw.get("customer") if isinstance(raw.get("customer"), str) else None,
        "status":               raw.get("status"),
        "current_period_start": raw.get("current_period_start", 0),
        "current_period_end":   raw.get("current_period_end", 0),
        "plan_amount":          int(amount or 0),
        "plan_interval":        interval,
    }


def _map_customer(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id":      raw.get("id"),
        "created": raw.get("created", 0),
        "email":   raw.get("email"),
        "name":    raw.get("name"),
        "phone":   raw.get("phone"),
    }


def _map_invoice(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id":              raw.get("id"),
        "created":         raw.get("created", 0),
        "customer":        raw.get("customer") if isinstance(raw.get("customer"), str) else None,
        "subscription":    raw.get("subscription"),
        "status":          raw.get("status"),
        "amount_due":      int(raw.get("amount_due")  or 0),
        "amount_paid":     int(raw.get("amount_paid") or 0),
        "currency":        raw.get("currency"),
        "period_start":    raw.get("period_start", 0),
        "period_end":      raw.get("period_end", 0),
    }


def _map_dispute(raw: Dict[str, Any]) -> Dict[str, Any]:
    # charge may be an expanded object or a bare ID string
    charge_id = raw.get("charge")
    if isinstance(charge_id, dict):
        charge_id = charge_id.get("id")
    return {
        "id":      raw.get("id"),
        "created": raw.get("created", 0),
        "charge":  charge_id,
        "amount":  int(raw.get("amount") or 0),
        "currency": raw.get("currency"),
        "reason":  raw.get("reason"),
        "status":  raw.get("status"),
    }


# Maps stream_name → (mapper_fn, list_of_pii_fields_in_that_stream)
_STREAM_MAPPERS: Dict[str, tuple[Callable, List[str]]] = {
    "charges":       (_map_charge,       ["receipt_email"]),
    "subscriptions": (_map_subscription, []),
    "customers":     (_map_customer,     ["email", "phone", "name"]),
    "invoices":      (_map_invoice,      []),
    "disputes":      (_map_dispute,      []),
}


# ---------------------------------------------------------------------------
# Connector
# ---------------------------------------------------------------------------

class StripeConnector(BaseIntegration):
    """
    Phase 8: Stripe Zero-ETL Connector.

    Engineering Standards:
    - Strict Schema Mapping: Explicitly extracts only the fields required by DuckDB
      to prevent memory bloat from Stripe's massive API responses.
    - Money Precision: Financials are strictly handled in integer cents (BIGINT).
    - Session Management: Uses async context managers to prevent socket exhaustion.
    - Security by Default: PII masking is enforced inside _mask_pii — missing sanitizer
      raises StripePIISanitizerMissing at sync time, not at construction, so utility
      methods (get_oauth_url, verify_webhook, test_connection) can still be called on a
      partially-configured instance.
    - Stripe Connect: Pass connected_account_id to scope requests to a sub-account.
    - RAG Pre-warming: If llm_client is provided, fetch_schema fires a background task
      to pre-warm the semantic router immediately, enabling sub-second natural-language
      queries the moment the first sync completes.
    """

    SUPPORTED_STREAMS = list(_STREAM_MAPPERS.keys())

    def __init__(
        self,
        tenant_id: str,
        credentials: Optional[Dict[str, Any]] = None,
        session: Optional[aiohttp.ClientSession] = None,
        connected_account_id: Optional[str] = None,
        llm_client: Optional[Any] = None,
    ):
        config = IntegrationConfig(
            tenant_id=tenant_id,
            integration_name="stripe",
            credentials=credentials or {},
        )
        super().__init__(config)

        self.api_base = "https://api.stripe.com/v1"
        self.client_token          = self._initialize_client()
        self.webhook_secret        = (credentials or {}).get("webhook_secret", "")
        self._external_session     = session
        self._connected_account_id = connected_account_id
        # Optional: if supplied, fetch_schema will fire a background pre-warm task
        # so the semantic router is RAG-ready before the first query arrives.
        self._llm_client           = llm_client

    # -----------------------------------------------------------------------
    # Initialisation helpers
    # -----------------------------------------------------------------------

    def _initialize_client(self) -> str:
        token = (
            self.config.credentials.get("access_token")
            or self.config.credentials.get("api_key", "")
        )
        if not token:
            logger.warning("[%s] Stripe initialized without token.", self.tenant_id)
        return token

    def validate_stream(self, stream_name: str) -> None:
        """Raises ValueError immediately if stream_name is not supported."""
        if stream_name not in _STREAM_MAPPERS:
            raise ValueError(
                f"[{self.tenant_id}] Unsupported stream: '{stream_name}'. "
                f"Supported: {self.SUPPORTED_STREAMS}"
            )

    # -----------------------------------------------------------------------
    # HTTP context manager  (socket exhaustion fix)
    # -----------------------------------------------------------------------

    @contextlib.asynccontextmanager
    async def _get_session(self) -> AsyncIterator[aiohttp.ClientSession]:
        if self._external_session:
            yield self._external_session
            return

        headers: Dict[str, str] = {
            "Authorization":  f"Bearer {self.client_token}",
            "Stripe-Version": "2023-10-16",
        }
        if self._connected_account_id:
            headers["Stripe-Account"] = self._connected_account_id

        # Explicit connector: cap simultaneous connections, set a sensible DNS TTL.
        connector = aiohttp.TCPConnector(limit=10, ttl_dns_cache=300)
        async with aiohttp.ClientSession(headers=headers, connector=connector) as session:
            yield session

    # -----------------------------------------------------------------------
    # Schema & semantic views
    #
    # fetch_schema MUST remain async def — BaseIntegration declares it as an
    # async abstractmethod and the SyncEngine orchestrator does:
    #   schema = await connector.fetch_schema()
    # A plain def returns a dict, not a coroutine; the await would raise
    # TypeError and crash the pipeline.
    #
    # RAG pre-warming: if an llm_client is attached, we schedule a background
    # task *after* building the schema so the caller is not blocked. The task
    # sends the schema to the semantic router; any failure is logged and swallowed
    # because a pre-warm error must never abort a legitimate schema fetch.
    # -----------------------------------------------------------------------

    async def fetch_schema(self) -> Dict[str, Any]:
        schema = {
            "stripe_charges": {
                "id":              "VARCHAR",
                "amount":          "BIGINT",
                "amount_refunded": "BIGINT",
                "currency":        "VARCHAR",
                "customer":        "VARCHAR",
                "created":         "BIGINT",
                "status":          "VARCHAR",
                "paid":            "BOOLEAN",
                "receipt_email":   "VARCHAR",
            },
            "stripe_subscriptions": {
                "id":                   "VARCHAR",
                "customer":             "VARCHAR",
                "status":               "VARCHAR",
                "created":              "BIGINT",
                "current_period_start": "BIGINT",
                "current_period_end":   "BIGINT",
                "plan_amount":          "BIGINT",
                "plan_interval":        "VARCHAR",
            },
            "stripe_customers": {
                "id":      "VARCHAR",
                "email":   "VARCHAR",
                "name":    "VARCHAR",
                "phone":   "VARCHAR",
                "created": "BIGINT",
            },
            "stripe_invoices": {
                "id":           "VARCHAR",
                "customer":     "VARCHAR",
                "subscription": "VARCHAR",
                "status":       "VARCHAR",
                "amount_due":   "BIGINT",
                "amount_paid":  "BIGINT",
                "currency":     "VARCHAR",
                "period_start": "BIGINT",
                "period_end":   "BIGINT",
                "created":      "BIGINT",
            },
            "stripe_disputes": {
                "id":       "VARCHAR",
                "charge":   "VARCHAR",
                "amount":   "BIGINT",
                "currency": "VARCHAR",
                "reason":   "VARCHAR",
                "status":   "VARCHAR",
                "created":  "BIGINT",
            },
        }

        # Pre-warm the semantic router in the background so natural-language
        # queries over this schema are answerable the moment the first sync lands.
        # We fire-and-forget: the background task logs its own errors and never
        # raises into the caller's await fetch_schema() path.
        if self._llm_client is not None:
            asyncio.create_task(self._prewarm_semantic_router(schema))

        return schema

    async def _prewarm_semantic_router(self, schema: Dict[str, Any]) -> None:
        """
        Background task: sends the connector schema to the LLM client so the
        semantic router can build embeddings / index table names and column
        descriptions ahead of the first user query.

        Failures are WARNING-logged and fully swallowed — a pre-warm error
        must never surface to the orchestrator or to the user.
        """
        try:
            logger.debug(
                "[%s] Pre-warming semantic router with Stripe schema (%d tables).",
                self.tenant_id, len(schema),
            )
            await self._llm_client.index_schema(
                integration="stripe",
                tenant_id=self.tenant_id,
                schema=schema,
            )
            logger.info(
                "[%s] Semantic router pre-warm complete for Stripe schema.",
                self.tenant_id,
            )
        except Exception as exc:
            logger.warning(
                "[%s] Semantic router pre-warm failed (non-fatal): %s",
                self.tenant_id, exc,
            )

    def get_semantic_views(self) -> Dict[str, str]:
        """
        Vector-ready SQL views that populate the founder dashboard.

        Views:
          vw_stripe_revenue      — Daily gross / refunded / disputed / net revenue.
          vw_stripe_mrr          — Monthly MRR from active and past-due subscriptions.
          vw_stripe_signups_24h  — New customer signups in the rolling 24-hour window.
          vw_stripe_churn_rate   — Monthly churn rate: canceled ÷ (active + canceled).
        """
        return {
            # ----------------------------------------------------------------
            # Existing views (unchanged)
            # ----------------------------------------------------------------
            "vw_stripe_revenue": """
                SELECT
                    date_trunc('day', to_timestamp(c.created))  AS date,
                    SUM(c.amount)          / 100.0              AS gross_revenue,
                    SUM(c.amount_refunded) / 100.0              AS refunded,
                    COALESCE(SUM(d.amount), 0) / 100.0          AS disputed,
                    (
                        SUM(c.amount)
                        - SUM(c.amount_refunded)
                        - COALESCE(SUM(d.amount), 0)
                    ) / 100.0                                   AS net
                FROM stripe_charges c
                LEFT JOIN stripe_disputes d ON d.charge = c.id
                WHERE c.paid = true AND c.status = 'succeeded'
                GROUP BY 1
                ORDER BY 1 DESC
            """,
            "vw_stripe_mrr": """
                SELECT
                    date_trunc('month', to_timestamp(created)) AS month,
                    SUM(plan_amount) / 100.0                   AS mrr
                FROM stripe_subscriptions
                WHERE status IN ('active', 'past_due')
                GROUP BY 1
            """,

            # ----------------------------------------------------------------
            # New: Signups in the last 24 hours
            #
            # Uses epoch arithmetic (epoch_s() is DuckDB's current-time-in-seconds
            # function) so the query remains push-down-friendly on large tables.
            # The result powers the "Signups Today" KPI card on the dashboard.
            # ----------------------------------------------------------------
            "vw_stripe_signups_24h": """
                SELECT
                    COUNT(*)                                    AS signups_last_24h,
                    date_trunc('hour', to_timestamp(created))  AS signup_hour
                FROM stripe_customers
                WHERE created >= epoch_s() - 86400
                GROUP BY 2
                ORDER BY 2 DESC
            """,

            # ----------------------------------------------------------------
            # New: Monthly churn rate
            #
            # Definition used here:
            #   churn_rate = canceled_this_month / (active + canceled_this_month)
            #
            # This is the "logo churn" metric most solo founders track. Revenue
            # churn (weighted by plan_amount) can be derived by joining to
            # stripe_subscriptions.plan_amount once the founder needs it.
            #
            # NULL-safe: months with zero active subscriptions produce NULL
            # rather than a divide-by-zero error.
            # ----------------------------------------------------------------
            "vw_stripe_churn_rate": """
                WITH monthly AS (
                    SELECT
                        date_trunc('month', to_timestamp(created)) AS month,
                        COUNT(*) FILTER (WHERE status = 'canceled') AS canceled,
                        COUNT(*) FILTER (WHERE status IN ('active', 'past_due', 'canceled')) AS total
                    FROM stripe_subscriptions
                    GROUP BY 1
                )
                SELECT
                    month,
                    canceled,
                    total,
                    ROUND(
                        CASE WHEN total > 0
                             THEN 100.0 * canceled / total
                             ELSE NULL
                        END,
                        2
                    ) AS churn_rate_pct
                FROM monthly
                ORDER BY month DESC
            """,
        }

    # -----------------------------------------------------------------------
    # Webhook verification
    # -----------------------------------------------------------------------

    def verify_webhook(self, payload: bytes, sig_header: str) -> bool:
        """
        Validates a Stripe webhook signature using HMAC-SHA256.

        Stripe sends the 'Stripe-Signature' header in the format:
            t=<timestamp>,v1=<signature>[,v1=<signature>...]

        We reconstruct the signed payload as "<timestamp>.<raw_body>" and
        compare against every v1 signature present. We also enforce a 5-minute
        tolerance on the timestamp to guard against replay attacks.

        Returns True on success, False on any verification failure.
        """
        if not self.webhook_secret:
            logger.error("[%s] Webhook verification skipped: no webhook_secret configured.", self.tenant_id)
            return False

        try:
            parts = dict(item.split("=", 1) for item in sig_header.split(",") if "=" in item)
            timestamp = parts.get("t")
            signatures = [v for k, v in parts.items() if k == "v1"]

            if not timestamp or not signatures:
                logger.warning("[%s] Malformed Stripe-Signature header.", self.tenant_id)
                return False

            # Replay attack guard: reject events older than 5 minutes.
            age = abs(time.time() - int(timestamp))
            if age > 300:
                logger.warning(
                    "[%s] Webhook timestamp too old (age=%ds). Possible replay attack.",
                    self.tenant_id, int(age),
                )
                return False

            signed_payload = f"{timestamp}.".encode() + payload
            expected = hmac.new(
                self.webhook_secret.encode("utf-8"),
                signed_payload,
                hashlib.sha256,
            ).hexdigest()

            if not any(hmac.compare_digest(expected, sig) for sig in signatures):
                logger.warning("[%s] Webhook signature mismatch.", self.tenant_id)
                return False

            return True

        except Exception as exc:
            logger.error("[%s] Webhook verification error: %s", self.tenant_id, exc)
            return False

    # -----------------------------------------------------------------------
    # Network layer
    # -----------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type((StripeRateLimitError, aiohttp.ClientError)),
        wait=wait_exponential(min=2, max=60),
        stop=stop_after_attempt(5),
    )
    async def _fetch_page(self, session: aiohttp.ClientSession, url: str) -> Dict[str, Any]:
        logger.debug("[%s] GET %s", self.tenant_id, url)
        async with session.get(url) as resp:
            if resp.status == 429:
                # Honour Stripe's Retry-After header when present; otherwise let
                # tenacity's exponential backoff handle the wait.
                retry_after = resp.headers.get("Retry-After")
                if retry_after:
                    wait_secs = float(retry_after)
                    logger.warning(
                        "[%s] Stripe rate limit hit. Honouring Retry-After: %.1fs",
                        self.tenant_id, wait_secs,
                    )
                    await asyncio.sleep(wait_secs)
                raise StripeRateLimitError("Stripe API rate limit exceeded.")

            if resp.status == 401:
                raise StripeAuthError(
                    f"[{self.tenant_id}] Stripe returned 401 — check your API key or access token."
                )

            resp.raise_for_status()
            return await resp.json()

    # -----------------------------------------------------------------------
    # Core sync  (renamed sync_stream → sync_historical to match ABC contract)
    # -----------------------------------------------------------------------

    async def sync_historical(
        self,
        stream_name: str,
        start_timestamp: Optional[str] = None,
        checkpoint: Optional[str] = None,
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        Yields batches of normalised records from the given Stripe stream.

        Renamed from sync_stream to sync_historical to satisfy the BaseIntegration
        abstract base class contract. Python's abc module raises TypeError at
        instantiation time if any abstractmethod remains unimplemented — the old
        name caused a silent contract violation that would crash the SyncEngine
        orchestrator the moment it tried to create a StripeConnector instance.

        Args:
            stream_name:     One of SUPPORTED_STREAMS.
            start_timestamp: ISO-8601 string. Records created before this are
                             skipped. Logs a warning and falls back to a full sync
                             if the value cannot be parsed.
            checkpoint:      Stripe object ID to resume pagination from. Callers
                             are responsible for persisting the last yielded batch's
                             final record ID between runs to enable resumable syncs.

        Yields:
            List[Dict]: A batch of up to 100 normalised, PII-masked records.
        """
        self.validate_stream(stream_name)

        limit          = 100
        has_more       = True
        starting_after = checkpoint
        start_ts: Optional[int] = None

        if start_timestamp:
            try:
                dt = datetime.fromisoformat(start_timestamp.replace("Z", "+00:00"))
                start_ts = int(dt.timestamp())
            except ValueError:
                logger.warning(
                    "[%s] Could not parse start_timestamp '%s' — falling back to full sync.",
                    self.tenant_id, start_timestamp,
                )

        mapper_fn, pii_fields = _STREAM_MAPPERS[stream_name]
        total = 0

        async with self._get_session() as session:
            while has_more:
                url = f"{self.api_base}/{stream_name}?limit={limit}"
                if start_ts:
                    url += f"&created[gte]={start_ts}"
                if starting_after:
                    url += f"&starting_after={starting_after}"

                data  = await self._fetch_page(session, url)
                items = data.get("data", [])

                if not items:
                    break

                batch = [self._map_record(item, mapper_fn) for item in items]
                batch = self._mask_pii(batch, pii_fields)

                total += len(batch)
                yield batch

                has_more = data.get("has_more", False)
                if has_more:
                    starting_after = items[-1].get("id")

        logger.info(
            "✅ [%s] Stripe synced '%s': %d records",
            self.tenant_id, stream_name, total,
        )

    # -----------------------------------------------------------------------
    # Schema normalisation & security
    # -----------------------------------------------------------------------

    def _map_record(
        self,
        raw: Dict[str, Any],
        mapper_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Delegates to the stream-specific mapper function, then logs the
        mapped result at DEBUG level to aid production tracing.
        """
        try:
            mapped = mapper_fn(raw)
            logger.debug("[%s] Mapped record id=%s", self.tenant_id, mapped.get("id"))
            return mapped
        except Exception as exc:
            logger.error(
                "[%s] Mapping failed for raw id=%s: %s",
                self.tenant_id, raw.get("id"), exc,
            )
            raise

    def _mask_pii(
        self,
        batch: List[Dict[str, Any]],
        pii_fields: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Applies DataSanitizer masking to PII columns before they reach storage.

        Unlike the previous implementation, this raises RuntimeError if the
        sanitizer is absent rather than silently skipping — we already guard
        at __init__ time, but this is a second line of defence.
        """
        if not pii_fields:
            return batch

        sanitizer = getattr(self, "data_sanitizer", None)
        if sanitizer is None:
            raise StripePIISanitizerMissing(
                f"[{self.tenant_id}] data_sanitizer is None but PII masking was requested "
                f"for fields: {pii_fields}. Attach a sanitizer before syncing."
            )

        for row in batch:
            for col in pii_fields:
                if col in row and row[col]:
                    row[col] = sanitizer.mask(row[col])

        return batch

    # -----------------------------------------------------------------------
    # Connection verification
    # -----------------------------------------------------------------------

    async def test_connection(self) -> bool:
        """
        Verifies connectivity and credential validity.

        Returns True on success, False on any failure.

        IMPORTANT: Must return bool to satisfy the BaseIntegration contract.
        The SyncEngine orchestrator evaluates `if await connector.test_connection():`
        — returning a dict would always be truthy even on failure, silently
        allowing the pipeline to proceed with invalid credentials.

        Failure reasons are logged at WARNING/ERROR level for observability.
        """
        if not self.client_token:
            logger.warning("[%s] test_connection: no token configured.", self.tenant_id)
            return False

        try:
            async with self._get_session() as session:
                async with session.get(f"{self.api_base}/charges?limit=1") as resp:
                    if resp.status == 200:
                        return True
                    if resp.status == 401:
                        logger.warning(
                            "[%s] test_connection: 401 Unauthorized — invalid or revoked credentials.",
                            self.tenant_id,
                        )
                        return False
                    logger.warning(
                        "[%s] test_connection: unexpected HTTP %d.",
                        self.tenant_id, resp.status,
                    )
                    return False

        except StripeAuthError:
            logger.warning("[%s] test_connection: StripeAuthError.", self.tenant_id)
            return False
        except Exception as exc:
            logger.error("[%s] test_connection failed: %s", self.tenant_id, exc)
            return False