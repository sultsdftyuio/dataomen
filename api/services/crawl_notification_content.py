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
    source_posts = _non_negative_int(result_summary.get("source_posts_checked"))
    dashboard_url = _dashboard_url()
    safe_dashboard_url = html.escape(dashboard_url, quote=True)

    if notification_type == _CRAWL_COMPLETED:
        subject = f"Arcli refresh complete for {host}"
        text_body = (
            f"Arcli finished refreshing {host}. We processed {pages} website "
            f"{'page' if pages == 1 else 'pages'}. Lead discovery is available "
            f"on Pro. View your workspace: {dashboard_url}"
        )
        html_body = (
            f"<p>Arcli finished refreshing <strong>{safe_host}</strong>.</p>"
            f"<p>We processed <strong>{pages}</strong> website "
            f"{'page' if pages == 1 else 'pages'}.</p>"
            "<p>Lead discovery is available on Pro.</p>"
            f'<p><a href="{safe_dashboard_url}">Open your workspace</a></p>'
        )
        return subject, text_body, html_body

    if notification_type == _CRAWL_FAILED:
        subject = f"Arcli could not finish refreshing {host}"
        text_body = (
            f"Arcli could not finish refreshing {host} after its automatic "
            f"retries. Your previous workspace results remain unchanged. "
            f"Open your workspace: {dashboard_url}"
        )
        html_body = (
            f"<p>Arcli could not finish refreshing <strong>{safe_host}</strong> "
            "after its automatic retries.</p>"
            "<p>Your previous workspace results remain unchanged.</p>"
            f'<p><a href="{safe_dashboard_url}">Open your workspace</a></p>'
        )
        return subject, text_body, html_body

    if ready > 0:
        subject = f"{ready} new lead{'s' if ready != 1 else ''} ready in Arcli"
        result_line = (
            f"{ready} lead{' is' if ready == 1 else 's are'} ready for your review."
        )
    else:
        subject = f"Arcli discovery refresh complete for {host}"
        result_line = "No new leads are ready for review in this refresh."

    completion_note = (
        "Discovery finished with the available sources."
        if notification_type == _DISCOVERY_PARTIAL
        else "Discovery finished successfully."
    )
    source_line = (
        f" We checked {source_posts} new public conversation"
        f"{'s' if source_posts != 1 else ''}."
        if source_posts
        else ""
    )
    text_body = (
        f"Arcli finished refreshing {host}. {completion_note} {result_line}"
        f"{source_line} Open your workspace: {dashboard_url}"
    )
    html_body = (
        f"<p>Arcli finished refreshing <strong>{safe_host}</strong>.</p>"
        f"<p>{html.escape(completion_note)} {html.escape(result_line)}"
        + (
            f" We checked <strong>{source_posts}</strong> new public conversation"
            f"{'s' if source_posts != 1 else ''}."
            if source_posts
            else ""
        )
        + f'</p><p><a href="{safe_dashboard_url}">Review your workspace</a></p>'
    )
    return subject, text_body, html_body
