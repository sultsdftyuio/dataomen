import ast
import inspect
import sys
import types
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple


@dataclass(frozen=True)
class MethodContract:
    relative_path: str
    class_name: str
    method_name: str


@dataclass(frozen=True)
class ServiceContract:
    version: str
    methods: Tuple[MethodContract, ...]


@dataclass
class StubRegistry:
    services: Dict[str, object] = field(default_factory=dict)
    contracts: Dict[str, ServiceContract] = field(default_factory=dict)

    def register_service(
        self,
        name: str,
        implementation: object,
        contract: Optional[ServiceContract] = None,
    ) -> None:
        self.services[name] = implementation
        if contract is not None:
            self.contracts[name] = contract

    def validate_contracts(self, project_root: Optional[Path] = None) -> List[str]:
        root = project_root or Path(__file__).resolve().parents[1]
        mismatches: List[str] = []

        for service_name, contract in self.contracts.items():
            implementation = self.services.get(service_name)
            if implementation is None:
                mismatches.append(f"[{service_name}] Missing service implementation for contract v{contract.version}")
                continue

            for method_contract in contract.methods:
                stub_callable = getattr(implementation, method_contract.method_name, None)
                if stub_callable is None:
                    mismatches.append(
                        f"[{service_name}] Missing method '{method_contract.method_name}' for contract v{contract.version}"
                    )
                    continue

                real_path = root / method_contract.relative_path
                if not real_path.exists():
                    mismatches.append(
                        f"[{service_name}] Missing real source '{method_contract.relative_path}' for contract v{contract.version}"
                    )
                    continue

                real_signature, real_is_async = _read_method_signature(
                    file_path=real_path,
                    class_name=method_contract.class_name,
                    method_name=method_contract.method_name,
                )
                if real_signature is None:
                    mismatches.append(
                        f"[{service_name}] Could not locate {method_contract.class_name}.{method_contract.method_name} "
                        f"in {method_contract.relative_path}"
                    )
                    continue

                stub_signature = _signature_to_params(inspect.signature(stub_callable))
                stub_is_async = inspect.iscoroutinefunction(stub_callable)

                if stub_signature != real_signature:
                    mismatches.append(
                        f"[{service_name}] Signature drift in {method_contract.method_name} "
                        f"(contract v{contract.version}): stub={stub_signature}, real={real_signature}"
                    )

                if stub_is_async != real_is_async:
                    mismatches.append(
                        f"[{service_name}] Async drift in {method_contract.method_name} "
                        f"(contract v{contract.version}): stub_async={stub_is_async}, real_async={real_is_async}"
                    )

        return mismatches


class _ModelExprStub:
    def __eq__(self, _other: object) -> bool:
        return True

    def in_(self, _values: object) -> bool:
        return True

    def is_(self, _value: object) -> bool:
        return True

    def isnot(self, _value: object) -> bool:
        return True

    def desc(self) -> "_ModelExprStub":
        return self

    def asc(self) -> "_ModelExprStub":
        return self


@dataclass
class _TenantContextStub:
    tenant_id: str
    user_id: str = "test-user"
    email: str = "test@arcli.tech"
    role: str = "authenticated"
    app_metadata: Optional[dict] = None


class _CacheManagerStub:
    def __init__(self) -> None:
        self._store: Dict[tuple[str, str, str], Dict[str, Any]] = {}

    async def get_cached_insight(self, tenant_id: str, dataset_id: str, prompt: str) -> Optional[Dict[str, Any]]:
        return self._store.get((tenant_id, dataset_id, prompt))

    async def set_cached_insight(
        self,
        tenant_id: str,
        dataset_id: str,
        prompt: str,
        sql_query: str,
        chart_spec: Optional[Dict[str, Any]],
        insight_payload: Any,
        narrative: Dict[str, Any],
    ) -> None:
        payload = insight_payload.model_dump() if hasattr(insight_payload, "model_dump") else dict(getattr(insight_payload, "__dict__", {}))
        self._store[(tenant_id, dataset_id, prompt)] = {
            "sql_query": sql_query,
            "chart_spec": chart_spec,
            "insight_payload": payload,
            "narrative": narrative,
            "is_cached": True,
        }

    async def invalidate_dataset_cache(self, tenant_id: str, dataset_id: str) -> int:
        keys = [k for k in self._store if k[0] == tenant_id and k[1] == dataset_id]
        for key in keys:
            self._store.pop(key, None)
        return len(keys)


class _LLMClientStub:
    async def generate_structured(self, *_args: Any, **_kwargs: Any) -> SimpleNamespace:
        return SimpleNamespace()

    async def embed(self, *_args: Any, **_kwargs: Any) -> List[float]:
        return [0.0]

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [[0.0] for _ in texts]

    async def stream_text(self, *_args: Any, **_kwargs: Any):
        if False:
            yield ""


class _QueryPlanStub:
    def __init__(self, **kwargs: Any):
        self.__dict__.update(kwargs)
        self.intent = kwargs.get("intent") or kwargs.get("intent_summary", "")


class _InsightPayloadStub:
    def __init__(self, **kwargs: Any):
        self.__dict__.update(kwargs)

    def model_dump(self) -> Dict[str, Any]:
        return dict(self.__dict__)


class _InsightOrchestratorStub:
    async def analyze_and_synthesize(self, df: Any, plan: Any, tenant_id: str) -> _InsightPayloadStub:
        _ = (df, plan, tenant_id)
        return _InsightPayloadStub(row_count=1, intent_analyzed="stub")

    def analyze_dataframe(self, *_args: Any, **_kwargs: Any) -> _InsightPayloadStub:
        return _InsightPayloadStub(row_count=1, intent_analyzed="stub")


class _NarrativeResponseStub:
    def model_dump(self) -> Dict[str, Any]:
        return {
            "executive_summary": "stub summary",
            "key_insights": ["stub insight"],
            "recommended_action": "stub action",
            "snapshot_hash": "snap_stub",
        }


class _NarrativeServiceStub:
    async def generate_executive_summary(
        self,
        payload: Any,
        plan: Any,
        chart_spec: Optional[Dict[str, Any]],
        tenant_id: str,
    ) -> _NarrativeResponseStub:
        _ = (payload, plan, chart_spec, tenant_id)
        return _NarrativeResponseStub()


class _NL2SQLGeneratorStub:
    async def generate_sql(
        self,
        plan: Any,
        execution_context: str,
        target_engine: str,
        tenant_id: str,
        agent: Optional[Any] = None,
        semantic_views: Optional[Dict[str, str]] = None,
        history: Optional[List[Dict[str, Any]]] = None,
        fk_map: Optional[Dict[str, str]] = None,
        strict_joins: bool = False,
        schema_context: Optional[Dict[str, Any]] = None,
    ) -> tuple[str, Optional[Dict[str, Any]], Any]:
        _ = (plan, execution_context, target_engine, tenant_id, agent, semantic_views, history, fk_map, strict_joins, schema_context)
        return "SELECT 1", None, SimpleNamespace(query_id="trace_stub", cache_hit=False)

    async def correct_sql(
        self,
        failed_query: str,
        error_msg: str,
        plan: Any,
        execution_context: str,
        target_engine: str,
        tenant_id: str,
        agent: Optional[Any] = None,
        semantic_views: Optional[Dict[str, str]] = None,
        fk_map: Optional[Dict[str, str]] = None,
        strict_joins: bool = False,
    ) -> tuple[str, Optional[Dict[str, Any]], Any]:
        _ = (failed_query, error_msg, plan, execution_context, target_engine, tenant_id, agent, semantic_views, fk_map, strict_joins)
        return "SELECT 1", None, SimpleNamespace(query_id="trace_stub_correction", cache_hit=False)


class _ComputeRouterStub:
    @staticmethod
    def requires_background_worker(_sql: str) -> bool:
        return False


class _ComputeEngineStub:
    async def execute_read_only(
        self,
        db: Any,
        tenant_id: str,
        datasets: List[Any],
        query: str,
        injected_views: Optional[List[str]] = None,
        bypass_cache: bool = False,
    ) -> List[Dict[str, Any]]:
        _ = (db, tenant_id, datasets, query, injected_views, bypass_cache)
        return []

    async def execute_ml_pipeline(
        self,
        db: Any,
        tenant_id: str,
        dataset: Any,
        metric_col: str,
        time_col: str,
    ) -> Dict[str, Any]:
        _ = (db, tenant_id, dataset, metric_col, time_col)
        return {"status": "skipped"}


class _MetricGovernanceStub:
    def inject_governed_metrics(self, _db: Any, _tenant_id: str, _dataset_id: str, sql_query: str) -> str:
        return sql_query


class _ABTesterStub:
    def analyze_experiment(self, *_args: Any, **_kwargs: Any) -> Dict[str, Any]:
        return {"status": "ok"}


class _StorageManagerStub:
    async def upload_raw_file_async(self, *_args: Any, **_kwargs: Any) -> str:
        return "s3://stub-bucket/tenants/tenant_id=tenant_abc123/raw/file.csv"

    def delete_file(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class _TaskStub:
    def delay(self, *_args: Any, **_kwargs: Any) -> SimpleNamespace:
        return SimpleNamespace(id="job-stub")


def install_default_import_stubs(
    *,
    ensure_models: bool = False,
    force_models_stub: bool = False,
    module_table: Optional[Dict[str, object]] = None,
) -> StubRegistry:
    modules = module_table if module_table is not None else sys.modules
    registry = StubRegistry()

    models_module = modules.get("models")
    if force_models_stub:
        models_module = types.ModuleType("models")
        modules["models"] = models_module
    elif models_module is None and ensure_models:
        models_module = types.ModuleType("models")
        modules["models"] = models_module

    if models_module is not None:
        def _create_model_class(name: str):
            def _model_init(self, **kwargs: Any) -> None:
                for key, value in kwargs.items():
                    setattr(self, key, value)
                self.id = kwargs.get("id")
                self.created_at = kwargs.get("created_at")

            attrs = {
                "__init__": _model_init,
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

    auth_module = modules.get("api.auth")
    if auth_module is None:
        auth_module = types.ModuleType("api.auth")
        modules["api.auth"] = auth_module

    def _verify_tenant_stub() -> None:
        raise RuntimeError("verify_tenant should be dependency-overridden in tests")

    def _get_current_user_stub() -> Dict[str, str]:
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

    if "api.database" not in modules:
        database_module = types.ModuleType("api.database")

        def _get_db_stub() -> None:
            raise RuntimeError("get_db should be dependency-overridden in tests")

        database_module.get_db = _get_db_stub
        modules["api.database"] = database_module

    if "supabase" not in modules:
        supabase_module = types.ModuleType("supabase")

        class _SupabaseClientStub:
            pass

        supabase_module.Client = _SupabaseClientStub
        supabase_module.create_client = lambda *_args, **_kwargs: _SupabaseClientStub()
        modules["supabase"] = supabase_module

    if "qdrant_client.models" not in modules:
        qdrant_module = modules.setdefault("qdrant_client", types.ModuleType("qdrant_client"))
        qdrant_models_module = types.ModuleType("qdrant_client.models")

        class _QdrantModelStub:
            def __init__(self, *_args: Any, **_kwargs: Any):
                pass

        qdrant_models_module.Filter = _QdrantModelStub
        qdrant_models_module.FieldCondition = _QdrantModelStub
        qdrant_models_module.MatchValue = _QdrantModelStub

        setattr(qdrant_module, "models", qdrant_models_module)
        modules["qdrant_client.models"] = qdrant_models_module

    if "api.services.vector_service" not in modules:
        vector_service_module = types.ModuleType("api.services.vector_service")

        class _VectorServiceStub:
            client = None

        vector_service_module.vector_service = _VectorServiceStub()
        modules["api.services.vector_service"] = vector_service_module

    storage_module = modules.get("api.services.storage_manager")
    if storage_module is None:
        storage_module = types.ModuleType("api.services.storage_manager")
        storage_module.storage_manager = _StorageManagerStub()
        modules["api.services.storage_manager"] = storage_module

    cache_module = modules.get("api.services.cache_manager")
    if cache_module is None:
        cache_module = types.ModuleType("api.services.cache_manager")
        cache_stub = _CacheManagerStub()
        cache_module.CacheManager = _CacheManagerStub
        cache_module.cache_manager = cache_stub
        modules["api.services.cache_manager"] = cache_module
    else:
        cache_stub = getattr(cache_module, "cache_manager", None)
        if cache_stub is None:
            cache_stub = _CacheManagerStub()
            cache_module.cache_manager = cache_stub

    registry.register_service(
        "cache_manager",
        cache_module.cache_manager,
        ServiceContract(
            version="2026.04",
            methods=(
                MethodContract("api/services/cache_manager.py", "CacheManager", "get_cached_insight"),
                MethodContract("api/services/cache_manager.py", "CacheManager", "set_cached_insight"),
                MethodContract("api/services/cache_manager.py", "CacheManager", "invalidate_dataset_cache"),
            ),
        ),
    )

    if "api.services.llm_client" not in modules:
        llm_module = types.ModuleType("api.services.llm_client")
        llm_module.LLMClient = _LLMClientStub
        llm_module.llm_client = _LLMClientStub()
        modules["api.services.llm_client"] = llm_module

    if "api.services.query_planner" not in modules:
        planner_module = types.ModuleType("api.services.query_planner")
        planner_module.QueryPlan = _QueryPlanStub
        modules["api.services.query_planner"] = planner_module

    if "api.services.insight_orchestrator" not in modules:
        insight_module = types.ModuleType("api.services.insight_orchestrator")
        insight_module.InsightPayload = _InsightPayloadStub
        insight_module.InsightOrchestrator = _InsightOrchestratorStub
        modules["api.services.insight_orchestrator"] = insight_module

    registry.register_service(
        "insight_orchestrator",
        modules["api.services.insight_orchestrator"].InsightOrchestrator,
        ServiceContract(
            version="2026.04",
            methods=(
                MethodContract("api/services/insight_orchestrator.py", "InsightOrchestrator", "analyze_and_synthesize"),
            ),
        ),
    )

    if "api.services.narrative_service" not in modules:
        narrative_module = types.ModuleType("api.services.narrative_service")
        narrative_module.NarrativeService = _NarrativeServiceStub
        narrative_module.narrative_service = _NarrativeServiceStub()
        modules["api.services.narrative_service"] = narrative_module

    registry.register_service(
        "narrative_service",
        modules["api.services.narrative_service"].NarrativeService,
        ServiceContract(
            version="2026.04",
            methods=(
                MethodContract("api/services/narrative_service.py", "NarrativeService", "generate_executive_summary"),
            ),
        ),
    )

    if "api.services.nl2sql_generator" not in modules:
        generator_module = types.ModuleType("api.services.nl2sql_generator")
        generator_module.NL2SQLGenerator = _NL2SQLGeneratorStub
        modules["api.services.nl2sql_generator"] = generator_module

    registry.register_service(
        "nl2sql_generator",
        modules["api.services.nl2sql_generator"].NL2SQLGenerator,
        ServiceContract(
            version="2026.04",
            methods=(
                MethodContract("api/services/nl2sql_generator.py", "NL2SQLGenerator", "generate_sql"),
                MethodContract("api/services/nl2sql_generator.py", "NL2SQLGenerator", "correct_sql"),
            ),
        ),
    )

    if "api.services.compute_engine" not in modules:
        compute_module = types.ModuleType("api.services.compute_engine")
        compute_module.ComputeEngine = _ComputeEngineStub
        compute_module.compute_engine = _ComputeEngineStub()
        compute_module.ComputeRouter = _ComputeRouterStub
        modules["api.services.compute_engine"] = compute_module

    registry.register_service(
        "compute_engine",
        modules["api.services.compute_engine"].ComputeEngine,
        ServiceContract(
            version="2026.04",
            methods=(
                MethodContract("api/services/compute_engine.py", "ComputeEngine", "execute_read_only"),
                MethodContract("api/services/compute_engine.py", "ComputeEngine", "execute_ml_pipeline"),
            ),
        ),
    )

    if "api.services.metric_governance" not in modules:
        governance_module = types.ModuleType("api.services.metric_governance")
        governance_module.metric_governance_service = _MetricGovernanceStub()
        modules["api.services.metric_governance"] = governance_module

    if "api.services.ab_testing" not in modules:
        ab_module = types.ModuleType("api.services.ab_testing")
        ab_module.ab_tester = _ABTesterStub()
        modules["api.services.ab_testing"] = ab_module

    if "utils.supabase.server" not in modules:
        utils_module = modules.setdefault("utils", types.ModuleType("utils"))
        supabase_pkg = modules.setdefault("utils.supabase", types.ModuleType("utils.supabase"))
        setattr(utils_module, "supabase", supabase_pkg)

        server_module = types.ModuleType("utils.supabase.server")

        class _FakeTable:
            def upsert(self, *_args: Any, **_kwargs: Any) -> "_FakeTable":
                return self

            def execute(self) -> Dict[str, str]:
                return {"status": "ok"}

        class _FakeSupabase:
            def table(self, _table_name: str) -> _FakeTable:
                return _FakeTable()

        server_module.create_client = lambda: _FakeSupabase()
        modules["utils.supabase.server"] = server_module

    if "api.services.sync_engine" not in modules:
        sync_module = types.ModuleType("api.services.sync_engine")
        sync_module.INTEGRATION_REGISTRY = {
            "shopify": object(),
            "stripe": object(),
        }
        modules["api.services.sync_engine"] = sync_module

    if "compute_worker" not in modules:
        worker_module = types.ModuleType("compute_worker")
        worker_module.process_ingestion_dataset = _TaskStub()
        modules["compute_worker"] = worker_module

    return registry


def assert_stub_contracts(registry: StubRegistry, project_root: Optional[Path] = None) -> None:
    mismatches = registry.validate_contracts(project_root=project_root)
    if mismatches:
        joined = "\n".join(mismatches)
        raise AssertionError(f"Stub contract drift detected:\n{joined}")


def _read_method_signature(file_path: Path, class_name: str, method_name: str) -> tuple[Optional[List[str]], bool]:
    tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for body_node in node.body:
                if isinstance(body_node, (ast.FunctionDef, ast.AsyncFunctionDef)) and body_node.name == method_name:
                    is_async = isinstance(body_node, ast.AsyncFunctionDef)
                    return _ast_args_to_params(body_node.args), is_async
    return None, False


def _ast_args_to_params(args: ast.arguments) -> List[str]:
    params: List[str] = []

    positionals = list(args.posonlyargs) + list(args.args)
    for arg in positionals:
        if arg.arg == "self":
            continue
        params.append(arg.arg)

    if args.vararg is not None:
        params.append(f"*{args.vararg.arg}")

    for kwarg in args.kwonlyargs:
        params.append(kwarg.arg)

    if args.kwarg is not None:
        params.append(f"**{args.kwarg.arg}")

    return params


def _signature_to_params(signature: inspect.Signature) -> List[str]:
    params: List[str] = []
    for parameter in signature.parameters.values():
        if parameter.name == "self":
            continue
        if parameter.kind is inspect.Parameter.VAR_POSITIONAL:
            params.append(f"*{parameter.name}")
        elif parameter.kind is inspect.Parameter.VAR_KEYWORD:
            params.append(f"**{parameter.name}")
        else:
            params.append(parameter.name)
    return params
