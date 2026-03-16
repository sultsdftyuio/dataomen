import json
import logging
import re
import numpy as np
from numpy.linalg import norm
from typing import Any, Dict, List, Optional, Tuple

from api.services.llm_client import llm_client

import sqlglot
from sqlglot import exp
from pydantic import BaseModel, Field

from api.services.query_planner import QueryPlan
from models import Agent, Dataset

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Contracts
# ---------------------------------------------------------------------------

class NL2SQLOutput(BaseModel):
    """
    Structured output contract for the LLM.
    Enforces chain-of-thought reasoning before SQL emission to reduce hallucinations
    and improve mathematical accuracy.
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
# NL2SQL Compiler Agent
# ---------------------------------------------------------------------------

# Internal dialect map: our engine names → sqlglot read dialect
_DIALECT_MAP: Dict[str, str] = {
    "duckdb": "duckdb",
    "bigquery": "bigquery",
    "redshift": "postgres",   # sqlglot uses postgres rules for Redshift
}

# Minimum confidence before we log a warning
_CONFIDENCE_WARN_THRESHOLD = 0.6

# Maximum columns injected into the LLM context to prevent token bloat
_MAX_COLUMNS_PER_CONTEXT = 25


class NL2SQLGenerator:
    """
    Enterprise RAG & Auto-Correcting NL2SQL Engine.

    Design principles
    -----------------
    * **Plan-driven pruning** – The ``QueryPlan`` from the upstream planner
      provides an explicit column allowlist that deterministically narrows the
      schema before semantic scoring begins.
    * **Hybrid RAG** – Within the allowlisted columns, a weighted combination
      of cosine-vector similarity, keyword overlap, and analytical-type
      heuristics ranks remaining columns when the schema is still too wide.
    * **Dialect-aware** – Generates and validates native SQL for DuckDB,
      BigQuery, or Redshift.
    * **Zero-copy DuckDB execution** – For DuckDB, table names are remapped to
      ``read_parquet(file_path)`` sources so data is never loaded into RAM
      beyond what DuckDB's vectorised engine requires.
    * **Deep-AST security gate** – sqlglot tree traversal blocks all
      destructive operations, including nested injection attempts.
    * **Intelligent self-correction** – Database engine errors are classified
      and annotated with targeted hints before the LLM retries.
    * **Centralised LLM singleton** – All model interactions are routed through
      the platform-wide ``llm_client`` singleton, inheriting automatic retries,
      exponential backoff, and shared embedding logic.
    """

    def __init__(self) -> None:
        pass  # LLM interactions are routed through the platform-wide llm_client singleton.

    # -----------------------------------------------------------------------
    # Schema Pruning  (Plan-driven → Hybrid RAG)
    # -----------------------------------------------------------------------

    def _prune_by_plan(
        self,
        plan: QueryPlan,
        full_schema: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Dict[str, Any]]:
        """
        **Stage 1 – Deterministic allowlist pruning.**

        Uses the QueryPlan's explicit ``columns_involved`` sets to filter the
        schema to only what the planner requested, plus all PK/FK columns
        (anything ending in ``_id`` or named ``id``) which are always required
        for joins.  This alone eliminates the majority of irrelevant columns
        before any embedding calls are made.
        """
        required: set[str] = set()
        for step in plan.steps:
            required.update(step.columns_involved)

        pruned: Dict[str, Dict[str, Any]] = {}
        for table, columns in full_schema.items():
            pruned[table] = {
                col_name: col_meta
                for col_name, col_meta in columns.items()
                if col_name in required
                or col_name.endswith("_id")
                or col_name == "id"
            }

        return pruned

    @staticmethod
    def _cosine_similarity(v1: np.ndarray, v2: np.ndarray) -> float:
        n1, n2 = norm(v1), norm(v2)
        if n1 == 0 or n2 == 0:
            return 0.0
        return float(np.dot(v1, v2) / (n1 * n2))

    async def _rank_columns_by_relevance(
        self,
        prompt: str,
        columns: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        **Stage 2 – Hybrid RAG ranking** (runs only when column count still
        exceeds ``_MAX_COLUMNS_PER_CONTEXT`` after plan pruning).

        Scoring weights
        ~~~~~~~~~~~~~~~
        +20  Vector cosine similarity (semantic intent vs. column document)
        +15  Exact keyword match between prompt tokens and column name
        + 8  Partial keyword match in column name (token len > 3)
        + 8  Keyword match in column description
        +10  Temporal column boost when prompt expresses time/trend intent
        + 8  Numeric column boost when prompt expresses aggregation intent
        + 4  PK/FK column boost (always useful for joins)
        """
        if len(columns) <= _MAX_COLUMNS_PER_CONTEXT:
            return columns

        prompt_lower = prompt.lower()
        keywords = set(re.findall(r"\w+", prompt_lower))
        vector_scores: Dict[str, float] = {}

        # --- Vector scoring (best-effort; falls back gracefully) -----------
        try:
            prompt_emb = np.array(await llm_client.embed(prompt))
            col_names = list(columns.keys())
            docs = [
                (
                    f"Column: {name}. "
                    f"Type: {columns[name].get('type', '')}. "
                    f"Description: {columns[name].get('description', '')}. "
                    f"Examples: {', '.join(str(s) for s in columns[name].get('samples', [])[:3])}"
                )
                for name in col_names
            ]
            col_embs = await llm_client.embed_batch(docs)
            for name, emb in zip(col_names, col_embs):
                vector_scores[name] = self._cosine_similarity(
                    prompt_emb, np.array(emb)
                )
        except Exception as exc:
            logger.warning(
                "Vector retrieval failed (%s). Falling back to deterministic heuristics.",
                exc,
            )

        # --- Deterministic scoring ----------------------------------------
        time_keywords = {"date", "time", "year", "month", "day", "trend", "predict", "forecast"}
        agg_keywords  = {"total", "sum", "average", "revenue", "count", "metrics", "stats"}
        time_intent   = bool(time_keywords & keywords)
        agg_intent    = bool(agg_keywords  & keywords)

        scored: List[Tuple[float, str, Any]] = []
        for col_name, col_meta in columns.items():
            col_lower = col_name.lower()
            col_type  = str(col_meta.get("type", "")).upper()
            score: float = 0.0

            if col_lower in keywords:
                score += 15
            if any(k in col_lower for k in keywords if len(k) > 3):
                score += 8
            if any(k in col_meta.get("description", "").lower() for k in keywords if len(k) > 3):
                score += 8
            if time_intent and any(t in col_type for t in ("DATE", "TIMESTAMP", "TIME")):
                score += 10
            if agg_intent and any(t in col_type for t in ("INT", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC")):
                score += 8
            if col_lower.endswith("_id") or col_lower == "id":
                score += 4

            score += vector_scores.get(col_name, 0.0) * 20
            scored.append((score, col_name, col_meta))

        scored.sort(key=lambda x: x[0], reverse=True)
        return {
            name: {
                "type":        meta.get("type", "UNKNOWN"),
                "samples":     meta.get("samples", [])[:5],
                "description": meta.get("description", ""),
            }
            for _, name, meta in scored[:_MAX_COLUMNS_PER_CONTEXT]
        }

    # -----------------------------------------------------------------------
    # Dataset → Schema hydration (DuckDB zero-copy path)
    # -----------------------------------------------------------------------

    @staticmethod
    def _build_schema_from_datasets(datasets: List[Dataset]) -> Dict[str, Dict[str, Any]]:
        """
        Converts a list of ``Dataset`` ORM objects into the ``full_schema`` dict
        expected by the pruning / RAG pipeline, keying each table by its
        DuckDB ``read_parquet(file_path)`` source command so the LLM receives
        the physically-correct table reference for zero-copy execution.
        """
        schema: Dict[str, Dict[str, Any]] = {}
        for ds in datasets:
            source_key = f"read_parquet('{ds.file_path}')"
            cols = ds.schema_metadata or {}
            schema[source_key] = {
                col_name: {"type": dtype, "samples": [], "description": ""}
                for col_name, dtype in cols.items()
            }
        return schema

    async def _build_contextual_schema(
        self,
        plan: QueryPlan,
        full_schema: Dict[str, Dict[str, Any]],
        prompt: str,
    ) -> str:
        """
        Combines plan-driven pruning and hybrid RAG ranking into a single,
        token-efficient JSON schema block for the LLM.

        The two-stage pipeline ensures:
        - Only columns the planner explicitly requested are ever considered.
        - If those columns still exceed the context budget, semantic scoring
          further narrows the list without losing join keys.
        """
        # Stage 1: deterministic plan pruning
        plan_pruned = self._prune_by_plan(plan, full_schema)

        # Stage 2: hybrid RAG ranking per table (if still over budget)
        result: Dict[str, Any] = {}
        for table, columns in plan_pruned.items():
            result[table] = await self._rank_columns_by_relevance(prompt, columns)

        return json.dumps(result, indent=2)

    # -----------------------------------------------------------------------
    # Prompt Construction
    # -----------------------------------------------------------------------

    def _build_system_prompt(
        self,
        contextual_schema: str,
        plan: QueryPlan,
        dialect: str,
        agent: Optional[Agent] = None,
        semantic_views: Optional[Dict[str, str]] = None,
    ) -> str:
        views_block = ""
        if semantic_views:
            views_block = (
                "\nVERIFIED METRIC VIEWS (GOLD TIER):\n"
                "Use these pre-calculated CTE definitions for complex metrics:\n"
                f"{json.dumps(semantic_views, indent=2)}\n"
            )

        # Inject agent role context when available so the LLM can tailor
        # metric selection and output framing to the requesting persona.
        agent_block = ""
        if agent:
            agent_block = f"\nAGENT CONTEXT:\n{agent.role_description}\n"

        return f"""You are an elite Data Engineer and SQL optimiser for an Enterprise Analytical SaaS.
Your objective is to execute the provided Execution Plan by translating it into highly optimised, \
read-only {dialect.upper()} SQL.

TARGET DIALECT: {dialect.upper()}
Always use functions and syntax native to {dialect.upper()}.
{agent_block}
SCHEMA CONTEXT (Pruned + semantically ranked subset):
<schema_context>
{contextual_schema}
</schema_context>
{views_block}
LEAD ENGINEER'S EXECUTION PLAN:
Execute every step in order. Do not skip or reorder steps.
<execution_plan>
{plan.model_dump_json(indent=2)}
</execution_plan>

CRITICAL ENGINEERING RULES:
1. SECURITY BY DESIGN: Output ONLY `SELECT` or `WITH` (CTE) statements. NEVER emit INSERT, UPDATE,
   DELETE, DROP, ALTER, GRANT, or any DDL/DML.
2. NO HALLUCINATIONS: Use ONLY columns and tables present in the Schema Context above. If a value
   cannot be computed from available columns, use COALESCE or arithmetic on real columns.
3. DATA GROUNDING: Honour the 'samples' in the schema for filter literals. Case matters
   (e.g. if samples show 'ACTIVE', do not filter by 'active').
4. DIALECT-SPECIFIC HANDLING:
   - BigQuery  : UNNEST() for arrays, struct dot notation, TIMESTAMP_TRUNC / DATE_TRUNC.
   - DuckDB    : UNNEST(), list comprehensions, date_trunc(), strptime(), approx_count_distinct().
                 Table names are read_parquet('...') sources — use them verbatim as the FROM target.
   - Redshift  : JSON_EXTRACT_PATH_TEXT(), SUPER type navigation, DATEADD / DATEDIFF.
5. TABLE REFERENCING: Wrap table names in double-quotes to prevent reserved-keyword conflicts.
6. MATHEMATICAL PRECISION: Prefer vectorised aggregate functions native to {dialect.upper()}
   (e.g. corr(), regr_slope(), stddev_pop(), percentile_cont()).

CHARTING RULES (Vega-Lite):
- If `suggested_visualizations` is non-empty in the plan, output a declarative Vega-Lite JSON spec.
- Field names in the spec MUST match SQL output aliases exactly.
- Use 'line'/'area' marks for time-series; 'bar' for categorical aggregations.
"""

    # -----------------------------------------------------------------------
    # AST Security Gate
    # -----------------------------------------------------------------------

    _DESTRUCTIVE_NODES = (
        exp.Drop, exp.Delete, exp.Update, exp.Insert,
        exp.AlterTable, exp.Command, exp.Commit, exp.Rollback,
        exp.Create, exp.Grant, exp.Pragma,
    )

    def _validate_security(self, sql: str, dialect: str) -> None:
        """
        Deep-AST security validator.

        Parses the SQL with sqlglot for the target dialect, then:
        1. Verifies the root statement is SELECT or a CTE (WITH … SELECT).
        2. Walks the full AST to detect any destructive node buried inside
           subqueries, CTEs, or EXECUTE-style injection attempts.

        Raises ``ValueError`` on any violation.
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError as exc:
            logger.error("SQL parse error (%s dialect): %s", dialect, exc)
            raise ValueError(
                f"Query is malformed or attempts syntax obfuscation "
                f"({dialect} dialect). Details: {exc}"
            ) from exc

        for statement in statements:
            if statement is None:
                continue

            if not isinstance(statement, (exp.Select, exp.Subquery)):
                logger.critical(
                    "AST root violation blocked: expected SELECT, got %s",
                    type(statement).__name__,
                )
                raise ValueError(
                    "Security Violation: Only SELECT / WITH (CTE) statements are permitted."
                )

            for node, *_ in statement.walk():
                if isinstance(node, self._DESTRUCTIVE_NODES):
                    logger.critical(
                        "Deep AST violation: destructive node %s inside query.",
                        type(node).__name__,
                    )
                    raise ValueError(
                        f"Security Violation: Destructive operation "
                        f"({type(node).__name__}) is strictly forbidden."
                    )

    # -----------------------------------------------------------------------
    # Error Classification
    # -----------------------------------------------------------------------

    @staticmethod
    def _classify_error(error_msg: str, dialect: str) -> str:
        """
        Maps common database engine error patterns to targeted correction hints,
        reducing the number of LLM retries required.
        """
        e = error_msg.lower()

        if ("binder error" in e) or ("column" in e and "not found" in e):
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
            dialect_fns = {
                "duckdb":   "date_trunc, approx_count_distinct, list_aggregate, regr_slope",
                "bigquery": "DATE_TRUNC, TIMESTAMP_TRUNC, APPROX_COUNT_DISTINCT, ARRAY_AGG",
                "redshift": "DATEADD, DATEDIFF, LISTAGG, APPROXIMATE COUNT(DISTINCT …)",
            }
            fns = dialect_fns.get(dialect.lower(), "dialect-native aggregate functions")
            return (
                f"HINT: You used a function that doesn't exist in {dialect.upper()}. "
                f"Use native functions such as: {fns}."
            )
        if "not unique" in e or "ambiguous" in e:
            return (
                "HINT: An ambiguous column reference exists. "
                "Qualify every column with its table alias (e.g., t.column_name)."
            )

        return ""   # No specific hint; let the LLM infer from the raw error

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    async def generate_sql(
        self,
        plan: QueryPlan,
        full_schema: Dict[str, Dict[str, Any]],
        target_engine: str,
        tenant_id: str,
        prompt: str = "",
        agent: Optional[Agent] = None,
        datasets: Optional[List[Dataset]] = None,
        semantic_views: Optional[Dict[str, str]] = None,
        history: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Translates a ``QueryPlan`` into executable, secure SQL for the target engine.

        Parameters
        ----------
        plan:           Upstream planner's execution plan (column allowlist + steps).
        full_schema:    Complete warehouse schema keyed by table name.
        target_engine:  One of ``"duckdb"``, ``"bigquery"``, ``"redshift"``.
        tenant_id:      Used for scoped log correlation.
        prompt:         Original natural-language question (used for semantic ranking).
        agent:          Optional agent whose role description is injected into the
                        system prompt to tailor metric selection and output framing.
        datasets:       Optional list of ``Dataset`` ORM objects. When provided and
                        ``target_engine`` is ``"duckdb"``, table names are remapped
                        to ``read_parquet(file_path)`` sources for zero-copy execution.
        semantic_views: Pre-calculated CTE/metric view definitions (gold tier).
        history:        Prior conversation turns for multi-turn context.

        Returns
        -------
        (sql_query, chart_spec)  where ``chart_spec`` may be ``None``.
        """
        logger.info("[%s] Compiling QueryPlan → %s SQL", tenant_id, target_engine.upper())

        # For DuckDB, prefer the Dataset file-path schema so the LLM receives
        # physically-correct read_parquet(...) table references.
        effective_schema = (
            self._build_schema_from_datasets(datasets)
            if datasets and target_engine.lower() == "duckdb"
            else full_schema
        )

        contextual_schema = await self._build_contextual_schema(plan, effective_schema, prompt)
        system_prompt = self._build_system_prompt(
            contextual_schema, plan, target_engine, agent, semantic_views
        )
        user_message = f"Compile the execution plan into {target_engine.upper()} SQL now."

        try:
            result: NL2SQLOutput = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=user_message,
                history=history or [],
                response_model=NL2SQLOutput,
            )

            if result is None:
                raise ValueError("Model refused to generate SQL (returned None).")

            self._validate_security(result.sql_query, target_engine)

            if result.confidence_score < _CONFIDENCE_WARN_THRESHOLD:
                logger.warning(
                    "[%s] Low-confidence SQL generation (score=%.2f). "
                    "Review for potential hallucinations.",
                    tenant_id, result.confidence_score,
                )

            logger.info(
                "[%s] SQL compiled successfully (confidence=%.2f).",
                tenant_id, result.confidence_score,
            )
            return result.sql_query, result.chart_spec

        except Exception as exc:
            logger.error("[%s] NL2SQL compilation failed: %s", tenant_id, exc)
            raise

    async def correct_sql(
        self,
        failed_query: str,
        error_msg: str,
        plan: QueryPlan,
        full_schema: Dict[str, Dict[str, Any]],
        target_engine: str,
        tenant_id: str,
        prompt: str = "",
        agent: Optional[Agent] = None,
        datasets: Optional[List[Dataset]] = None,
        semantic_views: Optional[Dict[str, str]] = None,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Intelligent error-feedback loop.

        Classifies the database engine error, injects a targeted correction
        hint, and retries generation.  Raises ``RuntimeError`` on cascade
        failure so the caller can surface a clean message to the end-user.
        """
        logger.warning(
            "[%s] Initiating SQL auto-correction for %s error: %s",
            tenant_id, target_engine.upper(), error_msg,
        )

        effective_schema = (
            self._build_schema_from_datasets(datasets)
            if datasets and target_engine.lower() == "duckdb"
            else full_schema
        )

        contextual_schema = await self._build_contextual_schema(plan, effective_schema, prompt)
        system_prompt = self._build_system_prompt(
            contextual_schema, plan, target_engine, agent, semantic_views
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
3. Output a corrected, highly-optimised {target_engine.upper()} SQL query that satisfies
   the original Execution Plan, plus an updated Vega-Lite chart spec if applicable.
"""

        try:
            result: NL2SQLOutput = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=correction_prompt,
                history=[],
                response_model=NL2SQLOutput,
            )

            self._validate_security(result.sql_query, target_engine)

            logger.info(
                "[%s] SQL auto-correction succeeded (confidence=%.2f).",
                tenant_id, result.confidence_score,
            )
            return result.sql_query, result.chart_spec

        except Exception as exc:
            logger.critical(
                "[%s] Cascade failure in SQL auto-correction: %s", tenant_id, exc
            )
            raise RuntimeError(
                f"Unable to self-correct the query after {target_engine.upper()} error: {error_msg}"
            ) from exc


# Global Singleton
sql_generator = NL2SQLGenerator()