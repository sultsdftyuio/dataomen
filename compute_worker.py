import os
import asyncio
import logging
import gc
import time
import traceback
import psutil
from typing import Optional, Dict, Any
from celery import Celery
from celery.exceptions import SoftTimeLimitExceeded

# Core Database & Models
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from api.database import SessionLocal
from models import Dataset, DatasetStatus

# Core Infrastructure Orchestrators
from api.services.storage_manager import storage_manager
from api.services.sync_engine import get_sync_engine, INTEGRATION_REGISTRY
from api.services.credential_manager import CredentialManager

# Phase 6: Analytical Services
from api.services.query_planner import QueryPlanner
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine, DatasetMetadata
from api.services.insight_orchestrator import InsightOrchestrator
from api.services.narrative_service import NarrativeService
from api.services.cache_manager import cache_manager

# ------------------------------------------------------------------------------
# Worker Configuration & Observability
# ------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [DataOmenCelery] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("DataOmenCelery")

# Configure Celery to use Vercel KV / Upstash Redis
redis_url = os.getenv("KV_URL") or os.getenv("UPSTASH_REDIS_REST_URL") or "redis://localhost:6379/0"

celery_app = Celery(
    "dataomen_compute_worker",
    broker=redis_url,
    backend=redis_url
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_time_limit=600, # 10 minute hard limit for massive ingestions
    task_soft_time_limit=570,
    worker_prefetch_multiplier=1, # Fair distribution among worker nodes
    task_acks_late=True # Only acknowledge task completion AFTER it finishes
)

# ------------------------------------------------------------------------------
# Global Singletons for Analytics
# ------------------------------------------------------------------------------
api_key = os.getenv("OPENAI_API_KEY")
planner = QueryPlanner(api_key=api_key)
generator = NL2SQLGenerator(api_key=api_key)
compute = ComputeEngine()
insight = InsightOrchestrator()
narrative = NarrativeService(api_key=api_key)

# ------------------------------------------------------------------------------
# Utility Helpers
# ------------------------------------------------------------------------------

def _run_async(coro):
    """Safely executes async code inside the synchronous Celery worker thread."""
    return asyncio.run(coro)

def _check_memory(task_instance, threshold: float = 85.0):
    """
    Resource Guardrail: Prevents OOM by monitoring RAM before heavy operations.
    Forces the task back into the queue if the node is suffocating.
    """
    mem = psutil.virtual_memory()
    if mem.percent > threshold:
        logger.warning(f"⚠️ High Memory Pressure ({mem.percent}%). Retrying task to prevent OOM.")
        # Exponential backoff retry
        raise task_instance.retry(countdown=30)

# ------------------------------------------------------------------------------
# Task 1: Zero-ETL Ingestion & Sync (Upgraded from your polling script)
# ------------------------------------------------------------------------------

@celery_app.task(bind=True, name="process_ingestion_dataset", max_retries=3)
def process_ingestion_dataset(self, dataset_id: str, tenant_id: str):
    """
    Handles Parquet Vectorization & SaaS Historical Multi-stream Pulls.
    """
    _check_memory(self)
    logger.info(f"[{tenant_id}] ⚡ Starting Ingestion Task for Dataset: {dataset_id}")
    start_time = time.perf_counter()

    with SessionLocal() as db:
        try:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if not dataset:
                logger.error(f"[{tenant_id}] Dataset {dataset_id} not found.")
                return

            dataset.status = DatasetStatus.PROCESSING
            db.commit()

            is_sync_task = dataset.integration_name is not None

            if not is_sync_task:
                # PATH A: Vectorized Profiling (DuckDB Transform of CSV/Parquet)
                self.update_state(state='PROGRESS', meta={'status': 'Vectorizing file to Parquet...'})
                profile = storage_manager.convert_to_parquet_and_profile(db, tenant_id, dataset.file_path)
                
                dataset.file_path = profile["parquet_path"]
                dataset.schema_metadata = {
                    **(dataset.schema_metadata or {}),
                    "columns": profile.get("columns", []),
                    "row_count": profile.get("row_count", 0),
                    "vectorized_at": time.time()
                }
            else:
                # PATH B: Zero-ETL Historical Pull (SaaS/Warehouse)
                self.update_state(state='PROGRESS', meta={'status': f'Pulling historical data from {dataset.integration_name}...'})
                creds = CredentialManager(db).get_integration_credentials(tenant_id, dataset.integration_name)
                if not creds:
                    raise PermissionError(f"Secure Vault access denied for {dataset.integration_name}")

                sync_engine = get_sync_engine(db)
                stream_name = dataset.stream_name or "default"
                
                _run_async(sync_engine.run_historical_sync(
                    tenant_id=tenant_id,
                    integration_name=dataset.integration_name,
                    dataset_id=dataset_id,
                    stream_name=stream_name,
                    start_timestamp=dataset.schema_metadata.get("start_timestamp", "2024-01-01T00:00:00Z")
                ))

            # Mark Success
            dataset.status = DatasetStatus.READY
            db.commit()
            
            # Bust the cache for this dataset since the data has changed
            _run_async(cache_manager.invalidate_dataset_cache(tenant_id, dataset_id))

            duration = round(time.perf_counter() - start_time, 2)
            logger.info(f"✅ [{tenant_id}] Ingestion Finished: {dataset_id} in {duration}s")
            return {"status": "success", "duration_seconds": duration}

        except SoftTimeLimitExceeded:
            logger.error(f"❌ [{tenant_id}] Task Timeout: {dataset_id}")
            dataset.status = DatasetStatus.FAILED
            dataset.schema_metadata = {**(dataset.schema_metadata or {}), "error": "Operation timed out."}
            db.commit()
            
        except Exception as e:
            logger.error(f"❌ [{tenant_id}] Ingestion Failed: {dataset_id} | Error: {str(e)}")
            dataset.status = DatasetStatus.FAILED
            dataset.schema_metadata = {**(dataset.schema_metadata or {}), "error": str(e)}
            db.commit()
            # Let Celery handle the retry logic if appropriate
            raise self.retry(exc=e, countdown=60)
            
        finally:
            # Memory Management: Force cleanup of Polars/C++ buffers
            gc.collect()

# ------------------------------------------------------------------------------
# Task 2: Heavy Analytical Orchestration (Phase 6 Compute)
# ------------------------------------------------------------------------------

@celery_app.task(bind=True, name="execute_heavy_analytical_pipeline", max_retries=1)
def execute_heavy_analytical_pipeline(
    self, 
    job_id: str, 
    prompt: str, 
    tenant_id: str, 
    dataset_dict: dict, 
    full_schema: dict
):
    """
    Executes the BI Analytics pipeline (Plan -> SQL -> Compute -> Insights -> Narrative)
    for queries that require massive aggregations over remote data warehouses.
    """
    _check_memory(self)
    logger.info(f"[{tenant_id}] Worker picked up heavy compute job: {job_id}")

    try:
        dataset = DatasetMetadata(**dataset_dict)
        
        # 1. Lead Engineer Planning
        self.update_state(state='PROGRESS', meta={'status': 'AI Lead Engineer planning query...'})
        plan = _run_async(planner.generate_plan(prompt, full_schema, tenant_id))
        
        if not plan.is_achievable:
            return {"status": "error", "message": plan.missing_data_reason}

        # 2. SQL Generation
        self.update_state(state='PROGRESS', meta={'status': 'Compiling warehouse-specific SQL...'})
        sql_query, chart_spec = _run_async(generator.generate_sql(plan, full_schema, dataset.location.value, tenant_id))

        # 3. Vectorized Compute Pushdown
        self.update_state(state='PROGRESS', meta={'status': 'Pushing compute down to warehouse...'})
        query_result = _run_async(compute.execute_query(sql_query, dataset))

        # 4. Mathematical Insight Gauntlet
        self.update_state(state='PROGRESS', meta={'status': 'Running statistical gauntlet...'})
        import polars as pl
        df = pl.DataFrame(query_result.data)
        insights = insight.analyze_dataframe(df, plan, tenant_id)

        # 5. Executive Narrative
        self.update_state(state='PROGRESS', meta={'status': 'Synthesizing executive summary...'})
        narrative_obj = _run_async(narrative.generate_executive_summary(insights, plan, chart_spec, tenant_id))

        final_payload = {
            "status": "success",
            "type": "chart" if chart_spec else "table",
            "data": query_result.data,
            "sql_used": sql_query,
            "chart_spec": chart_spec,
            "row_count": query_result.row_count,
            "insights": insights.model_dump(),
            "narrative": narrative_obj.model_dump()
        }

        # Commit directly to Redis Cache so the frontend polling instantly renders the dashboard
        _run_async(cache_manager.set_cached_insight(
            tenant_id=tenant_id,
            dataset_id=dataset.dataset_id,
            prompt=prompt,
            sql_query=sql_query,
            chart_spec=chart_spec,
            insight_payload=insights,
            narrative=narrative_obj.model_dump()
        ))

        return final_payload

    except Exception as e:
        logger.error(f"[{tenant_id}] Heavy job {job_id} failed: {str(e)}")
        return {"status": "error", "message": str(e)}
        
    finally:
        gc.collect()