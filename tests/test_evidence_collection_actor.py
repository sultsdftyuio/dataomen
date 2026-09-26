from __future__ import annotations

from types import SimpleNamespace

import pytest

from api.services.prospecting import evidence_executor


TENANT_ID = "tenant-demo"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"


def test_actor_passes_only_durable_tenant_and_run_identifiers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from api.workers import actors

    calls: list[tuple[str, str]] = []
    events: list[dict[str, object]] = []
    monkeypatch.setattr(
        evidence_executor,
        "run_evidence_collection",
        lambda tenant_id, run_id: calls.append((tenant_id, run_id))
        or SimpleNamespace(
            status="completed",
            run_id=run_id,
            terminalized=True,
            summary={
                "retained_records_scanned": 2,
                "pending_evidence_proposals": 1,
                "evidence_created": 1,
            },
        ),
    )
    monkeypatch.setattr(actors, "_close_actor_openai_clients", lambda: None)
    monkeypatch.setattr(actors, "_job_started", lambda **kwargs: events.append(kwargs))
    monkeypatch.setattr(actors, "_job_finished", lambda **kwargs: events.append(kwargs))

    actors.process_retained_public_evidence_collection_job.fn(TENANT_ID, RUN_ID)

    assert calls == [(TENANT_ID, RUN_ID)]
    assert events[0] == {
        "job_name": "retained_public_evidence_collection",
        "tenant_id": TENANT_ID,
        "run_id": RUN_ID,
    }
    assert events[1]["state"] == "completed"
    assert events[1]["evidence_created"] == 1


def test_dead_letter_actor_does_not_touch_malformed_broker_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from api.workers import actors

    monkeypatch.setattr(
        evidence_executor,
        "mark_evidence_collection_dead_lettered",
        lambda *_args: pytest.fail("malformed payload must not reach the database"),
    )

    actors.mark_retained_public_evidence_collection_dead_lettered.fn({"args": [TENANT_ID]})
