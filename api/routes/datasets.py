import asyncio
import logging
import signal
import sys
import gc
from typing import Optional, Dict, Any

# Core Database & Models (Multi-Tenant Infrastructure)
from sqlalchemy.orm import Session
from api.database import SessionLocal
from models import Dataset, DatasetStatus, Organization

# Core Infrastructure Orchestrators (Modular Strategy)
from api.services.storage_manager import storage_manager
from api.services.sync_engine import get_sync_engine
from api.services.integrations.base_integration import IntegrationConfig

# Integration Registry (The Factory Pattern)
from api.services.integrations.stripe_connector import StripeIntegration
from api.services.integrations.shopify_connector import ShopifyIntegration
from api.services.integrations.salesforce_connector import SalesforceIntegration

# ------------------------------------------------------------------------------
# Worker Configuration & Logging
# ------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger("RenderComputeWorker")

class DataOmenComputeWorker:
    """
    The Muscle of the Engine.
    An always-on asynchronous worker that executes memory-heavy Polars/DuckDB 
    pipelines based on state-based triggers from the Web API.
    """
    def __init__(self) -> None:
        self.is_running: bool = True
        self.poll_interval: int = 5  # seconds

    def shutdown_handler(self, signum: int, frame: Any) -> None:
        """Graceful shutdown prevents data corruption during Render redeploys."""
        logger.warning(f"Received termination signal ({signum}). Gracefully shutting down...")
        self.is_running = False

    async def run(self) -> None:
        logger.info("🚀 Data Omen Compute Worker initialized and listening for PENDING jobs...")
        
        # Bind graceful shutdown signals
        signal.signal(signal.SIGINT, self.shutdown_handler)
        signal.signal(signal.SIGTERM, self.shutdown_handler)

        while self.is_running:
            try:
                processed_a_job = await self._poll_and_execute()
                
                # If queue is empty, sleep to prevent hammering Supabase
                if not processed_a_job and self.is_running:
                    await asyncio.sleep(self.poll_interval)
                    
            except Exception as e:
                logger.error(f"Critical Worker Loop Error: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval)
        
        logger.info("🛑 Worker shutdown complete.")

    async def _poll_and_claim(self) -> Optional[Dict[str, Any]]:
        """Phase 1: Securely lock and claim the next available PENDING job."""
        with SessionLocal() as db:
            pending_dataset = db.query(Dataset).filter(
                Dataset.status == DatasetStatus.PENDING
            ).with_for_update(skip_locked=True).first()

            if not pending_dataset:
                return None

            # Capture all required job context while we have the lock
            job_data = {
                "dataset_id": str(pending_dataset.id),
                "tenant_id": str(pending_dataset.tenant_id),
                "metadata": pending_dataset.schema_metadata or {},
                "file_path": pending_dataset.file_path
            }

            # Claim the job immediately to release the row lock
            pending_dataset.status = DatasetStatus.PROCESSING
            db.commit()
            
            logger.info(f"Acquired {job_data['metadata'].get('ingestion_type', 'sync')} job for Dataset {job_data['dataset_id']}")
            return job_data

    async def _execute_job(self, job_data: Dict[str, Any]) -> None:
        """Phase 2: Orchestrate the specific compute pipeline based on metadata."""
        dataset_id = job_data["dataset_id"]
        tenant_id = job_data["tenant_id"]
        metadata = job_data["metadata"]
        ingestion_type = metadata.get("ingestion_type", "sync")

        try:
            if ingestion_type == "upload":
                # Path A: Vectorized File Ingestion (Raw S3 -> Parquet -> DuckDB Profile)
                await self._handle_file_upload(dataset_id, tenant_id, job_data["file_path"])
            else:
                # Path B: Zero-ETL Historical Sync (API Connector -> Polars -> S3)
                await self._handle_historical_sync(dataset_id, tenant_id, metadata)

            logger.info(f"✅ Successfully finalized Dataset {dataset_id}")

        except Exception as e:
            logger.error(f"❌ Job Failed for Dataset {dataset_id}: {str(e)}", exc_info=True)
            self._finalize_status(dataset_id, DatasetStatus.FAILED)
            
        finally:
            # Analytical Efficiency: Force release of C++/Rust memory buffers
            gc.collect()

    async def _handle_file_upload(self, dataset_id: str, tenant_id: str, raw_path: str):
        """Executes the heavy DuckDB conversion and profiling logic."""
        logger.info(f"[{tenant_id}] Starting vectorized profiling for: {raw_path}")
        
        with SessionLocal() as db:
            # 1. Execute heavy Cloud -> Compute -> Cloud transformation
            profile = storage_manager.convert_to_parquet_and_profile(db, tenant_id, raw_path)
            
            # 2. Update metadata with inferred columns and new analytical file path
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.file_path = profile["parquet_path"]
                dataset.schema_metadata = {
                    **dataset.schema_metadata,
                    "columns": profile.get("columns", []),
                    "status": "vectorized"
                }
                dataset.status = DatasetStatus.READY
                db.commit()

    async def _handle_historical_sync(self, dataset_id: str, tenant_id: str, metadata: Dict[str, Any]):
        """Executes the API polling and normalization engine."""
        integration_name = metadata.get("integration_name", "stripe")
        stream_name = metadata.get("stream_name", "subscriptions")
        start_ts = metadata.get("start_timestamp", "2020-01-01T00:00:00Z")

        # 1. Integration Factory: Rehydrate the correct connector class
        mock_credentials = {"access_token": "sk_test_123456789"} # Production: Fetch from secure Vault
        config = IntegrationConfig(tenant_id=tenant_id, integration_name=integration_name, credentials=mock_credentials)
        
        integration_registry = {
            "stripe": StripeIntegration,
            "shopify": ShopifyIntegration,
            "salesforce": SalesforceIntegration
        }
        
        integration_class = integration_registry.get(integration_name.lower())
        if not integration_class:
            raise ValueError(f"Integration '{integration_name}' is not supported by the worker.")
            
        integration_instance = integration_class(config=config)

        # 2. Execute Sync Engine (SyncEngine internally handles DB finalization)
        with SessionLocal() as db:
            sync_engine = get_sync_engine(db)
            await sync_engine.run_historical_sync(
                integration=integration_instance,
                dataset_id=dataset_id,
                stream_name=stream_name,
                start_timestamp=start_ts
            )

    def _finalize_status(self, dataset_id: str, status: DatasetStatus) -> None:
        """Brief session to update job failure state if an error occurs."""
        with SessionLocal() as db:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = status
                db.commit()

    async def _poll_and_execute(self) -> bool:
        """Main lifecycle orchestrator."""
        job_data = await self._poll_and_claim()
        if not job_data:
            return False 
        
        await self._execute_job(job_data)
        return True

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    worker = DataOmenComputeWorker()
    asyncio.run(worker.run())