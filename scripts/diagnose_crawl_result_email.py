"""Read-only diagnostics for crawl-result email delivery.

Run this inside the same environment as the API or worker after deployment:

    python scripts/diagnose_crawl_result_email.py --include-outbox

It intentionally does not send mail, change outbox rows, print API keys, or
print full recipient addresses. The report is designed to make a failed job
report traceable from configuration through the durable outbox.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections.abc import Mapping, Sequence
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

# Running this file directly places ``scripts`` rather than the repository root
# on sys.path. Keep it usable from a worker console and from CI.
_REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(_REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPOSITORY_ROOT))

from sqlalchemy import text

from api.services import crawl_notifications as notifications


_SENDER_EMAIL_PATTERN = re.compile(r"<?[^<>\s]+@([^<>\s]+)>?$")
_DEFAULT_PROVIDER_URL = "https://api.resend.com/emails"


def _configured_value(name: str) -> str:
    return os.getenv(name, "").strip()


def _api_key_source() -> str | None:
    if _configured_value("ARCLI_CRAWL_RESULT_EMAIL_API_KEY"):
        return "ARCLI_CRAWL_RESULT_EMAIL_API_KEY"
    if _configured_value("RESEND_API_KEY"):
        return "RESEND_API_KEY"
    return None


def _sender_domain(sender: str) -> str | None:
    match = _SENDER_EMAIL_PATTERN.search(sender.strip())
    if not match:
        return None
    return match.group(1).lower()


def _provider_details(provider_url: str) -> dict[str, str | None]:
    try:
        parsed = urlparse(provider_url)
    except ValueError:
        return {"scheme": None, "host": None}
    return {
        "scheme": parsed.scheme or None,
        "host": parsed.hostname or None,
    }


def _configuration_diagnostic() -> dict[str, Any]:
    sender = _configured_value("ARCLI_CRAWL_RESULT_EMAIL_SENDER")
    provider_url = _configured_value("ARCLI_CRAWL_RESULT_EMAIL_PROVIDER_URL")
    provider_url = provider_url or _DEFAULT_PROVIDER_URL
    mock_enabled = notifications._env_bool(
        "ARCLI_CRAWL_RESULT_EMAIL_MOCK", default=False
    )
    report: dict[str, Any] = {
        "feature_enabled": notifications.crawl_result_email_enabled(),
        "mock_enabled": mock_enabled,
        "api_key_configured": _api_key_source() is not None,
        "api_key_source": _api_key_source(),
        "sender_configured": bool(sender),
        "sender_domain": _sender_domain(sender),
        "provider": _provider_details(provider_url),
        "valid": False,
        "error_code": None,
    }
    try:
        notifications._notification_email_config()
    except notifications.NotificationConfigurationError as exc:
        report["error_code"] = exc.error_code
    else:
        report["valid"] = True
    return report


def _serialize(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _database_configured() -> bool:
    return any(
        _configured_value(name)
        for name in ("DATABASE_URL", "SUPABASE_DB_URL", "POSTGRES_URL")
    )


def _outbox_diagnostic(limit: int) -> dict[str, Any]:
    if not _database_configured():
        return {"checked": False, "reason": "database_url_missing"}

    try:
        with notifications._database_engine().connect() as conn:
            if not notifications._outbox_schema_available(conn):
                return {"checked": True, "schema_available": False}

            status_rows = conn.execute(
                text(
                    """
                    SELECT status,
                           COALESCE(error_code, 'none') AS error_code,
                           COUNT(*) AS record_count,
                           MAX(updated_at) AS last_updated_at
                      FROM public.crawl_notification_outbox
                     WHERE created_at >= NOW() - interval '30 days'
                     GROUP BY status, COALESCE(error_code, 'none')
                     ORDER BY last_updated_at DESC
                    """
                )
            ).mappings()
            recent_rows = conn.execute(
                text(
                    """
                    SELECT id::text AS id,
                           status,
                           error_code,
                           notification_type,
                           attempt_count,
                           last_attempt_at,
                           updated_at,
                           CASE
                               WHEN POSITION('@' IN recipient_email) > 0
                               THEN SPLIT_PART(LOWER(recipient_email), '@', 2)
                               ELSE NULL
                           END AS recipient_domain
                      FROM public.crawl_notification_outbox
                     ORDER BY updated_at DESC
                     LIMIT :limit
                    """
                ),
                {"limit": limit},
            ).mappings()
            return {
                "checked": True,
                "schema_available": True,
                "last_30_days_by_status": [
                    {key: _serialize(value) for key, value in dict(row).items()}
                    for row in status_rows
                ],
                "recent_records": [
                    {key: _serialize(value) for key, value in dict(row).items()}
                    for row in recent_rows
                ],
            }
    except Exception as exc:
        # Infrastructure exceptions may include database host details. Keep the
        # CLI report safe to share; the worker logs retain the full traceback.
        return {
            "checked": False,
            "reason": "database_diagnostic_unavailable",
            "error_type": exc.__class__.__name__,
        }


def _next_action(configuration: Mapping[str, Any]) -> str:
    if not configuration["feature_enabled"]:
        return "Set ARCLI_CRAWL_RESULT_EMAILS_ENABLED=true in the worker."
    if configuration["error_code"]:
        return f"Correct {configuration['error_code']} and rerun this diagnostic."
    if configuration["mock_enabled"]:
        return "Mock delivery is enabled; disable it before expecting Resend delivery."
    return "Configuration is valid; inspect recent_records for an outbox error code."


def build_diagnostic_report(*, include_outbox: bool, outbox_limit: int) -> dict[str, Any]:
    """Return a redacted configuration and optional read-only outbox report."""

    configuration = _configuration_diagnostic()
    report: dict[str, Any] = {
        "notification_configuration": configuration,
        "next_action": _next_action(configuration),
    }
    if include_outbox:
        report["outbox"] = _outbox_diagnostic(outbox_limit)
    return report


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Safely diagnose crawl-result email configuration and outbox delivery."
    )
    parser.add_argument(
        "--include-outbox",
        action="store_true",
        help="Read recent outbox statuses using the configured database connection.",
    )
    parser.add_argument(
        "--outbox-limit",
        type=int,
        default=10,
        help="Maximum recent outbox records to report (1-100; default: 10).",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Emit compact JSON.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_argument_parser().parse_args(argv)
    if not 1 <= arguments.outbox_limit <= 100:
        raise SystemExit("--outbox-limit must be between 1 and 100")
    report = build_diagnostic_report(
        include_outbox=arguments.include_outbox,
        outbox_limit=arguments.outbox_limit,
    )
    print(json.dumps(report, indent=None if arguments.compact else 2, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised through the CLI.
    raise SystemExit(main())
