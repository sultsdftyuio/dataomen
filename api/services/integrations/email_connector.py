import hashlib
import logging
import re
from enum import Enum
from typing import Any, Dict, Optional

import httpx
from pydantic import BaseModel, EmailStr, Field, field_validator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class EmailConfig(BaseModel):
    """
    Injectable configuration. No hardcoded secrets or sender addresses.

    IMPORTANT: This connector manages an httpx.AsyncClient lifecycle.
    Always use `async with EmailConnector(config) as connector:` to ensure
    connections are properly closed.
    """
    provider_url: str = "https://api.resend.com/emails"
    api_key: str = Field(..., min_length=1)
    sender: str = Field(..., min_length=1)  # e.g. "Arcli Recovery <recovery@yourdomain.com>"

    # Granular timeout control (seconds)
    timeout_connect: float = Field(default=5.0, gt=0)
    timeout_read: float = Field(default=10.0, gt=0)
    timeout_write: float = Field(default=5.0, gt=0)
    timeout_pool: float = Field(default=5.0, gt=0)

    # Explicit toggle for mock/dry-run mode so production behavior is never hidden accidentally
    mock: bool = False

    @field_validator("sender")
    @classmethod
    def _sender_must_contain_email(cls, v: str) -> str:
        """
        Validates that the sender string contains a valid email-like address.
        Accepts both 'email@example.com' and 'Name <email@example.com>' formats.
        """
        if not v or not v.strip():
            raise ValueError("sender cannot be empty")
        # Look for <email> or bare email
        if re.search(r"[^<<>\s]+@[^<<>\s]+\.[^<<>\s]+", v):
            return v
        raise ValueError(
            "sender must contain a valid email address (e.g. 'Name <user@example.com>')"
        )


# ---------------------------------------------------------------------------
# Payload & Response Models
# ---------------------------------------------------------------------------

class EmailPayload(BaseModel):
    to_email: EmailStr
    subject: str = Field(..., min_length=1, max_length=255)
    html_body: str = Field(..., min_length=1)
    text_body: Optional[str] = None
    reply_to: Optional[EmailStr] = None


class ProviderResponse(BaseModel):
    provider_id: str
    status: str = "sent"

    @field_validator("provider_id")
    @classmethod
    def _provider_id_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("provider_id cannot be empty")
        return v


# ---------------------------------------------------------------------------
# Exception Hierarchy
# ---------------------------------------------------------------------------

class FailureType(str, Enum):
    RETRYABLE = "retryable"
    PERMANENT = "permanent"


class EmailProviderError(Exception):
    """
    Explicit failure carrier.
    Callers should inspect `failure_type` with `is` (e.g. `exc.failure_type is FailureType.RETRYABLE`)
    to decide whether to retry or dead-letter.
    """
    def __init__(
        self,
        message: str,
        failure_type: FailureType,
        status_code: Optional[int] = None,
    ):
        super().__init__(message)
        self.failure_type = failure_type
        self.status_code = status_code


# ---------------------------------------------------------------------------
# Connector
# ---------------------------------------------------------------------------

class EmailConnector:
    """
    Async HTTP wrapper for the external email delivery provider.
    Adheres to Arcli Constitution: "Workers fail explicitly."

    IMPORTANT: Always use as an async context manager to ensure the
    underlying httpx.AsyncClient is properly closed:

        async with EmailConnector(config) as connector:
            await connector.send(payload, idempotency_key)

    FUTURE: For high-volume SaaS worker pools, consider adding connection limits:
        httpx.AsyncClient(
            timeout=self._timeout,
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )
    """

    # 429 + classic server-side outages → safe to retry with backoff
    RETRYABLE_STATUS_CODES: frozenset[int] = frozenset({429, 500, 502, 503, 504})
    # Client errors that will not succeed on retry
    PERMANENT_STATUS_CODES: frozenset[int] = frozenset({400, 401, 403, 404, 422})

    def __init__(self, config: EmailConfig):
        self.config = config
        self._timeout = httpx.Timeout(
            connect=config.timeout_connect,
            read=config.timeout_read,
            write=config.timeout_write,
            pool=config.timeout_pool,
        )
        self._client: Optional[httpx.AsyncClient] = None

    # -- lifecycle -----------------------------------------------------------

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "EmailConnector":
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()

    # -- utilities -----------------------------------------------------------

    @staticmethod
    def _mask_email(email: str) -> str:
        """Mask PII: hash the local part, keep the domain for debugging."""
        if "@" not in email:
            return "***"
        local, domain = email.rsplit("@", 1)
        hashed_local = hashlib.sha256(local.encode()).hexdigest()[:8]
        return f"{hashed_local}...@{domain}"

    # -- core method ---------------------------------------------------------

    async def send(self, payload: EmailPayload, idempotency_key: str) -> ProviderResponse:
        """
        Dispatches the async HTTP request to the external provider.
        Uses the provider's idempotency header to prevent duplicate sends.
        """
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        }

        data: Dict[str, Any] = {
            "from": self.config.sender,
            "to": str(payload.to_email),
            "subject": payload.subject,
            "html": payload.html_body,
        }

        if payload.text_body:
            data["text"] = payload.text_body
        if payload.reply_to:
            data["reply_to"] = str(payload.reply_to)

        masked_to = self._mask_email(str(payload.to_email))

        if self.config.mock:
            logger.info(
                "provider_dispatch_mock idempotency_key=%s to=%s",
                idempotency_key,
                masked_to,
            )
            return ProviderResponse(provider_id=f"evt_{idempotency_key}", status="sent")

        client = await self._get_client()
        try:
            response = await client.post(
                self.config.provider_url, json=data, headers=headers
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code

            # Log sanitized details separately; never leak raw response body into exception messages
            if status_code in self.RETRYABLE_STATUS_CODES:
                logger.error(
                    "email_provider_retryable status=%s idempotency_key=%s to=%s",
                    status_code,
                    idempotency_key,
                    masked_to,
                )
                raise EmailProviderError(
                    f"Provider returned retryable status {status_code}",
                    FailureType.RETRYABLE,
                    status_code=status_code,
                ) from e

            if status_code in self.PERMANENT_STATUS_CODES:
                logger.error(
                    "email_provider_permanent status=%s idempotency_key=%s to=%s",
                    status_code,
                    idempotency_key,
                    masked_to,
                )
                raise EmailProviderError(
                    f"Provider returned permanent status {status_code}",
                    FailureType.PERMANENT,
                    status_code=status_code,
                ) from e

            # Unknown status code: conservative default is retryable
            logger.error(
                "email_provider_unknown status=%s idempotency_key=%s to=%s",
                status_code,
                idempotency_key,
                masked_to,
            )
            raise EmailProviderError(
                f"Provider returned unknown status {status_code}",
                FailureType.RETRYABLE,
                status_code=status_code,
            ) from e

        except httpx.RequestError as e:
            # Log full exception details for debugging; never expose them in the
            # exception message to avoid leaking hostnames, IPs, or SSL internals.
            logger.error(
                "email_network_failure detail=%s idempotency_key=%s to=%s",
                str(e),
                idempotency_key,
                masked_to,
            )
            raise EmailProviderError(
                "Network failure",
                FailureType.RETRYABLE,
            ) from e

        # Validate provider response schema instead of blindly calling .get("id")
        try:
            json_data = response.json()
        except Exception as e:
            logger.error(
                "email_response_parse_failure detail=%s idempotency_key=%s to=%s",
                str(e),
                idempotency_key,
                masked_to,
            )
            raise EmailProviderError(
                f"Failed to parse provider response: {str(e)}",
                FailureType.RETRYABLE,
            ) from e

        try:
            validated = ProviderResponse.model_validate({
                "provider_id": json_data.get("id"),
                "status": "sent",
            })
        except Exception as e:
            # Log only keys to avoid leaking PII from the full JSON body
            logger.error(
                "email_response_missing_id keys=%s idempotency_key=%s to=%s",
                list(json_data.keys()),
                idempotency_key,
                masked_to,
            )
            raise EmailProviderError(
                f"Provider response missing or invalid 'id' field: {str(e)}",
                FailureType.RETRYABLE,
            ) from e

        logger.info(
            "provider_dispatch_success provider_id=%s idempotency_key=%s to=%s",
            validated.provider_id,
            idempotency_key,
            masked_to,
        )

        return validated