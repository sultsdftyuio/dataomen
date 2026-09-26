from __future__ import annotations

from types import SimpleNamespace

import pytest

from api.services.prospecting import candidate_executor


TENANT_ID = "tenant-demo"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"


def test_actor_passes_only_the_durable_tenant_and_run_identifiers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from api.workers import actors

    calls: list[tuple[str, str]] = []
    events: list[dict[str, object]] = []
    monkeypatch.setattr(
        candidate_executor,
        "run_candidate_generation",
        lambda tenant_id, run_id: calls.append((tenant_id, run_id))
        or SimpleNamespace(
            status="completed",
            run_id=run_id,
            terminalized=True,
            summary={"pages_fetched": 1, "candidate_proposals": 1, "entities_created": 1},
        ),
    )
    monkeypatch.setattr(actors, "_close_actor_openai_clients", lambda: None)
    monkeypatch.setattr(actors, "_job_started", lambda **kwargs: events.append(kwargs))
    monkeypatch.setattr(actors, "_job_finished", lambda **kwargs: events.append(kwargs))

    actors.process_entity_candidate_generation_job.fn(TENANT_ID, RUN_ID)

    assert calls == [(TENANT_ID, RUN_ID)]
    assert events[0] == {
        "job_name": "entity_candidate_generation",
        "tenant_id": TENANT_ID,
        "run_id": RUN_ID,
    }
    assert events[1]["state"] == "completed"
    assert events[1]["candidate_proposals"] == 1


def test_dead_letter_actor_does_not_touch_a_malformed_broker_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from api.workers import actors

    monkeypatch.setattr(
        candidate_executor,
        "mark_candidate_generation_dead_lettered",
        lambda *_args: pytest.fail("malformed payload must not reach the database"),
    )

    actors.mark_entity_candidate_generation_dead_lettered.fn({"args": [TENANT_ID]})
