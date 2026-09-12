"""Coverage for the conservative feedback-driven source-plan adjustment."""

from __future__ import annotations

from contextlib import nullcontext

import pytest

from api.services.social import source_feedback_ranking as ranking


SOURCES = ("hackernews", "bluesky", "stackexchange", "github", "lemmy", "x")


@pytest.fixture(autouse=True)
def _clear_ranking_cache() -> None:
    ranking.clear_source_feedback_ranking_cache()
    yield
    ranking.clear_source_feedback_ranking_cache()


def _negative_rows(source: str, count: int) -> list[dict[str, object]]:
    return [
        {
            "source": source,
            "feedback_type": "not_relevant",
            "lead_match_id": f"{source}-{index}",
        }
        for index in range(count)
    ]


def test_small_or_mixed_review_samples_never_remove_a_source() -> None:
    rows = _negative_rows("github", 5)
    rows.append(
        {
            "source": "github",
            "feedback_type": "good_fit",
            "lead_match_id": "github-positive",
        }
    )

    result = ranking.derive_source_feedback_ranking(rows, SOURCES)

    assert result.sources == SOURCES
    assert result.deprioritized_sources == ()
    assert result.reviewed_leads == 6


def test_large_unanimously_negative_feedback_moves_a_source_later_but_keeps_it() -> None:
    rows = _negative_rows("github", 6)
    rows.extend(_negative_rows("hackernews", 8))
    rows.extend(_negative_rows("bluesky", 8))
    rows.extend(_negative_rows("x", 8))

    result = ranking.derive_source_feedback_ranking(rows, SOURCES)

    assert result.sources == (
        "hackernews",
        "bluesky",
        "stackexchange",
        "lemmy",
        "github",
        "x",
    )
    assert result.deprioritized_sources == ("github",)
    assert result.reviewed_leads == 30


def test_reliably_positive_supplemental_source_moves_earlier_for_fast_check() -> None:
    rows = [
        {
            "source": "github",
            "feedback_type": "good_fit",
            "lead_match_id": f"github-good-{index}",
        }
        for index in range(3)
    ]

    result = ranking.derive_source_feedback_ranking(rows, SOURCES)

    assert result.sources == (
        "hackernews",
        "bluesky",
        "github",
        "stackexchange",
        "lemmy",
        "x",
    )
    assert result.prioritized_sources == ("github",)
    assert result.deprioritized_sources == ()


def test_conflicting_feedback_for_one_lead_is_not_automatic_evidence() -> None:
    rows = _negative_rows("stackexchange", 5)
    rows.extend(
        [
            {
                "source": "stackexchange",
                "feedback_type": "good_fit",
                "lead_match_id": "split-review",
            },
            {
                "source": "stackexchange",
                "feedback_type": "not_relevant",
                "lead_match_id": "split-review",
            },
        ]
    )

    result = ranking.derive_source_feedback_ranking(rows, SOURCES)

    assert result.sources == SOURCES
    assert result.reviewed_leads == 5


class _Result:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict[str, object]]:
        return self.rows


class _Connection:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.calls: list[tuple[str, dict[str, object]]] = []

    def execute(self, statement: object, params: dict[str, object]) -> _Result:
        self.calls.append((str(statement), params))
        return _Result(self.rows)


class _Engine:
    def __init__(self, connection: _Connection) -> None:
        self.connection = connection

    def connect(self):
        return nullcontext(self.connection)


def test_loader_is_scoped_read_only_cached_and_never_selects_post_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection(_negative_rows("github", 6))
    monkeypatch.setattr(ranking, "_database_engine", lambda: _Engine(connection))

    first = ranking.load_source_feedback_ranking("tenant-a", "profile-a", SOURCES)
    second = ranking.load_source_feedback_ranking("tenant-a", "profile-a", SOURCES)

    assert first.sources == (
        "hackernews",
        "bluesky",
        "stackexchange",
        "lemmy",
        "github",
        "x",
    )
    assert second == first
    assert len(connection.calls) == 1
    statement, params = connection.calls[0]
    normalized = " ".join(statement.upper().split())
    assert normalized.startswith("SELECT")
    assert "LEAD_FEEDBACK" in normalized
    assert "LEAD_MATCHES" in normalized
    assert "SOURCE_POSTS" in normalized
    assert "SOURCE_POST.TEXT" not in normalized
    assert not any(keyword in normalized for keyword in (" INSERT ", " UPDATE ", " DELETE "))
    assert params["tenant_id"] == "tenant-a"
    assert params["service_profile_id"] == "profile-a"


def test_loader_fails_open_when_the_additive_feedback_contract_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class BrokenConnection:
        def execute(self, *_: object, **__: object) -> object:
            raise RuntimeError('relation "lead_feedback" does not exist')

    class BrokenEngine:
        def connect(self):
            return nullcontext(BrokenConnection())

    monkeypatch.setattr(ranking, "_database_engine", lambda: BrokenEngine())

    result = ranking.load_source_feedback_ranking("tenant-a", "profile-a", SOURCES)

    assert result.sources == SOURCES
    assert result.deprioritized_sources == ()
