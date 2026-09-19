from __future__ import annotations

from unittest.mock import patch

from api.services.integrations.github_connector import GitHubIssuesConnector
from api.services.social.fast_check import _source_result_for_additional_source
from api.services.social.models import PublicSourcePostRef


def test_github_connector_uses_a_repository_as_a_source_native_boundary() -> None:
    connector = GitHubIssuesConnector(repository="Acme/Telemetry")

    query = connector._search_query("need better observability", 1_700_000_000, repository=connector.repository)

    assert "repo:acme/telemetry" in query


def test_fast_check_passes_a_selected_repository_to_the_connector() -> None:
    result = type(
        "Result",
        (),
        {
            "hits_found": 1,
            "plausible_hits": 1,
            "inserted_count": 1,
            "matchable_source_post_refs": [PublicSourcePostRef("github", "1")],
        },
    )()
    with (
        patch("api.services.social_ingestion.additional_public_source_cache_scope", return_value="scope"),
        patch("api.services.social_ingestion.claim_additional_public_source_query", return_value=True),
        patch("api.services.social_ingestion.ingest_additional_public_source_posts", return_value=result) as ingest,
    ):
        fast_result = _source_result_for_additional_source(
            "github",
            [{"query_type": "buyer_pain", "phrase": "need observability"}],
            since_hours_ago=24,
            posts_per_query=10,
            community_selectors=("acme/telemetry",),
        )

    assert fast_result.hits_found == 1
    assert ingest.call_args.kwargs["community_selector"] == "acme/telemetry"
