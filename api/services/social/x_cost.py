"""Spend sizing for the paid X fallback.

X is the only discovery source that is billed per use.  The request count is
already capped per activation, per workspace per day, and per workspace per
month.  This module caps the other half of the bill: how many posts a single
request returns.  Free sources share one deeper page size, so X needs its own
smaller one instead of inheriting theirs.
"""

from __future__ import annotations

from api.services.cost_controls import env_int

# The recent-search endpoint rejects a page smaller than 10 or larger than 100.
X_MIN_POSTS_PER_REQUEST = 10
X_MAX_POSTS_PER_REQUEST = 100
DEFAULT_X_FALLBACK_POSTS = 25


def x_fallback_posts_per_request(requested: int | None = None) -> int:
    """Return the page size for one paid X request.

    ``requested`` is the caller's free-source page size.  It can lower the
    result but never raise it above the configured paid ceiling.
    """

    ceiling = max(
        X_MIN_POSTS_PER_REQUEST,
        min(
            X_MAX_POSTS_PER_REQUEST,
            env_int("ARCLI_INITIAL_PUBLIC_X_FALLBACK_POSTS", DEFAULT_X_FALLBACK_POSTS),
        ),
    )
    if requested is None or requested < 1:
        return ceiling
    return max(X_MIN_POSTS_PER_REQUEST, min(ceiling, requested))


__all__ = [
    "DEFAULT_X_FALLBACK_POSTS",
    "X_MAX_POSTS_PER_REQUEST",
    "X_MIN_POSTS_PER_REQUEST",
    "x_fallback_posts_per_request",
]
