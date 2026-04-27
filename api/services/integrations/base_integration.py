"""
ARCLI.TECH - SaaS Integration Module
Core Architecture: Abstract Base Integration
Strategy: Strict Typing, Tenant Isolation, Zero-ETL Contracts, & Checkpointing

Changelog v1.1:
- [ADD] MAX_BATCH_BYTES: Byte-aware dynamic chunking constant to prevent OOM on large payloads.
- [ADD] IntegrationSchemaDriftError: Circuit breaker exception for DLQ velocity detection.
- [ADD] RawStorageSink: Bronze-tier cold storage interface for raw JSON archival before flatten().
"""

import abc
import io
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Dict, Any, List, AsyncGenerator, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class IntegrationSchemaDriftError(Exception):
    """
    Raised when the DLQ rate exceeds the safe threshold during a sync,
    indicating that the upstream API has changed its schema and the connector's
    flattening / validation logic is silently dropping too many records.
    """
    pass


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class IntegrationConfig(BaseModel):
    """
    Strict typing for integration initialization to ensure tenant isolation.
    Passed into the connector from the SyncEngine factory.
    """
    tenant_id: str = Field(..., description="The Supabase tenant ID owning this integration.")
    integration_name: str = Field(..., description="e.g., 'stripe', 'shopify', 'salesforce'")
    credentials: Dict[str, Any] = Field(
        default_factory=dict, 
        description="OAuth tokens or encrypted connection strings fetched securely from Vault."
    )


# ---------------------------------------------------------------------------
# Raw Storage Sink — Bronze Tier Cold Storage (Fix #5)
# ---------------------------------------------------------------------------

class RawStorageSink:
    """
    Asynchronous raw JSON archival sink for cold storage (S3 / Cloudflare R2).

    Writes raw, un-flattened JSON payloads to cheap object storage partitioned
    by tenant_id/integration/date/ before any transformation occurs. This
    provides a complete audit trail and enables "Replay from Cold Storage"
    if a bug is discovered in flattening logic — avoiding expensive re-fetches
    from third-party APIs.

    Production backends should subclass this and override write_raw() with
    their actual boto3/httpx S3 client. The default implementation logs the
    intent but does not persist (safe no-op for development).
    """

    def __init__(self, bucket: Optional[str] = None, prefix: str = "raw"):
        self.bucket = bucket
        self.prefix = prefix

    async def write_raw(
        self,
        tenant_id: str,
        integration_name: str,
        stream_name: str,
        raw_records: List[Dict[str, Any]],
    ) -> Optional[str]:
        """
        Persist raw JSON records to cold storage.

        Returns the object key if successful, None on failure (non-fatal).
        Partitioned as: {prefix}/{tenant_id}/{integration}/{date}/{timestamp}.jsonl
        """
        if not self.bucket:
            logger.debug(
                "[%s] RawStorageSink: no bucket configured — skipping cold write for %s/%s (%d records)",
                tenant_id, integration_name, stream_name, len(raw_records),
            )
            return None

        now = datetime.now(timezone.utc)
        partition_date = now.strftime("%Y-%m-%d")
        timestamp = now.strftime("%H%M%S_%f")
        object_key = (
            f"{self.prefix}/{tenant_id}/{integration_name}/{stream_name}"
            f"/date={partition_date}/{timestamp}.jsonl"
        )

        try:
            # Build NDJSON payload
            buffer = io.BytesIO()
            for record in raw_records:
                line = json.dumps(record, separators=(",", ":"), default=str)
                buffer.write(line.encode("utf-8"))
                buffer.write(b"\n")
            payload_bytes = buffer.getvalue()

            await self._put_object(object_key, payload_bytes)

            logger.info(
                "[%s] RawStorageSink: archived %d records (%d bytes) → %s",
                tenant_id, len(raw_records), len(payload_bytes), object_key,
            )
            return object_key

        except Exception as exc:
            # Cold storage writes are non-fatal — never block the sync pipeline
            logger.warning(
                "[%s] RawStorageSink: cold write failed (non-fatal): %s",
                tenant_id, exc,
            )
            return None

    async def _put_object(self, key: str, data: bytes) -> None:
        """
        Override this method in production subclasses with actual S3/R2 put_object.
        Default implementation is a safe no-op for development/testing.
        """
        logger.debug("RawStorageSink._put_object(%s, %d bytes) — no-op base impl", key, len(data))


# ---------------------------------------------------------------------------
# Byte-Aware Chunking Constants (Fix #1)
# ---------------------------------------------------------------------------

# Maximum memory footprint (in bytes) for a single in-flight batch.
# If the accumulated byte size exceeds this limit, the batch is flushed
# regardless of row count. This prevents OOM on SaaS payloads with highly
# variable row sizes (e.g., Shopify orders with 500 line items vs. 2).
MAX_BATCH_BYTES: int = 50 * 1024 * 1024  # 50 MB


def estimate_record_bytes(record: Any) -> int:
    """
    Fast approximation of in-memory size for a record.
    Uses sys.getsizeof on the str representation — intentionally cheap,
    erring on the side of overestimation to stay memory-safe.
    """
    return sys.getsizeof(str(record))


class BaseIntegration(abc.ABC):
    """
    The Abstract Base Class for all SaaS Zero-ETL connectors.
    Enforces strict modularity, type safety, and tenant isolation.
    Designed to handle diverse connection paradigms (OAuth vs. Direct DB) 
    and massive data volumes via async JSON chunking and checkpointing.
    """

    # Instructs the downstream DataSanitizer to cryptographically hash these fields.
    # Child classes should override this list.
    PII_COLUMNS: List[str] = []

    def __init__(self, config: IntegrationConfig, data_sanitizer: Optional[Any] = None, raw_storage_sink: Optional[RawStorageSink] = None):
        self.config = config
        self.tenant_id = config.tenant_id
        
        # Injected by the SyncEngine. Connectors use this to hash PII dynamically 
        # before yielding data chunks to standard storage.
        self.data_sanitizer = data_sanitizer

        # Fix #5: Optional cold storage sink for raw JSON archival.
        # When configured, connectors dump raw un-flattened payloads to S3/R2
        # before transformation, enabling "Replay from Cold Storage" recovery.
        self.raw_storage_sink = raw_storage_sink

    # -------------------------------------------------------------------------
    # Core Abstract Methods (MUST be implemented by all connectors)
    # -------------------------------------------------------------------------

    @abc.abstractmethod
    async def fetch_schema(self) -> Dict[str, Any]:
        """
        The Schema Contract.
        Introspects the source system to fetch available schemas, custom objects, or tables.
        
        MUST return a dictionary mapping fields to strict DuckDB types to guarantee
        Parquet chunk compatibility in the SyncEngine.
        
        Example:
        {
            "stripe_charges": {
                "id": "VARCHAR",
                "amount": "BIGINT",
                "created": "BIGINT"
            }
        }
        """
        pass

    @abc.abstractmethod
    async def sync_historical(
        self, 
        stream_name: str, 
        start_timestamp: Optional[str] = None,
        checkpoint: Optional[str] = None
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Batch / Stream).
        MUST be an async generator yielding raw JSON/Dict batches to prevent memory bloat (OOM).
        These batches are handed off to the Polars Normalizer and stored as chunked Parquet in R2/S3.
        
        :param stream_name: The API endpoint or Object name to pull (e.g., 'orders', 'Account')
        :param start_timestamp: ISO 8601 string to restrict historical pulls (Time-Travel)
        :param checkpoint: Cursor or timestamp from the last successful sync to resume operations.
        """
        pass

    # -------------------------------------------------------------------------
    # Checkpointing (Incremental Sync Resilience)
    # -------------------------------------------------------------------------

    async def get_checkpoint(self, stream_key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves the last successful sync state (cursor or timestamp) for this stream.
        Default implementation returns None. Orchestrator/SyncEngine should override this
        behavior or inject a state manager if using persistent databases like Redis/Postgres.
        """
        return None

    async def set_checkpoint(self, stream_key: str, state: Dict[str, Any]) -> None:
        """
        Persists the current sync state to the orchestrator/DB to allow safe resumes 
        after transient failures.
        """
        pass

    # -------------------------------------------------------------------------
    # Optional Interfaces (Override only if the connector supports them)
    # -------------------------------------------------------------------------

    async def test_connection(self) -> bool:
        """
        Fast validation to ensure credentials haven't been revoked.
        Returns True by default if not implemented.
        """
        return True

    def get_oauth_url(self, redirect_uri: str) -> Optional[str]:
        """
        Generate the strict OAuth consent URL with necessary analytical scopes.
        Raises NotImplementedError for non-OAuth integrations (e.g., Direct DBs).
        """
        raise NotImplementedError(f"{self.config.integration_name} does not support OAuth consent flows.")

    async def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """
        Exchange the auth code for access/refresh tokens to store in Supabase Vault.
        """
        raise NotImplementedError(f"{self.config.integration_name} does not support OAuth token exchange.")

    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """
        The Push Pipeline Security (Webhooks).
        Cryptographically verify the payload before accepting it at the Edge.
        """
        logger.warning(f"[{self.tenant_id}] Webhook signature verification not implemented for {self.config.integration_name}.")
        return False

    def get_semantic_views(self) -> Dict[str, str]:
        """
        The 'Secret Sauce' Pre-Built Analytical Views.
        Returns a dictionary mapping view names to DuckDB SQL definitions.
        Example: {"vw_stripe_mrr": "SELECT sum(amount)/100.0 FROM stripe_subscriptions WHERE..."}
        
        This gets injected directly into the semantic_router to prevent LLM hallucination 
        on complex business logic and provide instant Contextual RAG.
        """
        return {}