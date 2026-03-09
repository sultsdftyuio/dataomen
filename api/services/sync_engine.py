# api/services/sync_engine.py

import logging
import asyncio
from typing import Dict, Any
from sqlalchemy.orm import Session

from api.services.storage_manager import storage_manager
from api.services.json_normalizer import PolarsNormalizer
from api.services.integrations.base_integration import BaseIntegration

logger = logging.getLogger(__name__)

class SyncEngine:
    """
    The Orchestration Worker.
    Asynchronously pulls data from SaaS integrations, normalizes it via Polars, 
    and writes it to the Parquet Data Lake without blocking the main thread.
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
        Executes the end-to-end pull pipeline.
        """
        tenant_id = integration.tenant_id
        integration_name = integration.config.integration_name
        
        logger.info(f"[{tenant_id}] Starting sync for {integration_name} stream: {stream_name}")

        # 1. Initialize the Vectorized Normalizer
        normalizer = PolarsNormalizer(
            tenant_id=tenant_id, 
            integration_name=integration_name
        )

        total_rows_processed = 0
        saved_paths = []

        try:
            # 2. Pull raw data in asynchronous chunks (Pagination)
            # The async generator yields batches of JSON to prevent memory bloat
            async for raw_batch in integration.pull_historical_data(stream_name, start_timestamp):
                if not raw_batch:
                    continue
                
                # 3. Flatten and Normalize JSON -> Polars DataFrame
                df = normalizer.normalize_batch(raw_batch)
                
                # We skip empty dataframes
                if df.height == 0:
                    continue

                total_rows_processed += df.height

                # 4. Write to Cloudflare R2 Data Lake
                # We append the stream name to the dataset_id to keep tables separated (e.g., stripe_charges vs stripe_customers)
                table_id = f"{dataset_id}/{stream_name}"
                
                # Assuming the stream has an 'extracted_at' timestamp we could partition by, 
                # but for now we write directly to the stream folder.
                file_path = storage_manager.write_dataframe(
                    db=self.db,
                    df=df,
                    tenant_id=tenant_id,
                    dataset_id=table_id,
                    format="parquet"
                )
                
                saved_paths.append(file_path)
                logger.debug(f"[{tenant_id}] Synced batch of {df.height} rows for {stream_name}")

            logger.info(f"[{tenant_id}] Sync complete for {integration_name}/{stream_name}. Total rows: {total_rows_processed}")
            
            return {
                "status": "success",
                "integration": integration_name,
                "stream": stream_name,
                "rows_processed": total_rows_processed,
                "paths": saved_paths
            }

        except Exception as e:
            logger.error(f"[{tenant_id}] Sync failed for {integration_name}/{stream_name}: {str(e)}")
            # Note: In a production system, you would update the DB status to "failed" here
            raise e

# Initialize singleton for dependency injection
def get_sync_engine(db: Session) -> SyncEngine:
    return SyncEngine(db)