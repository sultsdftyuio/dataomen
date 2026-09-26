from __future__ import annotations

import pytest

from api.services.prospecting.official_site_generation import (
    MAX_CANDIDATES_PER_RUN,
    MAX_SEED_INPUTS_PER_RUN,
    OfficialSiteGenerationLimits,
    OfficialSiteGenerationRequest,
    plan_official_site_generation,
)


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"


def _request(
    *,
    seed_urls: list[str] | None = None,
    explicit_request: bool = True,
    profile_version: str = "2026-09-23T08:00:00Z",
) -> OfficialSiteGenerationRequest:
    return OfficialSiteGenerationRequest(
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        profile_version=profile_version,
        target_types=["Account", "project", "account"],
        seed_urls=seed_urls or ["https://Acme.example/launch?utm_source=test#top"],
        explicit_request=explicit_request,
    )


def test_explicit_run_plans_a_bounded_unclassified_official_site_scope() -> None:
    plan = plan_official_site_generation(_request())
    seed = plan.seed_plans[0]

    assert plan.run_kind == "candidate_generation"
    assert plan.target_types == ("account", "project")
    assert plan.planned_seed_count == 1
    assert plan.planned_candidate_limit == 8
    assert len(plan.input_fingerprint) == 64

    assert seed.decision == "planned"
    assert seed.skip_reason is None
    assert seed.seed_url == "https://acme.example/launch"
    assert seed.origin_url == "https://acme.example"
    assert seed.origin_kind == "official_site"
    assert seed.source_kind == "official_site"
    assert seed.allowed_candidate_kinds == ("account", "project")
    assert seed.entity_kind is None
    assert seed.requires_official_site_classification is True
    assert seed.page_limit == 6
    assert seed.candidate_limit == 8
    assert seed.same_origin_only is True
    assert seed.allow_cross_origin_redirects is False
    assert seed.allow_external_site_links is False
    assert seed.allow_social_lookup is False
    assert seed.allow_public_source_search is False
    assert seed.allow_author_history is False
    assert seed.allow_private_sources is False
    assert seed.requires_dns_revalidation is True


def test_generation_needs_an_explicit_user_request() -> None:
    plan = plan_official_site_generation(_request(explicit_request=False))
    seed = plan.seed_plans[0]

    assert seed.decision == "skipped"
    assert seed.skip_reason == "candidate_generation_not_explicitly_requested"
    assert seed.page_limit == 0
    assert seed.candidate_limit == 0
    assert seed.allow_social_lookup is False


def test_run_deduplicates_seeds_caps_work_and_fairly_allocates_candidates() -> None:
    limits = OfficialSiteGenerationLimits(
        seed_limit=3,
        page_limit_per_seed=2,
        candidate_limit_per_seed=4,
        candidate_limit_total=10,
    )
    plan = plan_official_site_generation(
        _request(
            seed_urls=[
                "https://one.example",
                "https://two.example",
                "https://one.example/?tracking=duplicate",
                "https://three.example",
                "https://four.example",
            ]
        ),
        limits=limits,
    )

    assert plan.planned_seed_count == 3
    assert plan.planned_candidate_limit == 10
    assert [seed.candidate_limit for seed in plan.seed_plans if seed.is_planned] == [4, 3, 3]
    assert plan.seed_plans[2].skip_reason == "duplicate_seed_url"
    assert plan.seed_plans[4].skip_reason == "seed_limit_reached"
    assert all(seed.page_limit == 2 for seed in plan.seed_plans if seed.is_planned)


@pytest.mark.parametrize(
    "seed_url",
    [
        "https://localhost:3000",
        "http://127.0.0.1",
        "https://user:password@acme.example",
        "ftp://acme.example",
    ],
)
def test_seed_urls_share_the_public_http_and_private_host_boundary(seed_url: str) -> None:
    with pytest.raises(ValueError):
        _request(seed_urls=[seed_url])


def test_limits_and_input_list_are_hard_bounded() -> None:
    with pytest.raises(ValueError, match="candidate_limit_total"):
        OfficialSiteGenerationLimits(candidate_limit_total=MAX_CANDIDATES_PER_RUN + 1)
    with pytest.raises(ValueError, match="candidate_limit_total cannot exceed"):
        OfficialSiteGenerationLimits(
            seed_limit=3,
            candidate_limit_per_seed=2,
            candidate_limit_total=7,
        )
    with pytest.raises(ValueError, match="page_limit_per_seed must be an integer"):
        OfficialSiteGenerationLimits(page_limit_per_seed=True)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="seed_urls exceeds"):
        _request(
            seed_urls=[f"https://seed-{index}.example" for index in range(MAX_SEED_INPUTS_PER_RUN + 1)]
        )


def test_plan_fingerprint_changes_with_the_profile_snapshot() -> None:
    current = plan_official_site_generation(_request(profile_version="profile-v1"))
    revised = plan_official_site_generation(_request(profile_version="profile-v2"))

    assert current.input_fingerprint != revised.input_fingerprint
    assert current.seed_plans[0].seed_fingerprint != revised.seed_plans[0].seed_fingerprint
