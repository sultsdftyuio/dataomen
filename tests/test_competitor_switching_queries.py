from api.services.social.queries import public_source_search_queries
from api.services.verifier import ServiceProfile


def _profile() -> ServiceProfile:
    return ServiceProfile(
        company_name="Arcli",
        one_liner="Find verified buying signals from public conversations.",
        target_audience=["B2B founders"],
        core_problem_solved="Manual prospecting is noisy and time consuming.",
        key_value_propositions=["Explains why a public post is a relevant lead."],
        ideal_customer_pain_points=["Prospecting takes too much time."],
        competitor_terms=["OldCRM", "Spreadsheet tracker", "OldCRM"],
    )


def test_competitors_add_bounded_switching_queries_without_new_query_types() -> None:
    queries = public_source_search_queries(_profile())
    switching = [query.phrase for query in queries if query.query_type == "switching_trigger"]

    assert "switching from OldCRM" in switching
    assert "switching from Spreadsheet tracker" in switching
    assert all(query.query_type in {"buyer_pain", "urgent_failure", "recommendation_request", "manual_workflow_frustration", "category_tool_search", "switching_trigger"} for query in queries)
