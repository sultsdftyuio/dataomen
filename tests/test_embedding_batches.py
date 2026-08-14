from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from api.services.embeddings import EmbeddingService


def test_embed_many_uses_one_provider_call_and_preserves_input_order() -> None:
    client = SimpleNamespace(
        embeddings=SimpleNamespace(
            create=MagicMock(
                return_value=SimpleNamespace(
                    data=[
                        SimpleNamespace(index=1, embedding=[0.0, 1.0]),
                        SimpleNamespace(index=0, embedding=[1.0, 0.0]),
                    ]
                )
            )
        )
    )
    quota_guard = MagicMock(
        check_and_increment=MagicMock(
            side_effect=lambda **_kwargs: SimpleNamespace(
                allowed=True,
                tenant_id="tenant-a",
                rejection_reason=None,
                current_count=1,
                limit=20_000,
                window_seconds=86_400,
            )
        )
    )
    service = EmbeddingService(client=client, quota_guard=quota_guard)

    results = service.embed_many(
        ["first post", "second post"],
        tenant_id="tenant-a",
        source_post_ids=["post-1", "post-2"],
    )

    client.embeddings.create.assert_called_once()
    assert client.embeddings.create.call_args.kwargs["input"] == [
        "first post",
        "second post",
    ]
    assert [result.embedding for result in results] == [[1.0, 0.0], [0.0, 1.0]]
    assert quota_guard.check_and_increment.call_count == 2


def test_embed_many_rejects_mismatched_source_post_ids() -> None:
    service = EmbeddingService(client=MagicMock())

    try:
        service.embed_many(["post"], source_post_ids=[])
    except ValueError as exc:
        assert "source_post_ids" in str(exc)
    else:
        raise AssertionError("expected source-post ID validation to fail")
