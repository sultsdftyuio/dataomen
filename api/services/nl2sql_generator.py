import hashlib
import json
import logging
import re
import numpy as np
from collections import defaultdict
from numpy.linalg import norm
from typing import Any, Dict, List, Optional, Set, Tuple

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

    Enforces chain-of-thought reasoning before SQL emission to reduce
    hallucinations and improve mathematical accuracy.  The ``reasoning`` field
    is required first so the model cannot short-circuit to SQL without
    articulating its join path and dialect choices.
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
            "0.0-1.0 confidence that the query accurately implements the plan "
            "without hallucinated columns or functions."
        ),
    )


# ---------------------------------------------------------------------------
# NL2SQL Compiler Agent - Phase 2 & 3
# ---------------------------------------------------------------------------

# Internal dialect map: our engine names -> sqlglot read dialect
_DIALECT_MAP: Dict[str, str] = {
    "duckdb":   "duckdb",
    "bigquery": "bigquery",
    "redshift": "postgres",   # sqlglot uses postgres rules for Redshift
}

# Minimum confidence score before a warning is logged
_CONFIDENCE_WARN_THRESHOLD = 0.6

# Maximum columns injected into the LLM context to prevent token bloat.
# The SemanticRouter / VectorService upstream may have already reduced the
# schema well below this budget; this constant guards against edge cases.
_MAX_COLUMNS_PER_CONTEXT = 25

# Maximum result rows injected when the LLM omits an explicit LIMIT clause.
# Prevents accidental full-table scans from reaching the application layer.
_DEFAULT_RESULT_LIMIT = 1000

# Maximum number of column embeddings held in the process-level cache.
# At 1536-dim float32 (~6 KB/entry) this caps memory at roughly 60 MB.
_COL_EMB_CACHE_MAX_SIZE = 10_000

# Required top-level keys in any Vega-Lite spec
_VEGA_REQUIRED_KEYS: Set[str] = {"mark", "encoding"}

# All mark types recognised by Vega-Lite v5
_VEGA_VALID_MARKS: Set[str] = {
    "bar", "line", "area", "point", "circle", "square",
    "tick", "rule", "text", "geoshape", "arc", "rect",
    "trail", "image", "boxplot", "errorband", "errorbar",
}


class NL2SQLGenerator:
    """
    Phase 2 & 3: Enterprise RAG & Auto-Correcting NL2SQL Engine.

    Design principles
    -----------------
    * **Contextual RAG Synergy (Phase 2)** - The SemanticRouter and VectorService
      pre-prune the schema upstream; the secondary embedding fallback is skipped
      when the incoming schema is already within budget, saving latency.
    * **Global Column Ranking** - Columns from all tables in the pruned schema
      are flattened into a single candidate pool and ranked together, then
      re-grouped by table.  This prevents a relevant column in a less-prominent
      table from being crowded out by a dominant table's per-table quota.
    * **Embedding Cache** - Column document embeddings are cached in-process
      keyed by SHA-256 of the doc string.  Only the natural-language prompt
      is embedded at runtime; schema embeddings are reused across requests,
      yielding a dramatic reduction in embedding API cost at steady state.
    * **Query Cost Guardrails** - A post-generation AST pass injects
      LIMIT {_DEFAULT_RESULT_LIMIT} on any top-level SELECT that lacks an
      explicit limit, and logs a warning on SELECT * patterns.
    * **Join Path Validation** - An FK graph derived from the schema warns
      (non-blocking) when a JOIN condition references no FK/PK column,
      catching the classic table_a.id = table_b.id mistake.
    * **Chart Spec Validation** - Vega-Lite specs are validated for required
      keys, legal mark types, and field-name alignment with SQL output aliases.
      Invalid specs fall back to None so the UI renders a plain table view.
    * **CTE-Aware AST Gate** - exp.With (CTE root) is explicitly permitted
      alongside exp.Select so valid WITH ... SELECT queries are never blocked.
    * **Dialect-aware SQL** - Generates and validates native SQL for DuckDB,
      BigQuery, or Redshift, including read_parquet() for zero-copy DuckDB.
    * **Analytical Math Prep (Phase 3)** - Enforces CAST(... AS DOUBLE) for
      metrics and CAST(... AS DATE/TIMESTAMP) for temporal columns to guarantee
      type-safe input for the downstream Polars compute engine.
    * **Intelligent self-correction** - Engine errors are classified with
      targeted hints before the LLM retries, minimising retry round-trips.
    * **Centralised LLM singleton** - All model calls route through llm_client,
      inheriting retries, backoff, and shared embedding infrastructure.
    """

    def __init__(self) -> None:
        # Process-level cache: SHA-256(column_doc) -> embedding vector.
        # Only column/schema docs are cached; prompt embeddings are not
        # (each prompt is unique and caching would waste memory).
        self._col_emb_cache: Dict[str, List[float]] = {}

    # -----------------------------------------------------------------------
    # Embedding helpers (cache-aware)
    # -----------------------------------------------------------------------

    @staticmethod
    def _doc_cache_key(doc: str) -> str:
        """Deterministic cache key for a column document string."""
        return hashlib.sha256(doc.encode()).hexdigest()

    async def _get_column_embeddings(self, docs: List[str]) -> List[List[float]]:
        """
        Returns embeddings for docs, serving cached entries where available.

        Only uncached documents are sent to the embedding API, which in steady
        state means only the prompt embedding is computed per request - a
        significant latency and cost reduction for large, stable schemas.

        The cache is bounded by _COL_EMB_CACHE_MAX_SIZE; the oldest quarter
        of entries is evicted when the limit is reached (FIFO approximation).
        """
        results: List[Optional[List[float]]] = [None] * len(docs)
        uncached_indices: List[int] = []
        uncached_docs: List[str] = []

        for i, doc in enumerate(docs):
            key = self._doc_cache_key(doc)
            cached = self._col_emb_cache.get(key)
            if cached is not None:
                results[i] = cached
            else:
                uncached_indices.append(i)
                uncached_docs.append(doc)

        if uncached_docs:
            # Evict oldest 25% of entries when approaching the size limit
            if len(self._col_emb_cache) + len(uncached_docs) > _COL_EMB_CACHE_MAX_SIZE:
                evict_count = _COL_EMB_CACHE_MAX_SIZE // 4
                for old_key in list(self._col_emb_cache.keys())[:evict_count]:
                    del self._col_emb_cache[old_key]
                logger.debug("Embedding cache: evicted %d stale entries.", evict_count)

            fresh_embs = await llm_client.embed_batch(uncached_docs)
            for idx, doc, emb in zip(uncached_indices, uncached_docs, fresh_embs):
                key = self._doc_cache_key(doc)
                self._col_emb_cache[key] = emb
                results[idx] = emb

        return [r for r in results if r is not None]

    # -----------------------------------------------------------------------
    # Schema Pruning  (Plan-driven -> Global Hybrid RAG)
    # -----------------------------------------------------------------------

    def _prune_by_plan(
        self,
        plan: QueryPlan,
        full_schema: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Dict[str, Any]]:
        """
        Stage 1 - Deterministic allowlist pruning.

        Uses the QueryPlan's explicit columns_involved sets to filter the
        schema to only what the planner requested, plus all PK/FK columns
        (anything ending in _id or named id) which are always required
        for joins.  This eliminates the majority of irrelevant columns
        before any embedding calls are made.
        """
        required: Set[str] = set()
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

    async def _rank_columns_globally(
        self,
        plan_pruned: Dict[str, Dict[str, Any]],
        prompt: str,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Stage 2 - Global Hybrid RAG ranking.

        Previously, ranking ran per-table, meaning a highly-relevant column
        in table B could be eliminated while a lower-scoring column in the
        larger table A survived simply due to table-local quotas.

        This method flattens all columns from all tables into a single
        candidate pool, scores them globally against the prompt, selects the
        top _MAX_COLUMNS_PER_CONTEXT winners, then re-groups them by their
        source table before returning.

        Skipped entirely when the total column count is already within budget
        (Phase 2 latency optimisation: upstream VectorService pre-pruning
        makes this pass free in the common case).

        Scoring weights
        ~~~~~~~~~~~~~~~
        +20  Vector cosine similarity (cached column emb vs. live prompt emb)
        +15  Exact keyword match between prompt tokens and column name
        + 8  Partial keyword match in column name (token len > 3)
        + 8  Keyword match in column description
        +10  Temporal column boost when prompt expresses time/trend intent
        + 8  Numeric column boost when prompt expresses aggregation intent
        + 4  PK/FK column boost (always useful for joins)
        """
        total_cols = sum(len(cols) for cols in plan_pruned.values())

        # Already within budget - return as-is, no embeddings needed.
        if total_cols <= _MAX_COLUMNS_PER_CONTEXT:
            return plan_pruned

        # Flatten all tables into one candidate list
        flat: List[Tuple[str, str, Any]] = [
            (table, col_name, col_meta)
            for table, columns in plan_pruned.items()
            for col_name, col_meta in columns.items()
        ]

        # --- Vector scoring: prompt embedded fresh; column docs from cache ---
        prompt_lower = prompt.lower()
        keywords = set(re.findall(r"\w+", prompt_lower))
        vector_scores: Dict[Tuple[str, str], float] = {}

        try:
            prompt_emb = np.array(await llm_client.embed(prompt))
            docs = [
                (
                    f"Table: {table}. Column: {col_name}. "
                    f"Type: {col_meta.get('type', '')}. "
                    f"Description: {col_meta.get('description', '')}. "
                    f"Examples: {', '.join(str(s) for s in col_meta.get('samples', [])[:3])}"
                )
                for table, col_name, col_meta in flat
            ]
            col_embs = await self._get_column_embeddings(docs)
            for (table, col_name, _), emb in zip(flat, col_embs):
                vector_scores[(table, col_name)] = self._cosine_similarity(
                    prompt_emb, np.array(emb)
                )
        except Exception as exc:
            logger.warning(
                "Global vector ranking failed (%s). Falling back to deterministic scoring only.",
                exc,
            )

        # --- Deterministic scoring ----------------------------------------
        time_keywords = {"date", "time", "year", "month", "day", "trend", "predict", "forecast"}
        agg_keywords  = {"total", "sum", "average", "revenue", "count", "metrics", "stats"}
        time_intent   = bool(time_keywords & keywords)
        agg_intent    = bool(agg_keywords  & keywords)

        scored: List[Tuple[float, str, str, Any]] = []
        for table, col_name, col_meta in flat:
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

            score += vector_scores.get((table, col_name), 0.0) * 20
            scored.append((score, table, col_name, col_meta))

        scored.sort(key=lambda x: x[0], reverse=True)

        # Re-group the global top-K winners back by source table
        result: Dict[str, Dict[str, Any]] = defaultdict(dict)
        for _, table, col_name, col_meta in scored[:_MAX_COLUMNS_PER_CONTEXT]:
            result[table][col_name] = {
                "type":        col_meta.get("type", "UNKNOWN"),
                "samples":     col_meta.get("samples", [])[:5],
                "description": col_meta.get("description", ""),
            }

        return dict(result)

    # -----------------------------------------------------------------------
    # Dataset -> Schema hydration (DuckDB zero-copy path)
    # -----------------------------------------------------------------------

    @staticmethod
    def _build_schema_from_datasets(datasets: List[Dataset]) -> Dict[str, Dict[str, Any]]:
        """
        Converts a list of Dataset ORM objects into the full_schema dict
        expected by the pruning / RAG pipeline, keying each table by its
        DuckDB read_parquet(file_path) source command so the LLM receives
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
        Combines plan-driven pruning and global hybrid RAG ranking into a
        single, token-efficient JSON schema block for the LLM.

        The two-stage pipeline ensures:
        - Only columns the planner explicitly requested are ever considered.
        - If those columns still exceed the context budget, global semantic
          scoring narrows the list without losing join keys, and without
          biasing towards the table with the most columns.
        - If upstream VectorService pre-pruned the schema within budget,
          the embedding stage is skipped entirely (Phase 2 optimisation).
        """
        plan_pruned = self._prune_by_plan(plan, full_schema)
        ranked = await self._rank_columns_globally(plan_pruned, prompt)
        return json.dumps(ranked, indent=2)

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
        """
        Constructs the LLM system prompt, injecting:
        - The globally-pruned and ranked schema context.
        - Dialect-specific SQL rules.
        - Phase 3 analytical math casting requirements (DOUBLE, DATE/TIMESTAMP).
        - Optional semantic/metric views (gold-tier CTEs).
        - Optional agent role context for persona-tailored metric selection.
        """
        views_block = ""
        if semantic_views:
            views_block = (
                "\nVERIFIED METRIC VIEWS (GOLD TIER):\n"
                "Use these pre-calculated CTE definitions for complex metrics:\n"
                f"{json.dumps(semantic_views, indent=2)}\n"
            )

        agent_block = ""
        if agent:
            agent_block = f"\nAGENT CONTEXT:\n{agent.role_description}\n"

        return f"""You are an elite Data Engineer and SQL optimiser for an Enterprise Analytical SaaS.
Your objective is to execute the provided Execution Plan by translating it into highly optimised, \
read-only {dialect.upper()} SQL.

TARGET DIALECT: {dialect.upper()}
Always use functions and syntax native to {dialect.upper()}.
{agent_block}
SCHEMA CONTEXT (Pruned + globally semantically ranked subset):
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
                 Table names are read_parquet('...') sources - use them verbatim as the FROM target.
   - Redshift  : JSON_EXTRACT_PATH_TEXT(), SUPER type navigation, DATEADD / DATEDIFF.
5. TABLE REFERENCING: Wrap table names in double-quotes to prevent reserved-keyword conflicts.
6. ANALYTICAL MATH PREP (Phase 3 Integration - MANDATORY):
   - ALWAYS CAST aggregating numeric metrics as DOUBLE.
     Example: `CAST(SUM(revenue) AS DOUBLE)`, `CAST(AVG(score) AS DOUBLE)`.
   - ALWAYS CAST temporal grouping columns as DATE or TIMESTAMP.
     Example: `CAST(created_at AS DATE)`, `CAST(event_ts AS TIMESTAMP)`.
   - This strict typing is non-negotiable: it guarantees type-safe input for the
     downstream Polars vectorised compute engine (EMA, Z-Score, rolling windows).
     Mixed integer/float types or implicit temporal coercions cause Phase 3 failures.
7. MATHEMATICAL PRECISION: Prefer vectorised aggregate functions native to {dialect.upper()}
   (e.g. corr(), regr_slope(), stddev_pop(), percentile_cont()).
8. JOIN CORRECTNESS: Always join on FK -> PK relationships.
   Correct  : orders.user_id = users.id
   Incorrect: orders.id = users.id
9. RESULT LIMITING: Always include an explicit LIMIT clause. Default to LIMIT {_DEFAULT_RESULT_LIMIT}
   unless the Execution Plan specifies a different cardinality requirement.

CHARTING RULES (Vega-Lite / UI Shape):
- If `suggested_visualizations` is non-empty in the plan, output a declarative Vega-Lite JSON spec.
- Ensure the 'mark' (bar, line, area, scatter, pie) fits the data shape.
- Use 'line'/'area' marks for time-series; 'bar' for categorical aggregations.
- Field names in the spec MUST match SQL output aliases exactly.
"""

    # -----------------------------------------------------------------------
    # AST Security Gate (Defense-in-Depth, CTE-Aware)
    # -----------------------------------------------------------------------

    _DESTRUCTIVE_NODES = (
        exp.Drop, exp.Delete, exp.Update, exp.Insert,
        exp.AlterTable, exp.Command, exp.Commit, exp.Rollback,
        exp.Create, exp.Grant, exp.Pragma,
    )

    def _validate_security(self, sql: str, dialect: str) -> None:
        """
        Deep-AST security validator.

        Defense-in-depth layer that fires before the DuckDBValidator at
        execution time.  Parses the SQL with sqlglot for the target dialect,
        then:

        1. Verifies the root statement is SELECT, a CTE (WITH ... SELECT ->
           exp.With), or a Subquery.  exp.With is explicitly permitted here;
           the prior check against only exp.Select would incorrectly block all
           valid CTE queries.
        2. Walks the full AST to detect any destructive node buried inside
           subqueries, CTEs, or EXECUTE-style injection attempts.

        Raises ValueError on any violation.
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

            # exp.With  -> WITH ... SELECT (CTE root)
            # exp.Select -> plain SELECT
            # exp.Subquery -> parenthesised derived table at the top level
            if not isinstance(statement, (exp.Select, exp.With, exp.Subquery)):
                logger.critical(
                    "AST root violation blocked: expected SELECT / WITH (CTE), got %s",
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
    # Query Cost Guardrails
    # -----------------------------------------------------------------------

    def _apply_cost_guardrails(self, sql: str, dialect: str) -> str:
        """
        Prevents runaway queries from reaching the execution layer.

        Two protections are applied post-generation:

        1. SELECT * warning - Logs a WARNING when SELECT * is detected.
           Non-blocking because it may appear intentionally in an inner
           subquery, but it surfaces for ops review.

        2. Missing LIMIT injection - If the outermost SELECT has no explicit
           LIMIT clause, one is injected at _DEFAULT_RESULT_LIMIT rows.
           Handles both plain SELECT and WITH ... SELECT (CTE) roots by
           unwrapping exp.With to reach its terminal exp.Select.

        Returns the (potentially rewritten) SQL string. Parse errors are
        passed through silently - the security gate handles them next.
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            return sql

        modified = False

        for statement in statements:
            if statement is None:
                continue

            # 1. Warn on SELECT *
            for node, *_ in statement.walk():
                if isinstance(node, exp.Star):
                    logger.warning(
                        "Cost guardrail: SELECT * detected. "
                        "Consider explicit column selection to avoid full-table reads."
                    )
                    break

            # 2. Inject LIMIT on the outermost SELECT if absent.
            #    For exp.With (CTE root), the terminal SELECT is at .this.
            #    For exp.Select it is the statement itself.
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
            guarded_sql = " ".join(
                s.sql(dialect=sqlglot_dialect) for s in statements if s is not None
            )
            logger.info(
                "Cost guardrail: injected LIMIT %d into query without explicit limit.",
                _DEFAULT_RESULT_LIMIT,
            )
            return guarded_sql

        return sql

    # -----------------------------------------------------------------------
    # Join Path Validation
    # -----------------------------------------------------------------------

    @staticmethod
    def _build_fk_graph(
        schema: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Set[str]]:
        """
        Derives a lightweight FK column map from the schema.

        Heuristic: any column named <x>_id is a foreign key; any column
        named id is a primary key.  Both are valid join columns.

        Returns {table_name: {valid_join_column, ...}}.
        """
        fk_columns: Dict[str, Set[str]] = defaultdict(set)
        for table, columns in schema.items():
            for col_name in columns:
                col_lower = col_name.lower()
                if col_lower == "id" or col_lower.endswith("_id"):
                    fk_columns[table].add(col_name)
        return dict(fk_columns)

    def _validate_join_paths(
        self,
        sql: str,
        dialect: str,
        schema: Dict[str, Dict[str, Any]],
    ) -> None:
        """
        Validates JOIN ON conditions against the schema's FK graph.

        Logs a WARNING - intentionally non-blocking - when a JOIN condition
        references no FK or PK column on either side.  This catches the
        classic predicate mistake:

            orders JOIN users ON orders.id = users.id   <- wrong (PK = PK)
            orders JOIN users ON orders.user_id = users.id  <- correct (FK = PK)

        Non-blocking rationale: the heuristic FK graph cannot capture every
        valid join semantic (e.g. natural keys, composite keys), so hard
        rejection would produce false positives.  The warning is surfaced
        for human review and feeds into correct_sql retry context.
        """
        fk_graph = self._build_fk_graph(schema)
        all_valid_join_cols: Set[str] = {
            col.lower()
            for cols in fk_graph.values()
            for col in cols
        }

        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            return  # Security gate handles malformed SQL

        for statement in statements:
            if statement is None:
                continue

            for join in statement.find_all(exp.Join):
                on_clause = join.args.get("on")
                if on_clause is None:
                    continue  # USING / NATURAL JOIN - skip

                join_col_names = [
                    col.name.lower()
                    for col in on_clause.find_all(exp.Column)
                ]
                if not join_col_names:
                    continue

                if not any(c in all_valid_join_cols for c in join_col_names):
                    logger.warning(
                        "Join path warning: no FK/PK column found in JOIN ON condition "
                        "(columns referenced: [%s]). "
                        "Verify the predicate uses the correct FK -> PK relationship.",
                        ", ".join(join_col_names),
                    )

    # -----------------------------------------------------------------------
    # Chart Spec Validation
    # -----------------------------------------------------------------------

    def _extract_sql_aliases(self, sql: str, dialect: str) -> Set[str]:
        """
        Extracts the output column aliases from the top-level SELECT clause
        via the sqlglot AST.  Used to cross-validate Vega-Lite field references.

        Unwraps exp.With (CTE root) to reach the terminal SELECT automatically.
        Returns an empty set if extraction fails (e.g. SELECT *), which causes
        the chart validator to skip field-alignment checks rather than fail.
        """
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        aliases: Set[str] = set()
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
            for statement in statements:
                if statement is None:
                    continue
                # Unwrap CTE root to reach the terminal SELECT
                select = (
                    statement.this
                    if isinstance(statement, exp.With)
                    else statement
                )
                if not isinstance(select, exp.Select):
                    continue
                for expr in select.expressions:
                    if isinstance(expr, exp.Alias):
                        aliases.add(expr.alias.lower())
                    elif isinstance(expr, exp.Column):
                        aliases.add(expr.name.lower())
        except Exception as exc:
            logger.debug("SQL alias extraction failed (non-fatal): %s", exc)

        return aliases

    def _validate_chart_spec(
        self,
        chart_spec: Optional[Dict[str, Any]],
        sql: str,
        dialect: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Validates and sanitizes a Vega-Lite chart spec against three checks:

        1. Structural - mark and encoding keys are present.
        2. Mark type  - mark (or mark.type) is a recognised Vega-Lite v5 mark.
        3. Field alignment - every field value inside encoding channels must
           match a SQL output alias (case-insensitive).  Skipped when aliases
           cannot be extracted (e.g. SELECT *), passing the spec through.

        Returns the validated spec on success, or None as a signal to the UI
        to fall back to a plain table view instead of rendering broken JSON.
        """
        if chart_spec is None:
            return None

        # 1. Structural validation
        missing = _VEGA_REQUIRED_KEYS - set(chart_spec.keys())
        if missing:
            logger.warning(
                "Chart spec rejected: missing required key(s) %s. Falling back to table view.",
                missing,
            )
            return None

        # 2. Mark type validation - normalise {"type": "bar"} -> "bar"
        mark = chart_spec.get("mark")
        if isinstance(mark, dict):
            mark = mark.get("type", "")
        if str(mark).lower() not in _VEGA_VALID_MARKS:
            logger.warning(
                "Chart spec rejected: unrecognised mark type '%s'. Falling back to table view.",
                mark,
            )
            return None

        # 3. Field alignment validation
        sql_aliases = self._extract_sql_aliases(sql, dialect)
        if sql_aliases:
            encoding = chart_spec.get("encoding", {})
            invalid: List[str] = []
            for channel, channel_def in encoding.items():
                if not isinstance(channel_def, dict):
                    continue
                field = channel_def.get("field", "")
                if field and field.lower() not in sql_aliases:
                    invalid.append(f"{channel}.field='{field}'")

            if invalid:
                logger.warning(
                    "Chart spec rejected: field reference(s) %s not present in SQL "
                    "aliases %s. Falling back to table view.",
                    invalid,
                    sql_aliases,
                )
                return None

        return chart_spec

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
                "redshift": "DATEADD, DATEDIFF, LISTAGG, APPROXIMATE COUNT(DISTINCT ...)",
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
        if "cast" in e or "conversion" in e or "coercion" in e:
            return (
                "HINT: A type cast failed. Ensure all aggregating metrics are "
                "CAST AS DOUBLE and all temporal grouping columns are CAST AS DATE "
                "or TIMESTAMP, as required by the Phase 3 Polars compute engine."
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
        Translates a QueryPlan into executable, secure SQL for the target engine.

        Post-generation pipeline (applied in order before returning):
        1. AST security gate      - blocks destructive statements (CTE-aware).
        2. Join path validation   - warns on non-FK/PK JOIN predicates.
        3. Cost guardrails        - injects LIMIT if absent; warns on SELECT *.
        4. Chart spec validation  - validates Vega-Lite structure and field
                                    alignment; falls back to None if invalid.

        Parameters
        ----------
        plan:           Upstream planner's execution plan (column allowlist + steps).
        full_schema:    Complete warehouse schema keyed by table name.
        target_engine:  One of "duckdb", "bigquery", "redshift".
        tenant_id:      Used for scoped log correlation.
        prompt:         Original natural-language question (used for semantic ranking).
        agent:          Optional agent whose role description is injected into the
                        system prompt to tailor metric selection and output framing.
        datasets:       Optional list of Dataset ORM objects. When provided and
                        target_engine is "duckdb", table names are remapped to
                        read_parquet(file_path) sources for zero-copy execution.
        semantic_views: Pre-calculated CTE/metric view definitions (gold tier).
        history:        Prior conversation turns for multi-turn context.

        Returns
        -------
        (sql_query, chart_spec)  where chart_spec may be None.
        """
        logger.info("[%s] Compiling QueryPlan -> %s SQL", tenant_id, target_engine.upper())

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

            # 1. Security gate (CTE-aware: permits exp.With alongside exp.Select)
            self._validate_security(result.sql_query, target_engine)

            # 2. Join path validation (warning-only, non-blocking)
            self._validate_join_paths(result.sql_query, target_engine, effective_schema)

            # 3. Cost guardrails (may rewrite SQL to inject LIMIT)
            safe_sql = self._apply_cost_guardrails(result.sql_query, target_engine)

            # 4. Chart spec validation (falls back to None on any failure)
            safe_chart = self._validate_chart_spec(result.chart_spec, safe_sql, target_engine)

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
            return safe_sql, safe_chart

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
        hint, and retries generation.  The full post-generation pipeline
        (security -> join validation -> cost guardrails -> chart validation)
        is applied to the corrected query before it is returned.

        Raises RuntimeError on cascade failure so the caller can surface
        a clean message to the end-user.

        Parameters
        ----------
        failed_query:   The SQL string that caused the engine error.
        error_msg:      Raw error message returned by the database engine.
        plan:           Original QueryPlan the failed query was trying to satisfy.
        full_schema:    Complete warehouse schema keyed by table name.
        target_engine:  One of "duckdb", "bigquery", "redshift".
        tenant_id:      Used for scoped log correlation.
        prompt:         Original natural-language question.
        agent:          Optional agent context.
        datasets:       Optional Dataset ORM objects for DuckDB zero-copy path.
        semantic_views: Pre-calculated CTE/metric view definitions (gold tier).

        Returns
        -------
        (sql_query, chart_spec)  where chart_spec may be None.
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
3. Verify all aggregating metrics are CAST AS DOUBLE and all temporal grouping
   columns are CAST AS DATE or TIMESTAMP (Phase 3 Polars engine requirement).
4. Verify every JOIN uses FK -> PK relationships (e.g. orders.user_id = users.id,
   NOT orders.id = users.id).
5. Output a corrected, highly-optimised {target_engine.upper()} SQL query that satisfies
   the original Execution Plan, plus an updated Vega-Lite chart spec if applicable.
"""

        try:
            result: NL2SQLOutput = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=correction_prompt,
                history=[],
                response_model=NL2SQLOutput,
            )

            # Apply the full post-generation pipeline to the corrected query
            self._validate_security(result.sql_query, target_engine)
            self._validate_join_paths(result.sql_query, target_engine, effective_schema)
            safe_sql = self._apply_cost_guardrails(result.sql_query, target_engine)
            safe_chart = self._validate_chart_spec(result.chart_spec, safe_sql, target_engine)

            logger.info(
                "[%s] SQL auto-correction succeeded (confidence=%.2f).",
                tenant_id, result.confidence_score,
            )
            return safe_sql, safe_chart

        except Exception as exc:
            logger.critical(
                "[%s] Cascade failure in SQL auto-correction: %s", tenant_id, exc
            )
            raise RuntimeError(
                f"Unable to self-correct the query after {target_engine.upper()} error: {error_msg}"
            ) from exc


# ---------------------------------------------------------------------------
# Global Singleton
# ---------------------------------------------------------------------------

sql_generator = NL2SQLGenerator()