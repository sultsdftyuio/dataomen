"""Small, defensive text helpers used before social-post evaluation.

These helpers deliberately improve recall only.  They do not decide whether a
post is a lead; embedding similarity and the verifier remain the precision
gates.  Keeping this boundary separate makes provider records with optional or
inconsistent fields safe to compare without changing their stored shape.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


_TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]*", re.IGNORECASE)
_SPACE_PATTERN = re.compile(r"\s+")
_THREAD_TITLE_KEYS = (
    "thread_title",
    "threadTitle",
    "parent_title",
    "story_title",
)

# These are lexical bridges for common buyer-language paraphrases.  They only
# keep a post in the recall path when it also has buyer context; they are not
# a substitute for embedding similarity or verifier evidence.
_RELATED_TOKEN_GROUPS: tuple[tuple[str, frozenset[str]], ...] = (
    (
        "workflow_automation",
        frozenset(
            {
                "manual",
                "manually",
                "automation",
                "automate",
                "automated",
                "hand",
                "spreadsheet",
            }
        ),
    ),
    (
        "finance_operations",
        frozenset(
            {
                "finance",
                "financial",
                "accounting",
                "bookkeeping",
                "close",
                "closing",
                "month-end",
                "reconciliation",
                "reconcile",
            }
        ),
    ),
    (
        "billing_payments",
        frozenset(
            {
                "payment",
                "payments",
                "invoice",
                "invoices",
                "billing",
                "receivable",
                "dunning",
            }
        ),
    ),
    (
        "buyer_demand",
        frozenset(
            {
                "customer",
                "customers",
                "client",
                "clients",
                "user",
                "users",
                "buyer",
                "buyers",
                "prospect",
                "prospects",
                "lead",
                "leads",
            }
        ),
    ),
    (
        "growth_revenue",
        frozenset(
            {
                "signup",
                "signups",
                "trial",
                "trials",
                "conversion",
                "conversions",
                "demand",
                "pipeline",
                "revenue",
            }
        ),
    ),
    (
        "sales_outreach",
        frozenset({"outreach", "outbound", "prospecting", "sales", "sdr", "sdrs"}),
    ),
    (
        "operations",
        frozenset(
            {
                "workflow",
                "workflows",
                "process",
                "processes",
                "operation",
                "operations",
                "ops",
            }
        ),
    ),
    (
        "software_tools",
        frozenset(
            {
                "tool",
                "tools",
                "software",
                "platform",
                "platforms",
                "stack",
                "system",
                "systems",
                "app",
                "apps",
            }
        ),
    ),
    (
        "switching",
        frozenset(
            {
                "replace",
                "replacement",
                "switch",
                "switching",
                "migrate",
                "migration",
                "alternative",
                "alternatives",
            }
        ),
    ),
    (
        "technical_architecture",
        frozenset(
            {
                "architecture",
                "architectural",
                "design",
                "integrate",
                "integration",
                "scaling",
                "scale",
                "scalable",
            }
        ),
    ),
    (
        "workflow_friction",
        frozenset(
            {
                "slow",
                "slower",
                "delay",
                "delayed",
                "bottleneck",
                "bottlenecks",
                "friction",
                "frustrated",
                "frustration",
            }
        ),
    ),
)

_PROFILE_VOCABULARY_FIELDS = (
    "core_problem_solved",
    "ideal_customer_pain_points",
    "use_cases",
    "buying_triggers",
    "urgency_signals",
    "search_terms",
    "key_value_propositions",
    "target_audience",
    "one_liner",
)
_PROFILE_VOCABULARY_TEXT_MAX_CHARS = 6_000
_PROFILE_VOCABULARY_FIELD_MAX_CHARS = 1_500


@dataclass(frozen=True)
class FlexibleTokenOverlap:
    """Explain how query language was connected to source language."""

    exact_count: int = 0
    partial_count: int = 0
    synonym_count: int = 0

    @property
    def count(self) -> int:
        return self.exact_count + self.partial_count + self.synonym_count

    @property
    def reasons(self) -> tuple[str, ...]:
        reasons: list[str] = []
        if self.exact_count:
            reasons.append("exact_keyword_overlap")
        if self.partial_count:
            reasons.append("partial_keyword_overlap")
        if self.synonym_count:
            reasons.append("semantic_keyword_overlap")
        return tuple(reasons)


@dataclass(frozen=True)
class ProfileVocabularySignal:
    """A small ranking signal derived from the existing matching brief."""

    score: float = 0.0
    reasons: tuple[str, ...] = ()
    theme: str | None = None


def normalize_comparison_text(value: Any) -> str:
    """Return normalized text without coercing malformed structured values."""

    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if not isinstance(value, str):
        return ""
    return _SPACE_PATTERN.sub(" ", value).strip()


def post_comparison_text(post: Any) -> str:
    """Build text from whichever optional public-post fields are available."""

    def read_value(name: str) -> Any:
        try:
            if isinstance(post, Mapping):
                return post.get(name)
            return getattr(post, name, None)
        except Exception:
            # A provider adapter must not be able to terminate a worker just
            # because one optional property is malformed.
            return None

    title = normalize_comparison_text(read_value("title"))
    body = normalize_comparison_text(read_value("body")) or normalize_comparison_text(
        read_value("text")
    )
    metadata = read_value("metadata")
    thread_title = ""
    if isinstance(metadata, Mapping):
        for key in _THREAD_TITLE_KEYS:
            thread_title = normalize_comparison_text(metadata.get(key))
            if thread_title:
                break
    if not thread_title:
        for key in _THREAD_TITLE_KEYS:
            thread_title = normalize_comparison_text(read_value(key))
            if thread_title:
                break

    # The body is intentionally retained even when title, author, metadata,
    # or thread context is absent.  Deduping avoids spending prompt tokens on
    # connectors that copy a story title into both fields.
    parts: list[str] = []
    for value in (thread_title, title, body):
        if value and value not in parts:
            parts.append(value)
    return " ".join(parts)


def comparison_tokens(value: str, *, stop_words: Sequence[str] = ()) -> set[str]:
    """Tokenize buyer language with caller-controlled stop words."""

    excluded = {word.casefold() for word in stop_words}
    return {
        token.casefold()
        for token in _TOKEN_PATTERN.findall(normalize_comparison_text(value))
        if len(token) > 1 and token.casefold() not in excluded
    }


def flexible_token_overlap(query_tokens: set[str], text_tokens: set[str]) -> int:
    """Count exact, partial, and related-word matches without double counting."""

    return flexible_token_overlap_details(query_tokens, text_tokens).count


def flexible_token_overlap_details(
    query_tokens: set[str],
    text_tokens: set[str],
) -> FlexibleTokenOverlap:
    """Return the exact, partial, and semantic contributions to an overlap."""

    unmatched_text_tokens = set(text_tokens)
    counts = {"exact": 0, "partial": 0, "synonym": 0}
    for query_token in sorted(query_tokens):
        matching_token: str | None = None
        matching_kind: str | None = None
        for text_token in sorted(unmatched_text_tokens):
            relation = _token_relation(query_token, text_token)
            if relation is None:
                continue
            if matching_kind is None or _relation_priority(relation) > _relation_priority(
                matching_kind
            ):
                matching_token = text_token
                matching_kind = relation
        if matching_token is not None and matching_kind is not None:
            unmatched_text_tokens.remove(matching_token)
            counts[matching_kind] += 1

    return FlexibleTokenOverlap(
        exact_count=counts["exact"],
        partial_count=counts["partial"],
        synonym_count=counts["synonym"],
    )


def profile_vocabulary_signal(profile: Any, text: Any) -> ProfileVocabularySignal:
    """Measure brief-language support for ranking without changing eligibility."""

    # Vocabulary is a small tiebreaker, so cap it before doing pairwise token
    # comparisons. The full post still reaches embedding/verifier evaluation.
    text_tokens = comparison_tokens(
        truncate_comparison_text(text, _PROFILE_VOCABULARY_TEXT_MAX_CHARS)
    )
    if not text_tokens:
        return ProfileVocabularySignal()

    matched_fields = 0
    match_count = 0
    reasons: list[str] = []
    for field_name in _PROFILE_VOCABULARY_FIELDS:
        value = _profile_field_text(profile, field_name)
        field_tokens = comparison_tokens(
            truncate_comparison_text(value, _PROFILE_VOCABULARY_FIELD_MAX_CHARS)
        )
        if not field_tokens:
            continue
        overlap = flexible_token_overlap_details(field_tokens, text_tokens)
        if not overlap.count:
            continue
        matched_fields += 1
        match_count += min(2, overlap.count)
        for reason in overlap.reasons:
            reasons.append(f"profile_{field_name}_{reason}")

    if not match_count:
        return ProfileVocabularySignal(theme=comparison_theme(text_tokens))

    # A ranking tiebreaker, not a score or qualification decision: a few
    # independent brief fields are sufficient to earn the maximum signal.
    score = min(1.0, (match_count + max(0, matched_fields - 1)) / 5.0)
    return ProfileVocabularySignal(
        score=score,
        reasons=tuple(dict.fromkeys(reasons)),
        theme=comparison_theme(text_tokens),
    )


def comparison_theme(value: str | set[str]) -> str | None:
    """Return one coarse, auditable topic key for fair candidate ordering."""

    tokens = value if isinstance(value, set) else comparison_tokens(value)
    ranked_groups = sorted(
        (
            (sum(token in group for token in tokens), group_name)
            for group_name, group in _RELATED_TOKEN_GROUPS
        ),
        key=lambda item: (-item[0], item[1]),
    )
    return ranked_groups[0][1] if ranked_groups and ranked_groups[0][0] else None


def _profile_field_text(profile: Any, field_name: str) -> str:
    if isinstance(profile, Mapping):
        try:
            value = profile.get(field_name)
        except Exception:
            return ""
    else:
        try:
            value = getattr(profile, field_name, None)
        except Exception:
            return ""
    if isinstance(value, (list, tuple, set)):
        return " ".join(
            normalized for item in value if (normalized := normalize_comparison_text(item))
        )
    return normalize_comparison_text(value)


def _relation_priority(relation: str) -> int:
    return {"exact": 3, "partial": 2, "synonym": 1}[relation]


def _token_relation(left: str, right: str) -> str | None:
    if left == right:
        return "exact"
    left_root = _token_root(left)
    right_root = _token_root(right)
    if len(left_root) >= 5 and len(right_root) >= 5 and (
        left_root.startswith(right_root) or right_root.startswith(left_root)
    ):
        return "partial"
    if any(left in group and right in group for _, group in _RELATED_TOKEN_GROUPS):
        return "synonym"
    return None


def _tokens_are_related(left: str, right: str) -> bool:
    return _token_relation(left, right) is not None


def truncate_comparison_text(value: Any, maximum_chars: int) -> str:
    """Bound evaluator payload size while preserving whole-word source text."""

    normalized = normalize_comparison_text(value)
    if maximum_chars <= 0 or len(normalized) <= maximum_chars:
        return normalized

    marker = " [truncated]"
    # Environment limits can intentionally be very small during a constrained
    # rollout. In that case the marker itself cannot fit, so preserving the
    # advertised hard cap is more important than adding an annotation.
    if maximum_chars <= len(marker):
        return normalized[:maximum_chars]
    cutoff = max(1, maximum_chars - len(marker))
    boundary = normalized.rfind(" ", 0, cutoff)
    if boundary < max(1, cutoff // 2):
        boundary = cutoff
    return f"{normalized[:boundary].rstrip()}{marker}"


def _token_root(value: str) -> str:
    if value.endswith("ies") and len(value) > 5:
        return f"{value[:-3]}y"
    for suffix in ("ization", "ation", "ments", "ment", "ing", "ed", "es", "s"):
        if value.endswith(suffix) and len(value) - len(suffix) >= 4:
            return value[: -len(suffix)]
    return value
