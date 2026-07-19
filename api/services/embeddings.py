import logging
import json
import math
import os
import hashlib
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Sequence

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from dramatiq.middleware import TimeLimitExceeded
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential_jitter,
)

from api.services.cost_controls import TenantQuotaGuard, env_int

logger = logging.getLogger(__name__)


EMBEDDING_MODEL = "text-embedding-3-small"
MAX_EMBEDDING_INPUT_CHARS = 32_000
EMBEDDING_QUOTA_COUNTER = "embeddings"
EMBEDDING_QUOTA_DEFAULT_LIMIT = 20_000
EMBEDDING_QUOTA_DEFAULT_WINDOW_SECONDS = 86_400
DEFAULT_EMBEDDING_JOB_STALE_SECONDS = 600
DEFAULT_EMBEDDING_JOB_TIME_LIMIT_MS = 90_000


class EmbeddingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    text: str = Field(
        min_length=1,
        max_length=MAX_EMBEDDING_INPUT_CHARS,
        description="Text to embed for semantic matching.",
    )
    model: str = Field(
        default=EMBEDDING_MODEL,
        min_length=1,
        description="OpenAI embedding model to use.",
    )


class EmbeddingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    model: str = Field(description="Embedding model used by OpenAI.")
    embedding: list[float] = Field(
        min_length=1,
        description="Dense embedding vector returned by OpenAI.",
    )
    dimensions: int = Field(gt=0, description="Number of vector dimensions.")

    @field_validator("embedding")
    @classmethod
    def validate_embedding(cls, value: list[float]) -> list[float]:
        if any(not isinstance(item, float) or not math.isfinite(item) for item in value):
            raise ValueError("embedding must contain only finite floats")
        return value


def _is_retryable_openai_error(exception: BaseException) -> bool:
    status_code = getattr(exception, "status_code", None)
    if status_code in {408, 409, 429, 500, 502, 503, 504}:
        return True

    return exception.__class__.__name__ in {
        "APIConnectionError",
        "APITimeoutError",
        "InternalServerError",
        "RateLimitError",
    }


def _log_retry(retry_state: RetryCallState) -> None:
    exception = retry_state.outcome.exception() if retry_state.outcome else None
    next_sleep = getattr(retry_state.next_action, "sleep", 0.0) or 0.0
    logger.warning(
        "openai_embedding_retry attempt=%s wait_seconds=%.2f error_type=%s error=%s",
        retry_state.attempt_number,
        next_sleep,
        exception.__class__.__name__ if exception else "unknown",
        exception,
    )


class EmbeddingService:
    """
    Thin OpenAI embedding boundary for the Phase 1 in-memory matching engine.
    """

    def __init__(
        self,
        client: Any | None = None,
        api_key: str | None = None,
        model: str = EMBEDDING_MODEL,
        timeout_seconds: float = 30.0,
        quota_guard: TenantQuotaGuard | None = None,
    ) -> None:
        self.client = client
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.quota_guard = quota_guard or TenantQuotaGuard()

    def embed_text(
        self,
        request: EmbeddingRequest | str,
        *,
        tenant_id: str | None = None,
        service_profile_id: str | None = None,
        source_post_id: str | None = None,
        purpose: str = "semantic_matching",
    ) -> EmbeddingResponse:
        payload = (
            request
            if isinstance(request, EmbeddingRequest)
            else EmbeddingRequest(text=request, model=self.model)
        )
        quota = self.quota_guard.check_and_increment(
            tenant_id=tenant_id,
            counter_name=EMBEDDING_QUOTA_COUNTER,
            limit=env_int("ARCLI_AI_DAILY_EMBEDDING_LIMIT", EMBEDDING_QUOTA_DEFAULT_LIMIT),
            window_seconds=env_int(
                "ARCLI_AI_DAILY_EMBEDDING_WINDOW_SECONDS",
                EMBEDDING_QUOTA_DEFAULT_WINDOW_SECONDS,
            ),
        )
        if not quota.allowed:
            logger.warning(
                "embedding_skipped tenant_id=%s service_profile_id=%s source_post_id=%s purpose=%s rejection_reason=%s current_count=%s limit=%s window_seconds=%s",
                quota.tenant_id,
                service_profile_id,
                source_post_id,
                purpose,
                quota.rejection_reason,
                quota.current_count,
                quota.limit,
                quota.window_seconds,
            )
            raise RuntimeError("Embedding quota exceeded for tenant.")

        embedding = self._create_embedding(payload.text, payload.model)
        result = EmbeddingResponse(
            model=payload.model,
            embedding=embedding,
            dimensions=len(embedding),
        )
        logger.info(
            "embedding_generated tenant_id=%s service_profile_id=%s source_post_id=%s purpose=%s model=%s dimensions=%s input_chars=%s current_count=%s limit=%s",
            quota.tenant_id,
            service_profile_id,
            source_post_id,
            purpose,
            result.model,
            result.dimensions,
            len(payload.text),
            quota.current_count,
            quota.limit,
        )
        return result

    def embed_many(
        self,
        requests: Sequence[EmbeddingRequest] | Sequence[str],
        *,
        tenant_id: str | None = None,
        service_profile_id: str | None = None,
        purpose: str = "semantic_matching",
    ) -> list[EmbeddingResponse]:
        return [
            self.embed_text(
                request,
                tenant_id=tenant_id,
                service_profile_id=service_profile_id,
                purpose=purpose,
            )
            for request in requests
        ]

    @retry(
        retry=retry_if_exception(_is_retryable_openai_error),
        wait=wait_exponential_jitter(initial=1, max=20),
        stop=stop_after_attempt(5),
        before_sleep=_log_retry,
        reraise=True,
    )
    def _create_embedding(self, text: str, model: str) -> list[float]:
        client = self.client or self._build_client()
        response = client.embeddings.create(
            model=model,
            input=text,
            timeout=self.timeout_seconds,
        )

        data = getattr(response, "data", None)
        if not data:
            raise RuntimeError("OpenAI returned no embedding data.")

        embedding = data[0].embedding
        if not isinstance(embedding, list) or not embedding:
            raise RuntimeError("OpenAI returned an invalid embedding vector.")

        return [float(value) for value in embedding]

    def _build_client(self) -> Any:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError(
                "openai is required for EmbeddingService. Install it with "
                "`pip install openai`."
            ) from exc

        kwargs = {"api_key": self.api_key} if self.api_key else {}
        return OpenAI(**kwargs)


SERVICE_PROFILE_EMBEDDING_COLUMNS = {
    "id",
    "tenant_id",
    "website_url",
    "url",
    "status",
    "review_status",
    "extraction_status",
    "profile_json",
    "profile",
    "data",
    "target_audience",
    "core_problem",
    "core_problem_solved",
    "unique_value_prop",
    "one_liner",
    "use_cases",
    "pain_points",
    "ideal_customer_pain_points",
    "buying_triggers",
    "negative_keywords",
    "excluded_audiences",
    "key_value_propositions",
    "profile_embedding",
    "embedding",
    "embedding_json",
    "embedding_model",
    "profile_embedding_model",
    "embedding_dimensions",
    "profile_embedding_dimensions",
    "embedding_generated_at",
    "profile_embedding_generated_at",
    "embedding_status",
    "profile_embedding_text",
    "updated_at",
}


def _configure_dramatiq_broker() -> None:
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return

    current_broker = dramatiq.get_broker()
    if getattr(current_broker, "_arcli_redis_url", None) == redis_url:
        return

    broker = RedisBroker(url=redis_url)
    setattr(broker, "_arcli_redis_url", redis_url)
    dramatiq.set_broker(broker)
    logger.info(
        "dramatiq_redis_broker_configured broker=%s redis_url_configured=%s",
        "redis",
        True,
    )


def _require_redis_broker() -> None:
    if not os.getenv("REDIS_URL", "").strip():
        raise RuntimeError("REDIS_URL is required to enqueue embedding jobs.")

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
        if str(row["column_name"]) in SERVICE_PROFILE_EMBEDDING_COLUMNS
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
    if column["udt_name"] == "vector":
        return f"CAST(:{param_name} AS vector)"
    return f":{param_name}"


def _coerce_value(value: Any, column: dict[str, str]) -> Any:
    if _is_json_column(column):
        return json.dumps(value)

    if column["udt_name"] == "vector" and isinstance(value, list):
        return "[" + ",".join(str(float(item)) for item in value) + "]"

    if isinstance(value, list) and column["data_type"] != "ARRAY":
        return json.dumps(value)

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


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)

    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}

    return {}


def _first_document(row: dict[str, Any]) -> dict[str, Any]:
    for key in ("profile_json", "profile", "data"):
        document = _as_dict(row.get(key))
        if document:
            return document

    return {}


def _string_value(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None

    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return str(value)

    return None


def _string_list(value: Any) -> list[str]:
    raw_items: list[str] = []

    if isinstance(value, list):
        raw_items = [
            str(item)
            for item in value
            if isinstance(item, (str, int, float)) and str(item).strip()
        ]
    elif isinstance(value, str):
        raw_items = [item.strip() for item in value.replace("\n", ",").split(",")]

    seen: set[str] = set()
    items: list[str] = []
    for item in raw_items:
        normalized = " ".join(item.strip().split())
        key = normalized.lower()
        if normalized and key not in seen:
            seen.add(key)
            items.append(normalized)

    return items


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


def _profile_status(row: dict[str, Any]) -> str | None:
    document = _first_document(row)
    return _read_string([row, document], ["status", "review_status"])


def _profile_extraction_status(row: dict[str, Any]) -> str | None:
    document = _first_document(row)
    return _read_string([row, document], ["extraction_status"])


def _normalized_status(value: str | None) -> str | None:
    return "_".join(value.strip().lower().split()) if value else None


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


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


def _row_embedding_status(row: dict[str, Any]) -> str | None:
    sources = [
        row,
        _as_dict(row.get("embedding_json")),
        _first_document(row),
        _as_dict(row.get("profile")),
        _as_dict(row.get("data")),
    ]
    return _read_string(sources, ["embedding_status"])


def _row_embedding_model(row: dict[str, Any]) -> str | None:
    sources = [
        row,
        _as_dict(row.get("embedding_json")),
        _first_document(row),
        _as_dict(row.get("profile")),
        _as_dict(row.get("data")),
    ]
    return _read_string(sources, ["profile_embedding_model", "embedding_model"])


def _row_profile_embedding_text(row: dict[str, Any]) -> str | None:
    return _string_value(row.get("profile_embedding_text"))


def _row_profile_embedding(row: dict[str, Any]) -> list[float] | None:
    for key in ("profile_embedding", "embedding"):
        embedding = _embedding_values(row.get(key))
        if embedding:
            return embedding

    for source in (
        _as_dict(row.get("embedding_json")),
        _first_document(row),
        _as_dict(row.get("profile")),
        _as_dict(row.get("data")),
    ):
        embedding = _embedding_values(source.get("profile_embedding"))
        if embedding:
            return embedding

    return None


def _timestamp_age_seconds(value: Any) -> float | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, str):
        try:
            timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    return (datetime.now(timezone.utc) - timestamp).total_seconds()


def _has_current_profile_embedding(
    row: dict[str, Any],
    *,
    embedding_text: str,
    embedding_model: str,
) -> bool:
    return (
        _row_profile_embedding_text(row) == embedding_text
        and _row_embedding_model(row) == embedding_model
        and _row_profile_embedding(row) is not None
    )


def _embedding_processing_is_fresh(row: dict[str, Any]) -> bool:
    if _normalized_status(_row_embedding_status(row)) != "processing":
        return False

    age_seconds = _timestamp_age_seconds(row.get("updated_at"))
    if age_seconds is None:
        return False

    return age_seconds < env_int(
        "ARCLI_EMBEDDING_JOB_STALE_SECONDS",
        DEFAULT_EMBEDDING_JOB_STALE_SECONDS,
    )


def _profile_is_embeddable(row: dict[str, Any]) -> bool:
    status = _normalized_status(_profile_status(row))
    extraction_status = _normalized_status(_profile_extraction_status(row))

    if status in {"failed", "error", "archived", "deleted"}:
        return False

    if extraction_status in {"failed", "error"}:
        return False

    return True


def _service_profile_embedding_text(row: dict[str, Any]) -> str:
    document = _first_document(row)
    sources = [document, row]

    company_name = _read_string(sources, ["company_name", "name"])
    one_liner = _read_string(
        sources,
        ["one_liner", "unique_value_prop", "unique_value_proposition"],
    )
    target_audience = _read_list(sources, ["target_audience", "audience"])
    core_problem = _read_string(sources, ["core_problem_solved", "core_problem"])
    value_props = _read_list(
        sources,
        ["key_value_propositions", "value_propositions"],
    )
    if not value_props:
        unique_value_prop = _read_string(sources, ["unique_value_prop"])
        value_props = [unique_value_prop] if unique_value_prop else []

    pain_points = _read_list(
        sources,
        ["ideal_customer_pain_points", "pain_points"],
    )
    buying_triggers = _read_list(sources, ["buying_triggers"])
    negative_keywords = _read_list(sources, ["negative_keywords", "excluded_audiences"])

    lines = [
        f"Company: {company_name}" if company_name else None,
        f"One-liner: {one_liner}" if one_liner else None,
        f"Audience: {', '.join(target_audience)}" if target_audience else None,
        f"Problem solved: {core_problem}" if core_problem else None,
        f"Value propositions: {', '.join(value_props)}" if value_props else None,
        f"Ideal pains: {', '.join(pain_points)}" if pain_points else None,
        f"Buying triggers: {', '.join(buying_triggers)}" if buying_triggers else None,
        f"Bad-fit terms: {', '.join(negative_keywords)}"
        if negative_keywords
        else None,
    ]
    text_value = "\n".join(line for line in lines if line)
    if not text_value.strip():
        raise RuntimeError("Service profile has no embeddable content.")

    return text_value


def _load_service_profile(
    conn: Connection,
    tenant_id: str,
    service_profile_id: str | None,
    columns: dict[str, dict[str, str]],
    *,
    for_update: bool = False,
) -> dict[str, Any] | None:
    select_columns = [
        column_name
        for column_name in SERVICE_PROFILE_EMBEDDING_COLUMNS
        if column_name in columns
    ]
    if "tenant_id" not in select_columns:
        raise RuntimeError("service_profiles.tenant_id column is required.")

    where_parts = ["tenant_id = :tenant_id"]
    params: dict[str, Any] = {"tenant_id": tenant_id}
    if service_profile_id and "id" in columns:
        where_parts.append("id = :service_profile_id")
        params["service_profile_id"] = service_profile_id

    order_columns = [
        column_name
        for column_name in ("updated_at", "embedding_generated_at")
        if column_name in columns
    ]
    order_sql = (
        " ORDER BY "
        + ", ".join(f"{column_name} DESC NULLS LAST" for column_name in order_columns)
        if order_columns and not service_profile_id
        else ""
    )
    lock_sql = " FOR UPDATE" if for_update else ""

    row = conn.execute(
        text(
            f"""
            SELECT {", ".join(select_columns)}
              FROM public.service_profiles
             WHERE {" AND ".join(where_parts)}
             {order_sql}
             LIMIT 1
             {lock_sql}
            """
        ),
        params,
    ).mappings().first()

    return dict(row) if row else None


def _embedding_update_payload(
    row: dict[str, Any],
    embedding_text: str,
    embedding: EmbeddingResponse,
    columns: dict[str, dict[str, str]],
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    embedding_metadata = {
        "profile_embedding": embedding.embedding,
        "profile_embedding_model": embedding.model,
        "profile_embedding_dimensions": embedding.dimensions,
        "profile_embedding_generated_at": now,
        "embedding_status": "completed",
    }
    payload: dict[str, Any] = {
        "updated_at": now,
        "embedding_status": "completed",
        "profile_embedding_text": embedding_text,
    }

    for column_name in ("profile_json", "profile", "data"):
        if column_name in columns:
            payload[column_name] = {
                **_as_dict(row.get(column_name)),
                **embedding_metadata,
            }

    direct_values: dict[str, Any] = {
        "profile_embedding": embedding.embedding,
        "embedding": embedding.embedding,
        "embedding_json": embedding_metadata,
        "embedding_model": embedding.model,
        "profile_embedding_model": embedding.model,
        "embedding_dimensions": embedding.dimensions,
        "profile_embedding_dimensions": embedding.dimensions,
        "embedding_generated_at": now,
        "profile_embedding_generated_at": now,
    }

    for column_name, value in direct_values.items():
        if column_name in columns:
            payload[column_name] = value

    return payload


def _embedding_status_payload(
    row: dict[str, Any],
    status: str,
    columns: dict[str, dict[str, str]],
    *,
    failure_reason: str | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    payload: dict[str, Any] = {
        "updated_at": now,
        "embedding_status": status,
    }
    status_metadata: dict[str, Any] = {
        "embedding_status": status,
    }
    if failure_reason:
        status_metadata["embedding_failure_reason"] = failure_reason
    if error_type:
        status_metadata["embedding_error_type"] = error_type
    if error_message:
        status_metadata["embedding_error_message"] = error_message[:1_000]

    for column_name in ("profile_json", "profile", "data"):
        if column_name in columns:
            payload[column_name] = {
                **_as_dict(row.get(column_name)),
                **status_metadata,
            }

    return payload


def _mark_service_profile_embedding_status(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str | None,
    status: str,
    failure_reason: str | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    columns = _service_profile_columns(conn)
    row = _load_service_profile(
        conn,
        tenant_id,
        service_profile_id,
        columns,
        for_update=True,
    )
    if not row:
        return

    payload = _embedding_status_payload(
        row,
        status,
        columns,
        failure_reason=failure_reason,
        error_type=error_type,
        error_message=error_message,
    )
    expressions, params = _bind_payload(payload, columns)
    assignment_parts = [
        f"{column_name} = {expression}"
        for column_name, expression in expressions.items()
        if column_name not in {"tenant_id", "id"}
    ]
    if not assignment_parts:
        return

    params["tenant_id"] = tenant_id
    where_sql = "tenant_id = :tenant_id"
    if service_profile_id and "id" in columns:
        where_sql += " AND id = :service_profile_id"
        params["service_profile_id"] = service_profile_id
    elif row.get("id") and "id" in columns:
        where_sql += " AND id = :service_profile_id"
        params["service_profile_id"] = row["id"]

    conn.execute(
        text(
            f"""
            UPDATE public.service_profiles
               SET {", ".join(assignment_parts)}
             WHERE {where_sql}
            """
        ),
        params,
    )


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


def _persist_service_profile_embedding_record(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str | None,
    embedding_text: str,
    embedding: EmbeddingResponse,
) -> None:
    if not service_profile_id:
        return

    columns = _table_columns(conn, "service_profile_embeddings")
    required_columns = {"tenant_id", "service_profile_id", "embedding_model"}
    if not required_columns.issubset(columns):
        return

    now = datetime.now(timezone.utc).isoformat()
    embedding_metadata = {
        "profile_embedding": embedding.embedding,
        "profile_embedding_model": embedding.model,
        "profile_embedding_dimensions": embedding.dimensions,
        "profile_embedding_generated_at": now,
        "embedding_status": "completed",
    }
    payload: dict[str, Any] = {
        "tenant_id": tenant_id,
        "service_profile_id": service_profile_id,
        "embedding_json": embedding_metadata,
        "embedding_model": embedding.model,
        "embedding_dimensions": embedding.dimensions,
        "source_text": embedding_text,
        "source_text_sha256": _sha256_text(embedding_text),
        "status": "completed",
        "updated_at": now,
    }
    if "created_at" in columns:
        payload["created_at"] = now
    if "embedding" in columns:
        payload["embedding"] = embedding.embedding

    expressions, params = _bind_payload(payload, columns)
    if not expressions:
        return

    assignment_parts = [
        f"{column_name} = EXCLUDED.{column_name}"
        for column_name in expressions
        if column_name not in {"id", "tenant_id", "service_profile_id", "created_at"}
    ]
    conflict_sql = (
        f"DO UPDATE SET {', '.join(assignment_parts)}"
        if assignment_parts
        else "DO NOTHING"
    )

    conn.execute(
        text(
            f"""
            INSERT INTO public.service_profile_embeddings (
                {", ".join(expressions)}
            )
            VALUES (
                {", ".join(expressions.values())}
            )
            ON CONFLICT (service_profile_id, embedding_model)
            {conflict_sql}
            {"WHERE public.service_profile_embeddings.tenant_id = EXCLUDED.tenant_id" if assignment_parts else ""}
            """
        ),
        params,
    )


def _persist_service_profile_embedding_failure_record(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str | None,
    embedding_text: str,
    embedding_model: str,
    failure_reason: str,
    exc: BaseException,
) -> None:
    if not service_profile_id:
        return

    columns = _table_columns(conn, "service_profile_embeddings")
    required_columns = {"tenant_id", "service_profile_id", "embedding_model", "status"}
    if not required_columns.issubset(columns):
        return

    now = datetime.now(timezone.utc).isoformat()
    payload: dict[str, Any] = {
        "tenant_id": tenant_id,
        "service_profile_id": service_profile_id,
        "embedding_model": embedding_model,
        "source_text": embedding_text,
        "source_text_sha256": _sha256_text(embedding_text),
        "status": "failed",
        "failure_reason": failure_reason,
        "error_context": {
            "error_type": exc.__class__.__name__,
            "error_message": str(exc)[:1_000],
        },
        "updated_at": now,
    }
    if "created_at" in columns:
        payload["created_at"] = now

    expressions, params = _bind_payload(payload, columns)
    if not expressions:
        return

    assignment_parts = [
        f"{column_name} = EXCLUDED.{column_name}"
        for column_name in expressions
        if column_name not in {"id", "tenant_id", "service_profile_id", "created_at"}
    ]
    conflict_sql = (
        f"DO UPDATE SET {', '.join(assignment_parts)}"
        if assignment_parts
        else "DO NOTHING"
    )

    conn.execute(
        text(
            f"""
            INSERT INTO public.service_profile_embeddings (
                {", ".join(expressions)}
            )
            VALUES (
                {", ".join(expressions.values())}
            )
            ON CONFLICT (service_profile_id, embedding_model)
            {conflict_sql}
            {"WHERE public.service_profile_embeddings.tenant_id = EXCLUDED.tenant_id" if assignment_parts else ""}
            """
        ),
        params,
    )


def _persist_service_profile_embedding(
    conn: Connection,
    *,
    tenant_id: str,
    service_profile_id: str | None,
    embedding_text: str,
    embedding: EmbeddingResponse,
) -> str | None:
    columns = _service_profile_columns(conn)
    row = _load_service_profile(
        conn,
        tenant_id,
        service_profile_id,
        columns,
        for_update=True,
    )

    if not row:
        logger.warning(
            "service_profile_embedding_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
            tenant_id,
            service_profile_id,
            "profile_not_found",
        )
        return None

    if not _profile_is_embeddable(row):
        logger.info(
            "service_profile_embedding_skipped tenant_id=%s service_profile_id=%s skip_reason=%s status=%s",
            tenant_id,
            service_profile_id,
            "profile_not_embeddable",
            _profile_status(row),
        )
        return None

    payload = _embedding_update_payload(row, embedding_text, embedding, columns)
    expressions, params = _bind_payload(payload, columns)
    assignment_parts = [
        f"{column_name} = {expression}"
        for column_name, expression in expressions.items()
        if column_name not in {"tenant_id", "id"}
    ]

    if not assignment_parts:
        logger.info(
            "service_profile_embedding_generated_without_persistence tenant_id=%s service_profile_id=%s model=%s dimensions=%s",
            tenant_id,
            service_profile_id,
            embedding.model,
            embedding.dimensions,
        )
        persisted_profile_id = str(row.get("id")) if row.get("id") else None
        _persist_service_profile_embedding_record(
            conn,
            tenant_id=tenant_id,
            service_profile_id=persisted_profile_id,
            embedding_text=embedding_text,
            embedding=embedding,
        )
        return persisted_profile_id

    params["tenant_id"] = tenant_id
    where_sql = "tenant_id = :tenant_id"
    if service_profile_id and "id" in columns:
        where_sql += " AND id = :service_profile_id"
        params["service_profile_id"] = service_profile_id
    elif row.get("id") and "id" in columns:
        where_sql += " AND id = :service_profile_id"
        params["service_profile_id"] = row["id"]

    conn.execute(
        text(
            f"""
            UPDATE public.service_profiles
               SET {", ".join(assignment_parts)}
             WHERE {where_sql}
            """
        ),
        params,
    )

    persisted_profile_id = str(row.get("id")) if row.get("id") else None
    _persist_service_profile_embedding_record(
        conn,
        tenant_id=tenant_id,
        service_profile_id=persisted_profile_id,
        embedding_text=embedding_text,
        embedding=embedding,
    )

    return persisted_profile_id


def _record_service_profile_embedding_enqueue_failure(
    tenant_id: str,
    service_profile_id: str | None,
    exc: BaseException,
) -> None:
    """Persist an enqueue error so the dashboard never shows a silent stale job."""
    try:
        with _database_engine().begin() as conn:
            _mark_service_profile_embedding_status(
                conn,
                tenant_id=tenant_id,
                service_profile_id=service_profile_id,
                status="failed",
                failure_reason="queue_unavailable",
                error_type=exc.__class__.__name__,
                error_message=str(exc),
            )
    except Exception as persistence_exc:
        logger.exception(
            "service_profile_embedding_enqueue_failure_not_persisted tenant_id=%s service_profile_id=%s error_type=%s error=%s",
            tenant_id,
            service_profile_id,
            persistence_exc.__class__.__name__,
            persistence_exc,
        )


def enqueue_service_profile_embedding_job(
    tenant_id: str,
    service_profile_id: str | None = None,
) -> str:
    try:
        _require_redis_broker()
        message = process_service_profile_embedding_job.send(tenant_id, service_profile_id)
    except Exception as exc:
        _record_service_profile_embedding_enqueue_failure(
            tenant_id,
            service_profile_id,
            exc,
        )
        logger.exception(
            "service_profile_embedding_enqueue_failed tenant_id=%s service_profile_id=%s error_type=%s error=%s",
            tenant_id,
            service_profile_id,
            exc.__class__.__name__,
            exc,
        )
        if isinstance(exc, RuntimeError):
            raise
        raise RuntimeError("Embedding queue is unavailable.") from exc

    logger.info(
        "service_profile_embedding_job_enqueued tenant_id=%s service_profile_id=%s message_id=%s",
        tenant_id,
        service_profile_id,
        message.message_id,
    )
    return message.message_id


_configure_dramatiq_broker()


@dramatiq.actor(
    queue_name=os.getenv("ARCLI_EMBEDDING_QUEUE_NAME", "embeddings"),
    max_retries=max(0, env_int("ARCLI_EMBEDDING_JOB_MAX_RETRIES", 3)),
    min_backoff=env_int("ARCLI_EMBEDDING_JOB_MIN_BACKOFF_MS", 10_000),
    max_backoff=env_int("ARCLI_EMBEDDING_JOB_MAX_BACKOFF_MS", 60_000),
    time_limit=env_int(
        "ARCLI_EMBEDDING_JOB_TIME_LIMIT_MS",
        DEFAULT_EMBEDDING_JOB_TIME_LIMIT_MS,
    ),
    on_retry_exhausted="mark_service_profile_embedding_dead_lettered",
)
def process_service_profile_embedding_job(
    tenant_id: str,
    service_profile_id: str | None = None,
) -> None:
    engine = _database_engine()
    embedding_service = EmbeddingService()

    with engine.begin() as conn:
        columns = _service_profile_columns(conn)
        row = _load_service_profile(
            conn,
            tenant_id,
            service_profile_id,
            columns,
            for_update=True,
        )

        if not row:
            logger.warning(
                "service_profile_embedding_job_skipped tenant_id=%s service_profile_id=%s skip_reason=%s",
                tenant_id,
                service_profile_id,
                "profile_not_found",
            )
            return

        if not _profile_is_embeddable(row):
            logger.info(
                "service_profile_embedding_job_skipped tenant_id=%s service_profile_id=%s skip_reason=%s status=%s",
                tenant_id,
                service_profile_id,
                "profile_not_embeddable",
                _profile_status(row),
            )
            return

        embedding_text = _service_profile_embedding_text(row)
        resolved_profile_id = str(row.get("id")) if row.get("id") else service_profile_id

        if _has_current_profile_embedding(
            row,
            embedding_text=embedding_text,
            embedding_model=embedding_service.model,
        ):
            logger.info(
                "service_profile_embedding_job_deduped tenant_id=%s service_profile_id=%s model=%s skip_reason=%s",
                tenant_id,
                resolved_profile_id,
                embedding_service.model,
                "current_embedding_already_persisted",
            )
            final_profile_id = resolved_profile_id
            embedding = None
        elif _embedding_processing_is_fresh(row):
            logger.info(
                "service_profile_embedding_job_skipped tenant_id=%s service_profile_id=%s model=%s skip_reason=%s",
                tenant_id,
                resolved_profile_id,
                embedding_service.model,
                "embedding_job_already_processing",
            )
            return
        else:
            final_profile_id = None
            embedding = None
            _mark_service_profile_embedding_status(
                conn,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
                status="processing",
            )

    if final_profile_id:
        _enqueue_public_ingestion_after_embedding(tenant_id, final_profile_id)
        return

    try:
        embedding = embedding_service.embed_text(
            embedding_text,
            tenant_id=tenant_id,
            service_profile_id=resolved_profile_id,
            purpose="service_profile_activation",
        )
    except (Exception, TimeLimitExceeded) as exc:
        failure_reason = "time_limit_exceeded" if isinstance(exc, TimeLimitExceeded) else "embedding_failed"
        with engine.begin() as conn:
            _mark_service_profile_embedding_status(
                conn,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
                status="failed",
                failure_reason=failure_reason,
                error_type=exc.__class__.__name__,
                error_message=str(exc),
            )
            _persist_service_profile_embedding_failure_record(
                conn,
                tenant_id=tenant_id,
                service_profile_id=resolved_profile_id,
                embedding_text=embedding_text,
                embedding_model=embedding_service.model,
                failure_reason=failure_reason,
                exc=exc,
            )
        logger.exception(
            "service_profile_embedding_job_failed tenant_id=%s service_profile_id=%s model=%s failure_reason=%s error_type=%s error=%s",
            tenant_id,
            resolved_profile_id,
            embedding_service.model,
            failure_reason,
            exc.__class__.__name__,
            exc,
        )
        raise

    with engine.begin() as conn:
        persisted_profile_id = _persist_service_profile_embedding(
            conn,
            tenant_id=tenant_id,
            service_profile_id=resolved_profile_id,
            embedding_text=embedding_text,
            embedding=embedding,
        )

    final_profile_id = persisted_profile_id or resolved_profile_id
    logger.info(
        "service_profile_embedding_job_completed tenant_id=%s service_profile_id=%s model=%s dimensions=%s",
        tenant_id,
        final_profile_id,
        embedding.model,
        embedding.dimensions,
    )

    _enqueue_public_ingestion_after_embedding(tenant_id, final_profile_id)


def _enqueue_public_ingestion_after_embedding(
    tenant_id: str,
    service_profile_id: str | None,
) -> None:
    if not service_profile_id:
        return

    try:
        from api.services.ingestion_service import enqueue_initial_public_ingestion_job

        ingestion_message_id = enqueue_initial_public_ingestion_job(
            tenant_id,
            service_profile_id,
        )
        logger.info(
            "initial_public_ingestion_enqueued_after_embedding tenant_id=%s service_profile_id=%s message_id=%s",
            tenant_id,
            service_profile_id,
            ingestion_message_id,
        )
    except Exception as exc:
        logger.exception(
            "initial_public_ingestion_enqueue_after_embedding_failed tenant_id=%s service_profile_id=%s error_type=%s error=%s",
            tenant_id,
            service_profile_id,
            exc.__class__.__name__,
            exc,
        )


@dramatiq.actor(queue_name=os.getenv("ARCLI_EMBEDDING_QUEUE_NAME", "embeddings"))
def mark_service_profile_embedding_dead_lettered(
    message_data: dict[str, Any],
    retry_context: dict[str, Any] | None = None,
) -> None:
    args = message_data.get("args") if isinstance(message_data, dict) else None
    if not isinstance(args, (list, tuple)) or not args:
        logger.error(
            "service_profile_embedding_dead_letter_failed failure_reason=%s message_data=%s retry_context=%s",
            "missing_original_args",
            message_data,
            retry_context,
        )
        return

    tenant_id = str(args[0])
    service_profile_id = str(args[1]) if len(args) > 1 and args[1] else None
    engine = _database_engine()
    exc = RuntimeError("Service profile embedding retries exhausted.")

    with engine.begin() as conn:
        columns = _service_profile_columns(conn)
        row = _load_service_profile(conn, tenant_id, service_profile_id, columns)
        resolved_profile_id = str(row.get("id")) if row and row.get("id") else service_profile_id
        try:
            embedding_text = _service_profile_embedding_text(row) if row else ""
        except Exception as text_exc:
            embedding_text = ""
            logger.info(
                "service_profile_embedding_dead_letter_text_unavailable tenant_id=%s service_profile_id=%s error_type=%s error=%s",
                tenant_id,
                resolved_profile_id,
                text_exc.__class__.__name__,
                text_exc,
            )
        _mark_service_profile_embedding_status(
            conn,
            tenant_id=tenant_id,
            service_profile_id=resolved_profile_id,
            status="failed",
            failure_reason="retry_exhausted",
            error_type=exc.__class__.__name__,
            error_message=str(exc),
        )
        _persist_service_profile_embedding_failure_record(
            conn,
            tenant_id=tenant_id,
            service_profile_id=resolved_profile_id,
            embedding_text=embedding_text,
            embedding_model=EMBEDDING_MODEL,
            failure_reason="retry_exhausted",
            exc=exc,
        )

    logger.error(
        "service_profile_embedding_dead_lettered tenant_id=%s service_profile_id=%s retries=%s max_retries=%s message_id=%s",
        tenant_id,
        resolved_profile_id,
        (retry_context or {}).get("retries"),
        (retry_context or {}).get("max_retries"),
        message_data.get("message_id") if isinstance(message_data, dict) else None,
    )
