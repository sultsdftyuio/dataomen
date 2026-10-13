"""The one-way lifecycle of a discovery candidate.

The database enforces these transitions with a trigger
(``scripts/discovery_candidate_pool_contract.sql``). Workers re-evaluate the
same post on every rematch, retry and scheduled scan, so they must know which
advances still apply instead of asking the database to reject the rest.
"""

from __future__ import annotations

# Each target status, mapped to the statuses a candidate may hold just before
# it. The target itself is included: repeating an advance is a harmless refresh
# of its scores, not a transition.
_ADVANCEABLE_FROM: dict[str, tuple[str, ...]] = {
    "raw": ("raw",),
    "plausible": ("raw", "plausible"),
    "review": ("plausible", "review"),
    "qualified": ("review", "qualified"),
    "rejected": ("raw", "plausible", "review", "rejected"),
}


def advanceable_from(target_status: str) -> list[str]:
    """Return the current statuses from which ``target_status`` is reachable.

    An unknown target yields an empty list, which matches no candidate.
    """
    return list(_ADVANCEABLE_FROM.get(target_status, ()))
