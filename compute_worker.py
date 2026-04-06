# compute_worker.py

import os
import sys
import asyncio
import logging
import gc
import time
import psutil
from typing import Dict, Any, Optional

# ------------------------------------------------------------------------------
# Absolute Path Resolution for Celery Prefork Workers
# ------------------------------------------------------------------------------
_ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)

# ------------------------------------------------------------------------------
# C-Level Thread Guardrails — MUST be set before any native library is imported.
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

# REPLACEMENT: Import DATABASE_URL from our primary infrastructure
from api.database import DATABASE_URL

# Engineering Excellence: Standardize and Transform Postgres URL for Celery
if not DATABASE_URL:
    logger.critical("DATABASE_URL is missing. Worker cannot initialize.")
    sys.exit(1)

# FIX: Robust URL transformation handling both 'postgres://' and 'postgresql://'
# Celery requires 'sqla+postgresql://' for the broker and 'db+postgresql://' for results
_base_url = DATABASE_URL
if _base_url.startswith("postgres://"):
    _base_url = _base_url.replace("postgres://", "postgresql://", 1)

db_broker_url = f"sqla+{_base_url}"
db_backend_url = f"db+{_base_url}"

celery_app = Celery("compute_worker", broker=db_broker_url, backend=db_backend_url)

celery_app.conf.update(
    # ── Serialisation ────────────────────────────────────────────────────────
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # ── Timeouts ─────────────────────────────────────────────────────────────
    task_time_limit=600,        
    task_soft_time_limit=570,   

    # ── Queue Routing (Priority Lanes) ───────────────────────────────────────
    task_routes={
        "process_ingestion_dataset":         {"queue": "ingestion"},
        "execute_heavy_analytical_pipeline": {"queue": "analytics"},
        "run_autonomous_insight_scans":      {"queue": "cron"},
    },
    task_default_queue="analytics",

    # ── Modular Strategy: Database Broker Optimizations ──────────────────────
    broker_transport_options={
        'polling_interval': 5.0, # Minimize DB load with 5s polling
    },

    # ── Worker Hygiene ───────────────────────────────────────────────────────
    worker_prefetch_multiplier=1,         
    task_acks_late=True,                  
    worker_max_tasks_per_child=50,        
    worker_max_memory_per_child=400_000,  
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
    return asyncio.run(coro)

def _check_memory_pressure(task: Any, threshold: float = 85.0) -> None:
    mem = psutil.virtual_memory()
    if mem.percent > threshold:
        logger.warning(
            f"🚨 High RAM pressure ({mem.percent:.1f}%). "
            "Re-queuing task to prevent OOM crash."
        )
        raise task.retry(countdown=30)


# ------------------------------------------------------------------------------
# Lazy-Loaded Service Accessors & AI Dependency Injection
# ------------------------------------------------------------------------------
_singletons: Dict[str, Any] = {}

def _get_service(key: str, factory: Any) -> Any:
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
# ------------------------------------------------------------------------------
@celery_app.task(
    bind=True,
    name="process_ingestion_dataset",
    max_retries=3,
    queue="ingestion",
)
def process_ingestion_dataset(self: Any, dataset_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
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
    _check_memory_pressure(self)
    logger.info(f"[{tenant_id}] 🧠 Orchestrating Heavy BI Pipeline: {job_id}")

    from api.services.compute_engine import compute_engine, DatasetMetadata
    from api.services.narrative_service import narrative_service
    from api.services.cache_manager import cache_manager
    from api.services.llm_client import llm_client

    df = None

    try:
        dataset = DatasetMetadata(**dataset_dict)

        self.update_state(
            state="PROGRESS",
            meta={"status": "AI Lead Engineer architecting query plan..."},
        )
        plan = _run_async(_planner().generate_plan(prompt, full_schema, tenant_id))

        if not plan.is_achievable:
            return {"status": "error", "message": plan.missing_data_reason}

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

        self.update_state(
            state="PROGRESS",
            meta={"status": "Synthesising executive summary..."},
        )
        narrative_obj = _run_async(narrative_service.generate_executive_summary(
            payload=insights,
            plan=plan,
            chart_spec=chart_spec,
            tenant_id=tenant_id,
            llm_client=llm_client 
        ))

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
# Task 3: Autonomous Watchdog
# ------------------------------------------------------------------------------
@celery_app.task(
    bind=True,
    name="run_autonomous_insight_scans",
    queue="cron",
)
def run_autonomous_insight_scans(self: Any) -> Dict[str, Any]:
    logger.info("🤖 Starting Global Autonomous Insight Scan...")

    from api.database import SessionLocal
    from models import Agent
    from api.services.watchdog_service import WatchdogService
    from api.services.llm_client import llm_client

    with SessionLocal() as db:
        watchdog = WatchdogService(db_client=db, llm_client=llm_client)

        logger.info("Running pipeline health and dataset staleness audits...")
        _run_async(watchdog.detect_stale_datasets())

        active_agents = db.query(Agent).filter(Agent.is_active == True).all()

        if not active_agents:
            logger.info("No active autonomous agents found. Skipping scan.")
            return {"status": "success", "agents_scanned": 0, "insights_found": 0}

        insights_found = 0

        for agent in active_agents:
            if not agent.metric_column or not agent.time_column:
                continue

            try:
                logger.info(f"Triggering Watchdog for Agent: {agent.id} (Tenant: {agent.tenant_id})")
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
                    logger.info(f"💡 High-impact insight for {agent.tenant_id}! Impact Score: {insight.impact_score}")

            except Exception as e:
                logger.error(f"Agent {agent.id} (Tenant: {agent.tenant_id}) failed: {e}")
                continue

    logger.info(f"✅ Global Scan complete. Agents: {len(active_agents)}, Insights: {insights_found}.")
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
    logger.info("Initializing Containerized Compute Worker Daemon with Database-Backed Broker...")
    celery_app.worker_main(
        argv=[
            "worker",
            "--loglevel=info",
            "-Q", "analytics,ingestion,cron",
            "-B",
        ]
    )