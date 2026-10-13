"""Tenant-owned persistence for verified Watchlist matches."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import text

from api.services.embeddings import _as_dict
from api.services.social.legacy_storage import _lead_match_status
from api.services.social.models import SocialPost
from api.services.verifier import VERIFIER_POLICY_VERSION, VerificationResult

if TYPE_CHECKING:
    # Imported for annotations only; the matching module imports this one.
    from api.services.watchlist_matching import WatchlistContext

logger = logging.getLogger(__name__)


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
        verification = VerificationResult.model_validate(
            _as_dict(row.get("verification"))
        )
        # A quota/transport/gate skip is retryable rather than a reusable
        # decision; keep the Watchlist path consistent with lead matches.
        return verification if verification.verifier_executed else None
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
    if not verification.verifier_executed:
        logger.info(
            "watchlist_match_persistence_skipped tenant_id=%s watchlist_id=%s source_post_id=%s skip_reason=%s",
            context.tenant_id,
            context.id,
            source_post_id,
            "verifier_not_executed",
        )
        return

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
