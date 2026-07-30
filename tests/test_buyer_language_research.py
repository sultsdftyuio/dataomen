"""Safety and bounded-work coverage for buyer-language research."""

from __future__ import annotations

from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from api.services.social import buyer_language_research as research
from api.services.social.models import DiscoveryQuery


TENANT_ID = "ff2a2bd0-7379-4a0e-a47e-3f430998d079"
PROFILE_ID = "6d50d075-9f07-4e8b-b38b-297c6e8bb381"
RUN_ID = "e7b9e545-7778-4808-a470-6375d7a9b759"


class _Result:
    def __init__(self, value: object | None = "evidence-id") -> None:
        self.value = value

    def scalar_one_or_none(self) -> object | None:
        return self.value


class _Connection:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, object]]] = []

    def execute(self, statement: object, params: dict[str, object]) -> _Result:
        self.calls.append((str(statement), params))
        return _Result()


class _Engine:
    def __init__(self, connection: _Connection) -> None:
        self.connection = connection

    def begin(self):
        return nullcontext(self.connection)


def _queries() -> list[DiscoveryQuery]:
    return [
        DiscoveryQuery(
            "buyer_pain",
            "losing customers because onboarding takes too long",
        ),
        DiscoveryQuery(
            "manual_workflow_frustration",
            "manually chasing onboarding tasks",
        ),
    ]


def test_research_evidence_is_direct_source_language_not_a_lead_inference() -> None:
    evidence = research.build_buyer_language_evidence(
        tenant_id=TENANT_ID,
        service_profile_id=PROFILE_ID,
        queries=_queries(),
        source_rows=[
            {
                "source": "hackernews",
                "source_post_id": "42",
                "title": "Onboarding failure",
                "body": "We are losing customers because onboarding takes too long.",
                "source_url": "https://news.ycombinator.com/item?id=42",
            },
            {
                "source": "hackernews",
                "source_post_id": "43",
                "body": "Students are manually chasing onboarding tasks for a class.",
            },
            {
                "source": "hackernews",
                "source_post_id": "44",
                "body": "A completely unrelated discussion.",
            },
        ],
        negative_keywords=["student"],
    )

    assert len(evidence) == 1
    item = evidence[0]
    assert item.source == "hackernews"
    assert item.evidence_excerpt.casefold() in item.source_text.casefold()
    assert item.metadata["research_only"] is True
    assert item.metadata["verifier_status"] == "not_run"
    assert item.source_url == "https://news.ycombinator.com/item?id=42"


def test_research_persistence_writes_accepted_evidence_only_to_isolated_table(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection()
    evidence = research.BuyerLanguageEvidence(
        source="hackernews",
        source_post_id="42",
        source_url="https://news.ycombinator.com/item?id=42",
        query_type="buyer_pain",
        query_phrase="losing customers because onboarding takes too long",
        title="Onboarding failure",
        source_text="We are losing customers because onboarding takes too long.",
        evidence_excerpt="losing customers because onboarding takes too long",
        observed_at=None,
        evidence_key="a" * 64,
        metadata={"research_only": True, "verifier_status": "not_run"},
    )
    monkeypatch.setattr(research, "_database_engine", lambda: _Engine(connection))
    monkeypatch.setattr(research, "_evidence_contract_is_ready", lambda _: True)

    persisted = research._persist_buyer_language_evidence(
        tenant_id=TENANT_ID,
        service_profile_id=PROFILE_ID,
        run_id=RUN_ID,
        evidence=[evidence],
    )

    assert persisted == 1
    statement, params = connection.calls[0]
    assert "public.discovery_evidence" in statement
    assert "evidence_excerpt" in statement
    assert "evidence_status" in statement
    assert "'accepted'" in statement
    assert "lead_matches" not in statement
    assert params["evidence_excerpt"] == evidence.evidence_excerpt


def test_research_feature_is_off_before_any_profile_or_source_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(research.BUYER_LANGUAGE_RESEARCH_FLAG, "false")
    monkeypatch.setattr(
        research,
        "_load_research_profile_and_queries",
        lambda *_: pytest.fail("disabled research must not load a profile"),
    )

    result = research.run_buyer_language_research(TENANT_ID, PROFILE_ID)

    assert result.status == "skipped"
    assert result.skip_reason == "feature_disabled"


def test_research_x_fallback_is_off_by_default_even_when_free_coverage_is_thin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ARCLI_BUYER_LANGUAGE_RESEARCH_X_ENABLED", raising=False)

    hits, refs, outcome, reason = research._search_x_once_if_explicitly_enabled(
        tenant_id=TENANT_ID,
        run_id=RUN_ID,
        queries=_queries(),
        lookback_hours=24,
        posts_per_query=5,
        plausible_hits=0,
        plausible_query_types=set(),
    )

    assert (hits, refs, outcome, reason) == (
        0,
        [],
        "disabled",
        "research_x_disabled_by_default",
    )


def test_enqueue_and_actor_use_the_separate_research_job(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from api.workers import actors

    monkeypatch.setenv(research.BUYER_LANGUAGE_RESEARCH_FLAG, "true")
    monkeypatch.setattr(research, "_claim_research_quota", lambda _: True)
    with (
        patch.object(actors, "_require_redis_broker") as configure_broker,
        patch.object(
            actors.process_buyer_language_research_job,
            "send",
            return_value=SimpleNamespace(message_id="research-message"),
        ) as send,
    ):
        message_id = research.enqueue_buyer_language_research_job(TENANT_ID, PROFILE_ID)

    assert message_id == "research-message"
    configure_broker.assert_called_once()
    send.assert_called_once_with(TENANT_ID, PROFILE_ID)

    completed = SimpleNamespace(
        status="completed",
        run_id=RUN_ID,
        evidence_persisted=2,
        source_failures=0,
        skip_reason=None,
    )
    monkeypatch.setattr(research, "run_buyer_language_research", lambda *_: completed)
    monkeypatch.setattr(actors, "_close_actor_openai_clients", lambda: None)

    actors.process_buyer_language_research_job.fn(TENANT_ID, PROFILE_ID)
