"""Cheap, explainable ranking signals for broad public lead discovery."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Sequence

from .models import PublicSourcePostRef


_FIRST_PERSON_PATTERN = re.compile(r"\b(?:i|we|my|our|us)\b", re.IGNORECASE)
_HIGH_INTENT_PATTERN = re.compile(
    r"\b(?:looking\s+for|recommend(?:ation|ations)?|evaluat(?:e|ing)|"
    r"demo|trial|pricing|budget|switch(?:ing)?|replace|alternatives?\s+to)\b",
    re.IGNORECASE,
)
_PROBLEM_PATTERN = re.compile(
    r"\b(?:need(?:s)?|help|struggl(?:e|ing)|stuck|too\s+manual|"
    r"takes?\s+too\s+long|dropped|dropping|stalled|failing|losing)\b",
    re.IGNORECASE,
)
_COMMERCIAL_CONTEXT_PATTERN = re.compile(
    r"\b(?:b2b|business(?:es)?|compan(?:y|ies)|startup|saas|sales|"
    r"pipeline|revenue|demo(?:s)?|outbound|sdrs?|customer(?:s)?|"
    r"marketing|agency)\b",
    re.IGNORECASE,
)
_BUYING_TRIGGER_PATTERN = re.compile(
    r"\b(?:hiring|recruiting|funding|fundraised|raised\s+\$|expanding|"
    r"launch(?:ing|ed)?|new\s+market|new\s+team|procurement|rfp)\b",
    re.IGNORECASE,
)
_PUBLISHER_PATTERN = re.compile(
    r"\b(?:show\s+hn|tutorial|guide|case\s+study|changelog|"
    r"release\s+notes|blog\s+post)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class LeadSignalScore:
    """A non-decisive, auditable priority score for one public post."""

    score: int
    reasons: tuple[str, ...]


def _post_text(post: Any) -> str:
    title = str(getattr(post, "title", "") or "")
    body = str(
        getattr(post, "body", None)
        or getattr(post, "text", "")
        or ""
    )
    return " ".join(part for part in (title, body) if part).strip()


def lead_signal_score(post: Any) -> LeadSignalScore:
    """Rank likely buyer evidence without excluding broad, adjacent prospects."""

    text = _post_text(post)
    normalized = text.casefold()
    score = 0
    reasons: list[str] = []

    if _HIGH_INTENT_PATTERN.search(normalized):
        score += 5
        reasons.append("active_solution_evaluation")
    if _PROBLEM_PATTERN.search(normalized):
        score += 3
        reasons.append("stated_problem_or_urgency")
    if _FIRST_PERSON_PATTERN.search(normalized):
        score += 2
        reasons.append("first_person_context")
    if _COMMERCIAL_CONTEXT_PATTERN.search(normalized):
        score += 3
        reasons.append("commercial_context")
    if _BUYING_TRIGGER_PATTERN.search(normalized):
        score += 3
        reasons.append("company_buying_trigger")

    author = str(getattr(post, "author", "") or "").strip()
    if author and author.casefold() not in {"anonymous", "unknown"}:
        score += 1
        reasons.append("identifiable_author")
    if _PUBLISHER_PATTERN.search(normalized):
        score -= 3
        reasons.append("publisher_context")

    return LeadSignalScore(max(0, min(100, score)), tuple(reasons))


def has_buying_trigger(post: Any) -> bool:
    """Recognise company change signals that need not be first-person posts."""

    return bool(_BUYING_TRIGGER_PATTERN.search(_post_text(post)))


def source_post_ref_signal(ref: Any) -> LeadSignalScore:
    """Read transient ranking metadata while accepting legacy ref shapes."""

    if isinstance(ref, dict):
        score_value = ref.get("lead_signal_score", 0)
        reasons_value = ref.get("lead_signal_reasons", ())
    else:
        score_value = getattr(ref, "lead_signal_score", 0)
        reasons_value = getattr(ref, "lead_signal_reasons", ())

    try:
        score = max(0, min(100, int(score_value)))
    except (TypeError, ValueError):
        score = 0
    reasons = (
        tuple(str(reason) for reason in reasons_value if str(reason))
        if isinstance(reasons_value, (list, tuple, set))
        else ()
    )
    return LeadSignalScore(score=score, reasons=reasons)


def prioritized_source_post_refs(posts: Sequence[Any]) -> list[PublicSourcePostRef]:
    """Return source refs ordered by buyer potential, keeping every candidate."""

    candidates: list[tuple[Any, str, str, LeadSignalScore, str | None]] = []
    group_counts: dict[str, int] = {}
    for post in posts:
        source = str(getattr(post, "source", "") or "").strip()
        source_post_id = str(getattr(post, "source_post_id", "") or "").strip()
        if not source or not source_post_id:
            continue
        author = str(getattr(post, "author", "") or "").strip().casefold()
        group = (
            f"{source.casefold()}:{author}"
            if author and author not in {"anonymous", "unknown"}
            else None
        )
        if group:
            group_counts[group] = group_counts.get(group, 0) + 1
        candidates.append((post, source, source_post_id, lead_signal_score(post), group))

    refs: dict[tuple[str, str], PublicSourcePostRef] = {}
    for _post, source, source_post_id, signal, group in candidates:
        group_boost = min(3, max(0, group_counts.get(group or "", 0) - 1))
        reasons = signal.reasons + (("repeat_author_signal",) if group_boost else ())
        ref = PublicSourcePostRef(
            source=source,
            source_post_id=source_post_id,
            lead_signal_score=signal.score + group_boost,
            lead_signal_reasons=reasons,
            lead_signal_group=group,
        )
        key = (ref.source.casefold(), ref.source_post_id)
        previous = refs.get(key)
        if previous is None or ref.lead_signal_score > previous.lead_signal_score:
            refs[key] = ref

    return sorted(
        refs.values(),
        key=lambda ref: (-ref.lead_signal_score, ref.source.casefold(), ref.source_post_id),
    )
