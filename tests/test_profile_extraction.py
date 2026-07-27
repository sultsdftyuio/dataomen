from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from api.services.crawling import (
    PROFILE_EXTRACTION_CACHE_VERSION,
    _cached_service_profile_for_markdown,
    _profile_document,
    _service_profile_payload,
    _workspace_brain_profile_from_document,
)
from api.services.profile_extraction import (
    DISCOVERY_QUERY_TYPES,
    DiscoveryQueryRepair,
    ProfileExtractor,
    ServiceProfileDraft,
    ServiceProfileResponse,
)


def _discovery_queries() -> list[dict[str, str]]:
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


def _profile_payload() -> dict[str, object]:
    return {
        "company_name": "Ledgerflow",
        "one_liner": "Automate invoice approvals before month-end close is delayed.",
        "target_audience": ["Controllers at growing multi-entity businesses"],
        "core_problem_solved": "Invoice approvals stall in email and spreadsheets before month-end close.",
        "key_value_propositions": ["Route approvals and audit trails without spreadsheet chasing."],
        "ideal_customer_pain_points": ["Approvers delay invoices and block financial close."],
        "use_cases": ["Route invoices to the correct approver."],
        "buying_triggers": ["A delayed close exposes approval bottlenecks."],
        "urgency_signals": ["Late payments and delayed close create cash-flow risk."],
        "excluded_audiences": ["Solo freelancers managing a few invoices."],
        "best_fit_customers": ["Multi-entity finance teams with approval controls."],
        "bad_fit_customers": ["Teams without a recurring invoice workflow."],
        "discovery_queries": _discovery_queries(),
        "search_terms": ["legacy flat term that must be replaced"],
        "negative_keywords": ["personal budgeting"],
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
        "# Ledgerflow\n\nAutomate invoice approvals before month-end close is delayed.",
        tenant_id="tenant-1",
    )

    assert profile["search_terms"] == [
        query["phrase"] for query in _discovery_queries()
    ]
    assert [query["query_type"] for query in profile["discovery_queries"]] == list(
        DISCOVERY_QUERY_TYPES
    )
    assert "temperature" not in request
    assert request["max_completion_tokens"] == 1_400
    assert request["messages"][0]["role"] == "developer"
    assert "need more customers" in str(request["messages"][0]["content"])
    assert "more people signing up" in str(request["messages"][0]["content"])
    assert request["response_format"] is ServiceProfileResponse


def test_deep_profile_requires_all_typed_buyer_language_queries() -> None:
    payload = _profile_payload()
    payload["discovery_queries"] = _discovery_queries()[:-1]

    with pytest.raises(ValidationError, match="exactly one phrase"):
        ServiceProfileDraft.model_validate(payload)


def test_deep_profile_rejects_operator_language_in_discovery_query() -> None:
    payload = _profile_payload()
    payload["discovery_queries"] = [
        *(_discovery_queries()[:-1]),
        {"query_type": "switching_trigger", "phrase": "find qualified leads"},
    ]

    with pytest.raises(ValidationError, match="operator language"):
        ServiceProfileDraft.model_validate(payload)


@pytest.mark.parametrize(
    "phrase",
    [
        "I spend hours searching public posts for buyer problems",
        "Our keyword alerts keep sending irrelevant leads",
        "What tool can surface buyer pain posts",
        "I keep manually thread checking for prospects",
        "Quality-checked alerts from buyer-help discussions",
        "Switch to fit-checked prospect alerts",
        "We need more leads this month",
        "Our sales pipeline is empty",
    ],
)
def test_deep_profile_rejects_retrieval_mechanics_as_discovery_language(
    phrase: str,
) -> None:
    payload = _profile_payload()
    queries = _discovery_queries()
    queries[0] = {"query_type": "buyer_pain", "phrase": phrase}
    payload["discovery_queries"] = queries

    with pytest.raises(ValidationError, match="operator language"):
        ServiceProfileDraft.model_validate(payload)


def test_deep_profile_accepts_plain_customer_outcome_language() -> None:
    payload = _profile_payload()
    queries = _discovery_queries()
    queries[0] = {
        "query_type": "buyer_pain",
        "phrase": "not enough people signing up",
    }
    payload["discovery_queries"] = queries

    profile = ServiceProfileDraft.model_validate(payload)

    assert profile.discovery_queries[0].phrase == "not enough people signing up"


def test_deep_profile_rejects_discovery_query_extra_keys() -> None:
    payload = _profile_payload()
    malformed_queries = _discovery_queries()
    malformed_queries[0] = {
        "query_type": "buyer_pain",
        "phrase": "invoice approvals take forever",
        "rationale": "not part of the persisted contract",
    }
    payload["discovery_queries"] = malformed_queries

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ServiceProfileDraft.model_validate(payload)


def test_deep_profile_emits_a_closed_strict_schema_for_discovery_queries() -> None:
    from openai.lib._pydantic import to_strict_json_schema

    schema = to_strict_json_schema(ServiceProfileResponse)
    root_properties = schema["properties"]
    query_schema = schema["$defs"]["DiscoveryQuery"]

    assert "search_terms" not in root_properties
    assert set(schema["required"]) == set(root_properties)
    assert query_schema["additionalProperties"] is False
    assert set(query_schema["required"]) == {"query_type", "phrase"}
    assert query_schema["properties"]["query_type"]["enum"] == list(
        DISCOVERY_QUERY_TYPES
    )


def test_deep_profile_repairs_an_invalid_buyer_language_phrase_once() -> None:
    invalid_payload = _profile_payload()
    invalid_queries = _discovery_queries()
    invalid_queries[0] = {
        "query_type": "buyer_pain",
        "phrase": "find qualified leads",
    }
    invalid_payload["discovery_queries"] = invalid_queries
    repaired_payload = {"discovery_queries": _discovery_queries()}
    requests: list[dict[str, object]] = []

    class FakeCompletions:
        def parse(self, **kwargs: object) -> SimpleNamespace:
            requests.append(kwargs)
            parsed = invalid_payload if len(requests) == 1 else repaired_payload
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed))]
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
        "# Ledgerflow\n\nAutomate invoice approvals before month-end close is delayed.",
        tenant_id="tenant-1",
    )

    assert profile["discovery_queries"] == _discovery_queries()
    assert len(requests) == 2
    assert requests[1]["response_format"] is DiscoveryQueryRepair
    assert "repairing the discovery_queries" in str(
        requests[1]["messages"][0]["content"]
    ).lower()
    assert requests[1]["max_completion_tokens"] == 400


def test_deep_profile_requires_distinct_phrases_across_query_types() -> None:
    payload = _profile_payload()
    duplicate_queries = _discovery_queries()
    duplicate_queries[-1] = {
        "query_type": "switching_trigger",
        "phrase": "invoice approvals take forever",
    }
    payload["discovery_queries"] = duplicate_queries

    with pytest.raises(ValidationError, match="phrases must be distinct"):
        ServiceProfileDraft.model_validate(payload)


def test_profile_document_preserves_rich_matching_brief_fields() -> None:
    deep_profile = ServiceProfileDraft.model_validate(_profile_payload()).model_dump()

    document = _profile_document(deep_profile, "https://ledgerflow.example/")
    payload = _service_profile_payload(deep_profile, "https://ledgerflow.example/")

    assert document["use_cases"] == deep_profile["use_cases"]
    assert document["buying_triggers"] == deep_profile["buying_triggers"]
    assert document["urgency_signals"] == deep_profile["urgency_signals"]
    assert document["excluded_audiences"] == deep_profile["excluded_audiences"]
    assert document["best_fit_customers"] == deep_profile["best_fit_customers"]
    assert document["bad_fit_customers"] == deep_profile["bad_fit_customers"]
    assert document["discovery_queries"] == _discovery_queries()
    assert document["search_terms"] == [query["phrase"] for query in _discovery_queries()]
    assert payload["profile_json"]["discovery_queries"] == _discovery_queries()
    assert payload["urgency_signals"] == deep_profile["urgency_signals"]
    assert document["profile_extraction_cache_version"] == PROFILE_EXTRACTION_CACHE_VERSION


def test_profile_cache_rejects_a_previous_discovery_contract_version() -> None:
    deep_profile = ServiceProfileDraft.model_validate(_profile_payload()).model_dump()
    markdown_hash = "a" * 64
    stale_document = _profile_document(
        deep_profile,
        "https://ledgerflow.example/",
        crawl_markdown_sha256=markdown_hash,
    )
    stale_document["profile_extraction_cache_version"] = "discovery-intent-v5"

    class FakeResult:
        def mappings(self) -> list[dict[str, object]]:
            return [{"profile_json": stale_document}]

    class FakeConnection:
        def execute(self, *_args: object, **_kwargs: object) -> FakeResult:
            return FakeResult()

    cached = _cached_service_profile_for_markdown(
        FakeConnection(),
        tenant_id="tenant-1",
        website_url="https://ledgerflow.example/",
        crawl_markdown_sha256=markdown_hash,
        columns={"profile_json": {}, "website_url": {}, "updated_at": {}},
    )

    assert cached is None


def test_workspace_brain_keeps_legacy_cached_profile_usable_without_typed_queries() -> None:
    legacy = {
        "company_name": "Legacy ledger tool",
        "one_liner": "Keep invoice approvals moving.",
        "target_audience": ["Controllers"],
        "core_problem_solved": "Approvals stall before close.",
        "key_value_propositions": ["Approval routing"],
        "ideal_customer_pain_points": ["Delayed close"],
        "search_terms": ["invoice approval delays"],
        "negative_keywords": ["personal budgeting"],
    }

    profile = _workspace_brain_profile_from_document(
        legacy,
        "https://ledgerflow.example/",
    )

    assert profile["search_terms"] == ["invoice approval delays"]
    assert profile["discovery_queries"] == []
    assert profile["urgency_signals"] == []


def test_workspace_brain_preserves_rich_typed_cached_profile() -> None:
    deep_profile = ServiceProfileDraft.model_validate(_profile_payload()).model_dump()

    profile = _workspace_brain_profile_from_document(
        deep_profile,
        "https://ledgerflow.example/",
    )

    assert profile["use_cases"] == deep_profile["use_cases"]
    assert profile["buying_triggers"] == deep_profile["buying_triggers"]
    assert profile["urgency_signals"] == deep_profile["urgency_signals"]
    assert profile["discovery_queries"] == _discovery_queries()
    assert profile["search_terms"] == [query["phrase"] for query in _discovery_queries()]
