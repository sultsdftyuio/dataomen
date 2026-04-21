import copy
import hashlib
import hmac
import importlib
import json
import sys
import types
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.testclient import TestClient

from tests.stub_registry import install_default_import_stubs


def _install_import_stubs() -> None:
    """Provide lightweight infrastructure stubs required for route imports in tests."""
    # Canonical stub bootstrap. Legacy module-level guards below remain for compatibility.
    install_default_import_stubs()

    models_module = sys.modules.get("models")
    if models_module is not None:
        class _ModelExprStub:
            def __eq__(self, _other):
                return True

            def in_(self, _values):
                return True

            def is_(self, _value):
                return True

            def isnot(self, _value):
                return True

            def desc(self):
                return self

            def asc(self):
                return self

        def _create_model_class(name: str):
            attrs = {
                "id": _ModelExprStub(),
                "tenant_id": _ModelExprStub(),
                "dataset_id": _ModelExprStub(),
                "agent_id": _ModelExprStub(),
                "created_at": _ModelExprStub(),
                "status": _ModelExprStub(),
                "organization_id": _ModelExprStub(),
                "metric_name": _ModelExprStub(),
            }
            cls = type(name, (), attrs)
            setattr(models_module, name, cls)
            return cls

        for model_name in (
            "Agent",
            "InvestigationRecord",
            "Dataset",
            "QueryHistory",
            "Organization",
            "SemanticMetric",
        ):
            if not hasattr(models_module, model_name):
                _create_model_class(model_name)

        if not hasattr(models_module, "DatasetStatus"):
            class _DatasetStatusStub(str, Enum):
                PENDING = "PENDING"
                PROCESSING = "PROCESSING"
                READY = "READY"
                FAILED = "FAILED"

            setattr(models_module, "DatasetStatus", _DatasetStatusStub)

        if not hasattr(models_module, "SubscriptionTier"):
            class _SubscriptionTierStub(str, Enum):
                FREE = "FREE"
                PRO = "PRO"
                ENTERPRISE = "ENTERPRISE"

            setattr(models_module, "SubscriptionTier", _SubscriptionTierStub)

    auth_module = sys.modules.get("api.auth")
    if auth_module is None:
        auth_module = types.ModuleType("api.auth")
        sys.modules["api.auth"] = auth_module

    @dataclass
    class _TenantContextStub:
        tenant_id: str
        user_id: str = "test-user"
        email: str = "test@arcli.tech"
        role: str = "authenticated"
        app_metadata: Optional[dict] = None

    def _verify_tenant_stub():
        raise RuntimeError("verify_tenant should be dependency-overridden in tests")

    def _get_current_user_stub():
        return {
            "sub": "test-user",
            "email": "test@arcli.tech",
            "organization_id": "tenant_abc123",
        }

    if not hasattr(auth_module, "TenantContext"):
        auth_module.TenantContext = _TenantContextStub
    if not hasattr(auth_module, "verify_tenant"):
        auth_module.verify_tenant = _verify_tenant_stub
    if not hasattr(auth_module, "get_current_user"):
        auth_module.get_current_user = _get_current_user_stub

    if "supabase" not in sys.modules:
        supabase_module = types.ModuleType("supabase")

        class _SupabaseClientStub:
            pass

        supabase_module.Client = _SupabaseClientStub
        supabase_module.create_client = lambda *_args, **_kwargs: _SupabaseClientStub()
        sys.modules["supabase"] = supabase_module

    if "qdrant_client.models" not in sys.modules:
        qdrant_module = sys.modules.setdefault("qdrant_client", types.ModuleType("qdrant_client"))
        qdrant_models_module = types.ModuleType("qdrant_client.models")

        class _QdrantModelStub:
            def __init__(self, *_args, **_kwargs):
                pass

        qdrant_models_module.Filter = _QdrantModelStub
        qdrant_models_module.FieldCondition = _QdrantModelStub
        qdrant_models_module.MatchValue = _QdrantModelStub

        setattr(qdrant_module, "models", qdrant_models_module)
        sys.modules["qdrant_client.models"] = qdrant_models_module

    if "api.services.vector_service" not in sys.modules:
        vector_service_module = types.ModuleType("api.services.vector_service")

        class _VectorServiceStub:
            client = None

        vector_service_module.vector_service = _VectorServiceStub()
        sys.modules["api.services.vector_service"] = vector_service_module

    if "api.services.storage_manager" not in sys.modules:
        storage_module = types.ModuleType("api.services.storage_manager")

        class _StorageManagerStub:
            async def upload_raw_file_async(self, *_args, **_kwargs) -> str:
                return "s3://stub-bucket/tenants/tenant_id=tenant_abc123/raw/file.csv"

            def delete_file(self, *_args, **_kwargs) -> None:
                return None

        storage_module.storage_manager = _StorageManagerStub()
        sys.modules["api.services.storage_manager"] = storage_module

    if "api.services.cache_manager" not in sys.modules:
        cache_module = types.ModuleType("api.services.cache_manager")

        class _CacheManagerStub:
            async def get_cached_insight(self, *_args, **_kwargs):
                return None

            async def set_cached_insight(self, *_args, **_kwargs) -> None:
                return None

            async def invalidate_dataset_cache(self, *_args, **_kwargs) -> int:
                return 0

        cache_module.cache_manager = _CacheManagerStub()
        sys.modules["api.services.cache_manager"] = cache_module

    if "api.services.llm_client" not in sys.modules:
        llm_module = types.ModuleType("api.services.llm_client")

        class _LLMClientStub:
            async def generate_structured(self, *_args, **_kwargs):
                return SimpleNamespace()

            async def embed(self, *_args, **_kwargs):
                return [0.0]

            async def embed_batch(self, texts: List[str]):
                return [[0.0] for _ in texts]

            async def stream_text(self, *_args, **_kwargs):
                if False:
                    yield ""

        llm_module.LLMClient = _LLMClientStub
        llm_module.llm_client = _LLMClientStub()
        sys.modules["api.services.llm_client"] = llm_module

    if "api.services.query_planner" not in sys.modules:
        planner_module = types.ModuleType("api.services.query_planner")

        class _QueryPlanStub:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)
                self.intent = kwargs.get("intent") or kwargs.get("intent_summary", "")

        planner_module.QueryPlan = _QueryPlanStub
        sys.modules["api.services.query_planner"] = planner_module

    if "api.services.insight_orchestrator" not in sys.modules:
        insight_module = types.ModuleType("api.services.insight_orchestrator")

        class _InsightPayloadStub:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

            def model_dump(self):
                return dict(self.__dict__)

        class _InsightOrchestratorStub:
            def analyze_dataframe(self, *_args, **_kwargs):
                return _InsightPayloadStub(row_count=1, intent_analyzed="stub")

        insight_module.InsightPayload = _InsightPayloadStub
        insight_module.InsightOrchestrator = _InsightOrchestratorStub
        sys.modules["api.services.insight_orchestrator"] = insight_module

    if "api.services.narrative_service" not in sys.modules:
        narrative_module = types.ModuleType("api.services.narrative_service")

        class _NarrativeResponseStub:
            def model_dump(self):
                return {
                    "executive_summary": "stub summary",
                    "key_insights": ["stub insight"],
                    "recommended_action": "stub action",
                }

        class _NarrativeServiceStub:
            async def generate_executive_summary(self, *_args, **_kwargs):
                return _NarrativeResponseStub()

        narrative_module.NarrativeService = _NarrativeServiceStub
        narrative_module.narrative_service = _NarrativeServiceStub()
        sys.modules["api.services.narrative_service"] = narrative_module

    if "api.services.nl2sql_generator" not in sys.modules:
        generator_module = types.ModuleType("api.services.nl2sql_generator")

        class _NL2SQLGeneratorStub:
            async def generate_sql(self, *_args, **_kwargs):
                return "SELECT 1", None

            async def correct_sql(self, *_args, **_kwargs):
                return "SELECT 1", None

        generator_module.NL2SQLGenerator = _NL2SQLGeneratorStub
        sys.modules["api.services.nl2sql_generator"] = generator_module

    if "api.services.compute_engine" not in sys.modules:
        compute_module = types.ModuleType("api.services.compute_engine")

        class _ComputeRouterStub:
            @staticmethod
            def requires_background_worker(_sql: str) -> bool:
                return False

        class _ComputeEngineStub:
            async def execute_read_only(self, *_args, **_kwargs):
                return []

            async def execute_ml_pipeline(self, *_args, **_kwargs):
                return {"status": "skipped"}

        compute_module.compute_engine = _ComputeEngineStub()
        compute_module.ComputeRouter = _ComputeRouterStub
        sys.modules["api.services.compute_engine"] = compute_module

    if "api.services.metric_governance" not in sys.modules:
        governance_module = types.ModuleType("api.services.metric_governance")

        class _MetricGovernanceStub:
            def inject_governed_metrics(self, _db, _tenant_id, _dataset_id, sql_query: str) -> str:
                return sql_query

        governance_module.metric_governance_service = _MetricGovernanceStub()
        sys.modules["api.services.metric_governance"] = governance_module

    if "api.services.ab_testing" not in sys.modules:
        ab_module = types.ModuleType("api.services.ab_testing")

        class _ABTesterStub:
            def analyze_experiment(self, *_args, **_kwargs):
                return {"status": "ok"}

        ab_module.ab_tester = _ABTesterStub()
        sys.modules["api.services.ab_testing"] = ab_module

    if "utils.supabase.server" not in sys.modules:
        utils_module = sys.modules.setdefault("utils", types.ModuleType("utils"))
        supabase_module = sys.modules.setdefault("utils.supabase", types.ModuleType("utils.supabase"))

        # Keep attribute links explicit for older import resolution paths.
        setattr(utils_module, "supabase", supabase_module)

        server_module = types.ModuleType("utils.supabase.server")

        class _FakeTable:
            def upsert(self, *_args, **_kwargs):
                return self

            def execute(self):
                return {"status": "ok"}

        class _FakeSupabase:
            def table(self, _table_name: str) -> _FakeTable:
                return _FakeTable()

        server_module.create_client = lambda: _FakeSupabase()
        sys.modules["utils.supabase.server"] = server_module

    if "api.services.sync_engine" not in sys.modules:
        sync_module = types.ModuleType("api.services.sync_engine")
        sync_module.INTEGRATION_REGISTRY = {
            "shopify": object(),
            "stripe": object(),
        }
        sys.modules["api.services.sync_engine"] = sync_module

    if "compute_worker" not in sys.modules:
        worker_module = types.ModuleType("compute_worker")

        class _TaskStub:
            def delay(self, *_args, **_kwargs):
                return SimpleNamespace(id="job-stub")

        worker_module.process_ingestion_dataset = _TaskStub()
        sys.modules["compute_worker"] = worker_module


_install_import_stubs()

from api.routes import agents as agents_route
from api.routes import billing as billing_route
from api.routes import datasets as datasets_route
from api.routes import query as query_route
from api.routes import webhooks as webhooks_route


class _QueryStub:
    def __init__(self, rows: Iterable[Any]):
        self._rows: List[Any] = list(rows)

    def filter(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def offset(self, value: int):
        self._rows = self._rows[value:]
        return self

    def limit(self, value: int):
        self._rows = self._rows[:value]
        return self

    def with_for_update(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)


class FakeDB:
    """Minimal SQLAlchemy-like stub for route-level end-to-end wiring tests."""

    def __init__(self):
        self._committed_datasets: List[Any] = []
        self._committed_agents: List[Any] = []
        self._committed_organization: Optional[Any] = None

        self._working_datasets: List[Any] = []
        self._working_agents: List[Any] = []
        self._working_organization: Optional[Any] = None

        self._in_transaction: bool = False
        self.commits: int = 0
        self.events: List[tuple[str, Dict[str, Any]]] = []
        self.transaction_stack: List[Dict[str, Any]] = []

    @property
    def datasets(self) -> List[Any]:
        return self._working_datasets

    @datasets.setter
    def datasets(self, value: List[Any]) -> None:
        self._working_datasets = self._clone_rows(value)
        self._committed_datasets = self._clone_rows(value)

    @property
    def agents(self) -> List[Any]:
        return self._working_agents

    @agents.setter
    def agents(self, value: List[Any]) -> None:
        self._working_agents = self._clone_rows(value)
        self._committed_agents = self._clone_rows(value)

    @property
    def organization(self) -> Optional[Any]:
        return self._working_organization

    @organization.setter
    def organization(self, value: Optional[Any]) -> None:
        self._working_organization = self._clone_value(value)
        self._committed_organization = self._clone_value(value)

    def _clone_rows(self, rows: List[Any]) -> List[Any]:
        return [copy.deepcopy(row) for row in rows]

    def _clone_value(self, value: Optional[Any]) -> Optional[Any]:
        return copy.deepcopy(value) if value is not None else None

    def _committed_snapshot(self) -> Dict[str, Any]:
        return {
            "datasets": self._clone_rows(self._committed_datasets),
            "agents": self._clone_rows(self._committed_agents),
            "organization": self._clone_value(self._committed_organization),
        }

    def _refresh_working_from_committed(self) -> None:
        self._working_datasets = self._clone_rows(self._committed_datasets)
        self._working_agents = self._clone_rows(self._committed_agents)
        self._working_organization = self._clone_value(self._committed_organization)

    def _match_by_identity_or_id(self, candidates: List[Any], obj: Any) -> Optional[Any]:
        target_id = getattr(obj, "id", None)
        for candidate in candidates:
            if candidate is obj:
                return candidate
            if target_id is not None and getattr(candidate, "id", None) == target_id:
                return candidate
        return None

    def _ensure_transaction(self, reason: str) -> None:
        if not self._in_transaction:
            self.transaction_stack.append(self._committed_snapshot())
            self._refresh_working_from_committed()
            self._in_transaction = True
            self.events.append(("txn_opened", {"reason": reason, "depth": len(self.transaction_stack)}))

    def query(self, model):
        model_name = getattr(model, "__name__", str(model)).lower()
        if "organization" in model_name:
            rows = [self._working_organization] if self._working_organization is not None else []
            return _QueryStub(rows)
        if "agent" in model_name:
            return _QueryStub(self._working_agents)
        if "dataset" in model_name:
            return _QueryStub(self._working_datasets)
        return _QueryStub([])

    def add(self, obj: Any) -> None:
        self._ensure_transaction("add")
        staged_obj = copy.deepcopy(obj)
        if getattr(staged_obj, "id", None) is None:
            staged_obj.id = uuid.uuid4()
        if getattr(staged_obj, "created_at", None) is None:
            staged_obj.created_at = datetime.now(timezone.utc)

        if getattr(obj, "id", None) is None:
            obj.id = staged_obj.id
        if getattr(obj, "created_at", None) is None:
            obj.created_at = staged_obj.created_at

        obj_name = staged_obj.__class__.__name__.lower()
        if "dataset" in obj_name and self._match_by_identity_or_id(self._working_datasets, staged_obj) is None:
            self._working_datasets.append(staged_obj)
        if "agent" in obj_name and self._match_by_identity_or_id(self._working_agents, staged_obj) is None:
            self._working_agents.append(staged_obj)

        self.events.append(("add", {"kind": obj_name, "id": str(getattr(staged_obj, "id", ""))}))

    def delete(self, obj: Any) -> None:
        self._ensure_transaction("delete")
        dataset_match = self._match_by_identity_or_id(self._working_datasets, obj)
        if dataset_match is not None:
            self._working_datasets.remove(dataset_match)
        agent_match = self._match_by_identity_or_id(self._working_agents, obj)
        if agent_match is not None:
            self._working_agents.remove(agent_match)

        self.events.append(("delete", {"id": str(getattr(obj, "id", ""))}))

    def commit(self) -> None:
        self.commits += 1
        self._committed_datasets = self._clone_rows(self._working_datasets)
        self._committed_agents = self._clone_rows(self._working_agents)
        self._committed_organization = self._clone_value(self._working_organization)
        self._in_transaction = False
        self.transaction_stack.clear()
        self.events.append(
            (
                "commit",
                {
                    "commits": self.commits,
                    "dataset_count": len(self._working_datasets),
                    "agent_count": len(self._working_agents),
                    "organization_queries": getattr(self._working_organization, "current_month_queries", None),
                },
            )
        )

    def refresh(self, obj: Any) -> None:
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)

    def rollback(self) -> None:
        if self.transaction_stack:
            snapshot = self.transaction_stack.pop()
            self._working_datasets = self._clone_rows(snapshot["datasets"])
            self._working_agents = self._clone_rows(snapshot["agents"])
            self._working_organization = self._clone_value(snapshot["organization"])
            self._in_transaction = False
            self.events.append(("rollback", {"restored": True, "dataset_count": len(self._working_datasets)}))
            return

        self._refresh_working_from_committed()
        self._in_transaction = False
        self.events.append(("rollback", {"restored": False, "dataset_count": len(self._working_datasets)}))


@dataclass
class RecordedBackgroundTask:
    func: Any
    args: tuple[Any, ...]
    kwargs: Dict[str, Any]


class InspectableBackgroundTasks(BackgroundTasks):
    """Stable wrapper that records task payloads without relying on internals."""

    def __init__(self) -> None:
        super().__init__()
        self.recorded: List[RecordedBackgroundTask] = []

    def add_task(self, func: Any, *args: Any, **kwargs: Any) -> None:
        self.recorded.append(
            RecordedBackgroundTask(func=func, args=args, kwargs=dict(kwargs))
        )
        super().add_task(func, *args, **kwargs)


def _assert_system_invariants(db: FakeDB, tenant_id: str) -> None:
    dataset_ids = [str(getattr(dataset, "id", "")) for dataset in db.datasets]
    assert len(dataset_ids) == len(set(dataset_ids))
    for dataset in db.datasets:
        assert getattr(dataset, "tenant_id", tenant_id) == tenant_id
    for agent in db.agents:
        assert getattr(agent, "tenant_id", tenant_id) == tenant_id


class _FakeWebhookRequest:
    def __init__(self, payload: dict):
        self._raw = json.dumps(payload).encode("utf-8")

    async def body(self) -> bytes:
        return self._raw

    async def json(self) -> dict:
        return json.loads(self._raw.decode("utf-8"))


def _install_query_model_adapters(monkeypatch: pytest.MonkeyPatch) -> None:
    class _ExprStub:
        def __eq__(self, _other):
            return True

        def in_(self, _values):
            return True

    class DatasetQueryModel:
        id = _ExprStub()
        tenant_id = _ExprStub()

    class OrganizationQueryModel:
        id = _ExprStub()

    monkeypatch.setattr(query_route, "Dataset", DatasetQueryModel)
    monkeypatch.setattr(query_route, "Organization", OrganizationQueryModel)


def _seed_persistent_query_context(monkeypatch: pytest.MonkeyPatch) -> tuple[FakeDB, SimpleNamespace, SimpleNamespace]:
    db = FakeDB()
    tenant = SimpleNamespace(tenant_id="tenant_abc123")
    _install_query_model_adapters(monkeypatch)

    db.organization = SimpleNamespace(
        id=tenant.tenant_id,
        current_month_queries=0,
        monthly_query_limit=10,
    )
    dataset = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        name="shopify_orders",
        schema_metadata={"columns": {"revenue": "DOUBLE"}},
    )
    db.datasets = [dataset]
    return db, tenant, dataset


class DependencyOverrideContainer:
    """Small adapter over monkeypatch to centralize test dependency overrides."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch):
        self._monkeypatch = monkeypatch

    def override(self, target: Any, attribute: str, implementation: Any, *, raising: bool = False) -> None:
        self._monkeypatch.setattr(target, attribute, implementation, raising=raising)


def test_main_application_wires_routes_and_health(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bootstraps the app and verifies core route registration + health middleware output."""
    chat_stub_module = types.ModuleType("api.routes.chat")
    chat_router = APIRouter(prefix="/api/chat", tags=["Chat"])

    @chat_router.post("/orchestrate")
    async def _orchestrate_stub():
        return {"status": "stubbed"}

    chat_stub_module.router = chat_router
    monkeypatch.setitem(sys.modules, "api.routes.chat", chat_stub_module)

    agent_memory_stub_module = types.ModuleType("api.services.agent_memory")
    agent_memory_stub_module.build_redis_client = lambda: None
    agent_memory_stub_module.initialize_agent_memory = lambda _client: None
    agent_memory_stub_module.reset_agent_memory = lambda: None
    monkeypatch.setitem(sys.modules, "api.services.agent_memory", agent_memory_stub_module)

    import api.database as database_module

    monkeypatch.setattr(database_module, "init_db", lambda: None, raising=False)

    main_module = importlib.reload(importlib.import_module("main"))

    route_paths = {route.path for route in main_module.app.routes}
    assert "/health" in route_paths
    assert "/api/health" in route_paths
    assert "/api/agents/" in route_paths
    assert "/api/datasets" in route_paths
    assert "/api/query/persistent" in route_paths
    assert "/api/narrative/generate" in route_paths
    assert "/api/webhooks/lemonsqueezy" in route_paths
    assert "/api/billing/checkout" in route_paths

    middleware_classes = {mw.cls.__name__ for mw in main_module.app.user_middleware}
    assert "CORSMiddleware" in middleware_classes
    assert "GZipMiddleware" in middleware_classes

    with TestClient(main_module.app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "optimal"
    assert "X-Process-Time" in response.headers
    assert response.headers["X-Frame-Options"] == "DENY"


@pytest.mark.asyncio
async def test_dataset_create_sync_delete_flow_is_fully_wired(monkeypatch: pytest.MonkeyPatch) -> None:
    """Runs dataset registration -> queue dispatch -> manual sync -> deletion lifecycle."""

    class _ColumnStub:
        def __eq__(self, _other):
            return True

        def in_(self, _values):
            return True

        def desc(self):
            return self

    class DatasetStub:
        id = _ColumnStub()
        tenant_id = _ColumnStub()
        created_at = _ColumnStub()

        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)
            self.id = kwargs.get("id")
            self.created_at = kwargs.get("created_at")

    db = FakeDB()
    tenant = SimpleNamespace(tenant_id="tenant_abc123")

    monkeypatch.setattr(datasets_route, "Dataset", DatasetStub)
    monkeypatch.setattr(
        datasets_route.process_ingestion_dataset,
        "delay",
        lambda *_args, **_kwargs: SimpleNamespace(id="job-001"),
    )

    create_request = datasets_route.DatasetCreate(
        name="Revenue Warehouse",
        integration_name="shopify",
        stream_name="orders",
    )

    created = await datasets_route.create_dataset(request=create_request, context=tenant, db=db)
    created_dataset_id = uuid.UUID(created["id"])

    assert created["name"] == "Revenue Warehouse"
    assert created["status"] == "PENDING"
    _assert_system_invariants(db, tenant.tenant_id)

    sync_result = await datasets_route.trigger_manual_sync(
        dataset_id=created_dataset_id,
        context=tenant,
        db=db,
    )
    assert sync_result.status == "accepted"
    assert sync_result.job_id == "job-001"

    db.datasets[0].status = datasets_route.DatasetStatus.READY

    background_tasks = InspectableBackgroundTasks()
    delete_result = await datasets_route.delete_dataset(
        dataset_id=created_dataset_id,
        background_tasks=background_tasks,
        context=tenant,
        db=db,
    )

    assert delete_result is None
    assert db.datasets == []
    assert len(background_tasks.recorded) == 1

    cleanup_task = background_tasks.recorded[0]
    assert cleanup_task.func is datasets_route._cleanup_dataset_resources
    assert cleanup_task.kwargs["tenant_id"] == tenant.tenant_id
    assert cleanup_task.kwargs["dataset_id"] == str(created_dataset_id)
    assert cleanup_task.kwargs["file_path"] is None


@pytest.mark.asyncio
async def test_persistent_query_pipeline_executes_across_services(monkeypatch: pytest.MonkeyPatch) -> None:
    """Validates the persistent NL-to-SQL pipeline wiring from route to compute + cache layers."""
    db = FakeDB()
    tenant = SimpleNamespace(tenant_id="tenant_abc123")
    container = DependencyOverrideContainer(monkeypatch)
    _install_query_model_adapters(monkeypatch)

    db.organization = SimpleNamespace(
        id=tenant.tenant_id,
        current_month_queries=0,
        monthly_query_limit=10,
    )
    dataset = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        name="shopify_orders",
        schema_metadata={"columns": {"revenue": "DOUBLE"}},
    )
    db.datasets = [dataset]

    class QueryPlanStub:
        def __init__(self, intent: str, is_achievable: bool, steps: List[Any], suggested_visualizations: List[Any]):
            self.intent = intent
            self.is_achievable = is_achievable
            self.steps = steps
            self.suggested_visualizations = suggested_visualizations

    class NarrativeStub:
        def model_dump(self) -> dict:
            return {
                "executive_summary": "Revenue is stable.",
                "key_insights": ["Daily revenue is flat around 42."],
                "recommended_action": "Monitor for weekly trend changes.",
            }

    container.override(query_route, "QueryPlan", QueryPlanStub)
    container.override(query_route.cache_manager, "get_cached_insight", AsyncMock(return_value=None), raising=False)
    container.override(query_route.cache_manager, "set_cached_insight", AsyncMock(), raising=False)
    container.override(
        query_route.generator,
        "generate_sql",
        AsyncMock(return_value=("SELECT 42 AS revenue", {"mark": "bar"})),
    )
    container.override(
        query_route.metric_governance_service,
        "inject_governed_metrics",
        lambda *_args: _args[-1],
    )
    container.override(
        query_route.compute_engine,
        "execute_read_only",
        AsyncMock(return_value=[{"revenue": 42.0}]),
    )
    container.override(
        query_route.insight_engine,
        "analyze_dataframe",
        lambda *_args, **_kwargs: SimpleNamespace(signal="ok"),
        raising=False,
    )
    container.override(
        query_route.narrative_service,
        "generate_executive_summary",
        AsyncMock(return_value=NarrativeStub()),
    )

    request = query_route.PersistentQueryRequest(
        dataset_id=str(dataset.id),
        natural_query="Show me current revenue.",
        agent_id=str(uuid.uuid4()),
    )
    background_tasks = InspectableBackgroundTasks()

    response = await query_route.execute_persistent_query(
        request=request,
        background_tasks=background_tasks,
        db=db,
        tenant=tenant,
    )

    assert response["status"] == "success"
    assert response["execution_mode"] == "sync"
    assert response["data"][0]["revenue"] == 42.0
    assert response["narrative"]["executive_summary"] == "Revenue is stable."
    _assert_system_invariants(db, tenant.tenant_id)

    commit_events = [meta for event_name, meta in db.events if event_name == "commit"]
    assert any(meta.get("organization_queries") == 1 for meta in commit_events)

    assert len(background_tasks.recorded) == 1
    audit_task = background_tasks.recorded[0]
    assert audit_task.func is query_route.async_audit_logger
    assert audit_task.args[1] == tenant.tenant_id
    assert audit_task.args[2] == request.agent_id
    assert audit_task.args[3] == request.natural_query
    assert audit_task.args[6] is True
    assert query_route.cache_manager.set_cached_insight.await_count == 1


def test_fake_db_rollback_restores_last_committed_snapshot() -> None:
    db = FakeDB()

    class DatasetRecord:
        def __init__(self):
            self.id = uuid.uuid4()
            self.tenant_id = "tenant_abc123"
            self.created_at = datetime.now(timezone.utc)
            self.status = "READY"

    dataset = DatasetRecord()

    db.add(dataset)
    db.commit()

    db.delete(dataset)
    assert db.query(type("DatasetModel", (), {})).first() is None

    db.rollback()
    restored = db.query(type("DatasetModel", (), {})).first()
    assert restored is not None
    assert str(restored.id) == str(dataset.id)
    assert db.events[-1][0] == "rollback"


@pytest.mark.asyncio
async def test_persistent_query_rejects_invalid_sql_from_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    db, tenant, dataset = _seed_persistent_query_context(monkeypatch)

    class QueryPlanStub:
        def __init__(self, intent: str, is_achievable: bool, steps: List[Any], suggested_visualizations: List[Any]):
            self.intent = intent
            self.is_achievable = is_achievable
            self.steps = steps
            self.suggested_visualizations = suggested_visualizations

    monkeypatch.setattr(query_route, "QueryPlan", QueryPlanStub)
    monkeypatch.setattr(query_route.cache_manager, "get_cached_insight", AsyncMock(return_value=None), raising=False)
    monkeypatch.setattr(query_route.cache_manager, "set_cached_insight", AsyncMock(), raising=False)
    monkeypatch.setattr(
        query_route.generator,
        "generate_sql",
        AsyncMock(return_value=("DROP TABLE users", None)),
    )

    request = query_route.PersistentQueryRequest(
        dataset_id=str(dataset.id),
        natural_query="Drop all user data",
        agent_id=str(uuid.uuid4()),
    )

    with pytest.raises(HTTPException) as exc_info:
        await query_route.execute_persistent_query(
            request=request,
            background_tasks=BackgroundTasks(),
            db=db,
            tenant=tenant,
        )

    assert exc_info.value.status_code == 400
    assert "Security Violation" in str(exc_info.value.detail)
    assert query_route.cache_manager.set_cached_insight.await_count == 0


@pytest.mark.asyncio
async def test_persistent_query_corrects_sql_after_compute_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    db, tenant, dataset = _seed_persistent_query_context(monkeypatch)

    class QueryPlanStub:
        def __init__(self, intent: str, is_achievable: bool, steps: List[Any], suggested_visualizations: List[Any]):
            self.intent = intent
            self.is_achievable = is_achievable
            self.steps = steps
            self.suggested_visualizations = suggested_visualizations

    class NarrativeStub:
        def model_dump(self) -> dict:
            return {
                "executive_summary": "Corrected execution succeeded.",
                "key_insights": ["Fallback correction recovered the query."],
                "recommended_action": "Monitor transient compute saturation.",
            }

    compute_mock = AsyncMock(side_effect=[TimeoutError("compute timed out"), [{"revenue": 7.0}]])
    correct_mock = AsyncMock(return_value=("SELECT 7 AS revenue", {"mark": "line"}))

    monkeypatch.setattr(query_route, "QueryPlan", QueryPlanStub)
    monkeypatch.setattr(query_route.cache_manager, "get_cached_insight", AsyncMock(return_value=None), raising=False)
    monkeypatch.setattr(query_route.cache_manager, "set_cached_insight", AsyncMock(), raising=False)
    monkeypatch.setattr(query_route.generator, "generate_sql", AsyncMock(return_value=("SELECT revenue FROM t", {"mark": "bar"})))
    monkeypatch.setattr(query_route.generator, "correct_sql", correct_mock)
    monkeypatch.setattr(query_route.metric_governance_service, "inject_governed_metrics", lambda *_args: _args[-1])
    monkeypatch.setattr(query_route.compute_engine, "execute_read_only", compute_mock)
    monkeypatch.setattr(query_route.insight_engine, "analyze_dataframe", lambda *_args, **_kwargs: SimpleNamespace(signal="ok"), raising=False)
    monkeypatch.setattr(query_route.narrative_service, "generate_executive_summary", AsyncMock(return_value=NarrativeStub()))

    response = await query_route.execute_persistent_query(
        request=query_route.PersistentQueryRequest(
            dataset_id=str(dataset.id),
            natural_query="Show corrected revenue",
            agent_id=str(uuid.uuid4()),
        ),
        background_tasks=BackgroundTasks(),
        db=db,
        tenant=tenant,
    )

    assert response["status"] == "success"
    assert response["data"][0]["revenue"] == 7.0
    assert correct_mock.await_count == 1
    assert compute_mock.await_count == 2


@pytest.mark.asyncio
async def test_persistent_query_surfaces_failure_after_correction_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    db, tenant, dataset = _seed_persistent_query_context(monkeypatch)

    class QueryPlanStub:
        def __init__(self, intent: str, is_achievable: bool, steps: List[Any], suggested_visualizations: List[Any]):
            self.intent = intent
            self.is_achievable = is_achievable
            self.steps = steps
            self.suggested_visualizations = suggested_visualizations

    compute_mock = AsyncMock(side_effect=[TimeoutError("primary compute timed out"), RuntimeError("secondary compute failed")])

    monkeypatch.setattr(query_route, "QueryPlan", QueryPlanStub)
    monkeypatch.setattr(query_route.cache_manager, "get_cached_insight", AsyncMock(return_value=None), raising=False)
    monkeypatch.setattr(query_route.cache_manager, "set_cached_insight", AsyncMock(), raising=False)
    monkeypatch.setattr(query_route.generator, "generate_sql", AsyncMock(return_value=("SELECT revenue FROM t", {"mark": "bar"})))
    monkeypatch.setattr(query_route.generator, "correct_sql", AsyncMock(return_value=("SELECT revenue FROM recovered", {"mark": "bar"})))
    monkeypatch.setattr(query_route.metric_governance_service, "inject_governed_metrics", lambda *_args: _args[-1])
    monkeypatch.setattr(query_route.compute_engine, "execute_read_only", compute_mock)

    request = query_route.PersistentQueryRequest(
        dataset_id=str(dataset.id),
        natural_query="Show unstable revenue",
        agent_id=str(uuid.uuid4()),
    )
    background_tasks = InspectableBackgroundTasks()

    with pytest.raises(HTTPException) as exc_info:
        await query_route.execute_persistent_query(
            request=request,
            background_tasks=background_tasks,
            db=db,
            tenant=tenant,
        )

    assert exc_info.value.status_code == 500
    assert "Analytical Engine Exception" in str(exc_info.value.detail)
    assert len(background_tasks.recorded) == 1

    failed_audit = background_tasks.recorded[0]
    assert failed_audit.func is query_route.async_audit_logger
    assert failed_audit.args[2] == request.agent_id
    assert failed_audit.args[6] is False
    assert "secondary compute failed" in failed_audit.args[7]


@pytest.mark.asyncio
async def test_agents_create_list_and_heartbeat_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    """Covers agent provisioning, listing, internal heartbeat auth, and dispatch wiring."""
    db = FakeDB()
    tenant = SimpleNamespace(tenant_id="tenant_abc123")
    dataset_id = uuid.uuid4()

    agent = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        dataset_id=dataset_id,
        document_id=None,
        name="Ops Sentinel",
        description="Monitors operational metrics",
        role_description="You are an ops analyst.",
        temperature=0.0,
        is_active=True,
        cron_schedule=None,
        metric_column=None,
        time_column=None,
        sensitivity_threshold=2.0,
        last_run_at=None,
        created_at=datetime.now(timezone.utc),
    )
    db.agents = [agent]

    monkeypatch.setattr(agents_route.agent_service, "create_agent", AsyncMock(return_value=agent))

    payload = agents_route.AgentCreate(
        name="Ops Sentinel",
        description="Monitors operational metrics",
        role_description="You are an ops analyst.",
        dataset_id=dataset_id,
        temperature=0.0,
    )

    created = await agents_route.create_chat_agent(payload=payload, context=tenant, db=db)
    assert created.id == agent.id

    listed = await agents_route.list_agents(limit=50, offset=0, context=tenant, db=db)
    assert len(listed) == 1
    assert listed[0].id == agent.id
    _assert_system_invariants(db, tenant.tenant_id)

    monkeypatch.setattr(agents_route, "INTERNAL_SERVICE_KEY", "internal-test-key")
    agents_route.verify_internal_heartbeat(x_internal_service_key="internal-test-key", credentials=None)

    with pytest.raises(HTTPException) as exc_info:
        agents_route.verify_internal_heartbeat(x_internal_service_key="wrong-key", credentials=None)
    assert exc_info.value.status_code == 401

    monkeypatch.setattr(
        agents_route.agent_service,
        "check_and_dispatch_agents",
        AsyncMock(return_value={"status": "success", "dispatched": 2}),
    )
    heartbeat_result = await agents_route.trigger_agent_heartbeat(background_tasks=BackgroundTasks(), db=db)
    assert heartbeat_result["status"] == "success"
    assert heartbeat_result["dispatched"] == 2


@pytest.mark.asyncio
async def test_billing_checkout_and_webhook_security_wiring(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verifies checkout orchestration plus Lemon Squeezy/internal webhook auth boundaries."""
    db = MagicMock()

    async def _fake_generate_checkout_url(self, tenant_id: str, variant_id: str, redirect_url: str) -> str:
        assert tenant_id == "tenant_abc123"
        assert variant_id == "variant_001"
        assert redirect_url.startswith("https://")
        return "https://checkout.example/session_abc"

    monkeypatch.setattr(
        billing_route.LemonSqueezyService,
        "generate_checkout_url",
        _fake_generate_checkout_url,
    )

    checkout_request = billing_route.CheckoutRequest(
        variant_id="variant_001",
        redirect_url="https://app.arcli.tech/return",
    )
    checkout_response = await billing_route.create_checkout_session(
        request=checkout_request,
        db=db,
        current_user={"sub": "user_1", "organization_id": "tenant_abc123"},
    )
    assert checkout_response["checkout_url"] == "https://checkout.example/session_abc"

    monkeypatch.setattr(webhooks_route, "LEMON_SQUEEZY_WEBHOOK_SECRET", "whsec_test")

    webhook_payload = {
        "meta": {
            "event_name": "subscription_created",
            "custom_data": {"tenant_id": "tenant_abc123"},
        },
        "data": {"attributes": {"status": "active"}},
    }
    raw_payload = json.dumps(webhook_payload).encode("utf-8")
    valid_signature = hmac.new(
        key=b"whsec_test",
        msg=raw_payload,
        digestmod=hashlib.sha256,
    ).hexdigest()

    billing_background = InspectableBackgroundTasks()
    webhook_response = await webhooks_route.handle_lemonsqueezy_webhook(
        request=_FakeWebhookRequest(webhook_payload),
        background_tasks=billing_background,
        x_signature=valid_signature,
        db=db,
    )
    assert webhook_response["status"] == "accepted"
    assert len(billing_background.recorded) == 1

    billing_task = billing_background.recorded[0]
    assert billing_task.func.__name__ == "process_webhook"
    assert billing_task.args[0] == "subscription_created"
    assert billing_task.args[1] == webhook_payload

    with pytest.raises(HTTPException) as signature_exc:
        await webhooks_route.handle_lemonsqueezy_webhook(
            request=_FakeWebhookRequest(webhook_payload),
            background_tasks=BackgroundTasks(),
            x_signature="invalid-signature",
            db=db,
        )
    assert signature_exc.value.status_code == 401

    monkeypatch.setattr(webhooks_route, "INTERNAL_ROUTING_SECRET", "cluster-secret")
    invalidate_mock = AsyncMock(return_value=1)
    monkeypatch.setattr(
        webhooks_route.cache_manager,
        "invalidate_dataset_cache",
        invalidate_mock,
    )

    with pytest.raises(HTTPException) as sync_exc:
        await webhooks_route.handle_data_sync_webhook(
            payload=webhooks_route.DataSyncPayload(
                tenant_id="tenant_abc123",
                dataset_id="dataset_1",
                sync_status="success",
            ),
            background_tasks=BackgroundTasks(),
            x_internal_secret="wrong-secret",
        )
    assert sync_exc.value.status_code == 403

    sync_background = InspectableBackgroundTasks()
    sync_response = await webhooks_route.handle_data_sync_webhook(
        payload=webhooks_route.DataSyncPayload(
            tenant_id="tenant_abc123",
            dataset_id="dataset_1",
            sync_status="success",
        ),
        background_tasks=sync_background,
        x_internal_secret="cluster-secret",
    )
    assert sync_response["status"] == "accepted"
    assert len(sync_background.recorded) == 1

    sync_task = sync_background.recorded[0]
    assert sync_task.func is invalidate_mock
    assert sync_task.kwargs["tenant_id"] == "tenant_abc123"
    assert sync_task.kwargs["dataset_id"] == "dataset_1"


@pytest.mark.asyncio
async def test_data_sync_webhook_ignores_non_success_status_without_scheduling_work(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(webhooks_route, "INTERNAL_ROUTING_SECRET", "cluster-secret")

    background_tasks = InspectableBackgroundTasks()
    response = await webhooks_route.handle_data_sync_webhook(
        payload=webhooks_route.DataSyncPayload(
            tenant_id="tenant_abc123",
            dataset_id="dataset_1",
            sync_status="failed",
        ),
        background_tasks=background_tasks,
        x_internal_secret="cluster-secret",
    )

    assert response["status"] == "ignored"
    assert background_tasks.recorded == []


@pytest.mark.asyncio
@pytest.mark.xfail(reason="Replay-id deduplication is not implemented on Lemon Squeezy webhook route yet.")
async def test_lemonsqueezy_webhook_rejects_duplicate_event_replay(monkeypatch: pytest.MonkeyPatch) -> None:
    db = MagicMock()
    monkeypatch.setattr(webhooks_route, "LEMON_SQUEEZY_WEBHOOK_SECRET", "whsec_test")

    payload = {
        "meta": {
            "event_name": "subscription_updated",
            "custom_data": {"tenant_id": "tenant_abc123"},
            "event_id": "evt_001",
        },
        "data": {"attributes": {"status": "active"}},
    }
    raw_payload = json.dumps(payload).encode("utf-8")
    signature = hmac.new(
        key=b"whsec_test",
        msg=raw_payload,
        digestmod=hashlib.sha256,
    ).hexdigest()

    first_response = await webhooks_route.handle_lemonsqueezy_webhook(
        request=_FakeWebhookRequest(payload),
        background_tasks=BackgroundTasks(),
        x_signature=signature,
        db=db,
    )
    assert first_response["status"] == "accepted"

    with pytest.raises(HTTPException) as replay_exc:
        await webhooks_route.handle_lemonsqueezy_webhook(
            request=_FakeWebhookRequest(payload),
            background_tasks=BackgroundTasks(),
            x_signature=signature,
            db=db,
        )

    assert replay_exc.value.status_code == 409
