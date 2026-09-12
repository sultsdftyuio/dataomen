"""Classify low-value public-post roles before expensive lead evaluation.

The classifier is deliberately narrow.  It recognizes publication formats that
often contain the same product vocabulary as buyer conversations (job ads and
repository implementation tickets), but it does not decide lead eligibility.
Callers retain posts that also show a real solution-evaluation or workflow-pain
signal.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import re
from typing import Any

from .comparison import normalize_comparison_text, post_comparison_text


_JOB_LISTING_PATTERN = re.compile(
    r"\b(?:we(?:['’]re|\s+are)|our\s+(?:team|company)|join\s+(?:our|the)\s+team)"
    r"\s+(?:actively\s+)?hiring\b|"
    r"\bhiring\s+(?:for\s+)?(?:a|an|the|senior|junior|lead|staff|principal|"
    r"full[-\s]?time|part[-\s]?time|contract)\b|"
    r"\b(?:job\s+(?:opening|posting|description)|open\s+(?:role|position)|"
    r"apply\s+(?:now|here)|submit\s+(?:your\s+)?(?:resume|cv)|"
    r"(?:salary|compensation)\s+(?:range|package))\b",
    re.IGNORECASE,
)
_TICKET_TITLE_PATTERN = re.compile(
    r"^\s*(?:\[?(?:bug|feature|enhancement|chore|docs?|rfc|proposal|task|epic)\]?"
    r"\s*[:\-]|(?:fix|feat|chore|docs|refactor|implement|migrate|upgrade|"
    r"add|remove|update)\b)",
    re.IGNORECASE,
)
_TICKET_STRUCTURE_PATTERN = re.compile(
    r"\b(?:pull\s+request|merge\s+(?:this|the)|acceptance\s+criteria|"
    r"steps?\s+to\s+reproduce|expected\s+behavio(?:u)?r|actual\s+behavio(?:u)?r|"
    r"reproduction|sprint|milestone|backlog|checklist)\b",
    re.IGNORECASE,
)
_TICKET_IMPLEMENTATION_PATTERN = re.compile(
    r"\b(?:implement|refactor|fix|migrate|upgrade|add|remove|update)\b"
    r"[\s\S]{0,80}\b(?:api|endpoint|component|code|test(?:s)?|ci|build|"
    r"dependency|tailwind|css|database|schema)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ContentRoleAssessment:
    """Cheap, explainable role metadata for source-priority decisions."""

    is_job_listing: bool = False
    is_implementation_ticket: bool = False
    reasons: tuple[str, ...] = ()

    @property
    def is_low_value_role(self) -> bool:
        return self.is_job_listing or self.is_implementation_ticket

    @property
    def priority_penalty(self) -> int:
        """Return a bounded non-decisive priority penalty."""

        if self.is_job_listing and self.is_implementation_ticket:
            return 10
        if self.is_job_listing:
            return 8
        if self.is_implementation_ticket:
            return 6
        return 0


def assess_public_post_content_role(post: Any) -> ContentRoleAssessment:
    """Identify job ads and generic GitHub work items without source contracts.

    A GitHub source alone is not enough to classify a post as an implementation
    ticket: buyer-authored questions and tool complaints can appear there too.
    We require a recognizable issue/PR structure or conventional work-item
    title, leaving the caller to decide whether an otherwise low-value role has
    enough buyer evidence to remain eligible.
    """

    text = post_comparison_text(post)
    normalized = text.casefold()
    source = _post_value(post, "source").casefold()
    title = _post_value(post, "title")

    is_job_listing = bool(_JOB_LISTING_PATTERN.search(normalized))
    is_implementation_ticket = source == "github" and bool(
        _TICKET_TITLE_PATTERN.search(title)
        or _TICKET_STRUCTURE_PATTERN.search(normalized)
        or _TICKET_IMPLEMENTATION_PATTERN.search(normalized)
    )

    reasons: list[str] = []
    if is_job_listing:
        reasons.append("job_listing_context")
    if is_implementation_ticket:
        reasons.append("generic_implementation_ticket")
    return ContentRoleAssessment(
        is_job_listing=is_job_listing,
        is_implementation_ticket=is_implementation_ticket,
        reasons=tuple(reasons),
    )


def _post_value(post: Any, name: str) -> str:
    """Read optional provider fields without allowing malformed adapters to fail."""

    try:
        value = post.get(name) if isinstance(post, Mapping) else getattr(post, name, None)
    except Exception:
        return ""
    return normalize_comparison_text(value)
