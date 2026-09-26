"""Durable queue dispatch for explicit retained-public evidence requests.

A database run exists before a message is published.  An ambiguous broker
outcome leaves that row queued, so retrying the same nonce can safely publish
the same two opaque identifiers again; the lease claim prevents double work.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from sqlalchemy.engine import Engine

from .evidence_collection import (
    EvidenceCollectionRun,
    EvidenceCollectionRunCreation,
    EvidenceCollectionSkipReason,
    EvidenceCollectionStartRequest,
)
from .evidence_run_lifecycle import create_evidence_collection_run
from .research_policy import DEFAULT_EVIDENCE_RESEARCH_LIMITS, EvidenceResearchLimits


logger = logging.getLogger(__name__)


EvidenceCollectionDispatchState = Literal["queued", "running", "terminal", "skipped"]


@dataclass(frozen=True)
class EvidenceCollectionDispatchResult:
    """Content-free outcome for the trusted internal trigger."""

    state: EvidenceCollectionDispatchState
    run: EvidenceCollectionRun | None
    message_id: str | None = None
    created: bool = False
    skip_reason: EvidenceCollectionSkipReason | None = None

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


def _publish_evidence_collection_run(run: EvidenceCollectionRun) -> str:
    """Publish only durable tenant/run IDs after the broker is configured."""

    from api.workers.actors import _require_redis_broker, process_retained_public_evidence_collection_job

    _require_redis_broker()
    message = process_retained_public_evidence_collection_job.send(run.tenant_id, run.id)
    return str(message.message_id)


def enqueue_evidence_collection_run(
    request: EvidenceCollectionStartRequest,
    *,
    engine: Engine | None = None,
    limits: EvidenceResearchLimits = DEFAULT_EVIDENCE_RESEARCH_LIMITS,
) -> EvidenceCollectionDispatchResult:
    """Create then dispatch one bounded retained-corpus review request."""

    creation: EvidenceCollectionRunCreation = create_evidence_collection_run(
        request,
        engine=engine,
        limits=limits,
    )
    if creation.run is None:
        assert creation.skip_reason is not None
        return EvidenceCollectionDispatchResult(
            state="skipped",
            run=None,
            created=False,
            skip_reason=creation.skip_reason,
        )

    run = creation.run
    if run.status == "running":
        return EvidenceCollectionDispatchResult(state="running", run=run, created=creation.created)
    if run.status != "queued":
        return EvidenceCollectionDispatchResult(state="terminal", run=run, created=creation.created)
    try:
        message_id = _publish_evidence_collection_run(run)
    except Exception as error:
        # ``send`` may fail after Redis accepted the message. Never mark the
        # run terminal here: a same-nonce retry repairs either outcome.
        logger.error(
            "retained_public_evidence_dispatch_unavailable tenant_id=%s run_id=%s error_type=%s",
            run.tenant_id,
            run.id,
            error.__class__.__name__,
        )
        raise RuntimeError("Retained-public evidence queue is unavailable.") from error

    logger.info(
        "retained_public_evidence_dispatched tenant_id=%s run_id=%s created=%s message_id=%s",
        run.tenant_id,
        run.id,
        creation.created,
        message_id,
    )
    return EvidenceCollectionDispatchResult(
        state="queued",
        run=run,
        message_id=message_id,
        created=creation.created,
    )


__all__ = [
    "EvidenceCollectionDispatchResult",
    "EvidenceCollectionDispatchState",
    "enqueue_evidence_collection_run",
]
