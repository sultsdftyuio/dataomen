from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_event_ingestion_contract_preserves_active_schema_and_deduplication():
    service = _read("api/services/ingestion_service.py")
    contract = _read("scripts/event_ingestion_compat.sql")

    assert '"properties": safe_properties' in service
    assert "ADD COLUMN IF NOT EXISTS properties JSONB" in contract
    assert "CREATE UNIQUE INDEX uq_events_tenant_idempotency_key" in contract
    assert "GROUP BY tenant_id, idempotency_key" in contract


def test_recovery_unsubscribe_contract_preserves_the_retained_route():
    route = _read("app/api/recovery/unsubscribe/route.ts")
    baseline = _read("scripts/functions0.sql")
    contract = _read("scripts/recovery_unsubscribe_compat.sql")

    assert '.from("recovery_emails")' in route
    assert '.from("recovery_suppressions")' in route
    assert "CREATE TABLE IF NOT EXISTS recovery_emails" in baseline
    assert "CREATE TABLE IF NOT EXISTS recovery_suppressions" in baseline
    assert "ADD COLUMN IF NOT EXISTS last_error TEXT" in contract


def test_stripe_contract_remains_while_connect_callback_uses_its_rpc():
    route = _read("app/api/integrations/stripe/callback/route.ts")
    contract = _read("scripts/stripe.sql")

    assert 'rpc("upsert_stripe_integration"' in route
    assert "CREATE OR REPLACE FUNCTION upsert_stripe_integration" in contract
