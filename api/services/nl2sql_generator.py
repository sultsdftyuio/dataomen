"""
ARCLI.TECH - Intelligence Layer
Component: Auto-Correcting NL2SQL Engine (The Compiler)
Strategy: AST Validation, Cost Guardrails, & Schema-Strict Generation

Architectural note
------------------
This module is intentionally schema-context-agnostic.  All RAG ranking and
schema pruning is performed upstream by the QueryPlanner, which passes a
fully-resolved ``execution_context`` string.  Running a second vector-search
here would add 1-2 s of latency and risk dropping the exact columns the
Planner just selected.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

import sqlglot
from sqlglot import exp
from pydantic import BaseModel, Field, ValidationError

from api.services.llm_client import llm_client
from api.services.query_planner import QueryPlan
from models import Agent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Engine name -> sqlglot read/write dialect
_DIALECT_MAP: Dict[str, str] = {
    "duckdb":    "duckdb",
    "bigquery":  "bigquery",
    "redshift":  "postgres",   # sqlglot uses postgres grammar for Redshift
    "snowflake": "snowflake",
}

# Cloud DW dialects that use proprietary extensions (JSON operators, SUPER type,
# STRUCT dot notation) which can confuse the sqlglot AST parser.  For these,
# a ParseError triggers a warning instead of a hard security block so genuine
# DW syntax errors surface from the engine itself rather than from us.
_LENIENT_AST_DIALECTS: Set[str] = {"bigquery", "redshift", "snowflake"}

_CONFIDENCE_WARN_THRESHOLD = 0.6
_DEFAULT_RESULT_LIMIT      = 1_000

# Regex fallback used when sqlglot cannot parse a Cloud DW query.
# Catches destructive SQL keywords even inside proprietary syntax that the
# AST parser cannot tokenise — prevents prompt-injection bypass via obfuscation.
_DESTRUCTIVE_KEYWORD_RE = re.compile(
    r"\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|GRANT|TRUNCATE|REVOKE|REPLACE|MERGE|CALL|EXEC)\b",
    re.IGNORECASE,
)

# Regex fallback used when sqlglot cannot parse a Cloud DW query.
# Detects whether a LIMIT clause already exists so we can append a safe
# default and prevent unbounded full-table scans that cause OOM failures.
_LIMIT_PRESENT_RE = re.compile(r"\bLIMIT\b", re.IGNORECASE)

_VEGA_REQUIRED_KEYS: Set[str] = {"mark", "encoding"}
_VEGA_VALID_MARKS: Set[str] = {
    "bar", "line", "area", "point", "circle", "square",
    "tick", "rule", "text", "geoshape", "arc", "rect",
    "trail", "image", "boxplot", "errorband", "errorbar",
}


# ---------------------------------------------------------------------------
# Data Contract
# ---------------------------------------------------------------------------

class NL2SQLOutput(BaseModel):
    """
    Structured output contract for the LLM.

    The ``reasoning`` field is intentionally ordered first so the model must
    articulate its join path and dialect choices before emitting SQL — this
    chain-of-thought scaffolding measurably reduces hallucinations.
    """

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
# NL2SQL Compiler
# ---------------------------------------------------------------------------

class NL2SQLGenerator:
    """
    Enterprise Auto-Correcting NL2SQL Engine.

    Responsibilities
    ----------------
    * Prompt construction  — execution_context is pre-built by QueryPlanner
    * AST security gate    — SELECT / WITH only; destructive nodes hard-blocked
    * Cost guardrails      — auto-inject LIMIT when absent; warn on SELECT *
    * Join path validation — FK/PK convention check, parquet-path-safe
    * Vega-Lite validation — mark type + SQL-alias alignment; explicit null fallback
    * Correction loop      — Pydantic ValidationError feeds back into correct_sql
    """

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
LEAD ENGINEER'S EXECUTION PLAN:
Execute every step in order.  Do not skip or reorder steps.
<execution_plan>
{plan.model_dump_json(indent=2)}
</execution_plan>

CRITICAL ENGINEERING RULES:
1.  SECURITY BY DESIGN: Output ONLY `SELECT` or `WITH` (CTE) statements.
    NEVER emit INSERT, UPDATE, DELETE, DROP, ALTER, GRANT, or any DDL/DML.
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
    Mixed integer/float types or implicit temporal coercions cause Phase 3 failures.
6.  JOIN CORRECTNESS: Always join on FK -> PK relationships.
    Correct  : orders.user_id = users.id
    Incorrect: orders.id      = users.id
7.  RESULT LIMITING: Always include an explicit LIMIT clause.
    Default to LIMIT {_DEFAULT_RESULT_LIMIT} unless the plan specifies otherwise.

CHARTING RULES (Vega-Lite):
- If the plan implies a visualisation, output a declarative Vega-Lite JSON spec.
- Use 'line' / 'area' for time-series; 'bar' for categorical aggregations.
- ALL SQL output aliases MUST be fully lowercase (e.g. `total_revenue`, not `Total_Revenue`).
  Vega-Lite field matching is strictly case-sensitive; mixed-case aliases produce blank charts.
- Every field name in `encoding` MUST match a SQL output alias exactly (character-for-character).
"""

    # -----------------------------------------------------------------------
    # AST Security Gate
    # -----------------------------------------------------------------------

    _DESTRUCTIVE_NODES = (
        exp.Drop, exp.Delete, exp.Update, exp.Insert,
        exp.AlterTable, exp.Command, exp.Commit, exp.Rollback,
        exp.Create, exp.Grant, exp.Pragma,
    )

    @staticmethod
    def _regex_security_scan(sql: str, dialect: str) -> None:
        """
        Last-resort security check used when sqlglot cannot parse the query
        (typically proprietary Cloud DW syntax).

        Scans the raw SQL string for destructive keywords via regex.  This is
        intentionally conservative: a false positive on an identifier that
        happens to contain a keyword (e.g. a column named ``insert_date``) is
        acceptable — the user can rename the alias — whereas a missed
        ``DROP TABLE`` injection is not.

        Raises ``ValueError`` on any match.
        """
        match = _DESTRUCTIVE_KEYWORD_RE.search(sql)
        if match:
            raise ValueError(
                f"Security Violation (regex gate): destructive keyword "
                f"'{match.group().upper()}' detected in query submitted for "
                f"{dialect.upper()} dialect."
            )

    def _validate_security(self, sql: str, dialect: str) -> None:
        """
        Two-layer security gate: AST inspection (primary) + regex scan
        (fallback for Cloud DW dialects where sqlglot may not parse cleanly).

        Layer 1 — AST (all dialects):
            Hard-blocks non-SELECT / non-CTE root nodes and any destructive
            node found anywhere in the expression tree.

        Layer 2 — Regex (lenient dialects only, on ParseError):
            Cloud DW engines (BigQuery, Redshift, Snowflake) use proprietary
            extensions (STRUCT dot-notation, SUPER type, FLATTEN) that can
            confuse sqlglot.  When parsing fails for these dialects we fall
            back to a regex keyword scan rather than returning early, so the
            gate is never fully bypassed by obfuscated prompt injection.
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        is_lenient      = dialect.lower() in _LENIENT_AST_DIALECTS

        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError as exc:
            if is_lenient:
                logger.warning(
                    "AST parse warning (%s dialect) — proprietary syntax suspected. "
                    "Falling back to regex security scan before forwarding to engine. "
                    "Parse details: %s",
                    dialect, exc,
                )
                # Regex scan replaces the AST check; raises on any destructive hit.
                self._regex_security_scan(sql, dialect)
                return
            logger.error("SQL parse error (%s dialect): %s", dialect, exc)
            raise ValueError(
                f"Query is malformed or attempts syntax obfuscation "
                f"({dialect} dialect). Details: {exc}"
            ) from exc

        for statement in statements:
            if statement is None:
                continue

            if not isinstance(statement, (exp.Select, exp.With, exp.Subquery)):
                logger.critical(
                    "AST root violation blocked: expected SELECT/WITH, got %s",
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
    # Cost Guardrails
    # -----------------------------------------------------------------------

    def _apply_cost_guardrails(self, sql: str, dialect: str) -> str:
        """
        Enforces two cost guardrails:

        1. Warns on SELECT * (full-table column scans).
        2. Injects ``LIMIT {_DEFAULT_RESULT_LIMIT}`` when the terminal SELECT
           has none — preventing unbounded scans that cause OOM failures.

        AST path (primary)
        ------------------
        Uses sqlglot to locate and patch the terminal SELECT node precisely.

        Regex path (fallback)
        ---------------------
        When sqlglot cannot parse the query (Cloud DW proprietary syntax), a
        regex check determines whether a LIMIT clause is already present.  If
        not, ``\\nLIMIT {_DEFAULT_RESULT_LIMIT}`` is appended to the raw
        string.  This is intentionally conservative — appending at the end is
        always syntactically valid for standard SQL and all supported dialects.
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            # Regex fallback — guard against OOM on unparseable Cloud DW queries.
            if not _LIMIT_PRESENT_RE.search(sql):
                logger.warning(
                    "Cost guardrail (regex fallback): no LIMIT detected in "
                    "unparseable %s query — appending LIMIT %d to prevent "
                    "unbounded full-table scan.",
                    dialect.upper(),
                    _DEFAULT_RESULT_LIMIT,
                )
                return f"{sql.rstrip()}\nLIMIT {_DEFAULT_RESULT_LIMIT}"
            return sql

        modified = False

        for statement in statements:
            if statement is None:
                continue

            for node, *_ in statement.walk():
                if isinstance(node, exp.Star):
                    logger.warning(
                        "Cost guardrail: SELECT * detected — "
                        "explicit column selection reduces full-table scan cost."
                    )
                    break

            # Find the terminal SELECT (unwrap CTEs)
            terminal: Optional[exp.Select] = None
            if isinstance(statement, exp.With):
                inner = getattr(statement, "this", None)
                if isinstance(inner, exp.Select):
                    terminal = inner
            elif isinstance(statement, exp.Select):
                terminal = statement

            if terminal is not None and terminal.args.get("limit") is None:
                terminal.set(
                    "limit",
                    exp.Limit(this=exp.Literal.number(_DEFAULT_RESULT_LIMIT)),
                )
                modified = True

        if modified:
            logger.info(
                "Cost guardrail: auto-injected LIMIT %d into query.",
                _DEFAULT_RESULT_LIMIT,
            )
            return " ".join(
                s.sql(dialect=sqlglot_dialect) for s in statements if s is not None
            )

        return sql

    # -----------------------------------------------------------------------
    # Join Path Validation  (parquet-path-safe)
    # -----------------------------------------------------------------------

    def _validate_join_paths(self, sql: str, dialect: str) -> None:
        """
        Emits a warning when a JOIN ON clause does not reference any column
        that follows a FK/PK naming convention (`id` or `*_id`).

        Implementation note — parquet-path safety
        -----------------------------------------
        The previous implementation attempted to cross-reference join columns
        against schema dictionary keys.  For DuckDB, those keys are
        ``read_parquet('...')`` path strings that bear no resemblance to the
        short table aliases the SQL AST produces, causing every join to be
        flagged as invalid.

        This implementation inspects only the AST itself: it checks whether
        *at least one* column in each JOIN ON clause ends with ``_id`` or is
        literally ``id`` — a lightweight but reliable FK/PK signal that works
        regardless of how the table is referenced in the FROM clause.
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            return  # Security gate already handled parse errors

        for statement in statements:
            if statement is None:
                continue
            for join in statement.find_all(exp.Join):
                on_clause = join.args.get("on")
                if on_clause is None:
                    continue
                join_cols = [
                    col.name.lower() for col in on_clause.find_all(exp.Column)
                ]
                if not join_cols:
                    continue
                if not any(c == "id" or c.endswith("_id") for c in join_cols):
                    logger.warning(
                        "Join path warning: no FK/PK column pattern found in "
                        "JOIN ON (columns: [%s]). "
                        "Verify the predicate uses the correct FK -> PK relationship.",
                        ", ".join(join_cols),
                    )

    # -----------------------------------------------------------------------
    # Chart Spec Validation
    # -----------------------------------------------------------------------

    def _extract_sql_aliases(self, sql: str, dialect: str) -> Tuple[Set[str], Set[str]]:
        """
        Returns ``(lowercase_aliases, original_case_aliases)`` for all output
        expressions in the terminal SELECT.

        Two sets are returned so callers can:
        * Use ``lowercase_aliases`` for case-insensitive existence checks.
        * Use ``original_case_aliases`` to detect case-only mismatches that
          pass backend validation but would produce blank Vega-Lite charts
          (Vega-Lite field matching is strictly case-sensitive on the frontend).
        """
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
        """
        Validates a Vega-Lite spec and returns either the validated spec or an
        explicit ``None`` — a clean null signal telling the frontend to render
        a standard data table rather than an empty or broken canvas.

        Failure modes caught
        --------------------
        * ``None`` or empty dict (LLMs sometimes return ``{}`` instead of null)
        * Missing required keys (``mark``, ``encoding``)
        * Unrecognised ``mark`` type
        * ``encoding.*.field`` values with no matching SQL output alias
        * ``encoding.*.field`` values that match only case-insensitively —
          Vega-Lite field matching is strictly case-sensitive on the frontend,
          so a SQL alias of ``Total_Revenue`` paired with a chart field of
          ``total_revenue`` would pass a lowercase-only check but render as
          a blank box for the user.
        """
        # Fix: treat empty dict as absent — LLMs sometimes return {} instead of null.
        if not chart_spec:
            return None

        missing = _VEGA_REQUIRED_KEYS - set(chart_spec.keys())
        if missing:
            logger.warning(
                "Chart spec rejected — missing key(s) %s. Frontend will render table.",
                missing,
            )
            return None

        mark = chart_spec.get("mark")
        if isinstance(mark, dict):
            mark = mark.get("type", "")
        if str(mark).lower() not in _VEGA_VALID_MARKS:
            logger.warning(
                "Chart spec rejected — unrecognised mark '%s'. Frontend will render table.",
                mark,
            )
            return None

        lower_aliases, original_aliases = self._extract_sql_aliases(sql, dialect)

        if lower_aliases:
            encoding = chart_spec.get("encoding", {})
            missing_fields: List[str] = []
            case_mismatch_fields: List[str] = []

            for channel, channel_def in encoding.items():
                if not isinstance(channel_def, dict):
                    continue
                field = channel_def.get("field", "")
                if not field:
                    continue
                if field.lower() not in lower_aliases:
                    # Field doesn't exist at all in the SQL output.
                    missing_fields.append(f"{channel}.field='{field}'")
                elif field not in original_aliases:
                    # Field exists but with a different case — would break
                    # Vega-Lite's case-sensitive field lookup on the frontend.
                    case_mismatch_fields.append(
                        f"{channel}.field='{field}' "
                        f"(SQL aliases are case-sensitive: {original_aliases})"
                    )

            if missing_fields:
                logger.warning(
                    "Chart spec rejected — field(s) %s not present in SQL aliases %s. "
                    "Frontend will render table.",
                    missing_fields,
                    original_aliases,
                )
                return None

            if case_mismatch_fields:
                logger.warning(
                    "Chart spec rejected — field(s) %s match only case-insensitively. "
                    "Vega-Lite requires exact case matching; frontend will render table. "
                    "Ensure SQL aliases are fully lowercase to prevent this mismatch.",
                    case_mismatch_fields,
                )
                return None

        return chart_spec

    # -----------------------------------------------------------------------
    # Error Classification
    # -----------------------------------------------------------------------

    @staticmethod
    def _classify_error(error_msg: str, dialect: str) -> str:
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
                "HINT: Ambiguous column reference detected. "
                "Qualify every column with its table alias (e.g. t.column_name)."
            )
        if "cast" in e or "conversion" in e or "coercion" in e:
            return (
                "HINT: A type cast failed. Ensure all aggregating metrics are "
                "CAST AS DOUBLE and all temporal grouping columns are CAST AS DATE "
                "or TIMESTAMP, as required by the Phase 3 Polars compute engine."
            )
        return ""

    # -----------------------------------------------------------------------
    # Internal Generation Helper
    # -----------------------------------------------------------------------

    async def _run_generation(
        self,
        system_prompt: str,
        user_message: str,
        dialect: str,
        tenant_id: str,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Calls the LLM, validates the NL2SQLOutput contract, applies all
        guardrails, and returns ``(safe_sql, safe_chart)``.

        Raises on any failure so the caller decides the retry strategy.
        This consolidates the identical try-block that previously existed in
        both ``generate_sql`` and ``correct_sql``.
        """
        result: NL2SQLOutput = await llm_client.generate_structured(
            system_prompt=system_prompt,
            prompt=user_message,
            history=[],
            response_model=NL2SQLOutput,
        )

        if result is None:
            raise ValueError("Model returned None — structured output was refused.")

        self._validate_security(result.sql_query, dialect)
        self._validate_join_paths(result.sql_query, dialect)
        safe_sql   = self._apply_cost_guardrails(result.sql_query, dialect)
        safe_chart = self._validate_chart_spec(result.chart_spec, safe_sql, dialect)

        if result.confidence_score < _CONFIDENCE_WARN_THRESHOLD:
            logger.warning(
                "[%s] Low-confidence SQL generation (score=%.2f) — "
                "review for potential hallucinations.",
                tenant_id,
                result.confidence_score,
            )

        return safe_sql, safe_chart

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
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Primary entry-point.

        Translates a ``QueryPlan`` and a pre-built ``execution_context``
        (produced by the QueryPlanner) into validated, cost-guarded SQL.

        Pydantic ValidationError handling
        ----------------------------------
        If the LLM returns a structurally invalid response (wrong field types,
        missing required fields), a raw ``ValidationError`` would previously
        escape to the caller.  Instead, the error is now fed back into
        ``correct_sql`` so the model gets one self-heal pass with explicit
        guidance about the schema violation.
        """
        logger.info("[%s] Compiling QueryPlan -> %s SQL", tenant_id, target_engine.upper())

        system_prompt = self._build_system_prompt(
            execution_context, plan, target_engine, agent, semantic_views
        )
        user_message = f"Compile the execution plan into {target_engine.upper()} SQL now."

        try:
            safe_sql, safe_chart = await self._run_generation(
                system_prompt=system_prompt,
                user_message=user_message,
                dialect=target_engine,
                tenant_id=tenant_id,
            )
            logger.info("[%s] SQL compiled successfully.", tenant_id)
            return safe_sql, safe_chart

        except ValidationError as ve:
            # Feed the schema-validation failure back into the correction loop
            # so the model can attempt to self-heal with explicit guidance.
            logger.error(
                "[%s] Output schema validation failed: %s — triggering correction loop.",
                tenant_id,
                ve,
            )
            return await self.correct_sql(
                failed_query="<no query generated — output schema validation failed>",
                error_msg=str(ve),
                plan=plan,
                execution_context=execution_context,
                target_engine=target_engine,
                tenant_id=tenant_id,
                agent=agent,
                semantic_views=semantic_views,
            )

        except Exception as exc:
            logger.error("[%s] NL2SQL compilation failed: %s", tenant_id, exc)
            raise

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
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Auto-correction loop.

        Given a failed query and its error message, constructs a targeted
        correction prompt enriched with a dialect-specific hint and attempts
        one self-heal pass through the LLM.

        Raises ``RuntimeError`` on cascade failure so the orchestrator can
        surface a clean error to the API layer.
        """
        logger.warning(
            "[%s] Initiating SQL auto-correction for %s error: %s",
            tenant_id,
            target_engine.upper(),
            error_msg,
        )

        system_prompt = self._build_system_prompt(
            execution_context, plan, target_engine, agent, semantic_views
        )
        hint = self._classify_error(error_msg, target_engine)

        correction_prompt = f"""The following {target_engine.upper()} SQL query failed to execute:

```sql
{failed_query}
```

DATABASE ENGINE ERROR:
{error_msg}

{hint}

TASK:
1. Read the error message carefully.
2. Cross-check every column and function reference against the SCHEMA CONTEXT.
3. Verify all aggregating metrics are CAST AS DOUBLE and all temporal grouping
   columns are CAST AS DATE or TIMESTAMP (Phase 3 Polars engine requirement).
4. Verify every JOIN uses FK -> PK relationships
   (e.g. orders.user_id = users.id, NOT orders.id = users.id).
5. Output a corrected, highly-optimised {target_engine.upper()} SQL query that satisfies
   the original Execution Plan, plus an updated Vega-Lite chart spec if applicable.
"""

        try:
            safe_sql, safe_chart = await self._run_generation(
                system_prompt=system_prompt,
                user_message=correction_prompt,
                dialect=target_engine,
                tenant_id=tenant_id,
            )
            logger.info("[%s] SQL auto-correction succeeded.", tenant_id)
            return safe_sql, safe_chart

        except Exception as exc:
            logger.critical(
                "[%s] Cascade failure in SQL auto-correction: %s", tenant_id, exc
            )
            raise RuntimeError(
                f"Unable to self-correct the query after {target_engine.upper()} "
                f"error: {error_msg}"
            ) from exc


# ---------------------------------------------------------------------------
# Global Singleton
# ---------------------------------------------------------------------------
sql_generator = NL2SQLGenerator()