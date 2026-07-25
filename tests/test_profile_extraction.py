from __future__ import annotations

from types import SimpleNamespace

from api.services.profile_extraction import ProfileExtractor


def _profile_payload() -> dict[str, object]:
    return {
        "company_name": "Arcli",
        "one_liner": "Find verified B2B buying intent in public conversations.",
        "target_audience": ["B2B SaaS founders"],
        "core_problem_solved": "Manual prospect research misses active buyer signals.",
        "key_value_propositions": ["Verified public buyer-intent matches"],
        "ideal_customer_pain_points": ["Finding qualified leads takes too long."],
        "search_terms": ["finding qualified leads", "B2B buyer intent"],
        "negative_keywords": ["consumer coupon hunting"],
    }


def test_deep_profile_extraction_generates_discovery_phrases_without_temperature() -> None:
    request: dict[str, object] = {}

    class FakeCompletions:
        def parse(self, **kwargs: object) -> SimpleNamespace:
            request.update(kwargs)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(parsed=_profile_payload()))]
            )

    quota_guard = SimpleNamespace(
        check_and_increment=lambda **_kwargs: SimpleNamespace(
            allowed=True,
            tenant_id="tenant-1",
            rejection_reason=None,
            current_count=1,
            limit=100,
            window_seconds=86_400,
        )
    )
    client = SimpleNamespace(beta=SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions())))

    profile = ProfileExtractor(client=client, quota_guard=quota_guard).extract_profile(
        "# Arcli\n\nFind B2B buyer intent before competitors.",
        tenant_id="tenant-1",
    )

    assert profile["search_terms"] == ["finding qualified leads", "B2B buyer intent"]
    assert "temperature" not in request
    assert request["messages"][0]["role"] == "developer"
