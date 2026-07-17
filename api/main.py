import os
import hmac
import logging
import time
from functools import lru_cache
from typing import Annotated, Literal
from urllib.parse import urlparse, urlunparse
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["ok"] = Field(default="ok")
    service: str = Field(default="arcli-api")
    version: str | None = Field(default=None)


class CrawlTriggerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    tenant_id: str = Field(min_length=1)
    website_url: str = Field(min_length=1)
    requested_by: str | None = Field(default=None)
    source: str | None = Field(default=None)

    @field_validator("tenant_id")
    @classmethod
    def validate_tenant_id(cls, value: str) -> str:
        try:
            return str(UUID(value))
        except (TypeError, ValueError) as exc:
            raise ValueError("tenant_id must be a valid UUID") from exc

    @field_validator("website_url")
    @classmethod
    def normalize_website_url(cls, value: str) -> str:
        candidate = value.strip()
        if "://" not in candidate:
            candidate = f"https://{candidate}"

        parsed = urlparse(candidate)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("website_url must be a valid HTTP(S) URL")

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


class CrawlTriggerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["queued"] = Field(default="queued")
    tenant_id: str
    website_url: str
    job_id: str
    message_id: str


class IdempotencyKeyHeader(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    value: str = Field(min_length=1, max_length=128)


class ServiceProfileEmbeddingTriggerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    tenant_id: str = Field(min_length=1)
    service_profile_id: str | None = Field(default=None)
    requested_by: str | None = Field(default=None)
    source: str | None = Field(default=None)

    @field_validator("tenant_id")
    @classmethod
    def validate_tenant_id(cls, value: str) -> str:
        try:
            return str(UUID(value))
        except (TypeError, ValueError) as exc:
            raise ValueError("tenant_id must be a valid UUID") from exc

    @field_validator("service_profile_id")
    @classmethod
    def validate_service_profile_id(cls, value: str | None) -> str | None:
        if not value:
            return None
        try:
            return str(UUID(value))
        except (TypeError, ValueError) as exc:
            raise ValueError("service_profile_id must be a valid UUID") from exc


class ServiceProfileEmbeddingTriggerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["queued"] = Field(default="queued")
    tenant_id: str
    service_profile_id: str | None = None
    message_id: str


class PublicIngestionTriggerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    tenant_id: str = Field(min_length=1)
    service_profile_id: str | None = Field(default=None)
    requested_by: str | None = Field(default=None)
    source: str | None = Field(default=None)
    phase: str | None = Field(default=None)

    @field_validator("tenant_id")
    @classmethod
    def validate_tenant_id(cls, value: str) -> str:
        try:
            return str(UUID(value))
        except (TypeError, ValueError) as exc:
            raise ValueError("tenant_id must be a valid UUID") from exc

    @field_validator("service_profile_id")
    @classmethod
    def validate_service_profile_id(cls, value: str | None) -> str | None:
        if not value:
            return None
        try:
            return str(UUID(value))
        except (TypeError, ValueError) as exc:
            raise ValueError("service_profile_id must be a valid UUID") from exc


class PublicIngestionTriggerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["queued"] = Field(default="queued")
    tenant_id: str
    service_profile_id: str | None = None
    message_id: str


class WorkspaceBrainGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    tenant_id: str = Field(min_length=1)
    url: str | None = Field(default=None)
    website_url: str | None = Field(default=None)
    requested_by: str | None = Field(default=None)
    source: str | None = Field(default=None)
    idempotency_key: str | None = Field(default=None, max_length=128)

    @field_validator("tenant_id")
    @classmethod
    def validate_tenant_id(cls, value: str) -> str:
        try:
            return str(UUID(value))
        except (TypeError, ValueError) as exc:
            raise ValueError("tenant_id must be a valid UUID") from exc

    @field_validator("url", "website_url")
    @classmethod
    def normalize_optional_url(cls, value: str | None) -> str | None:
        if value is None:
            return None

        candidate = value.strip()
        if not candidate:
            return None
        if "://" not in candidate:
            candidate = f"https://{candidate}"

        parsed = urlparse(candidate)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("website_url must be a valid HTTP(S) URL")

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

    @model_validator(mode="after")
    def require_website_url(self) -> "WorkspaceBrainGenerateRequest":
        if not self.website_url and not self.url:
            raise ValueError("website_url is required")
        return self

    @property
    def resolved_website_url(self) -> str:
        return self.website_url or self.url or ""


class WorkspaceBrainGenerateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["queued"] = Field(default="queued")
    tenant_id: str
    website_url: str
    message_id: str
    idempotency_key: str | None = None


app = FastAPI(
    title="Arcli Prospect Intelligence API",
    version=os.getenv("ARCLI_API_VERSION", "0.1.0"),
)

CRAWL_TRIGGER_DEBUG_PATHS = {"/api/crawl/trigger", "/crawl/trigger"}


@app.middleware("http")
async def log_crawl_trigger_route_miss(request: Request, call_next):
    response = await call_next(request)

    if (
        request.url.path in CRAWL_TRIGGER_DEBUG_PATHS
        and response.status_code in {404, 405}
    ):
        crawl_routes = sorted(
            route.path
            for route in app.routes
            if "crawl" in getattr(route, "path", "")
        )
        logger.warning(
            "crawl_trigger_route_diagnostic method=%s path=%s status=%s root_path=%s crawl_routes=%s authorization_present=%s idempotency_key_present=%s user_agent=%s",
            request.method,
            request.url.path,
            response.status_code,
            request.scope.get("root_path") or "",
            crawl_routes,
            bool(request.headers.get("authorization")),
            bool(request.headers.get("idempotency-key")),
            request.headers.get("user-agent"),
        )
        response.headers["x-arcli-route-diagnostic"] = "crawl-trigger-route-miss"

    return response


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    return token.strip()


def verify_internal_request(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected_secret = os.getenv("INTERNAL_WORKER_SECRET", "").strip()
    if not expected_secret:
        logger.error(
            "internal_request_auth_unconfigured secret_configured=%s",
            False,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal worker authentication is not configured.",
        )

    token = _bearer_token(authorization)
    if not token or not hmac.compare_digest(token, expected_secret):
        logger.warning("internal_request_auth_rejected token_present=%s", bool(token))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal worker credentials.",
        )


def require_idempotency_key(
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str:
    try:
        parsed = IdempotencyKeyHeader.model_validate({"value": idempotency_key})
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header is required.",
        ) from exc

    return parsed.value


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


def _validate_internal_tenant_scope(
    *,
    tenant_id: str,
    service_profile_id: str | None = None,
) -> None:
    try:
        engine = _database_engine()
        with engine.begin() as conn:
            tenant_row = conn.execute(
                text(
                    """
                    SELECT tenant_id, status, provisioning_status
                      FROM public.tenants
                     WHERE tenant_id = :tenant_id
                     LIMIT 1
                    """
                ),
                {"tenant_id": tenant_id},
            ).mappings().first()

            if not tenant_row:
                logger.warning(
                    "internal_worker_trigger_rejected tenant_id=%s service_profile_id=%s rejection_reason=%s",
                    tenant_id,
                    service_profile_id,
                    "tenant_not_found",
                )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tenant not found.",
                )

            tenant_status = str(tenant_row.get("status") or "").lower()
            if tenant_status in {"deleted", "suspended"}:
                logger.warning(
                    "internal_worker_trigger_rejected tenant_id=%s service_profile_id=%s rejection_reason=%s tenant_status=%s provisioning_status=%s",
                    tenant_id,
                    service_profile_id,
                    "tenant_not_operational",
                    tenant_status,
                    tenant_row.get("provisioning_status"),
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tenant is not operational.",
                )

            if service_profile_id:
                profile_exists = conn.execute(
                    text(
                        """
                        SELECT EXISTS (
                            SELECT 1
                              FROM public.service_profiles
                             WHERE tenant_id = :tenant_id
                               AND id = CAST(:service_profile_id AS uuid)
                        )
                        """
                    ),
                    {
                        "tenant_id": tenant_id,
                        "service_profile_id": service_profile_id,
                    },
                ).scalar_one()
                if not profile_exists:
                    logger.warning(
                        "internal_worker_trigger_rejected tenant_id=%s service_profile_id=%s rejection_reason=%s",
                        tenant_id,
                        service_profile_id,
                        "service_profile_not_in_tenant",
                    )
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Service profile not found for tenant.",
                    )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "internal_worker_trigger_scope_check_failed tenant_id=%s service_profile_id=%s error_type=%s error=%s",
            tenant_id,
            service_profile_id,
            exc.__class__.__name__,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Tenant scope validation is unavailable.",
        ) from exc


@app.get("/health", response_model=HealthResponse, include_in_schema=False)
def health_check() -> HealthResponse:
    return HealthResponse(version=os.getenv("ARCLI_RELEASE_SHA"))


@app.post(
    "/api/settings/workspace/brain/generate",
    response_model=WorkspaceBrainGenerateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_workspace_brain(
    payload: WorkspaceBrainGenerateRequest,
    _: Annotated[None, Depends(verify_internal_request)],
) -> WorkspaceBrainGenerateResponse:
    """
    Accept a trusted frontend handoff and enqueue workspace brain generation.
    Firecrawl and extraction must run only inside the Dramatiq worker.
    """
    from api.services.profile_extraction import enqueue_workspace_brain_generation_job

    _validate_internal_tenant_scope(tenant_id=payload.tenant_id)

    try:
        message_id = enqueue_workspace_brain_generation_job(
            tenant_id=payload.tenant_id,
            website_url=payload.resolved_website_url,
            idempotency_key=payload.idempotency_key,
        )
    except RuntimeError as exc:
        logger.exception(
            "workspace_brain_generation_enqueue_failed tenant_id=%s requested_by=%s website_url=%s source=%s error_type=%s error=%s",
            payload.tenant_id,
            payload.requested_by,
            payload.resolved_website_url,
            payload.source,
            exc.__class__.__name__,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Workspace brain generation queue is unavailable.",
        ) from exc

    logger.info(
        "workspace_brain_generation_queued tenant_id=%s requested_by=%s website_url=%s source=%s idempotency_key_present=%s message_id=%s",
        payload.tenant_id,
        payload.requested_by,
        payload.resolved_website_url,
        payload.source,
        bool(payload.idempotency_key),
        message_id,
    )

    return WorkspaceBrainGenerateResponse(
        tenant_id=payload.tenant_id,
        website_url=payload.resolved_website_url,
        message_id=message_id,
        idempotency_key=payload.idempotency_key,
    )


@app.post(
    "/crawl/trigger",
    response_model=CrawlTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@app.post(
    "/api/crawl/trigger",
    response_model=CrawlTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def trigger_crawl(
    payload: CrawlTriggerRequest,
    _: Annotated[None, Depends(verify_internal_request)],
    job_id: Annotated[str, Depends(require_idempotency_key)],
) -> CrawlTriggerResponse:
    """
    Accept a trusted frontend handoff and enqueue the slow crawl asynchronously.
    The crawl itself must run only inside the Dramatiq worker.
    """
    from api.services.crawling import enqueue_crawl_job

    started_at = time.monotonic()
    _validate_internal_tenant_scope(tenant_id=payload.tenant_id)

    logger.info(
        "crawl_job_trigger_received tenant_id=%s job_id=%s website_url=%s source=%s requested_by=%s",
        payload.tenant_id,
        job_id,
        payload.website_url,
        payload.source,
        payload.requested_by,
    )

    try:
        message_id = enqueue_crawl_job(
            tenant_id=payload.tenant_id,
            website_url=payload.website_url,
            job_id=job_id,
        )
    except Exception as exc:
        logger.exception(
            "crawl_job_enqueue_failed tenant_id=%s job_id=%s website_url=%s elapsed_ms=%s error_type=%s error=%s",
            payload.tenant_id,
            job_id,
            payload.website_url,
            int((time.monotonic() - started_at) * 1000),
            exc.__class__.__name__,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Crawler queue is unavailable.",
        ) from exc

    logger.info(
        "crawl_job_enqueued tenant_id=%s job_id=%s website_url=%s message_id=%s source=%s requested_by=%s elapsed_ms=%s",
        payload.tenant_id,
        job_id,
        payload.website_url,
        message_id,
        payload.source,
        payload.requested_by,
        int((time.monotonic() - started_at) * 1000),
    )

    return CrawlTriggerResponse(
        tenant_id=payload.tenant_id,
        website_url=payload.website_url,
        job_id=job_id,
        message_id=message_id,
    )


@app.post(
    "/api/service-profile/embed/trigger",
    response_model=ServiceProfileEmbeddingTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def trigger_service_profile_embedding(
    payload: ServiceProfileEmbeddingTriggerRequest,
    _: Annotated[None, Depends(verify_internal_request)],
) -> ServiceProfileEmbeddingTriggerResponse:
    """
    Accept a trusted frontend handoff and enqueue slow profile embedding work.
    """
    from api.services.embeddings import enqueue_service_profile_embedding_job

    _validate_internal_tenant_scope(
        tenant_id=payload.tenant_id,
        service_profile_id=payload.service_profile_id,
    )

    try:
        message_id = enqueue_service_profile_embedding_job(
            payload.tenant_id,
            payload.service_profile_id,
        )
    except RuntimeError as exc:
        logger.exception(
            "service_profile_embedding_enqueue_failed tenant_id=%s service_profile_id=%s error_type=%s error=%s",
            payload.tenant_id,
            payload.service_profile_id,
            exc.__class__.__name__,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Embedding queue is unavailable.",
        ) from exc

    logger.info(
        "service_profile_embedding_trigger_accepted tenant_id=%s service_profile_id=%s message_id=%s source=%s",
        payload.tenant_id,
        payload.service_profile_id,
        message_id,
        payload.source,
    )

    return ServiceProfileEmbeddingTriggerResponse(
        tenant_id=payload.tenant_id,
        service_profile_id=payload.service_profile_id,
        message_id=message_id,
    )


@app.post(
    "/api/public-ingestion/trigger",
    response_model=PublicIngestionTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@app.post(
    "/api/matching/trigger",
    response_model=PublicIngestionTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def trigger_public_ingestion(
    payload: PublicIngestionTriggerRequest,
    _: Annotated[None, Depends(verify_internal_request)],
) -> PublicIngestionTriggerResponse:
    """
    Queue the native public/social ingestion, embedding, matching, and verifier pass.
    """
    from api.services.ingestion_service import enqueue_initial_public_ingestion_job

    _validate_internal_tenant_scope(
        tenant_id=payload.tenant_id,
        service_profile_id=payload.service_profile_id,
    )

    try:
        message_id = enqueue_initial_public_ingestion_job(
            payload.tenant_id,
            payload.service_profile_id,
        )
    except RuntimeError as exc:
        logger.exception(
            "public_ingestion_enqueue_failed tenant_id=%s service_profile_id=%s error_type=%s error=%s",
            payload.tenant_id,
            payload.service_profile_id,
            exc.__class__.__name__,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Public ingestion queue is unavailable.",
        ) from exc

    logger.info(
        "public_ingestion_trigger_accepted tenant_id=%s service_profile_id=%s message_id=%s source=%s phase=%s",
        payload.tenant_id,
        payload.service_profile_id,
        message_id,
        payload.source,
        payload.phase,
    )

    return PublicIngestionTriggerResponse(
        tenant_id=payload.tenant_id,
        service_profile_id=payload.service_profile_id,
        message_id=message_id,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
    )
