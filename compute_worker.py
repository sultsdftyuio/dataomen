# compute_worker.py

import asyncio
import logging
import signal
import sys
import gc
import os
import time
import traceback
from typing import Optional, Dict, Any, Type

# Core Database & Models (Multi-Tenant Infrastructure)
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from api.database import SessionLocal
from models import Dataset, DatasetStatus

# Core Infrastructure Orchestrators (Modular Strategy)
from api.services.storage_manager import storage_manager
from api.services.sync_engine import get_sync_engine
from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

# Integration Registry (The Factory Pattern)
from api.services.integrations.stripe_connector import StripeIntegration
from api.services.integrations.shopify_connector import ShopifyConnector  
from api.services.integrations.salesforce_connector import SalesforceIntegration
from api.services.integrations.snowflake_connector import SnowflakeConnector

# ------------------------------------------------------------------------------
# Worker Configuration & Observability
# ------------------------------------------------------------------------------
# We bind stream=sys.stdout to ensure logs flush instantly to Render's dashboard
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    stream=sys.stdout 
)
logger = logging.getLogger("DataOmenWorker")

class DataOmenComputeWorker:
    """
    The Muscle of the Engine.
    An always-on asynchronous worker that executes memory-heavy Polars/DuckDB 
    pipelines based on state-based triggers from the Web API.
    """
    
    # Modular Registry of supported integration connectors (Class Level for Efficiency)
    _INTEGRATION_REGISTRY: Dict[str, Type[BaseIntegration]] = {
        "stripe": StripeIntegration,
        "shopify": ShopifyConnector,
        "salesforce": SalesforceIntegration,
        "snowflake": SnowflakeConnector
    }

    def __init__(self) -> None:
        self.is_running: bool = True
        self.poll_interval: int = int(os.environ.get("WORKER_POLL_INTERVAL", 5))

    def shutdown_handler(self, signum: int, frame: Any) -> None:
        """Graceful shutdown prevents data corruption during Render redeploys."""
        logger.warning(f"Received termination signal ({signum}). Finalizing active tasks...")
        self.is_running = False

    async def run(self) -> None:
        logger.info("🚀 Data Omen Compute Worker booting up...")
        
        # 1. State Recovery: Clean up jobs interrupted by unexpected server restarts
        await self._recover_zombie_jobs()
        
        # 2. Bind graceful shutdown signals for Render lifecycle management
        signal.signal(signal.SIGINT, self.shutdown_handler)
        signal.signal(signal.SIGTERM, self.shutdown_handler)

        logger.info("🎧 Listening for PENDING analytical jobs...")

        while self.is_running:
            try:
                processed_a_job = await self._poll_and_execute()
                
                # Dynamic Backoff: If queue is empty, sleep to prevent DB hammering
                if not processed_a_job and self.is_running:
                    await asyncio.sleep(self.poll_interval)
                    
            except Exception as e:
                logger.error(f"Critical Worker Loop Error: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval)
        
        logger.info("🛑 Worker shutdown complete. Resources released.")

    async def _recover_zombie_jobs(self) -> None:
        """Finds jobs that were stuck in PROCESSING due to a hard server crash and resets them."""
        def _sweep_db():
            with SessionLocal() as db:
                try:
                    zombies = db.query(Dataset).filter(Dataset.status == DatasetStatus.PROCESSING).all()
                    for zombie in zombies:
                        zombie.status = DatasetStatus.FAILED
                        zombie.schema_metadata = {
                            **(zombie.schema_metadata or {}),
                            "error": "Job interrupted by server restart."
                        }
                    if zombies:
                        db.commit()
                        logger.warning(f"🧟 Swept {len(zombies)} zombie jobs and marked as FAILED.")
                except SQLAlchemyError as e:
                    db.rollback()
                    logger.error(f"Database error during zombie sweep: {str(e)}")

        # Offload sync DB call to prevent blocking the async startup
        await asyncio.to_thread(_sweep_db)

    def _claim_job_sync(self) -> Optional[Dict[str, Any]]:
        """Synchronous DB operation to lock and claim a job. Wrapped by asyncio.to_thread."""
        with SessionLocal() as db:
            try:
                # Using skip_locked to allow multiple worker instances to scale horizontally
                pending_dataset = db.query(Dataset).filter(
                    Dataset.status == DatasetStatus.PENDING
                ).with_for_update(skip_locked=True).first()

                if not pending_dataset:
                    return None

                # Capture required context while the row is locked
                job_data = {
                    "dataset_id": str(pending_dataset.id),
                    "tenant_id": str(pending_dataset.tenant_id),
                    "metadata": pending_dataset.schema_metadata or {},
                    "file_path": pending_dataset.file_path
                }

                # Immediate State Transition to release the row lock
                pending_dataset.status = DatasetStatus.PROCESSING
                db.commit()
                return job_data

            except SQLAlchemyError as e:
                db.rollback()
                logger.error(f"Database error during job claim: {str(e)}")
                return None

    async def _execute_job(self, job_data: Dict[str, Any]) -> None:
        """Phase 2: Orchestrate the specific compute pipeline based on metadata."""
        dataset_id = job_data["dataset_id"]
        tenant_id = job_data["tenant_id"]
        metadata = job_data["metadata"]
        ingestion_type = metadata.get("ingestion_type", "sync")

        start_time = time.time()
        logger.info(f"[{tenant_id}] ⚡ Executing {ingestion_type.upper()} pipeline for Dataset {dataset_id}")

        try:
            if ingestion_type == "upload":
                # Path A: Vectorized File Ingestion (S3 -> Parquet -> DuckDB)
                await self._handle_file_upload(dataset_id, tenant_id, job_data["file_path"])
            else:
                # Path B: Zero-ETL Sync (API -> Polars/Arrow -> Parquet)
                await self._handle_historical_sync(dataset_id, tenant_id, metadata)

            duration = round(time.time() - start_time, 2)
            logger.info(f"✅ Successfully finalized Dataset {dataset_id} in {duration}s")

        except Exception as e:
            duration = round(time.time() - start_time, 2)
            logger.error(f"❌ Job Failed for Dataset {dataset_id} after {duration}s: {str(e)}", exc_info=True)
            await asyncio.to_thread(self._finalize_status, dataset_id, DatasetStatus.FAILED, str(e))
            
        finally:
            # Analytical Efficiency: Force release of C++/Rust memory buffers from Polars/DuckDB execution
            # This is critical on Render instances with strict RAM limits
            gc.collect()

    async def _handle_file_upload(self, dataset_id: str, tenant_id: str, raw_path: str) -> None:
        """Executes heavy DuckDB conversion and profiling logic without blocking event loop."""
        def _process_and_update():
            with SessionLocal() as db:
                try:
                    # storage_manager handles the actual columnar transformation
                    profile = storage_manager.convert_to_parquet_and_profile(db, tenant_id, raw_path)
                    
                    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
                    if dataset:
                        dataset.file_path = profile["parquet_path"]
                        dataset.schema_metadata = {
                            **dataset.schema_metadata,
                            "columns": profile.get("columns", []),
                            "row_count": profile.get("row_count", 0),
                            "vectorized_at": time.time(),
                            "status": "vectorized"
                        }
                        dataset.status = DatasetStatus.READY
                        db.commit()
                except Exception:
                    db.rollback()
                    raise

        # Offload heavy analytical processing to a background thread
        await asyncio.to_thread(_process_and_update)

    async def _handle_historical_sync(self, dataset_id: str, tenant_id: str, metadata: Dict[str, Any]) -> None:
        """Executes the API polling and normalization engine."""
        integration_name = metadata.get("integration_name", "").lower()
        stream_name = metadata.get("stream_name", "default_stream")
        start_ts = metadata.get("start_timestamp", "2020-01-01T00:00:00Z")

        # 1. Integration Factory: Rehydrate the specific connector
        creds = metadata.get("credentials", {}) 
        
        config = IntegrationConfig(
            tenant_id=tenant_id, 
            integration_name=integration_name, 
            credentials=creds
        )
        
        integration_class = self._INTEGRATION_REGISTRY.get(integration_name)
        if not integration_class:
            raise ValueError(f"Integration '{integration_name}' is not registered in the compute worker.")
            
        integration_instance = integration_class(config=config)

        def _run_sync():
            # 2. Execute Sync Engine statelessly (Dependency Injection)
            with SessionLocal() as db:
                try:
                    sync_engine = get_sync_engine(db)
                    # If sync_engine.run_historical_sync is async, you wouldn't need to_thread here,
                    # but typically heavy ETL sync blocks. Assuming it needs thread offloading.
                    # Note: If run_historical_sync requires an async context, this needs to be awaited directly.
                    asyncio.run(sync_engine.run_historical_sync(
                        integration=integration_instance,
                        dataset_id=dataset_id,
                        stream_name=stream_name,
                        start_timestamp=start_ts
                    ))
                except Exception:
                    db.rollback()
                    raise

        await asyncio.to_thread(_run_sync)

    def _finalize_status(self, dataset_id: str, status: DatasetStatus, error_msg: str = None) -> None:
        """Update job state in case of terminal failure, wrapped safely."""
        with SessionLocal() as db:
            try:
                dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
                if dataset:
                    dataset.status = status
                    if error_msg:
                        dataset.schema_metadata = {**(dataset.schema_metadata or {}), "error": error_msg}
                    db.commit()
            except SQLAlchemyError:
                db.rollback()

    async def _poll_and_execute(self) -> bool:
        """Worker lifecycle step."""
        job_data = await asyncio.to_thread(self._claim_job_sync)
        if not job_data:
            return False 
        
        await self._execute_job(job_data)
        return True

# ------------------------------------------------------------------------------
# Entrypoint & Observability Boundary
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    try:
        worker = DataOmenComputeWorker()
        asyncio.run(worker.run())
    except KeyboardInterrupt:
        logger.info("Worker stopped manually.")
    except Exception as e:
        # Prevents "silent Status 1" crashes by ensuring the traceback is 
        # explicitly written to standard output before the container dies.
        logger.critical(f"FATAL STARTUP ERROR: {str(e)}")
        traceback.print_exc(file=sys.stdout)
        sys.exit(1)