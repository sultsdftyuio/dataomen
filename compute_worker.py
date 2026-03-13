# compute_worker.py

import asyncio
import logging
import signal
import sys
import gc
import os
import traceback
from typing import Optional, Dict, Any, Type

# Core Database & Models (Multi-Tenant Infrastructure)
from sqlalchemy.orm import Session
from api.database import SessionLocal
from models import Dataset, DatasetStatus

# Core Infrastructure Orchestrators (Modular Strategy)
from api.services.storage_manager import storage_manager
from api.services.sync_engine import get_sync_engine
from api.services.integrations.base_integration import BaseIntegration, IntegrationConfig

# Integration Registry (The Factory Pattern)
from api.services.integrations.stripe_connector import StripeIntegration
from api.services.integrations.shopify_connector import ShopifyConnector  # Fixed import
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
    
    # Modular Registry of supported integration connectors
    _INTEGRATION_REGISTRY: Dict[str, Type[BaseIntegration]] = {
        "stripe": StripeIntegration,
        "shopify": ShopifyConnector,  # Fixed class reference
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
        logger.info("🚀 Data Omen Compute Worker initialized. Listening for PENDING analytical jobs...")
        
        # Bind graceful shutdown signals for Render lifecycle management
        signal.signal(signal.SIGINT, self.shutdown_handler)
        signal.signal(signal.SIGTERM, self.shutdown_handler)

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

    async def _poll_and_claim(self) -> Optional[Dict[str, Any]]:
        """Phase 1: Securely lock and claim the next available PENDING job."""
        with SessionLocal() as db:
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
            
            logger.info(f"[{job_data['tenant_id']}] Acquired {job_data['metadata'].get('ingestion_type', 'sync')} job: {job_data['dataset_id']}")
            return job_data

    async def _execute_job(self, job_data: Dict[str, Any]) -> None:
        """Phase 2: Orchestrate the specific compute pipeline based on metadata."""
        dataset_id = job_data["dataset_id"]
        tenant_id = job_data["tenant_id"]
        metadata = job_data["metadata"]
        ingestion_type = metadata.get("ingestion_type", "sync")

        try:
            if ingestion_type == "upload":
                # Path A: Vectorized File Ingestion (S3 -> Parquet -> DuckDB)
                await self._handle_file_upload(dataset_id, tenant_id, job_data["file_path"])
            else:
                # Path B: Zero-ETL Sync (API -> Polars/Arrow -> Parquet)
                await self._handle_historical_sync(dataset_id, tenant_id, metadata)

            logger.info(f"✅ Successfully finalized Dataset {dataset_id}")

        except Exception as e:
            logger.error(f"❌ Job Failed for Dataset {dataset_id}: {str(e)}", exc_info=True)
            self._finalize_status(dataset_id, DatasetStatus.FAILED)
            
        finally:
            # Analytical Efficiency: Force release of C++/Rust memory buffers from Polars/DuckDB
            # This is critical on Render instances with strict RAM limits
            gc.collect()

    async def _handle_file_upload(self, dataset_id: str, tenant_id: str, raw_path: str) -> None:
        """Executes heavy DuckDB conversion and profiling logic."""
        logger.info(f"[{tenant_id}] Starting vectorized profiling for: {raw_path}")
        
        with SessionLocal() as db:
            # storage_manager handles the actual columnar transformation
            profile = storage_manager.convert_to_parquet_and_profile(db, tenant_id, raw_path)
            
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.file_path = profile["parquet_path"]
                dataset.schema_metadata = {
                    **dataset.schema_metadata,
                    "columns": profile.get("columns", []),
                    "row_count": profile.get("row_count", 0),
                    "vectorized_at": asyncio.get_event_loop().time()
                }
                dataset.status = DatasetStatus.READY
                db.commit()

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

        # 2. Execute Sync Engine statelessly (Dependency Injection)
        with SessionLocal() as db:
            sync_engine = get_sync_engine(db)
            await sync_engine.run_historical_sync(
                integration=integration_instance,
                dataset_id=dataset_id,
                stream_name=stream_name,
                start_timestamp=start_ts
            )

    def _finalize_status(self, dataset_id: str, status: DatasetStatus) -> None:
        """Update job state in case of terminal failure."""
        with SessionLocal() as db:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = status
                db.commit()

    async def _poll_and_execute(self) -> bool:
        """Worker lifecycle step."""
        job_data = await self._poll_and_claim()
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