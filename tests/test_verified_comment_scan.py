from types import SimpleNamespace

from api.services.social.verified_comment_scan import _story_id_from_post


def test_only_hn_story_metadata_can_trigger_comment_expansion() -> None:
    story = SimpleNamespace(
        source="hackernews",
        external_id="4242",
        metadata={"content_kind": "story", "thread_id": "4242"},
    )
    comment = SimpleNamespace(
        source="hackernews",
        external_id="4243",
        metadata={"content_kind": "comment", "thread_id": "4242"},
    )
    other_source = SimpleNamespace(
        source="github",
        external_id="4242",
        metadata={"content_kind": "story"},
    )

    assert _story_id_from_post(story) == "4242"
    assert _story_id_from_post(comment) is None
    assert _story_id_from_post(other_source) is None
