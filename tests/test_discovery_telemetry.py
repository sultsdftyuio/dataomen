from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from pathlib import Path
from uuid import UUID

import pytest

from api.services.social import discovery_telemetry


TENANT_ID = "ff2a2bd0-7379-4a0e-a47e-3f430998d079"
PROFILE_ID = "6d50d075-9f07-4e8b-b38b-297c6e8bb381"


class _Result:
    def __init__(self, value: object | None = None) -> None:
        self.value = value

    def scalar_one_or_none(self) -> object | None:
        return self.value


class _Connection:
    def __init__(self, *, run_id: str | None = None, error: Exception | None = None) -> None:
        self.run_id = run_id
        self.error = error
        self.calls: list[tuple[str, dict[str, object]]] = []

    def execute(self, statement: object, params: dict[str, object]) -> _Result:
        if self.error:
            raise self.error
        self.calls.append((str(statement), params))
        return _Result(self.run_id)


class _Engine:
    def __init__(self, connection: _Connection) -> None:
        self.connection = connection

    @contextmanager
    def begin(self):
        yield self.connection


@pytest.fixture(autouse=True)
def _telemetry_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ARCLI_DISCOVERY_TELEMETRY_ENABLED", raising=False)
    monkeypatch.setattr(discovery_telemetry, "_telemetry_unavailable_until", 0.0)
    monkeypatch.setattr(discovery_telemetry, "_telemetry_last_warning_at", 0.0)


def test_create_discovery_run_scopes_profile_and_keeps_bounded_tenant_query_plan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected_run_id = "e7b9e545-7778-4808-a470-6375d7a9b759"
    connection = _Connection(run_id=expected_run_id)
    monkeypatch.setattr(discovery_telemetry, "_database_engine", lambda: _Engine(connection))

    result = discovery_telemetry.create_discovery_run(
        TENANT_ID,
        PROFILE_ID,
        {
            "queries": [
                {"query_type": "buyer_pain", "phrase": "I need more customers"},
                {"query_type": "switching_trigger", "phrase": "leaving our old tool"},
            ],
            "website_body": "this must not become telemetry",
        },
    )

    assert result == expected_run_id
    statement, params = connection.calls[0]
    assert "profile.tenant_id = :tenant_id" in statement
    # Opportunity telemetry remains compatible with deployments that have not
    # yet applied the optional buyer-language research migration.
    assert "run_kind" not in statement
    assert params["tenant_id"] == TENANT_ID
    assert params["service_profile_id"] == PROFILE_ID
    stored_plan = json.loads(str(params["query_plan"]))
    assert stored_plan["queries"] == [
        {"query_type": "buyer_pain", "phrase": "I need more customers"},
        {"query_type": "switching_trigger", "phrase": "leaving our old tool"},
    ]
    assert "website_body" not in stored_plan
    UUID(str(params["run_id"]))


def test_buyer_language_research_run_explicitly_uses_its_isolated_run_kind(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected_run_id = "e7b9e545-7778-4808-a470-6375d7a9b759"
    connection = _Connection(run_id=expected_run_id)
    monkeypatch.setattr(discovery_telemetry, "_database_engine", lambda: _Engine(connection))

    result = discovery_telemetry.create_buyer_language_research_run(
        TENANT_ID,
        PROFILE_ID,
        {"queries": [{"query_type": "buyer_pain", "phrase": "need more customers"}]},
    )

    assert result == expected_run_id
    statement, params = connection.calls[0]
    assert "run_kind" in statement
    assert params["run_kind"] == "buyer_language_research"


def test_discovery_event_hashes_query_and_scrubs_raw_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection()
    monkeypatch.setattr(discovery_telemetry, "_database_engine", lambda: _Engine(connection))
    run_id = "e7b9e545-7778-4808-a470-6375d7a9b759"
    query = "How can I get more customers quickly?"

    discovery_telemetry.record_discovery_event(
        run_id,
        TENANT_ID,
        "Hacker News",
        "buyer_pain",
        query,
        "search",
        "returned",
        {
            "candidate_count": 4,
            "query": query,
            "title": query,
            "reason": query,
            "error_type": "TimeoutError",
        },
    )

    statement, params = connection.calls[0]
    assert "run.tenant_id = :tenant_id" in statement
    assert "query" not in params
    assert params["query_hash"] == hashlib.sha256(query.casefold().encode("utf-8")).hexdigest()
    assert len(str(params["event_key"])) == 64
    details = json.loads(str(params["details"]))
    assert details["candidate_count"] == 4
    assert details["query"] == "[redacted]"
    assert details["title"] == "[redacted]"
    assert isinstance(details["reason"], dict)
    assert "How can I get more customers" not in str(params)


def test_completion_is_tenant_scoped_and_sanitizes_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection()
    monkeypatch.setattr(discovery_telemetry, "_database_engine", lambda: _Engine(connection))

    discovery_telemetry.complete_discovery_run(
        "e7b9e545-7778-4808-a470-6375d7a9b759",
        TENANT_ID,
        "partial",
        {"ready_for_review": 2, "source_post": "raw post must not persist"},
    )

    statement, params = connection.calls[0]
    assert "AND tenant_id = :tenant_id" in statement
    assert params["status"] == "partial"
    assert json.loads(str(params["summary"]))["source_post"] == "[redacted]"


def test_missing_contract_never_breaks_discovery_and_opens_a_short_circuit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection(error=RuntimeError('relation "discovery_runs" does not exist'))
    monkeypatch.setattr(discovery_telemetry, "_database_engine", lambda: _Engine(connection))

    assert discovery_telemetry.create_discovery_run(TENANT_ID, PROFILE_ID, {"queries": []}) is None
    assert discovery_telemetry._telemetry_unavailable_until > 0


def test_sql_contract_has_tenant_rls_composite_foreign_keys_and_event_hashes() -> None:
    contract = Path("scripts/prospect_intelligence_contract.sql").read_text(encoding="utf-8")

    assert "CREATE TABLE IF NOT EXISTS public.discovery_runs" in contract
    assert "CREATE TABLE IF NOT EXISTS public.discovery_run_events" in contract
    assert "CREATE TABLE IF NOT EXISTS public.lead_feedback" in contract
    assert "FOREIGN KEY (tenant_id, service_profile_id)" in contract
    assert "FOREIGN KEY (tenant_id, run_id)" in contract
    assert "FOREIGN KEY (tenant_id, lead_match_id)" in contract
    assert "ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY" in contract
    assert "ALTER TABLE public.discovery_run_events ENABLE ROW LEVEL SECURITY" in contract
    assert "ALTER TABLE public.lead_feedback ENABLE ROW LEVEL SECURITY" in contract
    assert "query_hash TEXT NOT NULL" in contract
    assert "event_key TEXT NOT NULL" in contract
    assert "ON CONFLICT (tenant_id, run_id, event_key) DO NOTHING" in Path(
        "api/services/social/discovery_telemetry.py"
    ).read_text(encoding="utf-8")
    assert "guard_discovery_run_tenant_scope" in contract
    assert "guard_lead_feedback_tenant_scope" in contract
    assert "user_id TEXT NOT NULL" in contract
    assert "useful_pain_not_now" in contract
    assert "'spam'" in contract
    assert "lead_feedback.user_id::TEXT = auth.uid()::TEXT" in contract
