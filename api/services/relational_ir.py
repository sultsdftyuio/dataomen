from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class RelationalOperator(BaseModel):
    """Engine-agnostic relational algebra operator."""

    op_id: str
    op_type: Literal[
        "scan",
        "selection",
        "projection",
        "join",
        "group_by",
        "sort",
        "limit",
        "metric",
    ]
    args: Dict[str, Any] = Field(default_factory=dict)
    input_op_id: Optional[str] = None


class RelationalPlan(BaseModel):
    """Pure relational algebra plan, independent from execution backend."""

    operators: List[RelationalOperator] = Field(default_factory=list)
    optimization_notes: List[str] = Field(default_factory=list)


class PhysicalOperator(BaseModel):
    """Backend-specific physical operator contract consumed by execution adapters."""

    op_id: str
    operator_type: Literal[
        "scan_dataset",
        "apply_filter",
        "apply_projection",
        "join_dataset",
        "aggregate",
        "sort",
        "limit",
        "metric_passthrough",
    ]
    params: Dict[str, Any] = Field(default_factory=dict)
    input_operator_id: Optional[str] = None


class EnginePhysicalPlan(BaseModel):
    """Backend physical execution plan."""

    backend: Literal["duckdb"] = "duckdb"
    operators: List[PhysicalOperator] = Field(default_factory=list)
    optimization_notes: List[str] = Field(default_factory=list)
