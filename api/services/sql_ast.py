from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# TYPED EXPRESSIONS
# ---------------------------------------------------------------------------


class ColumnRef(BaseModel):
    """A validated column reference within the execution pipeline."""

    column: str = Field(..., description="Column identifier.")
    relation: Optional[str] = Field(
        default=None,
        description="Optional relation marker for rendering context.",
    )


class LiteralValue(BaseModel):
    """A typed literal used in predicates."""

    value: Any


class PredicateNode(BaseModel):
    """A typed comparison predicate."""

    left: ColumnRef
    operator: Literal["=", "!=", ">", ">=", "<", "<=", "IN", "LIKE", "IS", "IS NOT"]
    right: Union[ColumnRef, LiteralValue]


class FilterExpression(BaseModel):
    """A boolean expression built from typed predicates only."""

    combinator: Literal["AND", "OR"] = "AND"
    predicates: List[PredicateNode] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# JOIN CONTRACTS
# ---------------------------------------------------------------------------


class JoinEdge(BaseModel):
    """A typed join edge used by join nodes and graph validators."""

    source_column: str
    target_column: str
    operator: Literal["="] = "="
    join_type: Literal["INNER", "LEFT", "RIGHT", "FULL"] = "LEFT"


# ---------------------------------------------------------------------------
# SQL AST NODES
# ---------------------------------------------------------------------------


class SQLNode(BaseModel):
    node_id: str
    node_type: str


class ScanNode(SQLNode):
    node_type: Literal["scan"] = "scan"
    dataset_id: str
    alias: str
    path: str


class ProjectNode(SQLNode):
    node_type: Literal["project"] = "project"
    input_node_id: str
    columns: List[ColumnRef] = Field(default_factory=list)


class JoinNode(SQLNode):
    node_type: Literal["join"] = "join"
    input_node_id: str
    target_dataset_id: str
    target_alias: str
    target_path: str
    condition: JoinEdge


class FilterNode(SQLNode):
    node_type: Literal["filter"] = "filter"
    input_node_id: str
    expression: FilterExpression


class AggregateMetricNode(BaseModel):
    name: str
    function: Literal["COUNT", "SUM", "AVG", "MIN", "MAX"]
    column: Optional[ColumnRef] = None
    distinct: bool = False


class MetricNode(SQLNode):
    """Semantic metric contract lowered before aggregate rendering."""

    node_type: Literal["metric"] = "metric"
    input_node_id: str
    name: str
    function: Literal["COUNT", "SUM", "AVG", "MIN", "MAX"]
    column: Optional[ColumnRef] = None
    dependencies: List[str] = Field(default_factory=list)


class AggregateNode(SQLNode):
    node_type: Literal["aggregate"] = "aggregate"
    input_node_id: str
    group_by: List[ColumnRef] = Field(default_factory=list)
    metrics: List[AggregateMetricNode] = Field(default_factory=list)


class SortKey(BaseModel):
    column: ColumnRef
    direction: Literal["ASC", "DESC"] = "ASC"


class SortNode(SQLNode):
    node_type: Literal["sort"] = "sort"
    input_node_id: str
    keys: List[SortKey] = Field(default_factory=list)


class LimitNode(SQLNode):
    node_type: Literal["limit"] = "limit"
    input_node_id: str
    value: int


PlanNode = Union[
    ScanNode,
    ProjectNode,
    JoinNode,
    FilterNode,
    MetricNode,
    AggregateNode,
    SortNode,
    LimitNode,
]


class ColumnLineage(BaseModel):
    """Column-level provenance for explainability and governance."""

    source_columns: List[str] = Field(default_factory=list)
    transformations: List[str] = Field(default_factory=list)


class LogicalPlan(BaseModel):
    """Logical DAG representation before physical ordering."""

    nodes: List[PlanNode] = Field(default_factory=list)
    dependencies: Dict[str, List[str]] = Field(default_factory=dict)
    lineage: Dict[str, ColumnLineage] = Field(default_factory=dict)
    optimization_notes: List[str] = Field(default_factory=list)


class PhysicalPlan(BaseModel):
    """Physical execution order after dependency resolution."""

    ordered_nodes: List[PlanNode] = Field(default_factory=list)


def logical_plan_fingerprint(plan: LogicalPlan) -> str:
    """Stable hash used for plan-level caching and deduplication."""

    if hasattr(plan, "model_dump"):
        payload = plan.model_dump()
    else:
        payload = plan.dict()
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
