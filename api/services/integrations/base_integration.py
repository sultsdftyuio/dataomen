"""
ARCLI.TECH - SaaS Integration Module
Core Architecture: Abstract Base Integration
Strategy: Strict Typing, Tenant Isolation, Zero-ETL Contracts, & Checkpointing
"""

import abc
import logging
from typing import Dict, Any, List, AsyncGenerator, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


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

    def __init__(self, config: IntegrationConfig, data_sanitizer: Optional[Any] = None):
        self.config = config
        self.tenant_id = config.tenant_id
        
        # Injected by the SyncEngine. Connectors use this to hash PII dynamically 
        # before yielding data chunks to standard storage.
        self.data_sanitizer = data_sanitizer

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