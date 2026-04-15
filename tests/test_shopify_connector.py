# tests/test_shopify_connector.py

import os
import json
import hmac
import hashlib
import base64
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any

from api.services.integrations.shopify_connector import (
    ShopifyConnector, 
    ShopifyPIIError, 
    _to_ms, 
    _extract_numeric_id
)

# -------------------------------------------------------------------------
# Mock Dependencies
# -------------------------------------------------------------------------

class MockSanitizer:
    """Mock implementation of the data sanitizer for PII masking tests."""
    def hash(self, value: str) -> str:
        return f"HASHED_{value}"

    def mask(self, value: str) -> str:
        return f"MASKED_{value}"

@pytest.fixture
def base_credentials() -> Dict[str, str]:
    return {
        "shop_url": "arcli-tech-demo.myshopify.com",
        "access_token": "shpat_mock_token_123"
    }

@pytest.fixture
def connector(base_credentials) -> ShopifyConnector:
    """Provides a fresh, isolated ShopifyConnector instance per test."""
    os.environ["SHOPIFY_CLIENT_SECRET"] = "super_secret_test_key"
    conn = ShopifyConnector(
        tenant_id="tenant_abc123",
        credentials=base_credentials,
        chunk_size=10
    )
    conn.data_sanitizer = MockSanitizer()
    return conn

# -------------------------------------------------------------------------
# Unit Tests: Webhooks & Auth
# -------------------------------------------------------------------------

def test_verify_webhook_valid(connector: ShopifyConnector):
    """Ensure webhook HMAC verification succeeds with correct signatures."""
    payload = b'{"order_id": 12345, "total": 50.0}'
    secret = os.environ["SHOPIFY_CLIENT_SECRET"].encode("utf-8")
    
    # Generate valid signature
    digest = hmac.new(secret, payload, hashlib.sha256).digest()
    valid_hmac = base64.b64encode(digest).decode("utf-8")
    
    assert connector.verify_webhook(payload, valid_hmac) is True

def test_verify_webhook_invalid(connector: ShopifyConnector):
    """Ensure webhook verification fails on signature mismatch."""
    payload = b'{"order_id": 12345, "total": 50.0}'
    invalid_hmac = base64.b64encode(b"wrong_signature").decode("utf-8")
    
    assert connector.verify_webhook(payload, invalid_hmac) is False


def test_verify_webhook_rejects_stale_proxy_timestamp(connector: ShopifyConnector):
    """Replay-protection: valid signature must still fail when proxy timestamp is stale."""
    payload = b'{"order_id": 12345, "total": 50.0}'
    secret = os.environ["SHOPIFY_CLIENT_SECRET"].encode("utf-8")
    digest = hmac.new(secret, payload, hashlib.sha256).digest()
    valid_hmac = base64.b64encode(digest).decode("utf-8")

    stale_ts = "1"
    assert connector.verify_webhook(payload, valid_hmac, timestamp_header=stale_ts) is False


def test_verify_webhook_accepts_valid_signature_when_timestamp_header_is_malformed(connector: ShopifyConnector):
    """Edge-case compatibility: malformed proxy timestamps do not bypass signature validation."""
    payload = b'{"order_id": 12345, "total": 50.0}'
    secret = os.environ["SHOPIFY_CLIENT_SECRET"].encode("utf-8")
    digest = hmac.new(secret, payload, hashlib.sha256).digest()
    valid_hmac = base64.b64encode(digest).decode("utf-8")

    assert connector.verify_webhook(payload, valid_hmac, timestamp_header="not-a-number") is True

# -------------------------------------------------------------------------
# Unit Tests: Deduplication & Checkpointing (v1.2 Logic)
# -------------------------------------------------------------------------

def test_extract_numeric_id():
    """Ensure reliable ID extraction for the tuple-based dedup."""
    assert _extract_numeric_id("gid://shopify/Order/12345") == 12345
    assert _extract_numeric_id("12345") == 12345
    assert _extract_numeric_id("") == 0
    assert _extract_numeric_id("invalid_string") == 0

def test_is_new_record(connector: ShopifyConnector):
    """Test the strict (updated_at_ms, id) tuple comparison for exactly-once delivery."""
    # Initialize checkpoint to Jan 1, 2024 + ID 1000
    base_iso = "2024-01-01T00:00:00Z"
    cp_ms = _to_ms(base_iso)
    
    connector._init_checkpoint_state({
        "updated_at": base_iso,
        "last_id": "gid://shopify/Order/1000"
    })

    # Older timestamp -> Should be ignored
    assert connector._is_new_record(cp_ms - 1000, "gid://shopify/Order/2000") is False
    
    # Exact same timestamp, older/equal ID -> Should be ignored
    assert connector._is_new_record(cp_ms, "gid://shopify/Order/999") is False
    assert connector._is_new_record(cp_ms, "gid://shopify/Order/1000") is False
    
    # Exact same timestamp, newer ID -> Should process (Tie-breaker logic)
    assert connector._is_new_record(cp_ms, "gid://shopify/Order/1001") is True
    
    # Newer timestamp -> Should process regardless of ID
    assert connector._is_new_record(cp_ms + 1000, "gid://shopify/Order/10") is True

# -------------------------------------------------------------------------
# Unit Tests: Flattening & Schema Guards
# -------------------------------------------------------------------------

def test_schema_guard_drops_invalid_nodes(connector: ShopifyConnector):
    """Ensure nodes missing required fields (e.g., id, updatedAt) are routed to DLQ."""
    valid_node = {"id": "1", "updatedAt": "2024-01-01T00:00:00Z"}
    invalid_node_missing_id = {"updatedAt": "2024-01-01T00:00:00Z"}
    invalid_node_missing_date = {"id": "1"}

    assert connector._validate_node_schema(valid_node, "orders") is True
    assert connector._validate_node_schema(invalid_node_missing_id, "orders") is False
    assert connector._validate_node_schema(invalid_node_missing_date, "orders") is False
    
    # Ensure DLQ metric incremented
    assert connector.sync_metrics["dlq_events"] == 2

def test_flatten_orders(connector: ShopifyConnector):
    """Test standard GraphQL node flattening for Orders."""
    raw_node = {
        "id": "gid://shopify/Order/98765",
        "createdAt": "2024-01-01T12:00:00Z",
        "updatedAt": "2024-01-01T12:05:00Z",
        "totalPriceSet": {"shopMoney": {"amount": "150.50", "currencyCode": "USD"}},
        "customer": {"id": "gid://shopify/Customer/111"}
    }
    
    flattened = connector._flatten(raw_node, "orders")
    
    assert len(flattened) == 1
    assert flattened[0]["id"] == "98765"
    assert flattened[0]["total_price"] == 150.50
    assert flattened[0]["currency"] == "USD"
    assert flattened[0]["customer_id"] == "111"
    assert flattened[0]["created_at"] == _to_ms("2024-01-01T12:00:00Z")

def test_pii_sanitization(connector: ShopifyConnector):
    """Ensure PII fields are hashed prior to batch emission."""
    batch = [{
        "id": "1",
        "email": "test@arcli.tech",
        "phone": "+1234567890",
        "total_spent": 500.0
    }]
    
    masked_batch = connector._mask_pii(batch)
    
    assert masked_batch[0]["email"] == "HASHED_test@arcli.tech"
    assert masked_batch[0]["phone"] == "HASHED_+1234567890"
    assert masked_batch[0]["total_spent"] == 500.0  # Non-PII untouched

# -------------------------------------------------------------------------
# Integration Tests: Async Generator Flow
# -------------------------------------------------------------------------

# tests/test_shopify_connector.py (Replace the bottom function)

@pytest.mark.asyncio
async def test_incremental_sync_pipeline(connector: ShopifyConnector):
    """Mock the HTTP network execution to test the full incremental extraction loop and metric tracking."""
    
    mock_graphql_response = {
        "data": {
            "orders": {
                "pageInfo": {"hasNextPage": False},
                "edges": [
                    {
                        "cursor": "cursor_1",
                        "node": {
                            "id": "gid://shopify/Order/1",
                            "createdAt": "2024-01-01T00:00:00Z",
                            "updatedAt": "2024-01-02T00:00:00Z",
                            "totalPriceSet": {"shopMoney": {"amount": "10.0"}},
                            "customer": {"id": "gid://shopify/Customer/99"}
                        }
                    }
                ]
            }
        },
        "extensions": {"cost": {"actualQueryCost": 5, "throttleStatus": {"currentlyAvailable": 1000}}}
    }

    # Create a mock HTTP Response object
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_graphql_response

    # FIX: Patch the raw HTTP POST request instead of our wrapper method.
    # This ensures `_execute_graphql` actually runs its internal business logic (like metric tracking).
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post, \
         patch.object(connector, '_should_use_bulk', return_value=False):
        
        mock_post.return_value = mock_resp
        
        # Run sync_historical
        batches = []
        async for batch in connector.sync_historical("orders"):
            batches.append(batch)

        assert len(batches) == 1
        payload = batches[0]
        
        # Verify exactly-once IDs and Op metadata
        record = payload["records"][0]
        assert record["id"] == "1"
        assert record["_meta"]["op"] == "upsert"
        assert record["_meta"]["schema_version"] == "v1.2"
        assert "_event_id" in record
        
        # Verify checkpoint advanced
        assert payload["checkpoint"]["last_id"] == "1"
        assert payload["checkpoint"]["updated_at"] == "2024-01-02T00:00:00Z"
        
        # Verify cost metric tracked (Now passes because _execute_graphql processed the mock natively)
        assert connector.sync_metrics["api_cost"] == 5

@pytest.mark.asyncio
async def test_missing_sanitizer_raises_error():
    """Ensure the connector refuses to run if PII could leak."""
    conn = ShopifyConnector(tenant_id="test", credentials={})
    # We do NOT attach a data_sanitizer
    
    with pytest.raises(ShopifyPIIError):
        async for _ in conn.sync_historical("customers"):
            pass