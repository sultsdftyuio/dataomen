from __future__ import annotations

from pathlib import Path


def test_buyer_language_research_contract_is_separate_and_tenant_scoped() -> None:
    contract = Path("scripts/buyer_language_research_contract.sql").read_text(encoding="utf-8")

    assert "ADD COLUMN IF NOT EXISTS run_kind TEXT" in contract
    assert "SET run_kind = 'opportunity_leads'" in contract
    assert "'buyer_language_research'" in contract
    assert "CREATE TABLE IF NOT EXISTS public.discovery_evidence" in contract
    assert "FOREIGN KEY (tenant_id, discovery_run_id)" in contract
    assert "FOREIGN KEY (tenant_id, service_profile_id)" in contract
    assert "uq_discovery_evidence_tenant_profile_key" in contract
    assert "research evidence requires a buyer_language_research discovery run" in contract
    assert "discovery run kind is immutable" in contract
    assert "research evidence identity and source material are immutable" in contract
    assert "evidence_status IN ('pending', 'accepted', 'rejected')" in contract
    assert "evidence_excerpt TEXT" in contract
    assert "position(evidence_excerpt IN source_text) > 0" in contract
    assert "evidence_status <> 'accepted' OR evidence_excerpt IS NOT NULL" in contract
    assert "ALTER TABLE public.discovery_evidence ENABLE ROW LEVEL SECURITY" in contract
    assert "CREATE POLICY discovery_evidence_select_tenant" in contract
    assert "REVOKE INSERT, UPDATE, DELETE ON TABLE public.discovery_evidence FROM authenticated" in contract
    assert "lead_match_id" not in contract
    assert "crm_webhook" not in contract


def test_buyer_language_research_contract_limits_evidence_to_typed_source_material() -> None:
    contract = Path("scripts/buyer_language_research_contract.sql").read_text(encoding="utf-8")

    for query_type in (
        "buyer_pain",
        "urgent_failure",
        "recommendation_request",
        "manual_workflow_frustration",
        "category_tool_search",
        "switching_trigger",
    ):
        assert f"'{query_type}'" in contract

    assert "evidence_key ~ '^[0-9a-f]{64}$'" in contract
    assert "char_length(source_text) BETWEEN 1 AND 16000" in contract
    assert "jsonb_typeof(metadata) = 'object'" in contract


def test_supabase_types_include_the_research_run_and_evidence_contract() -> None:
    database_types = Path("types/supabase.ts").read_text(encoding="utf-8")

    assert "discovery_runs:" in database_types
    assert "run_kind: string;" in database_types
    assert "discovery_evidence:" in database_types
    assert "discovery_run_id: string;" in database_types
    assert "evidence_excerpt: string | null;" in database_types
    assert "evidence_status: string;" in database_types
