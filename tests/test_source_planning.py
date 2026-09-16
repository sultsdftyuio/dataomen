from api.services.social.source_planning import (
    profile_community_plan,
    profile_source_preferences,
)
from api.services.verifier import ServiceProfile


def profile(**overrides: object) -> ServiceProfile:
    values: dict[str, object] = {
        "company_name": "Example",
        "one_liner": "Automate invoice approvals with an audit trail.",
        "target_audience": ["Controllers at multi-entity businesses"],
        "core_problem_solved": "Invoice approvals delay month-end close.",
        "key_value_propositions": ["Route approvals without spreadsheet chasing."],
        "ideal_customer_pain_points": ["Approvers block month-end close."],
        "use_cases": ["Route invoices to the correct approver."],
        "buying_triggers": ["Delayed close exposes approval bottlenecks."],
        "search_terms": ["best invoice approval software"],
    }
    values.update(overrides)
    return ServiceProfile.model_validate(values)


def test_non_technical_profile_does_not_open_technical_connectors() -> None:
    assert profile_source_preferences(profile()) == (
        "hackernews",
        "bluesky",
        "x",
    )


def test_open_source_technical_profile_uses_relevant_technical_connectors() -> None:
    preferences = profile_source_preferences(
        profile(
            one_liner="Open-source API observability for platform engineering teams.",
            target_audience=["Developer platform teams"],
            core_problem_solved="Backend services lack reliable tracing.",
            key_value_propositions=["Open-source tracing integrations."],
        )
    )

    assert preferences == (
        "hackernews",
        "bluesky",
        "stackexchange",
        "github",
        "lemmy",
        "x",
    )


def test_community_plan_exposes_the_product_relevant_discussion_groups() -> None:
    community_profile = profile(
        one_liner="Open-source API observability for platform engineering teams.",
        target_audience=["Developer platform teams"],
    )
    plan = profile_community_plan(community_profile)

    assert plan.sources == profile_source_preferences(community_profile)
    assert "github: public repository issue discussions" in plan.community_labels
    assert "stackexchange: technical Q&A" in plan.community_labels
