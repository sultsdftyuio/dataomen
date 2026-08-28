"""Unit coverage for initial public-discovery cost controls."""

from __future__ import annotations

from types import SimpleNamespace

from api.services.social.discovery_budget import (
    InitialEmbeddingBudget,
    initial_public_rematch_enabled,
    select_initial_embedding_refs,
)
from api.services.social.lead_signals import prioritized_source_post_refs
from api.services.social.models import PublicSourcePostRef


def test_embedding_budget_deduplicates_and_preserves_source_diversity() -> None:
    budget = InitialEmbeddingBudget(post_limit=3, per_source_limit=2)
    selected_keys: set[tuple[str, str]] = set()
    selected_by_source: dict[str, int] = {}

    hn_selection = select_initial_embedding_refs(
        ("hn-1", "hn-2", "hn-1", "hn-3"),
        source="hackernews",
        budget=budget,
        selected_keys=selected_keys,
        selected_by_source=selected_by_source,
    )
    bluesky_selection = select_initial_embedding_refs(
        ("bs-1", "bs-2"),
        source="bluesky",
        budget=budget,
        selected_keys=selected_keys,
        selected_by_source=selected_by_source,
    )

    assert hn_selection.refs == ("hn-1", "hn-2")
    assert hn_selection.excluded_count == 1
    assert bluesky_selection.refs == ("bs-1",)
    assert bluesky_selection.excluded_count == 1
    assert selected_by_source == {"hackernews": 2, "bluesky": 1}


def test_rematch_can_be_disabled_for_cost_sensitive_discovery(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_INITIAL_PUBLIC_REMATCH_ENABLED", "false")

    assert initial_public_rematch_enabled() is False


def test_embedding_budget_prioritizes_stronger_buyer_signals() -> None:
    budget = InitialEmbeddingBudget(post_limit=1, per_source_limit=1)

    selection = select_initial_embedding_refs(
        (
            PublicSourcePostRef("hackernews", "low", lead_signal_score=1),
            PublicSourcePostRef("hackernews", "high", lead_signal_score=12),
        ),
        source="hackernews",
        budget=budget,
        selected_keys=set(),
        selected_by_source={},
    )

    assert [ref.source_post_id for ref in selection.refs] == ["high"]
    assert selection.excluded_count == 1


def test_embedding_budget_keeps_one_highest_priority_post_per_person() -> None:
    budget = InitialEmbeddingBudget(post_limit=3, per_source_limit=3)

    selection = select_initial_embedding_refs(
        (
            PublicSourcePostRef(
                "bluesky",
                "alice-low",
                lead_signal_score=3,
                lead_signal_group="bluesky:alice",
            ),
            PublicSourcePostRef(
                "bluesky",
                "alice-high",
                lead_signal_score=9,
                lead_signal_group="bluesky:alice",
            ),
            PublicSourcePostRef(
                "bluesky",
                "bob",
                lead_signal_score=7,
                lead_signal_group="bluesky:bob",
            ),
        ),
        source="bluesky",
        budget=budget,
        selected_keys=set(),
        selected_by_source={},
        selected_signal_groups=set(),
    )

    assert [ref.source_post_id for ref in selection.refs] == ["alice-high", "bob"]
    assert selection.excluded_count == 1


def test_repeated_author_signals_boost_the_best_candidate_without_hiding_posts() -> None:
    refs = prioritized_source_post_refs(
        (
            SimpleNamespace(
                source="lemmy",
                source_post_id="first",
                title="Need help with manual prospecting",
                body="",
                author="alice",
            ),
            SimpleNamespace(
                source="lemmy",
                source_post_id="second",
                title="Looking for a better outbound workflow",
                body="",
                author="alice",
            ),
        )
    )

    assert len(refs) == 2
    assert {ref.lead_signal_group for ref in refs} == {"lemmy:alice"}
    assert all("repeat_author_signal" in ref.lead_signal_reasons for ref in refs)
