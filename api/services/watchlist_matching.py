"""Tenant-safe matching for customer-defined prospect Watchlists.

Watchlists narrow an existing website-derived service profile to a buyer group
and a concrete problem. Public posts remain global and cached; only the
result rows are tenant-owned. Similarity is intentionally a recall prefilter
and every surfaced result still comes through :class:`VerifierService`.
"""

from __future__ import annotations

import json
import logging
import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import text

from api.services.cost_controls import TenantQuotaGuard, env_int
from api.services.embeddings import (
    EmbeddingService,
    _as_dict,
    _database_engine,
    _load_service_profile,
    _service_profile_columns,
    normalize_embedding_text,
)
from api.services.matching import PostEmbedding, find_candidate_matches
from api.services.social.legacy_fetch import _primitive_metadata
from api.services.social.legacy_storage import _lead_match_status
from api.services.social.models import (
    DiscoveryQuery,
    SocialPost,
    _embedding_sha256,
    _embedding_values,
    _service_profile_from_row,
)
from api.services.social.public_records import (
    _cached_public_source_post_embedding,
    _load_public_source_post_rows,
    _load_recent_embedded_public_source_post_rows,
    _public_source_post_as_social_post,
)
from api.services.verifier import (
    VERIFIER_POLICY_VERSION,
    CandidatePost,
    ServiceProfile,
    VerificationResult,
    VerifierService,
)

logger = logging.getLogger(__name__)

WATCHLIST_SOURCES = frozenset(
    {"hackernews", "bluesky", "lemmy", "stackexchange", "github", "x"}
)
DEFAULT_WATCHLIST_SOURCES = (
    "hackernews",
    "bluesky",
    "lemmy",
    "stackexchange",
    "github",
)


class WatchlistAlreadyQueuedError(RuntimeError):
    """The same Watchlist already has a recent worker handoff."""


class WatchlistRateLimitError(RuntimeError):
    """A tenant has used its bounded Watchlist scan allowance."""


@dataclass(frozen=True)
class WatchlistContext:
    id: str
    tenant_id: str
    service_profile_id: str
    profile: ServiceProfile
    queries: tuple[DiscoveryQuery, ...]
    source_preferences: frozenset[str]
    embedding: list[float]
    embedding_sha256: str


def _space(value: object, *, max_chars: int = 700) -> str:
    return " ".join(str(value or "").split())[:max_chars].strip()


def _json_list(value: Any, *, max_items: int = 12, max_chars: int = 180) -> list[str]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = []
    if not isinstance(value, list):
        return []
    items: list[str] = []
    seen: set[str] = set()
    for raw_item in value:
        item = _space(raw_item, max_chars=max_chars)
        key = item.casefold()
        if item and key not in seen:
            seen.add(key)
            items.append(item)
        if len(items) >= max_items:
            break
    return items


def normalize_watchlist_sources(value: Any) -> frozenset[str]:
    aliases = {"hn": "hackernews", "hacker_news": "hackernews", "twitter": "x"}
    normalized = {
        aliases.get(item.casefold(), item.casefold())
        for item in _json_list(value, max_items=len(WATCHLIST_SOURCES), max_chars=32)
    }
    selected = normalized.intersection(WATCHLIST_SOURCES)
    return frozenset(selected or DEFAULT_WATCHLIST_SOURCES)


def _query_phrase(value: str) -> str:
    """Keep generated searches short, natural, and safe for source APIs."""
    return " ".join(_space(value, max_chars=280).split()[:14])


def _buyer_language(value: str) -> str:
    """Translate dashboard/operator shorthand before it reaches public search."""
    replacements = (
        ("find buyers", "getting enough customers"),
        ("buyer intent", "people who are actively looking for help"),
        ("keyword noise", "irrelevant conversations"),
        ("qualified leads", "people ready to buy"),
        ("generate leads", "getting new customers"),
        ("lead generation", "getting new customers"),
        ("reddit", "public conversations"),
    )
    normalized = _space(value, max_chars=280)
    for source, replacement in replacements:
        normalized = normalized.replace(source, replacement).replace(
            source.title(), replacement
        )
    return _query_phrase(normalized)


def build_watchlist_discovery_queries(
    target_buyer: str,
    problem_to_solve: str,
    include_terms: Iterable[str] = (),
) -> list[DiscoveryQuery]:
    """Build six buyer-language searches without operator or vendor jargon."""
    buyer = _buyer_language(target_buyer)
    problem = _buyer_language(problem_to_solve)
    if not buyer or not problem:
        return []

    # Include terms are evidence anchors, not replacements for buyer intent.
    # The old ``buyer + include term`` shortcut could turn a focused group into
    # an ungrammatical topical search and retrieve generic discussions. Rotate
    # a bounded anchor through the intent templates instead.
    focuses = [problem]
    focuses.extend(
        item
        for item in (_buyer_language(raw_item) for raw_item in include_terms)
        if item
    )

    def focus_for(index: int) -> str:
        return focuses[index % len(focuses)]

    candidates = (
        ("buyer_pain", f"{buyer} struggling with {focus_for(0)}"),
        ("urgent_failure", f"{focus_for(1)} needs fixing today"),
        ("recommendation_request", f"what do {buyer} use for {focus_for(2)}"),
        ("manual_workflow_frustration", f"handling {focus_for(3)} manually takes too much time"),
        ("category_tool_search", f"tool to make {focus_for(4)} easier"),
        ("switching_trigger", f"switching from our current way of handling {focus_for(5)}"),
    )
    queries: list[DiscoveryQuery] = []
    seen_phrases: set[str] = set()
    for query_type, phrase in candidates:
        normalized = _query_phrase(phrase)
        key = normalized.casefold()
        if not normalized or key in seen_phrases:
            continue
        seen_phrases.add(key)
        queries.append(DiscoveryQuery(query_type, normalized))
    return queries


def build_watchlist_profile(base_profile: ServiceProfile, row: dict[str, Any]) -> ServiceProfile:
    """Compose a verifier profile from website evidence plus one Watchlist."""
    target_buyer = _buyer_language(str(row.get("target_buyer") or ""))
    problem = _buyer_language(str(row.get("problem_to_solve") or ""))
    include_terms = _json_list(row.get("include_terms"))
    exclude_terms = _json_list(row.get("exclude_terms"))
    queries = build_watchlist_discovery_queries(target_buyer, problem, include_terms)
    if not target_buyer or not problem or not queries:
        raise ValueError("watchlist target buyer and problem are required")

    return ServiceProfile(
        company_name=base_profile.company_name,
        one_liner=base_profile.one_liner,
        target_audience=[target_buyer],
        core_problem_solved=problem,
        key_value_propositions=base_profile.key_value_propositions,
        ideal_customer_pain_points=[problem, *base_profile.ideal_customer_pain_points],
        use_cases=base_profile.use_cases,
        buying_triggers=[
            *base_profile.buying_triggers,
            "the current approach is no longer working",
            "the problem needs attention now",
        ],
        urgency_signals=base_profile.urgency_signals,
        search_terms=[query.phrase for query in queries],
        negative_keywords=[*base_profile.negative_keywords, *exclude_terms],
    )


def watchlist_embedding_text(profile: ServiceProfile) -> str:
    """A stable, explicit embedding document for one customer-selected group."""
    lines = [
        f"Company: {profile.company_name}",
        f"What it offers: {profile.one_liner}",
        f"Target buyer group: {', '.join(profile.target_audience)}",
        f"Problem they need solved: {profile.core_problem_solved}",
        f"Buyer pains: {', '.join(profile.ideal_customer_pain_points)}",
        f"Buying triggers: {', '.join(profile.buying_triggers)}",
        f"Buyer-language searches: {', '.join(profile.search_terms)}",
    ]
    if profile.negative_keywords:
        lines.append(f"Exclude: {', '.join(profile.negative_keywords)}")
    return normalize_embedding_text("\n".join(line for line in lines if line.strip())[:32_000])


def _load_watchlist_row(
    conn: Any,
    *,
    tenant_id: str,
    watchlist_id: str,
    active_only: bool = False,
) -> dict[str, Any] | None:
    filters = ["tenant_id = :tenant_id", "id = CAST(:watchlist_id AS uuid)"]
    if active_only:
        filters.append("is_active = TRUE")
    row = conn.execute(
        text(
            f"""
            SELECT * FROM public.watchlists
             WHERE {' AND '.join(filters)}
             LIMIT 1
            """
        ),
        {"tenant_id": tenant_id, "watchlist_id": watchlist_id},
    ).mappings().first()
    return dict(row) if row else None


def _load_active_watchlist_rows(conn: Any, *, limit: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        text(
            """
            SELECT * FROM public.watchlists
             WHERE is_active = TRUE
             ORDER BY updated_at DESC NULLS LAST, id
             LIMIT :limit
            """
        ),
        {"limit": limit},
    ).mappings()
    return [dict(row) for row in rows]


def _update_watchlist_status(
    tenant_id: str,
    watchlist_id: str,
    *,
    scan_status: str,
    error: str | None = None,
) -> None:
    try:
        with _database_engine().begin() as conn:
            conn.execute(
                text(
                    """
                    UPDATE public.watchlists
                       SET scan_status = :scan_status,
                           last_scan_at = NOW(),
                           last_scan_error = :last_scan_error,
                           updated_at = NOW()
                     WHERE tenant_id = :tenant_id
                       AND id = CAST(:watchlist_id AS uuid)
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "watchlist_id": watchlist_id,
                    "scan_status": scan_status,
                    "last_scan_error": _space(error, max_chars=1_000) or None,
                },
            )
    except Exception as exc:
        # A status write must not retry a paid source search or hide matched
        # evidence. The worker logs this separately for operators.
        logger.warning(
            "watchlist_status_update_failed tenant_id=%s watchlist_id=%s scan_status=%s error_type=%s",
            tenant_id,
            watchlist_id,
            scan_status,
            exc.__class__.__name__,
        )


def _build_context(
    row: dict[str, Any],
    profile_row: dict[str, Any],
    *,
    embedding_service: EmbeddingService,
) -> WatchlistContext:
    tenant_id = _space(row.get("tenant_id"), max_chars=80)
    watchlist_id = _space(row.get("id"), max_chars=80)
    service_profile_id = _space(row.get("service_profile_id"), max_chars=80)
    if not tenant_id or not watchlist_id or not service_profile_id:
        raise ValueError("watchlist identity is incomplete")
    profile = build_watchlist_profile(_service_profile_from_row(profile_row), row)
    embedding_text = watchlist_embedding_text(profile)
    stored_embedding = _embedding_values(row.get("embedding"))
    if not stored_embedding or _space(row.get("embedding_text"), max_chars=32_000) != embedding_text:
        response = embedding_service.embed_text(
            embedding_text,
            tenant_id=tenant_id,
            service_profile_id=service_profile_id,
            purpose="watchlist_matching",
        )
        stored_embedding = response.embedding
        with _database_engine().begin() as conn:
            conn.execute(
                text(
                    """
                    UPDATE public.watchlists
                       SET matching_brief = CAST(:matching_brief AS jsonb),
                           embedding = CAST(:embedding AS jsonb),
                           embedding_text = :embedding_text,
                           embedding_model = :embedding_model,
                           embedding_status = 'completed',
                           last_scan_error = NULL,
                           updated_at = NOW()
                     WHERE tenant_id = :tenant_id
                       AND id = CAST(:watchlist_id AS uuid)
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "watchlist_id": watchlist_id,
                    "matching_brief": json.dumps(
                        {
                            "version": 1,
                            "target_buyer": profile.target_audience,
                            "problem_to_solve": profile.core_problem_solved,
                            "discovery_queries": [query.to_payload() for query in build_watchlist_discovery_queries(
                                _space(row.get("target_buyer")),
                                _space(row.get("problem_to_solve")),
                                _json_list(row.get("include_terms")),
                            )],
                        }
                    ),
                    "embedding": json.dumps(stored_embedding),
                    "embedding_text": embedding_text,
                    "embedding_model": response.model,
                },
            )
    return WatchlistContext(
        id=watchlist_id,
        tenant_id=tenant_id,
        service_profile_id=service_profile_id,
        profile=profile,
        queries=tuple(
            build_watchlist_discovery_queries(
                _space(row.get("target_buyer")),
                _space(row.get("problem_to_solve")),
                _json_list(row.get("include_terms")),
            )
        ),
        source_preferences=normalize_watchlist_sources(row.get("source_preferences")),
        embedding=stored_embedding,
        embedding_sha256=_embedding_sha256(stored_embedding),
    )


def _contexts_for_rows(rows: Iterable[dict[str, Any]]) -> list[WatchlistContext]:
    contexts: list[WatchlistContext] = []
    embedding_service = EmbeddingService()
    try:
        engine = _database_engine()
        for row in rows:
            tenant_id = _space(row.get("tenant_id"), max_chars=80)
            service_profile_id = _space(row.get("service_profile_id"), max_chars=80)
            if not tenant_id or not service_profile_id:
                continue
            with engine.begin() as conn:
                profile_row = _load_service_profile(
                    conn,
                    tenant_id,
                    service_profile_id,
                    _service_profile_columns(conn),
                )
            if not profile_row:
                continue
            try:
                contexts.append(
                    _build_context(row, profile_row, embedding_service=embedding_service)
                )
            except Exception as exc:
                _update_watchlist_status(
                    tenant_id,
                    _space(row.get("id"), max_chars=80),
                    scan_status="failed",
                    error=f"Could not prepare the matching brief: {exc}",
                )
                logger.exception(
                    "watchlist_context_build_failed tenant_id=%s watchlist_id=%s error_type=%s",
                    tenant_id,
                    row.get("id"),
                    exc.__class__.__name__,
                )
    finally:
        embedding_service.close()
    return contexts


def _source_is_selected(post: SocialPost, context: WatchlistContext) -> bool:
    source = _space(post.source, max_chars=32).casefold()
    if source == "twitter":
        source = "x"
    return source in context.source_preferences


def _cached_watchlist_verification(
    conn: Any,
    *,
    context: WatchlistContext,
    source_post_id: str,
    external_key: str,
    verifier_model: str,
) -> VerificationResult | None:
    row = conn.execute(
        text(
            """
            SELECT metadata, verification
              FROM public.watchlist_matches
             WHERE tenant_id = :tenant_id
               AND watchlist_id = CAST(:watchlist_id AS uuid)
               AND source_post_id = CAST(:source_post_id AS uuid)
             ORDER BY updated_at DESC NULLS LAST
             LIMIT 1
            """
        ),
        {
            "tenant_id": context.tenant_id,
            "watchlist_id": context.id,
            "source_post_id": source_post_id,
        },
    ).mappings().first()
    if not row:
        return None
    metadata = _as_dict(row.get("metadata"))
    if (
        metadata.get("external_key") != external_key
        or metadata.get("profile_embedding_sha256") != context.embedding_sha256
        or metadata.get("verifier_model") != verifier_model
        or metadata.get("verifier_policy_version") != VERIFIER_POLICY_VERSION
    ):
        return None
    try:
        return VerificationResult.model_validate(_as_dict(row.get("verification")))
    except Exception:
        return None


def _persist_watchlist_match(
    conn: Any,
    *,
    context: WatchlistContext,
    source_post_id: str,
    post: SocialPost,
    similarity_score: float,
    verification: VerificationResult,
    verifier_model: str,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    verification_payload = verification.model_dump()
    payload = {
        "tenant_id": context.tenant_id,
        "watchlist_id": context.id,
        "service_profile_id": context.service_profile_id,
        "source_post_id": source_post_id,
        "match_status": _lead_match_status(verification),
        "verifier_score": float(verification.confidence or 0.0),
        "similarity_score": similarity_score,
        "pain_detected": verification.pain_detected,
        "match_reason": verification.why_this_matches,
        "suggested_reply": verification.suggested_reply,
        "verification": json.dumps(verification_payload),
        "source_post": json.dumps(post.to_source_post_json()),
        "metadata": json.dumps(
            {
                **(post.metadata or {}),
                "source": post.source,
                "external_id": post.external_id,
                "external_key": post.dedupe_key,
                "watchlist_id": context.id,
                "profile_embedding_sha256": context.embedding_sha256,
                "verifier_model": verifier_model,
                "verifier_policy_version": VERIFIER_POLICY_VERSION,
            }
        ),
        "matched_at": now,
        "verified_at": now,
        "updated_at": now,
    }
    conn.execute(
        text(
            """
            INSERT INTO public.watchlist_matches (
                tenant_id, watchlist_id, service_profile_id, source_post_id,
                match_status, verifier_score, similarity_score, pain_detected,
                match_reason, suggested_reply, verification, source_post,
                metadata, matched_at, verified_at, updated_at
            ) VALUES (
                :tenant_id, CAST(:watchlist_id AS uuid), CAST(:service_profile_id AS uuid),
                CAST(:source_post_id AS uuid), :match_status, :verifier_score,
                :similarity_score, :pain_detected, :match_reason, :suggested_reply,
                CAST(:verification AS jsonb), CAST(:source_post AS jsonb),
                CAST(:metadata AS jsonb), CAST(:matched_at AS timestamptz),
                CAST(:verified_at AS timestamptz), CAST(:updated_at AS timestamptz)
            )
            ON CONFLICT (tenant_id, watchlist_id, source_post_id)
                WHERE source_post_id IS NOT NULL
            DO UPDATE SET
                match_status = EXCLUDED.match_status,
                verifier_score = EXCLUDED.verifier_score,
                similarity_score = EXCLUDED.similarity_score,
                pain_detected = EXCLUDED.pain_detected,
                match_reason = EXCLUDED.match_reason,
                suggested_reply = EXCLUDED.suggested_reply,
                verification = EXCLUDED.verification,
                source_post = EXCLUDED.source_post,
                metadata = EXCLUDED.metadata,
                matched_at = EXCLUDED.matched_at,
                verified_at = EXCLUDED.verified_at,
                updated_at = EXCLUDED.updated_at
            """
        ),
        payload,
    )


def _match_post_to_contexts(
    *,
    source_post_id: str,
    post: SocialPost,
    post_embedding: list[float],
    contexts: Iterable[WatchlistContext],
) -> dict[str, int]:
    result = {"candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}
    verifier: VerifierService | None = None
    engine = _database_engine()
    try:
        for context in contexts:
            if not _source_is_selected(post, context):
                continue
            candidate = find_candidate_matches(
                context.embedding,
                [
                    PostEmbedding(
                        post_id=source_post_id,
                        text=normalize_embedding_text(post.matching_text[:32_000]),
                        embedding=post_embedding,
                        source=post.source,
                        url=post.url,
                        metadata=_primitive_metadata(
                            {
                                "source_post_id": source_post_id,
                                "external_id": post.external_id,
                                "external_key": post.dedupe_key,
                                "source": post.source,
                                "watchlist_id": context.id,
                            }
                        ),
                    )
                ],
                tenant_id=context.tenant_id,
                service_profile_id=context.service_profile_id,
                max_candidates=1,
            )
            if not candidate:
                continue
            result["candidates"] += 1
            if verifier is None:
                verifier = VerifierService()
            with engine.begin() as conn:
                verification = _cached_watchlist_verification(
                    conn,
                    context=context,
                    source_post_id=source_post_id,
                    external_key=post.dedupe_key,
                    verifier_model=verifier.model,
                )
            if not verification:
                match = candidate[0]
                verification = verifier.verify(
                    CandidatePost(
                        post_id=match.post_id,
                        source=match.source,
                        text=match.text,
                        similarity_score=match.score,
                        url=match.url,
                        metadata=match.metadata,
                    ),
                    context.profile,
                    tenant_id=context.tenant_id,
                    service_profile_id=context.service_profile_id,
                )
            status = _lead_match_status(verification)
            if status == "ready_for_review":
                result["ready_for_review"] += 1
            elif status == "discovery_candidate":
                result["discovery_candidates"] += 1
            with engine.begin() as conn:
                _persist_watchlist_match(
                    conn,
                    context=context,
                    source_post_id=source_post_id,
                    post=post,
                    similarity_score=candidate[0].score,
                    verification=verification,
                    verifier_model=verifier.model,
                )
    finally:
        if verifier is not None:
            verifier.close()
    return result


def process_active_watchlists_for_public_source_post(
    source_post_id: str,
    *,
    source: str | None = None,
) -> dict[str, int]:
    """Match one already-cached global public post to active Watchlists."""
    normalized_id = _space(source_post_id, max_chars=80)
    if not normalized_id:
        raise ValueError("source_post_id is required")
    engine = _database_engine()
    try:
        with engine.begin() as conn:
            rows = _load_public_source_post_rows(conn, normalized_id, source=source)
            watchlists = _load_active_watchlist_rows(
                conn,
                limit=max(1, env_int("ARCLI_WATCHLIST_GLOBAL_MATCH_LIMIT", 100)),
            )
    except Exception as exc:
        # The schema is additive. Existing source matching must continue while
        # an operator rolls this contract out.
        logger.info(
            "watchlist_source_matching_skipped source_post_id=%s error_type=%s",
            normalized_id,
            exc.__class__.__name__,
        )
        return {"posts": 0, "watchlists": 0, "candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}
    if not rows or not watchlists:
        return {"posts": len(rows), "watchlists": len(watchlists), "candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}

    contexts = _contexts_for_rows(watchlists)
    result = {"posts": len(rows), "watchlists": len(contexts), "candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}
    embedding_service = EmbeddingService()
    try:
        for row in rows:
            post = _public_source_post_as_social_post(row)
            database_post_id = _space(row.get("id"), max_chars=80)
            if not post or not database_post_id:
                continue
            with engine.begin() as conn:
                cached_embedding = _cached_public_source_post_embedding(
                    conn,
                    database_post_id=database_post_id,
                    text_sha256=hashlib.sha256(
                        normalize_embedding_text(post.matching_text[:32_000]).encode("utf-8")
                    ).hexdigest(),
                    embedding_model=embedding_service.model,
                )
            if not cached_embedding:
                # The global source actor will have generated this first. Do
                # not perform another public-post embedding here.
                continue
            matched = _match_post_to_contexts(
                source_post_id=database_post_id,
                post=post,
                post_embedding=cached_embedding,
                contexts=contexts,
            )
            for key in ("candidates", "ready_for_review", "discovery_candidates"):
                result[key] += matched[key]
    finally:
        embedding_service.close()
    return result


def rematch_existing_public_source_posts_for_watchlist(
    tenant_id: str,
    watchlist_id: str,
) -> dict[str, int]:
    """Use the bounded global cache before paying for fresh source searches."""
    normalized_tenant_id = _space(tenant_id, max_chars=80)
    normalized_watchlist_id = _space(watchlist_id, max_chars=80)
    if not normalized_tenant_id or not normalized_watchlist_id:
        raise ValueError("tenant_id and watchlist_id are required")
    engine = _database_engine()
    with engine.begin() as conn:
        watchlist = _load_watchlist_row(
            conn,
            tenant_id=normalized_tenant_id,
            watchlist_id=normalized_watchlist_id,
            active_only=True,
        )
        rows = _load_recent_embedded_public_source_post_rows(
            conn,
            limit=max(1, min(500, env_int("ARCLI_WATCHLIST_INITIAL_REMATCH_LIMIT", 100))),
        )
    if not watchlist:
        return {"posts": 0, "embedded": 0, "candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}
    contexts = _contexts_for_rows([watchlist])
    if not contexts:
        return {"posts": len(rows), "embedded": 0, "candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}
    context = contexts[0]
    result = {"posts": len(rows), "embedded": 0, "candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}
    embedding_service = EmbeddingService()
    try:
        for row in rows:
            post = _public_source_post_as_social_post(row)
            database_post_id = _space(row.get("id"), max_chars=80)
            if not post or not database_post_id or not _source_is_selected(post, context):
                continue
            with engine.begin() as conn:
                cached_embedding = _cached_public_source_post_embedding(
                    conn,
                    database_post_id=database_post_id,
                    text_sha256=hashlib.sha256(
                        normalize_embedding_text(post.matching_text[:32_000]).encode("utf-8")
                    ).hexdigest(),
                    embedding_model=embedding_service.model,
                )
            if not cached_embedding:
                continue
            result["embedded"] += 1
            matched = _match_post_to_contexts(
                source_post_id=database_post_id,
                post=post,
                post_embedding=cached_embedding,
                contexts=[context],
            )
            for key in ("candidates", "ready_for_review", "discovery_candidates"):
                result[key] += matched[key]
    finally:
        embedding_service.close()
    return result


def process_watchlist_discovery_job(tenant_id: str, watchlist_id: str) -> dict[str, int]:
    """Prepare a Watchlist, rematch cached posts, then queue source searches."""
    _update_watchlist_status(tenant_id, watchlist_id, scan_status="running")
    try:
        engine = _database_engine()
        with engine.begin() as conn:
            watchlist = _load_watchlist_row(
                conn,
                tenant_id=tenant_id,
                watchlist_id=watchlist_id,
                active_only=True,
            )
        if not watchlist:
            raise ValueError("watchlist not found or inactive")
        contexts = _contexts_for_rows([watchlist])
        if not contexts:
            raise RuntimeError("watchlist matching brief could not be prepared")
        context = contexts[0]
        cached = rematch_existing_public_source_posts_for_watchlist(tenant_id, watchlist_id)
        from api.services.social.activation import enqueue_initial_public_source_ingestion

        plan = enqueue_initial_public_source_ingestion(
            tenant_id,
            context.service_profile_id,
            discovery_queries_override=list(context.queries),
            allowed_sources=context.source_preferences,
        )
        _update_watchlist_status(tenant_id, watchlist_id, scan_status="queued")
        logger.info(
            "watchlist_discovery_queued tenant_id=%s watchlist_id=%s cached_candidates=%s hn_jobs=%s additional_source_jobs=%s x_jobs=%s",
            tenant_id,
            watchlist_id,
            cached["candidates"],
            plan.hn_jobs,
            plan.additional_source_jobs,
            plan.x_jobs,
        )
        return cached
    except Exception as exc:
        _update_watchlist_status(tenant_id, watchlist_id, scan_status="failed", error=str(exc))
        raise


def enqueue_watchlist_discovery_job(tenant_id: str, watchlist_id: str) -> str:
    """Publish a bounded Watchlist scan after the caller has authorized scope."""
    if not tenant_id.strip() or not watchlist_id.strip():
        raise ValueError("tenant_id and watchlist_id are required")
    if not os.environ.get("REDIS_URL", "").strip():
        raise RuntimeError("REDIS_URL is required to enqueue Watchlist discovery jobs.")
    # A double click must not create duplicate source searches. The SQL update
    # is atomic and admits a manual retry only after a short, explicit cooloff.
    cooloff_seconds = max(30, env_int("ARCLI_WATCHLIST_DISCOVERY_COOLOFF_SECONDS", 300))
    with _database_engine().begin() as conn:
        accepted = conn.execute(
            text(
                """
                UPDATE public.watchlists
                   SET scan_status = 'queued',
                       last_scan_at = NOW(),
                       last_scan_error = NULL,
                       updated_at = NOW()
                 WHERE tenant_id = :tenant_id
                   AND id = CAST(:watchlist_id AS uuid)
                   AND is_active = TRUE
                   AND (
                       scan_status NOT IN ('queued', 'running')
                       OR last_scan_at IS NULL
                       OR last_scan_at < NOW() - (:cooloff_seconds * INTERVAL '1 second')
                   )
                RETURNING id
                """
            ),
            {
                "tenant_id": tenant_id,
                "watchlist_id": watchlist_id,
                "cooloff_seconds": cooloff_seconds,
            },
        ).scalar_one_or_none()
    if not accepted:
        raise WatchlistAlreadyQueuedError("Watchlist discovery is already queued.")

    quota = TenantQuotaGuard().check_and_increment(
        tenant_id=tenant_id,
        counter_name="watchlist_discovery",
        limit=max(1, env_int("ARCLI_WATCHLIST_DISCOVERY_TENANT_LIMIT", 12)),
        window_seconds=max(60, env_int("ARCLI_WATCHLIST_DISCOVERY_TENANT_WINDOW_SECONDS", 3600)),
    )
    if not quota.allowed:
        _update_watchlist_status(
            tenant_id,
            watchlist_id,
            scan_status="failed",
            error="Watchlist scan limit reached. Try again later.",
        )
        raise WatchlistRateLimitError("Watchlist scan limit reached.")
    from api.services.ingestion_service import _configure_dramatiq_broker
    from api.workers.actors import process_watchlist_discovery_job_actor

    _configure_dramatiq_broker()
    try:
        message = process_watchlist_discovery_job_actor.send(tenant_id, watchlist_id)
    except Exception as exc:
        _update_watchlist_status(
            tenant_id,
            watchlist_id,
            scan_status="failed",
            error=f"Could not queue Watchlist scan: {exc}",
        )
        raise
    return str(message.message_id)
