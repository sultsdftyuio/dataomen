import os
import sys

# ------------------------------------------------------------------------------
# Absolute Path Resolution for Celery Prefork Workers
# ------------------------------------------------------------------------------
# Fixes: "Could not reset DB pool on fork: No module named 'api'"
# Forces the root directory into the Python path regardless of how the container is launched.
_ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)

import asyncio
import logging
import gc
import time
import psutil
from typing import Dict, Any, Optional

# ------------------------------------------------------------------------------
# C-Level Thread Guardrails — MUST be set before any native library is imported.
# Polars and DuckDB default to consuming ALL available CPU cores. When Celery
# forks multiple worker processes, this causes CPU thrashing and OOM. We clamp
# them to a safe ceiling here, at the OS level, before the engines initialise.
# ------------------------------------------------------------------------------
_CPU_THREAD_LIMIT = str(min(4, os.cpu_count() or 2))
os.environ.setdefault("POLARS_MAX_THREADS", _CPU_THREAD_LIMIT)
os.environ.setdefault("DUCKDB_NUM_THREADS", _CPU_THREAD_LIMIT)
os.environ.setdefault("OMP_NUM_THREADS", _CPU_THREAD_LIMIT)
os.environ.setdefault("OPENBLAS_NUM_THREADS", _CPU_THREAD_LIMIT)

from celery import Celery
from celery.schedules import crontab
from celery.exceptions import SoftTimeLimitExceeded
from celery.signals import worker_process_init

# ------------------------------------------------------------------------------
# Worker Configuration & Observability
# ------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [ComputeWorker] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ComputeWorker")

# Deployment Context: Upstash Redis (Serverless) → DigitalOcean Managed → Local fallback
redis_url = (
    os.getenv("KV_URL")
    or os.getenv("UPSTASH_REDIS_REST_URL")
    or os.getenv("REDIS_URL")
    or "redis://localhost:6379/0"
)

celery_app = Celery("compute_worker", broker=redis_url, backend=redis_url)

celery_app.conf.update(
    # ── Serialisation ────────────────────────────────────────────────────────
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # ── Timeouts ─────────────────────────────────────────────────────────────
    task_time_limit=600,        # 10 m hard kill for runaway tasks
    task_soft_time_limit=570,   # 9.5 m graceful signal before hard kill

    # ── Queue Routing (Priority Lanes) ───────────────────────────────────────
    # Heavy ingestion jobs never block sub-second analytics queries.
    task_routes={
        "process_ingestion_dataset":         {"queue": "ingestion"},
        "execute_heavy_analytical_pipeline": {"queue": "analytics"},
        "run_autonomous_insight_scans":      {"queue": "cron"},
    },
    task_default_queue="analytics",

    # ── Worker Hygiene ───────────────────────────────────────────────────────
    worker_prefetch_multiplier=1,         # Fair distribution: no node hogs heavy jobs
    task_acks_late=True,                  # Ack only after successful execution
    worker_max_tasks_per_child=50,        # Recycle child after 50 tasks (leak prevention)
    worker_max_memory_per_child=400_000,  # Hard kill child if it exceeds 400 MB RSS
)

# ------------------------------------------------------------------------------
# Autonomous Mode Cron Scheduler (Celery Beat)
# ------------------------------------------------------------------------------
celery_app.conf.beat_schedule = {
    "autonomous-analyst-hourly": {
        "task": "run_autonomous_insight_scans",
        "schedule": crontab(minute="0"),
        "options": {"queue": "cron"},
    },
}

# ------------------------------------------------------------------------------
# Database Prefork Safety
# Celery forks child processes from the parent. Any SQLAlchemy connection pool
# inherited across the fork boundary becomes corrupted. We dispose of the engine 
# on each child's first breath so every process builds its own clean pool.
# ------------------------------------------------------------------------------
@worker_process_init.connect
def reset_db_connection_pool(**kwargs: Any) -> None:
    """Dispose inherited SQLAlchemy engine connections on worker fork."""
    try:
        from api.database import engine
        engine.dispose()
        logger.info("🔌 DB connection pool reset after fork.")
    except Exception as exc:
        logger.warning(f"Could not reset DB pool on fork: {exc}")


# ------------------------------------------------------------------------------
# Async Bridge & Resource Guardrails
# ------------------------------------------------------------------------------

def _run_async(coro: Any) -> Any:
    """
    Hybrid Performance Bridge: executes async IO-bound services inside
    synchronous Celery worker threads without a persistent event loop.
    """
    return asyncio.run(coro)


def _check_memory_pressure(task: Any, threshold: float = 85.0) -> None:
    """
    Proactive OOM Prevention: if RAM utilisation exceeds the threshold,
    yield the task back to the queue so a less-pressured node can handle it.
    """
    mem = psutil.virtual_memory()
    if mem.percent > threshold:
        logger.warning(
            f"🚨 High RAM pressure ({mem.percent:.1f}%). "
            "Re-queuing task to prevent OOM crash."
        )
        raise task.retry(countdown=30)


# ------------------------------------------------------------------------------
# Lazy-Loaded Service Accessors & AI Dependency Injection
#
# Heavy analytical services are imported and instantiated on first call,
# caching them in _singletons for the lifetime of that child process only.
# This strictly adheres to the Orchestration methodology by injecting the 
# llm_client instance post-fork to prevent async event loop corruption.
# ------------------------------------------------------------------------------
_singletons: Dict[str, Any] = {}

def _get_service(key: str, factory: Any) -> Any:
    """Generic lazy singleton: import & instantiate once per child process."""
    if key not in _singletons:
        _singletons[key] = factory()
    return _singletons[key]


def _planner() -> Any:
    def _build() -> Any:
        from api.services.query_planner import QueryPlanner
        from api.services.llm_client import llm_client
        return QueryPlanner(llm_client=llm_client)
    return _get_service("planner", _build)


def _generator() -> Any:
    def _build() -> Any:
        from api.services.nl2sql_generator import NL2SQLGenerator
        from api.services.llm_client import llm_client
        return NL2SQLGenerator(llm_client=llm_client)
    return _get_service("generator", _build)


def _insight_engine() -> Any:
    def _build() -> Any:
        from api.services.insight_orchestrator import InsightOrchestrator
        from api.services.llm_client import llm_client
        return InsightOrchestrator(llm_client=llm_client)
    return _get_service("insight_engine", _build)


# ------------------------------------------------------------------------------
# Task 1: Zero-ETL Ingestion & Vectorisation
# Queue: ingestion  (isolated so 10-minute jobs never block analytics queries)
# ------------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    name="process_ingestion_dataset",
    max_retries=3,
    queue="ingestion",
)
def process_ingestion_dataset(self: Any, dataset_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
    """
    Two ingestion paths:
      A) Local file upload  → DuckDB Parquet vectorisation & schema profiling.
      B) SaaS / Warehouse   → Zero-ETL historical multi-stream pull via SyncEngine.
    """
    _check_memory_pressure(self)
    logger.info(f"[{tenant_id}] ⚡ Starting ingestion for Dataset: {dataset_id}")
    start_time = time.perf_counter()

    from api.database import SessionLocal
    from models import Dataset, DatasetStatus
    from api.services.storage_manager import storage_manager
    from api.services.sync_engine import get_sync_engine
    from api.services.credential_manager import CredentialManager
    from api.services.cache_manager import cache_manager

    with SessionLocal() as db:
        try:
            dataset = db.query(Dataset).filter(
                Dataset.id == dataset_id,
                Dataset.tenant_id == tenant_id,
            ).first()

            if not dataset:
                logger.error(f"[{tenant_id}] Dataset {dataset_id} not found. Aborting.")
                return None

            dataset.status = DatasetStatus.PROCESSING
            db.commit()

            # ── Path A: Local File → Parquet Vectorisation ───────────────────
            if not dataset.integration_name:
                self.update_state(
                    state="PROGRESS",
                    meta={"status": "Vectorising file to Parquet..."},
                )
                profile = storage_manager.convert_to_parquet_and_profile(
                    db, tenant_id, dataset.file_path
                )
                dataset.file_path = profile["parquet_path"]
                dataset.schema_metadata = {
                    **(dataset.schema_metadata or {}),
                    "columns": profile.get("columns", []),
                    "row_count": profile.get("row_count", 0),
                    "vectorized_at": time.time(),
                }

            # ── Path B: Zero-ETL Warehouse / SaaS Historical Pull ────────────
            else:
                self.update_state(
                    state="PROGRESS",
                    meta={"status": f"Pulling historical data from {dataset.integration_name}..."},
                )
                creds = CredentialManager(db).get_integration_credentials(
                    tenant_id, dataset.integration_name
                )
                if not creds:
                    raise PermissionError(
                        f"Secure Vault access denied for {dataset.integration_name}"
                    )

                sync_engine = get_sync_engine(db)
                _run_async(sync_engine.run_historical_sync(
                    tenant_id=tenant_id,
                    integration_name=dataset.integration_name,
                    dataset_id=dataset_id,
                    stream_name=dataset.stream_name or "default",
                    start_timestamp=dataset.schema_metadata.get(
                        "start_timestamp", "2024-01-01T00:00:00Z"
                    ),
                ))

            # ── Mark Success & Bust Cache ────────────────────────────────────
            dataset.status = DatasetStatus.READY
            db.commit()
            _run_async(cache_manager.invalidate_dataset_cache(tenant_id, dataset_id))

            duration = round(time.perf_counter() - start_time, 2)
            logger.info(f"✅ [{tenant_id}] Ingestion complete: {dataset_id} in {duration}s")
            return {"status": "success", "dataset_id": dataset_id, "duration_seconds": duration}

        except SoftTimeLimitExceeded:
            logger.error(f"❌ [{tenant_id}] Task timeout: {dataset_id}")
            dataset.status = DatasetStatus.FAILED
            dataset.schema_metadata = {
                **(dataset.schema_metadata or {}),
                "error": "Operation timed out.",
            }
            db.commit()

        except Exception as e:
            logger.error(f"❌ [{tenant_id}] Ingestion failed: {dataset_id} | {e}")
            db.rollback()
            dataset.status = DatasetStatus.FAILED
            dataset.schema_metadata = {
                **(dataset.schema_metadata or {}),
                "error": str(e),
            }
            db.commit()
            raise self.retry(exc=e, countdown=60)

        finally:
            gc.collect()


# ------------------------------------------------------------------------------
# Task 2: Heavy BI Analytical Pipeline
# Queue: analytics  (isolated from long-running ingestion jobs)
# ------------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    name="execute_heavy_analytical_pipeline",
    max_retries=1,
    queue="analytics",
)
def execute_heavy_analytical_pipeline(
    self: Any,
    job_id: str,
    prompt: str,
    tenant_id: str,
    dataset_dict: Dict[str, Any],
    full_schema: Dict[str, Any],
) -> Dict[str, Any]:
    """
    End-to-end BI analytics pipeline for queries requiring warehouse aggregations.
    """
    _check_memory_pressure(self)
    logger.info(f"[{tenant_id}] 🧠 Orchestrating Heavy BI Pipeline: {job_id}")

    from api.services.compute_engine import compute_engine, DatasetMetadata
    from api.services.narrative_service import narrative_service
    from api.services.cache_manager import cache_manager
    from api.services.llm_client import llm_client

    df = None

    try:
        dataset = DatasetMetadata(**dataset_dict)

        # 1. AI Planning ──────────────────────────────────────────────────────
        self.update_state(
            state="PROGRESS",
            meta={"status": "AI Lead Engineer architecting query plan..."},
        )
        plan = _run_async(_planner().generate_plan(prompt, full_schema, tenant_id))

        if not plan.is_achievable:
            return {"status": "error", "message": plan.missing_data_reason}

        # 2. SQL Compilation ──────────────────────────────────────────────────
        self.update_state(
            state="PROGRESS",
            meta={"status": "Compiling optimised SQL..."},
        )
        sql_query, chart_spec = _run_async(_generator().generate_sql(
            plan=plan,
            full_schema=full_schema,
            target_engine=dataset.location.value,
            tenant_id=tenant_id,
            prompt=prompt,
        ))

        # =====================================================================
        # NEW: 2.5 SEMANTIC LAYER INJECTION
        # Intercept the AI's raw SQL and inject any pre-approved business metrics
        # =====================================================================
        self.update_state(
            state="PROGRESS",
            meta={"status": "Applying strict semantic governance..."},
        )
        from api.database import SessionLocal
        from api.services.metric_governance import metric_governance_service
        
        with SessionLocal() as db:
            sql_query = metric_governance_service.inject_governed_metrics(
                db=db,
                tenant_id=tenant_id,
                dataset_id=dataset.dataset_id,
                raw_execution_sql=sql_query
            )
        # =====================================================================

        # 3. Vectorised Compute Execution ─────────────────────────────────────
        self.update_state(
            state="PROGRESS",
            meta={"status": "Executing warehouse scan..."},
        )
        query_result = _run_async(compute_engine.execute_read_only(
            db=None,
            tenant_id=tenant_id,
            datasets=[],
            query=sql_query,
        ))

        # 4. Statistical Insight Extraction ───────────────────────────────────
        self.update_state(
            state="PROGRESS",
            meta={"status": "Running mathematical insight gauntlet..."},
        )
        import polars as pl
        df = pl.DataFrame(query_result)
        insights = _insight_engine().analyze_dataframe(df, plan, tenant_id)

        del df
        df = None
        gc.collect()

        # 5. Executive Narrative Synthesis ────────────────────────────────────
        self.update_state(
            state="PROGRESS",
            meta={"status": "Synthesising executive summary..."},
        )
        # Injecting LLM dependency dynamically for the narrative orchestrator 
        narrative_obj = _run_async(narrative_service.generate_executive_summary(
            payload=insights,
            plan=plan,
            chart_spec=chart_spec,
            tenant_id=tenant_id,
            llm_client=llm_client  # Dependency Injection
        ))

        # 6. Cache Commit — unblocks frontend polling ──────────────────────────
        _run_async(cache_manager.set_cached_insight(
            tenant_id=tenant_id,
            dataset_id=dataset.dataset_id,
            prompt=prompt,
            sql_query=sql_query,
            chart_spec=chart_spec,
            insight_payload=insights,
            narrative=narrative_obj.model_dump(),
        ))

        logger.info(f"✅ [{tenant_id}] BI Pipeline complete: {job_id}")
        return {
            "status": "success",
            "type": "chart" if chart_spec else "table",
            "data": query_result,
            "sql_used": sql_query,
            "chart_spec": chart_spec,
            "row_count": len(query_result),
            "insights": insights.model_dump(),
            "narrative": narrative_obj.model_dump(),
        }

    except Exception as e:
        logger.error(f"💥 [{tenant_id}] BI Pipeline crash: {job_id} | {e}")
        return {"status": "error", "message": str(e)}

    finally:
        if df is not None:
            del df
        gc.collect()


# ------------------------------------------------------------------------------
# Task 3: Autonomous Watchdog (Scheduled AI Data Analyst)
# Queue: cron  (never competes with user-facing workloads)
# ------------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    name="run_autonomous_insight_scans",
    queue="cron",
)
def run_autonomous_insight_scans(self: Any) -> Dict[str, Any]:
    """
    Celery Beat Cron Job — fires at the top of every hour.
    """
    logger.info("🤖 Starting Global Autonomous Insight Scan...")

    from api.database import SessionLocal
    from models import Agent
    from api.services.watchdog_service import WatchdogService
    from api.services.llm_client import llm_client

    with SessionLocal() as db:
        # Dependency Injection for watchdog
        watchdog = WatchdogService(db_client=db, llm_client=llm_client)

        # 1. System Health & Staleness Audit ──────────────────────────────────
        logger.info("Running pipeline health and dataset staleness audits...")
        _run_async(watchdog.detect_stale_datasets())

        # 2. Per-Agent Anomaly Detection ──────────────────────────────────────
        active_agents = db.query(Agent).filter(Agent.is_active == True).all()

        if not active_agents:
            logger.info("No active autonomous agents found. Skipping scan.")
            return {"status": "success", "agents_scanned": 0, "insights_found": 0}

        insights_found = 0

        for agent in active_agents:
            if not agent.metric_column or not agent.time_column:
                continue

            try:
                logger.info(
                    f"Triggering Watchdog for Agent: {agent.id} "
                    f"(Tenant: {agent.tenant_id})"
                )
                insight = _run_async(watchdog.execute_autonomous_agent(
                    agent_id=str(agent.id),
                    tenant_id=agent.tenant_id,
                    dataset_id=str(agent.dataset_id),
                    metric_col=agent.metric_column,
                    time_col=agent.time_column,
                    sensitivity_threshold=agent.sensitivity_threshold,
                ))

                if insight:
                    insights_found += 1
                    logger.info(
                        f"💡 High-impact insight for {agent.tenant_id}! "
                        f"Impact Score: {insight.impact_score}"
                    )

            except Exception as e:
                logger.error(
                    f"Agent {agent.id} (Tenant: {agent.tenant_id}) failed: {e}"
                )
                continue

    logger.info(
        f"✅ Global Scan complete. "
        f"Agents scanned: {len(active_agents)}, "
        f"Insights generated: {insights_found}."
    )
    gc.collect()
    return {
        "status": "success",
        "agents_scanned": len(active_agents),
        "insights_found": insights_found,
    }


# ------------------------------------------------------------------------------
# Execution Block for DigitalOcean App Platform / Docker Container
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    """
    Ensure all queues are actively listened to.
    -Q specifies the queues.
    -B runs the beat scheduler (cron) in the same process to save infrastructure costs.
    """
    logger.info("Initializing Containerized Compute Worker Daemon across all priority queues...")
    celery_app.worker_main(
        argv=[
            "worker",
            "--loglevel=info",
            "-Q", "analytics,ingestion,cron",
            "-B",
        ]
    )