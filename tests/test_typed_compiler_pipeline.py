import sys
import types
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pytest

# Some route-level tests preload a minimal `models` stub. Ensure compiler imports
# still succeed when that module lacks these ORM symbols.
models_mod = sys.modules.get("models")
if models_mod is not None:
    if not hasattr(models_mod, "Dataset"):
        setattr(models_mod, "Dataset", type("Dataset", (), {}))
    if not hasattr(models_mod, "SemanticMetric"):
        setattr(models_mod, "SemanticMetric", type("SemanticMetric", (), {}))

from api.services.sql_compiler import QueryPlan, SQLCompiler, StrategyStep

# Keep execution-engine imports lightweight for tests.
llm_stub = types.ModuleType("api.services.llm_client")
llm_stub.llm_client = object()
sys.modules.setdefault("api.services.llm_client", llm_stub)

from api.services.execution_engine import ExecutionEngine, ExecutionResult


@dataclass
class FakeDataset:
    id: str
    name: str
    file_path: str
    schema_metadata: Dict[str, Any]


@dataclass
class FakeMetric:
    metric_name: str
    compiled_sql: str


class FakeRedis:
    def __init__(self):
        self.store: Dict[str, str] = {}

    async def get(self, key: str) -> Optional[str]:
        return self.store.get(key)

    async def setex(self, key: str, _ttl: int, value: str) -> None:
        self.store[key] = value


def _dataset(
    dataset_id: str,
    name: str,
    file_path: str,
    columns: List[str],
    foreign_keys: Optional[List[Dict[str, Any]]] = None,
) -> FakeDataset:
    return FakeDataset(
        id=dataset_id,
        name=name,
        file_path=file_path,
        schema_metadata={
            "row_count": 1000,
            "columns": {col: {"type": "VARCHAR"} for col in columns},
            "foreign_keys": foreign_keys or [],
        },
    )


def test_compile_artifact_supports_typed_join_and_filter_steps() -> None:
    compiler = SQLCompiler()

    customers = _dataset(
        dataset_id="ds_customers",
        name="customers",
        file_path="/tmp/customers",
        columns=["id", "country"],
    )
    orders = _dataset(
        dataset_id="ds_orders",
        name="orders",
        file_path="/tmp/orders",
        columns=["order_id", "customer_id", "revenue"],
        foreign_keys=[
            {
                "column": "customer_id",
                "target_table": "customers",
                "target_column": "id",
            }
        ],
    )

    plan = QueryPlan(
        execution_intent="ANALYTICAL",
        target_dataset_ids=[customers.id],
        context_filters={},
        requested_governed_metrics=[],
        analytical_strategy=[
            StrategyStep(
                op="join",
                args={
                    "target_dataset_id": orders.id,
                    "condition": {
                        "source_column": "id",
                        "target_column": "customer_id",
                        "join_type": "LEFT",
                    },
                },
            ),
            StrategyStep(
                op="filter",
                args={
                    "expression": {
                        "combinator": "AND",
                        "predicates": [
                            {
                                "left": {"column": "revenue"},
                                "operator": ">",
                                "right": {"value": 100},
                            }
                        ],
                    }
                },
            ),
            StrategyStep(op="project", args={"columns": ["id", "revenue"]}),
        ],
    )

    artifact = compiler.compile_artifact(
        plan=plan,
        datasets=[customers, orders],
        governed_metrics=[],
        strict_mode=True,
    )

    assert artifact.join_validation["is_valid"] is True
    assert "LEFT JOIN read_parquet('/tmp/orders/**/*.parquet')" in artifact.sql
    assert "WHERE step_1_join.revenue > 100" in artifact.sql
    assert len(artifact.plan_fingerprint) == 64
    assert len(artifact.execution_dag["nodes"]) == 4


def test_compile_artifact_rejects_disconnected_join_graph() -> None:
    compiler = SQLCompiler()

    left = _dataset(
        dataset_id="ds_left",
        name="left_table",
        file_path="/tmp/left",
        columns=["id", "value"],
    )
    right = _dataset(
        dataset_id="ds_right",
        name="right_table",
        file_path="/tmp/right",
        columns=["id", "amount"],
    )

    plan = QueryPlan(
        execution_intent="ANALYTICAL",
        target_dataset_ids=[left.id],
        context_filters={},
        requested_governed_metrics=[],
        analytical_strategy=[
            StrategyStep(
                op="join",
                args={
                    "target_dataset_id": right.id,
                    "condition": {
                        "source_column": "id",
                        "target_column": "id",
                        "join_type": "LEFT",
                    },
                },
            )
        ],
    )

    with pytest.raises(ValueError, match="Join graph validation failed"):
        compiler.compile_artifact(
            plan=plan,
            datasets=[left, right],
            governed_metrics=[],
            strict_mode=True,
        )


def test_governed_metric_lowering_compiles_into_aggregate_sql() -> None:
    compiler = SQLCompiler()

    sales = _dataset(
        dataset_id="ds_sales",
        name="sales",
        file_path="/tmp/sales",
        columns=["country", "revenue"],
    )

    plan = QueryPlan(
        execution_intent="ANALYTICAL",
        target_dataset_ids=[sales.id],
        context_filters={},
        requested_governed_metrics=["true_revenue"],
        analytical_strategy=[
            StrategyStep(
                op="aggregate",
                args={"group_by": ["country"], "metrics": []},
            )
        ],
    )

    artifact = compiler.compile_artifact(
        plan=plan,
        datasets=[sales],
        governed_metrics=[FakeMetric(metric_name="true_revenue", compiled_sql="SUM(revenue)")],
        strict_mode=True,
    )

    assert "SUM(revenue) AS true_revenue" in artifact.sql
    assert "GROUP BY country" in artifact.sql
    assert any(node["type"] == "metric" for node in artifact.execution_dag["nodes"])


def test_governed_metric_falls_back_to_count_when_column_is_unavailable() -> None:
    compiler = SQLCompiler()

    sales = _dataset(
        dataset_id="ds_sales",
        name="sales",
        file_path="/tmp/sales",
        columns=["country", "revenue"],
    )

    plan = QueryPlan(
        execution_intent="ANALYTICAL",
        target_dataset_ids=[sales.id],
        context_filters={},
        requested_governed_metrics=["unsafe_metric"],
        analytical_strategy=[
            StrategyStep(
                op="aggregate",
                args={"group_by": ["country"], "metrics": []},
            )
        ],
    )

    artifact = compiler.compile_artifact(
        plan=plan,
        datasets=[sales],
        governed_metrics=[FakeMetric(metric_name="unsafe_metric", compiled_sql="SUM(secret_col)")],
        strict_mode=True,
    )

    assert "COUNT(*) AS count_metric" in artifact.sql
    assert "secret_col" not in artifact.sql


@pytest.mark.asyncio
async def test_execution_cache_prefers_plan_fingerprint_for_cache_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    engine = ExecutionEngine()
    engine.redis = FakeRedis()

    calls = {"count": 0}

    async def fake_run(*_args, **kwargs):
        calls["count"] += 1
        return ExecutionResult(
            status="success",
            execution_time_ms=1.0,
            row_count=1,
            data=[{"ok": True}],
            plan_fingerprint=kwargs.get("plan_fingerprint"),
            cache_key=kwargs.get("cache_key"),
        )

    monkeypatch.setattr(engine, "_run_physical_compute", fake_run)

    first = await engine.execute_query(
        tenant_id="tenant_1",
        sql_query="SELECT 1",
        plan_fingerprint="plan_a",
        projection_signature="id|revenue",
    )
    second = await engine.execute_query(
        tenant_id="tenant_1",
        sql_query="SELECT 1",
        plan_fingerprint="plan_a",
        projection_signature="id|revenue",
    )
    third = await engine.execute_query(
        tenant_id="tenant_1",
        sql_query="SELECT 1",
        plan_fingerprint="plan_b",
        projection_signature="id|revenue",
    )

    assert calls["count"] == 2
    assert first.cache_key == second.cache_key
    assert third.cache_key != first.cache_key
