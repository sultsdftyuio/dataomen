"""Cheap, explainable ranking signals for broad public lead discovery."""

from __future__ import annotations

import re
from dataclasses import dataclass
from collections.abc import Mapping
from typing import Any, Sequence

from .comparison import post_comparison_text
from .content_roles import assess_public_post_content_role
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
_INDIRECT_INTENT_PATTERN = re.compile(
    r"\b(?:how\s+(?:do|should|can)\s+(?:i|we)|what(?:'s|\s+is)\s+(?:the\s+)?best|"
    r"which\s+(?:tool|approach|architecture|stack)|best\s+practi(?:ce|ces)|"
    r"architect(?:ure|ural)|integrat(?:e|ing|ion)|migrat(?:e|ing|ion)|scale(?:able|\s+this)?)\b",
    re.IGNORECASE,
)
_TOOL_FRICTION_PATTERN = re.compile(
    r"\b(?:frustrat(?:ed|ing|ion)|workaround|bottleneck|spreadsheet(?:s)?|"
    r"copy(?:ing)?\s*(?:and|&)\s*past(?:e|ing)|re-?enter(?:ing)?|"
    r"(?:tool|software|platform|stack)\s+(?:is\s+)?(?:broken|slow|expensive|unreliable)|"
    r"(?:fragmented|disconnected|scattered)\s+(?:across|between)\s+"
    r"(?:tools?|platforms?|systems?)|"
    r"(?:design|developer|dev)?\s*handoff\s+(?:is\s+)?"
    r"(?:broken|slow|manual|fragmented|causing\s+rework)|"
    r"(?:tool\s+sprawl|context\s+switching))\b",
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
    return post_comparison_text(post)


def lead_signal_score(post: Any) -> LeadSignalScore:
    """Rank likely buyer evidence without excluding broad, adjacent prospects.

    Job ads and repository work items can share a product's vocabulary while
    still being poor use of a verifier call.  They remain in the score rather
    than being deleted here, so a real buyer complaint can still be recovered
    by the admission and verifier stages.
    """

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
    if _INDIRECT_INTENT_PATTERN.search(normalized):
        score += 2
        reasons.append("indirect_problem_investigation")
    if _TOOL_FRICTION_PATTERN.search(normalized):
        score += 3
        reasons.append("existing_tool_or_manual_workflow_friction")
    if _FIRST_PERSON_PATTERN.search(normalized):
        score += 2
        reasons.append("first_person_context")
    if _COMMERCIAL_CONTEXT_PATTERN.search(normalized):
        score += 3
        reasons.append("commercial_context")
    if _BUYING_TRIGGER_PATTERN.search(normalized):
        score += 3
        reasons.append("company_buying_trigger")

    author = str(
        getattr(post, "author", None) or getattr(post, "author_handle", "") or ""
    ).strip()
    if author and author.casefold() not in {"anonymous", "unknown"}:
        score += 1
        reasons.append("identifiable_author")
    if _PUBLISHER_PATTERN.search(normalized):
        score -= 3
        reasons.append("publisher_context")

    role = assess_public_post_content_role(post)
    if role.priority_penalty:
        score -= role.priority_penalty
        reasons.extend(role.reasons)

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


def prioritized_source_post_refs(
    posts: Sequence[Any],
    *,
    admission_reasons_by_ref: Mapping[tuple[str, str], Sequence[str]] | None = None,
) -> list[PublicSourcePostRef]:
    """Return source refs ordered by buyer potential, keeping every candidate.

    Admission reasons are explainability metadata only. They do not inflate the
    priority score, which remains tied to the cheap buyer-signal scorer.
    """

    candidates: list[tuple[Any, str, str, LeadSignalScore, str | None]] = []
    group_counts: dict[str, int] = {}
    for post in posts:
        source = str(getattr(post, "source", "") or "").strip()
        source_post_id = str(getattr(post, "source_post_id", "") or "").strip()
        if not source or not source_post_id:
            continue
        author = str(
            getattr(post, "author", None) or getattr(post, "author_handle", "") or ""
        ).strip().casefold()
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
        admission_reasons = ()
        if admission_reasons_by_ref:
            admission_reasons = tuple(
                str(reason)
                for reason in admission_reasons_by_ref.get(
                    (source.casefold(), source_post_id),
                    (),
                )
                if str(reason)
            )
        reasons = tuple(
            dict.fromkeys(
                signal.reasons
                + (("repeat_author_signal",) if group_boost else ())
                + admission_reasons
            )
        )
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
