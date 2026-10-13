"""Coverage for the two cosine-similarity paths and their handoff."""

from __future__ import annotations

import math
import random
from unittest.mock import patch

import pytest

from api.services import matching
from api.services.matching import cosine_similarity


def _exact(left: list[float], right: list[float]) -> float:
    """Score with the scaled reference loop only."""
    with patch.object(matching, "_sumprod", None):
        return cosine_similarity(left, right)


def test_fast_path_agrees_with_the_reference_loop_on_embedding_sized_vectors() -> None:
    generator = random.Random(20261013)
    for _ in range(25):
        left = [generator.gauss(0.0, 1.0) for _ in range(1_536)]
        right = [generator.gauss(0.0, 1.0) for _ in range(1_536)]

        assert cosine_similarity(left, right) == pytest.approx(
            _exact(left, right),
            abs=1e-12,
        )


def test_fast_path_handles_ordinary_vectors_itself() -> None:
    assert matching._fast_cosine_similarity([1.0, 0.0], [0.25, 0.9375**0.5]) == 0.25
    assert matching._fast_cosine_similarity([0.3, -0.4, 0.5], [0.3, -0.4, 0.5]) == 1.0
    assert matching._fast_cosine_similarity([0.3, -0.4, 0.5], [-0.3, 0.4, -0.5]) == -1.0
    assert matching._fast_cosine_similarity([1.0, 0.0], [0.0, 1.0]) == 0.0


@pytest.mark.parametrize(
    ("left", "right"),
    [
        ([1e200, 1e200], [1e200, 0.0]),
        ([1e-200, 1e-200], [1e-200, 0.0]),
        ([1e308], [1e308]),
        ([0.0, 0.0], [1.0, 0.0]),
        ([1.0, 0.0], [0.0, 0.0]),
    ],
)
def test_extreme_and_zero_vectors_defer_to_the_scaled_loop(
    left: list[float],
    right: list[float],
) -> None:
    assert matching._fast_cosine_similarity(left, right) is None
    assert cosine_similarity(left, right) == _exact(left, right)


def test_extreme_magnitudes_still_score_correctly() -> None:
    assert cosine_similarity([1e200, 1e200], [1e200, 0.0]) == pytest.approx(
        math.sqrt(0.5)
    )
    assert cosine_similarity([1e-200, 1e-200], [1e-200, 0.0]) == pytest.approx(
        math.sqrt(0.5)
    )
    assert cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0


@pytest.mark.parametrize("bad_value", [math.nan, math.inf, -math.inf])
def test_non_finite_values_are_still_rejected(bad_value: float) -> None:
    assert matching._fast_cosine_similarity([1.0, bad_value], [1.0, 1.0]) is None
    with pytest.raises(ValueError, match="finite"):
        cosine_similarity([1.0, bad_value], [1.0, 1.0])
    with pytest.raises(ValueError, match="finite"):
        cosine_similarity([1.0, 1.0], [bad_value, 1.0])


def test_dimension_and_empty_checks_run_before_either_path() -> None:
    with pytest.raises(ValueError, match="dimensions must match"):
        cosine_similarity([1.0, 0.0], [1.0])
    with pytest.raises(ValueError, match="must not be empty"):
        cosine_similarity([], [])


def test_a_score_is_never_outside_the_valid_range() -> None:
    generator = random.Random(7)
    for _ in range(200):
        vector = [generator.uniform(-1.0, 1.0) for _ in range(64)]
        scaled = [value * 3.0 for value in vector]

        assert -1.0 <= cosine_similarity(vector, scaled) <= 1.0
        assert -1.0 <= cosine_similarity(vector, [-value for value in scaled]) <= 1.0


def test_an_interpreter_without_sumprod_uses_the_reference_loop() -> None:
    with patch.object(matching, "_sumprod", None):
        assert matching._fast_cosine_similarity([1.0, 0.0], [1.0, 0.0]) is None
        assert cosine_similarity([1.0, 0.0], [0.25, 0.9375**0.5]) == 0.25
