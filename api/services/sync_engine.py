# api/services/sync_engine.py

import logging
import asyncio
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

# Core dependencies
from api.database import SessionLocal
from models import Dataset, DatasetStatus, Organization
from api.services.storage_manager import storage_manager
from api.services.json_normalizer import PolarsNormalizer
from api.services.integrations.base_integration import BaseIntegration
from api.services.watchdog_service import WatchdogService

logger = logging.getLogger(__name__)

class SyncEngine:
    """
    The Orchestration Worker (Zero-ETL Engine).
    Asynchronously pulls data from SaaS integrations, vectorizes it via Polars, 
    and sinks it into a highly partitioned Parquet Data Lake without blocking the main thread.
    """
    
    def __init__(self):
        """
        Removed the request-scoped DB dependency injection.
        Background workers must strictly manage their own connection lifecycles.
        """
        pass

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

        # 1. Background DB Lifecycle Management (Thread Safe)
        db = SessionLocal()
        # Initialize Watchdog locally to bind it to the thread-safe session
        watchdog = WatchdogService(db_client=db)

        try:
            # 2. Pipeline State: Update database to indicate sync is in progress
            dataset = db.query(Dataset).filter(
                Dataset.id == dataset_id,
                Dataset.tenant_id == tenant_id
            ).first()
            
            if dataset:
                dataset.status = DatasetStatus.PROCESSING
                db.commit()

            # 3. Initialize the Vectorized Normalizer Factory
            normalizer = PolarsNormalizer(
                tenant_id=tenant_id, 
                integration_name=integration_name
            )

            total_rows_processed = 0
            batches_processed = 0
            saved_paths: List[str] = []

            # 4. The Pull Pipeline (Memory-Safe Async Polling)
            # Yields raw JSON batches, respecting SaaS API pagination and rate limits
            async for raw_batch in integration.pull_historical_data(stream_name, start_timestamp):
                if not raw_batch:
                    continue
                
                # 5. Computation Layer: JSON -> Polars DataFrame Vectorization
                # Instantly flattens nested structures and upcasts dynamic schemas
                df = normalizer.normalize_batch(raw_batch)
                
                # Skip empty dataframes to prevent writing 0-byte Parquet files
                if df.height == 0:
                    continue

                total_rows_processed += df.height
                batches_processed += 1

                # 6. Storage Layer: Hive-Partitioned Data Lake Sink
                # We partition by ingestion year and month. This enables DuckDB 
                # predicate pushdown, drastically reducing egress costs during querying.
                now = datetime.now(timezone.utc)
                partition_suffix = f"year={now.year}/month={now.month:02d}"
                
                # Format: datasets/sync/{integration}/{stream}/year=YYYY/month=MM
                table_id = f"sync/{integration_name}/{stream_name}/{partition_suffix}"
                
                # Push the optimized Parquet byte stream directly to Cloudflare R2
                file_path = storage_manager.write_dataframe(
                    db=db,
                    df=df,
                    tenant_id=tenant_id,
                    dataset_id=table_id,
                    format="parquet"
                )
                
                saved_paths.append(file_path)
                logger.debug(f"[{tenant_id}] Synced batch {batches_processed} ({df.height} rows) -> {file_path}")

            # 7. Pipeline Success: Finalize State & Telemetry
            duration = round(time.perf_counter() - start_time, 2)
            logger.info(f"✅ [{tenant_id}] Sync Complete | {stream_name} | {total_rows_processed} rows in {duration}s")
            
            # Update the dataset with the final file paths and successful status
            if dataset:
                dataset.status = DatasetStatus.READY
                dataset.file_path = f"sync/{integration_name}/{stream_name}" # The root folder for DuckDB to scan
                dataset.updated_at = datetime.now(timezone.utc)
                
                # Add schema metadata if this was the final batch
                if batches_processed > 0:
                    profile = storage_manager.convert_to_parquet_and_profile(db, tenant_id, file_path)
                    dataset.schema_metadata = {"columns": profile.get("columns", [])}
                
                db.commit()

            # --- SaaS Billing Integration ---
            org = db.query(Organization).filter(Organization.id == tenant_id).first()
            if org and total_rows_processed > 0:
                # Add basic buffer storage calculation for the billing engine
                org.current_storage_mb += 2.0 
                db.commit()
            
            # --- THE WATCHDOG INJECTION ---
            # Fire-and-forget the math anomaly check so we don't block the API response
            asyncio.create_task(
                watchdog.inspect_pipeline(
                    tenant_id=tenant_id,
                    integration_id=integration_name,
                    latest_volume=total_rows_processed
                )
            )
            
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
            # 8. Pipeline Failure: State Management & Fallback
            duration = round(time.perf_counter() - start_time, 2)
            logger.error(f"❌ [{tenant_id}] Sync Failed | {stream_name} | Error: {str(e)}")
            
            if dataset:
                dataset.status = DatasetStatus.FAILED
                db.commit()
            
            # Watchdog Failure Alert Injection:
            if hasattr(watchdog, 'notifications') and watchdog.notifications:
                asyncio.create_task(
                    watchdog.notifications.dispatch_alert(
                        tenant_id=tenant_id,
                        alert_type="SYNC_ENGINE_HARD_CRASH",
                        metadata={"integration_id": integration_name, "error": str(e)}
                    )
                )
            
            raise e
            
        finally:
            # Ensure the connection is returned to the pool, preventing memory leaks
            db.close()

# Initialize factory for dependency injection via FastAPI / Background Tasks
def get_sync_engine(db: Session = None) -> SyncEngine:
    """
    Instantiates the SyncEngine. The `db` argument is kept for signature backwards 
    compatibility with routes, but is ignored to enforce background task safety.
    """
    return SyncEngine()