"""Configuration and rollout gate for optional crawl result email delivery."""

from __future__ import annotations

import os
from urllib.parse import urlparse

from api.services.integrations.email_connector import EmailConfig


class NotificationConfigurationError(ValueError):
    """A safe, actionable configuration error for durable mail delivery."""

    def __init__(self, error_code: str) -> None:
        super().__init__(error_code)
        self.error_code = error_code


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"", "0", "false", "no", "off"}


def env_int(name: str, default: int, *, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


def crawl_result_email_enabled() -> bool:
    """Keep outbound mail dark until a verified sender is explicitly enabled."""

    return env_bool("ARCLI_CRAWL_RESULT_EMAILS_ENABLED", default=False)


def notification_email_config() -> EmailConfig:
    mock = env_bool("ARCLI_CRAWL_RESULT_EMAIL_MOCK", default=False)
    api_key = (
        os.getenv("ARCLI_CRAWL_RESULT_EMAIL_API_KEY")
        or os.getenv("RESEND_API_KEY")
        or ""
    ).strip()
    sender = os.getenv("ARCLI_CRAWL_RESULT_EMAIL_SENDER", "").strip()
    provider_url = os.getenv(
        "ARCLI_CRAWL_RESULT_EMAIL_PROVIDER_URL", "https://api.resend.com/emails"
    ).strip()

    if not api_key and not mock:
        raise NotificationConfigurationError("configuration_api_key_missing")
    if not sender:
        raise NotificationConfigurationError("configuration_sender_missing")
    parsed_provider_url = urlparse(provider_url)
    if parsed_provider_url.scheme not in {"https", "http"} or not parsed_provider_url.netloc:
        raise NotificationConfigurationError("configuration_provider_url_invalid")

    try:
        return EmailConfig(
            provider_url=provider_url,
            # Mock delivery intentionally works without a provider key so a
            # staging smoke test cannot require production mail credentials.
            api_key=api_key or "mock",
            sender=sender,
            timeout_connect=float(
                env_int("ARCLI_CRAWL_RESULT_EMAIL_CONNECT_TIMEOUT_SECONDS", 5, minimum=1)
            ),
            timeout_read=float(
                env_int("ARCLI_CRAWL_RESULT_EMAIL_READ_TIMEOUT_SECONDS", 10, minimum=1)
            ),
            timeout_write=float(
                env_int("ARCLI_CRAWL_RESULT_EMAIL_WRITE_TIMEOUT_SECONDS", 5, minimum=1)
            ),
            timeout_pool=float(
                env_int("ARCLI_CRAWL_RESULT_EMAIL_POOL_TIMEOUT_SECONDS", 5, minimum=1)
            ),
            mock=mock,
        )
    except Exception as exc:
        raise NotificationConfigurationError("configuration_sender_invalid") from exc
