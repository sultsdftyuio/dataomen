"""Tenant-scoped, candidate-first persistence for discovery.

This module is deliberately separate from ``lead_matches``.  A public post can
be a useful raw candidate long before an embedding or verifier decides it is a
qualified lead.  The pool persists that candidate once per workspace/profile
and appends immutable query/run observations on every repeated discovery.

The public write functions are fail-open.  Candidate-pool rollout must never
turn a source-ingestion success into a failed discovery run while its additive
SQL contract is still being deployed.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import threading
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from sqlalchemy import text

from .candidate_privacy import (
    MAX_EVIDENCE_TEXT_CHARS,
    MAX_IDENTIFIER_CHARS,
    collapse_space as _collapse_space,
    redacted_text as _redacted_text,
    sanitize_candidate_evidence,
    sanitize_source_snapshot,
)
from .discovery_telemetry import _database_engine


logger = logging.getLogger(__name__)


CANDIDATE_KINDS = frozenset({"public_post", "account", "contact"})
CANDIDATE_STATUSES = frozenset(
    {"raw", "plausible", "review", "qualified", "rejected"}
)
_INITIAL_CANDIDATE_STATUSES = frozenset({"raw", "plausible", "review"})
_TERMINAL_CANDIDATE_STATUSES = frozenset({"qualified", "rejected"})

_MAX_TENANT_CHARS = 120
_MAX_EXTERNAL_ID_CHARS = 512
_MAX_QUERY_CHARS = 512
_MAX_DECISION_CHARS = 1_000
_MISSING_SCHEMA_COOLDOWN_SECONDS = 300.0
_FAILURE_COOLDOWN_SECONDS = 30.0

_URL_PATTERN = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)

_candidate_pool_state_lock = threading.Lock()
_candidate_pool_unavailable_until = 0.0
_candidate_pool_last_warning_at = 0.0


def _normalized_identifier(value: Any, *, maximum: int = MAX_IDENTIFIER_CHARS) -> str:
    normalized = _collapse_space(value, maximum=maximum).casefold()
    if not normalized:
        raise ValueError("identifier is required")
    return normalized


def _normalized_external_id(value: Any) -> str:
    normalized = _collapse_space(value, maximum=_MAX_EXTERNAL_ID_CHARS)
    if not normalized:
        raise ValueError("external ID is required")
    return normalized


def _normalized_tenant_id(value: Any) -> str:
    normalized = _collapse_space(value, maximum=_MAX_TENANT_CHARS)
    if not normalized:
        raise ValueError("tenant ID is required")
    return normalized


def _uuid_value(value: Any, *, field_name: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be a UUID") from error


def _normalized_url(value: Any) -> str | None:
    raw = _collapse_space(value, maximum=_MAX_EXTERNAL_ID_CHARS)
    if not raw:
        return None
    if not _URL_PATTERN.fullmatch(raw):
        raise ValueError("URL must be an http(s) URL")
    parsed = urlsplit(raw)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("URL must include a host")
    return raw


def _normalized_status(value: Any) -> str:
    status = _normalized_identifier(value, maximum=32)
    if status not in CANDIDATE_STATUSES:
        raise ValueError(f"unsupported candidate status: {status}")
    return status


def _score_value(value: Any, *, field_name: str, maximum: float) -> float | None:
    if value is None:
        return None
    try:
        score = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be numeric") from error
    if not math.isfinite(score) or not 0 <= score <= maximum:
        raise ValueError(f"{field_name} must be between 0 and {maximum:g}")
    return score


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _query_hash(query_phrase: str) -> str:
    return _sha256(re.sub(r"\s+", " ", query_phrase).strip().casefold())


@dataclass(frozen=True)
class CandidateIdentity:
    """Provider-neutral candidate identity used for deterministic dedupe."""

    candidate_kind: str
    entity_provider: str
    entity_external_id: str
    entity_url: str | None = None
    # This is always `public.source_posts.id`, never a provider's external ID.
    source_post_id: str | None = None

    def __post_init__(self) -> None:
        kind = _normalized_identifier(self.candidate_kind, maximum=32)
        if kind not in CANDIDATE_KINDS:
            raise ValueError(f"unsupported candidate kind: {kind}")
        provider = _normalized_identifier(self.entity_provider)
        external_id = _normalized_external_id(self.entity_external_id)
        source_post_id = (
            _uuid_value(self.source_post_id, field_name="source_post_id")
            if self.source_post_id is not None
            else None
        )
        if kind == "public_post" and source_post_id is None:
            raise ValueError("public_post candidates require a global source_post_id UUID")

        object.__setattr__(self, "candidate_kind", kind)
        object.__setattr__(self, "entity_provider", provider)
        object.__setattr__(self, "entity_external_id", external_id)
        object.__setattr__(self, "entity_url", _normalized_url(self.entity_url))
        object.__setattr__(self, "source_post_id", source_post_id)


@dataclass(frozen=True)
class CandidateProvenance:
    """The source/query/run that caused one candidate observation."""

    discovery_run_id: str
    source: str
    source_external_id: str
    query_type: str
    query_phrase: str

    def __post_init__(self) -> None:
        query_phrase = _collapse_space(self.query_phrase, maximum=_MAX_QUERY_CHARS)
        if not query_phrase:
            raise ValueError("query phrase is required")
        object.__setattr__(
            self,
            "discovery_run_id",
            _uuid_value(self.discovery_run_id, field_name="discovery_run_id"),
        )
        object.__setattr__(self, "source", _normalized_identifier(self.source))
        object.__setattr__(self, "source_external_id", _normalized_external_id(self.source_external_id))
        object.__setattr__(self, "query_type", _normalized_identifier(self.query_type))
        object.__setattr__(self, "query_phrase", query_phrase)

    @property
    def query_hash(self) -> str:
        return _query_hash(self.query_phrase)


@dataclass(frozen=True)
class CandidateScores:
    """Explainable numeric scores. Component values are stored separately."""

    raw_score: float | None = None
    plausibility_score: float | None = None
    similarity_score: float | None = None
    verifier_score: float | None = None
    priority_score: float = 0.0
    components: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "raw_score",
            _score_value(self.raw_score, field_name="raw_score", maximum=1),
        )
        object.__setattr__(
            self,
            "plausibility_score",
            _score_value(
                self.plausibility_score,
                field_name="plausibility_score",
                maximum=1,
            ),
        )
        object.__setattr__(
            self,
            "similarity_score",
            _score_value(self.similarity_score, field_name="similarity_score", maximum=1),
        )
        object.__setattr__(
            self,
            "verifier_score",
            _score_value(self.verifier_score, field_name="verifier_score", maximum=1),
        )
        priority_score = _score_value(
            self.priority_score,
            field_name="priority_score",
            maximum=100,
        )
        object.__setattr__(self, "priority_score", priority_score if priority_score is not None else 0.0)
        components = self.components if isinstance(self.components, Mapping) else {}
        object.__setattr__(
            self,
            "components",
            sanitize_candidate_evidence(components),
        )

    def values(self) -> dict[str, float | None]:
        return {
            "raw_score": self.raw_score,
            "plausibility_score": self.plausibility_score,
            "similarity_score": self.similarity_score,
            "verifier_score": self.verifier_score,
            "priority_score": self.priority_score,
        }


@dataclass(frozen=True)
class CandidateWriteResult:
    """Result of a candidate upsert plus its provenance observation write."""

    candidate_id: str
    observation_id: str
    dedupe_key: str
    candidate_created: bool
    observation_created: bool


def deterministic_candidate_dedupe_key(identity: CandidateIdentity) -> str:
    """Return a stable SHA-256 key for one provider-neutral candidate subject."""

    payload = "\x1f".join(
        (
            "discovery-candidate-v1",
            identity.candidate_kind,
            identity.entity_provider,
            identity.entity_external_id.casefold(),
        )
    )
    return _sha256(payload)


def _coerce_scores(value: CandidateScores | Mapping[str, Any] | None) -> CandidateScores:
    if value is None:
        return CandidateScores()
    if isinstance(value, CandidateScores):
        return value
    if not isinstance(value, Mapping):
        raise ValueError("scores must be a CandidateScores value or mapping")
    return CandidateScores(
        raw_score=value.get("raw_score", value.get("raw")),
        plausibility_score=value.get("plausibility_score", value.get("plausibility")),
        similarity_score=value.get("similarity_score", value.get("similarity")),
        verifier_score=value.get("verifier_score", value.get("verifier")),
        priority_score=value.get("priority_score", value.get("priority", 0)),
        components=value.get("components", value.get("score_components", {})),
    )


def _candidate_pool_enabled() -> bool:
    return os.getenv("ARCLI_DISCOVERY_CANDIDATE_POOL_ENABLED", "true").strip().casefold() not in {
        "0",
        "false",
        "no",
        "off",
    }


def _in_cooldown() -> bool:
    with _candidate_pool_state_lock:
        return time.monotonic() < _candidate_pool_unavailable_until


def _is_missing_schema_error(error: BaseException) -> bool:
    original = getattr(error, "orig", error)
    sqlstate = getattr(original, "pgcode", None) or getattr(original, "sqlstate", None)
    if sqlstate in {"3F000", "42P01", "42703"}:
        return True
    message = str(original).casefold()
    return any(
        marker in message
        for marker in (
            "discovery_candidates",
            "discovery_candidate_observations",
            "relation does not exist",
            "undefined table",
            "undefined column",
        )
    )


def _record_failure(operation: str, error: Exception) -> None:
    """Open a short circuit without logging source contents or query phrases."""

    global _candidate_pool_unavailable_until, _candidate_pool_last_warning_at

    now = time.monotonic()
    schema_missing = _is_missing_schema_error(error)
    cooldown = (
        _MISSING_SCHEMA_COOLDOWN_SECONDS if schema_missing else _FAILURE_COOLDOWN_SECONDS
    )
    should_warn = False
    with _candidate_pool_state_lock:
        _candidate_pool_unavailable_until = max(
            _candidate_pool_unavailable_until,
            now + cooldown,
        )
        if now >= _candidate_pool_last_warning_at + cooldown:
            _candidate_pool_last_warning_at = now
            should_warn = True

    if should_warn:
        logger.warning(
            "discovery_candidate_pool_skipped operation=%s reason=%s error_type=%s retry_after_seconds=%s",
            operation,
            "schema_unavailable" if schema_missing else "storage_unavailable",
            type(error).__name__,
            int(cooldown),
        )


def _json_value(value: Mapping[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _candidate_snapshot(
    identity: CandidateIdentity,
    provenance: CandidateProvenance,
    source_snapshot: Mapping[str, Any] | None,
) -> dict[str, Any]:
    snapshot = sanitize_source_snapshot(source_snapshot)
    # Identity comes from the trusted caller contract, never the provider
    # payload.  This prevents a stale or malicious payload from obscuring the
    # source row that governs later retention/deletion.
    snapshot["source"] = provenance.source
    snapshot["external_id"] = provenance.source_external_id
    if identity.entity_url:
        snapshot["url"] = identity.entity_url
    return snapshot


def record_candidate(
    tenant_id: str,
    service_profile_id: str,
    *,
    identity: CandidateIdentity,
    provenance: CandidateProvenance,
    scores: CandidateScores | Mapping[str, Any] | None = None,
    source_snapshot: Mapping[str, Any] | None = None,
    evidence: Mapping[str, Any] | None = None,
    status: str = "raw",
) -> CandidateWriteResult | None:
    """Upsert a candidate and append one source/query/run observation.

    ``identity.source_post_id`` is a global ``public.source_posts.id`` UUID.
    ``provenance.source_external_id`` is the provider's external post ID.  The
    SQL contract validates this distinction and protects tenant/profile/run
    scope with composite foreign keys and trigger guards.
    """

    if not _candidate_pool_enabled() or _in_cooldown():
        return None

    try:
        tenant = _normalized_tenant_id(tenant_id)
        profile_id = _uuid_value(service_profile_id, field_name="service_profile_id")
        normalized_status = _normalized_status(status)
        if normalized_status not in _INITIAL_CANDIDATE_STATUSES:
            raise ValueError("new candidates must begin as raw, plausible, or review")
        if identity.candidate_kind == "public_post" and (
            identity.entity_provider != provenance.source
            or identity.entity_external_id != provenance.source_external_id
        ):
            raise ValueError("public_post identity must match its source provenance")
        resolved_scores = _coerce_scores(scores)
    except ValueError as error:
        logger.info(
            "discovery_candidate_pool_skipped operation=%s reason=%s",
            "record_candidate",
            "invalid_candidate_input",
        )
        return None

    dedupe_key = deterministic_candidate_dedupe_key(identity)
    safe_snapshot = _candidate_snapshot(identity, provenance, source_snapshot)
    safe_evidence = sanitize_candidate_evidence(evidence)
    values = resolved_scores.values()
    candidate_id = str(uuid4())
    observation_id = str(uuid4())
    candidate_params = {
        "candidate_id": candidate_id,
        "tenant_id": tenant,
        "service_profile_id": profile_id,
        "first_discovery_run_id": provenance.discovery_run_id,
        "last_discovery_run_id": provenance.discovery_run_id,
        "candidate_kind": identity.candidate_kind,
        "entity_provider": identity.entity_provider,
        "entity_external_id": identity.entity_external_id,
        "entity_url": identity.entity_url,
        "source": provenance.source,
        "source_external_id": provenance.source_external_id,
        "source_post_id": identity.source_post_id,
        "dedupe_key": dedupe_key,
        "candidate_status": normalized_status,
        "raw_score": values["raw_score"],
        "plausibility_score": values["plausibility_score"],
        "similarity_score": values["similarity_score"],
        "verifier_score": values["verifier_score"],
        "priority_score": values["priority_score"],
        "score_components": _json_value(dict(resolved_scores.components)),
        "source_snapshot": _json_value(safe_snapshot),
        "evidence": _json_value(safe_evidence),
    }
    observation_params = {
        "observation_id": observation_id,
        "tenant_id": tenant,
        "candidate_id": candidate_id,
        "discovery_run_id": provenance.discovery_run_id,
        "source": provenance.source,
        "source_post_id": identity.source_post_id,
        "query_type": provenance.query_type,
        "query_phrase": provenance.query_phrase,
        "query_hash": provenance.query_hash,
        "observation_scores": _json_value(values),
        "evidence": _json_value(safe_evidence),
    }

    try:
        with _database_engine().begin() as conn:
            candidate_row = conn.execute(
                text(
                    """
                    INSERT INTO public.discovery_candidates (
                        id,
                        tenant_id,
                        service_profile_id,
                        first_discovery_run_id,
                        last_discovery_run_id,
                        candidate_kind,
                        entity_provider,
                        entity_external_id,
                        entity_url,
                        source,
                        source_external_id,
                        source_post_id,
                        dedupe_key,
                        candidate_status,
                        raw_score,
                        plausibility_score,
                        similarity_score,
                        verifier_score,
                        priority_score,
                        score_components,
                        source_snapshot,
                        evidence
                    )
                    SELECT
                        CAST(:candidate_id AS uuid),
                        :tenant_id,
                        CAST(:service_profile_id AS uuid),
                        CAST(:first_discovery_run_id AS uuid),
                        CAST(:last_discovery_run_id AS uuid),
                        :candidate_kind,
                        :entity_provider,
                        :entity_external_id,
                        :entity_url,
                        :source,
                        :source_external_id,
                        CAST(:source_post_id AS uuid),
                        :dedupe_key,
                        :candidate_status,
                        :raw_score,
                        :plausibility_score,
                        :similarity_score,
                        :verifier_score,
                        :priority_score,
                        CAST(:score_components AS jsonb),
                        CAST(:source_snapshot AS jsonb),
                        CAST(:evidence AS jsonb)
                    WHERE EXISTS (
                        SELECT 1
                          FROM public.service_profiles AS profile
                         WHERE profile.id = CAST(:service_profile_id AS uuid)
                           AND profile.tenant_id = :tenant_id
                    )
                      AND EXISTS (
                        SELECT 1
                          FROM public.discovery_runs AS run
                         WHERE run.id = CAST(:first_discovery_run_id AS uuid)
                           AND run.tenant_id = :tenant_id
                           AND run.service_profile_id = CAST(:service_profile_id AS uuid)
                    )
                    ON CONFLICT (tenant_id, service_profile_id, dedupe_key)
                    DO UPDATE SET
                        last_discovery_run_id = EXCLUDED.last_discovery_run_id,
                        last_seen_at = NOW(),
                        raw_score = COALESCE(EXCLUDED.raw_score, public.discovery_candidates.raw_score),
                        plausibility_score = COALESCE(EXCLUDED.plausibility_score, public.discovery_candidates.plausibility_score),
                        similarity_score = COALESCE(EXCLUDED.similarity_score, public.discovery_candidates.similarity_score),
                        verifier_score = COALESCE(EXCLUDED.verifier_score, public.discovery_candidates.verifier_score),
                        priority_score = GREATEST(public.discovery_candidates.priority_score, EXCLUDED.priority_score),
                        score_components = public.discovery_candidates.score_components || EXCLUDED.score_components,
                        evidence = public.discovery_candidates.evidence || EXCLUDED.evidence,
                        updated_at = NOW()
                    RETURNING id, (xmax = 0) AS candidate_created
                    """
                ),
                candidate_params,
            ).mappings().one_or_none()
            if not candidate_row:
                return None

            persisted_candidate_id = str(candidate_row["id"])
            observation_params["candidate_id"] = persisted_candidate_id
            observation_row = conn.execute(
                text(
                    """
                    INSERT INTO public.discovery_candidate_observations (
                        id,
                        tenant_id,
                        candidate_id,
                        discovery_run_id,
                        source,
                        source_post_id,
                        query_type,
                        query_phrase,
                        query_hash,
                        observation_scores,
                        evidence
                    )
                    SELECT
                        CAST(:observation_id AS uuid),
                        :tenant_id,
                        CAST(:candidate_id AS uuid),
                        CAST(:discovery_run_id AS uuid),
                        :source,
                        CAST(:source_post_id AS uuid),
                        :query_type,
                        :query_phrase,
                        :query_hash,
                        CAST(:observation_scores AS jsonb),
                        CAST(:evidence AS jsonb)
                    WHERE EXISTS (
                        SELECT 1
                          FROM public.discovery_candidates AS candidate
                         WHERE candidate.id = CAST(:candidate_id AS uuid)
                           AND candidate.tenant_id = :tenant_id
                    )
                    ON CONFLICT (
                        tenant_id,
                        candidate_id,
                        discovery_run_id,
                        source,
                        query_hash
                    )
                    DO UPDATE SET
                        last_observed_at = NOW(),
                        observation_count = public.discovery_candidate_observations.observation_count + 1,
                        updated_at = NOW()
                    RETURNING id, (xmax = 0) AS observation_created
                    """
                ),
                observation_params,
            ).mappings().one_or_none()
            if not observation_row:
                return None

            return CandidateWriteResult(
                candidate_id=persisted_candidate_id,
                observation_id=str(observation_row["id"]),
                dedupe_key=dedupe_key,
                candidate_created=bool(candidate_row["candidate_created"]),
                observation_created=bool(observation_row["observation_created"]),
            )
    except Exception as error:  # Candidate storage must not block discovery.
        _record_failure("record_candidate", error)
        return None


def record_public_post_candidate(
    tenant_id: str,
    service_profile_id: str,
    discovery_run_id: str,
    *,
    source: str,
    source_post_id: str,
    source_external_id: str,
    query_type: str,
    query_phrase: str,
    source_url: str | None = None,
    source_snapshot: Mapping[str, Any] | None = None,
    scores: CandidateScores | Mapping[str, Any] | None = None,
    evidence: Mapping[str, Any] | None = None,
    status: str = "raw",
) -> CandidateWriteResult | None:
    """Record one public source candidate.

    ``source_post_id`` must be the global database UUID from
    ``public.source_posts.id``.  It is not the provider ID: pass the latter as
    ``source_external_id``.  Use :func:`record_public_source_candidate` when a
    caller only has the provider ID and needs the module to resolve that row.
    """

    try:
        identity = CandidateIdentity(
            candidate_kind="public_post",
            entity_provider=source,
            entity_external_id=source_external_id,
            entity_url=source_url,
            source_post_id=source_post_id,
        )
        provenance = CandidateProvenance(
            discovery_run_id=discovery_run_id,
            source=source,
            source_external_id=source_external_id,
            query_type=query_type,
            query_phrase=query_phrase,
        )
    except ValueError:
        logger.info(
            "discovery_candidate_pool_skipped operation=%s reason=%s",
            "record_public_post_candidate",
            "invalid_public_post_input",
        )
        return None
    return record_candidate(
        tenant_id,
        service_profile_id,
        identity=identity,
        provenance=provenance,
        scores=scores,
        source_snapshot=source_snapshot,
        evidence=evidence,
        status=status,
    )


def _global_public_source_snapshots(
    source: str,
    source_external_ids: Sequence[str],
) -> dict[str, tuple[str, dict[str, Any]]]:
    """Resolve a bounded set of provider IDs in one global-source query."""

    normalized_ids = tuple(
        dict.fromkeys(
            _normalized_external_id(source_external_id)
            for source_external_id in source_external_ids
            if str(source_external_id or "").strip()
        )
    )
    if not normalized_ids:
        return {}

    bindings = {
        "source": source,
        **{
            f"source_external_id_{index}": source_external_id
            for index, source_external_id in enumerate(normalized_ids)
        },
    }
    placeholders = ", ".join(
        f":source_external_id_{index}" for index in range(len(normalized_ids))
    )
    with _database_engine().begin() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT
                    id,
                    source,
                    source_post_id,
                    title,
                    COALESCE(body, text, '') AS text,
                    url,
                    COALESCE(posted_at, published_at) AS published_at,
                    language,
                    metadata
                  FROM public.source_posts
                 WHERE tenant_id IS NULL
                   AND source = :source
                   AND source_post_id IN ({placeholders})
                """
            ),
            bindings,
        ).mappings()

        resolved: dict[str, tuple[str, dict[str, Any]]] = {}
        for row in rows:
            external_id = str(row.get("source_post_id") or "").strip()
            database_id = str(row.get("id") or "").strip()
            if not external_id or not database_id:
                continue
            snapshot = {
                "source": row.get("source"),
                "external_id": external_id,
                "title": row.get("title"),
                "text": row.get("text"),
                "url": row.get("url"),
                "published_at": str(row.get("published_at") or ""),
                "language": row.get("language"),
                "metadata": row.get("metadata"),
            }
            resolved[external_id] = (database_id, snapshot)
    return resolved


def _global_public_source_snapshot(
    source: str,
    source_external_id: str,
) -> tuple[str, dict[str, Any]] | None:
    """Resolve one provider ID to its global source-post UUID and snapshot."""

    return _global_public_source_snapshots(source, (source_external_id,)).get(
        source_external_id
    )


def record_public_source_candidate(
    tenant_id: str,
    service_profile_id: str,
    discovery_run_id: str,
    *,
    source: str,
    source_external_id: str,
    query_type: str,
    query_phrase: str,
    source_snapshot: Mapping[str, Any] | None = None,
    scores: CandidateScores | Mapping[str, Any] | None = None,
    evidence: Mapping[str, Any] | None = None,
    status: str = "raw",
) -> CandidateWriteResult | None:
    """Resolve and record a public candidate when only a provider ID is known."""

    if not _candidate_pool_enabled() or _in_cooldown():
        return None
    try:
        normalized_source = _normalized_identifier(source)
        normalized_external_id = _normalized_external_id(source_external_id)
        resolved = _global_public_source_snapshot(
            normalized_source,
            normalized_external_id,
        )
    except (Exception, ValueError) as error:
        if isinstance(error, ValueError):
            logger.info(
                "discovery_candidate_pool_skipped operation=%s reason=%s",
                "resolve_public_source_candidate",
                "invalid_public_source_input",
            )
        else:
            _record_failure("resolve_public_source_candidate", error)
        return None
    if not resolved:
        return None

    source_post_id, stored_snapshot = resolved
    merged_snapshot = dict(stored_snapshot)
    if isinstance(source_snapshot, Mapping):
        merged_snapshot.update(source_snapshot)
    return record_public_post_candidate(
        tenant_id,
        service_profile_id,
        discovery_run_id,
        source=normalized_source,
        source_post_id=source_post_id,
        source_external_id=normalized_external_id,
        query_type=query_type,
        query_phrase=query_phrase,
        source_url=stored_snapshot.get("url") or None,
        source_snapshot=merged_snapshot,
        scores=scores,
        evidence=evidence,
        status=status,
    )


def record_public_source_candidates(
    tenant_id: str,
    service_profile_id: str,
    discovery_run_id: str,
    *,
    source: str,
    candidates: Sequence[Mapping[str, Any]],
) -> list[CandidateWriteResult]:
    """Record several provider posts after one global-source lookup.

    Each item accepts ``source_external_id``, ``query_type``, and
    ``query_phrase``. Optional ``scores``, ``source_snapshot``, ``evidence``,
    and ``status`` use the same contract as :func:`record_public_source_candidate`.
    Invalid or no-longer-persisted provider rows are skipped independently so a
    single malformed result cannot hold up a discovery run.
    """

    if not _candidate_pool_enabled() or _in_cooldown() or not candidates:
        return []
    try:
        normalized_source = _normalized_identifier(source)
        entries = [
            item
            for item in candidates
            if isinstance(item, Mapping)
            and str(item.get("source_external_id") or "").strip()
            and str(item.get("query_type") or "").strip()
            and str(item.get("query_phrase") or "").strip()
        ]
        source_ids = [
            _normalized_external_id(item["source_external_id"])
            for item in entries
        ]
        resolved_posts = _global_public_source_snapshots(
            normalized_source,
            source_ids,
        )
    except (Exception, ValueError) as error:
        if isinstance(error, ValueError):
            logger.info(
                "discovery_candidate_pool_skipped operation=%s reason=%s",
                "record_public_source_candidates",
                "invalid_public_source_batch_input",
            )
        else:
            _record_failure("resolve_public_source_candidate_batch", error)
        return []

    writes: list[CandidateWriteResult] = []
    for item in entries:
        try:
            source_external_id = _normalized_external_id(item["source_external_id"])
        except ValueError:
            continue
        resolved = resolved_posts.get(source_external_id)
        if not resolved:
            continue

        source_post_id, stored_snapshot = resolved
        source_snapshot = item.get("source_snapshot")
        merged_snapshot = dict(stored_snapshot)
        if isinstance(source_snapshot, Mapping):
            merged_snapshot.update(source_snapshot)
        write = record_public_post_candidate(
            tenant_id,
            service_profile_id,
            discovery_run_id,
            source=normalized_source,
            source_post_id=source_post_id,
            source_external_id=source_external_id,
            query_type=str(item["query_type"]),
            query_phrase=str(item["query_phrase"]),
            source_url=stored_snapshot.get("url") or None,
            source_snapshot=merged_snapshot,
            scores=item.get("scores"),
            evidence=item.get("evidence"),
            status=str(item.get("status") or "raw"),
        )
        if write is not None:
            writes.append(write)
    return writes


def advance_candidate_status(
    tenant_id: str,
    candidate_id: str,
    status: str,
    *,
    scores: CandidateScores | Mapping[str, Any] | None = None,
    evidence: Mapping[str, Any] | None = None,
    decision_by: str | None = None,
    decision_reason: str | None = None,
) -> bool:
    """Advance one candidate through its SQL-enforced lifecycle.

    The database guard permits only ``raw → plausible → review →
    qualified/rejected`` (with rejection permitted at each pre-terminal stage).
    This service-side function must be called only after the caller has made
    its own tenant-membership authorization decision.
    """

    if not _candidate_pool_enabled() or _in_cooldown():
        return False
    try:
        tenant = _normalized_tenant_id(tenant_id)
        normalized_candidate_id = _uuid_value(candidate_id, field_name="candidate_id")
        normalized_status = _normalized_status(status)
        resolved_scores = _coerce_scores(scores)
        values = resolved_scores.values()
        safe_evidence = sanitize_candidate_evidence(evidence)
        actor = (
            _collapse_space(decision_by, maximum=_MAX_IDENTIFIER_CHARS)
            if decision_by is not None
            else ""
        )
        reason = (
            _redacted_text(decision_reason, maximum=_MAX_DECISION_CHARS)
            if decision_reason is not None
            else ""
        )
        if normalized_status in _TERMINAL_CANDIDATE_STATUSES and not actor:
            actor = "system"
    except ValueError:
        return False

    is_qualified = normalized_status == "qualified"
    is_rejected = normalized_status == "rejected"
    try:
        with _database_engine().begin() as conn:
            result = conn.execute(
                text(
                    """
                    UPDATE public.discovery_candidates
                       SET candidate_status = :candidate_status,
                           decision_by = CASE
                               WHEN :is_terminal THEN COALESCE(NULLIF(:decision_by, ''), decision_by, 'system')
                               ELSE NULL
                           END,
                           decision_reason = CASE
                               WHEN :is_terminal THEN NULLIF(:decision_reason, '')
                               ELSE NULL
                           END,
                           decision_at = CASE
                               WHEN :is_terminal THEN COALESCE(decision_at, NOW())
                               ELSE NULL
                           END,
                           qualified_at = CASE
                               WHEN :is_qualified THEN COALESCE(qualified_at, NOW())
                               ELSE NULL
                           END,
                           rejected_at = CASE
                               WHEN :is_rejected THEN COALESCE(rejected_at, NOW())
                               ELSE NULL
                           END,
                           raw_score = COALESCE(:raw_score, raw_score),
                           plausibility_score = COALESCE(
                               :plausibility_score,
                               plausibility_score
                           ),
                           similarity_score = COALESCE(
                               :similarity_score,
                               similarity_score
                           ),
                           verifier_score = COALESCE(
                               :verifier_score,
                               verifier_score
                           ),
                           priority_score = GREATEST(
                               priority_score,
                               :priority_score
                           ),
                           score_components = score_components
                               || CAST(:score_components AS jsonb),
                           evidence = evidence || CAST(:evidence AS jsonb),
                           updated_at = NOW()
                     WHERE id = CAST(:candidate_id AS uuid)
                       AND tenant_id = :tenant_id
                    RETURNING id
                    """
                ),
                {
                    "tenant_id": tenant,
                    "candidate_id": normalized_candidate_id,
                    "candidate_status": normalized_status,
                    "raw_score": values["raw_score"],
                    "plausibility_score": values["plausibility_score"],
                    "similarity_score": values["similarity_score"],
                    "verifier_score": values["verifier_score"],
                    "priority_score": values["priority_score"],
                    "score_components": _json_value(
                        dict(resolved_scores.components)
                    ),
                    "evidence": _json_value(safe_evidence),
                    "decision_by": actor,
                    "decision_reason": reason,
                    "is_terminal": normalized_status in _TERMINAL_CANDIDATE_STATUSES,
                    "is_qualified": is_qualified,
                    "is_rejected": is_rejected,
                },
            ).scalar_one_or_none()
            return result is not None
    except Exception as error:
        _record_failure("advance_candidate_status", error)
        return False


def advance_public_source_candidate_status(
    tenant_id: str,
    service_profile_id: str,
    *,
    source: str,
    source_external_id: str,
    status: str,
    scores: CandidateScores | Mapping[str, Any] | None = None,
    evidence: Mapping[str, Any] | None = None,
    decision_by: str | None = None,
    decision_reason: str | None = None,
) -> bool:
    """Advance a public-post candidate without exposing a database UUID.

    Matching workers know the provider identity, while candidate IDs are an
    internal storage detail. This helper resolves that identity under the same
    tenant/profile scope before delegating to the SQL-enforced lifecycle.
    """

    if not _candidate_pool_enabled() or _in_cooldown():
        return False
    try:
        tenant = _normalized_tenant_id(tenant_id)
        profile_id = _uuid_value(service_profile_id, field_name="service_profile_id")
        normalized_source = _normalized_identifier(source)
        external_id = _normalized_external_id(source_external_id)
        with _database_engine().begin() as conn:
            candidate_id = conn.execute(
                text(
                    """
                    SELECT id
                      FROM public.discovery_candidates
                     WHERE tenant_id = :tenant_id
                       AND service_profile_id = CAST(:service_profile_id AS uuid)
                       AND candidate_kind = 'public_post'
                       AND entity_provider = :source
                       AND entity_external_id = :source_external_id
                     LIMIT 1
                    """
                ),
                {
                    "tenant_id": tenant,
                    "service_profile_id": profile_id,
                    "source": normalized_source,
                    "source_external_id": external_id,
                },
            ).scalar_one_or_none()
    except (Exception, ValueError) as error:
        if not isinstance(error, ValueError):
            _record_failure("resolve_public_source_candidate_status", error)
        return False
    if not candidate_id:
        return False
    return advance_candidate_status(
        tenant,
        str(candidate_id),
        status,
        scores=scores,
        evidence=evidence,
        decision_by=decision_by,
        decision_reason=decision_reason,
    )


__all__ = [
    "CANDIDATE_KINDS",
    "CANDIDATE_STATUSES",
    "CandidateIdentity",
    "CandidateProvenance",
    "CandidateScores",
    "CandidateWriteResult",
    "advance_candidate_status",
    "advance_public_source_candidate_status",
    "deterministic_candidate_dedupe_key",
    "record_candidate",
    "record_public_post_candidate",
    "record_public_source_candidate",
    "record_public_source_candidates",
    "sanitize_candidate_evidence",
    "sanitize_source_snapshot",
]
