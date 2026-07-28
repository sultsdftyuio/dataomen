"""Legacy Fetch for social-source ingestion."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import re
import json
import hashlib
from uuid import uuid4
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Sequence, TypeVar
from urllib.parse import quote

from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.services.cost_controls import TenantQuotaGuard, env_float, env_int
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
from api.services.integrations.public_source import PublicSourcePost
from api.services.integrations.x_connector import TwitterSourcePost
from api.services.matching import PostEmbedding, find_candidate_matches
from api.services.verifier import (
    CandidatePost,
    ServiceProfile,
    VerificationResult,
    VerifierService,
)




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

# Cross-module helper imports for static analysis and direct module use.
from .models import (
    DEFAULT_MAX_POSTS,
    DEFAULT_POSTS_PER_QUERY,
    DEFAULT_REDDIT_SUBREDDITS,
    SocialPost,
    _csv_env,
    _normalize_space,
    logger,
)
from .queries import _query_terms
