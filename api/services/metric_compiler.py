from __future__ import annotations

import re
from typing import Dict, List, Optional, Literal

import sqlglot
from pydantic import BaseModel, Field


_METRIC_EXPR_RE = re.compile(
    r"\b(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?([a-zA-Z_][a-zA-Z0-9_\.]*|\*)\s*\)",
    re.IGNORECASE,
)


class CompiledMetric(BaseModel):
    """Typed metric contract consumed by the logical AST builder."""

    name: str
    function: Literal["COUNT", "SUM", "AVG", "MIN", "MAX"]
    column: Optional[str] = None
    distinct: bool = False
    source_sql: Optional[str] = None


class MetricCompiler:
    """
    Lowers governed metric SQL snippets into typed aggregate metric nodes.

    This compiler intentionally supports a strict subset of metric expressions
    (single aggregate function over one column) to preserve deterministic
    lowering into AST nodes.
    """

    def lower_metric_catalog(
        self,
        metric_catalog: Dict[str, str],
        available_columns: Optional[List[str]] = None,
    ) -> List[CompiledMetric]:
        lowered: List[CompiledMetric] = []
        allowed_cols = set(available_columns or [])

        for metric_name, metric_sql in metric_catalog.items():
            compiled = self._lower_single_metric(metric_name, metric_sql)
            if not compiled:
                continue

            if compiled.column and allowed_cols and compiled.column not in allowed_cols:
                # Skip unauthorized/missing columns at compile time.
                continue

            lowered.append(compiled)

        return lowered

    def _lower_single_metric(self, metric_name: str, metric_sql: str) -> Optional[CompiledMetric]:
        metric_sql = (metric_sql or "").strip()
        if not metric_sql:
            return None

        fn, distinct, col = self._extract_aggregate_tokens(metric_sql)
        if not fn:
            fn, distinct, col = self._extract_from_sqlglot(metric_sql)

        if not fn:
            return None

        safe_name = self._safe_identifier(metric_name)
        column_name = self._safe_identifier(col.split(".")[-1]) if col and col != "*" else None

        return CompiledMetric(
            name=safe_name,
            function=fn,
            column=column_name,
            distinct=distinct,
            source_sql=metric_sql,
        )

    def _extract_aggregate_tokens(self, sql_text: str):
        m = _METRIC_EXPR_RE.search(sql_text)
        if not m:
            return None, False, None

        fn = m.group(1).upper()
        distinct = bool(m.group(2))
        col = m.group(3)
        return fn, distinct, col

    def _extract_from_sqlglot(self, sql_text: str):
        try:
            tree = sqlglot.parse_one(sql_text, read="duckdb")
        except Exception:
            return None, False, None

        # Try to locate the first aggregate expression in the AST.
        for node in tree.walk():
            cls_name = node.__class__.__name__.upper()
            if cls_name in {"COUNT", "SUM", "AVG", "MIN", "MAX"}:
                fn = cls_name
                distinct = bool(getattr(node, "args", {}).get("distinct"))
                expression = getattr(node, "args", {}).get("this")
                if expression is None:
                    return fn, distinct, "*"
                col = expression.sql(dialect="duckdb")
                return fn, distinct, col

        return None, False, None

    def _safe_identifier(self, value: str) -> str:
        cleaned = "".join(ch for ch in str(value) if ch.isalnum() or ch == "_")
        if not cleaned:
            raise ValueError(f"Invalid metric identifier: {value!r}")
        return cleaned

# Global singleton
metric_compiler = MetricCompiler()
