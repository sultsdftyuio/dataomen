"""
ARCLI.TECH - Intelligence Layer
Component: Typed SQL AST Compiler
Strategy: QueryPlan -> LogicalPlan -> PhysicalPlan -> SQL Renderer
"""

from __future__ import annotations

import ast
import logging
from typing import Any, Dict, List, Optional, Set, Tuple, Literal

from pydantic import BaseModel, Field

from models import Dataset, SemanticMetric
from api.services.join_graph_validator import join_graph_validator
from api.services.metric_compiler import metric_compiler
from api.services.relational_ir import (
    EnginePhysicalPlan,
    PhysicalOperator,
    RelationalOperator,
    RelationalPlan,
)
from api.services.sql_render_ast import (
    DuckDBSqlAstRenderer,
    SqlBinaryOp,
    SqlColumn,
    SqlCte,
    SqlFunctionCall,
    SqlFunctionTableRef,
    SqlJoinClause,
    SqlLiteral,
    SqlOrderKey,
    SqlQuery,
    SqlSelectItem,
    SqlSelectStmt,
    SqlStar,
    SqlTableRef,
)
from api.services.sql_ast import (
    AggregateMetricNode,
    AggregateNode,
    ColumnLineage,
    ColumnRef,
    FilterExpression,
    FilterNode,
    JoinEdge,
    JoinNode,
    LimitNode,
    LiteralValue,
    LogicalPlan,
    MetricNode,
    PhysicalPlan,
    PlanNode,
    PredicateNode,
    ProjectNode,
    ScanNode,
    SortKey,
    SortNode,
    logical_plan_fingerprint,
)

logger = logging.getLogger(__name__)


# -------------------------------------------------------------------------
# QUERY PLAN CONTRACTS (SHARED BY PLANNER/COMPILER)
# -------------------------------------------------------------------------


class JoinConfig(BaseModel):
    """Legacy join configuration kept only for backward compatibility."""

    target_dataset_id: str
    source_column: str
    target_column: str
    join_type: str = "LEFT"


class StrategyStep(BaseModel):
    """Typed strategy contract: op + args. Legacy fields are transitional."""

    op: Optional[Literal["scan", "project", "join", "filter", "aggregate", "sort", "limit", "fallback"]] = None
    args: Dict[str, Any] = Field(default_factory=dict)
    output_schema: Optional[List[str]] = None

    # Legacy compatibility fields
    operation: Optional[str] = None
    columns: List[str] = Field(default_factory=list)
    description: str = ""
    target: Optional[str] = None
    on: Optional[str] = None
    target_dataset: Optional[str] = None
    join_keys: Optional[Dict[str, str]] = None
    aggregation_intent: Optional[str] = None
    join_config: Optional[JoinConfig] = None


class QueryPlan(BaseModel):
    """Compiler-facing query plan model."""

    execution_intent: str
    target_dataset_ids: List[str]
    context_filters: Dict[str, Any]
    requested_governed_metrics: List[str]
    analytical_strategy: List[StrategyStep]


class CompilationArtifact(BaseModel):
    """Compiler output bundle for execution engines and observability."""

    sql: str
    logical_plan: LogicalPlan
    relational_plan: RelationalPlan
    engine_physical_plan: EnginePhysicalPlan
    physical_plan: PhysicalPlan
    plan_fingerprint: str
    execution_dag: Dict[str, Any] = Field(default_factory=dict)
    join_validation: Dict[str, Any] = Field(default_factory=dict)


# -------------------------------------------------------------------------
# COMPILER IMPLEMENTATION
# -------------------------------------------------------------------------


class SQLCompiler:
    """
    Typed compiler pipeline:
    QueryPlan -> LogicalPlan(AST DAG) -> PhysicalPlan -> SQL Renderer.

    SQL strings are emitted only by the renderer methods.
    """

    def compile_to_duckdb(
        self,
        plan: QueryPlan,
        datasets: List[Dataset],
        governed_metrics: List[SemanticMetric],
        strict_mode: bool = True,
    ) -> str:
        artifact = self.compile_artifact(
            plan=plan,
            datasets=datasets,
            governed_metrics=governed_metrics,
            strict_mode=strict_mode,
        )
        return artifact.sql

    def compile_artifact(
        self,
        plan: QueryPlan,
        datasets: List[Dataset],
        governed_metrics: List[SemanticMetric],
        strict_mode: bool = True,
        backend: Literal["duckdb"] = "duckdb",
    ) -> CompilationArtifact:
        if plan.execution_intent != "ANALYTICAL":
            empty_logical = LogicalPlan()
            empty_relational = RelationalPlan()
            empty_engine_physical = EnginePhysicalPlan(backend=backend)
            empty_physical = PhysicalPlan()
            return CompilationArtifact(
                sql="-- Query requires text extraction/RAG, skipping structured SQL compilation.",
                logical_plan=empty_logical,
                relational_plan=empty_relational,
                engine_physical_plan=empty_engine_physical,
                physical_plan=empty_physical,
                plan_fingerprint=logical_plan_fingerprint(empty_logical),
                execution_dag={"nodes": [], "dependencies": {}},
                join_validation={"is_valid": True, "warnings": ["Non-analytical intent bypassed SQL compile."]},
            )

        dataset_map = self._build_dataset_aliases(datasets)
        if not dataset_map:
            raise ValueError("Compiler Error: No valid datasets mapped for execution.")

        base_ds_id = str(plan.target_dataset_ids[0]) if plan.target_dataset_ids else None
        if not base_ds_id or base_ds_id not in dataset_map:
            raise ValueError(f"Compiler Error: Missing authorized base dataset '{base_ds_id}'.")

        metric_catalog = {
            m.metric_name: m.compiled_sql
            for m in governed_metrics
            if m.metric_name in plan.requested_governed_metrics
        }

        normalized_steps = [
            self._normalize_step(step, strict_mode=strict_mode)
            for step in plan.analytical_strategy
        ]

        join_validation = self._validate_join_graph(base_ds_id, normalized_steps, datasets)
        if not join_validation.get("is_valid", True):
            errors = join_validation.get("errors", [])
            raise ValueError(f"Join graph validation failed: {errors}")

        logical_plan = self._build_logical_plan(
            base_ds_id=base_ds_id,
            dataset_map=dataset_map,
            steps=normalized_steps,
            metric_catalog=metric_catalog,
        )
        logical_plan = self._optimize_logical_plan(logical_plan, dataset_map)
        self._validate_logical_joins_against_graph(logical_plan, join_validation)

        self._validate_logical_plan(logical_plan)
        self._validate_security_contract(logical_plan, dataset_map)

        relational_plan = self._build_relational_plan(logical_plan)
        relational_plan = self._optimize_relational_plan(relational_plan, dataset_map, join_validation)

        engine_physical_plan = self._build_engine_physical_plan(
            relational_plan=relational_plan,
            dataset_map=dataset_map,
            backend=backend,
        )
        engine_physical_plan = self._optimize_engine_physical_plan(engine_physical_plan)

        sql = self._render_engine_physical_plan_to_sql(
            plan=engine_physical_plan,
            global_filters=plan.context_filters,
        )

        # Kept for backward compatibility for existing downstream callers.
        physical_plan = self._build_physical_plan(logical_plan)

        plan_hash = logical_plan_fingerprint(logical_plan)
        execution_dag = self._build_execution_dag(
            logical_plan=logical_plan,
            relational_plan=relational_plan,
            engine_physical_plan=engine_physical_plan,
        )

        logger.info(
            "Typed SQL compilation complete | nodes=%s | plan_hash=%s",
            len(logical_plan.nodes),
            plan_hash[:12],
        )

        return CompilationArtifact(
            sql=sql,
            logical_plan=logical_plan,
            relational_plan=relational_plan,
            engine_physical_plan=engine_physical_plan,
            physical_plan=physical_plan,
            plan_fingerprint=plan_hash,
            execution_dag=execution_dag,
            join_validation=join_validation,
        )

    def _optimize_logical_plan(
        self,
        logical_plan: LogicalPlan,
        dataset_map: Dict[str, Dict[str, Any]],
    ) -> LogicalPlan:
        """Logical planner stage: computes deterministic optimization metadata."""
        join_nodes = [n for n in logical_plan.nodes if isinstance(n, JoinNode)]
        est_cost = 0.0
        for join_node in join_nodes:
            target_meta = dataset_map.get(join_node.target_dataset_id, {})
            row_count = float(target_meta.get("row_count", 1000) or 1000)
            join_weight = 1.0 if join_node.condition.join_type == "INNER" else 1.3
            est_cost += row_count * join_weight

        logical_plan.optimization_notes.append(
            f"joins={len(join_nodes)}"
        )
        logical_plan.optimization_notes.append(
            f"estimated_join_cost={round(est_cost, 2)}"
        )
        return logical_plan

    def _validate_logical_joins_against_graph(
        self,
        logical_plan: LogicalPlan,
        join_validation: Dict[str, Any],
    ) -> None:
        """Secondary guardrail: enforce validator-safe targets on logical joins."""
        safe_path = join_validation.get("safe_join_path", [])
        if not safe_path:
            return

        allowed_tables: Set[str] = set()
        for edge in safe_path:
            if not isinstance(edge, dict):
                continue
            src = edge.get("source_table")
            tgt = edge.get("target_table")
            if src:
                allowed_tables.add(str(src))
            if tgt:
                allowed_tables.add(str(tgt))

        violations = []
        for node in logical_plan.nodes:
            if isinstance(node, JoinNode) and node.target_dataset_id not in allowed_tables:
                violations.append(node.target_dataset_id)

        if violations:
            raise ValueError(
                "Logical join targets violate join-graph safe path: "
                f"{sorted(set(violations))}"
            )

    def _build_relational_plan(self, logical_plan: LogicalPlan) -> RelationalPlan:
        """Converts logical graph nodes into pure relational algebra operators."""
        physical_order = self._build_physical_plan(logical_plan).ordered_nodes
        operators: List[RelationalOperator] = []

        for idx, node in enumerate(physical_order):
            op_id = f"ra_{idx}_{node.node_type}"
            input_op_id = operators[-1].op_id if operators else None

            if isinstance(node, ScanNode):
                operators.append(
                    RelationalOperator(
                        op_id=op_id,
                        op_type="scan",
                        args={
                            "dataset_id": node.dataset_id,
                            "alias": node.alias,
                        },
                        input_op_id=None,
                    )
                )
            elif isinstance(node, FilterNode):
                operators.append(
                    RelationalOperator(
                        op_id=op_id,
                        op_type="selection",
                        args={"expression": node.expression.model_dump()},
                        input_op_id=input_op_id,
                    )
                )
            elif isinstance(node, ProjectNode):
                operators.append(
                    RelationalOperator(
                        op_id=op_id,
                        op_type="projection",
                        args={"columns": [c.column for c in node.columns]},
                        input_op_id=input_op_id,
                    )
                )
            elif isinstance(node, JoinNode):
                operators.append(
                    RelationalOperator(
                        op_id=op_id,
                        op_type="join",
                        args={
                            "target_dataset_id": node.target_dataset_id,
                            "target_alias": node.target_alias,
                            "join_type": node.condition.join_type,
                            "source_column": node.condition.source_column,
                            "target_column": node.condition.target_column,
                            "operator": node.condition.operator,
                        },
                        input_op_id=input_op_id,
                    )
                )
            elif isinstance(node, AggregateNode):
                operators.append(
                    RelationalOperator(
                        op_id=op_id,
                        op_type="group_by",
                        args={
                            "group_by": [g.column for g in node.group_by],
                            "metrics": [
                                {
                                    "name": m.name,
                                    "function": m.function,
                                    "column": m.column.column if m.column else None,
                                    "distinct": m.distinct,
                                }
                                for m in node.metrics
                            ],
                        },
                        input_op_id=input_op_id,
                    )
                )
            elif isinstance(node, SortNode):
                operators.append(
                    RelationalOperator(
                        op_id=op_id,
                        op_type="sort",
                        args={
                            "keys": [
                                {
                                    "column": key.column.column,
                                    "direction": key.direction,
                                }
                                for key in node.keys
                            ]
                        },
                        input_op_id=input_op_id,
                    )
                )
            elif isinstance(node, LimitNode):
                operators.append(
                    RelationalOperator(
                        op_id=op_id,
                        op_type="limit",
                        args={"value": int(node.value)},
                        input_op_id=input_op_id,
                    )
                )
            elif isinstance(node, MetricNode):
                operators.append(
                    RelationalOperator(
                        op_id=op_id,
                        op_type="metric",
                        args={"dependencies": list(node.dependencies)},
                        input_op_id=input_op_id,
                    )
                )

        return RelationalPlan(operators=operators)

    def _optimize_relational_plan(
        self,
        relational_plan: RelationalPlan,
        dataset_map: Dict[str, Dict[str, Any]],
        join_validation: Dict[str, Any],
    ) -> RelationalPlan:
        """Rule-based logical optimizer pass over relational algebra operators."""
        optimized = relational_plan.model_copy(deep=True)
        ops = optimized.operators

        # Projection pruning: dedupe columns while preserving order.
        for op in ops:
            if op.op_type != "projection":
                continue
            cols = [self._safe_identifier(c) for c in op.args.get("columns", [])]
            deduped = list(dict.fromkeys(cols))
            if len(deduped) < len(cols):
                optimized.optimization_notes.append("projection_pruning_applied")
            op.args["columns"] = deduped

        # Predicate pushdown: selection directly after projection can move before it.
        idx = 1
        while idx < len(ops):
            prev_op = ops[idx - 1]
            curr_op = ops[idx]
            if prev_op.op_type == "projection" and curr_op.op_type == "selection":
                projected = set(prev_op.args.get("columns", []))
                predicate_cols = self._extract_predicate_columns(curr_op.args.get("expression", {}))
                if predicate_cols and predicate_cols.issubset(projected):
                    ops[idx - 1], ops[idx] = curr_op, prev_op
                    self._relink_relational_chain(ops)
                    optimized.optimization_notes.append("predicate_pushdown_applied")
                    idx = max(1, idx - 1)
                    continue
            idx += 1

        if join_validation.get("has_fan_out"):
            optimized.optimization_notes.append("join_fan_out_guardrail")
        if join_validation.get("has_chasm_trap"):
            optimized.optimization_notes.append("join_chasm_guardrail")

        return optimized

    def _extract_predicate_columns(self, expression_payload: Dict[str, Any]) -> Set[str]:
        cols: Set[str] = set()
        if not isinstance(expression_payload, dict):
            return cols

        predicates = expression_payload.get("predicates", [])
        if not isinstance(predicates, list):
            return cols

        for predicate in predicates:
            if not isinstance(predicate, dict):
                continue
            left = predicate.get("left", {})
            if isinstance(left, dict) and left.get("column"):
                cols.add(self._safe_identifier(str(left.get("column"))))
            right = predicate.get("right", {})
            if isinstance(right, dict) and right.get("column"):
                cols.add(self._safe_identifier(str(right.get("column"))))
        return cols

    def _relink_relational_chain(self, operators: List[RelationalOperator]) -> None:
        for i, operator in enumerate(operators):
            operator.input_op_id = operators[i - 1].op_id if i > 0 else None

    def _build_engine_physical_plan(
        self,
        relational_plan: RelationalPlan,
        dataset_map: Dict[str, Dict[str, Any]],
        backend: Literal["duckdb"],
    ) -> EnginePhysicalPlan:
        """Converts relational algebra into backend-specific physical operators."""
        operators: List[PhysicalOperator] = []

        for rel_op in relational_plan.operators:
            if rel_op.op_type == "scan":
                dataset_id = str(rel_op.args.get("dataset_id"))
                dataset_meta = dataset_map.get(dataset_id)
                if not dataset_meta:
                    raise ValueError(f"Unknown dataset in scan operator: {dataset_id}")

                operators.append(
                    PhysicalOperator(
                        op_id=f"phys_{rel_op.op_id}",
                        operator_type="scan_dataset",
                        params={
                            "dataset_id": dataset_id,
                            "alias": rel_op.args.get("alias") or dataset_meta.get("alias"),
                            "source_uri": dataset_meta.get("path"),
                            "row_count": dataset_meta.get("row_count", 0),
                        },
                        input_operator_id=None,
                    )
                )
            elif rel_op.op_type == "selection":
                operators.append(
                    PhysicalOperator(
                        op_id=f"phys_{rel_op.op_id}",
                        operator_type="apply_filter",
                        params={"expression": rel_op.args.get("expression", {})},
                        input_operator_id=f"phys_{rel_op.input_op_id}" if rel_op.input_op_id else None,
                    )
                )
            elif rel_op.op_type == "projection":
                operators.append(
                    PhysicalOperator(
                        op_id=f"phys_{rel_op.op_id}",
                        operator_type="apply_projection",
                        params={"columns": list(rel_op.args.get("columns", []))},
                        input_operator_id=f"phys_{rel_op.input_op_id}" if rel_op.input_op_id else None,
                    )
                )
            elif rel_op.op_type == "join":
                target_id = str(rel_op.args.get("target_dataset_id"))
                target_meta = dataset_map.get(target_id)
                if not target_meta:
                    raise ValueError(f"Unknown dataset in join operator: {target_id}")

                operators.append(
                    PhysicalOperator(
                        op_id=f"phys_{rel_op.op_id}",
                        operator_type="join_dataset",
                        params={
                            "target_dataset_id": target_id,
                            "target_alias": rel_op.args.get("target_alias") or target_meta.get("alias"),
                            "target_uri": target_meta.get("path"),
                            "target_row_count": target_meta.get("row_count", 0),
                            "join_type": rel_op.args.get("join_type", "LEFT"),
                            "source_column": rel_op.args.get("source_column"),
                            "target_column": rel_op.args.get("target_column"),
                            "operator": rel_op.args.get("operator", "="),
                        },
                        input_operator_id=f"phys_{rel_op.input_op_id}" if rel_op.input_op_id else None,
                    )
                )
            elif rel_op.op_type == "group_by":
                operators.append(
                    PhysicalOperator(
                        op_id=f"phys_{rel_op.op_id}",
                        operator_type="aggregate",
                        params={
                            "group_by": list(rel_op.args.get("group_by", [])),
                            "metrics": list(rel_op.args.get("metrics", [])),
                        },
                        input_operator_id=f"phys_{rel_op.input_op_id}" if rel_op.input_op_id else None,
                    )
                )
            elif rel_op.op_type == "sort":
                operators.append(
                    PhysicalOperator(
                        op_id=f"phys_{rel_op.op_id}",
                        operator_type="sort",
                        params={"keys": list(rel_op.args.get("keys", []))},
                        input_operator_id=f"phys_{rel_op.input_op_id}" if rel_op.input_op_id else None,
                    )
                )
            elif rel_op.op_type == "limit":
                operators.append(
                    PhysicalOperator(
                        op_id=f"phys_{rel_op.op_id}",
                        operator_type="limit",
                        params={"value": int(rel_op.args.get("value", 0))},
                        input_operator_id=f"phys_{rel_op.input_op_id}" if rel_op.input_op_id else None,
                    )
                )
            elif rel_op.op_type == "metric":
                operators.append(
                    PhysicalOperator(
                        op_id=f"phys_{rel_op.op_id}",
                        operator_type="metric_passthrough",
                        params={"dependencies": list(rel_op.args.get("dependencies", []))},
                        input_operator_id=f"phys_{rel_op.input_op_id}" if rel_op.input_op_id else None,
                    )
                )

        return EnginePhysicalPlan(backend=backend, operators=operators)

    def _optimize_engine_physical_plan(self, plan: EnginePhysicalPlan) -> EnginePhysicalPlan:
        """Rule-based physical optimization pass."""
        optimized = plan.model_copy(deep=True)

        for operator in optimized.operators:
            if operator.operator_type != "join_dataset":
                continue

            target_rows = int(operator.params.get("target_row_count", 0) or 0)
            join_type = str(operator.params.get("join_type", "LEFT")).upper()
            if join_type == "INNER" and target_rows >= 100_000:
                operator.params["join_strategy"] = "hash_join"
            else:
                operator.params["join_strategy"] = "nested_loop"

        optimized.optimization_notes.append("physical_join_strategy_selection")
        return optimized

    def _render_engine_physical_plan_to_sql(
        self,
        plan: EnginePhysicalPlan,
        global_filters: Dict[str, Any],
    ) -> str:
        """Builds typed SQL AST from physical operators and renders in one boundary."""
        if not plan.operators:
            return "-- Empty plan"

        renderer = DuckDBSqlAstRenderer()
        cte_names: Dict[str, str] = {}
        ctes: List[SqlCte] = []

        for idx, operator in enumerate(plan.operators):
            cte_name = f"step_{idx}_{self._legacy_cte_label(operator.operator_type)}"
            stmt = self._build_sql_stmt_for_physical_operator(
                operator=operator,
                cte_names=cte_names,
                global_filters=global_filters,
            )
            ctes.append(SqlCte(name=cte_name, statement=stmt))
            cte_names[operator.op_id] = cte_name

        final_cte = cte_names[plan.operators[-1].op_id]
        query = SqlQuery(
            ctes=ctes,
            final_select=SqlSelectStmt(
                select_items=[SqlSelectItem(expression=SqlStar())],
                from_ref=SqlTableRef(table_name=final_cte),
            ),
        )
        return renderer.render_query(query) + ";"

    def _legacy_cte_label(self, operator_type: str) -> str:
        mapping = {
            "scan_dataset": "scan",
            "apply_projection": "project",
            "join_dataset": "join",
            "apply_filter": "filter",
            "aggregate": "aggregate",
            "sort": "sort",
            "limit": "limit",
            "metric_passthrough": "metric",
        }
        return mapping.get(operator_type, operator_type)

    def _build_sql_stmt_for_physical_operator(
        self,
        operator: PhysicalOperator,
        cte_names: Dict[str, str],
        global_filters: Dict[str, Any],
    ) -> SqlSelectStmt:
        op_type = operator.operator_type

        if op_type == "scan_dataset":
            alias = self._safe_identifier(str(operator.params.get("alias", "base")))
            source_uri = str(operator.params.get("source_uri", ""))
            from_ref = SqlFunctionTableRef(
                function_name="read_parquet",
                args=[SqlLiteral(value=f"{source_uri}/**/*.parquet")],
                alias=alias,
            )
            conditions = []
            for key, value in global_filters.items():
                conditions.append(
                    SqlBinaryOp(
                        left=SqlColumn(column=self._safe_identifier(str(key)), relation=alias),
                        operator="=",
                        right=SqlLiteral(value=value),
                    )
                )
            return SqlSelectStmt(
                select_items=[SqlSelectItem(expression=SqlStar())],
                from_ref=from_ref,
                where=self._combine_sql_conditions(conditions, "AND"),
            )

        source_cte = cte_names.get(str(operator.input_operator_id), "")
        if not source_cte:
            raise ValueError(f"Physical operator '{operator.op_id}' missing input source mapping.")

        if op_type == "apply_projection":
            columns = [self._safe_identifier(str(c)) for c in operator.params.get("columns", [])]
            return SqlSelectStmt(
                select_items=[SqlSelectItem(expression=SqlColumn(column=col)) for col in columns],
                from_ref=SqlTableRef(table_name=source_cte),
            )

        if op_type == "apply_filter":
            expression = operator.params.get("expression", {})
            return SqlSelectStmt(
                select_items=[SqlSelectItem(expression=SqlStar())],
                from_ref=SqlTableRef(table_name=source_cte),
                where=self._sql_expression_from_filter_payload(expression, source_cte),
            )

        if op_type == "join_dataset":
            target_alias = self._safe_identifier(str(operator.params.get("target_alias", "join_target")))
            target_uri = str(operator.params.get("target_uri", ""))
            source_col = self._safe_identifier(str(operator.params.get("source_column", "")))
            target_col = self._safe_identifier(str(operator.params.get("target_column", "")))
            join_type = str(operator.params.get("join_type", "LEFT")).upper()
            join_operator = str(operator.params.get("operator", "="))

            join_clause = SqlJoinClause(
                join_type=join_type,
                right=SqlFunctionTableRef(
                    function_name="read_parquet",
                    args=[SqlLiteral(value=f"{target_uri}/**/*.parquet")],
                    alias=target_alias,
                ),
                on=SqlBinaryOp(
                    left=SqlColumn(column=source_col, relation=source_cte),
                    operator=join_operator,
                    right=SqlColumn(column=target_col, relation=target_alias),
                ),
            )
            return SqlSelectStmt(
                select_items=[
                    SqlSelectItem(expression=SqlStar(relation=source_cte)),
                    SqlSelectItem(expression=SqlStar(relation=target_alias, exclude=[target_col])),
                ],
                from_ref=SqlTableRef(table_name=source_cte),
                joins=[join_clause],
            )

        if op_type == "aggregate":
            group_by_cols = [self._safe_identifier(str(c)) for c in operator.params.get("group_by", [])]
            metrics = operator.params.get("metrics", [])

            select_items: List[SqlSelectItem] = [
                SqlSelectItem(expression=SqlColumn(column=col)) for col in group_by_cols
            ]

            for metric in metrics:
                if not isinstance(metric, dict):
                    continue
                metric_name = self._safe_identifier(str(metric.get("name", "metric")))
                function = str(metric.get("function", "COUNT")).upper()
                metric_col = metric.get("column")
                distinct = bool(metric.get("distinct", False))

                if metric_col is None:
                    if function != "COUNT":
                        raise ValueError(f"Metric '{metric_name}' requires a target column.")
                    metric_expr = SqlFunctionCall(name="COUNT", args=[SqlStar()])
                else:
                    metric_expr = SqlFunctionCall(
                        name=function,
                        args=[SqlColumn(column=self._safe_identifier(str(metric_col)))],
                        distinct=distinct,
                    )

                select_items.append(SqlSelectItem(expression=metric_expr, alias=metric_name))

            if not any(item.alias for item in select_items):
                select_items.append(
                    SqlSelectItem(
                        expression=SqlFunctionCall(name="COUNT", args=[SqlStar()]),
                        alias="count_metric",
                    )
                )

            return SqlSelectStmt(
                select_items=select_items,
                from_ref=SqlTableRef(table_name=source_cte),
                group_by=[SqlColumn(column=col) for col in group_by_cols],
            )

        if op_type == "sort":
            order_by = []
            for key in operator.params.get("keys", []):
                if not isinstance(key, dict):
                    continue
                order_by.append(
                    SqlOrderKey(
                        expression=SqlColumn(column=self._safe_identifier(str(key.get("column", "")))),
                        direction=str(key.get("direction", "ASC")).upper(),
                    )
                )
            return SqlSelectStmt(
                select_items=[SqlSelectItem(expression=SqlStar())],
                from_ref=SqlTableRef(table_name=source_cte),
                order_by=order_by,
            )

        if op_type == "limit":
            return SqlSelectStmt(
                select_items=[SqlSelectItem(expression=SqlStar())],
                from_ref=SqlTableRef(table_name=source_cte),
                limit=int(operator.params.get("value", 0)),
            )

        if op_type == "metric_passthrough":
            return SqlSelectStmt(
                select_items=[SqlSelectItem(expression=SqlStar())],
                from_ref=SqlTableRef(table_name=source_cte),
            )

        raise ValueError(f"Unsupported physical operator type: {op_type}")

    def _sql_expression_from_filter_payload(
        self,
        expression_payload: Dict[str, Any],
        source_relation: str,
    ) -> Optional[SqlBinaryOp]:
        if not isinstance(expression_payload, dict):
            return None

        predicates_payload = expression_payload.get("predicates", [])
        if not isinstance(predicates_payload, list) or not predicates_payload:
            return None

        combinator = str(expression_payload.get("combinator", "AND")).upper()
        predicate_exprs = []
        for predicate in predicates_payload:
            if not isinstance(predicate, dict):
                continue
            left_payload = predicate.get("left", {})
            if isinstance(left_payload, dict):
                left_col = self._safe_identifier(str(left_payload.get("column", "")))
            else:
                left_col = self._safe_identifier(str(predicate.get("column", "")))

            operator = str(predicate.get("operator", "=")).upper()
            right_payload = predicate.get("right", {})
            if isinstance(right_payload, dict) and right_payload.get("column"):
                right_expr = SqlColumn(
                    column=self._safe_identifier(str(right_payload.get("column"))),
                    relation=source_relation,
                )
            elif isinstance(right_payload, dict) and "value" in right_payload:
                right_expr = SqlLiteral(value=right_payload.get("value"))
            elif "value" in predicate:
                right_expr = SqlLiteral(value=predicate.get("value"))
            else:
                continue

            predicate_exprs.append(
                SqlBinaryOp(
                    left=SqlColumn(column=left_col, relation=source_relation),
                    operator=operator,
                    right=right_expr,
                )
            )

        return self._combine_sql_conditions(predicate_exprs, combinator)

    def _combine_sql_conditions(
        self,
        conditions: List[SqlBinaryOp],
        combinator: str,
    ) -> Optional[SqlBinaryOp]:
        if not conditions:
            return None
        expr = conditions[0]
        for condition in conditions[1:]:
            expr = SqlBinaryOp(left=expr, operator=combinator, right=condition)
        return expr

    # ------------------------------------------------------------------
    # NORMALIZATION (COMPATIBILITY ONLY)
    # ------------------------------------------------------------------

    def _normalize_step(self, step: StrategyStep, strict_mode: bool = True) -> StrategyStep:
        op_value = (step.op or step.operation or "").strip().lower()
        if not op_value:
            raise ValueError("StrategyStep missing operation/op.")

        args = dict(step.args or {})

        if strict_mode and op_value not in {"scan", "fallback"} and not args:
            raise ValueError(
                f"Strict compiler mode requires explicit args for step op='{op_value}'."
            )

        # Canonical migration for legacy payloads.
        if not args:
            if op_value == "project":
                args = {"columns": list(step.columns)}
            elif op_value == "limit":
                if step.columns:
                    try:
                        args = {"value": int(step.columns[0])}
                    except Exception as exc:
                        raise ValueError(f"Invalid limit step payload: {step.columns}") from exc
            elif op_value == "sort":
                keys = []
                for col in step.columns:
                    parsed_col, direction = self._parse_sort_token(col)
                    keys.append({"column": parsed_col, "direction": direction})
                args = {"keys": keys}
            elif op_value == "join":
                args = self._normalize_join_args(step)
            elif op_value == "filter":
                args = self._normalize_filter_args(step)
            elif op_value == "aggregate":
                # Compiler does not infer aggregate semantics; this fallback keeps
                # backward compatibility but requires explicit group_by/metrics keys.
                args = {
                    "group_by": list(step.columns),
                    "metrics": [],
                }

        normalized = StrategyStep(
            op=op_value,  # type: ignore[arg-type]
            args=args,
            output_schema=step.output_schema,
            operation=step.operation,
            columns=step.columns,
            description=step.description,
            target=step.target,
            on=step.on,
            target_dataset=step.target_dataset,
            join_keys=step.join_keys,
            aggregation_intent=step.aggregation_intent,
            join_config=step.join_config,
        )
        return normalized

    def _normalize_join_args(self, step: StrategyStep) -> Dict[str, Any]:
        if step.join_config:
            return {
                "target_dataset_id": str(step.join_config.target_dataset_id),
                "condition": {
                    "source_column": step.join_config.source_column,
                    "target_column": step.join_config.target_column,
                    "join_type": step.join_config.join_type.upper(),
                },
            }

        target = step.target or step.target_dataset
        condition_payload: Optional[Dict[str, Any]] = None

        if step.on:
            source_col, target_col = self._parse_on_expression(step.on)
            condition_payload = {
                "source_column": source_col,
                "target_column": target_col,
                "join_type": "LEFT",
            }

        if not condition_payload and step.join_keys:
            pair = next(iter(step.join_keys.items()), None)
            if pair and pair[0] and pair[1]:
                source_col = pair[0].split(".")[-1]
                target_col = pair[1].split(".")[-1]
                if not target:
                    target = pair[1].split(".")[0]
                condition_payload = {
                    "source_column": source_col,
                    "target_column": target_col,
                    "join_type": "LEFT",
                }

        if not condition_payload and step.columns:
            source_col, target_col = self._parse_on_expression(step.columns[0])
            condition_payload = {
                "source_column": source_col,
                "target_column": target_col,
                "join_type": "LEFT",
            }

        if not target or not condition_payload:
            raise ValueError("Join step must provide typed target_dataset_id and condition.")

        return {
            "target_dataset_id": target,
            "condition": condition_payload,
        }

    def _normalize_filter_args(self, step: StrategyStep) -> Dict[str, Any]:
        predicates = []
        for token in step.columns:
            parsed = self._parse_filter_token(token)
            predicates.append(parsed)

        if not predicates:
            raise ValueError("Filter step requires explicit predicates.")

        return {
            "expression": {
                "combinator": "AND",
                "predicates": predicates,
            }
        }

    # ------------------------------------------------------------------
    # LOGICAL PLAN BUILDING
    # ------------------------------------------------------------------

    def _build_logical_plan(
        self,
        base_ds_id: str,
        dataset_map: Dict[str, Dict[str, Any]],
        steps: List[StrategyStep],
        metric_catalog: Dict[str, str],
    ) -> LogicalPlan:
        nodes: List[PlanNode] = []
        dependencies: Dict[str, List[str]] = {}
        lineage: Dict[str, ColumnLineage] = {}

        base_meta = dataset_map[base_ds_id]
        base_node = ScanNode(
            node_id="n0_scan",
            dataset_id=base_ds_id,
            alias=base_meta["alias"],
            path=base_meta["path"],
        )
        nodes.append(base_node)
        dependencies[base_node.node_id] = []

        current_node_id = base_node.node_id
        active_columns: Set[str] = set(base_meta["columns"])
        for col in active_columns:
            lineage[col] = ColumnLineage(
                source_columns=[f"{base_ds_id}.{col}"],
                transformations=[f"scan:{base_ds_id}"],
            )

        for idx, step in enumerate(steps, start=1):
            if not step.op or step.op == "fallback":
                continue

            node_id = f"n{idx}_{step.op}"

            if step.op == "scan":
                # Scan is produced once from target_dataset_ids[0].
                continue

            if step.op == "project":
                col_names = [self._safe_identifier(c) for c in step.args.get("columns", [])]
                if not col_names:
                    raise ValueError("Project step missing columns.")
                self._require_columns(active_columns, col_names)
                node = ProjectNode(
                    node_id=node_id,
                    input_node_id=current_node_id,
                    columns=[ColumnRef(column=c) for c in col_names],
                )
                lineage = {k: v for k, v in lineage.items() if k in set(col_names)}
                for col in col_names:
                    lineage.setdefault(
                        col,
                        ColumnLineage(
                            source_columns=[f"project.{col}"],
                            transformations=["project"],
                        ),
                    )
                active_columns = set(col_names)

            elif step.op == "join":
                target_id = self._resolve_dataset_id(step.args.get("target_dataset_id"), dataset_map)
                if not target_id:
                    raise ValueError(f"Join step target is unauthorized: {step.args.get('target_dataset_id')}")

                target_meta = dataset_map[target_id]
                condition = self._coerce_join_edge(step.args.get("condition"))

                self._require_columns(active_columns, [condition.source_column])
                self._require_columns(set(target_meta["columns"]), [condition.target_column])

                node = JoinNode(
                    node_id=node_id,
                    input_node_id=current_node_id,
                    target_dataset_id=target_id,
                    target_alias=target_meta["alias"],
                    target_path=target_meta["path"],
                    condition=condition,
                )

                joined_cols = set(target_meta["columns"])
                if condition.target_column in joined_cols:
                    joined_cols.remove(condition.target_column)
                active_columns.update(joined_cols)
                for col in joined_cols:
                    existing = lineage.get(col)
                    if existing:
                        existing.transformations.append(f"join:{target_id}")
                    else:
                        lineage[col] = ColumnLineage(
                            source_columns=[f"{target_id}.{col}"],
                            transformations=[f"join:{target_id}"],
                        )

            elif step.op == "filter":
                expression = self._coerce_filter_expression(step.args.get("expression"))
                for predicate in expression.predicates:
                    self._require_columns(active_columns, [predicate.left.column])
                    if isinstance(predicate.right, ColumnRef):
                        self._require_columns(active_columns, [predicate.right.column])
                node = FilterNode(
                    node_id=node_id,
                    input_node_id=current_node_id,
                    expression=expression,
                )
                for item in lineage.values():
                    item.transformations.append("filter")

            elif step.op == "aggregate":
                group_by_cols = [self._safe_identifier(c) for c in step.args.get("group_by", [])]
                self._require_columns(active_columns, group_by_cols)

                metrics = self._coerce_metrics(
                    step.args.get("metrics", []),
                    metric_catalog,
                    available_columns=sorted(active_columns),
                )
                if not metrics:
                    metrics = [AggregateMetricNode(name="count_metric", function="COUNT")]

                metric_node = MetricNode(
                    node_id=f"{node_id}_metric",
                    input_node_id=current_node_id,
                    name="metric_lowering",
                    function="COUNT",
                    column=None,
                    dependencies=[m.name for m in metrics],
                )
                nodes.append(metric_node)
                dependencies[metric_node.node_id] = [current_node_id]
                current_node_id = metric_node.node_id

                node = AggregateNode(
                    node_id=node_id,
                    input_node_id=current_node_id,
                    group_by=[ColumnRef(column=c) for c in group_by_cols],
                    metrics=metrics,
                )

                next_lineage: Dict[str, ColumnLineage] = {}
                for col in group_by_cols:
                    prior = lineage.get(col)
                    if prior:
                        next_lineage[col] = ColumnLineage(
                            source_columns=list(prior.source_columns),
                            transformations=list(prior.transformations) + ["aggregate:group_by"],
                        )
                    else:
                        next_lineage[col] = ColumnLineage(
                            source_columns=[col],
                            transformations=["aggregate:group_by"],
                        )

                for metric in metrics:
                    metric_name = self._safe_identifier(metric.name)
                    metric_source = metric.column.column if metric.column else "*"
                    next_lineage[metric_name] = ColumnLineage(
                        source_columns=[metric_source],
                        transformations=[f"aggregate:{metric.function}"],
                    )

                lineage = next_lineage
                active_columns = set(group_by_cols)
                active_columns.update({self._safe_identifier(m.name) for m in metrics})

            elif step.op == "sort":
                keys_payload = step.args.get("keys", [])
                keys = []
                for item in keys_payload:
                    column = self._safe_identifier(str(item.get("column", "")))
                    direction = str(item.get("direction", "ASC")).upper()
                    if direction not in {"ASC", "DESC"}:
                        raise ValueError(f"Invalid sort direction: {direction}")
                    self._require_columns(active_columns, [column])
                    keys.append(SortKey(column=ColumnRef(column=column), direction=direction))

                if not keys:
                    raise ValueError("Sort step requires at least one key.")

                node = SortNode(
                    node_id=node_id,
                    input_node_id=current_node_id,
                    keys=keys,
                )
                for item in lineage.values():
                    item.transformations.append("sort")

            elif step.op == "limit":
                value = int(step.args.get("value", 0))
                if value <= 0:
                    raise ValueError("Limit step value must be > 0.")
                node = LimitNode(
                    node_id=node_id,
                    input_node_id=current_node_id,
                    value=value,
                )
                for item in lineage.values():
                    item.transformations.append("limit")

            else:
                raise ValueError(f"Unsupported step op: {step.op}")

            nodes.append(node)
            dependencies[node.node_id] = [current_node_id]
            current_node_id = node.node_id

        return LogicalPlan(nodes=nodes, dependencies=dependencies, lineage=lineage)

    # ------------------------------------------------------------------
    # VALIDATION AND PHYSICAL PLANNING
    # ------------------------------------------------------------------

    def _validate_logical_plan(self, logical_plan: LogicalPlan) -> None:
        node_ids = {node.node_id for node in logical_plan.nodes}

        for node_id, deps in logical_plan.dependencies.items():
            if node_id not in node_ids:
                raise ValueError(f"Dependency references unknown node: {node_id}")
            for dep in deps:
                if dep not in node_ids:
                    raise ValueError(f"Dependency references missing prerequisite node: {dep}")

        self._assert_acyclic(logical_plan.dependencies)

    def _assert_acyclic(self, dependencies: Dict[str, List[str]]) -> None:
        temp_mark: Set[str] = set()
        perm_mark: Set[str] = set()

        def visit(node_id: str) -> None:
            if node_id in perm_mark:
                return
            if node_id in temp_mark:
                raise ValueError(f"Logical plan cycle detected at node '{node_id}'")
            temp_mark.add(node_id)
            for dep in dependencies.get(node_id, []):
                visit(dep)
            temp_mark.remove(node_id)
            perm_mark.add(node_id)

        for node_id in dependencies.keys():
            visit(node_id)

    def _build_physical_plan(self, logical_plan: LogicalPlan) -> PhysicalPlan:
        node_index = {node.node_id: node for node in logical_plan.nodes}
        resolved: Set[str] = set()
        ordered: List[PlanNode] = []

        def emit(node_id: str) -> None:
            if node_id in resolved:
                return
            for dep in logical_plan.dependencies.get(node_id, []):
                emit(dep)
            resolved.add(node_id)
            ordered.append(node_index[node_id])

        for node_id in node_index.keys():
            emit(node_id)

        return PhysicalPlan(ordered_nodes=ordered)

    def _validate_join_graph(
        self,
        base_ds_id: str,
        steps: List[StrategyStep],
        datasets: List[Dataset],
    ) -> Dict[str, Any]:
        """Validates requested join topology against the typed join graph."""
        dataset_map = self._build_dataset_aliases(datasets)

        tables_metadata: Dict[str, Any] = {}
        for ds in datasets:
            ds_id = str(ds.id)
            schema = ds.schema_metadata if isinstance(ds.schema_metadata, dict) else {}
            columns = schema.get("columns", {}) if isinstance(schema, dict) else {}

            fks: List[Dict[str, Any]] = []
            top_level_fks = schema.get("foreign_keys", []) if isinstance(schema, dict) else []
            if isinstance(top_level_fks, list):
                for fk in top_level_fks:
                    if isinstance(fk, dict):
                        fks.append(dict(fk))

            if isinstance(columns, dict):
                for col_name, col_meta in columns.items():
                    if not isinstance(col_meta, dict):
                        continue
                    col_fks = col_meta.get("foreign_keys", [])
                    if isinstance(col_fks, list):
                        for fk in col_fks:
                            if isinstance(fk, dict):
                                fks.append({
                                    "column": fk.get("column", col_name),
                                    "target_table": fk.get("target_table"),
                                    "target_column": fk.get("target_column", "id"),
                                })

            normalized_fks: List[Dict[str, Any]] = []
            for fk in fks:
                target_token = fk.get("target_table")
                resolved_target = self._resolve_dataset_id(str(target_token), dataset_map) if target_token else None
                normalized_fks.append({
                    "column": fk.get("column"),
                    "target_table": resolved_target or target_token,
                    "target_column": fk.get("target_column", "id"),
                    "is_unique": fk.get("is_unique", False),
                })

            tables_metadata[ds_id] = {
                "columns": columns if isinstance(columns, dict) else {},
                "foreign_keys": normalized_fks,
            }

        join_graph_validator.load_from_schema_metadata(tables_metadata)

        requested_tables: List[str] = [base_ds_id]
        for step in steps:
            if step.op != "join":
                continue
            target_id = self._resolve_dataset_id(step.args.get("target_dataset_id"), dataset_map)
            if target_id and target_id not in requested_tables:
                requested_tables.append(target_id)

        result = join_graph_validator.validate_query_intent(requested_tables)

        authorized_targets = {base_ds_id}
        for edge in result.safe_join_path:
            authorized_targets.add(edge.source_table)
            authorized_targets.add(edge.target_table)

        unauthorized_join_targets = []
        for step in steps:
            if step.op != "join":
                continue
            target_id = self._resolve_dataset_id(step.args.get("target_dataset_id"), dataset_map)
            if target_id and target_id not in authorized_targets:
                unauthorized_join_targets.append(target_id)

        return {
            "is_valid": result.is_valid and not unauthorized_join_targets,
            "is_cartesian": result.is_cartesian,
            "has_fan_out": result.has_fan_out,
            "has_chasm_trap": result.has_chasm_trap,
            "warnings": list(result.warnings),
            "errors": list(result.errors) + ([
                f"Join targets not authorized by safe path: {sorted(set(unauthorized_join_targets))}"
            ] if unauthorized_join_targets else []),
            "safe_join_path": [
                {
                    "source_table": edge.source_table,
                    "source_column": edge.source_column,
                    "target_table": edge.target_table,
                    "target_column": edge.target_column,
                    "cardinality": edge.cardinality.value,
                }
                for edge in result.safe_join_path
            ],
        }

    def _validate_security_contract(
        self,
        logical_plan: LogicalPlan,
        dataset_map: Dict[str, Dict[str, Any]],
    ) -> None:
        """Structural SQL validator over AST nodes prior to rendering."""
        allowed_node_types = {"scan", "project", "join", "filter", "metric", "aggregate", "sort", "limit"}
        allowed_predicate_ops = {"=", "!=", ">", ">=", "<", "<=", "IN", "LIKE", "IS", "IS NOT"}

        for node in logical_plan.nodes:
            if node.node_type not in allowed_node_types:
                raise ValueError(f"Unsupported AST node type: {node.node_type}")

            if isinstance(node, JoinNode):
                if node.target_dataset_id not in dataset_map:
                    raise ValueError(f"Unauthorized join target dataset: {node.target_dataset_id}")
                if node.condition.operator != "=":
                    raise ValueError("Only equality join predicates are allowed.")

            if isinstance(node, FilterNode):
                for predicate in node.expression.predicates:
                    if predicate.operator not in allowed_predicate_ops:
                        raise ValueError(f"Unsupported filter operator: {predicate.operator}")

    def _build_execution_dag(
        self,
        logical_plan: LogicalPlan,
        relational_plan: RelationalPlan,
        engine_physical_plan: EnginePhysicalPlan,
    ) -> Dict[str, Any]:
        """Produces DAG metadata across all compile layers for observability."""
        logical_nodes = [
            {
                "id": node.node_id,
                "type": node.node_type,
            }
            for node in logical_plan.nodes
        ]
        return {
            # Backward-compatible top-level shape consumed by existing callers/tests.
            "nodes": logical_nodes,
            "dependencies": dict(logical_plan.dependencies),
            "lineage_columns": sorted(logical_plan.lineage.keys()),
            "optimization_notes": list(logical_plan.optimization_notes),

            # New multi-layer introspection payload.
            "relational": {
                "operators": [
                    {
                        "id": op.op_id,
                        "type": op.op_type,
                        "input": op.input_op_id,
                    }
                    for op in relational_plan.operators
                ],
                "optimization_notes": list(relational_plan.optimization_notes),
            },
            "engine_physical": {
                "backend": engine_physical_plan.backend,
                "operators": [
                    {
                        "id": op.op_id,
                        "type": op.operator_type,
                        "input": op.input_operator_id,
                    }
                    for op in engine_physical_plan.operators
                ],
                "optimization_notes": list(engine_physical_plan.optimization_notes),
            },
        }

    # ------------------------------------------------------------------
    # COERCION HELPERS
    # ------------------------------------------------------------------

    def _coerce_join_edge(self, payload: Any) -> JoinEdge:
        if isinstance(payload, JoinEdge):
            return payload
        if not isinstance(payload, dict):
            raise ValueError(f"Join condition must be a typed object, got: {payload!r}")

        source_col = payload.get("source_column")
        target_col = payload.get("target_column")
        join_type = str(payload.get("join_type", "LEFT")).upper()
        operator = payload.get("operator", "=")

        if join_type not in {"INNER", "LEFT", "RIGHT", "FULL"}:
            raise ValueError(f"Unsupported join type: {join_type}")
        if operator != "=":
            raise ValueError("Only equality joins are supported in typed JoinEdge.")

        if not source_col or not target_col:
            raise ValueError("Join condition requires source_column and target_column.")

        return JoinEdge(
            source_column=self._safe_identifier(str(source_col)),
            target_column=self._safe_identifier(str(target_col)),
            join_type=join_type,
            operator="=",
        )

    def _coerce_filter_expression(self, payload: Any) -> FilterExpression:
        if isinstance(payload, FilterExpression):
            return payload

        if not isinstance(payload, dict):
            raise ValueError("Filter expression must be a typed object.")

        combinator = str(payload.get("combinator", "AND")).upper()
        if combinator not in {"AND", "OR"}:
            raise ValueError(f"Invalid filter combinator: {combinator}")

        predicates_payload = payload.get("predicates", [])
        if not isinstance(predicates_payload, list):
            raise ValueError("Filter expression predicates must be a list.")

        predicates: List[PredicateNode] = []
        for item in predicates_payload:
            if not isinstance(item, dict):
                raise ValueError(f"Invalid predicate payload: {item!r}")

            left_payload = item.get("left")
            if isinstance(left_payload, dict):
                left_col = left_payload.get("column")
            else:
                left_col = item.get("column")
            if not left_col:
                raise ValueError(f"Predicate missing left column: {item!r}")

            operator = str(item.get("operator", "=")).upper()
            right_payload = item.get("right")

            if isinstance(right_payload, dict) and "column" in right_payload:
                right_node: Any = ColumnRef(column=self._safe_identifier(str(right_payload["column"])))
            elif isinstance(right_payload, dict) and "value" in right_payload:
                right_node = LiteralValue(value=right_payload["value"])
            elif "value" in item:
                right_node = LiteralValue(value=item["value"])
            else:
                raise ValueError(f"Predicate missing right side: {item!r}")

            predicates.append(
                PredicateNode(
                    left=ColumnRef(column=self._safe_identifier(str(left_col))),
                    operator=operator,  # type: ignore[arg-type]
                    right=right_node,
                )
            )

        if not predicates:
            raise ValueError("Filter expression must contain at least one predicate.")

        return FilterExpression(combinator=combinator, predicates=predicates)

    def _coerce_metrics(
        self,
        payload: Any,
        metric_catalog: Dict[str, str],
        available_columns: Optional[List[str]] = None,
    ) -> List[AggregateMetricNode]:
        metrics: List[AggregateMetricNode] = []

        if isinstance(payload, list):
            for item in payload:
                if not isinstance(item, dict):
                    continue
                fn = str(item.get("function", "")).upper()
                name = str(item.get("name", "")).strip()
                col_name = item.get("column")
                distinct = bool(item.get("distinct", False))

                if not name or fn not in {"COUNT", "SUM", "AVG", "MIN", "MAX"}:
                    continue

                column_ref = None
                if col_name:
                    column_ref = ColumnRef(column=self._safe_identifier(str(col_name)))

                metrics.append(
                    AggregateMetricNode(
                        name=self._safe_identifier(name),
                        function=fn,  # type: ignore[arg-type]
                        column=column_ref,
                        distinct=distinct,
                    )
                )

        if not metrics and metric_catalog:
            lowered = metric_compiler.lower_metric_catalog(
                metric_catalog=metric_catalog,
                available_columns=available_columns,
            )
            for item in lowered:
                metrics.append(
                    AggregateMetricNode(
                        name=self._safe_identifier(item.name),
                        function=item.function,
                        column=ColumnRef(column=self._safe_identifier(item.column)) if item.column else None,
                        distinct=item.distinct,
                    )
                )

            if metric_catalog and not metrics:
                logger.warning(
                    "Governed metrics were requested but none could be lowered into typed aggregate nodes."
                )

        return metrics

    # ------------------------------------------------------------------
    # PARSERS FOR LEGACY STEP TOKENS
    # ------------------------------------------------------------------

    def _parse_on_expression(self, value: str) -> Tuple[str, str]:
        if "=" not in value:
            raise ValueError(f"Invalid join expression: {value}")

        left, right = [v.strip() for v in value.split("=", 1)]
        left_col = self._safe_identifier(left.split(".")[-1])
        right_col = self._safe_identifier(right.split(".")[-1])
        if not left_col or not right_col:
            raise ValueError(f"Invalid join expression columns: {value}")

        return left_col, right_col

    def _parse_filter_token(self, token: str) -> Dict[str, Any]:
        op_candidates = [">=", "<=", "!=", "=", ">", "<"]
        for op in op_candidates:
            if op in token:
                left, right = [v.strip() for v in token.split(op, 1)]
                return {
                    "left": {"column": self._safe_identifier(left.split(".")[-1])},
                    "operator": op,
                    "right": {"value": self._parse_literal_token(right)},
                }

        raise ValueError(f"Unsupported filter token: {token}")

    def _parse_literal_token(self, token: str) -> Any:
        cleaned = token.strip()
        if cleaned.startswith("'") and cleaned.endswith("'"):
            return cleaned[1:-1]
        if cleaned.startswith('"') and cleaned.endswith('"'):
            return cleaned[1:-1]

        lowered = cleaned.lower()
        if lowered == "true":
            return True
        if lowered == "false":
            return False
        if lowered == "null":
            return None

        try:
            return ast.literal_eval(cleaned)
        except Exception:
            return cleaned

    def _parse_sort_token(self, token: str) -> Tuple[str, str]:
        parts = token.strip().split()
        if len(parts) == 1:
            return self._safe_identifier(parts[0].split(".")[-1]), "ASC"

        column = self._safe_identifier(parts[0].split(".")[-1])
        direction = parts[1].upper()
        if direction not in {"ASC", "DESC"}:
            raise ValueError(f"Invalid sort token: {token}")
        return column, direction

    # ------------------------------------------------------------------
    # UTILITIES
    # ------------------------------------------------------------------

    def _build_dataset_aliases(self, datasets: List[Dataset]) -> Dict[str, Dict[str, Any]]:
        mapping: Dict[str, Dict[str, Any]] = {}
        for ds in datasets:
            slug = "".join(e for e in ds.name.lower() if e.isalnum())
            alias = f"{slug}_{abs(hash(str(ds.id))) % 10000}"

            schema_cols: List[str] = []
            row_count = 0
            if ds.schema_metadata and isinstance(ds.schema_metadata, dict):
                raw_cols = ds.schema_metadata.get("columns", {})
                if isinstance(raw_cols, dict):
                    schema_cols = [self._safe_identifier(str(c)) for c in raw_cols.keys()]
                row_count = int(ds.schema_metadata.get("row_count", 0) or 0)

            mapping[str(ds.id)] = {
                "alias": alias,
                "path": ds.file_path,
                "name": ds.name,
                "name_slug": slug,
                "columns": schema_cols,
                "row_count": row_count,
            }
        return mapping

    def _resolve_dataset_id(
        self,
        token: Optional[str],
        dataset_map: Dict[str, Dict[str, Any]],
    ) -> Optional[str]:
        if not token:
            return None

        normalized = str(token).strip().lower()

        for ds_id in dataset_map.keys():
            if normalized == str(ds_id).lower():
                return ds_id

        for ds_id, meta in dataset_map.items():
            candidates = {
                str(meta.get("alias", "")).lower(),
                str(meta.get("name", "")).lower(),
                str(meta.get("name_slug", "")).lower(),
            }
            if normalized in candidates:
                return ds_id

        return None

    def _require_columns(self, available: Set[str], requested: List[str]) -> None:
        missing = [col for col in requested if col not in available]
        if missing:
            raise ValueError(f"Referenced columns are not available in current schema: {missing}")

    def _safe_identifier(self, value: str) -> str:
        cleaned = "".join(ch for ch in str(value) if ch.isalnum() or ch == "_")
        if not cleaned:
            raise ValueError(f"Invalid identifier: {value!r}")
        return cleaned


# Global singleton
sql_compiler = SQLCompiler()
