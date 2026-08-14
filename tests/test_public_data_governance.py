"""Tests for public-source privacy controls and retention behavior."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from api.services.integrations.public_source import PublicSourcePost
from api.services.social import data_governance


def _post(*, body: str = "We need a better onboarding workflow.") -> PublicSourcePost:
    return PublicSourcePost(
        source="bluesky",
        source_post_id="at://did:plc:alice/app.bsky.feed.post/one",
        author_handle="alice.bsky.social",
        title="Looking for help",
        body=body,
        url="https://bsky.app/profile/alice.bsky.social/post/one",
        posted_at=datetime.now(timezone.utc),
    )


class PublicPostPreparationTests(unittest.TestCase):
    def test_direct_contact_details_are_redacted_before_storage(self) -> None:
        prepared = data_governance.prepare_public_post_for_storage(
            _post(body="Email alice@example.com or +1 415-555-0100 about onboarding.")
        )

        self.assertIsNotNone(prepared)
        assert prepared is not None
        self.assertNotIn("alice@example.com", prepared.body)
        self.assertNotIn("415-555-0100", prepared.body)
        self.assertIn("[email removed]", prepared.body)
        self.assertIn("[phone removed]", prepared.body)

    def test_explicit_sensitive_or_minor_content_is_excluded(self) -> None:
        self.assertIsNone(
            data_governance.prepare_public_post_for_storage(
                _post(body="I need therapy for my mental health.")
            )
        )
        self.assertIsNone(
            data_governance.prepare_public_post_for_storage(
                _post(body="This tool is for teenagers who need help.")
            )
        )

    def test_only_configured_supported_sources_are_allowed(self) -> None:
        with patch.dict(
            os.environ,
            {"ARCLI_PUBLIC_SOURCE_ALLOWLIST": "bluesky,unknown-provider"},
            clear=True,
        ):
            self.assertTrue(data_governance.public_source_is_allowed("bluesky"))
            self.assertFalse(data_governance.public_source_is_allowed("github"))
            self.assertFalse(data_governance.public_source_is_allowed("unknown-provider"))

    def test_suppression_lookup_is_off_until_the_schema_enforcement_is_enabled(self) -> None:
        post = _post()
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(data_governance.filter_approved_removals([post]), [post])

    def test_completed_removal_suppresses_a_matching_post_before_storage(self) -> None:
        post = _post()

        class FakeResult:
            def mappings(self):
                return [
                    {
                        "source": "bluesky",
                        "source_post_id": None,
                        "author_handle": None,
                        "source_url": post.url,
                    }
                ]

        class FakeConnection:
            def execute(self, _statement, _params):
                return FakeResult()

        class FakeConnect:
            def __enter__(self):
                return FakeConnection()

            def __exit__(self, *_args):
                return False

        class FakeEngine:
            def connect(self):
                return FakeConnect()

        with (
            patch.dict(os.environ, {"ARCLI_PUBLIC_DATA_GOVERNANCE_ENFORCEMENT": "true"}, clear=True),
            patch.object(data_governance, "_database_engine", return_value=FakeEngine()),
        ):
            self.assertEqual(data_governance.filter_approved_removals([post]), [])

    def test_storage_boundary_excludes_sensitive_content_without_a_database_call(self) -> None:
        from api.services.social import public_storage

        class UnexpectedClient:
            def table(self, _name):
                raise AssertionError("excluded content must not reach Supabase")

        original_client = public_storage._public_source_supabase_client
        public_storage._public_source_supabase_client = UnexpectedClient()
        try:
            with patch.dict(os.environ, {}, clear=True):
                inserted_ids = public_storage._persist_new_public_source_posts(
                    [_post(body="This is a product for minors.")],
                    batch_size=1,
                )
        finally:
            public_storage._public_source_supabase_client = original_client

        self.assertEqual(inserted_ids, [])


class PublicDataRetentionTests(unittest.TestCase):
    def test_retention_deletes_lead_snapshots_before_global_source_rows(self) -> None:
        calls: list[str] = []

        class FakeConnection:
            def execute(self, statement, _params):
                query = str(statement)
                calls.append(query)
                if "pg_try_advisory_xact_lock" in query:
                    return SimpleNamespace(scalar=lambda: True)
                if "DELETE FROM public.lead_matches" in query:
                    return SimpleNamespace(rowcount=3)
                if "DELETE FROM public.source_posts" in query:
                    return SimpleNamespace(rowcount=2)
                if "DELETE FROM public.discovery_evidence" in query:
                    return SimpleNamespace(rowcount=4)
                raise AssertionError(query)

        class FakeBegin:
            def __enter__(self):
                return FakeConnection()

            def __exit__(self, *_args):
                return False

        class FakeEngine:
            def begin(self):
                return FakeBegin()

        with patch.object(data_governance, "_database_engine", return_value=FakeEngine()):
            result = data_governance.run_public_data_retention()

        self.assertEqual(result.lead_matches_deleted, 3)
        self.assertEqual(result.source_posts_deleted, 2)
        self.assertEqual(result.discovery_evidence_deleted, 4)
        self.assertLess(
            next(index for index, query in enumerate(calls) if "DELETE FROM public.lead_matches" in query),
            next(index for index, query in enumerate(calls) if "DELETE FROM public.source_posts" in query),
        )

    def test_retention_skips_when_another_worker_holds_the_lock(self) -> None:
        class FakeConnection:
            def execute(self, statement, _params):
                self.assertIn("pg_try_advisory_xact_lock", str(statement))
                return SimpleNamespace(scalar=lambda: False)

            def assertIn(self, member, container):
                if member not in container:
                    raise AssertionError(f"{member!r} not found")

        class FakeBegin:
            def __enter__(self):
                return FakeConnection()

            def __exit__(self, *_args):
                return False

        class FakeEngine:
            def begin(self):
                return FakeBegin()

        with patch.object(data_governance, "_database_engine", return_value=FakeEngine()):
            result = data_governance.run_public_data_retention()

        self.assertTrue(result.skipped)


if __name__ == "__main__":
    unittest.main()
