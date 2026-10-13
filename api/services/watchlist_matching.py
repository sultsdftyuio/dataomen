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
from typing import Any, Iterable, Sequence

from sqlalchemy import text

from api.services.cost_controls import TenantQuotaGuard, env_float, env_int
from api.services.embeddings import (
    EmbeddingService,
    _database_engine,
    _load_service_profile,
    _service_profile_columns,
    normalize_embedding_text,
)
from api.services.matching import (
    DEFAULT_SIMILARITY_THRESHOLD,
    PostEmbedding,
    find_candidate_matches,
)
from api.services.social.feedback_calibration import (
    feedback_ranking_boost,
    load_feedback_calibration,
)
from api.services.social.community_monitoring import (
    CommunityTarget,
    community_target_payloads,
    parse_community_targets,
    post_matches_community_targets,
)
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
from api.services.watchlist_storage import (
    _cached_watchlist_verification,
    _persist_watchlist_match,
)
from api.services.verifier import (
    CandidatePost,
    ServiceProfile,
    VerifierService,
    verify_candidate_safely,
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
    community_targets: tuple[CommunityTarget, ...]
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
        competitor_terms=base_profile.competitor_terms,
        negative_keywords=[*base_profile.negative_keywords, *exclude_terms],
    )


def watchlist_embedding_text(
    profile: ServiceProfile,
    *,
    community_targets: Iterable[CommunityTarget] = (),
) -> str:
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
    scoped_places = [target.label for target in community_targets]
    if scoped_places:
        lines.append(f"Community scope: {', '.join(scoped_places)}")
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
    community_targets = parse_community_targets(_json_list(row.get("suggested_places")))
    embedding_text = watchlist_embedding_text(
        profile,
        community_targets=community_targets,
    )
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
                            "community_targets": community_target_payloads(community_targets),
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
        community_targets=community_targets,
        embedding=stored_embedding,
        embedding_sha256=_embedding_sha256(stored_embedding),
    )


def _service_profile_rows_for_watchlists(
    rows: Sequence[dict[str, Any]],
) -> dict[tuple[str, str], dict[str, Any]]:
    """Load each distinct Watchlist profile once, in a single transaction.

    Several Watchlists normally narrow the same website profile, so reading it
    per Watchlist would repeat one query and open a transaction each time.
    """
    profile_keys = [
        key
        for key in dict.fromkeys(
            (
                _space(row.get("tenant_id"), max_chars=80),
                _space(row.get("service_profile_id"), max_chars=80),
            )
            for row in rows
        )
        if key[0] and key[1]
    ]
    if not profile_keys:
        return {}

    profile_rows: dict[tuple[str, str], dict[str, Any]] = {}
    with _database_engine().begin() as conn:
        columns = _service_profile_columns(conn)
        for tenant_id, service_profile_id in profile_keys:
            profile_row = _load_service_profile(
                conn,
                tenant_id,
                service_profile_id,
                columns,
            )
            if profile_row:
                profile_rows[(tenant_id, service_profile_id)] = profile_row
    return profile_rows


def _contexts_for_rows(rows: Iterable[dict[str, Any]]) -> list[WatchlistContext]:
    contexts: list[WatchlistContext] = []
    watchlist_rows = list(rows)
    embedding_service = EmbeddingService()
    try:
        profile_rows = _service_profile_rows_for_watchlists(watchlist_rows)
        for row in watchlist_rows:
            tenant_id = _space(row.get("tenant_id"), max_chars=80)
            service_profile_id = _space(row.get("service_profile_id"), max_chars=80)
            profile_row = profile_rows.get((tenant_id, service_profile_id))
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
    return (
        source in context.source_preferences
        and post_matches_community_targets(post, context.community_targets)
    )


def _match_post_to_contexts(
    *,
    source_post_id: str,
    post: SocialPost,
    post_embedding: list[float],
    contexts: Iterable[WatchlistContext],
    verifier: VerifierService | None = None,
) -> dict[str, int]:
    """Verify one post against each Watchlist it plausibly fits.

    A caller matching several posts passes its own ``verifier`` so the
    provider connection is reused; otherwise one is built here on demand.
    """
    result = {"candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}
    owns_verifier = verifier is None
    engine = _database_engine()
    try:
        for context in contexts:
            if not _source_is_selected(post, context):
                continue
            feedback_calibration = load_feedback_calibration(
                context.tenant_id,
                context.service_profile_id,
                base_threshold=env_float(
                    "ARCLI_MATCHING_SIMILARITY_THRESHOLD",
                    DEFAULT_SIMILARITY_THRESHOLD,
                ),
            )
            candidate_matching_options: dict[str, Any] = {}
            if feedback_calibration is not None:
                candidate_matching_options["ranking_score_adjustment"] = (
                    lambda score: feedback_ranking_boost(score, feedback_calibration)
                )

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
                                "author": post.author,
                                "watchlist_id": context.id,
                            }
                        ),
                    )
                ],
                profile=context.profile,
                tenant_id=context.tenant_id,
                service_profile_id=context.service_profile_id,
                max_candidates=1,
                **candidate_matching_options,
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
                verification = verify_candidate_safely(
                    verifier,
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
            if not verification.verifier_executed:
                logger.info(
                    "watchlist_source_matching_retry_deferred tenant_id=%s watchlist_id=%s source_post_id=%s reason=%s",
                    context.tenant_id,
                    context.id,
                    source_post_id,
                    "verifier_not_executed",
                )
                continue
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
            if status == "ready_for_review":
                try:
                    from api.services.social.verified_comment_scan import (
                        enqueue_verified_thread_comment_scan,
                    )

                    enqueue_verified_thread_comment_scan(
                        post,
                        tenant_id=context.tenant_id,
                        service_profile_id=context.service_profile_id,
                    )
                except Exception as comment_scan_exc:
                    logger.warning(
                        "watchlist_verified_thread_comment_scan_handoff_skipped source=%s source_post_id=%s tenant_id=%s watchlist_id=%s error_type=%s",
                        post.source,
                        post.external_id,
                        context.tenant_id,
                        context.id,
                        comment_scan_exc.__class__.__name__,
                    )
    finally:
        if owns_verifier and verifier is not None:
            verifier.close()
    return result


def _post_text_sha256(post: SocialPost) -> str:
    return hashlib.sha256(
        normalize_embedding_text(post.matching_text[:32_000]).encode("utf-8")
    ).hexdigest()


def process_active_watchlists_for_public_source_posts(
    source_post_refs: Sequence[tuple[str | None, str]],
) -> dict[str, int]:
    """Match already-cached global public posts to active Watchlists.

    The active Watchlists and their matching briefs are the same for every
    post in a batch, so they are read and prepared once for the batch rather
    than once per post.
    """
    result = {"posts": 0, "watchlists": 0, "candidates": 0, "ready_for_review": 0, "discovery_candidates": 0}
    refs = [
        (source, normalized_id)
        for source, source_post_id in source_post_refs
        if (normalized_id := _space(source_post_id, max_chars=80))
    ]
    if not refs:
        return result

    engine = _database_engine()
    rows: list[dict[str, Any]] = []
    try:
        with engine.begin() as conn:
            watchlists = _load_active_watchlist_rows(
                conn,
                limit=max(1, env_int("ARCLI_WATCHLIST_GLOBAL_MATCH_LIMIT", 100)),
            )
            # Most workspaces have no active Watchlist: do not read the posts
            # when there is nothing to match them against.
            if watchlists:
                for source, source_post_id in refs:
                    rows.extend(
                        _load_public_source_post_rows(conn, source_post_id, source=source)
                    )
    except Exception as exc:
        # The schema is additive. Existing source matching must continue while
        # an operator rolls this contract out.
        logger.info(
            "watchlist_source_matching_skipped source_post_count=%s error_type=%s",
            len(refs),
            exc.__class__.__name__,
        )
        return result
    result["posts"] = len(rows)
    result["watchlists"] = len(watchlists)
    if not rows or not watchlists:
        return result

    contexts = _contexts_for_rows(watchlists)
    result["watchlists"] = len(contexts)
    embedding_service = EmbeddingService()
    # Shared across the batch so each post does not open its own connection.
    verifier = VerifierService()
    try:
        for row in rows:
            post = _public_source_post_as_social_post(row)
            database_post_id = _space(row.get("id"), max_chars=80)
            if not post or not database_post_id:
                continue
            cached_embedding = _cached_public_source_post_embedding(
                row,
                text_sha256=_post_text_sha256(post),
                embedding_model=embedding_service.model,
            )
            if not cached_embedding:
                # The global source actor will have generated this first. Do
                # not perform another public-post embedding here.
                continue
            try:
                matched = _match_post_to_contexts(
                    source_post_id=database_post_id,
                    post=post,
                    post_embedding=cached_embedding,
                    contexts=contexts,
                    verifier=verifier,
                )
            except Exception as exc:
                # One post must not discard Watchlist results for the others.
                logger.exception(
                    "watchlist_source_matching_failed source=%s source_post_id=%s error_type=%s error=%s",
                    post.source,
                    post.external_id,
                    exc.__class__.__name__,
                    exc,
                )
                continue
            for key in ("candidates", "ready_for_review", "discovery_candidates"):
                result[key] += matched[key]
    finally:
        try:
            embedding_service.close()
        finally:
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
    return process_active_watchlists_for_public_source_posts([(source, normalized_id)])


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
    verifier = VerifierService()
    try:
        for row in rows:
            post = _public_source_post_as_social_post(row)
            database_post_id = _space(row.get("id"), max_chars=80)
            if not post or not database_post_id or not _source_is_selected(post, context):
                continue
            cached_embedding = _cached_public_source_post_embedding(
                row,
                text_sha256=_post_text_sha256(post),
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
                verifier=verifier,
            )
            for key in ("candidates", "ready_for_review", "discovery_candidates"):
                result[key] += matched[key]
    finally:
        try:
            embedding_service.close()
        finally:
            verifier.close()
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
            community_targets=community_target_payloads(context.community_targets),
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
