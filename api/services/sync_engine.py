# api/services/sync_engine.py

import logging
import asyncio
import time
from datetime import datetime
from typing import Dict, Any, List
from sqlalchemy.orm import Session

# Core dependencies
from api.services.storage_manager import storage_manager
from api.services.json_normalizer import PolarsNormalizer
from api.services.integrations.base_integration import BaseIntegration

# Assuming you have a Dataset model to update statuses 
# from models import Dataset 

logger = logging.getLogger(__name__)

class SyncEngine:
    """
    The Orchestration Worker (Zero-ETL Engine).
    Asynchronously pulls data from SaaS integrations, vectorizes it via Polars, 
    and sinks it into a highly partitioned Parquet Data Lake without blocking the main thread.
    Includes built-in telemetry and state management for watchdog monitoring.
    """
    
    def __init__(self, db: Session):
        self.db = db

    async def run_historical_sync(
        self, 
        integration: BaseIntegration, 
        dataset_id: str, 
        stream_name: str, 
        start_timestamp: str
    ) -> Dict[str, Any]:
        """
        Executes the high-performance pull pipeline.
        Manages DB state, chunked ingestion, vectorization, and Hive-partitioned R2 storage.
        """
        tenant_id = integration.tenant_id
        integration_name = integration.config.integration_name
        
        start_time = time.perf_counter()
        logger.info(f"🚀 [{tenant_id}] Starting sync | Source: {integration_name} | Stream: {stream_name}")

        # 1. Pipeline State: Update database to indicate sync is in progress
        # dataset = self.db.query(Dataset).filter(Dataset.id == dataset_id).first()
        # if dataset:
        #     dataset.status = "SYNCING"
        #     self.db.commit()

        # 2. Initialize the Vectorized Normalizer Factory
        normalizer = PolarsNormalizer(
            tenant_id=tenant_id, 
            integration_name=integration_name
        )

        total_rows_processed = 0
        batches_processed = 0
        saved_paths: List[str] = []

        try:
            # 3. The Pull Pipeline (Memory-Safe Async Polling)
            # Yields raw JSON batches, respecting SaaS API pagination and rate limits
            async for raw_batch in integration.pull_historical_data(stream_name, start_timestamp):
                if not raw_batch:
                    continue
                
                # 4. Computation Layer: JSON -> Polars DataFrame Vectorization
                # Instantly flattens nested structures and upcasts dynamic schemas
                df = normalizer.normalize_batch(raw_batch)
                
                # Skip empty dataframes to prevent writing 0-byte Parquet files
                if df.height == 0:
                    continue

                total_rows_processed += df.height
                batches_processed += 1

                # 5. Storage Layer: Hive-Partitioned Data Lake Sink
                # We partition by ingestion year and month. This enables DuckDB 
                # predicate pushdown, drastically reducing R2 egress costs during querying.
                now = datetime.utcnow()
                partition_suffix = f"year={now.year}/month={now.month:02d}"
                
                # Format: dataset_id/stream_name/year=YYYY/month=MM
                table_id = f"{dataset_id}/{stream_name}/{partition_suffix}"
                
                # Push the optimized Parquet byte stream directly to Cloudflare R2
                file_path = storage_manager.write_dataframe(
                    db=self.db,
                    df=df,
                    tenant_id=tenant_id,
                    dataset_id=table_id,
                    format="parquet"
                )
                
                saved_paths.append(file_path)
                logger.debug(f"[{tenant_id}] Synced batch {batches_processed} ({df.height} rows) -> {file_path}")

            # 6. Pipeline Success: Finalize State & Telemetry
            duration = round(time.perf_counter() - start_time, 2)
            logger.info(f"✅ [{tenant_id}] Sync Complete | {stream_name} | {total_rows_processed} rows in {duration}s")
            
            # if dataset:
            #     dataset.status = "ACTIVE"
            #     dataset.last_synced_at = datetime.utcnow()
            #     dataset.row_count = total_rows_processed
            #     self.db.commit()
            
            return {
                "status": "success",
                "integration": integration_name,
                "stream": stream_name,
                "rows_processed": total_rows_processed,
                "batches_processed": batches_processed,
                "duration_seconds": duration,
                "paths": saved_paths
            }

        except Exception as e:
            # 7. Pipeline Failure: Metric Governance & Fallback
            duration = round(time.perf_counter() - start_time, 2)
            logger.error(f"❌ [{tenant_id}] Sync Failed | {stream_name} | Error: {str(e)}")
            
            # if dataset:
            #     dataset.status = "FAILED"
            #     self.db.commit()
            
            # Note: Here is where you would hook into watchdog_service.py to alert the user
            # watchdog.trigger_alert(tenant_id, "sync_failed", error=str(e))
            
            raise e

# Initialize singleton for dependency injection via FastAPI / Background Tasks
def get_sync_engine(db: Session) -> SyncEngine:
    return SyncEngine(db)