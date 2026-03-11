import asyncio
import logging
import signal
import sys
import gc
from typing import Optional, Dict, Any

# Core Database & Models
from sqlalchemy.orm import Session
from api.database import SessionLocal
from models import Dataset, DatasetStatus

# Core Infrastructure Orchestrators
from api.services.sync_engine import get_sync_engine
from api.services.integrations.base_integration import IntegrationConfig
from api.services.integrations.stripe_connector import StripeIntegration

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
    An always-on asynchronous worker designed for deployment on Render.
    Safely executes memory-heavy Polars/DuckDB ingestion pipelines outside 
    of the serverless web request cycle.
    """
    def __init__(self) -> None:
        self.is_running: bool = True
        self.poll_interval: int = 5  # seconds

    def shutdown_handler(self, signum: int, frame: Any) -> None:
        """Ensures we don't kill a Parquet conversion mid-flight when Render redeploys."""
        logger.warning(f"Received termination signal ({signum}). Gracefully shutting down...")
        self.is_running = False

    async def run(self) -> None:
        logger.info("🚀 Data Omen Compute Worker initialized and listening for jobs...")
        
        # Bind graceful shutdown signals (Render sends SIGTERM on deploy)
        signal.signal(signal.SIGINT, self.shutdown_handler)
        signal.signal(signal.SIGTERM, self.shutdown_handler)

        while self.is_running:
            try:
                processed_a_job = await self._poll_and_execute()
                
                # If queue is empty, sleep to prevent hammering the Supabase database
                if not processed_a_job and self.is_running:
                    await asyncio.sleep(self.poll_interval)
                    
            except Exception as e:
                logger.error(f"Critical Worker Loop Error: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval) # Sleep to prevent infinite crash loops
        
        logger.info("🛑 Worker shutdown complete. All heavy jobs finalized.")

    async def _poll_and_claim(self) -> Optional[Dict[str, str]]:
        """
        Phase 1: Briefly check out a DB connection to lock and claim a job.
        Closes the connection immediately after claiming to prevent pool exhaustion.
        """
        with SessionLocal() as db:
            pending_dataset = db.query(Dataset).filter(
                Dataset.status == DatasetStatus.PENDING
            ).with_for_update(skip_locked=True).first()

            if not pending_dataset:
                return None

            dataset_id = str(pending_dataset.id)
            tenant_id = str(pending_dataset.tenant_id)

            # Claim the job and commit to release the row lock instantly
            pending_dataset.status = DatasetStatus.PROCESSING
            db.commit()
            
            logger.info(f"Acquired lock on Dataset {dataset_id} for Tenant {tenant_id}")
            return {"dataset_id": dataset_id, "tenant_id": tenant_id}

    async def _finalize_job(self, dataset_id: str, status: DatasetStatus) -> None:
        """Phase 3: Briefly check out a DB connection to finalize the job."""
        with SessionLocal() as db:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = status
                db.commit()

    async def _execute_job(self, job_data: Dict[str, str]) -> None:
        """
        Phase 2: Execute the heavy analytical pipeline.
        This runs completely isolated from the main polling database connection.
        """
        dataset_id = job_data["dataset_id"]
        tenant_id = job_data["tenant_id"]

        try:
            # Rehydrate Integration & Credentials
            integration_name = "stripe"
            stream_name = "subscriptions"
            mock_credentials = {"access_token": "sk_test_123456789"} 

            integration_config = IntegrationConfig(
                tenant_id=tenant_id,
                integration_name=integration_name,
                credentials=mock_credentials
            )
            
            integration_instance = StripeIntegration(config=integration_config)
            
            # Spin up a dedicated, isolated session explicitly for the Sync Engine's internal writes
            with SessionLocal() as sync_db:
                sync_engine = get_sync_engine(sync_db)

                logger.info(f"[{tenant_id}] Starting Zero-ETL Sync: {integration_name} -> {stream_name}")
                
                # Execution can now safely take hours without crashing the API
                await sync_engine.run_historical_sync(
                    integration=integration_instance,
                    dataset_id=dataset_id,
                    stream_name=stream_name,
                    start_timestamp="2020-01-01T00:00:00Z"
                )

            # Mark Job as Complete
            await self._finalize_job(dataset_id, DatasetStatus.ACTIVE)
            logger.info(f"✅ Successfully processed and vectorized Dataset {dataset_id}")

        except Exception as e:
            logger.error(f"❌ Job Failed for Dataset {dataset_id}: {str(e)}", exc_info=True)
            await self._finalize_job(dataset_id, DatasetStatus.FAILED)
            
        finally:
            # Analytical Efficiency: Force garbage collection to prevent RAM bloat
            # after heavy Polars/DuckDB operations finish.
            gc.collect()

    async def _poll_and_execute(self) -> bool:
        """Orchestrates the lifecycle of a background job."""
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