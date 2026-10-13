"""Coverage for matching a batch of cached public posts to Watchlists."""

from __future__ import annotations

from contextlib import nullcontext
from unittest.mock import patch

import pytest

from api.services import watchlist_matching
from api.services.embeddings import normalize_embedding_text
from api.services.social import public_records
from api.services.social.models import SOURCE_POST_EMBEDDING_CACHE_KEY, _sha256_text

EMBEDDING_MODEL = "test-embedding-model"
VECTOR = [1.0, 0.0]
REFS = [("hackernews", "hn-1"), ("hackernews", "hn-2"), ("hackernews", "hn-3")]
ZERO_COUNTS = {"candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}


class CountingEngine:
    def __init__(self) -> None:
        self.transactions = 0

    def begin(self):
        self.transactions += 1
        return nullcontext(object())


class FakeEmbeddingService:
    model = EMBEDDING_MODEL

    def close(self) -> None:
        return None


def _cached_row(external_id: str, *, cached: bool = True) -> dict[str, object]:
    row: dict[str, object] = {
        "id": f"row-{external_id}",
        "source": "hackernews",
        "source_post_id": external_id,
        "title": "Trial signups dropped",
        "body": f"Our trial signups dropped this week ({external_id}).",
        "url": f"https://news.ycombinator.com/item?id={external_id}",
        "metadata": {},
    }
    if cached:
        post = public_records._public_source_post_as_social_post(row)
        assert post is not None
        row["metadata"] = {
            SOURCE_POST_EMBEDDING_CACHE_KEY: {
                "model": EMBEDDING_MODEL,
                "text_sha256": _sha256_text(
                    normalize_embedding_text(post.matching_text[:32_000])
                ),
                "embedding": VECTOR,
            }
        }
    return row


def _load_rows(_conn, source_post_id, *, source=None):
    return [_cached_row(source_post_id)]


def test_a_batch_reads_watchlists_and_prepares_briefs_once() -> None:
    engine = CountingEngine()
    contexts = [object()]
    watchlists = [{"id": "watchlist-1"}]

    with (
        patch.object(watchlist_matching, "_database_engine", return_value=engine),
        patch.object(
            watchlist_matching,
            "_load_active_watchlist_rows",
            return_value=watchlists,
        ) as load_watchlists,
        patch.object(
            watchlist_matching,
            "_load_public_source_post_rows",
            side_effect=_load_rows,
        ) as load_rows,
        patch.object(
            watchlist_matching,
            "_contexts_for_rows",
            return_value=contexts,
        ) as build_contexts,
        patch.object(
            watchlist_matching,
            "_match_post_to_contexts",
            return_value={"candidates": 1, "ready_for_review": 1, "discovery_candidates": 0},
        ) as match,
        patch.object(watchlist_matching, "EmbeddingService", FakeEmbeddingService),
    ):
        result = watchlist_matching.process_active_watchlists_for_public_source_posts(REFS)

    assert result == {
        "posts": 3,
        "watchlists": 1,
        "candidates": 3,
        "ready_for_review": 3,
        "discovery_candidates": 0,
    }
    load_watchlists.assert_called_once()
    build_contexts.assert_called_once_with(watchlists)
    assert load_rows.call_count == 3
    # One read transaction for the batch and no cache lookup per post.
    assert engine.transactions == 1
    assert [call.kwargs["source_post_id"] for call in match.call_args_list] == [
        "row-hn-1",
        "row-hn-2",
        "row-hn-3",
    ]
    assert all(call.kwargs["post_embedding"] == VECTOR for call in match.call_args_list)
    assert all(call.kwargs["contexts"] is contexts for call in match.call_args_list)


def test_posts_are_not_read_when_no_watchlist_is_active() -> None:
    engine = CountingEngine()

    with (
        patch.object(watchlist_matching, "_database_engine", return_value=engine),
        patch.object(watchlist_matching, "_load_active_watchlist_rows", return_value=[]),
        patch.object(watchlist_matching, "_load_public_source_post_rows") as load_rows,
        patch.object(watchlist_matching, "_contexts_for_rows") as build_contexts,
    ):
        result = watchlist_matching.process_active_watchlists_for_public_source_posts(REFS)

    assert result == {"posts": 0, "watchlists": 0, **ZERO_COUNTS}
    load_rows.assert_not_called()
    build_contexts.assert_not_called()
    assert engine.transactions == 1


def test_a_post_without_a_cached_vector_is_never_embedded_here() -> None:
    with (
        patch.object(watchlist_matching, "_database_engine", return_value=CountingEngine()),
        patch.object(
            watchlist_matching,
            "_load_active_watchlist_rows",
            return_value=[{"id": "watchlist-1"}],
        ),
        patch.object(
            watchlist_matching,
            "_load_public_source_post_rows",
            side_effect=lambda _conn, source_post_id, *, source=None: [
                _cached_row(source_post_id, cached=False)
            ],
        ),
        patch.object(watchlist_matching, "_contexts_for_rows", return_value=[object()]),
        patch.object(watchlist_matching, "_match_post_to_contexts") as match,
        patch.object(watchlist_matching, "EmbeddingService", FakeEmbeddingService),
    ):
        result = watchlist_matching.process_active_watchlists_for_public_source_posts(REFS)

    assert result == {"posts": 3, "watchlists": 1, **ZERO_COUNTS}
    match.assert_not_called()


def test_one_failing_post_does_not_discard_the_rest_of_the_batch() -> None:
    def match(*, source_post_id, **_kwargs):
        if source_post_id == "row-hn-2":
            raise RuntimeError("verifier transport failed")
        return {"candidates": 1, "ready_for_review": 0, "discovery_candidates": 1}

    with (
        patch.object(watchlist_matching, "_database_engine", return_value=CountingEngine()),
        patch.object(
            watchlist_matching,
            "_load_active_watchlist_rows",
            return_value=[{"id": "watchlist-1"}],
        ),
        patch.object(
            watchlist_matching,
            "_load_public_source_post_rows",
            side_effect=_load_rows,
        ),
        patch.object(watchlist_matching, "_contexts_for_rows", return_value=[object()]),
        patch.object(watchlist_matching, "_match_post_to_contexts", side_effect=match),
        patch.object(watchlist_matching, "EmbeddingService", FakeEmbeddingService),
        patch.object(watchlist_matching.logger, "exception") as log_failure,
    ):
        result = watchlist_matching.process_active_watchlists_for_public_source_posts(REFS)

    assert result["candidates"] == 2
    assert result["discovery_candidates"] == 2
    log_failure.assert_called_once()


def test_an_unavailable_watchlist_schema_leaves_source_matching_untouched() -> None:
    with (
        patch.object(watchlist_matching, "_database_engine", return_value=CountingEngine()),
        patch.object(
            watchlist_matching,
            "_load_active_watchlist_rows",
            side_effect=RuntimeError('relation "watchlists" does not exist'),
        ),
    ):
        result = watchlist_matching.process_active_watchlists_for_public_source_posts(REFS)

    assert result == {"posts": 0, "watchlists": 0, **ZERO_COUNTS}


def test_the_single_post_entry_point_delegates_to_the_batch() -> None:
    with patch.object(
        watchlist_matching,
        "process_active_watchlists_for_public_source_posts",
        return_value={"posts": 1, "watchlists": 0, **ZERO_COUNTS},
    ) as batch:
        result = watchlist_matching.process_active_watchlists_for_public_source_post(
            " hn-1 ",
            source="hackernews",
        )

    batch.assert_called_once_with([("hackernews", "hn-1")])
    assert result["posts"] == 1
    with pytest.raises(ValueError, match="source_post_id is required"):
        watchlist_matching.process_active_watchlists_for_public_source_post("  ")


def test_watchlists_sharing_a_profile_load_it_once_in_one_transaction() -> None:
    engine = CountingEngine()
    watchlists = [
        {"id": "watchlist-1", "tenant_id": "tenant-a", "service_profile_id": "profile-a"},
        {"id": "watchlist-2", "tenant_id": "tenant-a", "service_profile_id": "profile-a"},
        {"id": "watchlist-3", "tenant_id": "tenant-b", "service_profile_id": "profile-b"},
        {"id": "watchlist-4", "tenant_id": "tenant-c", "service_profile_id": ""},
    ]
    profiles = {
        ("tenant-a", "profile-a"): {"id": "profile-a"},
        ("tenant-b", "profile-b"): None,
    }
    built: list[tuple[object, object]] = []

    def build(row, profile_row, *, embedding_service):
        built.append((row["id"], profile_row["id"]))
        return row["id"]

    with (
        patch.object(watchlist_matching, "_database_engine", return_value=engine),
        patch.object(watchlist_matching, "_service_profile_columns", return_value={}),
        patch.object(
            watchlist_matching,
            "_load_service_profile",
            side_effect=lambda _conn, tenant_id, profile_id, _columns: profiles[
                (tenant_id, profile_id)
            ],
        ) as load_profile,
        patch.object(watchlist_matching, "_build_context", side_effect=build),
        patch.object(watchlist_matching, "EmbeddingService", FakeEmbeddingService),
    ):
        contexts = watchlist_matching._contexts_for_rows(watchlists)

    # The shared profile is read once; a missing profile or an incomplete
    # Watchlist is skipped without a query of its own.
    assert load_profile.call_count == 2
    assert engine.transactions == 1
    assert contexts == ["watchlist-1", "watchlist-2"]
    assert built == [("watchlist-1", "profile-a"), ("watchlist-2", "profile-a")]
