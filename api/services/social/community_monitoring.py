"""Community scopes for customer-defined public-conversation watchlists.

The watchlist schema already stores ``suggested_places``. This module turns
explicit source-prefixed entries into matching boundaries without treating a
free-form community label as a brittle hard filter.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable
from urllib.parse import urlsplit


_SUPPORTED_SOURCES = frozenset({"github", "stackexchange", "lemmy", "bluesky"})
_SOURCE_ALIASES = {
    "stack": "stackexchange",
    "stack-overflow": "stackexchange",
    "hn": "hackernews",
    "hacker_news": "hackernews",
    "bsky": "bluesky",
}


@dataclass(frozen=True)
class CommunityTarget:
    """One enforceable source-specific community or place selector."""

    source: str
    selector: str
    label: str


def _clean(value: object, *, limit: int = 250) -> str:
    return " ".join(str(value or "").split())[:limit].strip()


def _source_name(value: str) -> str:
    normalized = value.strip().casefold()
    return _SOURCE_ALIASES.get(normalized, normalized)


def _target_from_url(raw: str) -> CommunityTarget | None:
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return None
    host = (parsed.hostname or "").casefold()
    parts = [part for part in parsed.path.split("/") if part]
    if host.endswith("github.com") and len(parts) >= 2:
        selector = f"{parts[0]}/{parts[1]}".casefold()
        return CommunityTarget("github", selector, raw)
    if host.endswith("stackexchange.com") or host == "stackoverflow.com":
        selector = host.split(".", 1)[0]
        return CommunityTarget("stackexchange", selector, raw)
    if "/c/" in parsed.path and parts:
        try:
            selector = parts[parts.index("c") + 1]
        except (ValueError, IndexError):
            selector = ""
        if selector:
            return CommunityTarget("lemmy", selector.casefold(), raw)
    if host.endswith("bsky.app") and len(parts) >= 2 and parts[0] == "profile":
        return CommunityTarget("bluesky", parts[1].lstrip("@").casefold(), raw)
    return None


def parse_community_targets(values: Iterable[object]) -> tuple[CommunityTarget, ...]:
    """Parse bounded, explicit selectors from stored watchlist places.

    Supported examples: ``github:owner/repo``, ``stackexchange:stackoverflow``,
    ``lemmy:saas``, and ``bluesky:founder.example``. Other free-text values
    remain useful human context but deliberately do not hide posts merely
    because a provider did not return community metadata for them.
    """

    targets: list[CommunityTarget] = []
    seen: set[tuple[str, str]] = set()
    for value in values:
        raw = _clean(value)
        if not raw:
            continue
        target = _target_from_url(raw) if raw.startswith(("http://", "https://")) else None
        if target is None and ":" in raw:
            raw_source, raw_selector = raw.split(":", 1)
            source = _source_name(raw_source)
            selector = _clean(raw_selector, limit=160).lstrip("@").casefold()
            if source in _SUPPORTED_SOURCES and selector:
                target = CommunityTarget(source, selector, raw)
        if target is None:
            continue
        key = (target.source, target.selector)
        if key in seen:
            continue
        seen.add(key)
        targets.append(target)
        if len(targets) >= 8:
            break
    return tuple(targets)


def community_target_payloads(
    targets: Iterable[CommunityTarget],
) -> list[dict[str, str]]:
    return [
        {"source": target.source, "selector": target.selector, "label": target.label}
        for target in targets
    ]


def post_matches_community_targets(post: Any, targets: Iterable[CommunityTarget]) -> bool:
    """Return whether a post is inside an explicit scope for its source.

    A target only constrains its own source. This prevents a GitHub repository
    selector from accidentally excluding a useful Hacker News discussion in
    the same buyer group while still making community-aware sources precise.
    """

    source = _source_name(_clean(getattr(post, "source", ""), limit=64))
    scoped_targets = [target for target in targets if target.source == source]
    if not scoped_targets:
        return True

    metadata = getattr(post, "metadata", None)
    metadata = metadata if isinstance(metadata, dict) else {}
    values = (
        _clean(getattr(post, "community", "")),
        _clean(getattr(post, "author", "")),
        _clean(getattr(post, "url", "")),
        _clean(metadata.get("community")),
        _clean(metadata.get("repository")),
    )
    haystack = "\n".join(value.casefold() for value in values if value)
    if not haystack:
        return False
    return any(target.selector in haystack for target in scoped_targets)
