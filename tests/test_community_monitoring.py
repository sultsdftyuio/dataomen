from types import SimpleNamespace

from api.services.social.community_monitoring import (
    parse_community_targets,
    post_matches_community_targets,
)


def test_explicit_github_scope_accepts_only_the_selected_repository() -> None:
    targets = parse_community_targets(["github:acme/ledger"])

    matching = SimpleNamespace(
        source="github",
        community=None,
        author="maintainer",
        url="https://github.com/acme/ledger/issues/42",
        metadata={"community": "acme/ledger"},
    )
    other_repository = SimpleNamespace(
        source="github",
        community=None,
        author="maintainer",
        url="https://github.com/acme/other/issues/42",
        metadata={"community": "acme/other"},
    )

    assert post_matches_community_targets(matching, targets)
    assert not post_matches_community_targets(other_repository, targets)


def test_source_specific_scope_does_not_hide_other_selected_sources() -> None:
    targets = parse_community_targets(["github:acme/ledger"])
    hacker_news_post = SimpleNamespace(
        source="hackernews",
        community=None,
        author="builder",
        url="https://news.ycombinator.com/item?id=42",
        metadata={"content_kind": "story"},
    )

    assert post_matches_community_targets(hacker_news_post, targets)


def test_public_urls_are_normalized_into_source_scopes() -> None:
    targets = parse_community_targets(
        [
            "https://github.com/acme/ledger/issues",
            "https://lemmy.world/c/saas",
            "https://stackoverflow.com/questions/tagged/python",
        ]
    )

    assert {(target.source, target.selector) for target in targets} == {
        ("github", "acme/ledger"),
        ("lemmy", "saas"),
        ("stackexchange", "stackoverflow"),
    }
