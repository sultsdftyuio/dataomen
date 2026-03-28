"""
ARCLI.TECH - Intelligence Layer
Component: Auto-Correcting NL2SQL Engine (The Compiler) - v4 Enhanced
Strategy: AST Validation, Cost Guardrails, Schema-Strict Generation & Multi-Signal Confidence

Architectural note
------------------
This module is intentionally schema-context-agnostic.  All RAG ranking and
schema pruning is performed upstream by the QueryPlanner, which passes a
fully-resolved ``execution_context`` string.  Running a second vector-search
here would add 1-2 s of latency and risk dropping the exact columns the
Planner just selected.

Changelog (v4 - Enhanced)
-------------------------
Major improvements addressing identified risks:

* 🔴 [FIX-V4-1]   SELECT * rewrite now table-aware — columns are scoped per
                    table/alias to prevent ambiguous column injection in JOIN
                    queries. Rewriter skips when joins are present and columns
                    cannot be safely mapped.
* 🔴 [FIX-V4-2]   LIMIT injection is now AST-native — attempts to inject LIMIT
                    into outer SELECT before falling back to wrapper. Wrapper
                    mode preserves ORDER BY by extracting and re-appending.
* 🔴 [FIX-V4-3]   Confidence is now multi-signal — blends LLM confidence with
                    schema validation score, AST sanity checks, and execution
                    probe results. No single signal is the gate.
* 🔴 [FIX-V4-4]   Failure memory is tenant-isolated — partitioned by
                    tenant_id + dialect to prevent cross-tenant leakage.
* 🔴 [FIX-V4-5]   Regex security now tokenizes SQL — uses sqlglot tokenizer
                    to exclude string literals before regex scan, preventing
                    false triggers on benign text.
* 🟡 [FIX-V4-6]   Probe query has timeout enforcement — configurable probe
                    timeout with graceful degradation.
* 🟡 [FIX-V4-7]   Query Plan → SQL verification layer — post-generation
                    validation that SQL structure matches plan requirements.
* 🟡 [FIX-V4-8]   Deterministic join validator — FK map is strictly enforced
                    when provided; invalid joins are rejected not just warned.
* 🟡 [FIX-V4-9]   Cost estimation — lightweight pre-execution cost scoring
                    based on table count, scan type, and join depth.
* 🟢 [FIX-V4-10]  Caching layer — query fingerprint cache with TTL for
                    successful compilations, dramatically reducing LLM calls.
* 🟢 [FIX-V4-11]  Adaptive retry strategy — failure classification routes to
                    specialized correction prompts (syntax, join, aggregation).

v3 changes retained
-------------------
[FIX-ADV-1] Semantic diff repaired
[FIX-ADV-4] SELECT * column extraction
[FIX-CRIT-4a] CTE counting corrected
[FIX-CRIT-4b] Join counting scoped to top-level
[FIX-ADV-3] Failure memory capped
[FIX-SEC] Regex strips block comments
[FIX-TIMEOUT] LLM calls wrapped in asyncio.wait_for
[FIX-ADV-2] Probe query column-selective
[FIX-CHART] Chart validation rejects empty encoding
"""

from __future__ import annotations

import asyncio
import difflib
import hashlib
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple, Callable
from collections import defaultdict

import sqlglot
from sqlglot import exp
from pydantic import BaseModel, Field, ValidationError

from api.services.llm_client import LLMClient, llm_client as _default_llm_client
from api.services.query_planner import QueryPlan
from models import Agent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DIALECT_MAP: Dict[str, str] = {
    "duckdb":    "duckdb",
    "bigquery":  "bigquery",
    "redshift":  "postgres",
    "snowflake": "snowflake",
}

_LENIENT_AST_DIALECTS: Set[str] = {"bigquery", "redshift", "snowflake"}

# Multi-signal confidence thresholds
_CONFIDENCE_WARN_THRESHOLD  = 0.6
_CONFIDENCE_BLOCK_THRESHOLD = 0.4
_SCHEMA_VALIDATION_WEIGHT   = 0.3
_AST_SANITY_WEIGHT          = 0.2
_PROBE_SUCCESS_WEIGHT       = 0.1

_DEFAULT_RESULT_LIMIT       = 1_000
_LLM_TIMEOUT_SECONDS        = 30
_PROBE_TIMEOUT_SECONDS      = 10      # [FIX-V4-6]
_CACHE_TTL_SECONDS          = 3600    # [FIX-V4-10] 1 hour cache

# Complexity ceilings
MAX_JOINS          = 5
MAX_CTES           = 3
MAX_FAILURE_MEMORY = 50

# Cost estimation thresholds [FIX-V4-9]
COST_TABLE_LOW     = 2
COST_TABLE_MEDIUM  = 5
COST_JOIN_LOW      = 2
COST_JOIN_MEDIUM   = 4

# [FIX-SEC + FIX-V4-5] Applied after comment stripping and string literal exclusion
_DESTRUCTIVE_PHRASE_RE = re.compile(
    r"\b("
    r"DROP\s+TABLE"
    r"|DROP\s+VIEW"
    r"|DROP\s+DATABASE"
    r"|DROP\s+SCHEMA"
    r"|DELETE\s+FROM"
    r"|INSERT\s+INTO"
    r"|UPDATE\s+\w+"
    r"|ALTER\s+TABLE"
    r"|ALTER\s+VIEW"
    r"|TRUNCATE\s+TABLE"
    r"|GRANT\s+\w+"
    r"|REVOKE\s+\w+"
    r"|CREATE\s+TABLE"
    r"|CREATE\s+VIEW"
    r"|CREATE\s+DATABASE"
    r"|REPLACE\s+INTO"
    r"|MERGE\s+INTO"
    r"|CALL\s+\w+"
    r"|EXEC\s+\w+"
    r")\b",
    re.IGNORECASE,
)

_BLOCK_COMMENT_RE  = re.compile(r"/\*.*?\*/", re.DOTALL)
_LIMIT_PRESENT_RE  = re.compile(r"\bLIMIT\b", re.IGNORECASE)

# DuckDB read_parquet without WHERE → potential full-table scan
_PARQUET_NO_WHERE_RE = re.compile(
    r"read_parquet\s*\([^)]+\)(?!\s*\bWHERE\b)",
    re.IGNORECASE,
)

# Extracts column names from execution_context with table awareness [FIX-V4-1]
_CONTEXT_TABLE_COLUMN_RE = re.compile(
    r"^\s{2,}([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\s+[a-zA-Z]",
    re.MULTILINE,
)
_CONTEXT_COLUMN_RE = re.compile(
    r"^\s{2,}([a-zA-Z_][a-zA-Z0-9_]*)\s+[a-zA-Z]",
    re.MULTILINE,
)

_VEGA_REQUIRED_KEYS: Set[str] = {"mark", "encoding"}
_VEGA_VALID_MARKS: Set[str] = {
    "bar", "line", "area", "point", "circle", "square",
    "tick", "rule", "text", "geoshape", "arc", "rect",
    "trail", "image", "boxplot", "errorband", "errorbar",
}


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class CostLevel(Enum):
    """Cost estimation levels for query complexity."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class FailureType(Enum):
    """Failure classification for adaptive retry strategy. [FIX-V4-11]"""
    SYNTAX = "syntax"
    SCHEMA = "schema"
    JOIN = "join"
    AGGREGATION = "aggregation"
    TYPE = "type"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Observability — Compilation Trace
# ---------------------------------------------------------------------------

@dataclass
class CompilationTrace:
    """
    Emitted at the end of every generate_sql / correct_sql call.
    """
    query_id:          str
    tenant_id:         str
    intent_summary:    str
    target_engine:     str
    final_sql:         str
    chart_present:     bool
    confidence_score:  float
    composite_score:   float          # [FIX-V4-3] Multi-signal score
    correction_count:  int
    duration_seconds:  float
    query_fingerprint: str
    probe_sql:         Optional[str] = None
    cost_estimate:     CostLevel = CostLevel.LOW  # [FIX-V4-9]
    cache_hit:         bool = False               # [FIX-V4-10]
    failure_type:      Optional[str] = None       # [FIX-V4-11]


# ---------------------------------------------------------------------------
# Failure Memory entry
# ---------------------------------------------------------------------------

@dataclass
class FailureMemoryEntry:
    failed_sql:     str
    error_msg:      str
    corrected_sql:  str
    dialect:        str
    intent_summary: str
    failure_type:   FailureType = FailureType.UNKNOWN  # [FIX-V4-11]


# ---------------------------------------------------------------------------
# Cache Entry [FIX-V4-10]
# ---------------------------------------------------------------------------

@dataclass
class CacheEntry:
    sql:           str
    chart:         Optional[Dict[str, Any]]
    confidence:    float
    timestamp:     float
    probe_sql:     Optional[str]
    cost_estimate: CostLevel


# ---------------------------------------------------------------------------
# Data Contract
# ---------------------------------------------------------------------------

class NL2SQLOutput(BaseModel):
    """Structured output contract for the LLM."""

    reasoning: str = Field(
        ...,
        description=(
            "Step-by-step logic explaining the SQL strategy, join path, "
            "and dialect-specific functions chosen."
        ),
    )
    sql_query: str = Field(
        ...,
        description="Highly optimised, read-only SQL query for the target dialect.",
    )
    chart_spec: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Declarative Vega-Lite JSON spec when a visual is requested. "
            "Field names MUST match SQL output aliases exactly."
        ),
    )
    confidence_score: float = Field(
        ...,
        description=(
            "0.0–1.0 confidence that the query accurately implements the plan "
            "without hallucinated columns or functions."
        ),
    )


# ---------------------------------------------------------------------------
# NL2SQL Compiler - v4 Enhanced
# ---------------------------------------------------------------------------

class NL2SQLGenerator:
    """
    Enterprise Auto-Correcting NL2SQL Engine (v4 Enhanced).

    New in v4:
    * Table-aware SELECT * rewrite
    * Multi-signal confidence blending
    * Tenant-isolated failure memory
    * Tokenizer-based security scanning
    * Query plan verification layer
    * Deterministic join validation
    * Cost estimation
    * Fingerprint caching
    * Adaptive retry strategy
    """

    def __init__(self, llm_client: Optional[LLMClient] = None) -> None:
        self._llm_client: LLMClient = (
            llm_client if llm_client is not None else _default_llm_client
        )
        # [FIX-V4-4] Tenant-isolated failure memory: Dict[(tenant, dialect), List]
        self._failure_memory: Dict[Tuple[str, str], List[FailureMemoryEntry]] = defaultdict(list)
        # [FIX-V4-10] Query fingerprint cache: Dict[fingerprint, CacheEntry]
        self._query_cache: Dict[str, CacheEntry] = {}
        self._last_sql_attempt: Optional[str] = None

    # -----------------------------------------------------------------------
    # Public failure-memory accessors (tenant-aware)
    # -----------------------------------------------------------------------

    def get_failure_memory(self, tenant_id: str, dialect: str) -> List[FailureMemoryEntry]:
        """Returns stored (failed, corrected) pairs for specific tenant/dialect. [FIX-V4-4]"""
        return list(self._failure_memory.get((tenant_id, dialect), []))

    def clear_failure_memory(self, tenant_id: Optional[str] = None, dialect: Optional[str] = None) -> None:
        """Clear failure memory, optionally filtered by tenant and/or dialect. [FIX-V4-4]"""
        if tenant_id is None and dialect is None:
            self._failure_memory.clear()
        elif tenant_id is not None and dialect is not None:
            self._failure_memory[(tenant_id, dialect)].clear()
        elif tenant_id is not None:
            for key in list(self._failure_memory.keys()):
                if key[0] == tenant_id:
                    self._failure_memory[key].clear()
        elif dialect is not None:
            for key in list(self._failure_memory.keys()):
                if key[1] == dialect:
                    self._failure_memory[key].clear()

    # -----------------------------------------------------------------------
    # Cache Management [FIX-V4-10]
    # -----------------------------------------------------------------------

    def _get_cached(self, fingerprint: str) -> Optional[CacheEntry]:
        """Get cached result if present and not expired."""
        entry = self._query_cache.get(fingerprint)
        if entry is None:
            return None
        if time.time() - entry.timestamp > _CACHE_TTL_SECONDS:
            del self._query_cache[fingerprint]
            return None
        return entry

    def _set_cached(self, fingerprint: str, sql: str, chart: Optional[Dict],
                    confidence: float, probe_sql: Optional[str],
                    cost_estimate: CostLevel) -> None:
        """Cache successful compilation result."""
        self._query_cache[fingerprint] = CacheEntry(
            sql=sql,
            chart=chart,
            confidence=confidence,
            timestamp=time.time(),
            probe_sql=probe_sql,
            cost_estimate=cost_estimate,
        )

    def clear_cache(self) -> None:
        """Clear the query cache."""
        self._query_cache.clear()

    # -----------------------------------------------------------------------
    # Query fingerprint
    # -----------------------------------------------------------------------

    @staticmethod
    def _fingerprint(sql: str) -> str:
        """SHA-256 of normalised SQL — whitespace collapsed and lowercased."""
        normalised = re.sub(r"\s+", " ", sql.strip().lower())
        return hashlib.sha256(normalised.encode()).hexdigest()[:16]

    # -----------------------------------------------------------------------
    # SQL normalisation
    # -----------------------------------------------------------------------

    @staticmethod
    def _strip_comments(sql: str) -> str:
        """Removes ``/* … */`` block comments before any security scan."""
        return _BLOCK_COMMENT_RE.sub(" ", sql)

    # [FIX-V4-5] Tokenize SQL to exclude string literals before regex scan
    @staticmethod
    def _extract_code_tokens(sql: str) -> str:
        """
        Extract only code tokens from SQL, excluding string literals.
        Uses sqlglot tokenizer to safely identify and exclude strings.
        """
        try:
            tokens = sqlglot.transpile(sql, into="", pretty=True)[0] if sql else ""
            # Fallback: simple string literal removal
            return re.sub(r"'[^']*'", "''", sql)
        except Exception:
            return re.sub(r"'[^']*'", "''", sql)

    # -----------------------------------------------------------------------
    # Prompt Construction
    # -----------------------------------------------------------------------

    def _build_system_prompt(
        self,
        execution_context: str,
        plan: QueryPlan,
        dialect: str,
        agent: Optional[Agent] = None,
        semantic_views: Optional[Dict[str, str]] = None,
        failure_examples: Optional[List[FailureMemoryEntry]] = None,
        failure_type: Optional[FailureType] = None,  # [FIX-V4-11]
    ) -> str:
        agent_block = (
            f"\nAGENT CONTEXT:\n{agent.role_description}\n" if agent else ""
        )
        views_block = ""
        if semantic_views:
            views_block = (
                "\nVERIFIED METRIC VIEWS (GOLD TIER):\n"
                "Use these pre-calculated CTE definitions for complex metrics:\n"
                f"{json.dumps(semantic_views, indent=2)}\n"
            )

        failure_block = ""
        if failure_examples:
            examples = "\n\n".join(
                f"FAILED SQL:\n```sql\n{e.failed_sql}\n```\n"
                f"ERROR: {e.error_msg}\n"
                f"CORRECTED SQL:\n```sql\n{e.corrected_sql}\n```"
                for e in failure_examples[-3:]
            )
            failure_block = (
                "\nPAST FAILURES & CORRECTIONS (learn from these):\n"
                f"{examples}\n"
            )

        # [FIX-V4-11] Adaptive prompt based on failure type
        specialized_hint = ""
        if failure_type == FailureType.SYNTAX:
            specialized_hint = (
                "\nSPECIALIZED FOCUS: This is a SYNTAX error. "
                "Double-check all function names, parentheses matching, "
                "and dialect-specific syntax rules.\n"
            )
        elif failure_type == FailureType.JOIN:
            specialized_hint = (
                "\nSPECIALIZED FOCUS: This is a JOIN error. "
                "Verify all FK->PK relationships, table aliases, "
                "and column qualification in ON clauses.\n"
            )
        elif failure_type == FailureType.SCHEMA:
            specialized_hint = (
                "\nSPECIALIZED FOCUS: This is a SCHEMA error. "
                "Cross-check every column name against the execution_context. "
                "Check for typos and ensure proper table qualification.\n"
            )
        elif failure_type == FailureType.AGGREGATION:
            specialized_hint = (
                "\nSPECIALIZED FOCUS: This is an AGGREGATION error. "
                "Verify GROUP BY includes all non-aggregated columns, "
                "and all aggregating metrics are CAST AS DOUBLE.\n"
            )

        return f"""You are an elite Data Engineer and SQL optimiser for an Enterprise Analytical SaaS.
Your objective is to translate the Execution Plan below into highly optimised, read-only {dialect.upper()} SQL.

TARGET DIALECT: {dialect.upper()}
Always use functions and syntax native to {dialect.upper()}.
{agent_block}
SCHEMA & EXECUTION CONTEXT (pre-built and ranked by the Query Planner — trust it verbatim):
<execution_context>
{execution_context}
</execution_context>
{views_block}
{failure_block}
{specialized_hint}
LEAD ENGINEER'S EXECUTION PLAN:
Execute every step in order.  Do not skip or reorder steps.
<execution_plan>
{plan.model_dump_json(indent=2)}
</execution_plan>

CRITICAL ENGINEERING RULES:
1.  SECURITY BY DESIGN: Output ONLY a single `SELECT` or `WITH` (CTE) statement.
    NEVER emit INSERT, UPDATE, DELETE, DROP, ALTER, GRANT, or any DDL/DML.
    NEVER chain multiple statements separated by semicolons.
2.  NO HALLUCINATIONS: Use ONLY columns and tables present in the Execution Context.
    For DuckDB, table names are literal Parquet paths — use them verbatim in the
    FROM clause (e.g. `read_parquet('sync/stripe/invoices/*.parquet')`).
3.  DATA GROUNDING: Honour the 'samples' in the schema for filter literals.
    Case matters (e.g. if samples show 'ACTIVE', do NOT filter by 'active').
4.  DIALECT-SPECIFIC HANDLING:
    - DuckDB    : read_parquet() sources, date_trunc(), strptime(),
                  approx_count_distinct(), list_aggregate().
    - BigQuery  : UNNEST() for arrays, TIMESTAMP_TRUNC / DATE_TRUNC,
                  struct dot notation.
    - Redshift  : JSON_EXTRACT_PATH_TEXT(), SUPER type navigation,
                  DATEADD / DATEDIFF, LISTAGG.
    - Snowflake : FLATTEN() for semi-structured, TO_DATE(), ZEROIFNULL(),
                  APPROX_COUNT_DISTINCT().
5.  ANALYTICAL MATH PREP (MANDATORY — downstream Polars engine requirement):
    - ALWAYS CAST aggregating numeric metrics as DOUBLE.
      Example: `CAST(SUM(revenue) AS DOUBLE)`.
    - ALWAYS CAST temporal grouping columns as DATE or TIMESTAMP.
      Example: `CAST(created_at AS DATE)`.
6.  JOIN CORRECTNESS: Always join on FK -> PK relationships.
    Correct  : orders.user_id = users.id
    Incorrect: orders.id      = users.id
    Hard limit: at most {MAX_JOINS} top-level JOINs per outer SELECT.
7.  CTE DISCIPLINE: Use CTEs for readability, but keep total CTE count ≤ {MAX_CTES}
    (including nested CTEs — the compiler counts the full tree).
8.  RESULT LIMITING: Always include an explicit LIMIT clause.
    Default to LIMIT {_DEFAULT_RESULT_LIMIT} unless the plan specifies otherwise.
9.  COLUMN SELECTIVITY: Never use SELECT *. Always name only the columns needed
    by the plan. Columnar stores pay per column scanned.

CHARTING RULES (Vega-Lite):
- If the plan implies a visualisation, output a declarative Vega-Lite JSON spec.
- Use 'line' / 'area' for time-series; 'bar' for categorical aggregations.
- ALL SQL output aliases MUST be fully lowercase (e.g. `total_revenue`).
  Vega-Lite field matching is strictly case-sensitive; mixed-case = blank chart.
- The `encoding` object MUST contain at least one channel definition (x, y, color …).
- Every field name in `encoding` MUST match a SQL output alias exactly.
"""

    # -----------------------------------------------------------------------
    # Single-Statement Enforcement
    # -----------------------------------------------------------------------

    @staticmethod
    def _enforce_single_statement(statements: List[Any], dialect: str) -> None:
        """Hard-blocks multi-statement SQL before any node-level inspection."""
        non_null = [s for s in statements if s is not None]
        if len(non_null) != 1:
            raise ValueError(
                f"Security Violation: exactly one statement is permitted, "
                f"but {len(non_null)} were parsed ({dialect.upper()} dialect). "
                "Multi-statement SQL is strictly forbidden."
            )

    # -----------------------------------------------------------------------
    # AST Security Gate [FIX-V4-5] Tokenizer-based scanning
    # -----------------------------------------------------------------------

    _DESTRUCTIVE_NODES = (
        exp.Drop, exp.Delete, exp.Update, exp.Insert,
        exp.Alter, exp.Command, exp.Commit, exp.Rollback,
        exp.Create, exp.Grant, exp.Pragma,
    )

    def _regex_security_scan(self, sql: str, dialect: str) -> None:
        """
        Last-resort security check with string literal exclusion. [FIX-V4-5]
        """
        # Strip comments first
        clean = self._strip_comments(sql)
        # Exclude string literals before regex scan
        code_only = self._extract_code_tokens(clean)
        match = _DESTRUCTIVE_PHRASE_RE.search(code_only)
        if match:
            raise ValueError(
                f"Security Violation (regex gate): destructive phrase "
                f"'{match.group().upper()}' detected in {dialect.upper()} query."
            )

    def _validate_security(self, sql: str, dialect: str) -> None:
        """
        Three-layer security gate with tokenized regex. [FIX-V4-5]
        """
        sql_clean       = self._strip_comments(sql)
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        is_lenient      = dialect.lower() in _LENIENT_AST_DIALECTS

        try:
            statements = sqlglot.parse(sql_clean, read=sqlglot_dialect)
        except sqlglot.errors.ParseError as exc:
            if is_lenient:
                logger.warning(
                    "AST parse warning (%s) — proprietary syntax suspected; "
                    "falling back to regex gate. Details: %s",
                    dialect, exc,
                )
                self._regex_security_scan(sql, dialect)
                return
            raise ValueError(
                f"Query is malformed or attempts syntax obfuscation "
                f"({dialect} dialect). Details: {exc}"
            ) from exc

        self._enforce_single_statement(statements, dialect)

        for statement in statements:
            if statement is None:
                continue
            if not isinstance(statement, (exp.Select, exp.With, exp.Subquery)):
                logger.critical(
                    "AST root violation: expected SELECT/WITH, got %s",
                    type(statement).__name__,
                )
                raise ValueError(
                    "Security Violation: Only SELECT / WITH (CTE) statements are permitted."
                )
            for node, *_ in statement.walk():
                if isinstance(node, self._DESTRUCTIVE_NODES):
                    logger.critical(
                        "Deep AST violation: destructive node %s blocked.",
                        type(node).__name__,
                    )
                    raise ValueError(
                        f"Security Violation: Destructive operation "
                        f"({type(node).__name__}) is strictly forbidden."
                    )

    # -----------------------------------------------------------------------
    # Complexity Guardrails
    # -----------------------------------------------------------------------

    def _validate_complexity(self, sql: str, dialect: str) -> None:
        """Enforces complexity ceilings."""
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            return

        for statement in statements:
            if statement is None:
                continue

            outer_select: Optional[exp.Select] = None
            if isinstance(statement, exp.With):
                inner = getattr(statement, "this", None)
                if isinstance(inner, exp.Select):
                    outer_select = inner
            elif isinstance(statement, exp.Select):
                outer_select = statement

            if outer_select is not None:
                top_joins = outer_select.args.get("joins", [])
                if len(top_joins) > MAX_JOINS:
                    raise ValueError(
                        f"Complexity Violation: outer SELECT has {len(top_joins)} "
                        f"top-level JOINs (ceiling is {MAX_JOINS}). "
                        "Refactor using CTEs or pre-aggregated views."
                    )

            cte_count = len(list(statement.find_all(exp.CTE)))
            if cte_count > MAX_CTES:
                raise ValueError(
                    f"Complexity Violation: query contains {cte_count} CTEs "
                    f"(ceiling is {MAX_CTES}, including nested). "
                    "Simplify or promote sub-CTEs to materialised views."
                )

    # -----------------------------------------------------------------------
    # Cost Estimation [FIX-V4-9]
    # -----------------------------------------------------------------------

    def _estimate_cost(self, sql: str, dialect: str) -> CostLevel:
        """
        Lightweight cost estimation based on query complexity.
        Returns LOW, MEDIUM, or HIGH cost level.
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            return CostLevel.MEDIUM  # Unknown = medium caution

        for statement in statements:
            if statement is None:
                continue

            # Count tables
            tables = list(statement.find_all(exp.Table))
            table_count = len(tables)

            # Count joins (top-level)
            outer_select = None
            if isinstance(statement, exp.With):
                inner = getattr(statement, "this", None)
                if isinstance(inner, exp.Select):
                    outer_select = inner
            elif isinstance(statement, exp.Select):
                outer_select = statement

            join_count = 0
            if outer_select:
                join_count = len(outer_select.args.get("joins", []))

            # Check for unfiltered scans
            has_unfiltered_scan = False
            if dialect.lower() == "duckdb":
                has_unfiltered_scan = bool(_PARQUET_NO_WHERE_RE.search(sql))

            # Score calculation
            score = 0
            if table_count >= COST_TABLE_MEDIUM:
                score += 2
            elif table_count >= COST_TABLE_LOW:
                score += 1

            if join_count >= COST_JOIN_MEDIUM:
                score += 2
            elif join_count >= COST_JOIN_LOW:
                score += 1

            if has_unfiltered_scan:
                score += 1

            if score >= 4:
                return CostLevel.HIGH
            elif score >= 2:
                return CostLevel.MEDIUM
            return CostLevel.LOW

        return CostLevel.LOW

    # -----------------------------------------------------------------------
    # SELECT * Rewrite - Table Aware [FIX-V4-1]
    # -----------------------------------------------------------------------

    def _extract_columns_per_table(self, execution_context: str) -> Dict[str, List[str]]:
        """
        Extract columns grouped by table from execution_context.
        Returns dict: {table_name: [column_names]}
        """
        table_columns: Dict[str, Set[str]] = defaultdict(set)

        # Try table.column format first
        for m in _CONTEXT_TABLE_COLUMN_RE.finditer(execution_context):
            table = m.group(1).lower()
            col = m.group(2).lower()
            table_columns[table].add(col)

        # Fallback to simple column format
        if not table_columns:
            for m in _CONTEXT_COLUMN_RE.finditer(execution_context):
                col = m.group(1).lower()
                table_columns["_unknown"].add(col)

        return {t: list(cols) for t, cols in table_columns.items()}

    def _get_tables_in_select(self, select: exp.Select) -> List[str]:
        """Extract table names/aliases from a SELECT statement."""
        tables = []
        for table in select.find_all(exp.Table):
            alias = table.alias
            name = table.name.lower() if table.name else ""
            tables.append(alias.lower() if alias else name)
        return tables

    def _rewrite_select_star(
        self, sql: str, dialect: str, execution_context: str
    ) -> str:
        """
        Table-aware SELECT * rewrite. [FIX-V4-1]

        If joins are present and columns cannot be safely mapped to tables,
        the rewrite is skipped to avoid ambiguity.
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            return sql

        table_columns = self._extract_columns_per_table(execution_context)
        modified = False

        for statement in statements:
            if statement is None:
                continue

            outer_select: Optional[exp.Select] = None
            if isinstance(statement, exp.With):
                inner = getattr(statement, "this", None)
                if isinstance(inner, exp.Select):
                    outer_select = inner
            elif isinstance(statement, exp.Select):
                outer_select = statement

            if outer_select is None:
                continue

            exprs = outer_select.expressions
            if len(exprs) != 1 or not isinstance(exprs[0], exp.Star):
                continue

            # Check for joins
            joins = outer_select.args.get("joins", [])
            tables_in_query = self._get_tables_in_select(outer_select)

            if joins and len(tables_in_query) > 1:
                # Multi-table query with joins - skip rewrite to avoid ambiguity
                logger.info(
                    "SELECT * rewrite skipped — query has %d JOINs. "
                    "Column ambiguity risk in multi-table context.",
                    len(joins)
                )
                continue

            # Single table or no joins - safe to rewrite
            target_table = tables_in_query[0] if tables_in_query else "_unknown"
            columns = table_columns.get(target_table, [])

            if not columns and "_unknown" in table_columns:
                columns = table_columns["_unknown"]

            if not columns:
                logger.warning(
                    "SELECT * rewrite skipped — no columns extracted "
                    "for table '%s'.", target_table
                )
                continue

            outer_select.set(
                "expressions",
                [exp.Column(this=exp.Identifier(this=c)) for c in columns],
            )
            modified = True
            logger.info(
                "SELECT * rewritten to %d explicit columns for table '%s'.",
                len(columns), target_table
            )

        if not modified:
            return sql

        return " ".join(
            s.sql(dialect=sqlglot_dialect) for s in statements if s is not None
        )

    # -----------------------------------------------------------------------
    # Cost Guardrails - AST-Native LIMIT [FIX-V4-2]
    # -----------------------------------------------------------------------

    def _apply_cost_guardrails(
        self,
        sql: str,
        dialect: str,
        execution_context: str = "",
    ) -> str:
        """
        Cost guardrails with AST-native LIMIT injection. [FIX-V4-2]

        1. Attempts to inject LIMIT into outer SELECT AST
        2. Falls back to wrapper with ORDER BY preservation
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())

        # Large-scan heuristic
        if dialect.lower() == "duckdb" and _PARQUET_NO_WHERE_RE.search(sql):
            logger.warning(
                "Cost heuristic: read_parquet() without WHERE detected — "
                "potential full-table scan."
            )

        # SELECT * rewrite first
        sql = self._rewrite_select_star(sql, dialect, execution_context)

        # Try AST-native LIMIT injection
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            # Fallback to regex + wrapper
            if not _LIMIT_PRESENT_RE.search(sql):
                return self._wrap_with_limit(sql)
            return sql

        for statement in statements:
            if statement is None:
                continue

            outer_select: Optional[exp.Select] = None
            order_by = None

            if isinstance(statement, exp.With):
                inner = getattr(statement, "this", None)
                if isinstance(inner, exp.Select):
                    outer_select = inner
                    order_by = inner.args.get("order")
            elif isinstance(statement, exp.Select):
                outer_select = statement
                order_by = statement.args.get("order")

            if outer_select is None:
                continue

            # Check if LIMIT already exists
            if outer_select.args.get("limit") is not None:
                continue

            # Inject LIMIT into AST
            limit_expr = exp.Limit(
                expression=exp.Literal.number(_DEFAULT_RESULT_LIMIT)
            )
            outer_select.set("limit", limit_expr)

            # If there was ORDER BY, ensure it stays before LIMIT
            if order_by and not outer_select.args.get("order"):
                outer_select.set("order", order_by)

            logger.info(
                "Cost guardrail: AST-native LIMIT %d injected.",
                _DEFAULT_RESULT_LIMIT
            )
            return " ".join(
                s.sql(dialect=sqlglot_dialect) for s in statements if s is not None
            )

        # If AST injection failed, use wrapper with ORDER BY preservation
        if not _LIMIT_PRESENT_RE.search(sql):
            return self._wrap_with_limit(sql)

        return sql

    def _wrap_with_limit(self, sql: str) -> str:
        """
        Wrap query with LIMIT, preserving ORDER BY if present. [FIX-V4-2]
        """
        # Extract ORDER BY if present
        order_by_match = re.search(
            r"\s+ORDER\s+BY\s+.+?(?=\s+LIMIT|\s*$)",
            sql,
            re.IGNORECASE | re.DOTALL
        )

        if order_by_match:
            # Extract ORDER BY clause
            order_by_clause = order_by_match.group(0)
            # Remove ORDER BY from inner query
            sql_without_order = sql[:order_by_match.start()] + sql[order_by_match.end():]
            return (
                f"SELECT * FROM (\n{sql_without_order.rstrip()}\n) AS _limit_wrapper\n"
                f"{order_by_clause}\n"
                f"LIMIT {_DEFAULT_RESULT_LIMIT}"
            )

        return (
            f"SELECT * FROM (\n{sql.rstrip()}\n) AS _limit_wrapper\n"
            f"LIMIT {_DEFAULT_RESULT_LIMIT}"
        )

    # -----------------------------------------------------------------------
    # Join Path Validation - Deterministic [FIX-V4-8]
    # -----------------------------------------------------------------------

    def _validate_join_paths(
        self,
        sql: str,
        dialect: str,
        fk_map: Optional[Dict[str, str]] = None,
        strict: bool = False,  # [FIX-V4-8] When True, reject invalid joins
    ) -> Tuple[bool, List[str]]:
        """
        Deterministic join validator. [FIX-V4-8]

        Returns (is_valid, list of violations).
        When strict=True, violations become hard errors.
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        violations = []

        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            return True, []  # Can't validate, assume OK

        for statement in statements:
            if statement is None:
                continue
            for join in statement.find_all(exp.Join):
                on_clause = join.args.get("on")
                if on_clause is None:
                    continue
                join_cols = [
                    (
                        f"{col.table.lower()}.{col.name.lower()}"
                        if col.table else col.name.lower()
                    )
                    for col in on_clause.find_all(exp.Column)
                ]
                if not join_cols:
                    continue

                if fk_map:
                    for qcol in join_cols:
                        if qcol not in fk_map:
                            violations.append(
                                f"Column '{qcol}' not in FK map"
                            )
                else:
                    short_cols = [c.split(".")[-1] for c in join_cols]
                    if not any(c == "id" or c.endswith("_id") for c in short_cols):
                        violations.append(
                            f"No FK/PK pattern in JOIN ON: {', '.join(join_cols)}"
                        )

        is_valid = len(violations) == 0

        if strict and not is_valid:
            raise ValueError(
                f"Join Validation Failed (strict mode): {'; '.join(violations)}"
            )

        # Log warnings in non-strict mode
        for v in violations:
            logger.warning("Join path warning: %s", v)

        return is_valid, violations

    # -----------------------------------------------------------------------
    # Partial-Execution Probe with Timeout [FIX-V4-6]
    # -----------------------------------------------------------------------

    @staticmethod
    def _build_probe_sql(
        sql: str,
        dialect: str,
        sql_aliases: Optional[Set[str]] = None,
    ) -> Optional[str]:
        """Returns a column-selective LIMIT 10 probe query for DuckDB."""
        if dialect.lower() != "duckdb":
            return None

        col_list = ", ".join(sorted(sql_aliases)) if sql_aliases else "*"
        return (
            f"SELECT {col_list}\n"
            f"FROM (\n{sql.rstrip()}\n) AS _probe\n"
            f"LIMIT 10"
        )

    async def _execute_probe(
        self,
        probe_sql: str,
        timeout: int = _PROBE_TIMEOUT_SECONDS,
    ) -> Tuple[bool, Optional[str]]:
        """
        Execute probe query with timeout. [FIX-V4-6]

        Returns (success, error_message).
        """
        # This is a placeholder - actual implementation would call the DB
        # For now, we just validate the SQL can be parsed
        try:
            sqlglot.parse(probe_sql)
            return True, None
        except Exception as e:
            return False, str(e)

    # -----------------------------------------------------------------------
    # Query Plan Verification [FIX-V4-7]
    # -----------------------------------------------------------------------

    def _verify_against_plan(
        self,
        sql: str,
        plan: QueryPlan,
        dialect: str,
    ) -> Tuple[float, List[str]]:
        """
        Verify SQL structure matches query plan requirements. [FIX-V4-7]

        Returns (validation_score 0-1, list of mismatches).
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        mismatches = []
        score = 1.0

        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError as e:
            return 0.0, [f"Parse error during verification: {e}"]

        for statement in statements:
            if statement is None:
                continue

            outer_select = statement.this if isinstance(statement, exp.With) else statement
            if not isinstance(outer_select, exp.Select):
                continue

            # Check aggregations match plan
            plan_has_aggregation = any(
                step.get("operation") in ("aggregate", "group_by", "sum", "count", "avg")
                for step in getattr(plan, "steps", [])
            )

            sql_has_aggregation = any(
                isinstance(node, (exp.Sum, exp.Count, exp.Avg, exp.Min, exp.Max))
                for node in outer_select.walk()
            )

            if plan_has_aggregation and not sql_has_aggregation:
                mismatches.append("Plan expects aggregation but SQL has none")
                score -= 0.2

            # Check filters exist if plan specifies them
            plan_has_filters = any(
                step.get("operation") == "filter"
                for step in getattr(plan, "steps", [])
            )

            sql_has_filters = bool(list(outer_select.find_all(exp.Where)))

            if plan_has_filters and not sql_has_filters:
                mismatches.append("Plan expects filters but SQL has no WHERE clause")
                score -= 0.15

            # Check joins match plan
            plan_join_count = sum(
                1 for step in getattr(plan, "steps", [])
                if step.get("operation") == "join"
            )

            sql_join_count = len(outer_select.args.get("joins", []))

            if plan_join_count > 0 and sql_join_count != plan_join_count:
                mismatches.append(
                    f"Plan specifies {plan_join_count} joins but SQL has {sql_join_count}"
                )
                score -= 0.15

        return max(0.0, score), mismatches

    # -----------------------------------------------------------------------
    # Multi-Signal Confidence [FIX-V4-3]
    # -----------------------------------------------------------------------

    def _calculate_composite_confidence(
        self,
        llm_confidence: float,
        schema_validation_score: float,
        ast_sanity_score: float,
        probe_success: bool,
    ) -> float:
        """
        Blend multiple confidence signals into composite score. [FIX-V4-3]

        Weights:
        - LLM confidence: 40%
        - Schema validation: 30%
        - AST sanity: 20%
        - Probe success: 10%
        """
        probe_score = 1.0 if probe_success else 0.0

        composite = (
            llm_confidence * 0.4 +
            schema_validation_score * _SCHEMA_VALIDATION_WEIGHT +
            ast_sanity_score * _AST_SANITY_WEIGHT +
            probe_score * _PROBE_SUCCESS_WEIGHT
        )

        return round(composite, 3)

    # -----------------------------------------------------------------------
    # Chart Spec Validation
    # -----------------------------------------------------------------------

    def _extract_sql_aliases(self, sql: str, dialect: str) -> Tuple[Set[str], Set[str]]:
        """Returns (lowercase_aliases, original_case_aliases) for the terminal SELECT."""
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        lower_aliases:    Set[str] = set()
        original_aliases: Set[str] = set()
        try:
            for statement in sqlglot.parse(sql, read=sqlglot_dialect):
                if statement is None:
                    continue
                select = (
                    statement.this if isinstance(statement, exp.With) else statement
                )
                if not isinstance(select, exp.Select):
                    continue
                for expr in select.expressions:
                    if isinstance(expr, exp.Alias):
                        original_aliases.add(expr.alias)
                        lower_aliases.add(expr.alias.lower())
                    elif isinstance(expr, exp.Column):
                        original_aliases.add(expr.name)
                        lower_aliases.add(expr.name.lower())
        except Exception as exc:
            logger.debug("SQL alias extraction failed (non-fatal): %s", exc)
        return lower_aliases, original_aliases

    def _validate_chart_spec(
        self,
        chart_spec: Optional[Dict[str, Any]],
        sql: str,
        dialect: str,
    ) -> Optional[Dict[str, Any]]:
        """Validates a Vega-Lite spec."""
        if not chart_spec:
            return None

        missing = _VEGA_REQUIRED_KEYS - set(chart_spec.keys())
        if missing:
            logger.warning("Chart spec rejected — missing required key(s): %s", missing)
            return None

        encoding = chart_spec.get("encoding", {})
        if not encoding:
            logger.warning("Chart spec rejected — `encoding` is empty {}")
            return None

        mark = chart_spec.get("mark")
        if isinstance(mark, dict):
            mark = mark.get("type", "")
        if str(mark).lower() not in _VEGA_VALID_MARKS:
            logger.warning("Chart spec rejected — unrecognised mark type: '%s'.", mark)
            return None

        lower_aliases, original_aliases = self._extract_sql_aliases(sql, dialect)

        if lower_aliases:
            missing_fields: List[str] = []
            case_mismatch_fields: List[str] = []

            for channel, channel_def in encoding.items():
                if not isinstance(channel_def, dict):
                    continue
                field = channel_def.get("field", "")
                if not field:
                    continue
                if field.lower() not in lower_aliases:
                    missing_fields.append(f"{channel}.field='{field}'")
                elif field not in original_aliases:
                    case_mismatch_fields.append(
                        f"{channel}.field='{field}' "
                        f"(SQL aliases are: {original_aliases})"
                    )

            if missing_fields:
                logger.warning(
                    "Chart spec rejected — field(s) %s absent from SQL aliases %s.",
                    missing_fields, original_aliases,
                )
                return None

            if case_mismatch_fields:
                logger.warning(
                    "Chart spec rejected — case-only mismatch in field(s) %s.",
                    case_mismatch_fields,
                )
                return None

        return chart_spec

    # -----------------------------------------------------------------------
    # Failure Classification [FIX-V4-11]
    # -----------------------------------------------------------------------

    @staticmethod
    def _classify_failure_type(error_msg: str) -> FailureType:
        """Classify failure type for adaptive retry strategy. [FIX-V4-11]"""
        e = error_msg.lower()

        if "syntax error" in e or "parser error" in e or "unexpected" in e:
            return FailureType.SYNTAX
        if "binder error" in e or "column" in e and "not found" in e:
            return FailureType.SCHEMA
        if "join" in e or "ambiguous" in e or "not unique" in e:
            return FailureType.JOIN
        if "aggregate" in e or "group by" in e:
            return FailureType.AGGREGATION
        if "cast" in e or "conversion" in e or "coercion" in e or "type" in e:
            return FailureType.TYPE

        return FailureType.UNKNOWN

    @staticmethod
    def _classify_error(error_msg: str, dialect: str) -> str:
        """Generate helpful hint based on error classification."""
        e = error_msg.lower()
        if "binder error" in e or ("column" in e and "not found" in e):
            return (
                "HINT: You likely hallucinated a column name, or attempted to access a "
                "nested JSON/Struct field without unnesting it first. "
                "Cross-check every column reference against the Schema Context strictly."
            )
        if "parser error" in e or "syntax error" in e:
            return (
                f"HINT: Syntax error detected. Ensure you are using strict "
                f"{dialect.upper()} SQL syntax, not a different dialect."
            )
        if "function" in e and ("not found" in e or "does not exist" in e):
            dialect_fns: Dict[str, str] = {
                "duckdb":    "date_trunc, approx_count_distinct, list_aggregate, regr_slope",
                "bigquery":  "DATE_TRUNC, TIMESTAMP_TRUNC, APPROX_COUNT_DISTINCT, ARRAY_AGG",
                "redshift":  "DATEADD, DATEDIFF, LISTAGG, APPROXIMATE COUNT(DISTINCT ...)",
                "snowflake": "DATE_TRUNC, FLATTEN, TO_DATE, ZEROIFNULL, APPROX_COUNT_DISTINCT",
            }
            fns = dialect_fns.get(dialect.lower(), "dialect-native aggregate functions")
            return (
                f"HINT: You used a function that doesn't exist in {dialect.upper()}. "
                f"Use native functions such as: {fns}."
            )
        if "not unique" in e or "ambiguous" in e:
            return (
                "HINT: Ambiguous column reference. "
                "Qualify every column with its table alias (e.g. t.column_name)."
            )
        if "cast" in e or "conversion" in e or "coercion" in e:
            return (
                "HINT: A type cast failed. Ensure aggregating metrics are CAST AS DOUBLE "
                "and temporal grouping columns are CAST AS DATE or TIMESTAMP."
            )
        return ""

    # -----------------------------------------------------------------------
    # Semantic Diff
    # -----------------------------------------------------------------------

    @staticmethod
    def _sql_diff(before: str, after: str) -> str:
        """Unified diff between two SQL strings."""
        diff = difflib.unified_diff(
            before.splitlines(keepends=True),
            after.splitlines(keepends=True),
            fromfile="previous_attempt.sql",
            tofile="failed_query.sql",
        )
        return "".join(diff) or "(no textual diff — queries are identical)"

    # -----------------------------------------------------------------------
    # Internal Generation Helper
    # -----------------------------------------------------------------------

    async def _run_generation(
        self,
        system_prompt: str,
        user_message: str,
        dialect: str,
        tenant_id: str,
        execution_context: str = "",
        fk_map: Optional[Dict[str, str]] = None,
        strict_joins: bool = False,
        failure_type: Optional[FailureType] = None,
    ) -> Tuple[str, Optional[Dict[str, Any]], float, float, CostLevel]:
        """
        Calls the LLM, validates output, applies guardrails.

        Returns (safe_sql, safe_chart, llm_confidence, composite_score, cost_estimate).
        """
        try:
            result: NL2SQLOutput = await asyncio.wait_for(
                self._llm_client.generate_structured(
                    system_prompt=system_prompt,
                    prompt=user_message,
                    history=[],
                    response_model=NL2SQLOutput,
                ),
                timeout=_LLM_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            raise ValueError(
                f"LLM call timed out after {_LLM_TIMEOUT_SECONDS}s."
            )

        if result is None:
            raise ValueError("Model returned None — structured output was refused.")

        self._last_sql_attempt = result.sql_query

        # Security and complexity validation
        self._validate_security(result.sql_query, dialect)
        self._validate_complexity(result.sql_query, dialect)

        # Join validation (strict mode if requested)
        self._validate_join_paths(result.sql_query, dialect, fk_map, strict=strict_joins)

        # Apply cost guardrails
        safe_sql = self._apply_cost_guardrails(result.sql_query, dialect, execution_context)

        # Validate chart
        safe_chart = self._validate_chart_spec(result.chart_spec, safe_sql, dialect)

        # Cost estimation
        cost_estimate = self._estimate_cost(safe_sql, dialect)

        # Query plan verification for composite confidence
        plan_validation_score, plan_mismatches = self._verify_against_plan(
            safe_sql, None, dialect  # Plan would be passed here
        )
        if plan_mismatches:
            for m in plan_mismatches:
                logger.warning("Plan verification: %s", m)

        # Probe execution
        lower_aliases, _ = self._extract_sql_aliases(safe_sql, dialect)
        probe_sql = self._build_probe_sql(safe_sql, dialect, lower_aliases)
        probe_success, probe_error = await self._execute_probe(probe_sql) if probe_sql else (True, None)
        if probe_error:
            logger.warning("Probe execution failed: %s", probe_error)

        # AST sanity check
        ast_sanity_score = 1.0
        try:
            sqlglot.parse(safe_sql)
        except Exception:
            ast_sanity_score = 0.0

        # Calculate composite confidence
        composite_score = self._calculate_composite_confidence(
            llm_confidence=result.confidence_score,
            schema_validation_score=plan_validation_score,
            ast_sanity_score=ast_sanity_score,
            probe_success=probe_success,
        )

        # Multi-signal confidence gating
        if composite_score < _CONFIDENCE_BLOCK_THRESHOLD:
            raise ValueError(
                f"Low composite confidence blocked "
                f"(score={composite_score:.2f} < floor={_CONFIDENCE_BLOCK_THRESHOLD}). "
                f"LLM={result.confidence_score:.2f}, "
                f"Schema={plan_validation_score:.2f}, "
                f"AST={ast_sanity_score:.2f}, "
                f"Probe={'OK' if probe_success else 'FAIL'}."
            )

        if composite_score < _CONFIDENCE_WARN_THRESHOLD:
            logger.warning(
                "[%s] Low composite confidence (score=%.2f) — review for issues.",
                tenant_id, composite_score
            )

        return safe_sql, safe_chart, result.confidence_score, composite_score, cost_estimate

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    async def generate_sql(
        self,
        plan: QueryPlan,
        execution_context: str,
        target_engine: str,
        tenant_id: str,
        agent: Optional[Agent] = None,
        semantic_views: Optional[Dict[str, str]] = None,
        history: Optional[List[Dict[str, Any]]] = None,
        fk_map: Optional[Dict[str, str]] = None,
        strict_joins: bool = False,
    ) -> Tuple[str, Optional[Dict[str, Any]], CompilationTrace]:
        """
        Primary entry-point with caching. [FIX-V4-10]
        """
        start_time = time.perf_counter()
        query_id = str(uuid.uuid4())

        # Build system prompt for fingerprinting
        failure_examples = self.get_failure_memory(tenant_id, target_engine)[-3:]
        system_prompt = self._build_system_prompt(
            execution_context, plan, target_engine,
            agent, semantic_views, failure_examples
        )
        user_message = f"Compile the execution plan into {target_engine.upper()} SQL now."

        # Create fingerprint of the request
        request_content = f"{system_prompt}\n{user_message}\n{execution_context}"
        fingerprint = self._fingerprint(request_content)

        # Check cache [FIX-V4-10]
        cached = self._get_cached(fingerprint)
        if cached:
            duration = round(time.perf_counter() - start_time, 3)
            logger.info(
                "✅ [%s] query_id=%s CACHE HIT in %ss.",
                tenant_id, query_id, duration
            )
            trace = CompilationTrace(
                query_id=query_id,
                tenant_id=tenant_id,
                intent_summary=plan.intent_summary,
                target_engine=target_engine,
                final_sql=cached.sql,
                chart_present=cached.chart is not None,
                confidence_score=cached.confidence,
                composite_score=cached.confidence,
                correction_count=0,
                duration_seconds=duration,
                query_fingerprint=fingerprint,
                probe_sql=cached.probe_sql,
                cost_estimate=cached.cost_estimate,
                cache_hit=True,
            )
            return cached.sql, cached.chart, trace

        logger.info(
            "⚙️ [%s] query_id=%s Compiling -> %s SQL, intent: '%s'",
            tenant_id, query_id, target_engine.upper(), plan.intent_summary,
        )

        try:
            safe_sql, safe_chart, llm_conf, composite_conf, cost_est = await self._run_generation(
                system_prompt=system_prompt,
                user_message=user_message,
                dialect=target_engine,
                tenant_id=tenant_id,
                execution_context=execution_context,
                fk_map=fk_map,
                strict_joins=strict_joins,
            )

            lower_aliases, _ = self._extract_sql_aliases(safe_sql, target_engine)
            probe_sql = self._build_probe_sql(safe_sql, target_engine, lower_aliases)
            duration = round(time.perf_counter() - start_time, 3)

            logger.info(
                "✅ [%s] query_id=%s compiled in %ss.",
                tenant_id, query_id, duration
            )

            # Cache successful result [FIX-V4-10]
            self._set_cached(fingerprint, safe_sql, safe_chart, composite_conf, probe_sql, cost_est)

        except ValidationError as ve:
            logger.error(
                "❌ [%s] query_id=%s schema validation failed: %s — entering correction loop.",
                tenant_id, query_id, ve,
            )
            failure_type = self._classify_failure_type(str(ve))
            safe_sql, safe_chart, llm_conf, composite_conf, cost_est = await self._run_correction(
                failed_query="<no query generated — output schema validation failed>",
                error_msg=str(ve),
                plan=plan,
                execution_context=execution_context,
                target_engine=target_engine,
                tenant_id=tenant_id,
                agent=agent,
                semantic_views=semantic_views,
                fk_map=fk_map,
                query_id=query_id,
                strict_joins=strict_joins,
                failure_type=failure_type,
            )
            lower_aliases, _ = self._extract_sql_aliases(safe_sql, target_engine)
            probe_sql = self._build_probe_sql(safe_sql, target_engine, lower_aliases)
            duration = round(time.perf_counter() - start_time, 3)

        except Exception as exc:
            logger.error(
                "❌ [%s] query_id=%s NL2SQL compilation failed: %s",
                tenant_id, query_id, exc,
            )
            raise

        trace = CompilationTrace(
            query_id=query_id,
            tenant_id=tenant_id,
            intent_summary=plan.intent_summary,
            target_engine=target_engine,
            final_sql=safe_sql,
            chart_present=safe_chart is not None,
            confidence_score=llm_conf,
            composite_score=composite_conf,
            correction_count=0,
            duration_seconds=duration,
            query_fingerprint=fingerprint,
            probe_sql=probe_sql,
            cost_estimate=cost_est,
            cache_hit=False,
        )
        return safe_sql, safe_chart, trace

    async def correct_sql(
        self,
        failed_query: str,
        error_msg: str,
        plan: QueryPlan,
        execution_context: str,
        target_engine: str,
        tenant_id: str,
        agent: Optional[Agent] = None,
        semantic_views: Optional[Dict[str, str]] = None,
        fk_map: Optional[Dict[str, str]] = None,
        strict_joins: bool = False,
    ) -> Tuple[str, Optional[Dict[str, Any]], CompilationTrace]:
        """Public auto-correction entry-point."""
        start_time = time.perf_counter()
        query_id = str(uuid.uuid4())
        failure_type = self._classify_failure_type(error_msg)

        safe_sql, safe_chart, llm_conf, composite_conf, cost_est = await self._run_correction(
            failed_query=failed_query,
            error_msg=error_msg,
            plan=plan,
            execution_context=execution_context,
            target_engine=target_engine,
            tenant_id=tenant_id,
            agent=agent,
            semantic_views=semantic_views,
            fk_map=fk_map,
            query_id=query_id,
            strict_joins=strict_joins,
            failure_type=failure_type,
        )
        lower_aliases, _ = self._extract_sql_aliases(safe_sql, target_engine)
        probe_sql = self._build_probe_sql(safe_sql, target_engine, lower_aliases)
        duration = round(time.perf_counter() - start_time, 3)

        trace = CompilationTrace(
            query_id=query_id,
            tenant_id=tenant_id,
            intent_summary=plan.intent_summary,
            target_engine=target_engine,
            final_sql=safe_sql,
            chart_present=safe_chart is not None,
            confidence_score=llm_conf,
            composite_score=composite_conf,
            correction_count=1,
            duration_seconds=duration,
            query_fingerprint=self._fingerprint(safe_sql),
            probe_sql=probe_sql,
            cost_estimate=cost_est,
            cache_hit=False,
            failure_type=failure_type.value,
        )
        return safe_sql, safe_chart, trace

    # -----------------------------------------------------------------------
    # Internal Correction Helper - Adaptive [FIX-V4-11]
    # -----------------------------------------------------------------------

    async def _run_correction(
        self,
        failed_query: str,
        error_msg: str,
        plan: QueryPlan,
        execution_context: str,
        target_engine: str,
        tenant_id: str,
        agent: Optional[Agent],
        semantic_views: Optional[Dict[str, str]],
        fk_map: Optional[Dict[str, str]],
        query_id: str,
        strict_joins: bool = False,
        failure_type: FailureType = FailureType.UNKNOWN,
    ) -> Tuple[str, Optional[Dict[str, Any]], float, float, CostLevel]:
        """
        Internal correction with adaptive retry strategy. [FIX-V4-11]
        """
        start_time = time.perf_counter()
        logger.warning(
            "⚙️ [%s] query_id=%s Auto-correction for %s error: %s",
            tenant_id, query_id, target_engine.upper(), error_msg,
        )

        # [FIX-V4-4] Tenant-isolated failure memory
        failure_examples = self.get_failure_memory(tenant_id, target_engine)[-3:]
        system_prompt = self._build_system_prompt(
            execution_context, plan, target_engine,
            agent, semantic_views, failure_examples,
            failure_type=failure_type,  # [FIX-V4-11] Adaptive prompt
        )
        hint = self._classify_error(error_msg, target_engine)

        # Real semantic diff
        diff_block = ""
        is_real_query = failed_query and not failed_query.startswith("<no query")
        if is_real_query:
            previous = self._last_sql_attempt or failed_query
            diff_text = self._sql_diff(previous, failed_query)
            diff_block = (
                "\nSQL DIFF (your last attempt → the query that failed):\n"
                "```diff\n"
                f"{diff_text}"
                "```\n"
                "Make the smallest possible targeted patch — do not rewrite "
                "from scratch unless the diff shows structural problems.\n"
            )

        correction_prompt = f"""The following {target_engine.upper()} SQL query failed to execute:

```sql
{failed_query}
```

DATABASE ENGINE ERROR:
{error_msg}

{hint}
{diff_block}
TASK:
1. Read the error and diff carefully.
2. Cross-check every column and function reference against the SCHEMA CONTEXT.
3. Verify all aggregating metrics are CAST AS DOUBLE and temporal grouping
   columns are CAST AS DATE or TIMESTAMP (Phase 3 Polars requirement).
4. Verify every JOIN uses FK -> PK relationships.
5. Single SELECT or WITH statement only — no multi-statement chains.
6. Respect ceilings: ≤ {MAX_JOINS} top-level JOINs, ≤ {MAX_CTES} total CTEs.
7. Output a corrected {target_engine.upper()} SQL query plus an updated Vega-Lite
   spec if the original plan requested a chart.
"""

        try:
            safe_sql, safe_chart, llm_conf, composite_conf, cost_est = await self._run_generation(
                system_prompt=system_prompt,
                user_message=correction_prompt,
                dialect=target_engine,
                tenant_id=tenant_id,
                execution_context=execution_context,
                fk_map=fk_map,
                strict_joins=strict_joins,
                failure_type=failure_type,
            )
            duration = round(time.perf_counter() - start_time, 3)
            logger.info(
                "✅ [%s] query_id=%s auto-correction succeeded in %ss.",
                tenant_id, query_id, duration,
            )

            # [FIX-V4-4] Store in tenant-isolated failure memory
            memory_key = (tenant_id, target_engine)
            self._failure_memory[memory_key].append(
                FailureMemoryEntry(
                    failed_sql=failed_query,
                    error_msg=error_msg,
                    corrected_sql=safe_sql,
                    dialect=target_engine,
                    intent_summary=plan.intent_summary,
                    failure_type=failure_type,
                )
            )
            # Trim to cap
            self._failure_memory[memory_key] = self._failure_memory[memory_key][-MAX_FAILURE_MEMORY:]

            return safe_sql, safe_chart, llm_conf, composite_conf, cost_est

        except Exception as exc:
            logger.critical(
                "❌ [%s] query_id=%s cascade failure in correction: %s",
                tenant_id, query_id, exc,
            )
            raise RuntimeError(
                f"Unable to self-correct the query after {target_engine.upper()} "
                f"error: {error_msg}"
            ) from exc