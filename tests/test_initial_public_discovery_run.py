from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from api.services.social import run_control


TENANT_ID = "tenant-1"
PROFILE_ID = "00000000-0000-0000-0000-000000000001"
RUN_ID = "00000000-0000-0000-0000-000000000002"
STARTED_AT = "2026-08-24T00:00:00+00:00"


def _limits() -> run_control.InitialDiscoveryRunLimits:
    return run_control.InitialDiscoveryRunLimits(
        target_ready_for_review=3,
        minimum_seconds=120,
        maximum_seconds=300,
        poll_seconds=15,
    )


def test_limits_cannot_weaken_the_three_find_or_two_to_five_minute_contract(
    monkeypatch,
) -> None:
    monkeypatch.setenv("ARCLI_INITIAL_PUBLIC_DISCOVERY_TARGET_READY", "1")
    monkeypatch.setenv("ARCLI_INITIAL_PUBLIC_DISCOVERY_MIN_SECONDS", "30")
    monkeypatch.setenv("ARCLI_INITIAL_PUBLIC_DISCOVERY_MAX_SECONDS", "900")

    limits = run_control.initial_discovery_run_limits()

    assert limits.target_ready_for_review == 3
    assert limits.minimum_seconds == 120
    assert limits.maximum_seconds == 300


def test_next_monitor_waits_for_the_minimum_then_stops_at_the_maximum() -> None:
    limits = _limits()

    assert run_control.next_monitor_delay_seconds(elapsed_seconds=60, limits=limits) == 15
    assert run_control.next_monitor_delay_seconds(elapsed_seconds=119.8, limits=limits) == 1
    assert run_control.next_monitor_delay_seconds(elapsed_seconds=299, limits=limits) == 1
    assert run_control.next_monitor_delay_seconds(elapsed_seconds=300, limits=limits) is None


def test_count_only_includes_new_ready_for_review_posts() -> None:
    class _Result:
        def scalar_one(self) -> int:
            return 2

    class _Connection:
        def __init__(self) -> None:
            self.statement = ""
            self.params: dict[str, str] = {}

        def execute(self, statement, params):
            self.statement = str(statement)
            self.params = params
            return _Result()

    class _Engine:
        def __init__(self, connection: _Connection) -> None:
            self.connection = connection

        def begin(self):
            from contextlib import nullcontext

            return nullcontext(self.connection)

    connection = _Connection()
    with patch.object(run_control, "_database_engine", return_value=_Engine(connection)):
        count = run_control.ready_for_review_count_since(TENANT_ID, PROFILE_ID, STARTED_AT)

    assert count == 2
    assert "match_status = 'ready_for_review'" in connection.statement
    assert "created_at >=" in connection.statement
    assert connection.params["tenant_id"] == TENANT_ID
    assert connection.params["service_profile_id"] == PROFILE_ID


def test_monitor_waits_for_two_minutes_even_when_three_posts_arrive_early() -> None:
    from api.workers import actors

    next_message = SimpleNamespace(message_id="next-monitor")
    complete_run = MagicMock()
    with (
        patch("api.services.social.run_control.initial_discovery_run_limits", return_value=_limits()),
        patch("api.services.social.run_control.elapsed_run_seconds", return_value=60),
        patch("api.services.social.run_control.ready_for_review_count_since", return_value=3),
        patch.object(
            actors.monitor_initial_public_discovery_run,
            "send_with_options",
            return_value=next_message,
        ) as schedule,
        patch.object(actors, "_complete_discovery_run", complete_run),
    ):
        actors.monitor_initial_public_discovery_run.fn(
            TENANT_ID,
            PROFILE_ID,
            RUN_ID,
            STARTED_AT,
        )

    complete_run.assert_not_called()
    assert schedule.call_args.kwargs["delay"] == 15_000


def test_monitor_completes_after_the_minimum_when_three_posts_are_ready() -> None:
    from api.workers import actors

    complete_run = MagicMock()
    with (
        patch("api.services.social.run_control.initial_discovery_run_limits", return_value=_limits()),
        patch("api.services.social.run_control.elapsed_run_seconds", return_value=121),
        patch("api.services.social.run_control.ready_for_review_count_since", return_value=3),
        patch.object(actors.monitor_initial_public_discovery_run, "send_with_options") as schedule,
        patch.object(actors, "_complete_discovery_run", complete_run),
    ):
        actors.monitor_initial_public_discovery_run.fn(
            TENANT_ID,
            PROFILE_ID,
            RUN_ID,
            STARTED_AT,
        )

    schedule.assert_not_called()
    assert complete_run.call_args.kwargs["status"] == "completed"
    assert (
        complete_run.call_args.kwargs["summary"]["run_control"]["stop_reason"]
        == "target_ready_for_review_reached"
    )


def test_monitor_runs_one_cached_corpus_rematch_before_the_deadline() -> None:
    from api.workers import actors

    next_message = SimpleNamespace(message_id="next-monitor")
    complete_run = MagicMock()
    with (
        patch("api.services.social.run_control.initial_discovery_run_limits", return_value=_limits()),
        patch("api.services.social.run_control.elapsed_run_seconds", return_value=120),
        patch("api.services.social.run_control.ready_for_review_count_since", return_value=0),
        patch(
            "api.services.social_ingestion.enqueue_existing_public_source_rematch",
            return_value="rematch-message",
        ) as rematch,
        patch.object(
            actors.monitor_initial_public_discovery_run,
            "send_with_options",
            return_value=next_message,
        ) as schedule,
        patch.object(actors, "_complete_discovery_run", complete_run),
        patch.object(actors, "_record_discovery_event"),
    ):
        actors.monitor_initial_public_discovery_run.fn(
            TENANT_ID,
            PROFILE_ID,
            RUN_ID,
            STARTED_AT,
        )

    rematch.assert_called_once_with(TENANT_ID, PROFILE_ID)
    assert schedule.call_args.kwargs["kwargs"] == {"rematch_attempted": True}
    complete_run.assert_not_called()


def test_monitor_skips_cached_corpus_rematch_when_cost_control_disables_it(monkeypatch) -> None:
    from api.workers import actors

    monkeypatch.setenv("ARCLI_INITIAL_PUBLIC_REMATCH_ENABLED", "false")
    next_message = SimpleNamespace(message_id="next-monitor")
    complete_run = MagicMock()
    with (
        patch("api.services.social.run_control.initial_discovery_run_limits", return_value=_limits()),
        patch("api.services.social.run_control.elapsed_run_seconds", return_value=120),
        patch("api.services.social.run_control.ready_for_review_count_since", return_value=0),
        patch(
            "api.services.social_ingestion.enqueue_existing_public_source_rematch",
        ) as rematch,
        patch.object(
            actors.monitor_initial_public_discovery_run,
            "send_with_options",
            return_value=next_message,
        ) as schedule,
        patch.object(actors, "_complete_discovery_run", complete_run),
        patch.object(actors, "_record_discovery_event") as record_event,
    ):
        actors.monitor_initial_public_discovery_run.fn(
            TENANT_ID,
            PROFILE_ID,
            RUN_ID,
            STARTED_AT,
        )

    rematch.assert_not_called()
    assert schedule.call_args.kwargs["kwargs"] == {"rematch_attempted": True}
    assert record_event.call_args.kwargs["outcome"] == "skipped"
    complete_run.assert_not_called()


def test_monitor_stops_with_a_partial_run_at_five_minutes() -> None:
    from api.workers import actors

    complete_run = MagicMock()
    with (
        patch("api.services.social.run_control.initial_discovery_run_limits", return_value=_limits()),
        patch("api.services.social.run_control.elapsed_run_seconds", return_value=300),
        patch("api.services.social.run_control.ready_for_review_count_since", return_value=2),
        patch.object(actors.monitor_initial_public_discovery_run, "send_with_options") as schedule,
        patch.object(actors, "_complete_discovery_run", complete_run),
    ):
        actors.monitor_initial_public_discovery_run.fn(
            TENANT_ID,
            PROFILE_ID,
            RUN_ID,
            STARTED_AT,
            rematch_attempted=True,
        )

    schedule.assert_not_called()
    assert complete_run.call_args.kwargs["status"] == "partial"
    assert (
        complete_run.call_args.kwargs["summary"]["run_control"]["stop_reason"]
        == "maximum_duration_reached"
    )
