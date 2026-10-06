"""Which Stack Exchange site a discovery search belongs on.

Stack Overflow and Webmasters close "which tool should I use" questions as
off-topic; the network sends them to Software Recommendations instead.  That
site is the one place on the network where every question is a person
evaluating software, so it is useful to every profile, including the
non-technical ones that previously had no Stack Exchange coverage at all.

Routing replaces the site for a query rather than adding a second search.
The anonymous API allowance is shared by every workspace on the worker's IP
address, so an extra request per query would shorten everyone's coverage.
"""

from __future__ import annotations

import os

RECOMMENDATION_SITE = "softwarerecs"

# Phrases of these types read as a request for a tool, which the general sites
# reject and the recommendation site exists to answer.
RECOMMENDATION_QUERY_TYPES = frozenset(
    {
        "recommendation_request",
        "category_tool_search",
    }
)


def stackexchange_recommendations_enabled() -> bool:
    """On by default; lets a deployment return to the previous routing."""

    return os.getenv(
        "ARCLI_STACKEXCHANGE_RECOMMENDATIONS_ENABLED",
        "true",
    ).strip().casefold() in {"1", "true", "yes", "on"}


def routes_to_recommendation_site(query_type: str | None) -> bool:
    """True when this query type should search Software Recommendations."""

    return (
        stackexchange_recommendations_enabled()
        and (query_type or "").strip().casefold() in RECOMMENDATION_QUERY_TYPES
    )


def recommendation_only_target() -> dict[str, str]:
    """Community target that confines a profile to the recommendation site.

    A profile with no technical or commerce context has nothing to find on
    Stack Overflow or Webmasters, so all of its phrases search this one site.
    """

    return {
        "source": "stackexchange",
        "selector": RECOMMENDATION_SITE,
        "label": "Stack Exchange: Software Recommendations",
    }


__all__ = [
    "RECOMMENDATION_QUERY_TYPES",
    "RECOMMENDATION_SITE",
    "recommendation_only_target",
    "routes_to_recommendation_site",
    "stackexchange_recommendations_enabled",
]
