"""Regression coverage for the move-only social-ingestion module split."""

from __future__ import annotations

from unittest.mock import patch


def test_facade_reexports_the_extracted_implementation_functions() -> None:
    import api.services.social_ingestion as ingestion
    from api.services.social import activation, public_matching

    assert ingestion.ingest_hn_posts is activation.ingest_hn_posts
    assert (
        ingestion.process_public_source_post_embedding
        is public_matching.process_public_source_post_embedding
    )
    assert ingestion._profile_discovery_queries is not None
    assert ingestion._fetch_x_posts is not None


def test_legacy_facade_patch_seams_reach_every_split_module() -> None:
    import api.services.social_ingestion as ingestion
    from api.services.social import activation, public_matching, public_storage

    fake_client = object()

    def fake_database_engine() -> object:
        return object()

    with patch.object(ingestion, "_public_source_supabase_client", fake_client):
        assert public_storage._public_source_supabase_client is fake_client

    with patch.object(ingestion, "_database_engine", fake_database_engine):
        assert activation._database_engine is fake_database_engine
        assert public_matching._database_engine is fake_database_engine


def test_wildcard_exports_stay_public_while_private_helpers_remain_directly_available() -> None:
    import api.services.social_ingestion as ingestion

    assert "ingest_hn_posts" in ingestion.__all__
    assert "_fetch_x_posts" not in ingestion.__all__
    assert callable(ingestion._fetch_x_posts)
