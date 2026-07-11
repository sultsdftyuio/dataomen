import asyncio
import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

logger = logging.getLogger(__name__)

SERVICE_PROFILE_COLUMNS = {
    "tenant_id",
    "website_url",
    "url",
    "status",
    "review_status",
    "extraction_status",
    "extracted_at",
    "profile_json",
    "profile",
    "data",
    "target_audience",
    "core_problem",
    "unique_value_prop",
    "use_cases",
    "pain_points",
    "buying_triggers",
    "negative_keywords",
    "excluded_audiences",
    "created_at",
    "updated_at",
}


def _configure_dramatiq_broker() -> None:
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return

    current_broker = dramatiq.get_broker()
    if isinstance(current_broker, RedisBroker):
        return

    dramatiq.set_broker(RedisBroker(url=redis_url))
    logger.info(
        "dramatiq_redis_broker_configured broker=%s redis_url_configured=%s",
        "redis",
        True,
    )


def _require_redis_broker() -> None:
    if not os.getenv("REDIS_URL", "").strip():
        raise RuntimeError("REDIS_URL is required to enqueue crawl jobs.")

    _configure_dramatiq_broker()


def _normalize_database_url(raw_url: str) -> str:
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql://", 1)
    return raw_url


@lru_cache(maxsize=1)
def _database_engine() -> Engine:
    database_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("SUPABASE_DB_URL")
        or os.getenv("POSTGRES_URL")
        or ""
    ).strip()

    if not database_url:
        raise RuntimeError("DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL is required.")

    return create_engine(_normalize_database_url(database_url), pool_pre_ping=True)


def _crawl_job_id(tenant_id: str, website_url: str) -> str:
    digest = hashlib.sha256(f"{tenant_id}:{website_url}".encode("utf-8")).hexdigest()
    return digest[:24]


def _jsonable_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    items: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        normalized = re.sub(r"\s+", " ", item.strip())
        key = normalized.lower()
        if normalized and key not in seen:
            seen.add(key)
            items.append(normalized)

    return items


def _string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _profile_document(profile: dict[str, Any], website_url: str) -> dict[str, Any]:
    target_audience = _jsonable_list(profile.get("target_audience"))
    pain_points = _jsonable_list(profile.get("ideal_customer_pain_points"))
    negative_keywords = _jsonable_list(profile.get("negative_keywords"))
    key_value_propositions = _jsonable_list(profile.get("key_value_propositions"))
    core_problem = _string_value(profile.get("core_problem_solved"))
    one_liner = _string_value(profile.get("one_liner"))

    now = datetime.now(timezone.utc).isoformat()

    return {
        "company_name": _string_value(profile.get("company_name")),
        "one_liner": one_liner,
        "target_audience": target_audience,
        "core_problem_solved": core_problem,
        "core_problem": core_problem,
        "key_value_propositions": key_value_propositions,
        "unique_value_prop": one_liner,
        "ideal_customer_pain_points": pain_points,
        "pain_points": pain_points,
        "use_cases": [],
        "buying_triggers": [],
        "negative_keywords": negative_keywords,
        "excluded_audiences": [],
        "website_url": website_url,
        "status": "pending_review",
        "review_status": "pending_review",
        "extraction_status": "completed",
        "extracted_at": now,
    }


def _service_profile_payload(profile: dict[str, Any], website_url: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    document = _profile_document(profile, website_url)

    return {
        "website_url": website_url,
        "url": website_url,
        "status": "pending_review",
        "review_status": "pending_review",
        "extraction_status": "completed",
        "extracted_at": now,
        "profile_json": document,
        "profile": document,
        "data": document,
        "target_audience": document["target_audience"],
        "core_problem": document["core_problem"],
        "unique_value_prop": document["unique_value_prop"],
        "use_cases": document["use_cases"],
        "pain_points": document["pain_points"],
        "buying_triggers": document["buying_triggers"],
        "negative_keywords": document["negative_keywords"],
        "excluded_audiences": document["excluded_audiences"],
        "updated_at": now,
    }


def _service_profile_columns(conn: Connection) -> dict[str, dict[str, str]]:
    rows = conn.execute(
        text(
            """
            SELECT column_name, data_type, udt_name
              FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'service_profiles'
            """
        )
    ).mappings()

    return {
        str(row["column_name"]): {
            "data_type": str(row["data_type"]),
            "udt_name": str(row["udt_name"]),
        }
        for row in rows
        if str(row["column_name"]) in SERVICE_PROFILE_COLUMNS or row["column_name"] == "id"
    }


def _is_json_column(column: dict[str, str]) -> bool:
    return column["data_type"] in {"json", "jsonb"} or column["udt_name"] in {
        "json",
        "jsonb",
    }


def _value_expression(param_name: str, column: dict[str, str]) -> str:
    if column["data_type"] == "json" or column["udt_name"] == "json":
        return f"CAST(:{param_name} AS json)"
    if column["data_type"] == "jsonb" or column["udt_name"] == "jsonb":
        return f"CAST(:{param_name} AS jsonb)"
    return f":{param_name}"


def _coerce_value(value: Any, column: dict[str, str]) -> Any:
    if _is_json_column(column):
        return json.dumps(value)

    if isinstance(value, list) and column["data_type"] != "ARRAY":
        return "\n".join(value)

    if isinstance(value, dict):
        return json.dumps(value)

    return value


def _bind_payload(
    payload: dict[str, Any],
    columns: dict[str, dict[str, str]],
) -> tuple[dict[str, str], dict[str, Any]]:
    expressions: dict[str, str] = {}
    params: dict[str, Any] = {}

    for column_name, value in payload.items():
        column = columns.get(column_name)
        if not column:
            continue

        param_name = f"p_{column_name}"
        expressions[column_name] = _value_expression(param_name, column)
        params[param_name] = _coerce_value(value, column)

    return expressions, params


def _current_website_url(conn: Connection, tenant_id: str) -> str | None:
    return conn.execute(
        text(
            """
            SELECT website_url
              FROM public.tenant_settings
             WHERE tenant_id = :tenant_id
             LIMIT 1
            """
        ),
        {"tenant_id": tenant_id},
    ).scalar_one_or_none()


def _normalized_equals(left: str | None, right: str) -> bool:
    if not left:
        return False

    try:
        return WebsiteCrawler._normalize_url(left) == right
    except ValueError:
        return left.strip() == right


def _load_existing_service_profile(
    conn: Connection,
    tenant_id: str,
    columns: dict[str, dict[str, str]],
) -> dict[str, Any] | None:
    select_columns = ["tenant_id"]
    if "id" in columns:
        select_columns.insert(0, "id")

    order_columns = [
        column_name
        for column_name in ("updated_at", "created_at")
        if column_name in columns
    ]
    order_sql = (
        " ORDER BY "
        + ", ".join(f"{column_name} DESC NULLS LAST" for column_name in order_columns)
        if order_columns
        else ""
    )

    row = conn.execute(
        text(
            f"""
            SELECT {", ".join(select_columns)}
              FROM public.service_profiles
             WHERE tenant_id = :tenant_id
             {order_sql}
             LIMIT 1
             FOR UPDATE
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().first()

    return dict(row) if row else None


def _upsert_service_profile(
    conn: Connection,
    *,
    tenant_id: str,
    website_url: str,
    profile: dict[str, Any],
) -> str | None:
    columns = _service_profile_columns(conn)
    if "tenant_id" not in columns:
        raise RuntimeError("service_profiles.tenant_id column is required.")

    conn.execute(
        text(
            """
            SELECT tenant_id
              FROM public.tenant_settings
             WHERE tenant_id = :tenant_id
             FOR UPDATE
            """
        ),
        {"tenant_id": tenant_id},
    )

    payload = _service_profile_payload(profile, website_url)
    existing = _load_existing_service_profile(conn, tenant_id, columns)
    expressions, params = _bind_payload(payload, columns)

    if existing:
        if not expressions:
            return str(existing.get("id")) if existing.get("id") else None

        assignment_parts = [
            f"{column_name} = {expression}"
            for column_name, expression in expressions.items()
            if column_name not in {"tenant_id", "created_at"}
        ]
        if not assignment_parts:
            return str(existing.get("id")) if existing.get("id") else None

        assignments = ", ".join(assignment_parts)
        params["tenant_id"] = tenant_id

        where_sql = "tenant_id = :tenant_id"
        if "id" in columns and existing.get("id"):
            where_sql = "id = :profile_id AND tenant_id = :tenant_id"
            params["profile_id"] = existing["id"]

        conn.execute(
            text(
                f"""
                UPDATE public.service_profiles
                   SET {assignments}
                 WHERE {where_sql}
                """
            ),
            params,
        )
        return str(existing.get("id")) if existing.get("id") else None

    insert_payload = {
        "tenant_id": tenant_id,
        **payload,
    }
    if "created_at" in columns:
        insert_payload["created_at"] = datetime.now(timezone.utc).isoformat()

    insert_expressions, insert_params = _bind_payload(insert_payload, columns)
    if not insert_expressions:
        raise RuntimeError("service_profiles has no supported writable columns.")

    conn.execute(
        text(
            f"""
            INSERT INTO public.service_profiles ({", ".join(insert_expressions)})
            VALUES ({", ".join(insert_expressions.values())})
            """
        ),
        insert_params,
    )

    return None


class WebsiteCrawler:
    """
    Firecrawl-backed website crawler for onboarding profile extraction.

    It targets the homepage plus common About and Pricing surfaces and returns
    clean markdown that is ready for LLM synthesis.
    """

    TARGET_PATH_PATTERNS = (
        r"(?:about|about-us|company)",
        r"(?:pricing|plans|packages)",
    )

    BOILERPLATE_PHRASES = (
        "skip to content",
        "accept cookies",
        "cookie settings",
        "privacy policy",
        "terms of service",
        "terms & conditions",
        "all rights reserved",
        "copyright",
        "sign in",
        "log in",
        "login",
        "menu",
        "navigation",
    )

    def __init__(
        self,
        api_key: str | None = None,
        timeout_seconds: int = 90,
        page_timeout_ms: int = 30_000,
        max_pages: int = 8,
    ) -> None:
        self.api_key = api_key or os.getenv("FIRECRAWL_API_KEY")
        self.timeout_seconds = timeout_seconds
        self.page_timeout_ms = page_timeout_ms
        self.max_pages = max_pages

    async def crawl_and_scrape(
        self,
        url: str,
        *,
        tenant_id: str | None = None,
        service_profile_id: str | None = None,
        crawl_job_id: str | None = None,
    ) -> str:
        """
        Crawl and scrape the given website, returning concatenated markdown.

        Dead secondary pages are skipped. If no usable content can be recovered
        from either crawl or fallback scrapes, a RuntimeError is raised.
        """
        resolved_tenant_id = tenant_id or "unknown"
        normalized_url = self._normalize_url(url)
        client = self._build_client()

        documents: list[tuple[str, str]] = []
        seen_sources: set[str] = set()

        logger.info(
            "website_crawl_started tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s max_pages=%s timeout_seconds=%s",
            resolved_tenant_id,
            service_profile_id,
            crawl_job_id,
            normalized_url,
            self.max_pages,
            self.timeout_seconds,
        )

        try:
            crawl_result = await self._crawl_target_pages(client, normalized_url)
            documents.extend(self._documents_from_result(crawl_result, seen_sources))
        except asyncio.TimeoutError as exc:
            logger.warning(
                "firecrawl_crawl_timeout tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s timeout_seconds=%s failure_reason=%s",
                resolved_tenant_id,
                service_profile_id,
                crawl_job_id,
                normalized_url,
                self.timeout_seconds,
                "crawl_timeout",
            )
            crawl_error: Exception | None = exc
        except Exception as exc:
            logger.warning(
                "firecrawl_crawl_failed tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s error_type=%s error=%s failure_reason=%s",
                resolved_tenant_id,
                service_profile_id,
                crawl_job_id,
                normalized_url,
                exc.__class__.__name__,
                exc,
                "primary_crawl_failed",
                exc_info=True,
            )
            crawl_error = exc
        else:
            crawl_error = None

        if len(documents) < 3:
            fallback_docs = await self._scrape_common_pages(
                client=client,
                url=normalized_url,
                seen_sources=seen_sources,
                tenant_id=resolved_tenant_id,
                service_profile_id=service_profile_id,
                crawl_job_id=crawl_job_id,
            )
            documents.extend(fallback_docs)

        cleaned_parts = []
        for source_url, markdown in documents:
            cleaned = self._strip_boilerplate(markdown)
            if cleaned:
                cleaned_parts.append(f"## Source: {source_url}\n\n{cleaned}")

        if cleaned_parts:
            content = "\n\n---\n\n".join(cleaned_parts)
            logger.info(
                "website_crawl_completed tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s documents=%s content_chars=%s",
                resolved_tenant_id,
                service_profile_id,
                crawl_job_id,
                normalized_url,
                len(cleaned_parts),
                len(content),
            )
            return content

        if crawl_error:
            logger.error(
                "website_crawl_failed tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s failure_reason=%s documents=%s",
                resolved_tenant_id,
                service_profile_id,
                crawl_job_id,
                normalized_url,
                "no_usable_content_after_crawl_error",
                len(documents),
            )
            raise RuntimeError(
                f"Unable to crawl or scrape usable website content for {normalized_url}"
            ) from crawl_error

        logger.error(
            "website_crawl_failed tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s failure_reason=%s documents=%s",
            resolved_tenant_id,
            service_profile_id,
            crawl_job_id,
            normalized_url,
            "no_usable_content",
            len(documents),
        )
        raise RuntimeError(f"No usable website content found for {normalized_url}")

    def _build_client(self) -> Any:
        try:
            from firecrawl import AsyncFirecrawl
        except ImportError as exc:
            raise RuntimeError(
                "firecrawl-py is required for WebsiteCrawler. Install it with "
                "`pip install firecrawl-py`."
            ) from exc

        kwargs = {"api_key": self.api_key} if self.api_key else {}
        return AsyncFirecrawl(**kwargs)

    async def _crawl_target_pages(self, client: Any, url: str) -> Any:
        crawl = getattr(client, "crawl", None)
        if callable(crawl):
            return await asyncio.wait_for(
                self._call_url_method(
                    crawl,
                    url,
                    **self._crawl_options(url),
                    poll_interval=2,
                    timeout=self.timeout_seconds,
                ),
                timeout=self.timeout_seconds + 5,
            )

        start_crawl = getattr(client, "start_crawl", None)
        get_crawl_status = getattr(client, "get_crawl_status", None)
        if not callable(start_crawl) or not callable(get_crawl_status):
            raise RuntimeError("Installed firecrawl-py client does not support crawling.")

        started = await self._call_url_method(start_crawl, url, **self._crawl_options(url))
        crawl_id = self._read_field(started, "id")
        if not crawl_id:
            raise RuntimeError("Firecrawl did not return a crawl job id.")

        deadline = asyncio.get_running_loop().time() + self.timeout_seconds
        while True:
            status = await get_crawl_status(crawl_id)
            state = str(self._read_field(status, "status", "")).lower()
            if state in {"completed", "failed", "cancelled"}:
                return status
            if asyncio.get_running_loop().time() >= deadline:
                raise asyncio.TimeoutError
            await asyncio.sleep(2)

    def _crawl_options(self, url: str) -> dict[str, Any]:
        include_paths = self._target_include_patterns(url)
        return {
            "include_paths": include_paths,
            "regex_on_full_url": True,
            "crawl_entire_domain": True,
            "allow_external_links": False,
            "allow_subdomains": False,
            "ignore_query_parameters": True,
            "max_discovery_depth": 2,
            "limit": self.max_pages,
            "sitemap": "include",
            "max_concurrency": 2,
            "scrape_options": {
                "formats": ["markdown"],
                "onlyMainContent": True,
                "onlyCleanContent": True,
                "removeBase64Images": True,
                "blockAds": True,
                "timeout": self.page_timeout_ms,
                "excludeTags": [
                    "nav",
                    "footer",
                    "aside",
                    "script",
                    "style",
                    "noscript",
                    "svg",
                    "canvas",
                    "form",
                ],
            },
        }

    async def _scrape_common_pages(
        self,
        client: Any,
        url: str,
        seen_sources: set[str],
        *,
        tenant_id: str,
        service_profile_id: str | None,
        crawl_job_id: str | None,
    ) -> list[tuple[str, str]]:
        scrape = getattr(client, "scrape", None)
        if not callable(scrape):
            return []

        documents: list[tuple[str, str]] = []
        for candidate_url in self._fallback_urls(url):
            if candidate_url in seen_sources:
                continue
            try:
                result = await asyncio.wait_for(
                    self._call_url_method(
                        scrape,
                        candidate_url,
                        formats=["markdown"],
                        only_main_content=True,
                        only_clean_content=True,
                        remove_base64_images=True,
                        block_ads=True,
                        timeout=self.page_timeout_ms,
                    ),
                    timeout=max(10, self.page_timeout_ms // 1000 + 5),
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "firecrawl_scrape_timeout tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s failure_reason=%s",
                    tenant_id,
                    service_profile_id,
                    crawl_job_id,
                    candidate_url,
                    "fallback_scrape_timeout",
                )
                continue
            except Exception as exc:
                logger.info(
                    "firecrawl_scrape_skipped tenant_id=%s service_profile_id=%s crawl_job_id=%s url=%s error_type=%s error=%s failure_reason=%s",
                    tenant_id,
                    service_profile_id,
                    crawl_job_id,
                    candidate_url,
                    exc.__class__.__name__,
                    exc,
                    "fallback_scrape_failed",
                )
                continue

            documents.extend(self._documents_from_result(result, seen_sources, candidate_url))
        return documents

    async def _call_url_method(self, method: Any, url: str, **kwargs: Any) -> Any:
        try:
            return await method(url=url, **kwargs)
        except TypeError as exc:
            if "url" not in str(exc):
                raise
            return await method(url, **kwargs)

    def _documents_from_result(
        self,
        result: Any,
        seen_sources: set[str],
        fallback_source: str | None = None,
    ) -> list[tuple[str, str]]:
        raw_docs = self._read_field(result, "data")
        if raw_docs is None:
            raw_docs = [result]
        elif isinstance(raw_docs, dict):
            raw_docs = [raw_docs]

        documents: list[tuple[str, str]] = []
        for doc in raw_docs:
            markdown = self._read_field(doc, "markdown")
            if not isinstance(markdown, str) or not markdown.strip():
                continue

            metadata = self._read_field(doc, "metadata", {}) or {}
            source_url = (
                self._read_field(metadata, "source_url")
                or self._read_field(metadata, "sourceURL")
                or self._read_field(metadata, "url")
                or fallback_source
                or "unknown"
            )
            source_url = str(source_url)
            if source_url in seen_sources:
                continue

            seen_sources.add(source_url)
            documents.append((source_url, markdown))
        return documents

    def _target_include_patterns(self, url: str) -> list[str]:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        exact_url = re.escape(url.rstrip("/"))
        escaped_origin = re.escape(origin)
        target_path = "|".join(self.TARGET_PATH_PATTERNS)

        return [
            rf"^{exact_url}/?(?:[?#].*)?$",
            rf"^{escaped_origin}/?(?:[?#].*)?$",
            rf"^{escaped_origin}/(?:{target_path})(?:/.*)?(?:[?#].*)?$",
        ]

    def _fallback_urls(self, url: str) -> list[str]:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        candidates = [
            url,
            origin,
            urljoin(origin, "/about"),
            urljoin(origin, "/about-us"),
            urljoin(origin, "/company"),
            urljoin(origin, "/pricing"),
            urljoin(origin, "/plans"),
            urljoin(origin, "/packages"),
        ]

        deduped: list[str] = []
        for candidate in candidates:
            normalized = candidate.rstrip("/") or candidate
            if normalized not in deduped:
                deduped.append(normalized)
        return deduped

    def _strip_boilerplate(self, markdown: str) -> str:
        markdown = re.sub(r"!\[[^\]]*]\([^)]*\)", "", markdown)
        markdown = re.sub(r"\[!\[[^\]]*]\([^)]*\)]\([^)]*\)", "", markdown)
        markdown = re.sub(r"data:image/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+", "", markdown)

        cleaned_lines: list[str] = []
        seen_short_lines: set[str] = set()
        blank_pending = False

        for raw_line in markdown.splitlines():
            line = raw_line.strip()
            if not line:
                blank_pending = bool(cleaned_lines)
                continue

            lowered = line.lower()
            if len(line) <= 90 and any(phrase in lowered for phrase in self.BOILERPLATE_PHRASES):
                continue

            normalized_short = re.sub(r"\s+", " ", lowered)
            if len(line) <= 120 and normalized_short in seen_short_lines:
                continue
            if len(line) <= 120:
                seen_short_lines.add(normalized_short)

            if blank_pending:
                cleaned_lines.append("")
                blank_pending = False
            cleaned_lines.append(line)

        cleaned = "\n".join(cleaned_lines)
        return re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    @staticmethod
    def _normalize_url(url: str) -> str:
        if not url or not url.strip():
            raise ValueError("url is required")

        candidate = url.strip()
        if "://" not in candidate:
            candidate = f"https://{candidate}"

        parsed = urlparse(candidate)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(f"Invalid website URL: {url}")

        return urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                parsed.path or "/",
                "",
                "",
                "",
            )
        )

    @staticmethod
    def _read_field(obj: Any, field_name: str, default: Any = None) -> Any:
        if isinstance(obj, dict):
            return obj.get(field_name, default)
        return getattr(obj, field_name, default)


def enqueue_crawl_job(tenant_id: str, website_url: str) -> str:
    _require_redis_broker()
    normalized_url = WebsiteCrawler._normalize_url(website_url)
    message = process_crawl_job.send(tenant_id, normalized_url)

    logger.info(
        "crawl_job_enqueued tenant_id=%s website_url=%s message_id=%s",
        tenant_id,
        normalized_url,
        message.message_id,
    )
    return message.message_id


_configure_dramatiq_broker()


@dramatiq.actor(
    queue_name=os.getenv("ARCLI_CRAWL_QUEUE_NAME", "crawling"),
    max_retries=3,
)
def process_crawl_job(tenant_id: str, website_url: str) -> None:
    normalized_url = WebsiteCrawler._normalize_url(website_url)
    crawl_job_id = _crawl_job_id(tenant_id, normalized_url)
    engine = _database_engine()

    with engine.begin() as conn:
        current_website_url = _current_website_url(conn, tenant_id)

    if not _normalized_equals(current_website_url, normalized_url):
        logger.info(
            "crawl_job_skipped tenant_id=%s website_url=%s crawl_job_id=%s skip_reason=%s current_website_url=%s",
            tenant_id,
            normalized_url,
            crawl_job_id,
            "stale_or_missing_tenant_website_url",
            current_website_url,
        )
        return

    logger.info(
        "crawl_job_started tenant_id=%s website_url=%s crawl_job_id=%s",
        tenant_id,
        normalized_url,
        crawl_job_id,
    )

    markdown = asyncio.run(
        WebsiteCrawler().crawl_and_scrape(
            normalized_url,
            tenant_id=tenant_id,
            crawl_job_id=crawl_job_id,
        )
    )

    from api.services.profile_extraction import ProfileExtractor

    profile = ProfileExtractor().extract_profile(
        markdown,
        tenant_id=tenant_id,
        crawl_job_id=crawl_job_id,
    )

    with engine.begin() as conn:
        current_website_url = _current_website_url(conn, tenant_id)
        if not _normalized_equals(current_website_url, normalized_url):
            logger.info(
                "crawl_job_skipped tenant_id=%s website_url=%s crawl_job_id=%s skip_reason=%s current_website_url=%s",
                tenant_id,
                normalized_url,
                crawl_job_id,
                "tenant_website_url_changed_after_crawl",
                current_website_url,
            )
            return

        service_profile_id = _upsert_service_profile(
            conn,
            tenant_id=tenant_id,
            website_url=normalized_url,
            profile=profile,
        )

    logger.info(
        "crawl_job_completed tenant_id=%s website_url=%s crawl_job_id=%s service_profile_id=%s",
        tenant_id,
        normalized_url,
        crawl_job_id,
        service_profile_id,
    )
