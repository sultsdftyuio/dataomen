import logging
import math
import os
import re
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.services.cost_controls import env_float, env_int
from api.services.embeddings import (
    EmbeddingService,
    _as_dict,
    _bind_payload,
    _database_engine,
    _first_document,
    _load_service_profile,
    _service_profile_columns,
    _string_list,
    _string_value,
)
from api.services.matching import PostEmbedding, find_candidate_matches
from api.services.verifier import CandidatePost, ServiceProfile, VerifierService

logger = logging.getLogger(__name__)

DEFAULT_REDDIT_SUBREDDITS = (
    "SaaS",
    "startups",
    "Entrepreneur",
    "smallbusiness",
    "marketing",
    "sales",
    "CustomerSuccess",
    "B2B",
)
DEFAULT_MAX_QUERIES = 8
DEFAULT_POSTS_PER_QUERY = 15
DEFAULT_MAX_POSTS = 80
DEFAULT_VERIFIER_QUALIFIED_THRESHOLD = 0.7


@dataclass(frozen=True)
class SocialPost:
    source: str
    external_id: str
    title: str
    text: str
    author: str | None = None
    community: str | None = None
    url: str | None = None
    published_at: str | None = None
    metadata: dict[str, Any] | None = None

    @property
    def dedupe_key(self) -> str:
        return f"{self.source}:{self.external_id}"

    @property
    def matching_text(self) -> str:
        return "\n\n".join(part for part in (self.title, self.text) if part).strip()

    def to_source_post_json(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "external_id": self.external_id,
            "title": self.title,
            "text": self.text,
            "author": self.author,
            "community": self.community,
            "url": self.url,
            "published_at": self.published_at,
            "metadata": self.metadata or {},
        }


def _csv_env(name: str, default: tuple[str, ...] = ()) -> list[str]:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return list(default)

    return [item.strip() for item in raw_value.split(",") if item.strip()]


def _normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _read_string(sources: list[dict[str, Any]], keys: list[str]) -> str | None:
    for source in sources:
        for key in keys:
            value = _string_value(source.get(key))
            if value:
                return value
    return None


def _read_list(sources: list[dict[str, Any]], keys: list[str]) -> list[str]:
    for source in sources:
        for key in keys:
            value = _string_list(source.get(key))
            if value:
                return value
    return []


def _service_profile_from_row(row: dict[str, Any]) -> ServiceProfile:
    document = _first_document(row)
    sources = [document, row]

    company_name = _read_string(sources, ["company_name", "name"]) or "Workspace"
    one_liner = (
        _read_string(
            sources,
            ["one_liner", "unique_value_prop", "unique_value_proposition"],
        )
        or "B2B service"
    )
    target_audience = _read_list(sources, ["target_audience", "audience"]) or [
        "B2B buyers"
    ]
    core_problem = (
        _read_string(sources, ["core_problem_solved", "core_problem"]) or one_liner
    )
    value_props = _read_list(
        sources,
        ["key_value_propositions", "value_propositions"],
    )
    if not value_props:
        value_props = [one_liner]

    pain_points = _read_list(
        sources,
        ["ideal_customer_pain_points", "pain_points"],
    )
    if not pain_points:
        pain_points = [core_problem]

    return ServiceProfile(
        company_name=company_name,
        one_liner=one_liner,
        target_audience=target_audience,
        core_problem_solved=core_problem,
        key_value_propositions=value_props,
        ideal_customer_pain_points=pain_points,
        negative_keywords=_read_list(sources, ["negative_keywords", "excluded_audiences"]),
    )


def _embedding_values(value: Any) -> list[float] | None:
    if isinstance(value, list):
        values = [float(item) for item in value if isinstance(item, (int, float))]
        return values if values else None

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        if stripped.startswith("[") and stripped.endswith("]"):
            try:
                values = [
                    float(item)
                    for item in stripped.strip("[]").split(",")
                    if item.strip()
                ]
            except ValueError:
                return None
            return values if values else None

    return None


def _profile_embedding_from_row(row: dict[str, Any]) -> list[float] | None:
    for key in ("profile_embedding", "embedding"):
        embedding = _embedding_values(row.get(key))
        if embedding:
            return embedding

    documents = [
        _as_dict(row.get("embedding_json")),
        _first_document(row),
        _as_dict(row.get("profile_json")),
        _as_dict(row.get("profile")),
        _as_dict(row.get("data")),
    ]
    for document in documents:
        embedding = _embedding_values(document.get("profile_embedding"))
        if embedding:
            return embedding

    return None


def _query_terms(profile: ServiceProfile) -> list[str]:
    candidates = [
        *profile.ideal_customer_pain_points,
        profile.core_problem_solved,
        *profile.key_value_propositions,
        *profile.target_audience,
    ]
    terms: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = _normalize_space(candidate)
        if len(normalized) < 4:
            continue

        words = normalized.split()
        if len(words) > 8:
            normalized = " ".join(words[:8])

        key = normalized.lower()
        if key not in seen:
            seen.add(key)
            terms.append(normalized)

    return terms[: env_int("ARCLI_SOCIAL_MAX_QUERIES", DEFAULT_MAX_QUERIES)]


def _http_user_agent() -> str:
    return os.getenv(
        "ARCLI_SOCIAL_USER_AGENT",
        "arcli-prospect-intelligence/0.1",
    )


def _iso_from_epoch(value: Any) -> str | None:
    if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        return None
    return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()


def _fetch_reddit_posts(profile: ServiceProfile) -> list[SocialPost]:
    if os.getenv("ARCLI_REDDIT_INGESTION_ENABLED", "true").strip().lower() in {
        "0",
        "false",
        "no",
    }:
        return []

    subreddits = _csv_env("ARCLI_REDDIT_SUBREDDITS", DEFAULT_REDDIT_SUBREDDITS)
    include_global = os.getenv(
        "ARCLI_REDDIT_INCLUDE_GLOBAL_SEARCH",
        "true",
    ).strip().lower() not in {"0", "false", "no"}
    posts_per_query = env_int("ARCLI_SOCIAL_POSTS_PER_QUERY", DEFAULT_POSTS_PER_QUERY)
    headers = {
        "Accept": "application/json",
        "User-Agent": _http_user_agent(),
    }
    posts: list[SocialPost] = []

    with httpx.Client(headers=headers, timeout=15.0, follow_redirects=True) as client:
        for term in _query_terms(profile):
            targets: list[str | None] = [None] if include_global else []
            targets.extend(subreddits)

            for subreddit in targets:
                params = {
                    "q": term,
                    "sort": "new",
                    "t": os.getenv("ARCLI_REDDIT_SEARCH_WINDOW", "month"),
                    "limit": str(posts_per_query),
                    "type": "link",
                }
                if subreddit:
                    params["restrict_sr"] = "1"
                    url = f"https://www.reddit.com/r/{quote(subreddit)}/search.json"
                else:
                    url = "https://www.reddit.com/search.json"

                try:
                    response = client.get(url, params=params)
                    response.raise_for_status()
                    payload = response.json()
                except Exception as exc:
                    logger.info(
                        "reddit_search_skipped term=%s subreddit=%s error_type=%s error=%s",
                        term,
                        subreddit or "global",
                        exc.__class__.__name__,
                        exc,
                    )
                    continue

                children = _as_dict(payload.get("data")).get("children", [])
                if not isinstance(children, list):
                    continue

                for child in children:
                    data = _as_dict(_as_dict(child).get("data"))
                    if not data:
                        continue

                    post_id = _string_value(data.get("id"))
                    title = _string_value(data.get("title")) or ""
                    body = _string_value(data.get("selftext")) or ""
                    if not post_id or not (title or body):
                        continue

                    permalink = _string_value(data.get("permalink"))
                    posts.append(
                        SocialPost(
                            source="reddit",
                            external_id=post_id,
                            title=title,
                            text=body or title,
                            author=_string_value(data.get("author")),
                            community=_string_value(data.get("subreddit")),
                            url=f"https://www.reddit.com{permalink}"
                            if permalink
                            else _string_value(data.get("url")),
                            published_at=_iso_from_epoch(data.get("created_utc")),
                            metadata={
                                "query": term,
                                "score": data.get("score"),
                                "num_comments": data.get("num_comments"),
                                "subreddit": data.get("subreddit"),
                            },
                        )
                    )

    return posts


def _x_query(term: str, profile: ServiceProfile) -> str:
    negatives = [
        _normalize_space(item)
        for item in profile.negative_keywords
        if _normalize_space(item)
    ][:6]
    negative_clause = " ".join(f"-{item.replace(' ', '')}" for item in negatives)
    query = f'"{term}" lang:en -is:retweet {negative_clause}'.strip()
    return query[:512]


def _fetch_x_posts(profile: ServiceProfile) -> list[SocialPost]:
    bearer_token = (
        os.getenv("X_BEARER_TOKEN")
        or os.getenv("TWITTER_BEARER_TOKEN")
        or os.getenv("ARCLI_X_BEARER_TOKEN")
        or ""
    ).strip()
    if not bearer_token:
        logger.info("x_search_skipped skip_reason=%s", "bearer_token_not_configured")
        return []

    posts_per_query = max(
        10,
        min(100, env_int("ARCLI_SOCIAL_POSTS_PER_QUERY", DEFAULT_POSTS_PER_QUERY)),
    )
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "User-Agent": _http_user_agent(),
    }
    posts: list[SocialPost] = []

    with httpx.Client(headers=headers, timeout=20.0) as client:
        for term in _query_terms(profile):
            params = {
                "query": _x_query(term, profile),
                "max_results": str(posts_per_query),
                "tweet.fields": "created_at,author_id,public_metrics,lang,conversation_id",
                "expansions": "author_id",
                "user.fields": "username,name",
            }
            try:
                response = client.get(
                    "https://api.x.com/2/tweets/search/recent",
                    params=params,
                )
                response.raise_for_status()
                payload = response.json()
            except Exception as exc:
                logger.info(
                    "x_search_skipped term=%s error_type=%s error=%s",
                    term,
                    exc.__class__.__name__,
                    exc,
                )
                continue

            users = {
                str(user.get("id")): user
                for user in _as_dict(payload.get("includes")).get("users", [])
                if isinstance(user, dict)
            }
            data = payload.get("data", [])
            if not isinstance(data, list):
                continue

            for tweet in data:
                row = _as_dict(tweet)
                if not row:
                    continue

                tweet_id = _string_value(row.get("id"))
                text_value = _string_value(row.get("text")) or ""
                if not tweet_id or not text_value:
                    continue

                author_id = _string_value(row.get("author_id"))
                author = _as_dict(users.get(author_id or ""))
                username = _string_value(author.get("username")) if author else None
                posts.append(
                    SocialPost(
                        source="twitter",
                        external_id=tweet_id,
                        title=text_value[:120],
                        text=text_value,
                        author=username or author_id,
                        community=None,
                        url=f"https://x.com/{username}/status/{tweet_id}"
                        if username
                        else f"https://x.com/i/web/status/{tweet_id}",
                        published_at=_string_value(row.get("created_at")),
                        metadata={
                            "query": term,
                            "author_id": author_id,
                            "conversation_id": row.get("conversation_id"),
                            "public_metrics": row.get("public_metrics"),
                            "lang": row.get("lang"),
                        },
                    )
                )

    return posts


def _dedupe_posts(posts: list[SocialPost]) -> list[SocialPost]:
    max_posts = env_int("ARCLI_SOCIAL_MAX_POSTS", DEFAULT_MAX_POSTS)
    seen: set[str] = set()
    deduped: list[SocialPost] = []
    for post in posts:
        if post.dedupe_key in seen:
            continue
        if len(post.matching_text) < env_int("ARCLI_MATCHING_MIN_POST_CHARS", 20):
            continue
        seen.add(post.dedupe_key)
        deduped.append(post)
        if len(deduped) >= max_posts:
            break
    return deduped


def _primitive_metadata(metadata: dict[str, Any]) -> dict[str, str | int | float | bool]:
    sanitized: dict[str, str | int | float | bool] = {}
    for key, value in metadata.items():
        if value is None:
            continue
        if isinstance(value, (str, int, float, bool)):
            sanitized[key] = value
            continue
        try:
            sanitized[key] = json.dumps(value, sort_keys=True)
        except TypeError:
            sanitized[key] = str(value)

    return sanitized


def _table_columns(
    conn: Connection,
    table_name: str,
) -> dict[str, dict[str, str]]:
    rows = conn.execute(
        text(
            """
            SELECT column_name, data_type, udt_name
              FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).mappings()

    return {
        str(row["column_name"]): {
            "data_type": str(row["data_type"]),
            "udt_name": str(row["udt_name"]),
        }
        for row in rows
    }


def _persist_source_posts(
    conn: Connection,
    tenant_id: str,
    posts: list[SocialPost],
) -> dict[str, str]:
    columns = _table_columns(conn, "source_posts")
    if not {"id", "tenant_id", "source", "external_id"}.issubset(columns):
        logger.info("source_post_persistence_skipped skip_reason=%s", "table_missing")
        return {}

    now = datetime.now(timezone.utc).isoformat()
    ids: dict[str, str] = {}
    for post in posts:
        existing_id = conn.execute(
            text(
                """
                SELECT id
                  FROM public.source_posts
                 WHERE tenant_id = :tenant_id
                   AND source = :source
                   AND external_id = :external_id
                 LIMIT 1
                """
            ),
            {
                "tenant_id": tenant_id,
                "source": post.source,
                "external_id": post.external_id,
            },
        ).scalar_one_or_none()

        payload: dict[str, Any] = {
            "tenant_id": tenant_id,
            "source": post.source,
            "external_id": post.external_id,
            "title": post.title,
            "text": post.text,
            "author": post.author,
            "community": post.community,
            "url": post.url,
            "published_at": post.published_at,
            "metadata": post.metadata or {},
            "updated_at": now,
        }
        if not existing_id and "created_at" in columns:
            payload["created_at"] = now

        expressions, params = _bind_payload(payload, columns)
        if existing_id:
            assignment_parts = [
                f"{column_name} = {expression}"
                for column_name, expression in expressions.items()
                if column_name not in {"id", "tenant_id", "source", "external_id", "created_at"}
            ]
            if assignment_parts:
                params["source_post_id"] = existing_id
                conn.execute(
                    text(
                        f"""
                        UPDATE public.source_posts
                           SET {", ".join(assignment_parts)}
                         WHERE id = :source_post_id
                        """
                    ),
                    params,
                )
            ids[post.dedupe_key] = str(existing_id)
            continue

        result = conn.execute(
            text(
                f"""
                INSERT INTO public.source_posts ({", ".join(expressions)})
                VALUES ({", ".join(expressions.values())})
                RETURNING id
                """
            ),
            params,
        )
        inserted_id = result.scalar_one_or_none()
        if inserted_id:
            ids[post.dedupe_key] = str(inserted_id)

    return ids


def _existing_lead_match_id(
    conn: Connection,
    *,
    tenant_id: str,
    source_post_id: str | None,
    external_key: str,
    columns: dict[str, dict[str, str]],
) -> str | None:
    if source_post_id and "source_post_id" in columns:
        return conn.execute(
            text(
                """
                SELECT id
                  FROM public.lead_matches
                 WHERE tenant_id = :tenant_id
                   AND source_post_id = CAST(:source_post_id AS uuid)
                 LIMIT 1
                """
            ),
            {"tenant_id": tenant_id, "source_post_id": source_post_id},
        ).scalar_one_or_none()

    if "metadata" in columns:
        return conn.execute(
            text(
                """
                SELECT id
                  FROM public.lead_matches
                 WHERE tenant_id = :tenant_id
                   AND metadata->>'external_key' = :external_key
                 LIMIT 1
                """
            ),
            {"tenant_id": tenant_id, "external_key": external_key},
        ).scalar_one_or_none()

    return None


def _persist_lead_match(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str | None,
    source_post_id: str | None,
    post: SocialPost,
    similarity_score: float,
    verification: Any,
) -> None:
    columns = _table_columns(conn, "lead_matches")
    if not {"tenant_id", "match_status"}.issubset(columns):
        logger.info("lead_match_persistence_skipped skip_reason=%s", "table_missing")
        return

    now = datetime.now(timezone.utc).isoformat()
    verifier_score = float(getattr(verification, "confidence", 0.0) or 0.0)
    is_match = bool(getattr(verification, "match", False))
    threshold = env_float(
        "LEAD_VERIFIER_SCORE_THRESHOLD",
        DEFAULT_VERIFIER_QUALIFIED_THRESHOLD,
    )
    match_status = "qualified" if is_match and verifier_score >= threshold else "rejected"
    verification_payload = verification.model_dump()
    source_post_json = post.to_source_post_json()
    metadata = {
        **(post.metadata or {}),
        "source": post.source,
        "external_id": post.external_id,
        "external_key": post.dedupe_key,
        "service_profile_id": service_profile_id,
    }

    payload: dict[str, Any] = {
        "tenant_id": tenant_id,
        "service_profile_id": service_profile_id,
        "source_post_id": source_post_id,
        "match_status": match_status,
        "verifier_score": verifier_score,
        "similarity_score": similarity_score,
        "embedding_score": similarity_score,
        "match_score": similarity_score,
        "pain_detected": getattr(verification, "pain_detected", ""),
        "match_reason": getattr(verification, "why_this_matches", ""),
        "verification": verification_payload,
        "verifier_result": verification_payload,
        "source_post": source_post_json,
        "source_post_data": source_post_json,
        "source_post_json": source_post_json,
        "post": source_post_json,
        "metadata": metadata,
        "matched_at": now,
        "verified_at": now,
        "updated_at": now,
    }
    if "created_at" in columns:
        payload["created_at"] = now

    existing_id = _existing_lead_match_id(
        conn,
        tenant_id=tenant_id,
        source_post_id=source_post_id,
        external_key=post.dedupe_key,
        columns=columns,
    )
    expressions, params = _bind_payload(payload, columns)

    if existing_id:
        assignment_parts = [
            f"{column_name} = {expression}"
            for column_name, expression in expressions.items()
            if column_name not in {"id", "tenant_id", "source_post_id", "created_at"}
        ]
        params["lead_match_id"] = existing_id
        conn.execute(
            text(
                f"""
                UPDATE public.lead_matches
                   SET {", ".join(assignment_parts)}
                 WHERE id = :lead_match_id
                """
            ),
            params,
        )
        return

    conn.execute(
        text(
            f"""
            INSERT INTO public.lead_matches ({", ".join(expressions)})
            VALUES ({", ".join(expressions.values())})
            """
        ),
        params,
    )


def run_initial_public_ingestion(
    tenant_id: str,
    service_profile_id: str | None = None,
) -> dict[str, int]:
    engine = _database_engine()
    with engine.begin() as conn:
        profile_columns = _service_profile_columns(conn)
        profile_row = _load_service_profile(
            conn,
            tenant_id,
            service_profile_id,
            profile_columns,
        )

    if not profile_row:
        logger.warning(
            "social_ingestion_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            tenant_id,
            service_profile_id,
            "service_profile_not_found",
        )
        return {"posts": 0, "embedded": 0, "candidates": 0, "qualified": 0}

    profile_embedding = _profile_embedding_from_row(profile_row)
    if not profile_embedding:
        logger.warning(
            "social_ingestion_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            tenant_id,
            service_profile_id,
            "service_profile_embedding_missing",
        )
        return {"posts": 0, "embedded": 0, "candidates": 0, "qualified": 0}

    resolved_profile_id = (
        str(profile_row.get("id")) if profile_row.get("id") else service_profile_id
    )
    service_profile = _service_profile_from_row(profile_row)
    posts = _dedupe_posts(
        [
            *_fetch_reddit_posts(service_profile),
            *_fetch_x_posts(service_profile),
        ]
    )

    if not posts:
        logger.info(
            "social_ingestion_completed tenant_id=%s service_profile_id=%s posts=%s embedded=%s candidates=%s qualified=%s",
            tenant_id,
            resolved_profile_id,
            0,
            0,
            0,
            0,
        )
        return {"posts": 0, "embedded": 0, "candidates": 0, "qualified": 0}

    with engine.begin() as conn:
        source_post_ids = _persist_source_posts(conn, tenant_id, posts)

    embedding_service = EmbeddingService()
    post_embeddings: list[PostEmbedding] = []
    posts_by_match_id: dict[str, SocialPost] = {}
    for post in posts:
        source_post_id = source_post_ids.get(post.dedupe_key)
        match_post_id = source_post_id or post.dedupe_key
        try:
            embedding = embedding_service.embed_text(
                post.matching_text[:32_000],
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
                source_post_id=match_post_id,
                purpose="public_social_post_matching",
            )
        except Exception as exc:
            logger.info(
                "social_post_embedding_skipped tenant_id=%s service_profile_id=%s source=%s external_id=%s error_type=%s error=%s",
                tenant_id,
                resolved_profile_id,
                post.source,
                post.external_id,
                exc.__class__.__name__,
                exc,
            )
            continue

        metadata = _primitive_metadata(
            {
                **(post.metadata or {}),
                "source_post_id": source_post_id,
                "external_key": post.dedupe_key,
                "external_id": post.external_id,
                "tenant_id": tenant_id,
                "service_profile_id": resolved_profile_id,
            }
        )
        post_embeddings.append(
            PostEmbedding(
                post_id=match_post_id,
                text=post.matching_text,
                embedding=embedding.embedding,
                source=post.source,
                url=post.url,
                metadata=metadata,
            )
        )
        posts_by_match_id[match_post_id] = post

    candidates = find_candidate_matches(
        profile_embedding,
        post_embeddings,
        tenant_id=tenant_id,
        service_profile_id=resolved_profile_id,
    )

    verifier = VerifierService()
    qualified_count = 0
    with engine.begin() as conn:
        for candidate in candidates:
            post = posts_by_match_id.get(candidate.post_id)
            if not post:
                continue

            verification = verifier.verify(
                CandidatePost(
                    post_id=candidate.post_id,
                    source=candidate.source,
                    text=candidate.text,
                    similarity_score=candidate.score,
                    url=candidate.url,
                    metadata=candidate.metadata,
                ),
                service_profile,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
            )
            if verification.match and verification.confidence >= env_float(
                "LEAD_VERIFIER_SCORE_THRESHOLD",
                DEFAULT_VERIFIER_QUALIFIED_THRESHOLD,
            ):
                qualified_count += 1

            source_post_id_value = candidate.metadata.get("source_post_id")
            source_post_id = (
                str(source_post_id_value) if source_post_id_value else None
            )
            _persist_lead_match(
                conn,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
                source_post_id=source_post_id,
                post=post,
                similarity_score=candidate.score,
                verification=verification,
            )

    logger.info(
        "social_ingestion_completed tenant_id=%s service_profile_id=%s posts=%s embedded=%s candidates=%s qualified=%s",
        tenant_id,
        resolved_profile_id,
        len(posts),
        len(post_embeddings),
        len(candidates),
        qualified_count,
    )
    return {
        "posts": len(posts),
        "embedded": len(post_embeddings),
        "candidates": len(candidates),
        "qualified": qualified_count,
    }
