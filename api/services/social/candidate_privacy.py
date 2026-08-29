"""Privacy boundaries for tenant-visible discovery-candidate snapshots."""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any


MAX_IDENTIFIER_CHARS = 120
MAX_SNAPSHOT_FIELDS = 40
MAX_SNAPSHOT_ITEMS = 40
MAX_SNAPSHOT_DEPTH = 4
MAX_SNAPSHOT_TEXT_CHARS = 16_000
MAX_EVIDENCE_TEXT_CHARS = 2_000

_SENSITIVE_KEYS = frozenset(
    {
        "api_key",
        "apikey",
        "authorization",
        "author",
        "author_handle",
        "cookie",
        "credential",
        "credentials",
        "email",
        "email_address",
        "password",
        "phone",
        "phone_number",
        "private_key",
        "secret",
        "token",
        "user_email",
        "username",
    }
)
_SNAPSHOT_TEXT_KEYS = frozenset(
    {
        "body",
        "community",
        "content",
        "excerpt",
        "external_id",
        "language",
        "published_at",
        "source",
        "text",
        "title",
        "url",
    }
)
_EVIDENCE_TEXT_KEYS = frozenset(
    {
        "criterion",
        "excerpt",
        "label",
        "matched_phrase",
        "rationale",
        "reason",
        "reason_code",
        "signal",
    }
)
_EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![\w.-])"
)
_SECRET_PATTERN = re.compile(
    r"(?i)\b(?:api[_-]?key|authorization|bearer|password|secret|token)"
    r"\s*(?:[:=]|\s)\s*[^\s,;]+"
)
_DROP = object()


def collapse_space(value: Any, *, maximum: int) -> str:
    """Normalize a bounded string without accepting a raw unbounded payload."""

    return re.sub(r"\s+", " ", str(value or "")).strip()[:maximum]


def redacted_text(value: Any, *, maximum: int) -> str:
    """Bound public text and remove obvious email/credential material."""

    normalized = collapse_space(value, maximum=maximum)
    normalized = _EMAIL_PATTERN.sub("[redacted-email]", normalized)
    return _SECRET_PATTERN.sub("[redacted-secret]", normalized)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _safe_unknown_string(value: Any) -> dict[str, Any]:
    normalized = collapse_space(value, maximum=MAX_SNAPSHOT_TEXT_CHARS)
    return {"sha256": _sha256(normalized), "length": len(str(value or ""))}


def _scrub_json_value(
    value: Any,
    *,
    key: str,
    text_keys: frozenset[str],
    maximum_text: int,
    depth: int = 0,
) -> Any:
    """Retain only known public review text; fingerprint unknown strings."""

    normalized_key = collapse_space(key, maximum=MAX_IDENTIFIER_CHARS).casefold()
    if normalized_key in _SENSITIVE_KEYS:
        return _DROP
    if depth >= MAX_SNAPSHOT_DEPTH:
        return "[truncated]"
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        if normalized_key in text_keys:
            return redacted_text(value, maximum=maximum_text)
        return _safe_unknown_string(value)
    if isinstance(value, Mapping):
        safe: dict[str, Any] = {}
        for raw_key, child in list(value.items())[:MAX_SNAPSHOT_FIELDS]:
            child_key = collapse_space(raw_key, maximum=MAX_IDENTIFIER_CHARS).casefold()
            if not child_key:
                continue
            scrubbed = _scrub_json_value(
                child,
                key=child_key,
                text_keys=text_keys,
                maximum_text=maximum_text,
                depth=depth + 1,
            )
            if scrubbed is not _DROP:
                safe[child_key] = scrubbed
        return safe
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        safe_items: list[Any] = []
        for child in list(value)[:MAX_SNAPSHOT_ITEMS]:
            scrubbed = _scrub_json_value(
                child,
                key=normalized_key,
                text_keys=text_keys,
                maximum_text=maximum_text,
                depth=depth + 1,
            )
            if scrubbed is not _DROP:
                safe_items.append(scrubbed)
        return safe_items
    return {"type": type(value).__name__}


def _safe_json_object(
    value: Mapping[str, Any] | None,
    *,
    text_keys: frozenset[str],
    maximum_text: int,
) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        return {}
    scrubbed = _scrub_json_value(
        value,
        key="",
        text_keys=text_keys,
        maximum_text=maximum_text,
    )
    return scrubbed if isinstance(scrubbed, dict) else {}


def sanitize_source_snapshot(value: Mapping[str, Any] | None) -> dict[str, Any]:
    """Create a bounded source snapshot without author/contact/secrets."""

    return _safe_json_object(
        value,
        text_keys=_SNAPSHOT_TEXT_KEYS,
        maximum_text=MAX_SNAPSHOT_TEXT_CHARS,
    )


def sanitize_candidate_evidence(value: Mapping[str, Any] | None) -> dict[str, Any]:
    """Create bounded evidence that retains only known review fields."""

    return _safe_json_object(
        value,
        text_keys=_EVIDENCE_TEXT_KEYS,
        maximum_text=MAX_EVIDENCE_TEXT_CHARS,
    )


__all__ = [
    "MAX_EVIDENCE_TEXT_CHARS",
    "MAX_IDENTIFIER_CHARS",
    "collapse_space",
    "redacted_text",
    "sanitize_candidate_evidence",
    "sanitize_source_snapshot",
]
