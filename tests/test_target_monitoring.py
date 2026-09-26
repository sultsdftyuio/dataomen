from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from api.services.prospecting import target_monitoring


MONITOR_ID = "11111111-1111-4111-8111-111111111111"
PROFILE_ID = "22222222-2222-4222-8222-222222222222"
ENTITY_ID = "33333333-3333-4333-8333-333333333333"
RUN_ID = "44444444-4444-4444-8444-444444444444"


def _claim() -> target_monitoring.DueTargetMonitor:
    from datetime import datetime, timezone

    return target_monitoring.DueTargetMonitor(
        monitor_id=MONITOR_ID,
        tenant_id="tenant-1",
        service_profile_id=PROFILE_ID,
        prospect_entity_id=ENTITY_ID,
        scheduled_for=datetime(2026, 9, 26, tzinfo=timezone.utc),
    )


def _enable(monkeypatch) -> None:
    monkeypatch.setenv(
        "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_ENABLED",
        "true",
    )
    monkeypatch.setenv(
        "ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_ENABLED",
        "true",
    )


def test_target_monitoring_is_off_by_default(monkeypatch) -> None:
    monkeypatch.delenv(
        "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_ENABLED",
        raising=False,
    )

    assert not target_monitoring.retained_public_evidence_monitoring_is_enabled()
    result = target_monitoring.dispatch_due_target_monitor_refreshes()

    assert not result.enabled
    assert result.dispatched == 0


def test_target_monitoring_frequency_can_only_be_daily_or_slower(monkeypatch) -> None:
    monkeypatch.setenv(
        "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_INTERVAL_HOURS",
        "1",
    )
    assert target_monitoring.target_monitoring_limits().interval_seconds == 86_400

    monkeypatch.setenv(
        "ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_INTERVAL_HOURS",
        "999",
    )
    assert target_monitoring.target_monitoring_limits().interval_seconds == 7 * 86_400


def test_scheduler_claim_retries_an_infrastructure_failure(monkeypatch) -> None:
    _enable(monkeypatch)

    with pytest.raises(RuntimeError, match="scheduler tick claim failed"):
        target_monitoring.claim_target_monitoring_scheduler_tick(
            engine=SimpleNamespace(),
        )


def test_monitor_nonce_is_stable_per_durable_due_window() -> None:
    claim = _claim()
    first = target_monitoring._monitor_nonce(claim)
    second = target_monitoring._monitor_nonce(claim)

    assert first == second
    assert first.startswith("monitor-")
    assert len(first) <= 128


def test_due_monitor_dispatches_only_one_existing_target_id(monkeypatch) -> None:
    _enable(monkeypatch)
    claim = _claim()
    dispatch = SimpleNamespace(run=SimpleNamespace(id=RUN_ID), skip_reason=None)

    with (
        patch.object(
            target_monitoring,
            "_claim_due_target_monitors",
            return_value=(claim,),
        ),
        patch.object(
            target_monitoring,
            "enqueue_evidence_collection_run",
            return_value=dispatch,
        ) as enqueue,
        patch.object(
            target_monitoring,
            "_mark_monitor_dispatched",
            return_value=True,
        ) as mark_dispatched,
    ):
        result = target_monitoring.dispatch_due_target_monitor_refreshes(
            engine=SimpleNamespace()
        )

    assert result.enabled
    assert result.dispatched == 1
    assert result.deferred == 0
    request = enqueue.call_args.args[0]
    assert request.tenant_id == "tenant-1"
    assert request.service_profile_id == PROFILE_ID
    assert request.prospect_entity_ids == (ENTITY_ID,)
    assert request.request_nonce == target_monitoring._monitor_nonce(claim)
    assert request.quota_scope == "monitoring"
    mark_dispatched.assert_called_once()


def test_failed_monitor_publish_defers_the_same_due_window(monkeypatch) -> None:
    _enable(monkeypatch)
    claim = _claim()

    with (
        patch.object(
            target_monitoring,
            "_claim_due_target_monitors",
            return_value=(claim,),
        ),
        patch.object(
            target_monitoring,
            "enqueue_evidence_collection_run",
            side_effect=RuntimeError("broker unavailable"),
        ),
        patch.object(
            target_monitoring,
            "_defer_monitor",
            return_value=True,
        ) as defer,
    ):
        result = target_monitoring.dispatch_due_target_monitor_refreshes(
            engine=SimpleNamespace()
        )

    assert result.deferred == 1
    assert result.dispatched == 0
    assert defer.call_args.kwargs["claim"] == claim
    assert defer.call_args.kwargs["reason"] == "evidence_dispatch_unavailable"


def test_failed_publish_retains_the_due_window_for_idempotent_retry() -> None:
    source = Path(target_monitoring.__file__).read_text(encoding="utf-8")
    defer_source = source[source.index("def _defer_monitor(") : source.index("def _pause_monitor(")]

    assert "SET dispatch_lease_until = NOW()" in defer_source
    assert "next_refresh_at =" not in defer_source


def test_unavailable_target_pauses_monitor_instead_of_spinning(monkeypatch) -> None:
    _enable(monkeypatch)
    claim = _claim()
    dispatch = SimpleNamespace(run=None, skip_reason="target_not_available")

    with (
        patch.object(
            target_monitoring,
            "_claim_due_target_monitors",
            return_value=(claim,),
        ),
        patch.object(
            target_monitoring,
            "enqueue_evidence_collection_run",
            return_value=dispatch,
        ),
        patch.object(
            target_monitoring,
            "_pause_monitor",
            return_value=True,
        ) as pause,
    ):
        result = target_monitoring.dispatch_due_target_monitor_refreshes(
            engine=SimpleNamespace()
        )

    assert result.paused == 1
    assert result.deferred == 0
    assert pause.call_args.kwargs["reason"] == "target_not_available"


def test_target_monitoring_contract_keeps_a_narrow_database_boundary() -> None:
    root = Path(__file__).resolve().parents[1]
    contract = (
        root / "scripts" / "prospect_target_monitoring_contract.sql"
    ).read_text(encoding="utf-8")

    assert "prospect_target_monitors" in contract
    assert "prospect_target_monitor_scheduler_state" in contract
    assert "prospect_research_run_entities" in contract
    assert "list_prospect_target_monitor_status_for_profile" in contract
    assert "set_prospect_target_monitoring" in contract
    assert "prospecting_is_supported_retained_monitor_locator" in contract
    assert "prospect_assessments_pause_target_monitor_after_rejection" in contract
    assert "REVOKE ALL ON TABLE public.prospect_target_monitors FROM authenticated" in contract
    assert "REVOKE ALL ON TABLE public.prospect_target_monitors FROM PUBLIC" in contract
    assert "GREATEST(" in contract
    assert "URL, handle, query, cadence, source text, contact" in contract


def test_system_actor_claims_a_durable_monitoring_tick_before_dispatching() -> None:
    from api.workers import actors

    result = target_monitoring.TargetMonitoringTickResult(
        dispatched=0,
        deferred=0,
        paused=0,
        failed=0,
        next_delay_seconds=300,
        enabled=True,
    )
    with (
        patch.object(
            target_monitoring,
            "claim_target_monitoring_scheduler_tick",
            return_value=300,
        ),
        patch.object(
            target_monitoring,
            "dispatch_due_target_monitor_refreshes",
            return_value=result,
        ) as dispatch,
        patch.object(
            actors.dispatch_due_retained_public_evidence_monitors,
            "send_with_options",
        ) as successor,
    ):
        actors.dispatch_due_retained_public_evidence_monitors.fn()

    dispatch.assert_called_once()
    successor.assert_called_once_with(delay=300_000)


def test_system_actor_schedules_one_shot_recovery_after_a_lost_successor() -> None:
    from api.workers import actors

    with (
        patch.object(
            target_monitoring,
            "claim_target_monitoring_scheduler_tick",
            return_value=None,
        ),
        patch.object(
            target_monitoring,
            "target_monitoring_scheduler_next_delay",
            return_value=300,
        ),
        patch.object(
            actors.dispatch_due_retained_public_evidence_monitors,
            "send_with_options",
        ) as recovery,
    ):
        actors.dispatch_due_retained_public_evidence_monitors.fn()

    recovery.assert_called_once_with(
        kwargs={"recovery": True},
        delay=300_000,
    )


def test_recovery_actor_does_not_fan_out_when_another_worker_claimed_the_tick() -> None:
    from api.workers import actors

    with (
        patch.object(
            target_monitoring,
            "claim_target_monitoring_scheduler_tick",
            return_value=None,
        ),
        patch.object(
            target_monitoring,
            "target_monitoring_scheduler_next_delay",
        ) as next_delay,
        patch.object(
            actors.dispatch_due_retained_public_evidence_monitors,
            "send_with_options",
        ) as successor,
    ):
        actors.dispatch_due_retained_public_evidence_monitors.fn(recovery=True)

    next_delay.assert_not_called()
    successor.assert_not_called()
