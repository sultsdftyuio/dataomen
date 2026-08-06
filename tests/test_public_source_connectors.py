"""Focused, network-free coverage for added public-source connector contracts."""

from __future__ import annotations

import asyncio
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from api.services.integrations.bluesky_connector import (
    BLUESKY_SEARCH_POSTS_URL,
    BlueskyConnector,
)
from api.services.integrations.github_connector import GitHubIssuesConnector
from api.services.integrations.lemmy_connector import (
    LEMMY_V4_SEARCH_URL,
    LemmyConnector,
)
from api.services.integrations.public_source import PublicSourcePost
from api.services.integrations.stackexchange_connector import StackExchangeConnector


class PublicSourceContractTests(unittest.TestCase):
    def test_shared_contract_normalizes_naive_timestamps_to_utc(self) -> None:
        post = PublicSourcePost(
            source="example",
            source_post_id="example-1",
            body="Need a better support workflow",
            url="https://example.test/posts/1",
            posted_at=datetime(2026, 7, 28, 12, 0, 0),
        )

        self.assertEqual(post.posted_at.tzinfo, timezone.utc)


class BlueskyConnectorTests(unittest.TestCase):
    def test_repairs_the_obsolete_public_appview_search_host(self) -> None:
        connector = BlueskyConnector(
            base_url="https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts"
        )

        self.assertEqual(
            connector.base_url,
            "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts",
        )

    def test_default_uses_the_live_appview_and_allows_an_override(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(BlueskyConnector().base_url, BLUESKY_SEARCH_POSTS_URL)
        with patch.dict(
            os.environ,
            {"ARCLI_BLUESKY_SEARCH_URL": "https://bsky.example/xrpc/search"},
            clear=True,
        ):
            self.assertEqual(
                BlueskyConnector().base_url,
                "https://bsky.example/xrpc/search",
            )

    def test_maps_public_post_to_permalink_and_language(self) -> None:
        post = BlueskyConnector._to_source_post(
            {
                "uri": "at://did:plc:alice/app.bsky.feed.post/3kabc",
                "author": {"handle": "alice.bsky.social", "did": "did:plc:alice"},
                "record": {
                    "text": "Our onboarding is still too manual. What should we use?",
                    "createdAt": "2026-07-28T09:00:00Z",
                },
                "langs": ["en"],
            },
            0,
        )

        self.assertIsNotNone(post)
        assert post is not None
        self.assertEqual(post.source, "bluesky")
        self.assertEqual(post.author_handle, "alice.bsky.social")
        self.assertEqual(
            post.url,
            "https://bsky.app/profile/did:plc:alice/post/3kabc",
        )
        self.assertEqual(post.language, "en")

    def test_cursor_pagination_is_bounded_and_passes_cursor_unchanged(self) -> None:
        connector = BlueskyConnector(max_pages=2, request_interval_seconds=0)
        first_page = {
            "posts": [
                {
                    "uri": "at://did:plc:one/app.bsky.feed.post/one",
                    "author": {"handle": "one.bsky.social"},
                    "record": {"text": "Need better customer onboarding", "createdAt": "2026-07-28T09:00:00Z"},
                }
            ],
            "cursor": "opaque-next-page",
        }
        second_page = {"posts": []}
        with patch.object(
            connector,
            "_fetch_page",
            AsyncMock(side_effect=[first_page, second_page]),
        ) as fetch_page:
            posts = asyncio.run(
                connector.fetch_recent_posts("customer onboarding", 0, limit=10)
            )

        self.assertEqual(len(posts), 1)
        self.assertEqual(fetch_page.await_count, 2)
        self.assertEqual(fetch_page.await_args_list[1].kwargs["cursor"], "opaque-next-page")

    def test_search_request_has_server_side_time_and_english_filters(self) -> None:
        connector = BlueskyConnector(request_interval_seconds=0)
        import api.services.integrations.bluesky_connector as module

        with patch.object(
            module,
            "fetch_json_with_retry",
            AsyncMock(return_value={"posts": []}),
        ) as request:
            asyncio.run(
                connector._fetch_page(
                    object(),
                    query="manual onboarding",
                    since_timestamp=1_700_000_000,
                    cursor=None,
                    page_size=25,
                    page=0,
                )
            )

        params = request.await_args.kwargs["params"]
        self.assertEqual(params["lang"], "en")
        self.assertEqual(params["since"], "2023-11-14T22:13:20Z")


class StackExchangeConnectorTests(unittest.TestCase):
    def test_maps_question_html_and_namespaces_question_id_by_site(self) -> None:
        post = StackExchangeConnector._to_source_post(
            {
                "question_id": 77,
                "title": "<b>How</b> do I reduce manual customer onboarding?",
                "body": "<p>We need a better workflow for new customers.</p>",
                "creation_date": 1_785_312_000,
                "link": "https://stackoverflow.com/questions/77/example",
                "owner": {"display_name": "Alice"},
            },
            0,
            "stackoverflow",
        )

        self.assertIsNotNone(post)
        assert post is not None
        self.assertEqual(post.source, "stackexchange")
        self.assertEqual(post.source_post_id, "stackoverflow:77")
        self.assertEqual(post.title, "How do I reduce manual customer onboarding?")
        self.assertEqual(post.body, "We need a better workflow for new customers.")

    def test_advanced_search_uses_server_side_time_and_body_filters(self) -> None:
        connector = StackExchangeConnector(
            site="stackoverflow",
            api_key="test-key",
            request_interval_seconds=0,
        )
        import api.services.integrations.stackexchange_connector as module

        with patch.object(
            module,
            "fetch_json_with_retry",
            AsyncMock(return_value={"items": []}),
        ) as request:
            asyncio.run(
                connector._fetch_page(
                    object(),
                    query="manual onboarding process",
                    since_timestamp=1_700_000_000,
                    page=1,
                    page_size=25,
                )
            )

        params = request.await_args.kwargs["params"]
        self.assertEqual(params["site"], "stackoverflow")
        self.assertEqual(params["fromdate"], "1700000000")
        self.assertEqual(params["filter"], "withbody")
        self.assertEqual(params["key"], "test-key")


class GitHubIssuesConnectorTests(unittest.TestCase):
    def test_anonymous_default_covers_every_activation_discovery_query(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            connector = GitHubIssuesConnector(token="")

        self.assertEqual(connector.requests_per_minute, 6)

    def test_query_scopes_to_recent_public_issues(self) -> None:
        query = GitHubIssuesConnector._search_query("manual customer onboarding", 1_700_000_000)

        self.assertIn('"manual customer onboarding"', query)
        self.assertIn("in:title,body", query)
        self.assertIn("is:issue", query)
        self.assertIn("is:public", query)
        self.assertIn("created:>=2023-11-14", query)

    def test_mapper_rejects_pull_requests_and_private_repositories(self) -> None:
        base_item = {
            "id": 123,
            "title": "Need a less manual onboarding workflow",
            "body": "Our team is losing trial users during setup.",
            "created_at": "2026-07-28T09:00:00Z",
            "html_url": "https://github.com/acme/project/issues/123",
            "user": {"login": "alice"},
        }
        valid_post = GitHubIssuesConnector._to_source_post(base_item, 0)
        self.assertIsNotNone(valid_post)
        assert valid_post is not None
        self.assertEqual(valid_post.source, "github")
        self.assertIn("trial users", valid_post.body)

        pull_request = dict(base_item, pull_request={"url": "https://api.github.com/pulls/123"})
        private_issue = dict(base_item, repository={"private": True})
        self.assertIsNone(GitHubIssuesConnector._to_source_post(pull_request, 0))
        self.assertIsNone(GitHubIssuesConnector._to_source_post(private_issue, 0))

    def test_anonymous_mode_has_a_lower_default_budget(self) -> None:
        env_updates = {
            "ARCLI_GITHUB_TOKEN": "",
            "GITHUB_TOKEN": "",
            "GH_TOKEN": "",
            "ARCLI_GITHUB_REQUESTS_PER_MINUTE": "",
            "ARCLI_GITHUB_ANONYMOUS_REQUESTS_PER_MINUTE": "5",
            "ARCLI_GITHUB_ANONYMOUS_MAX_PAGES": "1",
        }
        with patch.dict(os.environ, env_updates):
            connector = GitHubIssuesConnector(token="")

        self.assertEqual(connector.requests_per_minute, 5)
        self.assertEqual(connector.max_pages, 1)


class LemmyConnectorTests(unittest.TestCase):
    def test_maps_public_post_view_and_skips_nsfw_content(self) -> None:
        view = {
            "post": {
                "id": 42,
                "name": "How do I stop losing people during signup?",
                "body": "The whole process still depends on manual follow-up.",
                "published_at": "2026-07-28T09:00:00Z",
                "ap_id": "https://lemmy.world/post/42",
            },
            "creator": {"name": "alice"},
            "community": {"nsfw": False},
        }
        post = LemmyConnector._to_source_post(
            view,
            since_timestamp=0,
            source_root="https://lemmy.world",
        )

        self.assertIsNotNone(post)
        assert post is not None
        self.assertEqual(post.source, "lemmy")
        self.assertEqual(post.source_post_id, "post:https://lemmy.world/post/42")
        self.assertEqual(post.url, "https://lemmy.world/post/42")
        self.assertIn("manual follow-up", post.body)

        nsfw_view = dict(view, post=dict(view["post"], nsfw=True))
        self.assertIsNone(
            LemmyConnector._to_source_post(
                nsfw_view,
                since_timestamp=0,
                source_root="https://lemmy.world",
            )
        )

    def test_v3_default_uses_numeric_pages(self) -> None:
        connector = LemmyConnector(max_pages=2, request_interval_seconds=0)
        first_page = {
            "posts": [
                {
                    "post": {
                        "id": 1,
                        "name": "Need a better signup workflow",
                        "published": "2026-07-28T09:00:00Z",
                    },
                    "creator": {"name": "alice"},
                    "community": {},
                }
            ]
        }
        second_page = {"posts": []}
        with patch.object(
            connector,
            "_fetch_page",
            AsyncMock(side_effect=[first_page, second_page]),
        ) as fetch_page:
            posts = asyncio.run(
                connector.fetch_recent_posts("signup workflow", 0, limit=10)
            )

        self.assertEqual(len(posts), 1)
        self.assertEqual(fetch_page.await_count, 1)

        import api.services.integrations.lemmy_connector as module

        with patch.object(
            module,
            "fetch_json_with_retry",
            AsyncMock(return_value={"posts": []}),
        ) as request:
            asyncio.run(
                connector._fetch_page(
                    object(),
                    query="signup workflow",
                    since_timestamp=1_700_000_000,
                    page_cursor=None,
                    page_size=25,
                    page=1,
                )
            )

        params = request.await_args.kwargs["params"]
        self.assertEqual(params["q"], "signup workflow")
        self.assertEqual(params["type_"], "Posts")
        self.assertEqual(params["page"], "2")
        self.assertNotIn("search_term", params)
        self.assertEqual(request.await_args.kwargs["provider"], "lemmy-v3-search")

    def test_configured_v4_request_uses_search_term_and_opaque_cursor(self) -> None:
        connector = LemmyConnector(
            base_url=LEMMY_V4_SEARCH_URL,
            max_pages=2,
            request_interval_seconds=0,
        )
        first_page = {
            "posts": [
                {
                    "post": {
                        "id": 1,
                        "name": "Need a better signup workflow",
                        "published_at": "2026-07-28T09:00:00Z",
                    },
                    "creator": {"name": "alice"},
                    "community": {},
                }
            ],
            "next_page": "opaque-v4-cursor",
        }
        second_page = {"posts": []}
        with patch.object(
            connector,
            "_fetch_page",
            AsyncMock(side_effect=[first_page, second_page]),
        ) as fetch_page:
            posts = asyncio.run(
                connector.fetch_recent_posts("signup workflow", 0, limit=10)
            )

        self.assertEqual(len(posts), 1)
        self.assertEqual(fetch_page.await_args_list[1].kwargs["page_cursor"], "opaque-v4-cursor")

        import api.services.integrations.lemmy_connector as module

        with patch.object(
            module,
            "fetch_json_with_retry",
            AsyncMock(return_value={"posts": []}),
        ) as request:
            asyncio.run(
                connector._fetch_page(
                    object(),
                    query="signup workflow",
                    since_timestamp=1_700_000_000,
                    page_cursor="opaque-v4-cursor",
                    page_size=25,
                    page=1,
                )
            )

        params = request.await_args.kwargs["params"]
        self.assertEqual(params["search_term"], "signup workflow")
        self.assertEqual(params["type_"], "posts")
        self.assertEqual(params["page_cursor"], "opaque-v4-cursor")
        self.assertNotIn("q", params)

    def test_url_search_terms_are_rejected_before_requesting_lemmy(self) -> None:
        connector = LemmyConnector()

        with self.assertRaisesRegex(ValueError, "URL queries"):
            asyncio.run(connector.fetch_recent_posts("https://example.test", 0))


if __name__ == "__main__":
    unittest.main()
