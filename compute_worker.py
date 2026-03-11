# compute_worker.py

import asyncio
import logging
import signal
import sys
from sqlalchemy.orm import Session

# Core Database & Models
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
    def __init__(self):
        self.is_running = True
        self.poll_interval = 5  # seconds

    def shutdown_handler(self, signum, frame):
        """Ensures we don't kill a Parquet conversion mid-flight when Render redeploys."""
        logger.warning(f"Received termination signal ({signum}). Gracefully shutting down...")
        self.is_running = False

    async def run(self):
        logger.info("🚀 Data Omen Compute Worker initialized and listening for jobs...")
        
        # Bind graceful shutdown signals (Render sends SIGTERM on deploy)
        signal.signal(signal.SIGINT, self.shutdown_handler)
        signal.signal(signal.SIGTERM, self.shutdown_handler)

        while self.is_running:
            try:
                # We await the execution of our poll loop
                processed_a_job = await self._poll_and_execute()
                
                # If we didn't process anything, sleep to prevent hammering the database
                if not processed_a_job and self.is_running:
                    await asyncio.sleep(self.poll_interval)
                    
            except Exception as e:
                logger.error(f"Critical Worker Loop Error: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval) # Sleep on error to prevent infinite crash loops
        
        logger.info("🛑 Worker shutdown complete. All heavy jobs finalized.")

    async def _poll_and_execute(self) -> bool:
        """
        Polls the database for PENDING jobs.
        Returns True if a job was processed, False if the queue is empty.
        """
        # Open a distinct, isolated database session for the worker
        with SessionLocal() as db:
            # ------------------------------------------------------------------
            # The Magic: Row-Level Locking
            # Using `with_for_update(skip_locked=True)` ensures that if we scale 
            # to 5 Render workers, they won't pick up the same job concurrently.
            # ------------------------------------------------------------------
            pending_dataset = db.query(Dataset).filter(
                Dataset.status == DatasetStatus.PENDING
            ).with_for_update(skip_locked=True).first()

            if not pending_dataset:
                return False 

            dataset_id = str(pending_dataset.id)
            tenant_id = pending_dataset.tenant_id
            logger.info(f"Acquired lock on Dataset {dataset_id} for Tenant {tenant_id}")

            try:
                # 1. Claim the job
                pending_dataset.status = DatasetStatus.PROCESSING
                db.commit()

                # 2. Rehydrate Integration & Credentials
                # NOTE: In production, `integration_name` and `stream_name` should be read from 
                # a dedicated SyncJob table or dataset metadata. We are hardcoding Stripe for the blueprint.
                integration_name = "stripe"
                stream_name = "subscriptions"
                
                # Retrieve from secure vault in production
                mock_credentials = {"access_token": "sk_test_123456789"} 

                integration_config = IntegrationConfig(
                    tenant_id=tenant_id,
                    integration_name=integration_name,
                    credentials=mock_credentials
                )
                
                integration_instance = StripeIntegration(config=integration_config)
                sync_engine = get_sync_engine(db)

                # 3. Execute the Heavy Compute Pipeline
                logger.info(f"[{tenant_id}] Starting Zero-ETL Sync: {integration_name} -> {stream_name}")
                
                # This execution can now safely take 5, 10, or 60 minutes without hitting Vercel's limits
                await sync_engine.run_historical_sync(
                    integration=integration_instance,
                    dataset_id=dataset_id,
                    stream_name=stream_name,
                    start_timestamp="2020-01-01T00:00:00Z" # Default historical floor
                )

                # 4. Mark Job as Complete
                # Note: sync_engine internally updates schemas and row counts
                pending_dataset.status = DatasetStatus.ACTIVE
                db.commit()
                
                logger.info(f"✅ Successfully processed and vectorized Dataset {dataset_id}")
                return True

            except Exception as e:
                logger.error(f"❌ Job Failed for Dataset {dataset_id}: {str(e)}", exc_info=True)
                db.rollback()
                
                # Re-fetch and mark the job as FAILED so the UI can surface the error to the user
                failed_job = db.query(Dataset).filter(Dataset.id == dataset_id).first()
                if failed_job:
                    failed_job.status = DatasetStatus.FAILED
                    # Ideally, save the stack trace to an 'error_logs' column here
                    db.commit()
                return True

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    worker = DataOmenComputeWorker()
    asyncio.run(worker.run())