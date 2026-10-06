"""Near-duplicate fingerprint for a crawled website's Markdown.

Profile extraction is cached by an exact hash of the crawl.  A live website is
almost never byte-identical a day later: a copyright year, a rotating quote, or
a counter changes the hash, and the scheduled recrawl then pays for a fresh
model extraction of a site that says the same thing.  The rewritten profile
also gets a new embedding, which discards every cached verifier verdict for
the workspace, so the next scan re-verifies posts it had already judged.

This fingerprint is a SimHash over word shingles: similar text produces
fingerprints that differ in few bits.  It only ever widens the existing cache
to "the site is effectively unchanged"; a real rewrite still misses and is
extracted again.
"""

from __future__ import annotations

import hashlib
import os
import re

_FINGERPRINT_BITS = 64
_SHINGLE_WORDS = 3
# Pure numbers are dropped: dates, prices, and counters are the most common
# day-to-day churn and say nothing about what the product is.
_WORD_PATTERN = re.compile(r"[a-z][a-z0-9]*")

# Measured on synthetic sites: a 0.1% edit always stays within four bits, a 1%
# edit usually does, and a 25% rewrite never came closer than eleven. The
# estimate is noisy between those, so this errs toward extracting again.
DEFAULT_MAX_FINGERPRINT_DISTANCE = 4


def markdown_fingerprint(markdown: str) -> str:
    """Return a 16-hex-character SimHash, or "" when there is no usable text."""

    words = _WORD_PATTERN.findall((markdown or "").casefold())
    if len(words) < _SHINGLE_WORDS:
        return ""
    shingles = {
        " ".join(words[index : index + _SHINGLE_WORDS])
        for index in range(len(words) - _SHINGLE_WORDS + 1)
    }

    balance = [0] * _FINGERPRINT_BITS
    for shingle in shingles:
        digest = hashlib.blake2b(shingle.encode("utf-8"), digest_size=8).digest()
        value = int.from_bytes(digest, "big")
        for bit in range(_FINGERPRINT_BITS):
            balance[bit] += 1 if (value >> bit) & 1 else -1

    fingerprint = 0
    for bit in range(_FINGERPRINT_BITS):
        if balance[bit] > 0:
            fingerprint |= 1 << bit
    return f"{fingerprint:016x}"


def fingerprint_distance(left: str, right: str) -> int | None:
    """Differing bits between two fingerprints, or None if either is unusable."""

    try:
        if len(left) != 16 or len(right) != 16:
            return None
        return bin(int(left, 16) ^ int(right, 16)).count("1")
    except (TypeError, ValueError):
        return None


def fingerprints_match(
    left: object,
    right: object,
    *,
    max_distance: int = DEFAULT_MAX_FINGERPRINT_DISTANCE,
) -> bool:
    """True when both fingerprints exist and describe effectively the same text."""

    if not isinstance(left, str) or not isinstance(right, str) or not left or not right:
        return False
    distance = fingerprint_distance(left, right)
    return distance is not None and distance <= max_distance


def near_duplicate_cache_enabled() -> bool:
    """On by default; a deployment can return to exact-hash caching only."""

    return os.getenv(
        "ARCLI_PROFILE_NEAR_DUPLICATE_CACHE_ENABLED",
        "true",
    ).strip().casefold() in {"1", "true", "yes", "on"}


def is_near_duplicate_crawl(stored_fingerprint: object, current_fingerprint: object) -> bool:
    """Whether a stored extraction may be reused for the current crawl."""

    return near_duplicate_cache_enabled() and fingerprints_match(
        stored_fingerprint,
        current_fingerprint,
    )


__all__ = [
    "DEFAULT_MAX_FINGERPRINT_DISTANCE",
    "fingerprint_distance",
    "fingerprints_match",
    "is_near_duplicate_crawl",
    "markdown_fingerprint",
    "near_duplicate_cache_enabled",
]
