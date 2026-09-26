"""Durable queue dispatch for explicitly requested candidate-generation runs.

The database row is created before a broker message is published.  If publish
is ambiguous or unavailable, the row stays safely ``queued`` and an idempotent
repeat can resend the same two-ID message; the worker's lease claim absorbs a
duplicate delivery.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from sqlalchemy.engine import Engine

from .candidate_generation import (
    CandidateGenerationRun,
    CandidateGenerationStartRequest,
    CandidateGenerationSkipReason,
    create_candidate_generation_run,
)
from .official_site_generation import (
    DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS,
    OfficialSiteGenerationLimits,
)


logger = logging.getLogger(__name__)


CandidateGenerationDispatchState = Literal["queued", "running", "terminal", "skipped"]


@dataclass(frozen=True)
class CandidateGenerationDispatchResult:
    """Content-free dispatch result for the trusted internal trigger."""

    state: CandidateGenerationDispatchState
    run: CandidateGenerationRun | None
    message_id: str | None = None
    created: bool = False
    skip_reason: CandidateGenerationSkipReason | None = None

    def __post_init__(self) -> None:
        if self.state == "skipped":
            if self.run is not None or self.message_id is not None or self.skip_reason is None:
                raise ValueError("a skipped dispatch requires only a skip_reason")
            return
        if self.run is None or self.skip_reason is not None:
            raise ValueError("a durable dispatch requires a run and no skip_reason")
        if self.state == "queued" and not self.message_id:
            raise ValueError("a queued dispatch requires a broker message ID")
        if self.state != "queued" and self.message_id is not None:
            raise ValueError("only a queued dispatch may include a broker message ID")


def _publish_candidate_generation_run(run: CandidateGenerationRun) -> str:
    """Publish only durable identifiers after configuring the producer broker."""

    # Import the decorated actor only after the Redis broker is configured,
    # matching the established worker-producer convention.
    from api.workers.actors import (
        _require_redis_broker,
        process_entity_candidate_generation_job,
    )

    _require_redis_broker()
    message = process_entity_candidate_generation_job.send(run.tenant_id, run.id)
    return str(message.message_id)


def enqueue_candidate_generation_run(
    request: CandidateGenerationStartRequest,
    *,
    engine: Engine | None = None,
    limits: OfficialSiteGenerationLimits = DEFAULT_OFFICIAL_SITE_GENERATION_LIMITS,
) -> CandidateGenerationDispatchResult:
    """Create then dispatch a bounded generation run without broker payload data.

    A queued run is deliberately re-published on an idempotent retry. This
    repairs a crash between the committed database insert and ``send``. It may
    result in duplicate messages, but only one worker can claim the run.
    """

    creation = create_candidate_generation_run(request, engine=engine, limits=limits)
    if creation.run is None:
        assert creation.skip_reason is not None
        return CandidateGenerationDispatchResult(
            state="skipped",
            run=None,
            created=False,
            skip_reason=creation.skip_reason,
        )

    run = creation.run
    if run.status == "running":
        return CandidateGenerationDispatchResult(
            state="running",
            run=run,
            created=creation.created,
        )
    if run.status != "queued":
        return CandidateGenerationDispatchResult(
            state="terminal",
            run=run,
            created=creation.created,
        )

    try:
        message_id = _publish_candidate_generation_run(run)
    except Exception as error:
        # A producer failure is intentionally not terminalized. ``send`` can
        # fail after Redis accepted the message, so both failure and success
        # are repaired safely by an idempotent retry plus lease claiming.
        logger.error(
            "candidate_generation_dispatch_unavailable tenant_id=%s run_id=%s error_type=%s",
            run.tenant_id,
            run.id,
            error.__class__.__name__,
        )
        raise RuntimeError("Candidate-generation queue is unavailable.") from error

    logger.info(
        "candidate_generation_dispatched tenant_id=%s run_id=%s created=%s message_id=%s",
        run.tenant_id,
        run.id,
        creation.created,
        message_id,
    )
    return CandidateGenerationDispatchResult(
        state="queued",
        run=run,
        message_id=message_id,
        created=creation.created,
    )


__all__ = [
    "CandidateGenerationDispatchResult",
    "CandidateGenerationDispatchState",
    "enqueue_candidate_generation_run",
]
