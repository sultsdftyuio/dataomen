"""Bound cost before public-source posts enter the AI matching pipeline."""

from __future__ import annotations

import os
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from .lead_signals import source_post_ref_signal


def _bounded_positive_int(name: str, default: int, *, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(1, min(maximum, value))


@dataclass(frozen=True)
class InitialEmbeddingBudget:
    """The maximum fresh posts an activation may send to embedding workers."""

    post_limit: int
    per_source_limit: int


@dataclass(frozen=True)
class InitialEmbeddingSelection:
    """The queued refs and the candidates excluded by an activation budget."""

    refs: tuple[Any, ...]
    excluded_count: int


def initial_embedding_budget() -> InitialEmbeddingBudget:
    """Read deliberately bounded activation limits without affecting other jobs."""

    post_limit = _bounded_positive_int(
        "ARCLI_INITIAL_PUBLIC_EMBEDDING_POST_LIMIT",
        120,
        maximum=500,
    )
    per_source_limit = _bounded_positive_int(
        "ARCLI_INITIAL_PUBLIC_EMBEDDING_POSTS_PER_SOURCE_LIMIT",
        40,
        maximum=post_limit,
    )
    return InitialEmbeddingBudget(
        post_limit=post_limit,
        per_source_limit=min(post_limit, per_source_limit),
    )


def initial_public_rematch_enabled() -> bool:
    """Allow deployments to defer cached-corpus work during cost-sensitive scans."""

    return os.getenv("ARCLI_INITIAL_PUBLIC_REMATCH_ENABLED", "true").strip().casefold() not in {
        "0",
        "false",
        "no",
        "off",
    }


def _ref_identity(ref: Any, *, fallback_source: str) -> tuple[str, str] | None:
    if isinstance(ref, str):
        source = fallback_source
        source_post_id = ref
    elif isinstance(ref, dict):
        source = str(ref.get("source") or fallback_source)
        source_post_id = str(ref.get("source_post_id") or "")
    else:
        source = str(getattr(ref, "source", "") or fallback_source)
        source_post_id = str(getattr(ref, "source_post_id", "") or "")

    normalized_source = source.strip().casefold()
    normalized_post_id = source_post_id.strip()
    return (
        (normalized_source, normalized_post_id)
        if normalized_source and normalized_post_id
        else None
    )


def _ref_signal_group(ref: Any) -> str | None:
    if isinstance(ref, dict):
        value = ref.get("lead_signal_group")
    else:
        value = getattr(ref, "lead_signal_group", None)
    normalized = str(value or "").strip().casefold()
    return normalized or None


def select_initial_embedding_refs(
    refs: Sequence[Any],
    *,
    source: str,
    budget: InitialEmbeddingBudget,
    selected_keys: set[tuple[str, str]],
    selected_by_source: dict[str, int],
    selected_signal_groups: set[str] | None = None,
) -> InitialEmbeddingSelection:
    """Select diverse refs without letting a source or author dominate a scan."""

    selected: list[Any] = []
    excluded_count = 0
    normalized_source = source.strip().casefold()
    selected_signal_groups = selected_signal_groups if selected_signal_groups is not None else set()

    ranked_refs = sorted(
        enumerate(refs),
        key=lambda item: (-source_post_ref_signal(item[1]).score, item[0]),
    )
    for _, ref in ranked_refs:
        identity = _ref_identity(ref, fallback_source=normalized_source)
        if identity is None or identity in selected_keys:
            continue

        ref_source = identity[0]
        signal_group = _ref_signal_group(ref)
        if (
            len(selected_keys) >= budget.post_limit
            or selected_by_source.get(ref_source, 0) >= budget.per_source_limit
            or (signal_group is not None and signal_group in selected_signal_groups)
        ):
            excluded_count += 1
            continue

        selected_keys.add(identity)
        selected_by_source[ref_source] = selected_by_source.get(ref_source, 0) + 1
        if signal_group is not None:
            selected_signal_groups.add(signal_group)
        selected.append(ref)

    return InitialEmbeddingSelection(tuple(selected), excluded_count)
