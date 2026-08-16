from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from api.services.embeddings import (
    EMBEDDING_INPUT_TOKEN_SAFETY_MARGIN,
    MAX_EMBEDDING_INPUT_TOKENS,
    EmbeddingService,
    normalize_embedding_text,
)


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


def test_embedding_text_is_truncated_by_tokens_before_requesting_the_provider() -> None:
    class CharacterTokenizer:
        def encode(self, value: str, **_kwargs: object) -> list[str]:
            return list(value)

        def decode(self, tokens: list[str]) -> str:
            return "".join(tokens)

    # Repeated punctuation and identifiers mirror the high token density of
    # minified source code and issue logs from GitHub.
    original = "`{}[]()<>;=+|\\\\" * 2_000

    client = SimpleNamespace(
        embeddings=SimpleNamespace(
            create=MagicMock(
                return_value=SimpleNamespace(
                    data=[SimpleNamespace(index=0, embedding=[1.0, 0.0])]
                )
            )
        )
    )
    quota_guard = MagicMock(
        check_and_increment=MagicMock(
            return_value=SimpleNamespace(
                allowed=True,
                tenant_id="tenant-a",
                rejection_reason=None,
                current_count=1,
                limit=20_000,
                window_seconds=86_400,
            )
        )
    )

    with patch(
        "api.services.embeddings._embedding_tokenizer",
        return_value=CharacterTokenizer(),
    ):
        bounded = normalize_embedding_text(original)
        EmbeddingService(client=client, quota_guard=quota_guard).embed_many([original])

    assert len(original) > MAX_EMBEDDING_INPUT_TOKENS
    assert len(bounded) == (
        MAX_EMBEDDING_INPUT_TOKENS - EMBEDDING_INPUT_TOKEN_SAFETY_MARGIN
    )
    assert client.embeddings.create.call_args.kwargs["input"] == [bounded]


def test_embedding_text_has_a_safe_utf8_fallback_without_a_tokenizer() -> None:
    original = "\U0001f9d1\u200d\U0001f4bb" * 4_000

    with patch("api.services.embeddings._embedding_tokenizer", return_value=None):
        bounded = normalize_embedding_text(original)

    assert bounded
    assert len(bounded.encode("utf-8")) <= (
        MAX_EMBEDDING_INPUT_TOKENS - EMBEDDING_INPUT_TOKEN_SAFETY_MARGIN
    )
    assert bounded.encode("utf-8").decode("utf-8") == bounded
