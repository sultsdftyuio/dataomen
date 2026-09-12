"""Product-aware source selection for the public discovery pipeline."""

from __future__ import annotations

import re

from api.services.verifier import ServiceProfile


TECHNICAL_CONTEXT_TERMS = frozenset(
    {
        "api",
        "architecture",
        "backend",
        "cloud",
        "code",
        "database",
        "developer",
        "developers",
        "devops",
        "engineering",
        "frontend",
        "infrastructure",
        "integration",
        "integrations",
        "kubernetes",
        "observability",
        "sdk",
        "security",
    }
)
OPEN_SOURCE_CONTEXT_TERMS = frozenset(
    {
        "github",
        "open-source",
        "open source",
        "oss",
        "repository",
        "self-hosted",
        "self hosted",
    }
)
COMMERCE_CONTEXT_TERMS = frozenset(
    {
        "commerce",
        "ecommerce",
        "etsy",
        "listing",
        "listings",
        "marketplace",
        "seo",
        "shop",
        "shopify",
        "store",
        "stores",
    }
)
SOURCE_ORDER = (
    "hackernews",
    "bluesky",
    "stackexchange",
    "github",
    "lemmy",
)


def _profile_context(profile: ServiceProfile) -> str:
    return " ".join(
        (
            profile.one_liner,
            profile.core_problem_solved,
            *profile.key_value_propositions,
            *profile.target_audience,
            *profile.ideal_customer_pain_points,
            *profile.use_cases,
            *profile.buying_triggers,
        )
    ).casefold()


def _has_context_term(context: str, tokens: set[str], terms: frozenset[str]) -> bool:
    return any(term in context if " " in term else term in tokens for term in terms)


def profile_source_preferences(profile: ServiceProfile) -> tuple[str, ...]:
    """Choose bounded public sources from product-owned website context.

    Hacker News and Bluesky remain complementary baseline public discussion
    sources. Technical Q&A, repositories, and independent technical forums are
    selected only when the product itself indicates that context. This keeps a
    finance, design, or operations profile from spending a first pass on noisy
    implementation tickets while preserving legitimate technical demand.
    """

    context = _profile_context(profile)
    tokens = set(re.findall(r"[a-z0-9][a-z0-9_-]*", context))
    is_technical = _has_context_term(context, tokens, TECHNICAL_CONTEXT_TERMS)
    is_open_source = _has_context_term(context, tokens, OPEN_SOURCE_CONTEXT_TERMS)
    is_commerce = _has_context_term(context, tokens, COMMERCE_CONTEXT_TERMS)

    # X remains the existing bounded, paid fallback after the selected free
    # sources fail to find plausible evidence. It is not a first-pass community
    # in the dashboard plan and it never runs in a focused Watchlist unless a
    # customer explicitly selects it.
    selected = {"hackernews", "bluesky", "x"}
    if is_technical or is_commerce:
        selected.add("stackexchange")
    if is_open_source:
        selected.add("github")
    if is_technical or is_open_source:
        selected.add("lemmy")

    return tuple(source for source in SOURCE_ORDER if source in selected) + (
        ("x",) if "x" in selected else ()
    )
