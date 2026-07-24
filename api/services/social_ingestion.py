import asyncio
import logging
import math
import os
import re
import json
import hashlib
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, TypeVar
from urllib.parse import quote

from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.services.cost_controls import env_float, env_int
from api.services.client_lifecycle import managed_network_client
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
from api.services.integrations.hn_connector import SourcePost
from api.services.integrations.x_connector import TwitterSourcePost
from api.services.matching import PostEmbedding, find_candidate_matches
from api.services.verifier import (
    CandidatePost,
    ServiceProfile,
    VerificationResult,
    VerifierService,
)

logger = logging.getLogger(__name__)

# Compatibility-only test override.  Production code never assigns a client
# here: each ingestion task creates and closes its own client below.
_public_source_supabase_client: Any | None = None

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
SOURCE_POST_EMBEDDING_CACHE_KEY = "matching_embedding_cache"


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


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _embedding_sha256(embedding: list[float]) -> str:
    payload = json.dumps(
        [round(float(item), 8) for item in embedding],
        separators=(",", ":"),
    )
    return _sha256_text(payload)


def _cached_source_post_embedding(
    conn: Connection,
    *,
    tenant_id: str,
    source_post_id: str | None,
    text_sha256: str,
    embedding_model: str,
) -> list[float] | None:
    if not source_post_id:
        return None

    columns = _table_columns(conn, "source_posts")
    if "metadata" not in columns:
        return None

    cache = conn.execute(
        text(
            f"""
            SELECT metadata->:cache_key
              FROM public.source_posts
             WHERE tenant_id = :tenant_id
               AND id = CAST(:source_post_id AS uuid)
             LIMIT 1
            """
        ),
        {
            "tenant_id": tenant_id,
            "source_post_id": source_post_id,
            "cache_key": SOURCE_POST_EMBEDDING_CACHE_KEY,
        },
    ).scalar_one_or_none()
    cache_payload = _as_dict(cache)
    if (
        cache_payload.get("model") != embedding_model
        or cache_payload.get("text_sha256") != text_sha256
    ):
        return None

    return _embedding_values(cache_payload.get("embedding"))


def _persist_source_post_embedding_cache(
    conn: Connection,
    *,
    tenant_id: str,
    source_post_id: str | None,
    text_sha256: str,
    embedding_model: str,
    embedding: list[float],
) -> None:
    if not source_post_id:
        return

    columns = _table_columns(conn, "source_posts")
    metadata_column = columns.get("metadata")
    if not metadata_column:
        return

    metadata_expression = (
        """
        (
            COALESCE(metadata::jsonb, '{}'::jsonb)
            || jsonb_build_object(
                :cache_key,
                jsonb_build_object(
                    'model', :embedding_model,
                    'text_sha256', :text_sha256,
                    'embedding', CAST(:embedding AS jsonb),
                    'dimensions', :dimensions,
                    'cached_at', CAST(:cached_at AS timestamptz)
                )
            )
        )
        """
    )
    if metadata_column["data_type"] == "json" or metadata_column["udt_name"] == "json":
        metadata_expression = f"({metadata_expression})::json"

    conn.execute(
        text(
            f"""
            UPDATE public.source_posts
               SET metadata = {metadata_expression},
                   updated_at = CAST(:cached_at AS timestamptz)
             WHERE tenant_id = :tenant_id
               AND id = CAST(:source_post_id AS uuid)
            """
        ),
        {
            "tenant_id": tenant_id,
            "source_post_id": source_post_id,
            "cache_key": SOURCE_POST_EMBEDDING_CACHE_KEY,
            "embedding_model": embedding_model,
            "text_sha256": text_sha256,
            "embedding": json.dumps(embedding, separators=(",", ":")),
            "dimensions": len(embedding),
            "cached_at": datetime.now(timezone.utc).isoformat(),
        },
    )


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


def _fetch_reddit_posts(
    profile: ServiceProfile,
    *,
    tenant_id: str,
    service_profile_id: str | None,
) -> list[SocialPost]:
    import httpx

    # Reddit's unauthenticated JSON search is commonly blocked in production.
    # Keep the source opt-in rather than spending an entire job on requests
    # that can never yield posts.
    if os.getenv("ARCLI_REDDIT_INGESTION_ENABLED", "false").strip().lower() in {
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
                except httpx.HTTPStatusError as exc:
                    status_code = exc.response.status_code
                    logger.info(
                        "reddit_search_skipped tenant_id=%s service_profile_id=%s term=%s subreddit=%s error_type=%s error=%s",
                        tenant_id,
                        service_profile_id,
                        term,
                        subreddit or "global",
                        exc.__class__.__name__,
                        exc,
                    )
                    # Authorization and policy blocks apply to every search
                    # target, so continuing only produces duplicate failures.
                    if status_code in {401, 403}:
                        return posts
                    continue
                except Exception as exc:
                    logger.info(
                        "reddit_search_skipped tenant_id=%s service_profile_id=%s term=%s subreddit=%s error_type=%s error=%s",
                        tenant_id,
                        service_profile_id,
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


def _fetch_x_posts(
    profile: ServiceProfile,
    *,
    tenant_id: str,
    service_profile_id: str | None,
) -> list[SocialPost]:
    import httpx

    bearer_token = (
        os.getenv("X_BEARER_TOKEN")
        or os.getenv("TWITTER_BEARER_TOKEN")
        or os.getenv("ARCLI_X_BEARER_TOKEN")
        or ""
    ).strip()
    if os.getenv("ARCLI_X_INGESTION_ENABLED", "true").strip().lower() in {
        "0",
        "false",
        "no",
    }:
        return []
    if not bearer_token:
        logger.info(
            "x_search_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            tenant_id,
            service_profile_id,
            "bearer_token_not_configured",
        )
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
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code
                logger.info(
                    "x_search_skipped tenant_id=%s service_profile_id=%s term=%s error_type=%s error=%s",
                    tenant_id,
                    service_profile_id,
                    term,
                    exc.__class__.__name__,
                    exc,
                )
                # A missing subscription or invalid credential applies to all
                # terms in this run.  Avoid burning through the remaining
                # requests and flooding logs with the same provider error.
                if status_code in {401, 402, 403}:
                    return posts
                continue
            except Exception as exc:
                logger.info(
                    "x_search_skipped tenant_id=%s service_profile_id=%s term=%s error_type=%s error=%s",
                    tenant_id,
                    service_profile_id,
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
        if "created_at" in columns:
            payload["created_at"] = now

        expressions, params = _bind_payload(payload, columns)
        assignment_parts = [
            f"{column_name} = EXCLUDED.{column_name}"
            for column_name in expressions
            if column_name not in {"id", "tenant_id", "source", "external_id", "created_at"}
        ]
        conflict_sql = (
            f"DO UPDATE SET {', '.join(assignment_parts)}"
            if assignment_parts
            else "DO UPDATE SET external_id = public.source_posts.external_id"
        )

        result = conn.execute(
            text(
                f"""
                INSERT INTO public.source_posts ({", ".join(expressions)})
                VALUES ({", ".join(expressions.values())})
                ON CONFLICT (tenant_id, source, external_id)
                {conflict_sql}
                 WHERE public.source_posts.tenant_id = EXCLUDED.tenant_id
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
    service_profile_id: str | None,
    source_post_id: str | None,
    external_key: str,
    columns: dict[str, dict[str, str]],
) -> str | None:
    if source_post_id and "source_post_id" in columns:
        profile_filter = ""
        params: dict[str, Any] = {
            "tenant_id": tenant_id,
            "source_post_id": source_post_id,
        }
        if service_profile_id and "service_profile_id" in columns:
            profile_filter = " AND service_profile_id = CAST(:service_profile_id AS uuid)"
            params["service_profile_id"] = service_profile_id
        return conn.execute(
            text(
                f"""
                SELECT id
                  FROM public.lead_matches
                 WHERE tenant_id = :tenant_id
                   AND source_post_id = CAST(:source_post_id AS uuid)
                   {profile_filter}
                 LIMIT 1
                """
            ),
            params,
        ).scalar_one_or_none()

    if "metadata" in columns:
        profile_filter = ""
        params = {"tenant_id": tenant_id, "external_key": external_key}
        if service_profile_id and "service_profile_id" in columns:
            profile_filter = " AND service_profile_id = CAST(:service_profile_id AS uuid)"
            params["service_profile_id"] = service_profile_id
        return conn.execute(
            text(
                f"""
                SELECT id
                  FROM public.lead_matches
                 WHERE tenant_id = :tenant_id
                   AND metadata->>'external_key' = :external_key
                   {profile_filter}
                 LIMIT 1
                """
            ),
            params,
        ).scalar_one_or_none()

    return None


def _cached_lead_verification(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str | None,
    source_post_id: str | None,
    external_key: str,
    profile_embedding_sha256: str,
    verifier_model: str,
    columns: dict[str, dict[str, str]],
) -> VerificationResult | None:
    if not {"tenant_id", "metadata"}.issubset(columns):
        return None

    verification_columns = [
        column_name
        for column_name in ("verification", "verifier_result")
        if column_name in columns
    ]
    if not verification_columns:
        return None

    select_parts = ["metadata"]
    select_parts.extend(verification_columns)
    where_parts = ["tenant_id = :tenant_id"]
    params: dict[str, Any] = {
        "tenant_id": tenant_id,
        "external_key": external_key,
    }

    if source_post_id and "source_post_id" in columns:
        where_parts.append("source_post_id = CAST(:source_post_id AS uuid)")
        params["source_post_id"] = source_post_id
    else:
        where_parts.append("metadata->>'external_key' = :external_key")

    if service_profile_id and "service_profile_id" in columns:
        where_parts.append("service_profile_id = CAST(:service_profile_id AS uuid)")
        params["service_profile_id"] = service_profile_id

    row = conn.execute(
        text(
            f"""
            SELECT {", ".join(select_parts)}
              FROM public.lead_matches
             WHERE {" AND ".join(where_parts)}
             ORDER BY updated_at DESC NULLS LAST
             LIMIT 1
            """
        ),
        params,
    ).mappings().first()
    if not row:
        return None

    metadata = _as_dict(row.get("metadata"))
    if (
        metadata.get("profile_embedding_sha256") != profile_embedding_sha256
        or metadata.get("verifier_model") != verifier_model
    ):
        return None

    for column_name in verification_columns:
        payload = _as_dict(row.get(column_name))
        if not payload:
            continue
        try:
            return VerificationResult.model_validate(payload)
        except Exception as exc:
            logger.info(
                "lead_verification_cache_ignored tenant_id=%s service_profile_id=%s source_post_id=%s external_key=%s reason=%s error_type=%s error=%s",
                tenant_id,
                service_profile_id,
                source_post_id,
                external_key,
                "invalid_cached_payload",
                exc.__class__.__name__,
                exc,
            )
            return None

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
    profile_embedding_sha256: str,
    verifier_model: str,
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
    # An LLM-verifier pass makes a lead ready for human review. Only the
    # dashboard's explicit human action promotes it to `qualified` and emits a
    # CRM webhook.
    match_status = (
        "ready_for_review" if is_match and verifier_score >= threshold else "rejected"
    )
    verification_payload = verification.model_dump()
    source_post_json = post.to_source_post_json()
    metadata = {
        **(post.metadata or {}),
        "source": post.source,
        "external_id": post.external_id,
        "external_key": post.dedupe_key,
        "service_profile_id": service_profile_id,
        "profile_embedding_sha256": profile_embedding_sha256,
        "verifier_model": verifier_model,
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
        "suggested_reply": getattr(verification, "suggested_reply", ""),
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
        service_profile_id=service_profile_id,
        source_post_id=source_post_id,
        external_key=post.dedupe_key,
        columns=columns,
    )
    expressions, params = _bind_payload(payload, columns)

    if (
        service_profile_id
        and source_post_id
        and {"tenant_id", "service_profile_id", "source_post_id"}.issubset(columns)
    ):
        assignment_parts = [
            (
                "match_status = CASE "
                "WHEN public.lead_matches.match_status = 'qualified' "
                "THEN 'qualified' ELSE EXCLUDED.match_status END"
                if column_name == "match_status"
                else f"{column_name} = EXCLUDED.{column_name}"
            )
            for column_name in expressions
            if column_name
            not in {"id", "tenant_id", "service_profile_id", "source_post_id", "created_at"}
        ]
        conflict_sql = (
            f"DO UPDATE SET {', '.join(assignment_parts)}"
            if assignment_parts
            else "DO NOTHING"
        )
        where_sql = (
            """
             WHERE public.lead_matches.tenant_id = EXCLUDED.tenant_id
               AND public.lead_matches.service_profile_id = EXCLUDED.service_profile_id
               AND public.lead_matches.source_post_id = EXCLUDED.source_post_id
            """
            if assignment_parts
            else ""
        )
        conn.execute(
            text(
                f"""
                INSERT INTO public.lead_matches ({", ".join(expressions)})
                VALUES ({", ".join(expressions.values())})
                ON CONFLICT (tenant_id, service_profile_id, source_post_id)
                {conflict_sql}
                {where_sql}
                """
            ),
            params,
        )
        return

    if existing_id:
        assignment_parts = [
            (
                "match_status = CASE "
                "WHEN public.lead_matches.match_status = 'qualified' "
                "THEN 'qualified' ELSE :match_status END"
                if column_name == "match_status"
                else f"{column_name} = {expression}"
            )
            for column_name, expression in expressions.items()
            if column_name not in {"id", "tenant_id", "source_post_id", "created_at"}
        ]
        params["lead_match_id"] = existing_id
        params["tenant_id"] = tenant_id
        conn.execute(
            text(
                f"""
                UPDATE public.lead_matches
                   SET {", ".join(assignment_parts)}
                 WHERE id = :lead_match_id
                   AND tenant_id = :tenant_id
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
            *_fetch_reddit_posts(
                service_profile,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
            ),
            *_fetch_x_posts(
                service_profile,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
            ),
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
    embedding_model = embedding_service.model
    profile_embedding_sha256 = _embedding_sha256(profile_embedding)
    post_embeddings: list[PostEmbedding] = []
    posts_by_match_id: dict[str, SocialPost] = {}
    for post in posts:
        source_post_id = source_post_ids.get(post.dedupe_key)
        match_post_id = source_post_id or post.dedupe_key
        embedding_text = post.matching_text[:32_000]
        text_sha256 = _sha256_text(embedding_text)
        cached_embedding: list[float] | None = None
        if source_post_id:
            with engine.begin() as conn:
                cached_embedding = _cached_source_post_embedding(
                    conn,
                    tenant_id=tenant_id,
                    source_post_id=source_post_id,
                    text_sha256=text_sha256,
                    embedding_model=embedding_model,
                )

        if cached_embedding:
            embedding_values = cached_embedding
            logger.info(
                "social_post_embedding_cache_hit tenant_id=%s service_profile_id=%s source_post_id=%s source=%s external_id=%s model=%s dimensions=%s",
                tenant_id,
                resolved_profile_id,
                source_post_id,
                post.source,
                post.external_id,
                embedding_model,
                len(embedding_values),
            )
        else:
            try:
                embedding = embedding_service.embed_text(
                    embedding_text,
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

            embedding_values = embedding.embedding
            with engine.begin() as conn:
                _persist_source_post_embedding_cache(
                    conn,
                    tenant_id=tenant_id,
                    source_post_id=source_post_id,
                    text_sha256=text_sha256,
                    embedding_model=embedding.model,
                    embedding=embedding_values,
                )

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
                embedding=embedding_values,
                source=post.source,
                url=post.url,
                metadata=metadata,
            )
        )
        posts_by_match_id[match_post_id] = post

    embedding_service.close()

    candidates = find_candidate_matches(
        profile_embedding,
        post_embeddings,
        tenant_id=tenant_id,
        service_profile_id=resolved_profile_id,
    )

    verifier = VerifierService()
    verifier_model = verifier.model
    qualified_count = 0
    with engine.begin() as conn:
        lead_match_columns = _table_columns(conn, "lead_matches")

    for candidate in candidates:
        post = posts_by_match_id.get(candidate.post_id)
        if not post:
            continue

        source_post_id_value = candidate.metadata.get("source_post_id")
        source_post_id = str(source_post_id_value) if source_post_id_value else None
        with engine.begin() as conn:
            verification = _cached_lead_verification(
                conn,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
                source_post_id=source_post_id,
                external_key=post.dedupe_key,
                profile_embedding_sha256=profile_embedding_sha256,
                verifier_model=verifier_model,
                columns=lead_match_columns,
            )

        if verification:
            logger.info(
                "lead_verification_cache_hit tenant_id=%s service_profile_id=%s source_post_id=%s source=%s external_id=%s verifier_model=%s",
                tenant_id,
                resolved_profile_id,
                source_post_id,
                post.source,
                post.external_id,
                verifier_model,
            )
        else:
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

        with engine.begin() as conn:
            _persist_lead_match(
                conn,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
                source_post_id=source_post_id,
                post=post,
                similarity_score=candidate.score,
                verification=verification,
                profile_embedding_sha256=profile_embedding_sha256,
                verifier_model=verifier_model,
            )

    verifier.close()

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


# ---------------------------------------------------------------------------
# Globally scoped source ingestion (Hacker News and X)
# ---------------------------------------------------------------------------
# These paths intentionally do not reuse ``_persist_source_posts`` above.  That
# function belongs to the older tenant-scoped prospecting flow and requires a
# tenant_id.  Public corpus records are attached to a tenant only during
# matching.


@dataclass(frozen=True)
class HnIngestionResult:
    query: str
    since_timestamp: int
    hits_found: int
    inserted_count: int
    inserted_source_post_ids: list[str]


def _hn_batch_size() -> int:
    return max(1, min(1_000, env_int("ARCLI_HN_INSERT_BATCH_SIZE", 100)))


def _create_public_source_supabase_client() -> Any:
    """Create the service-role client used for one globally scoped ingest."""
    from supabase import create_client
    from supabase.client import ClientOptions

    supabase_url = (
        os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    ).strip()
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
    ).strip()
    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase credentials are required for public source ingestion.")

    return create_client(
        supabase_url,
        supabase_key,
        options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
            postgrest_client_timeout=15,
            storage_client_timeout=15,
        ),
    )


@contextmanager
def _public_source_supabase_client_context() -> Iterator[Any]:
    """Scope Supabase transports to a single HN or X persistence operation."""
    if _public_source_supabase_client is not None:
        # Unit tests may inject a no-network fake.  Never close an object this
        # module does not own.
        yield _public_source_supabase_client
        return

    with managed_network_client(_create_public_source_supabase_client) as client:
        yield client


_BatchItem = TypeVar("_BatchItem")


def _iter_batches(
    items: list[_BatchItem],
    batch_size: int,
) -> Iterator[list[_BatchItem]]:
    """Yield bounded chunks without materializing a second full collection."""
    for offset in range(0, len(items), batch_size):
        yield items[offset : offset + batch_size]


def _source_post_payload(post: SourcePost | TwitterSourcePost) -> dict[str, Any]:
    """Use the SourcePost contract as the sole database payload contract."""
    return post.model_dump(mode="json")


def _response_source_post_ids(response: Any) -> list[str]:
    rows = getattr(response, "data", None)
    if not isinstance(rows, list):
        return []
    return [
        str(row["source_post_id"])
        for row in rows
        if isinstance(row, dict) and row.get("source_post_id")
    ]


def _persist_new_public_source_posts(
    posts: list[SourcePost] | list[TwitterSourcePost],
    *,
    batch_size: int,
) -> list[str]:
    """Insert only new public source rows and return the inserted source IDs."""
    inserted_source_post_ids: list[str] = []
    with _public_source_supabase_client_context() as client:
        for batch in _iter_batches(posts, batch_size):
            response = (
                client.table("source_posts")
                .upsert(
                    [_source_post_payload(post) for post in batch],
                    on_conflict="source,source_post_id",
                    ignore_duplicates=True,
                )
                .execute()
            )
            inserted_source_post_ids.extend(_response_source_post_ids(response))

    # A returned row from ON CONFLICT DO NOTHING is necessarily a fresh insert.
    return list(dict.fromkeys(inserted_source_post_ids))


def ingest_hn_posts(query: str, since_hours_ago: int) -> HnIngestionResult:
    """Fetch public HN content, then insert only new rows in bounded batches.

    ``ignore_duplicates=True`` maps to ``ON CONFLICT DO NOTHING`` in PostgREST.
    Together with the required ``(source, source_post_id)`` unique constraint it
    makes repeated workers and retry delivery safe without a tenant-specific key.
    """
    if not query or not query.strip():
        raise ValueError("query is required")
    if since_hours_ago < 0:
        raise ValueError("since_hours_ago must be non-negative")

    from api.services.integrations.hn_connector import HackerNewsConnector

    since_timestamp = int(
        (datetime.now(timezone.utc) - timedelta(hours=since_hours_ago)).timestamp()
    )
    connector = HackerNewsConnector()
    posts = asyncio.run(
        connector.fetch_recent_posts(query.strip(), since_timestamp=since_timestamp)
    )
    if not posts:
        result = HnIngestionResult(
            query=query.strip(),
            since_timestamp=since_timestamp,
            hits_found=0,
            inserted_count=0,
            inserted_source_post_ids=[],
        )
        logger.info(
            "hn_ingestion_completed query=%s hits_found=%s new_inserts=%s",
            result.query,
            result.hits_found,
            result.inserted_count,
        )
        return result

    inserted_source_post_ids = _persist_new_public_source_posts(
        posts,
        batch_size=_hn_batch_size(),
    )
    result = HnIngestionResult(
        query=query.strip(),
        since_timestamp=since_timestamp,
        hits_found=len(posts),
        inserted_count=len(inserted_source_post_ids),
        inserted_source_post_ids=inserted_source_post_ids,
    )
    logger.info(
        "hn_ingestion_completed query=%s hits_found=%s new_inserts=%s",
        result.query,
        result.hits_found,
        result.inserted_count,
    )
    return result


def trigger_embedding_jobs(source_post_ids: list[str]) -> int:
    """Hand newly persisted public rows to the embedding queue.

    This import is intentionally lazy to avoid a service/actor import cycle
    while allowing the consumer to remain independently scalable.
    """
    if not source_post_ids:
        return 0

    # Configure the broker before importing the actor registry.  Dramatiq
    # binds an actor to the broker that exists at decoration time.
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        raise RuntimeError("REDIS_URL is required to enqueue embedding jobs.")

    import dramatiq

    from api.broker import configure_redis_broker

    current_broker = dramatiq.get_broker()
    if getattr(current_broker, "_arcli_redis_url", None) != redis_url:
        configure_redis_broker(redis_url)

    from api.workers.actors import enqueue_source_post_embedding_jobs

    return enqueue_source_post_embedding_jobs(source_post_ids)


@dataclass(frozen=True)
class XIngestionResult:
    query: str
    since_timestamp: int
    hits_found: int
    inserted_count: int
    inserted_source_post_ids: list[str]


def _x_batch_size() -> int:
    return max(1, min(1_000, env_int("ARCLI_X_INSERT_BATCH_SIZE", 100)))


def ingest_x_posts(query: str, since_hours_ago: int) -> XIngestionResult:
    """Fetch global X posts and conflict-ignore them in bounded Supabase batches."""
    if not query or not query.strip():
        raise ValueError("query is required")
    if since_hours_ago < 0:
        raise ValueError("since_hours_ago must be non-negative")

    from api.services.integrations.x_connector import XConnector

    since_timestamp = int(
        (datetime.now(timezone.utc) - timedelta(hours=since_hours_ago)).timestamp()
    )
    posts = asyncio.run(
        XConnector().fetch_recent_posts(query.strip(), since_timestamp=since_timestamp)
    )
    if not posts:
        result = XIngestionResult(
            query=query.strip(),
            since_timestamp=since_timestamp,
            hits_found=0,
            inserted_count=0,
            inserted_source_post_ids=[],
        )
        logger.info(
            "x_ingestion_completed query=%s hits_found=%s new_inserts=%s",
            result.query,
            result.hits_found,
            result.inserted_count,
        )
        return result

    inserted_source_post_ids = _persist_new_public_source_posts(
        posts,
        batch_size=_x_batch_size(),
    )
    result = XIngestionResult(
        query=query.strip(),
        since_timestamp=since_timestamp,
        hits_found=len(posts),
        inserted_count=len(inserted_source_post_ids),
        inserted_source_post_ids=inserted_source_post_ids,
    )
    logger.info(
        "x_ingestion_completed query=%s hits_found=%s new_inserts=%s",
        result.query,
        result.hits_found,
        result.inserted_count,
    )
    return result


# ---------------------------------------------------------------------------
# Public-source embedding and tenant matching
# ---------------------------------------------------------------------------


def _load_public_source_post_rows(
    conn: Connection,
    source_post_id: str,
) -> list[dict[str, Any]]:
    """Load every global row for an external ID without crossing tenant rows."""
    columns = _table_columns(conn, "source_posts")
    required_columns = {"id", "source", "source_post_id"}
    if not required_columns.issubset(columns):
        logger.warning(
            "public_source_post_embedding_skipped source_post_id=%s skip_reason=%s",
            source_post_id,
            "source_post_contract_missing",
        )
        return []

    select_columns = [
        column_name
        for column_name in (
            "id",
            "source",
            "source_post_id",
            "title",
            "body",
            "text",
            "author_handle",
            "author",
            "url",
            "posted_at",
            "published_at",
            "metadata",
            "embedding_status",
        )
        if column_name in columns
    ]
    where_parts = ["source_post_id = :source_post_id"]
    if "tenant_id" in columns:
        where_parts.append("tenant_id IS NULL")

    rows = conn.execute(
        text(
            f"""
            SELECT {", ".join(select_columns)}
              FROM public.source_posts
             WHERE {" AND ".join(where_parts)}
             ORDER BY id
            """
        ),
        {"source_post_id": source_post_id},
    ).mappings()
    return [dict(row) for row in rows]


def _public_source_post_as_social_post(row: dict[str, Any]) -> SocialPost | None:
    source = _string_value(row.get("source"))
    external_id = _string_value(row.get("source_post_id"))
    title = _string_value(row.get("title")) or ""
    body = _string_value(row.get("body")) or _string_value(row.get("text")) or ""
    if not source or not external_id or not body.strip():
        return None

    metadata = _as_dict(row.get("metadata"))
    return SocialPost(
        source=source,
        external_id=external_id,
        title=title,
        text=body,
        author=(
            _string_value(row.get("author_handle"))
            or _string_value(row.get("author"))
        ),
        url=_string_value(row.get("url")),
        published_at=(
            _string_value(row.get("posted_at"))
            or _string_value(row.get("published_at"))
        ),
        metadata=metadata,
    )


def _cached_public_source_post_embedding(
    conn: Connection,
    *,
    database_post_id: str,
    text_sha256: str,
    embedding_model: str,
) -> list[float] | None:
    columns = _table_columns(conn, "source_posts")
    if "metadata" not in columns:
        return None

    cache = conn.execute(
        text(
            """
            SELECT metadata->:cache_key
              FROM public.source_posts
             WHERE id = CAST(:database_post_id AS uuid)
               AND tenant_id IS NULL
             LIMIT 1
            """
        ),
        {
            "database_post_id": database_post_id,
            "cache_key": SOURCE_POST_EMBEDDING_CACHE_KEY,
        },
    ).scalar_one_or_none()
    cache_payload = _as_dict(cache)
    if (
        cache_payload.get("model") != embedding_model
        or cache_payload.get("text_sha256") != text_sha256
    ):
        return None
    return _embedding_values(cache_payload.get("embedding"))


def _persist_public_source_post_embedding_cache(
    conn: Connection,
    *,
    database_post_id: str,
    text_sha256: str,
    embedding_model: str,
    embedding: list[float],
) -> None:
    columns = _table_columns(conn, "source_posts")
    metadata_column = columns.get("metadata")
    if not metadata_column:
        return

    metadata_expression = """
        (
            COALESCE(metadata::jsonb, '{}'::jsonb)
            || jsonb_build_object(
                :cache_key,
                jsonb_build_object(
                    'model', :embedding_model,
                    'text_sha256', :text_sha256,
                    'embedding', CAST(:embedding AS jsonb),
                    'dimensions', :dimensions,
                    'cached_at', CAST(:cached_at AS timestamptz)
                )
            )
        )
    """
    if metadata_column["data_type"] == "json" or metadata_column["udt_name"] == "json":
        metadata_expression = f"({metadata_expression})::json"

    assignments = [f"metadata = {metadata_expression}"]
    if "embedding_status" in columns:
        assignments.append("embedding_status = 'completed'")
    if "updated_at" in columns:
        assignments.append("updated_at = CAST(:cached_at AS timestamptz)")

    conn.execute(
        text(
            f"""
            UPDATE public.source_posts
               SET {", ".join(assignments)}
             WHERE id = CAST(:database_post_id AS uuid)
               AND tenant_id IS NULL
            """
        ),
        {
            "database_post_id": database_post_id,
            "cache_key": SOURCE_POST_EMBEDDING_CACHE_KEY,
            "embedding_model": embedding_model,
            "text_sha256": text_sha256,
            "embedding": json.dumps(embedding, separators=(",", ":")),
            "dimensions": len(embedding),
            "cached_at": datetime.now(timezone.utc).isoformat(),
        },
    )


def _mark_public_source_post_embedding_failed(
    conn: Connection,
    *,
    database_post_id: str,
) -> None:
    columns = _table_columns(conn, "source_posts")
    if "embedding_status" not in columns:
        return

    assignments = ["embedding_status = 'failed'"]
    params: dict[str, Any] = {"database_post_id": database_post_id}
    if "updated_at" in columns:
        assignments.append("updated_at = CAST(:updated_at AS timestamptz)")
        params["updated_at"] = datetime.now(timezone.utc).isoformat()

    conn.execute(
        text(
            f"""
            UPDATE public.source_posts
               SET {", ".join(assignments)}
             WHERE id = CAST(:database_post_id AS uuid)
               AND tenant_id IS NULL
            """
        ),
        params,
    )


def _public_matching_profile_rows(conn: Connection) -> list[dict[str, Any]]:
    """Return profiles with a tenant binding; public data is never tenant-owned."""
    columns = _service_profile_columns(conn)
    if not {"id", "tenant_id"}.issubset(columns):
        return []

    select_columns = list(columns)
    order_column = "updated_at" if "updated_at" in columns else "id"
    profile_limit = max(1, env_int("ARCLI_PUBLIC_SOURCE_PROFILE_LIMIT", 250))
    rows = conn.execute(
        text(
            f"""
            SELECT {", ".join(select_columns)}
              FROM public.service_profiles
             WHERE tenant_id IS NOT NULL
             ORDER BY {order_column} DESC NULLS LAST
             LIMIT :profile_limit
            """
        ),
        {"profile_limit": profile_limit},
    ).mappings()
    return [dict(row) for row in rows]


def process_public_source_post_embedding(source_post_id: str) -> dict[str, int]:
    """Embed one global post and create tenant-scoped verified lead matches.

    The source row remains global.  Only a positive profile match creates a
    ``lead_matches`` row carrying that profile's tenant ID.
    """
    normalized_source_post_id = source_post_id.strip()
    if not normalized_source_post_id:
        raise ValueError("source_post_id is required")

    engine = _database_engine()
    with engine.begin() as conn:
        source_rows = _load_public_source_post_rows(conn, normalized_source_post_id)
        profile_rows = _public_matching_profile_rows(conn)
        lead_match_columns = _table_columns(conn, "lead_matches")

    if not source_rows:
        logger.info(
            "public_source_post_embedding_skipped source_post_id=%s skip_reason=%s",
            normalized_source_post_id,
            "global_source_post_not_found",
        )
        return {"posts": 0, "embedded": 0, "candidates": 0, "ready_for_review": 0}

    embedding_service = EmbeddingService()
    verifier: VerifierService | None = None
    embedded_count = 0
    candidate_count = 0
    ready_for_review_count = 0
    try:
        verifier = VerifierService()
        for source_row in source_rows:
            database_post_id = str(source_row["id"])
            post = _public_source_post_as_social_post(source_row)
            if not post:
                logger.info(
                    "public_source_post_embedding_skipped source_post_id=%s database_post_id=%s skip_reason=%s",
                    normalized_source_post_id,
                    database_post_id,
                    "empty_source_content",
                )
                continue

            embedding_text = post.matching_text[:32_000]
            text_sha256 = _sha256_text(embedding_text)
            with engine.begin() as conn:
                embedding_values = _cached_public_source_post_embedding(
                    conn,
                    database_post_id=database_post_id,
                    text_sha256=text_sha256,
                    embedding_model=embedding_service.model,
                )

            if embedding_values:
                logger.info(
                    "public_source_post_embedding_cache_hit source_post_id=%s database_post_id=%s source=%s model=%s dimensions=%s",
                    post.external_id,
                    database_post_id,
                    post.source,
                    embedding_service.model,
                    len(embedding_values),
                )
            else:
                try:
                    embedding = embedding_service.embed_text(
                        embedding_text,
                        source_post_id=database_post_id,
                        purpose="public_source_matching",
                    )
                except Exception:
                    with engine.begin() as conn:
                        _mark_public_source_post_embedding_failed(
                            conn,
                            database_post_id=database_post_id,
                        )
                    raise

                embedding_values = embedding.embedding
                with engine.begin() as conn:
                    _persist_public_source_post_embedding_cache(
                        conn,
                        database_post_id=database_post_id,
                        text_sha256=text_sha256,
                        embedding_model=embedding.model,
                        embedding=embedding_values,
                    )
            embedded_count += 1

            for profile_row in profile_rows:
                tenant_id = _string_value(profile_row.get("tenant_id"))
                service_profile_id = _string_value(profile_row.get("id"))
                profile_embedding = _profile_embedding_from_row(profile_row)
                if not tenant_id or not profile_embedding:
                    continue

                try:
                    service_profile = _service_profile_from_row(profile_row)
                except Exception as exc:
                    logger.info(
                        "public_source_profile_match_skipped tenant_id=%s service_profile_id=%s source_post_id=%s skip_reason=%s error_type=%s",
                        tenant_id,
                        service_profile_id,
                        database_post_id,
                        "invalid_service_profile",
                        exc.__class__.__name__,
                    )
                    continue

                post_embedding = PostEmbedding(
                    post_id=database_post_id,
                    text=embedding_text,
                    embedding=embedding_values,
                    source=post.source,
                    url=post.url,
                    metadata=_primitive_metadata(
                        {
                            "source_post_id": database_post_id,
                            "external_id": post.external_id,
                            "external_key": post.dedupe_key,
                            "source": post.source,
                        }
                    ),
                )
                candidates = find_candidate_matches(
                    profile_embedding,
                    [post_embedding],
                    tenant_id=tenant_id,
                    service_profile_id=service_profile_id,
                    max_candidates=1,
                )
                if not candidates:
                    continue

                candidate = candidates[0]
                candidate_count += 1
                profile_embedding_sha256 = _embedding_sha256(profile_embedding)
                with engine.begin() as conn:
                    verification = _cached_lead_verification(
                        conn,
                        tenant_id=tenant_id,
                        service_profile_id=service_profile_id,
                        source_post_id=database_post_id,
                        external_key=post.dedupe_key,
                        profile_embedding_sha256=profile_embedding_sha256,
                        verifier_model=verifier.model,
                        columns=lead_match_columns,
                    )

                if not verification:
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
                        service_profile_id=service_profile_id,
                    )

                if verification.match and verification.confidence >= env_float(
                    "LEAD_VERIFIER_SCORE_THRESHOLD",
                    DEFAULT_VERIFIER_QUALIFIED_THRESHOLD,
                ):
                    ready_for_review_count += 1

                with engine.begin() as conn:
                    _persist_lead_match(
                        conn,
                        tenant_id=tenant_id,
                        service_profile_id=service_profile_id,
                        source_post_id=database_post_id,
                        post=post,
                        similarity_score=candidate.score,
                        verification=verification,
                        profile_embedding_sha256=profile_embedding_sha256,
                        verifier_model=verifier.model,
                    )
    finally:
        embedding_service.close()
        if verifier is not None:
            verifier.close()

    logger.info(
        "public_source_post_matching_completed source_post_id=%s posts=%s embedded=%s profiles=%s candidates=%s ready_for_review=%s",
        normalized_source_post_id,
        len(source_rows),
        embedded_count,
        len(profile_rows),
        candidate_count,
        ready_for_review_count,
    )
    return {
        "posts": len(source_rows),
        "embedded": embedded_count,
        "candidates": candidate_count,
        "ready_for_review": ready_for_review_count,
    }
