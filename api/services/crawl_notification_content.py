"""Safe, aggregate-only content for website-refresh result emails."""

from __future__ import annotations

import html
import os
import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse


_HOST_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$")
_CRAWL_COMPLETED = "crawl_completed"
_DISCOVERY_COMPLETED = "discovery_completed"
_DISCOVERY_PARTIAL = "discovery_partial"
_CRAWL_FAILED = "crawl_failed"


def _non_negative_int(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _safe_display_host(value: Any) -> str:
    candidate = str(value or "").strip().lower()
    if _HOST_PATTERN.fullmatch(candidate):
        return candidate
    return "your website"


def _dashboard_url() -> str:
    configured = os.getenv("ARCLI_DASHBOARD_URL", "https://arcli.tech/dashboard").strip()
    parsed = urlparse(configured)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        return "https://arcli.tech/dashboard"
    return configured.rstrip("/")


def _with_preferences_link(
    subject: str, text_body: str, html_body: str, dashboard_url: str
) -> tuple[str, str, str]:
    settings_url = urlparse(dashboard_url)._replace(
        path="/settings", params="", query="", fragment="result-emails"
    ).geturl()
    safe_settings_url = html.escape(settings_url, quote=True)
    return (
        subject,
        f"{text_body}\n\nManage optional result emails: {settings_url}",
        html_body
        + f'<p><a href="{safe_settings_url}">Manage optional result emails</a></p>',
    )


def build_crawl_result_email(
    *,
    notification_type: str,
    result_summary: Mapping[str, Any],
) -> tuple[str, str, str]:
    """Return subject, plain text, and escaped HTML without lead identities."""

    host = _safe_display_host(result_summary.get("website_host"))
    safe_host = html.escape(host, quote=True)
    pages = _non_negative_int(result_summary.get("pages_crawled"))
    ready = _non_negative_int(result_summary.get("ready_for_review"))
    dashboard_url = _dashboard_url()
    safe_dashboard_url = html.escape(dashboard_url, quote=True)

    if notification_type == _CRAWL_COMPLETED:
        subject = f"Your Arcli website brief is ready for {host}"
        text_body = (
            f"Arcli prepared a website brief for {host} from {pages} website "
            f"{'page' if pages == 1 else 'pages'}. Review the audience and problem "
            f"criteria in your workspace. This message does not mean public "
            f"conversations were searched. Open your workspace: {dashboard_url}"
        )
        html_body = (
            f"<p>Arcli prepared a website brief for <strong>{safe_host}</strong> from "
            f"<strong>{pages}</strong> website "
            f"{'page' if pages == 1 else 'pages'}.</p>"
            "<p>Review the audience and problem criteria in your workspace. "
            "This message does not mean public conversations were searched.</p>"
            f'<p><a href="{safe_dashboard_url}">Open your workspace</a></p>'
        )
        return _with_preferences_link(subject, text_body, html_body, dashboard_url)

    if notification_type == _CRAWL_FAILED:
        subject = f"Arcli could not finish refreshing {host}"
        text_body = (
            f"Arcli could not finish refreshing {host} after its automatic "
            f"retries. Check the current website brief and next steps in your "
            f"workspace: {dashboard_url}"
        )
        html_body = (
            f"<p>Arcli could not finish refreshing <strong>{safe_host}</strong> "
            "after its automatic retries.</p>"
            f'<p><a href="{safe_dashboard_url}">Check your website brief and next steps</a></p>'
        )
        return _with_preferences_link(subject, text_body, html_body, dashboard_url)

    if notification_type not in {_DISCOVERY_COMPLETED, _DISCOVERY_PARTIAL}:
        raise ValueError("Unsupported crawl result notification type.")

    if ready > 0:
        subject = f"Arcli scan update: {ready} signal{'s' if ready != 1 else ''} to review"
        result_line = (
            f"The run reported {ready} conversation signal{'s' if ready != 1 else ''} "
            "ready for review. Open the workspace to confirm the current queue."
        )
    else:
        subject = f"Arcli scan update for {host}"
        result_line = (
            "No conversation signals were recorded as ready for review at this "
            "checkpoint. This is not an estimate of market demand."
        )

    completion_note = (
        "The latest public-source search had incomplete coverage or reached its time limit. Candidate checks may continue."
        if notification_type == _DISCOVERY_PARTIAL
        else "The latest public-source search reached its reporting checkpoint. Candidate checks may continue."
    )
    text_body = (
        f"Arcli scanned public sources for {host}. {completion_note} {result_line} "
        f"Open your workspace: {dashboard_url}"
    )
    html_body = (
        f"<p>Arcli scanned public sources for <strong>{safe_host}</strong>.</p>"
        f"<p>{html.escape(completion_note)} {html.escape(result_line)}</p>"
        f'<p><a href="{safe_dashboard_url}">Review your workspace</a></p>'
    )
    return _with_preferences_link(subject, text_body, html_body, dashboard_url)
