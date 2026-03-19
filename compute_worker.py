import os
import asyncio
import logging
import gc
import time
import psutil
from typing import Optional, Dict, Any
from celery import Celery
from celery.schedules import crontab
from celery.exceptions import SoftTimeLimitExceeded

# Core Database & Models
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from api.database import SessionLocal
from models import Dataset, DatasetStatus, Agent

# Core Infrastructure Orchestrators
from api.services.storage_manager import storage_manager
from api.services.sync_engine import get_sync_engine
from api.services.credential_manager import CredentialManager

# Modular Service Layer — All "thinking" and "computing" delegated here
from api.services.query_planner import QueryPlanner
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import compute_engine, DatasetMetadata
from api.services.insight_orchestrator import InsightOrchestrator
from api.services.narrative_service import narrative_service
from api.services.cache_manager import cache_manager
from api.services.llm_client import llm_client

# Autonomous Watchdog
from api.services.watchdog_service import WatchdogService

# ------------------------------------------------------------------------------
# Worker Configuration & Observability
# ------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [ComputeWorker] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("ComputeWorker")

# Deployment Context: Support Vercel KV, Upstash, Render Redis, or local fallback
redis_url = (
    os.getenv("KV_URL")
    or os.getenv("UPSTASH_REDIS_REST_URL")
    or os.getenv("REDIS_URL")
    or "redis://localhost:6379/0"
)

celery_app = Celery(
    "compute_worker",
    broker=redis_url,
    backend=redis_url
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_time_limit=600,           # 10m hard limit for massive ingestions
    task_soft_time_limit=570,
    worker_prefetch_multiplier=1,  # Fair distribution: prevent one node hogging heavy jobs
    task_acks_late=True,           # Reliability: acknowledge only after successful execution
    worker_max_tasks_per_child=50  # Prevent memory leaks in long-running worker processes
)

# ------------------------------------------------------------------------------
# Autonomous Mode Cron Scheduler (Celery Beat)
# ------------------------------------------------------------------------------
celery_app.conf.beat_schedule = {
    "autonomous-analyst-hourly": {
        "task": "run_autonomous_insight_scans",
        "schedule": crontab(minute="0"),  # Top of every hour
    },
}

# ------------------------------------------------------------------------------
# Global Singletons (Service Layer — instantiated once per worker process)
# ------------------------------------------------------------------------------
planner = QueryPlanner()
generator = NL2SQLGenerator()
insight_engine = InsightOrchestrator()

# ------------------------------------------------------------------------------
# Resource Guardrails & Async Bridge
# ------------------------------------------------------------------------------

def _run_async(coro):
    """
    Hybrid Performance Bridge: safely executes async IO-bound services
    inside synchronous Celery worker threads without a persistent event loop.
    """
    return asyncio.run(coro)


def _check_memory_pressure(task, threshold: float = 85.0):
    """
    Engineering Excellence — Proactive OOM Prevention.
    If RAM utilisation exceeds the threshold, yield the task back to the queue
    so a less-pressured node can pick it up, preventing a hard crash.
    """
    mem = psutil.virtual_memory()
    if mem.percent > threshold:
        logger.warning(
            f"🚨 High RAM Pressure ({mem.percent:.1f}%). "
            "Re-queuing task to prevent OOM crash."
        )
        raise task.retry(countdown=30)


# ------------------------------------------------------------------------------
# Task 1: Zero-ETL Ingestion & Vectorization
# ------------------------------------------------------------------------------

@celery_app.task(bind=True, name="process_ingestion_dataset", max_retries=3)
def process_ingestion_dataset(self, dataset_id: str, tenant_id: str):
    """
    Handles two ingestion paths:
      A) Local file upload  → DuckDB Parquet vectorisation & schema profiling.
      B) SaaS / Warehouse  → Zero-ETL historical multi-stream pull via SyncEngine.

    Retries up to 3 times (60 s back-off) on transient failures.
    """
    _check_memory_pressure(self)
    logger.info(f"[{tenant_id}] ⚡ Starting Ingestion Task for Dataset: {dataset_id}")
    start_time = time.perf_counter()

    with SessionLocal() as db:
        try:
            dataset = db.query(Dataset).filter(
                Dataset.id == dataset_id,
                Dataset.tenant_id == tenant_id
            ).first()

            if not dataset:
                logger.error(f"[{tenant_id}] Dataset {dataset_id} not found. Aborting.")
                return

            dataset.status = DatasetStatus.PROCESSING
            db.commit()

            # ── Path A: Local File → Parquet Vectorisation ──────────────────
            if not dataset.integration_name:
                self.update_state(
                    state="PROGRESS",
                    meta={"status": "Vectorizing file to Parquet..."}
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
                    meta={"status": f"Pulling historical data from {dataset.integration_name}..."}
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
            logger.info(
                f"✅ [{tenant_id}] Ingestion complete: {dataset_id} in {duration}s"
            )
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
            logger.error(f"❌ [{tenant_id}] Ingestion failed: {dataset_id} | {str(e)}")
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

@celery_app.task(bind=True, name="execute_heavy_analytical_pipeline", max_retries=1)
def execute_heavy_analytical_pipeline(
    self,
    job_id: str,
    prompt: str,
    tenant_id: str,
    dataset_dict: dict,
    full_schema: dict,
):
    """
    End-to-end BI analytics pipeline for queries requiring massive warehouse aggregations.

    Stages:
      1. AI Planning         — QueryPlanner builds a structured, achievability-checked plan.
      2. SQL Compilation     — NL2SQLGenerator emits dialect-specific, optimised SQL.
      3. Vectorised Compute  — ComputeEngine executes a read-only warehouse scan.
      4. Statistical Insights — InsightOrchestrator extracts anomalies & KPIs.
      5. Narrative Synthesis — NarrativeService generates an executive summary.
      6. Cache Commit        — Result persisted to Redis to unblock frontend polling.
    """
    _check_memory_pressure(self)
    logger.info(f"[{tenant_id}] 🧠 Orchestrating Heavy BI Pipeline: {job_id}")

    try:
        dataset = DatasetMetadata(**dataset_dict)

        # 1. AI Planning ──────────────────────────────────────────────────────
        self.update_state(
            state="PROGRESS",
            meta={"status": "AI Lead Engineer architecting query plan..."}
        )
        plan = _run_async(planner.generate_plan(prompt, full_schema, tenant_id))

        if not plan.is_achievable:
            return {"status": "error", "message": plan.missing_data_reason}

        # 2. SQL Compilation ──────────────────────────────────────────────────
        self.update_state(
            state="PROGRESS",
            meta={"status": "Compiling optimised SQL..."}
        )
        sql_query, chart_spec = _run_async(generator.generate_sql(
            plan=plan,
            full_schema=full_schema,
            target_engine=dataset.location.value,
            tenant_id=tenant_id,
            prompt=prompt,
        ))

        # 3. Vectorised Compute Execution ─────────────────────────────────────
        self.update_state(
            state="PROGRESS",
            meta={"status": "Executing warehouse scan..."}
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
            meta={"status": "Running mathematical insight gauntlet..."}
        )
        import polars as pl
        df = pl.DataFrame(query_result)
        insights = insight_engine.analyze_dataframe(df, plan, tenant_id)

        # 5. Executive Narrative Synthesis ────────────────────────────────────
        self.update_state(
            state="PROGRESS",
            meta={"status": "Synthesizing executive summary..."}
        )
        narrative_obj = _run_async(narrative_service.generate_executive_summary(
            payload=insights,
            plan=plan,
            chart_spec=chart_spec,
            tenant_id=tenant_id,
        ))

        # 6. Cache Commit (unblocks frontend polling) ──────────────────────────
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
        logger.error(f"💥 [{tenant_id}] BI Pipeline crash: {job_id} | {str(e)}")
        return {
            "status": "error",
            "message": str(e),
        }

    finally:
        gc.collect()


# ------------------------------------------------------------------------------
# Task 3: Autonomous Watchdog (Scheduled AI Data Analyst)
# ------------------------------------------------------------------------------

@celery_app.task(bind=True, name="run_autonomous_insight_scans")
def run_autonomous_insight_scans(self):
    """
    Celery Beat Cron Job — runs at the top of every hour.

    Proactive monitoring across all tenants:
      1. Pipeline health & dataset staleness audit.
      2. Per-agent anomaly detection using EMA / Z-Score weighting.
         Failures are isolated per agent so one bad tenant never blocks the fleet.
    """
    logger.info("🤖 Starting Global Autonomous Insight Scan...")

    with SessionLocal() as db:
        watchdog = WatchdogService(db_client=db)

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
            # Skip misconfigured agents missing required columns
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
                # Fault isolation: one bad tenant must never stall the fleet
                logger.error(
                    f"Agent {agent.id} (Tenant: {agent.tenant_id}) failed: {str(e)}"
                )
                continue

    logger.info(
        f"✅ Global Scan complete. "
        f"Agents scanned: {len(active_agents)}, "
        f"Insights generated: {insights_found}."
    )
    return {
        "status": "success",
        "agents_scanned": len(active_agents),
        "insights_found": insights_found,
    }