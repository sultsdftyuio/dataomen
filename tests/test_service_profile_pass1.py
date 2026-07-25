from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from api.services.crawling import _profile_document
from api.services.service_profile_pass1 import (
    Pass1ProfileExtractor,
    Pass1ServiceProfile,
    _extract_hero_markdown,
    build_pass1_user_prompt,
)


def pass1_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "company_name": "Arcli",
        "target_audience": "B2B SaaS founders with $10k-$100k MRR using Stripe",
        "core_problem": "They cannot identify pre-cancellation churn intent in public buyer discussions.",
        "unique_value_prop": "Semantic matching and LLM intent verification on public social posts.",
        "use_cases": ["Prioritise cancellation-risk posts for founder follow-up."],
        "pain_points": ["Manual prospect research misses time-sensitive purchase signals."],
        "buying_triggers": ["A founder asks how to catch churn before a cancellation."],
        "search_terms": ["manual prospect research", "finding buyer intent"],
        "negative_keywords": ["consumer coupon hunting"],
        "excluded_audiences": ["B2C ecommerce stores without recurring revenue"],
        "best_fit_customers": ["Founders selling recurring B2B software"],
        "bad_fit_customers": ["One-time project agencies"],
        "confidence_notes": "Pass 1 Instant extraction complete. Pending Deep Async sync.",
    }
    payload.update(overrides)
    return payload


def test_pass1_profile_adapts_to_the_existing_deep_profile_contract() -> None:
    profile = Pass1ServiceProfile.model_validate(pass1_payload())

    payload = profile.as_service_profile_payload()

    assert payload["profile_stage"] == "pass1"
    assert payload["target_audience"] == [
        "B2B SaaS founders with $10k-$100k MRR using Stripe"
    ]
    assert payload["core_problem_solved"] == profile.core_problem
    assert payload["key_value_propositions"] == [profile.unique_value_prop]
    assert payload["vector_seed"].startswith("Target audience:")

    document = _profile_document(payload, "https://arcli.example/")
    assert document["extraction_status"] == "pass1_complete"
    assert document["use_cases"] == profile.use_cases
    assert document["buying_triggers"] == profile.buying_triggers
    assert document["search_terms"] == profile.search_terms
    assert document["best_fit_customers"] == profile.best_fit_customers
    assert document["confidence_notes"] == profile.confidence_notes
    assert document["vector_seed"] == payload["vector_seed"]


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

    assert profile.company_name == "Arcli"
    assert "temperature" not in request
    assert request["reasoning_effort"] == "minimal"
    assert request["max_completion_tokens"] == 800


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
