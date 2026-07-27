from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

import api.services.service_profile_pass1 as pass1_module
from api.services.crawling import _profile_document
from api.services.service_profile_pass1 import (
    Pass1ProfileExtractor,
    Pass1ServiceProfile,
    _extract_hero_markdown,
    build_pass1_user_prompt,
    extract_pass1_service_profile,
)


def discovery_queries() -> list[dict[str, str]]:
    return [
        {
            "query_type": "buyer_pain",
            "phrase": "invoice approvals take forever",
        },
        {
            "query_type": "urgent_failure",
            "phrase": "month end close delayed",
        },
        {
            "query_type": "recommendation_request",
            "phrase": "best invoice approval software",
        },
        {
            "query_type": "manual_workflow_frustration",
            "phrase": "chasing approvals in spreadsheets",
        },
        {
            "query_type": "category_tool_search",
            "phrase": "accounts payable automation tool",
        },
        {
            "query_type": "switching_trigger",
            "phrase": "outgrown our approval workflow",
        },
    ]


def pass1_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "company_name": "Ledgerflow",
        "target_audience": "Controllers at multi-entity businesses with approval controls",
        "core_problem": "Invoice approvals stall in email and spreadsheets before month-end close.",
        "unique_value_prop": "Routes invoice approvals with an auditable workflow.",
        "use_cases": ["Route invoices to the right approver before payment due dates."],
        "pain_points": ["Approvers delay invoices and block month-end close."],
        "buying_triggers": ["A delayed close exposes approval bottlenecks."],
        "urgency_signals": ["Late payments and delayed close create cash-flow risk."],
        "discovery_queries": discovery_queries(),
        "search_terms": ["legacy flat value that will be derived"],
        "negative_keywords": ["personal budgeting"],
        "excluded_audiences": ["Solo freelancers managing a few invoices"],
        "best_fit_customers": ["Multi-entity finance teams with approval controls"],
        "bad_fit_customers": ["Teams without a recurring invoice workflow"],
        "confidence_notes": "Pass 1 Instant extraction complete. Pending Deep Async sync.",
    }
    payload.update(overrides)
    return payload


def test_pass1_profile_adapts_to_the_existing_deep_profile_contract() -> None:
    profile = Pass1ServiceProfile.model_validate(pass1_payload())

    payload = profile.as_service_profile_payload()

    assert payload["profile_stage"] == "pass1"
    assert payload["target_audience"] == [
        "Controllers at multi-entity businesses with approval controls"
    ]
    assert payload["core_problem_solved"] == profile.core_problem
    assert payload["key_value_propositions"] == [profile.unique_value_prop]
    assert payload["vector_seed"].startswith("Target audience:")

    document = _profile_document(payload, "https://arcli.example/")
    assert document["extraction_status"] == "pass1_complete"
    assert document["use_cases"] == profile.use_cases
    assert document["buying_triggers"] == profile.buying_triggers
    assert document["urgency_signals"] == profile.urgency_signals
    assert document["discovery_queries"] == discovery_queries()
    assert document["search_terms"] == profile.search_terms
    assert document["best_fit_customers"] == profile.best_fit_customers
    assert document["confidence_notes"] == profile.confidence_notes
    assert document["vector_seed"] == payload["vector_seed"]


def test_pass1_derives_flat_legacy_search_terms_from_typed_queries() -> None:
    profile = Pass1ServiceProfile.model_validate(pass1_payload())

    assert profile.search_terms == [query["phrase"] for query in discovery_queries()]
    assert [query["query_type"] for query in profile.discovery_queries] == [
        "buyer_pain",
        "urgent_failure",
        "recommendation_request",
        "manual_workflow_frustration",
        "category_tool_search",
        "switching_trigger",
    ]
    assert all(set(query) == {"query_type", "phrase"} for query in profile.discovery_queries)


def test_pass1_rejects_operator_language_in_discovery_queries() -> None:
    invalid_queries = discovery_queries()
    invalid_queries[0] = {
        "query_type": "buyer_pain",
        "phrase": "buyer intent signals",
    }

    with pytest.raises(ValidationError, match="operator language"):
        Pass1ServiceProfile.model_validate(
            pass1_payload(discovery_queries=invalid_queries)
        )


def test_pass1_rejects_constitutionally_generic_output() -> None:
    with pytest.raises(ValidationError, match="forbidden generic phrase"):
        Pass1ServiceProfile.model_validate(
            pass1_payload(unique_value_prop="Uses AI to help businesses grow.")
        )


def test_hero_parser_keeps_heading_and_top_message_without_scripts() -> None:
    hero = _extract_hero_markdown(
        """
        <html><head><title>Arcli</title><script>ignore this</script></head>
        <body><nav>Log in</nav><main><h1>Find B2B buying intent before competitors</h1>
        <p>Arcli verifies public social posts against your service profile.</p>
        <ul><li>Prioritize active pain signals</li></ul></main></body></html>
        """
    )

    assert "# Find B2B buying intent before competitors" in hero
    assert "Arcli verifies public social posts" in hero
    assert "ignore this" not in hero


def test_pass1_prompt_contains_the_url_and_delimited_hero_snippet() -> None:
    prompt = build_pass1_user_prompt("https://arcli.example/", "# Arcli")

    assert "Target URL: https://arcli.example/" in prompt
    assert "HOMEPAGE HERO MARKDOWN:\n---\n# Arcli\n---" in prompt


def test_pass1_prompt_requires_plain_buyer_outcomes_not_lead_jargon() -> None:
    assert "need more customers" in pass1_module.PASS1_SYSTEM_PROMPT
    assert "more people signing up" in pass1_module.PASS1_SYSTEM_PROMPT
    assert "sales pipeline" in pass1_module.PASS1_SYSTEM_PROMPT


def test_pass1_uses_the_model_default_temperature() -> None:
    request: dict[str, object] = {}

    class FakeCompletions:
        def create(self, **kwargs: object) -> SimpleNamespace:
            request.update(kwargs)
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(content=json.dumps(pass1_payload()))
                    )
                ]
            )

    client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))
    profile = Pass1ProfileExtractor(client=client).extract(
        website_url="https://arcli.example/",
        homepage_hero_snippet="# Arcli",
    )

    assert profile.company_name == "Ledgerflow"
    assert "temperature" not in request
    assert request["reasoning_effort"] == "minimal"
    assert request["max_completion_tokens"] == 1_000


def test_pass1_reports_truncation_details_when_no_json_is_returned() -> None:
    class FakeCompletions:
        def create(self, **_kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        finish_reason="length",
                        message=SimpleNamespace(content=None),
                    )
                ],
                usage=SimpleNamespace(
                    completion_tokens=400,
                    completion_tokens_details=SimpleNamespace(reasoning_tokens=400),
                ),
            )

    client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))

    with pytest.raises(
        RuntimeError,
        match=r"finish_reason=length, completion_tokens=400, reasoning_tokens=400",
    ):
        Pass1ProfileExtractor(client=client).extract(
            website_url="https://arcli.example/",
            homepage_hero_snippet="# Arcli",
        )


def test_pass1_keeps_a_valid_profile_that_finishes_just_after_latency_target(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeExtractor:
        def __init__(self, *, timeout_seconds: float) -> None:
            assert timeout_seconds == pytest.approx(4.4)

        def __enter__(self) -> "FakeExtractor":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def extract(self, **_kwargs: object) -> Pass1ServiceProfile:
            return Pass1ServiceProfile.model_validate(pass1_payload())

    monotonic_values = iter((100.0, 100.1, 104.6))
    monkeypatch.setenv("ARCLI_PASS1_TOTAL_TIMEOUT_SECONDS", "4.5")
    monkeypatch.setenv("ARCLI_PASS1_FETCH_TIMEOUT_SECONDS", "0.5")
    monkeypatch.setattr(
        pass1_module,
        "fetch_homepage_hero_markdown",
        lambda *_args, **_kwargs: ("https://arcli.example/", "# Arcli"),
    )
    monkeypatch.setattr(pass1_module, "Pass1ProfileExtractor", FakeExtractor)
    monkeypatch.setattr(pass1_module.time, "monotonic", lambda: next(monotonic_values))

    _url, _hero, profile, elapsed_ms = extract_pass1_service_profile("arcli.example")

    assert profile.company_name == "Ledgerflow"
    assert elapsed_ms > 4_500
