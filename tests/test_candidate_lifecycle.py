"""Coverage for advancing a candidate that was already evaluated before."""

from __future__ import annotations

from contextlib import nullcontext
from pathlib import Path
from unittest.mock import patch

import pytest

from api.services.social import candidate_pool
from api.services.social.candidate_lifecycle import advanceable_from

TENANT_ID = "tenant-1"
CANDIDATE_ID = "3d8173cc-5ddd-426b-8d85-151a78f17798"


@pytest.fixture(autouse=True)
def _enabled_pool(monkeypatch):
    monkeypatch.setenv("ARCLI_DISCOVERY_CANDIDATE_POOL_ENABLED", "true")
    monkeypatch.setattr(candidate_pool, "_candidate_pool_unavailable_until", 0.0)
    monkeypatch.setattr(candidate_pool, "_candidate_pool_last_warning_at", 0.0)


class RecordingEngine:
    """Capture the lifecycle update and answer as the database would."""

    def __init__(self, *, updated: bool) -> None:
        self.updated = updated
        self.statements: list[tuple[str, dict[str, object]]] = []

    def begin(self):
        return nullcontext(self)

    def execute(self, statement, params):
        self.statements.append((str(statement), params))
        return self

    def scalar_one_or_none(self):
        return CANDIDATE_ID if self.updated else None


def test_every_allowed_transition_matches_the_database_guard() -> None:
    contract = Path("scripts/discovery_candidate_pool_contract.sql").read_text(
        encoding="utf-8"
    )

    # The trigger's own transition list, kept in step with the mapping.
    assert "OLD.candidate_status = 'raw' AND NEW.candidate_status IN ('plausible', 'rejected')" in contract
    assert "OLD.candidate_status = 'plausible' AND NEW.candidate_status IN ('review', 'rejected')" in contract
    assert "OLD.candidate_status = 'review' AND NEW.candidate_status IN ('qualified', 'rejected')" in contract
    assert advanceable_from("plausible") == ["raw", "plausible"]
    assert advanceable_from("review") == ["plausible", "review"]
    assert advanceable_from("qualified") == ["review", "qualified"]
    assert advanceable_from("rejected") == ["raw", "plausible", "review", "rejected"]


def test_a_terminal_status_is_never_a_starting_point_for_another() -> None:
    for target in ("raw", "plausible", "review", "qualified"):
        assert "rejected" not in advanceable_from(target)
    for target in ("raw", "plausible", "review", "rejected"):
        assert "qualified" not in advanceable_from(target)
    assert advanceable_from("not-a-status") == []


@pytest.mark.parametrize(
    ("target", "expected"),
    [
        ("plausible", ["raw", "plausible"]),
        ("review", ["plausible", "review"]),
        ("rejected", ["raw", "plausible", "review", "rejected"]),
    ],
)
def test_the_update_only_touches_a_candidate_the_advance_still_applies_to(
    target: str,
    expected: list[str],
) -> None:
    engine = RecordingEngine(updated=True)

    with patch.object(candidate_pool, "_database_engine", return_value=engine):
        advanced = candidate_pool.advance_candidate_status(
            TENANT_ID,
            CANDIDATE_ID,
            target,
            scores={"similarity_score": 0.5},
            decision_by="system" if target == "rejected" else None,
        )

    statement, params = engine.statements[-1]
    assert advanced is True
    assert "candidate_status = ANY(CAST(:advanceable_from AS text[]))" in statement
    assert params["advanceable_from"] == expected


def test_re_evaluating_an_advanced_candidate_is_a_quiet_no_op() -> None:
    # The database matched no row: the candidate is already past this stage.
    engine = RecordingEngine(updated=False)

    with (
        patch.object(candidate_pool, "_database_engine", return_value=engine),
        patch.object(candidate_pool, "_record_failure") as record_failure,
    ):
        advanced = candidate_pool.advance_candidate_status(
            TENANT_ID,
            CANDIDATE_ID,
            "plausible",
            scores={"similarity_score": 0.5},
        )

    assert advanced is False
    # Not an outage: the pool must stay open for every other candidate.
    record_failure.assert_not_called()
    assert candidate_pool._in_cooldown() is False
