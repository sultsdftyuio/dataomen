# compute_worker.py

import asyncio
import logging
import signal
import sys
import gc
import os
import time
import traceback
import psutil # For memory-aware task orchestration
from typing import Optional, Dict, Any, Type

# Core Database & Models (Multi-Tenant Infrastructure)
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from api.database import SessionLocal
from models import Dataset, DatasetStatus, Organization

# Core Infrastructure Orchestrators (Modular Strategy)
from api.services.storage_manager import storage_manager
from api.services.sync_engine import get_sync_engine, INTEGRATION_REGISTRY
from api.services.integrations.base_integration import IntegrationConfig

# ------------------------------------------------------------------------------
# Worker Configuration & Observability
# ------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [DataOmenWorker] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout 
)
logger = logging.getLogger("DataOmenWorker")

class DataOmenComputeWorker:
    """
    Phase 6: The High-Performance Compute Task Processor.
    
    Objective:
    Always-on background worker for heavy-duty I/O and CPU tasks:
    - Parquet Vectorization & Profiling
    - SaaS Historical Multi-stream Pulls
    - Dead-Letter Queue (DLQ) re-processing
    
    Engineering Excellence:
    - Resource Guardrails: Prevents OOM by monitoring RAM before job claims.
    - Distributed Locking: Uses Postgres 'SKIP LOCKED' for horizontal scaling.
    - Zero-Copy Handoff: Keeps data in Arrow/Polars buffers throughout the sync.
    """

    def __init__(self) -> None:
        self.is_running: bool = True
        self.base_poll_interval: int = int(os.environ.get("WORKER_POLL_INTERVAL", 5))
        self.current_poll_interval: int = self.base_poll_interval
        # Threshold: Don't take new heavy jobs if RAM usage > 85%
        self.max_memory_threshold = 85.0 

    def shutdown_handler(self, signum: int, frame: Any) -> None:
        """Graceful shutdown prevents data corruption during Render/Vercel redeploys."""
        logger.warning(f"Received termination signal ({signum}). Draining active tasks...")
        self.is_running = False

    async def run(self) -> None:
        logger.info("🚀 Data Omen Compute Worker booting up (Phase 6 Readiness)...")
        
        # 1. State Recovery: Prevent jobs from being stuck in 'Processing' forever
        await self._recover_zombie_jobs()
        
        # 2. Lifecycle Management
        signal.signal(signal.SIGINT, self.shutdown_handler)
        signal.signal(signal.SIGTERM, self.shutdown_handler)

        logger.info(f"🎧 Monitoring queue with base interval {self.base_poll_interval}s")

        while self.is_running:
            try:
                # Engineering Filter: Check resource health before pulling new tasks
                if self._is_resource_exhausted():
                    logger.warning("⚠️ High Memory Pressure detected. Skipping task pull to prevent OOM.")
                    await asyncio.sleep(10)
                    continue

                processed_a_job = await self._poll_and_execute()
                
                # Dynamic Backoff: Save database IO when the queue is empty
                if not processed_a_job and self.is_running:
                    self.current_poll_interval = min(self.current_poll_interval * 1.5, 30)
                    await asyncio.sleep(self.current_poll_interval)
                else:
                    self.current_poll_interval = self.base_poll_interval
                    
            except Exception as e:
                logger.error(f"Critical Worker Exception: {e}")
                await asyncio.sleep(self.base_poll_interval)
        
        logger.info("🛑 Worker shutdown successful.")

    def _is_resource_exhausted(self) -> bool:
        """Checks if the container is near its RAM limit."""
        mem = psutil.virtual_memory()
        return mem.percent > self.max_memory_threshold

    async def _recover_zombie_jobs(self) -> None:
        """Atomic reset of jobs orphaned by a previous worker crash."""
        def _sweep():
            with SessionLocal() as db:
                zombies = db.query(Dataset).filter(Dataset.status == DatasetStatus.PROCESSING).all()
                for zombie in zombies:
                    zombie.status = DatasetStatus.FAILED
                    zombie.schema_metadata = {
                        **(zombie.schema_metadata or {}),
                        "error": "Compute unit rebooted during execution. Task failed for safety."
                    }
                if zombies:
                    db.commit()
                    logger.warning(f"🧟 Successfully recovered {len(zombies)} zombie jobs.")

        await asyncio.to_thread(_sweep)

    def _claim_job_sync(self) -> Optional[Dict[str, Any]]:
        """Transactional Job Claiming using Postgres row-level locking."""
        with SessionLocal() as db:
            try:
                # Phase 6 Pattern: Claim first available task and lock it to this worker ID
                pending_dataset = db.query(Dataset).filter(
                    Dataset.status == DatasetStatus.PENDING
                ).with_for_update(skip_locked=True).first()

                if not pending_dataset:
                    return None

                job_data = {
                    "dataset_id": str(pending_dataset.id),
                    "tenant_id": str(pending_dataset.tenant_id),
                    "metadata": pending_dataset.schema_metadata or {},
                    "file_path": pending_dataset.file_path,
                    "integration_name": pending_dataset.integration_name,
                    "stream_name": pending_dataset.stream_name
                }

                pending_dataset.status = DatasetStatus.PROCESSING
                db.commit()
                return job_data

            except SQLAlchemyError as e:
                db.rollback()
                logger.error(f"Job claim failure: {str(e)}")
                return None

    async def _execute_job(self, job_data: Dict[str, Any]) -> None:
        """Orchestrates the Compute Engine based on Task Type."""
        dataset_id = job_data["dataset_id"]
        tenant_id = job_data["tenant_id"]
        metadata = job_data["metadata"]
        
        # Determine Path: Upload (Profiling) vs Sync (API)
        is_sync_task = job_data.get("integration_name") is not None
        
        start_time = time.perf_counter()
        logger.info(f"[{tenant_id}] ⚡ Starting Task: {dataset_id} (Sync: {is_sync_task})")

        try:
            if not is_sync_task:
                # PATH A: Vectorized Profiling (DuckDB Transform)
                await self._handle_file_profiling(dataset_id, tenant_id, job_data["file_path"])
            else:
                # PATH B: Zero-ETL Historical Pull
                await self._handle_saas_sync(dataset_id, tenant_id, job_data)

            duration = round(time.perf_counter() - start_time, 2)
            logger.info(f"✅ [{tenant_id}] Job Finished: {dataset_id} in {duration}s")

        except Exception as e:
            logger.error(f"❌ [{tenant_id}] Job Failed: {dataset_id} | Error: {str(e)}")
            await asyncio.to_thread(self._finalize_status, dataset_id, DatasetStatus.FAILED, str(e))
            
        finally:
            # Memory Management: Force cleanup of Polars/C++ buffers
            del job_data
            gc.collect()

    async def _handle_file_profiling(self, dataset_id: str, tenant_id: str, raw_path: str) -> None:
        """Executes heavy DuckDB conversion logic."""
        def _compute():
            with SessionLocal() as db:
                profile = storage_manager.convert_to_parquet_and_profile(db, tenant_id, raw_path)
                
                dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
                if dataset:
                    dataset.file_path = profile["parquet_path"]
                    dataset.status = DatasetStatus.READY
                    dataset.schema_metadata = {
                        **(dataset.schema_metadata or {}),
                        "columns": profile.get("columns", []),
                        "row_count": profile.get("row_count", 0),
                        "vectorized_at": time.time()
                    }
                    db.commit()

        await asyncio.to_thread(_compute)

    async def _handle_saas_sync(self, dataset_id: str, tenant_id: str, job_data: Dict[str, Any]) -> None:
        """Executes the high-frequency API Pull Pipeline."""
        integration_name = job_data["integration_name"]
        stream_name = job_data["stream_name"] or "default"
        
        # 1. Fetch credentials securely via Vault
        # Note: In production, CredentialManager is used to avoid passing keys in the task queue
        with SessionLocal() as db:
            from api.services.credential_manager import CredentialManager
            creds = CredentialManager(db).get_integration_credentials(tenant_id, integration_name)

        if not creds:
            raise PermissionError(f"Secure Vault access denied for {integration_name}")

        # 2. Rehydrate Connector
        integration_class = INTEGRATION_REGISTRY.get(integration_name)
        if not integration_class:
            raise ValueError(f"Integration '{integration_name}' is not registered.")
            
        connector = integration_class(tenant_id=tenant_id, credentials=creds)

        # 3. Native Async Execution
        with SessionLocal() as db:
            sync_engine = get_sync_engine(db)
            await sync_engine.run_historical_sync(
                tenant_id=tenant_id,
                integration_name=integration_name,
                dataset_id=dataset_id,
                stream_name=stream_name,
                start_timestamp=job_data["metadata"].get("start_timestamp", "2024-01-01T00:00:00Z")
            )

    def _finalize_status(self, dataset_id: str, status: DatasetStatus, error_msg: Optional[str] = None) -> None:
        """Safely marks job as failed with metadata."""
        with SessionLocal() as db:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = status
                if error_msg:
                    dataset.schema_metadata = {**(dataset.schema_metadata or {}), "error": error_msg}
                db.commit()

    async def _poll_and_execute(self) -> bool:
        """Claims a job from the DB and triggers execution."""
        job_data = await asyncio.to_thread(self._claim_job_sync)
        if not job_data:
            return False 
        
        await self._execute_job(job_data)
        return True

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    try:
        worker = DataOmenComputeWorker()
        asyncio.run(worker.run())
    except KeyboardInterrupt:
        pass
    except Exception as e:
        logger.critical(f"FATAL WORKER CRASH: {str(e)}")
        traceback.print_exc()
        sys.exit(1)