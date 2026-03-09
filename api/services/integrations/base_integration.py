# api/services/integrations/base_integration.py

import abc
from typing import Dict, Any, List, AsyncGenerator
from pydantic import BaseModel, Field

class IntegrationConfig(BaseModel):
    """Strict typing for integration initialization to ensure tenant isolation."""
    tenant_id: str = Field(..., description="The Supabase tenant ID owning this integration.")
    integration_name: str = Field(..., description="e.g., 'stripe', 'shopify'")
    credentials: Dict[str, Any] = Field(default_factory=dict, description="OAuth tokens fetched securely from Vault.")

class BaseIntegration(abc.ABC):
    """
    The Abstract Base Class for all SaaS Zero-ETL connectors.
    Enforces strict modularity, type safety, and tenant isolation.
    """

    def __init__(self, config: IntegrationConfig):
        self.config = config
        self.tenant_id = config.tenant_id
        # The client is instantiated dynamically based on the provided credentials
        self.client = self._initialize_client()

    @abc.abstractmethod
    def _initialize_client(self) -> Any:
        """
        Initialize the specific API client (e.g., stripe.Client) 
        using self.config.credentials.
        """
        pass

    @abc.abstractmethod
    def get_oauth_url(self, redirect_uri: str) -> str:
        """Generate the strict OAuth consent URL with necessary analytical scopes."""
        pass

    @abc.abstractmethod
    def exchange_oauth_token(self, code: str) -> Dict[str, Any]:
        """Exchange the auth code for access/refresh tokens to store in Supabase Vault."""
        pass

    @abc.abstractmethod
    async def pull_historical_data(self, stream_name: str, start_timestamp: str) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """
        The Pull Pipeline (Polling).
        Must be an async generator yielding raw JSON batches to prevent memory bloat.
        These batches will be handed off to the Polars Normalizer.
        """
        pass

    @abc.abstractmethod
    async def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """
        The Push Pipeline Security (Webhooks).
        Cryptographically verify the payload before accepting it at the Edge.
        """
        pass

    @abc.abstractmethod
    def get_semantic_views(self) -> Dict[str, str]:
        """
        The 'Secret Sauce' Pre-Built Analytical Views.
        Returns a dictionary mapping view names to DuckDB SQL definitions.
        Example: {"vw_stripe_mrr": "SELECT sum(amount) FROM stripe_charges WHERE..."}
        This gets injected directly into semantic_router.py.
        """
        pass