"""Coverage for conservative, read-only feedback threshold calibration."""

from __future__ import annotations

from contextlib import nullcontext

import pytest

from api.services.social import feedback_calibration as calibration


def _observations(
    *,
    positive_scores: list[float],
    negative_scores: list[float],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for index, score in enumerate(positive_scores):
        rows.append(
            {
                "lead_match_id": f"positive-{index}",
                "feedback_type": "good_fit",
                "similarity_score": score,
            }
        )
    for index, score in enumerate(negative_scores):
        rows.append(
            {
                "lead_match_id": f"negative-{index}",
                "feedback_type": "not_relevant",
                "similarity_score": score,
            }
        )
    return rows


@pytest.fixture(autouse=True)
def _clear_calibration_cache() -> None:
    calibration.clear_feedback_calibration_cache()
    yield
    calibration.clear_feedback_calibration_cache()


def test_derivation_returns_only_a_small_non_decreasing_threshold_increase() -> None:
    result = calibration.derive_feedback_calibration(
        _observations(
            positive_scores=[0.68, 0.70, 0.72, 0.74, 0.76, 0.78],
            negative_scores=[0.34, 0.36, 0.38, 0.40, 0.42, 0.44],
        ),
        base_threshold=0.15,
    )

    assert result is not None
    assert result.base_threshold == 0.15
    assert result.threshold == 0.18
    assert result.adjustment == 0.03
    assert result.sample_size == 12
    assert result.positive_samples == 6
    assert result.negative_samples == 6
    assert result.threshold > result.base_threshold


def test_derivation_never_lowers_the_existing_similarity_threshold() -> None:
    result = calibration.derive_feedback_calibration(
        _observations(
            positive_scores=[0.72, 0.74, 0.76, 0.78, 0.80, 0.82],
            negative_scores=[0.10, 0.12, 0.14, 0.15, 0.16, 0.17],
        ),
        base_threshold=0.15,
    )

    assert result is None


def test_derivation_requires_enough_unambiguous_positive_and_negative_reviews() -> None:
    rows = _observations(
        positive_scores=[0.68, 0.70, 0.72, 0.74, 0.76, 0.78],
        negative_scores=[0.34, 0.36, 0.38, 0.40, 0.42, 0.44],
    )
    rows.append(
        {
            "lead_match_id": "positive-0",
            "feedback_type": "wrong_buyer",
            "similarity_score": 0.68,
        }
    )

    result = calibration.derive_feedback_calibration(rows, base_threshold=0.15)

    # The split decision removes one whole lead from the evidence set, leaving
    # fewer than the required 12 unambiguous lead-level observations.
    assert result is None


def test_derivation_ignores_invalid_rows_without_nan_or_division_failures() -> None:
    rows = _observations(
        positive_scores=[0.68, 0.70, 0.72, 0.74, 0.76, 0.78],
        negative_scores=[0.34, 0.36, 0.38, 0.40, 0.42, 0.44],
    )
    rows.extend(
        [
            {"lead_match_id": "bad-nan", "feedback_type": "spam", "similarity_score": float("nan")},
            {"lead_match_id": "bad-label", "feedback_type": "unknown", "similarity_score": 0.8},
            {"lead_match_id": "bad-score", "feedback_type": "good_fit", "similarity_score": "nope"},
        ]
    )

    result = calibration.derive_feedback_calibration(rows, base_threshold=0.15)

    assert result is not None
    assert result.threshold == 0.18


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


def test_loader_is_profile_scoped_read_only_and_cached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rows = _observations(
        positive_scores=[0.68, 0.70, 0.72, 0.74, 0.76, 0.78],
        negative_scores=[0.34, 0.36, 0.38, 0.40, 0.42, 0.44],
    )
    connection = _Connection(rows)
    monkeypatch.setattr(calibration, "_database_engine", lambda: _Engine(connection))

    first = calibration.load_feedback_calibration(
        "tenant-a",
        "profile-a",
        base_threshold=0.15,
    )
    second = calibration.load_feedback_calibration(
        "tenant-a",
        "profile-a",
        base_threshold=0.15,
    )

    assert first is not None
    assert second == first
    assert len(connection.calls) == 1
    statement, params = connection.calls[0]
    normalized_statement = " ".join(statement.upper().split())
    assert normalized_statement.startswith("SELECT")
    assert "LEAD_FEEDBACK" in normalized_statement
    assert "LEAD_MATCHES" in normalized_statement
    assert not any(keyword in normalized_statement for keyword in (" INSERT ", " UPDATE ", " DELETE "))
    assert params["tenant_id"] == "tenant-a"
    assert params["service_profile_id"] == "profile-a"


def test_loader_fails_open_when_storage_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class BrokenConnection:
        def execute(self, *_: object, **__: object) -> object:
            raise RuntimeError("database is unavailable")

    class BrokenEngine:
        def connect(self):
            return nullcontext(BrokenConnection())

    monkeypatch.setattr(calibration, "_database_engine", lambda: BrokenEngine())

    result = calibration.load_feedback_calibration("tenant-a", "profile-a")

    assert result is None

