"""Regression coverage for the browser-facing lead qualification guard."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_existing_workspace_guard_allows_only_verifier_confirmed_transitions() -> None:
    sql = (ROOT / "scripts" / "lead_match_qualification_guard.sql").read_text(
        encoding="utf-8"
    )

    assert "REVOKE INSERT, DELETE ON TABLE public.lead_matches FROM authenticated" in sql
    assert "ADD COLUMN IF NOT EXISTS source_post JSONB" in sql
    assert "ADD COLUMN IF NOT EXISTS source_post_data JSONB" in sql
    assert "ADD COLUMN IF NOT EXISTS source_post_json JSONB" in sql
    assert 'FOR UPDATE\n    TO authenticated' in sql
    assert "match_status IN ('ready_for_review', 'discovery_candidate')" in sql
    assert "match_status = 'qualified'" in sql
    assert "FOR ALL" not in sql


def test_fresh_rls_contract_uses_the_same_qualification_guard() -> None:
    sql = (ROOT / "scripts" / "RLS_updates.sql").read_text(encoding="utf-8")

    assert "GRANT SELECT, UPDATE ON TABLE public.lead_matches TO authenticated" in sql
    assert "REVOKE INSERT, DELETE ON TABLE public.lead_matches FROM authenticated" in sql
    assert "ADD COLUMN IF NOT EXISTS source_post JSONB" in sql
    assert 'CREATE POLICY "lead_matches_qualify_tenant"' in sql
    assert "match_status IN ('ready_for_review', 'discovery_candidate')" in sql
