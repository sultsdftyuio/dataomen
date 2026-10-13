"""Coverage for reusing one verifier, and its connection, across a batch."""

from __future__ import annotations

from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch

import api.services.social_ingestion as ingestion
from api.services import watchlist_matching
from api.services.verifier import VerificationResult

ZERO = {
    "posts": 1,
    "embedded": 1,
    "candidates": 0,
    "ready_for_review": 0,
    "discovery_candidates": 0,
}
PROFILE_ROW = {
    "id": "profile-a",
    "tenant_id": "tenant-a",
    "company_name": "Billing Co",
    "one_liner": "Recurring billing software",
    "target_audience": ["SaaS founders"],
    "core_problem_solved": "Recurring billing",
    "key_value_propositions": ["Automated billing"],
    "ideal_customer_pain_points": ["Manual invoices"],
    "profile_embedding": [1.0, 0.0],
    "website_url": "https://billing.example/",
}


class FakeEngine:
    def begin(self):
        return nullcontext(object())


class FakeEmbeddingService:
    model = "test-embedding-model"

    def embed_text(self, *_args, **_kwargs):
        return SimpleNamespace(embedding=[1.0, 0.0], model=self.model)

    def close(self) -> None:
        return None


def _verifier_class():
    """Return a verifier double that records every instance it creates."""

    class RecordingVerifier:
        model = "test-verifier-model"
        instances: list["RecordingVerifier"] = []

        def __init__(self) -> None:
            self.calls = 0
            self.closed = 0
            RecordingVerifier.instances.append(self)

        def verify(self, *_args, **_kwargs):
            self.calls += 1
            return VerificationResult(
                match=True,
                decision_label="strong_match",
                confidence=0.9,
                pain_detected="Manual billing work",
                why_this_matches="The post asks for recurring billing software.",
            )

        def close(self) -> None:
            self.closed += 1

    return RecordingVerifier


def _source_row(index: int) -> dict[str, object]:
    return {
        "id": f"00000000-0000-0000-0000-00000000000{index}",
        "source": "hackernews",
        "source_post_id": f"hn-{index}",
        "title": "Need a billing tool",
        "body": f"I need a better recurring billing platform ({index}).",
        "url": f"https://news.ycombinator.com/item?id={index}",
        "metadata": {},
    }


def test_a_batch_builds_one_verifier_and_closes_it_once() -> None:
    verifier_class = _verifier_class()
    refs = [{"source": "hackernews", "source_post_id": f"hn-{index}"} for index in (1, 2, 3)]

    with (
        patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
        patch.object(ingestion, "_load_public_source_post_rows", return_value=[{"id": "row"}]),
        patch.object(ingestion, "_public_matching_profile_rows", return_value=[]),
        patch.object(ingestion, "_table_columns", return_value={}),
        patch.object(ingestion, "prewarm_public_source_post_embedding_cache", return_value=0),
        patch.object(ingestion, "EmbeddingService", FakeEmbeddingService),
        patch.object(ingestion, "VerifierService", verifier_class),
        patch.object(
            ingestion,
            "process_public_source_post_embedding",
            return_value=ZERO,
        ) as process,
    ):
        totals = ingestion.process_public_source_post_embedding_batch(refs)

    assert totals["posts"] == 3
    assert len(verifier_class.instances) == 1
    shared = verifier_class.instances[0]
    assert [call.kwargs["_verifier"] for call in process.call_args_list] == [shared] * 3
    assert shared.closed == 1


def test_the_batch_verifier_is_closed_when_matching_fails() -> None:
    verifier_class = _verifier_class()

    with (
        patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
        patch.object(ingestion, "_load_public_source_post_rows", return_value=[{"id": "row"}]),
        patch.object(ingestion, "_public_matching_profile_rows", return_value=[]),
        patch.object(ingestion, "_table_columns", return_value={}),
        patch.object(ingestion, "prewarm_public_source_post_embedding_cache", return_value=0),
        patch.object(ingestion, "EmbeddingService", FakeEmbeddingService),
        patch.object(ingestion, "VerifierService", verifier_class),
        patch.object(
            ingestion,
            "process_public_source_post_embedding",
            side_effect=RuntimeError("lead storage unavailable"),
        ),
    ):
        try:
            ingestion.process_public_source_post_embedding_batch(
                [{"source": "hackernews", "source_post_id": "hn-1"}]
            )
        except RuntimeError:
            pass
        else:
            raise AssertionError("the storage failure must propagate to the actor")

    assert verifier_class.instances[0].closed == 1


def _match_one_post(verifier_class, **kwargs: object) -> dict[str, int]:
    with (
        patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
        patch.object(ingestion, "_table_columns", return_value={}),
        patch.object(ingestion, "_persist_public_source_post_embedding_cache"),
        patch.object(ingestion, "_cached_lead_verification", return_value=None),
        patch.object(ingestion, "_persist_lead_match"),
        patch.object(ingestion, "_advance_public_candidate_pool"),
        patch.object(ingestion, "EmbeddingService", FakeEmbeddingService),
        patch.object(ingestion, "VerifierService", verifier_class),
    ):
        return ingestion.process_public_source_post_embedding(
            "hn-1",
            source="hackernews",
            _source_rows=[_source_row(1)],
            _profile_rows=[PROFILE_ROW],
            _lead_match_columns={},
            **kwargs,  # type: ignore[arg-type]
        )


def test_a_supplied_verifier_is_used_and_left_open_for_the_next_post() -> None:
    verifier_class = _verifier_class()
    shared = verifier_class()

    result = _match_one_post(verifier_class, _verifier=shared)

    assert result["ready_for_review"] == 1
    assert verifier_class.instances == [shared]
    assert shared.calls == 1
    assert shared.closed == 0


def test_a_single_post_still_builds_and_closes_its_own_verifier() -> None:
    verifier_class = _verifier_class()

    result = _match_one_post(verifier_class)

    assert result["ready_for_review"] == 1
    assert len(verifier_class.instances) == 1
    assert verifier_class.instances[0].calls == 1
    assert verifier_class.instances[0].closed == 1


def test_watchlist_batch_passes_one_verifier_to_every_post() -> None:
    from tests.test_watchlist_batch_matching import (
        REFS,
        CountingEngine,
        FakeEmbeddingService as WatchlistEmbeddingService,
        _load_rows,
    )

    verifier_class = _verifier_class()

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
        patch.object(
            watchlist_matching,
            "_match_post_to_contexts",
            return_value={"candidates": 0, "ready_for_review": 0, "discovery_candidates": 0},
        ) as match,
        patch.object(watchlist_matching, "EmbeddingService", WatchlistEmbeddingService),
        patch.object(watchlist_matching, "VerifierService", verifier_class),
    ):
        watchlist_matching.process_active_watchlists_for_public_source_posts(REFS)

    assert len(verifier_class.instances) == 1
    shared = verifier_class.instances[0]
    assert [call.kwargs["verifier"] for call in match.call_args_list] == [shared] * 3
    assert shared.closed == 1
