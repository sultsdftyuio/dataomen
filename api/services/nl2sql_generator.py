import hashlib
import json
import logging
import re
import numpy as np
from collections import defaultdict
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
    hallucinations and improve mathematical accuracy. The ``reasoning`` field
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

_CONFIDENCE_WARN_THRESHOLD = 0.6
_MAX_COLUMNS_PER_CONTEXT = 25
_DEFAULT_RESULT_LIMIT = 1000
_COL_EMB_CACHE_MAX_SIZE = 10_000

_VEGA_REQUIRED_KEYS: Set[str] = {"mark", "encoding"}
_VEGA_VALID_MARKS: Set[str] = {
    "bar", "line", "area", "point", "circle", "square",
    "tick", "rule", "text", "geoshape", "arc", "rect",
    "trail", "image", "boxplot", "errorband", "errorbar",
}

# Pre-compile regex for faster tokenization
_WORD_PATTERN = re.compile(r"\w+")


class NL2SQLGenerator:
    """
    Phase 2 & 3: Enterprise RAG & Auto-Correcting NL2SQL Engine.
    """

    def __init__(self) -> None:
        # Process-level cache: SHA-256(column_doc) -> embedding vector.
        # NOTE: This is instance-level; promote to a class variable if a true
        # process-wide singleton cache is required across multiple instances.
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
        Returns embeddings for *all* docs in the same order they were supplied,
        serving cached entries where available.

        FIX: Previously the method filtered out None slots with a bare list
        comprehension, which silently returned a shorter list than ``docs`` and
        caused silent index mismatches in the vectorised ranking step.  The
        method now raises explicitly when a slot is unexpectedly empty.
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
            # Evict oldest 25 % of entries when approaching the size limit
            if len(self._col_emb_cache) + len(uncached_docs) > _COL_EMB_CACHE_MAX_SIZE:
                evict_count = _COL_EMB_CACHE_MAX_SIZE // 4
                for old_key in list(self._col_emb_cache.keys())[:evict_count]:
                    del self._col_emb_cache[old_key]
                logger.debug("Embedding cache: evicted %d stale entries.", evict_count)

            fresh_embs = await llm_client.embed_batch(uncached_docs)

            if len(fresh_embs) != len(uncached_docs):
                raise ValueError(
                    f"embed_batch returned {len(fresh_embs)} embeddings for "
                    f"{len(uncached_docs)} documents — length mismatch."
                )

            for idx, doc, emb in zip(uncached_indices, uncached_docs, fresh_embs):
                key = self._doc_cache_key(doc)
                self._col_emb_cache[key] = emb
                results[idx] = emb

        # Guard: every slot must have been filled
        missing = [i for i, r in enumerate(results) if r is None]
        if missing:
            raise RuntimeError(
                f"Embedding result slots {missing} are still None after fetch — "
                "this indicates a cache/fetch logic bug."
            )

        return results  # type: ignore[return-value]  # all None slots verified above

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

    async def _rank_columns_globally(
        self,
        plan_pruned: Dict[str, Dict[str, Any]],
        prompt: str,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Stage 2 - Global Hybrid RAG ranking.
        Uses vectorised matrix operations for cosine similarity.
        """
        total_cols = sum(len(cols) for cols in plan_pruned.values())

        # Already within budget — return as-is, no embeddings needed.
        if total_cols <= _MAX_COLUMNS_PER_CONTEXT:
            return plan_pruned

        # Flatten all tables into one candidate list
        flat: List[Tuple[str, str, Any]] = [
            (table, col_name, col_meta)
            for table, columns in plan_pruned.items()
            for col_name, col_meta in columns.items()
        ]

        prompt_lower = prompt.lower()
        keywords = set(_WORD_PATTERN.findall(prompt_lower))
        vector_scores: Dict[Tuple[str, str], float] = {}

        # --- Vectorised scoring ---
        try:
            prompt_emb = np.array(await llm_client.embed(prompt), dtype=np.float32)

            # Build docs in the same order as ``flat`` so indices align 1-to-1.
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

            # Vectorised cosine similarity via matrix-vector product (C-optimised)
            col_embs_mat = np.array(col_embs, dtype=np.float32)   # (N, D)
            prompt_norm  = float(np.linalg.norm(prompt_emb))
            col_norms    = np.linalg.norm(col_embs_mat, axis=1)   # (N,)

            sim_scores = np.zeros(len(flat), dtype=np.float32)
            if prompt_norm > 0:
                valid_mask = col_norms > 0
                sim_scores[valid_mask] = (
                    np.dot(col_embs_mat[valid_mask], prompt_emb)
                    / (col_norms[valid_mask] * prompt_norm)
                )

            for i, (table, col_name, _) in enumerate(flat):
                vector_scores[(table, col_name)] = float(sim_scores[i])

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
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
        except sqlglot.errors.ParseError:
            return sql

        modified = False

        for statement in statements:
            if statement is None:
                continue

            for node, *_ in statement.walk():
                if isinstance(node, exp.Star):
                    logger.warning(
                        "Cost guardrail: SELECT * detected. "
                        "Consider explicit column selection to avoid full-table reads."
                    )
                    break

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
            return

        for statement in statements:
            if statement is None:
                continue

            for join in statement.find_all(exp.Join):
                on_clause = join.args.get("on")
                if on_clause is None:
                    continue

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
        sqlglot_dialect = _DIALECT_MAP.get(dialect.lower(), dialect.lower())
        aliases: Set[str] = set()
        try:
            statements = sqlglot.parse(sql, read=sqlglot_dialect)
            for statement in statements:
                if statement is None:
                    continue
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
        if chart_spec is None:
            return None

        missing = _VEGA_REQUIRED_KEYS - set(chart_spec.keys())
        if missing:
            logger.warning(
                "Chart spec rejected: missing required key(s) %s. Falling back to table view.",
                missing,
            )
            return None

        mark = chart_spec.get("mark")
        if isinstance(mark, dict):
            mark = mark.get("type", "")
        if str(mark).lower() not in _VEGA_VALID_MARKS:
            logger.warning(
                "Chart spec rejected: unrecognised mark type '%s'. Falling back to table view.",
                mark,
            )
            return None

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

        return ""

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

            self._validate_security(result.sql_query, target_engine)
            self._validate_join_paths(result.sql_query, target_engine, effective_schema)
            safe_sql = self._apply_cost_guardrails(result.sql_query, target_engine)
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

        # FIX: The original f-string opened a ```sql fence but never closed it,
        # resulting in a malformed prompt sent to the LLM on every retry.
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

        # FIX: The original try/except block was indented with stray spaces,
        # placing it outside the method body and making it unreachable dead code
        # that would have raised an IndentationError at import time.
        try:
            result: NL2SQLOutput = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=correction_prompt,
                history=[],
                response_model=NL2SQLOutput,
            )

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
                f"Unable to self-correct the query after {target_engine.upper()} "
                f"error: {error_msg}"
            ) from exc


# ---------------------------------------------------------------------------
# Global Singleton
# ---------------------------------------------------------------------------
sql_generator = NL2SQLGenerator()
