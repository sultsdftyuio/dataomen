"""Stack Exchange site selection for discovery searches."""

from __future__ import annotations

import pytest

from api.services.social.additional_sources import (
    _additional_public_source_connector,
    _stackexchange_site_for_query,
)
from api.services.social.stackexchange_routing import routes_to_recommendation_site


@pytest.fixture(autouse=True)
def _default_routing(monkeypatch):
    monkeypatch.delenv("ARCLI_STACKEXCHANGE_SITE", raising=False)
    monkeypatch.delenv("ARCLI_STACKEXCHANGE_RECOMMENDATIONS_ENABLED", raising=False)


@pytest.mark.parametrize("query_type", ["recommendation_request", "category_tool_search"])
def test_a_request_for_a_tool_searches_the_recommendation_site(query_type: str) -> None:
    # The general sites close these questions as off-topic.
    assert _stackexchange_site_for_query("best api monitoring tool", query_type) == "softwarerecs"
    assert _stackexchange_site_for_query("best etsy listing tool", query_type) == "softwarerecs"


@pytest.mark.parametrize(
    "query_type",
    ["buyer_pain", "urgent_failure", "manual_workflow_frustration", "switching_trigger", None],
)
def test_problem_language_keeps_the_general_sites(query_type: str | None) -> None:
    assert _stackexchange_site_for_query("api requests timing out", query_type) == "stackoverflow"
    assert _stackexchange_site_for_query("etsy listing not ranking", query_type) == "webmasters"


def test_an_explicit_site_setting_still_wins(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_STACKEXCHANGE_SITE", "superuser")

    assert (
        _stackexchange_site_for_query("best api monitoring tool", "recommendation_request")
        == "superuser"
    )


def test_the_previous_routing_is_one_setting_away(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_STACKEXCHANGE_RECOMMENDATIONS_ENABLED", "false")

    assert not routes_to_recommendation_site("recommendation_request")
    assert (
        _stackexchange_site_for_query("best api monitoring tool", "recommendation_request")
        == "stackoverflow"
    )


def test_the_connector_is_built_for_the_routed_site() -> None:
    routed = _additional_public_source_connector(
        "stackexchange",
        query="best api monitoring tool",
        query_type="recommendation_request",
    )
    general = _additional_public_source_connector(
        "stackexchange",
        query="api requests timing out",
        query_type="urgent_failure",
    )
    # A plan-level or customer target outranks per-query routing.
    targeted = _additional_public_source_connector(
        "stackexchange",
        query="api requests timing out",
        query_type="urgent_failure",
        community_selector="softwarerecs",
    )

    assert routed.site == "softwarerecs"
    assert general.site == "stackoverflow"
    assert targeted.site == "softwarerecs"
