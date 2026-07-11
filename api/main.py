import os
import hmac
import logging
from typing import Annotated, Literal
from urllib.parse import urlparse, urlunparse
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    message_id: str


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


class ServiceProfileEmbeddingTriggerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["queued"] = Field(default="queued")
    tenant_id: str
    service_profile_id: str | None = None
    message_id: str


app = FastAPI(
    title="Arcli Prospect Intelligence API",
    version=os.getenv("ARCLI_API_VERSION", "0.1.0"),
)


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
            "crawl_trigger_auth_unconfigured secret_configured=%s",
            False,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Crawler trigger authentication is not configured.",
        )

    token = _bearer_token(authorization)
    if not token or not hmac.compare_digest(token, expected_secret):
        logger.warning("crawl_trigger_auth_rejected token_present=%s", bool(token))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid crawler trigger credentials.",
        )


@app.get("/health", response_model=HealthResponse, include_in_schema=False)
def health_check() -> HealthResponse:
    return HealthResponse(version=os.getenv("ARCLI_RELEASE_SHA"))


@app.post(
    "/api/crawl/trigger",
    response_model=CrawlTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def trigger_crawl(
    payload: CrawlTriggerRequest,
    _: Annotated[None, Depends(verify_internal_request)],
) -> CrawlTriggerResponse:
    """
    Accept a trusted frontend handoff and enqueue the slow crawl asynchronously.
    The crawl itself must run only inside the Dramatiq worker.
    """
    from api.services.crawling import enqueue_crawl_job

    try:
        message_id = enqueue_crawl_job(payload.tenant_id, payload.website_url)
    except RuntimeError as exc:
        logger.exception(
            "crawl_job_enqueue_failed tenant_id=%s website_url=%s error_type=%s error=%s",
            payload.tenant_id,
            payload.website_url,
            exc.__class__.__name__,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Crawler queue is unavailable.",
        ) from exc

    logger.info(
        "crawl_trigger_accepted tenant_id=%s website_url=%s message_id=%s source=%s",
        payload.tenant_id,
        payload.website_url,
        message_id,
        payload.source,
    )

    return CrawlTriggerResponse(
        tenant_id=payload.tenant_id,
        website_url=payload.website_url,
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
    )
