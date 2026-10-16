import pytest

from api.services.social.queries import public_source_search_queries
from api.services.verifier import ServiceProfile


def _profile(competitors: list[str]) -> ServiceProfile:
    return ServiceProfile(
        company_name="Arcli",
        one_liner="Find verified buying signals from public conversations.",
        target_audience=["B2B founders"],
        core_problem_solved="Manual prospecting is noisy and time consuming.",
        key_value_propositions=["Explains why a public post is a relevant lead."],
        ideal_customer_pain_points=["Prospecting takes too much time."],
        competitor_terms=competitors,
    )


def _switching_phrases(competitors: list[str]) -> list[str]:
    return [
        query.phrase
        for query in public_source_search_queries(_profile(competitors))
        if query.query_type == "switching_trigger"
    ]


@pytest.fixture(autouse=True)
def _default_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ARCLI_COMPETITOR_SWITCH_QUERY_LIMIT", raising=False)


def test_competitors_add_bounded_switching_queries_without_new_query_types() -> None:
    queries = public_source_search_queries(
        _profile(["OldCRM", "Spreadsheet tracker", "OldCRM"])
    )
    switching = [query.phrase for query in queries if query.query_type == "switching_trigger"]

    assert "switching from OldCRM" in switching
    assert "switching from Spreadsheet tracker" in switching
    assert all(query.query_type in {"buyer_pain", "urgent_failure", "recommendation_request", "manual_workflow_frustration", "category_tool_search", "switching_trigger"} for query in queries)


def test_each_competitor_gets_its_alternative_search_before_any_second_phrasing() -> None:
    phrases = _switching_phrases(["Sentry", "Datadog", "New Relic", "Rollbar", "Bugsnag"])

    # The default budget of four covers four competitors once rather than two twice.
    assert phrases[-4:] == [
        "Sentry alternative",
        "Datadog alternative",
        "New Relic alternative",
        "Rollbar alternative",
    ]


def test_a_short_list_uses_the_budget_for_both_phrasings() -> None:
    assert _switching_phrases(["Sentry", "Datadog"])[-4:] == [
        "Sentry alternative",
        "Datadog alternative",
        "switching from Sentry",
        "switching from Datadog",
    ]


def test_limit_can_be_lowered(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ARCLI_COMPETITOR_SWITCH_QUERY_LIMIT", "1")
    assert [p for p in _switching_phrases(["Sentry", "Datadog"]) if "Sentry" in p or "Datadog" in p] == [
        "Sentry alternative"
    ]
