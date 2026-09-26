from __future__ import annotations

from dataclasses import replace

from api.services.prospecting.official_site_classifier import (
    OfficialSiteFetchedPage,
    classify_official_site_page,
)
from api.services.prospecting.official_site_generation import (
    OfficialSiteGenerationLimits,
    OfficialSiteGenerationRequest,
    plan_official_site_generation,
)


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"


def _seed_plan(
    *,
    target_types: list[str] | None = None,
    candidate_limit: int = 8,
):
    request = OfficialSiteGenerationRequest(
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        profile_version="profile-v1",
        target_types=target_types or ["account", "project", "builder"],
        seed_urls=["https://acme.example/launch?utm_source=test"],
        explicit_request=True,
    )
    limits = OfficialSiteGenerationLimits(
        seed_limit=1,
        page_limit_per_seed=1,
        candidate_limit_per_seed=candidate_limit,
        candidate_limit_total=candidate_limit,
    )
    return plan_official_site_generation(request, limits=limits).seed_plans[0]


def test_raw_seed_html_text_or_title_never_becomes_an_entity() -> None:
    plan = _seed_plan()
    page = OfficialSiteFetchedPage(
        "https://acme.example/launch",
        html='<script type="application/ld+json">{"@type":"Organization"}</script>',
        text="Acme is building a useful tool.",
        title="Acme — developer tools",
    )

    batch = classify_official_site_page(plan, page)

    assert batch.proposals == ()
    assert batch.skipped == ()


def test_json_ld_organization_produces_a_source_grounded_high_fit_account() -> None:
    plan = _seed_plan(target_types=["account"])
    page = OfficialSiteFetchedPage(
        "https://acme.example/about",
        json_ld=[
            {
                "@context": "https://schema.org",
                "@type": "Organization",
                "url": "https://acme.example/?tracking=ignored",
                "name": "Acme",
            }
        ],
    )

    proposal = classify_official_site_page(plan, page).proposals[0]

    assert proposal.assessment_state == "high_fit"
    assert proposal.entity.entity_kind == "account"
    assert proposal.entity.origin_kind == "official_site"
    assert proposal.entity.entity_provider == "official_site"
    assert proposal.entity.canonical_url == "https://acme.example/"
    assert proposal.entity.title == "Acme"
    assert len(proposal.entity.entity_external_id) == 64
    assert proposal.provenance.page_url == "https://acme.example/about"
    assert proposal.provenance.metadata_source == "json_ld"
    assert proposal.provenance.metadata_type == "organization"
    assert proposal.reason_codes == (
        "official_site_structured_metadata",
        "json_ld_organization",
        "same_origin_canonical_url",
        "target_type_account",
    )
    assert "buyer intent" in proposal.explanation


def test_open_graph_product_can_propose_a_project_but_not_an_account() -> None:
    plan = _seed_plan(target_types=["project"])
    page = OfficialSiteFetchedPage(
        "https://acme.example/product",
        open_graph={
            "og:type": "product",
            "og:url": "https://acme.example/product#overview",
            "og:title": "Atlas",
        },
    )

    batch = classify_official_site_page(plan, page)

    assert len(batch.proposals) == 1
    proposal = batch.proposals[0]
    assert proposal.entity.entity_kind == "project"
    assert proposal.entity.canonical_url == "https://acme.example/product"
    assert proposal.entity.title == "Atlas"
    assert proposal.provenance.metadata_source == "open_graph"
    assert proposal.reason_codes[1] == "open_graph_product"


def test_person_metadata_can_propose_a_builder_without_retaining_name_or_contact_data() -> None:
    plan = _seed_plan(target_types=["builder"])
    page = OfficialSiteFetchedPage(
        "https://acme.example/team",
        title="Avery Builder — Acme",
        json_ld=[
            {
                "@type": "https://schema.org/Person",
                "url": "https://acme.example/team/avery-builder",
                "name": "Avery Builder",
                "email": "avery@example.com",
            }
        ],
    )

    proposal = classify_official_site_page(plan, page).proposals[0]

    assert proposal.entity.entity_kind == "builder"
    assert proposal.entity.title is None
    assert proposal.entity.entity_external_id != "avery-builder"
    serialized = repr(proposal)
    assert "Avery Builder" not in serialized
    assert "avery@example.com" not in serialized
    assert proposal.provenance.metadata_type == "person"


def test_same_origin_is_required_for_the_page_and_the_metadata_url() -> None:
    plan = _seed_plan(target_types=["account"])
    off_origin_page = OfficialSiteFetchedPage(
        "https://other.example/about",
        json_ld=[
            {
                "@type": "Organization",
                "url": "https://other.example",
                "name": "Other",
            }
        ],
    )
    off_origin_metadata = OfficialSiteFetchedPage(
        "https://acme.example/about",
        json_ld=[
            {
                "@type": "Organization",
                "url": "https://other.example",
                "name": "Other",
            }
        ],
    )

    outside_page_batch = classify_official_site_page(plan, off_origin_page)
    outside_metadata_batch = classify_official_site_page(plan, off_origin_metadata)

    assert outside_page_batch.proposals == ()
    assert outside_page_batch.skipped[0].reason_code == "page_outside_seed_origin"
    assert outside_metadata_batch.proposals == ()
    assert outside_metadata_batch.skipped[0].reason_code == "metadata_url_outside_seed_origin"


def test_seed_limit_and_duplicate_entities_bound_the_result_deterministically() -> None:
    plan = _seed_plan(target_types=["project"], candidate_limit=1)
    page = OfficialSiteFetchedPage(
        "https://acme.example/products",
        json_ld=[
            {
                "@type": "SoftwareApplication",
                "url": "https://acme.example/products/atlas",
                "name": "Atlas",
            },
            {
                "@type": "Product",
                "url": "https://acme.example/products/atlas",
                "name": "Atlas duplicate",
            },
            {
                "@type": "Product",
                "url": "https://acme.example/products/beacon",
                "name": "Beacon",
            },
        ],
    )

    batch = classify_official_site_page(plan, page)

    assert [proposal.entity.canonical_url for proposal in batch.proposals] == [
        "https://acme.example/products/atlas"
    ]
    assert [skip.reason_code for skip in batch.skipped] == [
        "duplicate_entity",
        "candidate_limit_reached",
    ]


def test_unplanned_or_widened_seed_scope_never_classifies_metadata() -> None:
    plan = _seed_plan(target_types=["account"])
    page = OfficialSiteFetchedPage(
        "https://acme.example/about",
        json_ld=[{"@type": "Organization", "url": "https://acme.example", "name": "Acme"}],
    )

    unplanned = replace(plan, decision="skipped", candidate_limit=0)
    widened = replace(plan, allow_social_lookup=True)

    assert classify_official_site_page(unplanned, page).proposals == ()
    assert classify_official_site_page(unplanned, page).skipped[0].reason_code == (
        "candidate_generation_seed_not_planned"
    )
    assert classify_official_site_page(widened, page).proposals == ()
    assert classify_official_site_page(widened, page).skipped[0].reason_code == (
        "candidate_generation_scope_not_supported"
    )
