# tests/conftest.py

import os
import pytest
import duckdb
import pandas as pd
import numpy as np
from typing import Generator, AsyncGenerator
from unittest.mock import AsyncMock, patch, MagicMock

# -------------------------------------------------------------------------
# Environment Guardrails
# -------------------------------------------------------------------------
# Fail-safe: Ensure these are set BEFORE any application code is imported
# so we never accidentally leak or hit production infrastructure.
os.environ["ENVIRONMENT"] = "testing"
os.environ["SUPABASE_URL"] = "https://mock.supabase.arcli.tech"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "mock_service_key_do_not_use"
os.environ["SHOPIFY_CLIENT_SECRET"] = "super_secret_test_key"
os.environ["SHOPIFY_CLIENT_ID"] = "mock_client_id"
os.environ["DATA_VAULT_MASTER_KEY"] = "test_master_key_do_not_use"

# -------------------------------------------------------------------------
# Database & Analytical Engine Fixtures
# -------------------------------------------------------------------------

@pytest.fixture(scope="session")
def duckdb_conn() -> Generator[duckdb.DuckDBPyConnection, None, None]:
    """
    Provides a centralized, in-memory DuckDB connection.
    Methodology: Analytical Efficiency. 
    Moves data processing tests close to compute without touching DigitalOcean/Postgres.
    """
    # ':memory:' ensures the DB is purged after the test session
    conn = duckdb.connect(database=":memory:")
    
    # Pre-seed schema for integration testing
    conn.execute("""
        CREATE TABLE shopify_orders (
            id VARCHAR,
            created_at BIGINT,
            updated_at BIGINT,
            total_price DECIMAL(18,2),
            currency VARCHAR,
            customer_id VARCHAR,
            tenant_id VARCHAR
        )
    """)
    
    yield conn
    conn.close()

@pytest.fixture
def sample_vectorized_dataframe() -> pd.DataFrame:
    """
    Provides a computationally heavy, vectorized dataset for testing transformations.
    Methodology: Vectorization over Loops.
    Ensures our metrics logic is tested against contiguous memory blocks, not slow iterators.
    """
    dates = pd.date_range("2024-01-01", periods=10000, freq="h")
    df = pd.DataFrame({
        "timestamp": dates,
        "revenue": np.random.normal(100, 15, len(dates)),
        "orders_count": np.random.poisson(lam=5, size=len(dates)),
        "tenant_id": "tenant_abc123"
    })
    return df

# -------------------------------------------------------------------------
# Auth & Multi-Tenancy Fixtures
# -------------------------------------------------------------------------

@pytest.fixture
def mock_supabase_auth() -> Generator[MagicMock, None, None]:
    """
    Mocks the Supabase Auth client to ensure strict tenant isolation testing.
    Methodology: Security by Design.
    """
    with patch("utils.supabase.server.create_client") as mock_server_client, \
         patch("utils.supabase.client.create_client") as mock_browser_client:
        
        mock_instance = MagicMock()
        
        # Simulate a secure, authenticated tenant session
        mock_user = {
            "id": "tenant_abc123",
            "email": "admin@arcli.tech",
            "app_metadata": {"role": "admin"}
        }
        mock_instance.auth.get_user.return_value = {"data": {"user": mock_user}, "error": None}
        mock_instance.auth.get_session.return_value = {"data": {"session": {"access_token": "mock_jwt"}}, "error": None}
        
        mock_server_client.return_value = mock_instance
        mock_browser_client.return_value = mock_instance
        
        yield mock_instance

# -------------------------------------------------------------------------
# LLM & AI Orchestration Fixtures
# -------------------------------------------------------------------------

@pytest.fixture
def mock_llm_client() -> Generator[AsyncMock, None, None]:
    """
    Mocks the internal LLM client used by the Semantic Router and NL2SQL engine.
    Methodology: Contextual RAG testing without burning OpenAI/Anthropic tokens.
    """
    with patch("api.services.llm_client.LLMClient") as MockLLM:
        instance = MockLLM.return_value
        
        # Mock standard AI responses for predictable test assertions
        instance.generate_sql = AsyncMock(return_value="""
            SELECT DATE_TRUNC('day', to_timestamp(created_at / 1000)) AS day, SUM(total_price) 
            FROM shopify_orders 
            WHERE tenant_id = 'tenant_abc123' 
            GROUP BY 1 ORDER BY 1 DESC;
        """)
        
        instance.extract_intent = AsyncMock(return_value={
            "intent": "generate_chart",
            "entities": ["revenue", "last 30 days"]
        })
        
        instance.analyze_anomaly = AsyncMock(return_value="Spike detected due to Black Friday campaign.")
        
        yield instance

# -------------------------------------------------------------------------
# Webhook Context Fixtures (Cloudflare Workers / Vercel Edge)
# -------------------------------------------------------------------------

@pytest.fixture
def mock_webhook_request() -> MagicMock:
    """
    Simulates an incoming request from the Cloudflare Worker webhook catcher.
    """
    request = MagicMock()
    request.headers = {
        "X-Shopify-Hmac-Sha256": "mock_signature_hash",
        "X-Arcli-Gateway-Timestamp": "1704067200" # Proxy-injected timestamp from ShopifyConnector docs
    }
    request.body = AsyncMock(return_value=b'{"id": 99999, "total_price": "299.99"}')
    return request