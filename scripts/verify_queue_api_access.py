#!/usr/bin/env python3
"""
Read-only verifier for Arcli Customer Operations Queue API/Supabase access.

The script mirrors /dashboard/queue data access:
  - vw_customer_operations_metrics for global queue metrics
  - vw_customer_operations for paginated customer records

It never prints the provided API key. Supply credentials through environment
variables or CLI flags.

Examples:
  ARCLI_API_KEY="..." NEXT_PUBLIC_SUPABASE_URL="https://xyz.supabase.co" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="..." python scripts/verify_queue_api_access.py

  python scripts/verify_queue_api_access.py \
    --api-key "..." \
    --supabase-url "https://xyz.supabase.co" \
    --supabase-apikey "..." \
    --api-base-url "https://api.arcli.tech" \
    --tab critical \
    --limit 50
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any


METRIC_FIELDS = [
    "tenant_id",
    "total_customers",
    "at_risk_count",
    "critical_count",
    "pending_count",
    "dead_letter_count",
]

QUEUE_FIELDS = [
    "tenant_id",
    "id",
    "customer_id",
    "name",
    "email",
    "risk_score",
    "signal_type",
    "signal",
    "state",
    "next_action_time",
    "assigned_to_name",
]

ALLOWED_STATES = {
    "healthy",
    "pending",
    "processing",
    "cooldown",
    "suppressed",
    "failed",
    "dead_lettered",
    "completed",
}

ALLOWED_SIGNAL_TYPES = {"billing", "cancellation", "activity"}


@dataclass
class HttpResult:
    ok: bool
    status: int
    url: str
    data: Any
    text: str
    headers: dict[str, str]
    error: str | None = None


def first_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return None


def normalize_base_url(value: str) -> str:
    return value.rstrip("/")


def normalize_supabase_rest_url(value: str) -> str:
    base = normalize_base_url(value)
    if base.endswith("/rest/v1"):
        return base
    return f"{base}/rest/v1"


def make_url(base: str, resource: str, params: dict[str, Any] | None = None) -> str:
    path = f"{base.rstrip('/')}/{resource.lstrip('/')}"
    if not params:
        return path
    query = urllib.parse.urlencode(params, doseq=True)
    return f"{path}?{query}"


def parse_json(text: str) -> Any:
    if not text:
        return None
    return json.loads(text, parse_float=Decimal, parse_int=Decimal)


def http_json(
    method: str,
    url: str,
    headers: dict[str, str],
    *,
    timeout: float,
) -> HttpResult:
    request = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            data = parse_json(body) if body else None
            return HttpResult(
                ok=200 <= response.status < 300,
                status=response.status,
                url=url,
                data=data,
                text=body,
                headers=dict(response.headers.items()),
            )
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            data = parse_json(body) if body else None
        except json.JSONDecodeError:
            data = None
        return HttpResult(
            ok=False,
            status=exc.code,
            url=url,
            data=data,
            text=body,
            headers=dict(exc.headers.items()) if exc.headers else {},
            error=f"HTTP {exc.code}",
        )
    except urllib.error.URLError as exc:
        return HttpResult(
            ok=False,
            status=0,
            url=url,
            data=None,
            text="",
            headers={},
            error=str(exc.reason),
        )


def backend_headers(api_key: str, auth_style: str) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if auth_style in {"bearer", "both"}:
        headers["Authorization"] = f"Bearer {api_key}"
    if auth_style in {"x-api-key", "both"}:
        headers["x-api-key"] = api_key
    return headers


def supabase_headers(api_key: str, supabase_apikey: str | None, auth_style: str) -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "apikey": supabase_apikey or api_key,
    }
    if auth_style in {"bearer", "both"}:
        headers["Authorization"] = f"Bearer {api_key}"
    if auth_style in {"x-api-key", "both"}:
        headers["x-api-key"] = api_key
    return headers


def mask_key(api_key: str) -> str:
    if api_key.startswith("arcli_live_") or api_key.startswith("arcli_test_"):
        parts = api_key.split("_")
        if len(parts) >= 4:
            return f"{parts[0]}_{parts[1]}_{parts[2]}_..."
    if api_key.startswith("eyJ"):
        return f"jwt:{api_key[:10]}..."
    return f"{api_key[:6]}..." if len(api_key) > 6 else "<redacted>"


def concise_error(result: HttpResult) -> str:
    if result.data and isinstance(result.data, dict):
        for key in ("message", "msg", "error", "detail", "hint"):
            value = result.data.get(key)
            if value:
                return str(value)
    if result.text:
        return result.text[:300].replace("\n", " ")
    return result.error or "request failed"


def status_label(status: int) -> str:
    if status == 401:
        return "401 Unauthorized"
    if status == 403:
        return "403 Forbidden"
    if status == 0:
        return "Network/connection failure"
    return f"HTTP {status}"


def to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def decimal_text(value: Any) -> str:
    dec = to_decimal(value)
    if dec is None:
        return "" if value is None else str(value)
    if dec == dec.to_integral_value():
        return f"{dec:,.0f}"
    return f"{dec.normalize():,f}"


def cell(value: Any, max_len: int = 32) -> str:
    if value is None:
        text = ""
    elif isinstance(value, Decimal):
        text = decimal_text(value)
    else:
        text = str(value)
    text = text.replace("\n", " ").replace("\r", " ")
    if len(text) > max_len:
        return text[: max_len - 1] + "..."
    return text


def print_section(title: str) -> None:
    print()
    print(title)
    print("-" * len(title))


def print_kv(label: str, value: Any) -> None:
    print(f"{label:24} {value}")


def print_table(rows: list[dict[str, Any]]) -> None:
    columns = [
        ("customer_id", 18),
        ("name", 22),
        ("email", 28),
        ("risk_score", 10),
        ("signal_type", 12),
        ("state", 14),
        ("assigned_to_name", 18),
    ]
    header = " | ".join(name.ljust(width) for name, width in columns)
    print(header)
    print("-" * len(header))
    for row in rows:
        values = []
        for name, width in columns:
            values.append(cell(row.get(name), width).ljust(width))
        print(" | ".join(values))


def get_content_total(headers: dict[str, str]) -> str | None:
    content_range = headers.get("Content-Range") or headers.get("content-range")
    if not content_range or "/" not in content_range:
        return None
    return content_range.rsplit("/", 1)[-1]


def add_http_violation(violations: list[str], label: str, result: HttpResult) -> None:
    violations.append(f"{label}: {status_label(result.status)} - {concise_error(result)}")


def apply_tab_filter(params: dict[str, Any], tab: str) -> None:
    if tab == "critical":
        params["risk_score"] = "gte.70"
    elif tab in {"pending", "cooldown", "dead_lettered", "healthy"}:
        params["state"] = f"eq.{tab}"


def sanitize_search(raw: str) -> str:
    allowed = []
    for char in raw.strip():
        if char.isalnum() or char in {"_", " ", "@", ".", "-"}:
            allowed.append(char)
    return "".join(allowed)


def validate_metrics(metrics: dict[str, Any], violations: list[str]) -> None:
    for field in METRIC_FIELDS:
        if field not in metrics:
            violations.append(f"metrics missing field: {field}")

    numeric_fields = [field for field in METRIC_FIELDS if field != "tenant_id"]
    for field in numeric_fields:
        if field in metrics and to_decimal(metrics[field]) is None:
            violations.append(f"metrics field is not numeric: {field}={metrics[field]!r}")

def validate_rows(rows: list[dict[str, Any]], tenant_id: str, violations: list[str]) -> None:
    for index, row in enumerate(rows):
        prefix = f"row[{index}] customer_id={row.get('customer_id', '<missing>')}"

        for field in QUEUE_FIELDS:
            if field not in row:
                violations.append(f"{prefix}: missing field {field}")

        if row.get("tenant_id") != tenant_id:
            violations.append(
                f"{prefix}: tenant_id mismatch, expected {tenant_id}, got {row.get('tenant_id')}"
            )

        for required_text in ("customer_id", "name", "email"):
            if row.get(required_text) in (None, ""):
                violations.append(f"{prefix}: {required_text} is null/blank")

        score = to_decimal(row.get("risk_score"))
        if score is None:
            violations.append(f"{prefix}: risk_score is missing or not numeric")
        elif score < 0 or score > 100:
            violations.append(f"{prefix}: risk_score outside 0-100: {score}")
        elif score != score.to_integral_value():
            violations.append(f"{prefix}: risk_score is not an integer: {score}")

        state = row.get("state")
        if state not in ALLOWED_STATES:
            violations.append(f"{prefix}: invalid state {state!r}")

        signal_type = row.get("signal_type")
        if signal_type not in ALLOWED_SIGNAL_TYPES:
            violations.append(f"{prefix}: invalid signal_type {signal_type!r}")


def resolve_tenant_from_backend(
    api_base_url: str | None,
    api_key: str,
    auth_style: str,
    timeout: float,
    observations: list[str],
) -> tuple[str | None, str | None]:
    if not api_base_url:
        observations.append("Backend /me probe skipped: ARCLI_API_BASE_URL/NEXT_PUBLIC_API_URL not set.")
        return None, None

    url = make_url(normalize_base_url(api_base_url), "/me")
    result = http_json("GET", url, backend_headers(api_key, auth_style), timeout=timeout)
    if result.ok and isinstance(result.data, dict) and result.data.get("tenant_id"):
        tenant_id = str(result.data["tenant_id"])
        observations.append(f"Backend /me resolved tenant_id={tenant_id}.")
        return tenant_id, "backend /me"

    observations.append(
        f"Backend /me did not resolve tenant context: "
        f"{status_label(result.status)} - {concise_error(result)}"
    )
    return None, None


def resolve_tenant_from_supabase(
    rest_url: str,
    headers: dict[str, str],
    timeout: float,
    observations: list[str],
    violations: list[str],
) -> tuple[str | None, str | None]:
    url = make_url(
        rest_url,
        "tenant_users",
        {"select": "tenant_id,role", "limit": "10"},
    )
    result = http_json("GET", url, headers, timeout=timeout)
    if not result.ok:
        add_http_violation(violations, "tenant_users tenant resolution", result)
        return None, None

    rows = result.data if isinstance(result.data, list) else []
    if not rows:
        violations.append("tenant_users tenant resolution: no tenant rows visible for this key")
        return None, None

    tenant_ids = sorted({str(row.get("tenant_id")) for row in rows if row.get("tenant_id")})
    observations.append(
        f"Supabase tenant_users returned {len(rows)} membership row(s), "
        f"{len(tenant_ids)} distinct tenant_id value(s)."
    )
    if len(tenant_ids) > 1:
        observations.append(
            "Multiple tenant memberships are visible; using the first unless --tenant-id overrides it."
        )
    return tenant_ids[0], "Supabase tenant_users"


def fetch_metrics(
    rest_url: str,
    headers: dict[str, str],
    tenant_id: str,
    timeout: float,
    violations: list[str],
) -> dict[str, Any] | None:
    url = make_url(
        rest_url,
        "vw_customer_operations_metrics",
        {
            "select": ",".join(METRIC_FIELDS),
            "tenant_id": f"eq.{tenant_id}",
            "limit": "1",
        },
    )
    result = http_json("GET", url, headers, timeout=timeout)
    if not result.ok:
        add_http_violation(violations, "vw_customer_operations_metrics scoped read", result)
        return None

    rows = result.data if isinstance(result.data, list) else []
    if not rows:
        violations.append(
            "vw_customer_operations_metrics scoped read: no metrics row returned for tenant"
        )
        return None

    metrics = rows[0]
    if not isinstance(metrics, dict):
        violations.append("vw_customer_operations_metrics scoped read: unexpected response shape")
        return None

    validate_metrics(metrics, violations)
    return metrics


def fetch_queue_rows(
    rest_url: str,
    headers: dict[str, str],
    tenant_id: str,
    *,
    page: int,
    limit: int,
    tab: str,
    search: str | None,
    timeout: float,
    violations: list[str],
) -> tuple[list[dict[str, Any]], str | None]:
    start = (page - 1) * limit
    end = start + limit - 1
    params: dict[str, Any] = {
        "select": ",".join(QUEUE_FIELDS),
        "tenant_id": f"eq.{tenant_id}",
        "order": "risk_score.desc",
    }
    apply_tab_filter(params, tab)

    if search:
        clean = sanitize_search(search)
        if clean:
            wildcard = f"*{clean}*"
            params["or"] = (
                f"(name.ilike.{wildcard},email.ilike.{wildcard},"
                f"customer_id.ilike.{wildcard})"
            )

    ranged_headers = {
        **headers,
        "Prefer": "count=exact",
        "Range-Unit": "items",
        "Range": f"{start}-{end}",
    }
    url = make_url(rest_url, "vw_customer_operations", params)
    result = http_json("GET", url, ranged_headers, timeout=timeout)
    if not result.ok:
        add_http_violation(violations, "vw_customer_operations scoped range read", result)
        return [], None

    rows = result.data if isinstance(result.data, list) else []
    typed_rows = [row for row in rows if isinstance(row, dict)]
    if len(typed_rows) != len(rows):
        violations.append("vw_customer_operations scoped range read: unexpected row shape")

    validate_rows(typed_rows, tenant_id, violations)
    return typed_rows, get_content_total(result.headers)


def isolation_probe(
    rest_url: str,
    headers: dict[str, str],
    tenant_id: str,
    timeout: float,
    observations: list[str],
    violations: list[str],
) -> None:
    metrics_url = make_url(
        rest_url,
        "vw_customer_operations_metrics",
        {"select": "tenant_id", "limit": "1000"},
    )
    metrics_result = http_json("GET", metrics_url, headers, timeout=timeout)
    if metrics_result.ok and isinstance(metrics_result.data, list):
        seen = sorted(
            {
                str(row.get("tenant_id"))
                for row in metrics_result.data
                if isinstance(row, dict) and row.get("tenant_id")
            }
        )
        leaked = [value for value in seen if value != tenant_id]
        if leaked:
            violations.append(
                "Rule 6 tenant isolation violation: unfiltered metrics view exposed "
                f"tenant_id values outside resolved scope: {', '.join(leaked[:10])}"
            )
        else:
            observations.append("Rule 6 probe: metrics view did not expose other tenant_id values.")
    else:
        observations.append(
            "Rule 6 probe: metrics view unfiltered check unavailable: "
            f"{status_label(metrics_result.status)} - {concise_error(metrics_result)}"
        )

    rows_url = make_url(
        rest_url,
        "vw_customer_operations",
        {"select": "tenant_id,customer_id", "limit": "1000"},
    )
    rows_result = http_json("GET", rows_url, headers, timeout=timeout)
    if rows_result.ok and isinstance(rows_result.data, list):
        seen = sorted(
            {
                str(row.get("tenant_id"))
                for row in rows_result.data
                if isinstance(row, dict) and row.get("tenant_id")
            }
        )
        leaked = [value for value in seen if value != tenant_id]
        if leaked:
            violations.append(
                "Rule 6 tenant isolation violation: unfiltered queue view exposed "
                f"tenant_id values outside resolved scope: {', '.join(leaked[:10])}"
            )
        else:
            observations.append("Rule 6 probe: queue view did not expose other tenant_id values.")
    else:
        observations.append(
            "Rule 6 probe: queue view unfiltered check unavailable: "
            f"{status_label(rows_result.status)} - {concise_error(rows_result)}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify API/Supabase read access for /dashboard/queue data.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--api-key", default=first_env("ARCLI_API_KEY", "API_KEY"))
    parser.add_argument(
        "--supabase-url",
        default=first_env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
        help="Supabase project URL, e.g. https://xyz.supabase.co",
    )
    parser.add_argument(
        "--supabase-apikey",
        default=first_env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        help="Optional Supabase anon key. If omitted, --api-key is used as apikey.",
    )
    parser.add_argument(
        "--api-base-url",
        default=first_env("ARCLI_API_BASE_URL", "NEXT_PUBLIC_API_URL"),
        help="Optional Arcli backend URL for /me tenant-resolution probe.",
    )
    parser.add_argument("--tenant-id", default=first_env("ARCLI_TENANT_ID", "TENANT_ID"))
    parser.add_argument(
        "--auth-style",
        choices=["bearer", "x-api-key", "both"],
        default="both",
        help="How to send the provided API key. Supabase RLS requires Bearer JWT auth.",
    )
    parser.add_argument(
        "--tab",
        choices=["critical", "pending", "cooldown", "dead_lettered", "healthy", "all"],
        default="critical",
        help="Queue tab to mirror. /dashboard/queue defaults to critical.",
    )
    parser.add_argument("--search", default=None)
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--skip-isolation-probe", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    violations: list[str] = []
    observations: list[str] = []

    if not args.api_key:
        print("CONFIG ERROR: provide --api-key or set ARCLI_API_KEY/API_KEY.", file=sys.stderr)
        return 2
    if not args.supabase_url:
        print(
            "CONFIG ERROR: provide --supabase-url or set SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL.",
            file=sys.stderr,
        )
        return 2
    if args.page < 1:
        print("CONFIG ERROR: --page must be >= 1.", file=sys.stderr)
        return 2
    if args.limit < 1 or args.limit > 500:
        print("CONFIG ERROR: --limit must be between 1 and 500.", file=sys.stderr)
        return 2

    rest_url = normalize_supabase_rest_url(args.supabase_url)
    headers = supabase_headers(args.api_key, args.supabase_apikey, args.auth_style)

    print("Arcli Customer Operations Queue Verification")
    print("============================================")
    print_kv("key", mask_key(args.api_key))
    print_kv("supabase_rest", rest_url)
    print_kv("api_base_url", args.api_base_url or "<not set>")
    print_kv("auth_style", args.auth_style)
    print_kv("queue_tab", args.tab)
    print_kv("range", f"{(args.page - 1) * args.limit}-{(args.page * args.limit) - 1}")

    backend_tenant_id, backend_source = resolve_tenant_from_backend(
        args.api_base_url,
        args.api_key,
        args.auth_style,
        args.timeout,
        observations,
    )

    supabase_tenant_id, supabase_source = resolve_tenant_from_supabase(
        rest_url,
        headers,
        args.timeout,
        observations,
        violations,
    )

    tenant_id = args.tenant_id or backend_tenant_id or supabase_tenant_id
    tenant_source = (
        "manual --tenant-id"
        if args.tenant_id
        else backend_source or supabase_source
    )

    if backend_tenant_id and supabase_tenant_id and backend_tenant_id != supabase_tenant_id:
        violations.append(
            "tenant resolution mismatch: "
            f"backend /me={backend_tenant_id}, Supabase tenant_users={supabase_tenant_id}"
        )

    if args.tenant_id and supabase_tenant_id and args.tenant_id != supabase_tenant_id:
        violations.append(
            f"manual tenant_id {args.tenant_id} does not match Supabase-resolved "
            f"tenant_id {supabase_tenant_id}"
        )

    if not tenant_id:
        violations.append("API key did not resolve tenant_id from backend /me or Supabase tenant_users.")
        print_section("Observations")
        for item in observations:
            print(f"- {item}")
        print_section("Violations")
        for item in violations:
            print(f"- {item}")
        print("\nFAILURE")
        return 1

    if tenant_source == "manual --tenant-id":
        violations.append(
            "tenant_id came only from --tenant-id/env; the API key did not independently "
            "resolve tenant context."
        )

    print_section("Tenant")
    print_kv("tenant_id", tenant_id)
    print_kv("tenant_source", tenant_source or "<unknown>")

    metrics = fetch_metrics(rest_url, headers, tenant_id, args.timeout, violations)
    rows, total_count = fetch_queue_rows(
        rest_url,
        headers,
        tenant_id,
        page=args.page,
        limit=args.limit,
        tab=args.tab,
        search=args.search,
        timeout=args.timeout,
        violations=violations,
    )

    if not args.skip_isolation_probe:
        isolation_probe(rest_url, headers, tenant_id, args.timeout, observations, violations)

    print_section("Global Metrics")
    if metrics:
        for field in METRIC_FIELDS:
            if field == "tenant_id":
                continue
            value = metrics.get(field)
            print_kv(field, decimal_text(value))
    else:
        print("No metrics payload available.")

    print_section("Queue Records")
    print_kv("returned_rows", len(rows))
    print_kv("content_range_total", total_count or "<not returned>")
    if rows:
        print_table(rows)
    else:
        print("No queue rows returned for this tab/range.")

    print_section("Observations")
    for item in observations:
        print(f"- {item}")

    if violations:
        print_section("Violations")
        for item in violations:
            print(f"- {item}")
        print("\nFAILURE")
        return 1

    print_section("Result")
    print("SUCCESS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
