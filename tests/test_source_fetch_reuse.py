"""One provider request per distinct search within a scan."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import api.services.social.additional_sources as additional_sources
from api.services.integrations.public_source import PublicSourcePost
from api.services.integrations.stackexchange_connector import StackExchangeConnector
from api.services.social.source_fetch_reuse import (
    SourceFetchReuse,
    reuses_provider_responses,
)


def _question(question_id: str, body: str) -> PublicSourcePost:
    return PublicSourcePost(
        source="stackexchange",
        source_post_id=f"softwarerecs:{question_id}",
        author_handle="asker",
        title=None,
        body=body,
        url=f"https://softwarerecs.stackexchange.com/questions/{question_id}",
        posted_at=datetime.now(timezone.utc),
        metadata={"community": "softwarerecs"},
    )


def test_only_the_compacting_sources_reuse_responses() -> None:
    assert reuses_provider_responses("stackexchange")
    assert reuses_provider_responses("GitHub")
    assert not reuses_provider_responses("bluesky")
    assert not reuses_provider_responses("lemmy")


def test_phrases_with_the_same_leading_terms_share_a_search_key() -> None:
    reuse = SourceFetchReuse()
    connector = StackExchangeConnector(site="softwarerecs")

    first = reuse.search_key("stackexchange", connector, "invoice approvals take forever")
    second = reuse.search_key("stackexchange", connector, "invoice approvals stuck in email")
    different_terms = reuse.search_key("stackexchange", connector, "month end close delayed")
    different_site = reuse.search_key(
        "stackexchange",
        StackExchangeConnector(site="stackoverflow"),
        "invoice approvals take forever",
    )

    assert first is not None and first == second
    assert different_terms != first
    assert different_site != first


def test_an_unfamiliar_connector_is_never_served_from_the_memo() -> None:
    reuse = SourceFetchReuse()

    assert reuse.search_key("bluesky", object(), "invoice approvals") is None
    assert reuse.search_key("stackexchange", object(), "invoice approvals") is None
    reuse.put(None, [object()])
    assert reuse.get(None) is None
    assert reuse.requests_saved == 0


def test_a_repeated_search_is_fetched_once_and_admitted_per_phrase() -> None:
    fetches: list[str] = []
    posts = [
        _question("1", "We need invoice approvals software, any recommendations?"),
    ]

    class FakeConnector(StackExchangeConnector):
        async def fetch_recent_posts(self, query, since_timestamp, limit=100, *, max_pages=None):
            fetches.append(query)
            return list(posts)

    reuse = SourceFetchReuse()
    with (
        patch.object(
            additional_sources,
            "_additional_public_source_connector",
            side_effect=lambda *_args, **_kwargs: FakeConnector(site="softwarerecs"),
        ),
        patch.object(
            additional_sources,
            "_governed_public_source_posts",
            side_effect=lambda governed: list(governed),
        ),
        patch.object(
            additional_sources,
            "_persist_new_public_source_posts",
            return_value=[],
        ),
    ):
        first = additional_sources.ingest_additional_public_source_posts(
            "stackexchange",
            "invoice approvals take forever",
            24,
            query_type="buyer_pain",
            fetch_reuse=reuse,
        )
        second = additional_sources.ingest_additional_public_source_posts(
            "stackexchange",
            "invoice approvals software recommendation",
            24,
            query_type="recommendation_request",
            fetch_reuse=reuse,
        )
        third = additional_sources.ingest_additional_public_source_posts(
            "stackexchange",
            "month end close delayed",
            24,
            query_type="urgent_failure",
            fetch_reuse=reuse,
        )

    # Two phrases reduce to "invoice approvals"; the third is a new search.
    assert fetches == ["invoice approvals take forever", "month end close delayed"]
    assert reuse.requests_saved == 1
    # Each phrase is still judged on its own against the shared response.
    assert first.hits_found == second.hits_found == third.hits_found == 1
    assert second.plausible_hits == 1
