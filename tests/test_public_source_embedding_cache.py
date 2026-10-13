"""Coverage for the cached public-post embedding and where it may travel."""

from __future__ import annotations

import json
from contextlib import nullcontext
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from api.services.embeddings import normalize_embedding_text
from api.services.social import legacy_storage, public_records
from api.services.social.models import (
    SOURCE_POST_EMBEDDING_CACHE_KEY,
    SocialPost,
    _sha256_text,
)
from api.services.verifier import VERIFIER_POLICY_VERSION, VerificationResult

EMBEDDING_MODEL = "test-embedding-model"
VECTOR = [0.25, -0.5, 0.75]


def _text_sha256(row: dict[str, object]) -> str:
    post = public_records._public_source_post_as_social_post(row)
    assert post is not None
    return _sha256_text(normalize_embedding_text(post.matching_text[:32_000]))


def _source_row(post_id: str, *, cached: bool, **overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "id": f"00000000-0000-0000-0000-{post_id:0>12}",
        "source": "lemmy",
        "source_post_id": f"post-{post_id}",
        "title": "Looking for a self-hosted billing tool",
        "body": f"We reconcile invoices by hand every month ({post_id}).",
        "author_handle": "alice",
        "url": f"https://lemmy.example/post/{post_id}",
        "posted_at": datetime(2026, 9, 30, 8, 15, tzinfo=timezone.utc),
        "metadata": {"community": "selfhosted"},
    }
    row.update(overrides)
    if cached:
        row["metadata"] = {
            **row["metadata"],  # type: ignore[dict-item]
            SOURCE_POST_EMBEDDING_CACHE_KEY: {
                "model": EMBEDDING_MODEL,
                "text_sha256": _text_sha256(row),
                "embedding": VECTOR,
                "dimensions": len(VECTOR),
            },
        }
    return row


class CountingEngine:
    """Count transactions so a per-post round trip cannot quietly return."""

    def __init__(self) -> None:
        self.transactions = 0

    def begin(self):
        self.transactions += 1
        return nullcontext(object())


class FakeEmbeddingService:
    model = EMBEDDING_MODEL

    def __init__(self, *, error: Exception | None = None) -> None:
        self.error = error
        self.requests: list[list[str]] = []
        self.closed = False

    def embed_many(self, texts, **_kwargs):
        self.requests.append(list(texts))
        if self.error is not None:
            raise self.error
        return [
            SimpleNamespace(model=self.model, embedding=[float(index), 1.0])
            for index, _ in enumerate(texts)
        ]

    def close(self) -> None:
        self.closed = True


def test_cached_vector_is_read_from_the_loaded_row() -> None:
    row = _source_row("1", cached=True)

    assert public_records._cached_public_source_post_embedding(
        row,
        text_sha256=_text_sha256(row),
        embedding_model=EMBEDDING_MODEL,
    ) == VECTOR


@pytest.mark.parametrize(
    ("text_sha256", "embedding_model"),
    [
        ("a-different-text-hash", EMBEDDING_MODEL),
        (None, "a-newer-embedding-model"),
    ],
)
def test_cached_vector_is_ignored_for_other_text_or_model(
    text_sha256: str | None,
    embedding_model: str,
) -> None:
    row = _source_row("1", cached=True)

    assert (
        public_records._cached_public_source_post_embedding(
            row,
            text_sha256=text_sha256 or _text_sha256(row),
            embedding_model=embedding_model,
        )
        is None
    )


def test_cached_vector_tolerates_text_and_absent_metadata() -> None:
    row = _source_row("1", cached=True)
    as_text = {**row, "metadata": json.dumps(row["metadata"])}
    without_metadata = {key: value for key, value in row.items() if key != "metadata"}

    assert public_records._cached_public_source_post_embedding(
        as_text,
        text_sha256=_text_sha256(row),
        embedding_model=EMBEDDING_MODEL,
    ) == VECTOR
    assert (
        public_records._cached_public_source_post_embedding(
            without_metadata,
            text_sha256=_text_sha256(row),
            embedding_model=EMBEDDING_MODEL,
        )
        is None
    )


def test_post_context_excludes_the_vector_but_keeps_provider_context() -> None:
    row = _source_row("1", cached=True)

    post = public_records._public_source_post_as_social_post(row)

    assert post is not None
    assert post.metadata == {"community": "selfhosted"}
    # The loaded row still carries the cache for the matcher to read.
    assert SOURCE_POST_EMBEDDING_CACHE_KEY in row["metadata"]  # type: ignore[operator]


def test_post_context_keeps_the_publish_date_from_a_timestamp_column() -> None:
    post = public_records._public_source_post_as_social_post(
        _source_row("1", cached=False)
    )

    assert post is not None
    assert post.published_at == "2026-09-30T08:15:00+00:00"


def test_a_lead_match_snapshot_never_stores_the_vector() -> None:
    post = public_records._public_source_post_as_social_post(
        _source_row("1", cached=True)
    )
    assert post is not None
    json_column = {"data_type": "jsonb", "udt_name": "jsonb"}
    text_column = {"data_type": "text", "udt_name": "text"}
    columns = {
        "tenant_id": text_column,
        "service_profile_id": {"data_type": "uuid", "udt_name": "uuid"},
        "source_post_id": {"data_type": "uuid", "udt_name": "uuid"},
        "match_status": text_column,
        "verifier_score": {"data_type": "double precision", "udt_name": "float8"},
        "verification": json_column,
        "source_post": json_column,
        "source_post_data": json_column,
        "source_post_json": json_column,
        "post": json_column,
        "metadata": json_column,
        "updated_at": {"data_type": "timestamp with time zone", "udt_name": "timestamptz"},
    }
    written: list[dict[str, object]] = []

    class RecordingConnection:
        def execute(self, _statement, params):
            written.append(params)
            return SimpleNamespace(scalar_one_or_none=lambda: None)

    with patch.object(legacy_storage, "_table_columns", return_value=columns):
        legacy_storage._persist_lead_match(
            RecordingConnection(),
            tenant_id="tenant-a",
            service_profile_id="00000000-0000-0000-0000-0000000000aa",
            source_post_id="00000000-0000-0000-0000-000000000001",
            post=post,
            similarity_score=0.7,
            verification=VerificationResult(
                match=True,
                decision_label="strong_match",
                confidence=0.9,
                pain_detected="Manual invoice reconciliation",
                why_this_matches="The author asks for a billing tool.",
            ),
            profile_embedding_sha256="profile-hash",
            verifier_model="test-verifier-model",
            verifier_policy_version=VERIFIER_POLICY_VERSION,
        )

    insert_params = written[-1]
    stored = json.dumps(insert_params, default=str)
    assert SOURCE_POST_EMBEDDING_CACHE_KEY not in stored
    for column in ("source_post", "source_post_data", "source_post_json", "post"):
        snapshot = json.loads(insert_params[f"p_{column}"])  # type: ignore[arg-type]
        assert snapshot["metadata"] == {"community": "selfhosted"}
        assert snapshot["published_at"] == "2026-09-30T08:15:00+00:00"
    assert json.loads(insert_params["p_metadata"])["community"] == "selfhosted"  # type: ignore[arg-type]


def test_warm_up_embeds_only_missing_posts_and_writes_them_in_one_transaction() -> None:
    cached_row = _source_row("1", cached=True)
    missing_rows = [_source_row("2", cached=False), _source_row("3", cached=False)]
    refs = [("lemmy", "post-1"), ("lemmy", "post-2"), ("lemmy", "post-3")]
    rows_by_ref = {
        refs[0]: [cached_row],
        refs[1]: [missing_rows[0]],
        refs[2]: [missing_rows[1]],
    }
    engine = CountingEngine()
    service = FakeEmbeddingService()
    persisted: list[str] = []
    vectors: dict[str, list[float]] = {}

    with (
        patch.object(public_records, "_database_engine", return_value=engine),
        patch.object(
            public_records,
            "_persist_public_source_post_embedding_cache",
            side_effect=lambda _conn, **kwargs: persisted.append(kwargs["database_post_id"]),
        ),
    ):
        embedded = public_records.prewarm_public_source_post_embedding_cache(
            refs,
            source_rows_by_ref=rows_by_ref,
            embedding_service=service,  # type: ignore[arg-type]
            embedding_values_by_database_post_id=vectors,
        )

    assert embedded == 2
    assert len(service.requests) == 1 and len(service.requests[0]) == 2
    assert persisted == [missing_rows[0]["id"], missing_rows[1]["id"]]
    # No lookup per post and one write transaction for the whole batch.
    assert engine.transactions == 1
    assert vectors[str(cached_row["id"])] == VECTOR
    assert set(vectors) == {str(row["id"]) for row in (cached_row, *missing_rows)}
    assert service.closed is False


def test_warm_up_needs_no_database_when_every_post_is_cached() -> None:
    rows = [_source_row("1", cached=True), _source_row("2", cached=True)]
    refs = [("lemmy", "post-1"), ("lemmy", "post-2")]
    engine = CountingEngine()
    service = FakeEmbeddingService()

    with patch.object(public_records, "_database_engine", return_value=engine):
        embedded = public_records.prewarm_public_source_post_embedding_cache(
            refs,
            source_rows_by_ref={refs[0]: [rows[0]], refs[1]: [rows[1]]},
            embedding_service=service,  # type: ignore[arg-type]
        )

    assert embedded == 0
    assert service.requests == []
    assert engine.transactions == 0


def test_warm_up_embeds_a_post_named_by_two_references_once() -> None:
    row = _source_row("7", cached=False)
    refs = [(None, "post-7"), ("lemmy", "post-7")]
    service = FakeEmbeddingService()

    with (
        patch.object(public_records, "_database_engine", return_value=CountingEngine()),
        patch.object(public_records, "_persist_public_source_post_embedding_cache"),
    ):
        embedded = public_records.prewarm_public_source_post_embedding_cache(
            refs,
            source_rows_by_ref={refs[0]: [row], refs[1]: [row]},
            embedding_service=service,  # type: ignore[arg-type]
        )

    assert embedded == 1
    assert len(service.requests[0]) == 1


def test_warm_up_loads_rows_it_was_not_given_in_one_transaction() -> None:
    rows = {"post-1": [_source_row("1", cached=True)], "post-2": [_source_row("2", cached=True)]}
    engine = CountingEngine()

    with (
        patch.object(public_records, "_database_engine", return_value=engine),
        patch.object(
            public_records,
            "_load_public_source_post_rows",
            side_effect=lambda _conn, source_post_id, *, source=None: rows[source_post_id],
        ) as load_rows,
    ):
        public_records.prewarm_public_source_post_embedding_cache(
            [("lemmy", "post-1"), ("lemmy", "post-2")],
            embedding_service=FakeEmbeddingService(),  # type: ignore[arg-type]
        )

    assert load_rows.call_count == 2
    assert engine.transactions == 1


def test_warm_up_marks_posts_failed_and_reraises_when_the_provider_fails() -> None:
    rows = [_source_row("1", cached=False), _source_row("2", cached=False)]
    refs = [("lemmy", "post-1"), ("lemmy", "post-2")]
    engine = CountingEngine()
    failed: list[str] = []
    vectors: dict[str, list[float]] = {}

    with (
        patch.object(public_records, "_database_engine", return_value=engine),
        patch.object(
            public_records,
            "_mark_public_source_post_embedding_failed",
            side_effect=lambda _conn, **kwargs: failed.append(kwargs["database_post_id"]),
        ),
        patch.object(public_records, "_persist_public_source_post_embedding_cache") as persist,
    ):
        with pytest.raises(RuntimeError, match="provider unavailable"):
            public_records.prewarm_public_source_post_embedding_cache(
                refs,
                source_rows_by_ref={refs[0]: [rows[0]], refs[1]: [rows[1]]},
                embedding_service=FakeEmbeddingService(  # type: ignore[arg-type]
                    error=RuntimeError("provider unavailable")
                ),
                embedding_values_by_database_post_id=vectors,
            )

    assert failed == [rows[0]["id"], rows[1]["id"]]
    assert engine.transactions == 1
    persist.assert_not_called()
    assert vectors == {}


def test_activation_rematch_reads_cached_vectors_without_a_query_per_post() -> None:
    import api.services.social_ingestion as ingestion

    source_rows = [_source_row(str(index), cached=True) for index in range(1, 6)]
    profile_row = {
        "id": "profile-1",
        "tenant_id": "tenant-a",
        "company_name": "Billing Co",
        "one_liner": "Recurring billing software",
        "target_audience": ["SaaS founders"],
        "core_problem_solved": "Recurring billing",
        "key_value_propositions": ["Automated billing"],
        "ideal_customer_pain_points": ["Manual invoices"],
        "profile_embedding": [1.0, 0.0, 0.0],
        "website_url": "https://billing.example/",
        "profile_json": {
            "service_profile_identity_version": "website-scoped-v2",
            "website_url": "https://billing.example/",
        },
    }
    engine = CountingEngine()

    class RematchEmbeddingService:
        model = EMBEDDING_MODEL

        def close(self) -> None:
            return None

    with (
        patch.object(ingestion, "_database_engine", return_value=engine),
        patch.object(ingestion, "_service_profile_columns", return_value={}),
        patch.object(ingestion, "_load_service_profile", return_value=profile_row),
        patch.object(
            ingestion,
            "_active_tenant_website_url",
            return_value="https://billing.example/",
        ),
        patch.object(
            ingestion,
            "_load_recent_embedded_public_source_post_rows",
            return_value=source_rows,
        ),
        patch.object(ingestion, "_table_columns", return_value={}),
        patch.object(ingestion, "find_candidate_matches", return_value=[]) as matcher,
        patch.object(ingestion, "EmbeddingService", RematchEmbeddingService),
    ):
        result = ingestion.rematch_existing_public_source_posts_for_profile(
            "tenant-a",
            "profile-1",
        )

    assert result["posts"] == 5
    assert result["embedded"] == 5
    assert result["cache_misses"] == 0
    assert [item.embedding for item in matcher.call_args.args[1]] == [VECTOR] * 5
    # Only the opening read of profile, corpus slice and column metadata.
    assert engine.transactions == 1


def test_lead_snapshot_helper_is_unchanged_for_a_post_without_a_cache() -> None:
    post = SocialPost(
        source="hackernews",
        external_id="42",
        title="Need help",
        text="Our manual workflow is failing.",
        metadata={"content_kind": "story"},
    )

    assert post.to_source_post_json()["metadata"] == {"content_kind": "story"}
