from __future__ import annotations

from contextlib import nullcontext
from pathlib import Path
from unittest.mock import patch

from api.services.social import candidate_pool
from api.services.social.candidate_privacy import (
    sanitize_candidate_evidence,
    sanitize_source_snapshot,
)


TENANT_ID = "tenant-1"
PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
SOURCE_POST_ID = "0962fc8d-514a-4bd1-8408-974bb3182660"
CANDIDATE_ID = "3d8173cc-5ddd-426b-8d85-151a78f17798"


def _enable_pool(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_DISCOVERY_CANDIDATE_POOL_ENABLED", "true")
    monkeypatch.setattr(candidate_pool, "_candidate_pool_unavailable_until", 0.0)
    monkeypatch.setattr(candidate_pool, "_candidate_pool_last_warning_at", 0.0)


def test_snapshot_scrubbing_keeps_public_evidence_without_contact_data() -> None:
    snapshot = sanitize_source_snapshot(
        {
            "title": "Need more paying customers",
            "text": "Email founder@example.com; token=not-for-review",
            "author": "private-author",
            "metadata": {"phone": "+1 555 555 5555", "community": "SaaS"},
        }
    )
    evidence = sanitize_candidate_evidence(
        {
            "matched_phrase": "need more paying customers",
            "email": "founder@example.com",
            "reason": "Direct buyer language",
        }
    )

    assert snapshot["title"] == "Need more paying customers"
    assert "[redacted-email]" in snapshot["text"]
    assert "[redacted-secret]" in snapshot["text"]
    assert "author" not in snapshot
    assert "phone" not in snapshot["metadata"]
    assert evidence == {
        "matched_phrase": "need more paying customers",
        "reason": "Direct buyer language",
    }


def test_candidate_dedupe_uses_the_provider_subject_not_a_query() -> None:
    first = candidate_pool.CandidateIdentity(
        candidate_kind="public_post",
        entity_provider="HackerNews",
        entity_external_id="post-42",
        source_post_id=SOURCE_POST_ID,
    )
    repeated = candidate_pool.CandidateIdentity(
        candidate_kind="public_post",
        entity_provider="hackernews",
        entity_external_id="post-42",
        source_post_id="a6c5a0fa-3554-4e47-a48b-3afd63fd4ed3",
    )

    assert candidate_pool.deterministic_candidate_dedupe_key(first) == (
        candidate_pool.deterministic_candidate_dedupe_key(repeated)
    )


def test_batch_recording_resolves_global_posts_once_and_preserves_query_provenance(
    monkeypatch,
) -> None:
    _enable_pool(monkeypatch)
    write = candidate_pool.CandidateWriteResult(
        candidate_id=CANDIDATE_ID,
        observation_id="a8d00f19-70f9-47d2-bb48-dc46fdcadad6",
        dedupe_key="f" * 64,
        candidate_created=True,
        observation_created=True,
    )
    resolved = {
        "post-42": (
            SOURCE_POST_ID,
            {
                "source": "hackernews",
                "external_id": "post-42",
                "title": "Need more paying customers",
                "text": "We need more paying customers this quarter.",
                "url": "https://news.ycombinator.com/item?id=42",
            },
        )
    }
    entries = [
        {
            "source_external_id": "post-42",
            "query_type": "buyer_pain",
            "query_phrase": "need more paying customers",
            "evidence": {"matched_phrase": "need more paying customers"},
        },
        {
            "source_external_id": "missing-post",
            "query_type": "urgent_failure",
            "query_phrase": "signups dropping",
        },
    ]

    with (
        patch.object(
            candidate_pool,
            "_global_public_source_snapshots",
            return_value=resolved,
        ) as resolve_posts,
        patch.object(
            candidate_pool,
            "record_public_post_candidate",
            return_value=write,
        ) as record_post,
    ):
        writes = candidate_pool.record_public_source_candidates(
            TENANT_ID,
            PROFILE_ID,
            RUN_ID,
            source="hackernews",
            candidates=entries,
        )

    assert writes == [write]
    resolve_posts.assert_called_once_with("hackernews", ["post-42", "missing-post"])
    assert record_post.call_args.kwargs["source_post_id"] == SOURCE_POST_ID
    assert record_post.call_args.kwargs["query_type"] == "buyer_pain"
    assert record_post.call_args.kwargs["query_phrase"] == "need more paying customers"


def test_matching_can_advance_a_pool_item_by_provider_identity(monkeypatch) -> None:
    _enable_pool(monkeypatch)

    class Connection:
        def execute(self, *_args, **_kwargs):
            return self

        def scalar_one_or_none(self):
            return CANDIDATE_ID

    class Engine:
        def begin(self):
            return nullcontext(Connection())

    with (
        patch.object(candidate_pool, "_database_engine", return_value=Engine()),
        patch.object(candidate_pool, "advance_candidate_status", return_value=True) as advance,
    ):
        result = candidate_pool.advance_public_source_candidate_status(
            TENANT_ID,
            PROFILE_ID,
            source="hackernews",
            source_external_id="post-42",
            status="plausible",
            scores={"similarity_score": 0.77, "priority_score": 31},
            evidence={"reason_code": "semantic_profile_match"},
        )

    assert result is True
    advance.assert_called_once_with(
        TENANT_ID,
        CANDIDATE_ID,
        "plausible",
        scores={"similarity_score": 0.77, "priority_score": 31},
        evidence={"reason_code": "semantic_profile_match"},
        decision_by=None,
        decision_reason=None,
    )


def test_rejected_public_candidate_advances_without_a_name_error(monkeypatch) -> None:
    """Exercise the real lifecycle path used by matching workers.

    This must not mock ``advance_candidate_status``: the worker advances a
    candidate with ``decision_by`` after the verifier rejects it, which is the
    path that previously referenced an undefined identifier limit constant.
    """

    _enable_pool(monkeypatch)

    class Connection:
        def execute(self, *_args, **_kwargs):
            return self

        def scalar_one_or_none(self):
            return CANDIDATE_ID

    class Engine:
        def begin(self):
            return nullcontext(Connection())

    with patch.object(candidate_pool, "_database_engine", return_value=Engine()):
        result = candidate_pool.advance_public_source_candidate_status(
            TENANT_ID,
            PROFILE_ID,
            source="hackernews",
            source_external_id="post-42",
            status="rejected",
            scores={"similarity_score": 0.32, "verifier_score": 0.08},
            evidence={"reason_code": "not_a_match"},
            decision_by="system",
            decision_reason="Not a buyer-intent signal.",
        )

    assert result is True


def test_candidate_contract_enforces_tenant_scope_lifecycle_and_read_only_browser_access() -> None:
    contract = Path("scripts/discovery_candidate_pool_contract.sql").read_text(
        encoding="utf-8"
    )

    assert "FOREIGN KEY (tenant_id, service_profile_id)" in contract
    assert "FOREIGN KEY (tenant_id, candidate_id)" in contract
    assert "raw' AND NEW.candidate_status IN ('plausible', 'rejected')" in contract
    assert "GRANT SELECT ON TABLE public.discovery_candidates TO authenticated" in contract
    assert "REVOKE INSERT, UPDATE, DELETE ON TABLE public.discovery_candidates FROM authenticated" in contract
