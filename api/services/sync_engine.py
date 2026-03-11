import os
import logging
import asyncio
import time
import gc
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Union
import polars as pl

from fastapi import APIRouter, HTTPException, Request, Header, Depends, BackgroundTasks
from sqlalchemy.orm import Session

# Core dependencies (Modular Infrastructure)
from api.database import SessionLocal
from models import Dataset, Organization, DatasetStatus
from api.services.storage_manager import storage_manager
from api.services.json_normalizer import PolarsNormalizer
from api.services.data_sanitizer import DataSanitizer
from api.services.duckdb_validator import DuckDBValidator
from api.services.integrations.base_integration import BaseIntegration
from api.services.watchdog_service import WatchdogService

logger = logging.getLogger(__name__)

# FastAPI Router for the Core Compute Webhook Receiver
sync_router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])

class SyncEngine:
    """
    The Unified Orchestration Worker (Zero-ETL Engine).
    Refactored for Dual-Server Render Deployment (Web API + Background Worker).
    Ensures high-throughput processing without database connection pool exhaustion.
    """
    
    def __init__(self, tenant_id: str, integration_name: str):
        self.tenant_id = tenant_id
        self.integration_name = integration_name
        
        # Modular Strategy: stateless computation modules
        self.normalizer = PolarsNormalizer(tenant_id, integration_name)
        self.sanitizer = DataSanitizer(tenant_id, integration_name)
        self.validator = DuckDBValidator(tenant_id, integration_name)

    async def _run_qa_pipeline(self, raw_batch: List[Dict[str, Any]], expected_schema: Dict[str, Any], pii_columns: List[str]) -> pl.DataFrame:
        """
        The Execution Layer: Strictly in-memory computation.
        Uses Polars for C++ speed and DuckDB for schema enforcement.
        """
        # 1. Computation Layer: JSON -> Polars DataFrame Vectorization
        df = self.normalizer.normalize_batch(raw_batch)
        
        if df.height == 0:
            return df
            
        # 2. Privacy Guardrails: PII Hashing & Type Coercion
        df = self.sanitizer.process_batch(df, pii_columns=pii_columns, expected_schema=expected_schema)
        
        # 3. Security Gatekeeper: In-Memory DuckDB Validation
        self.validator.validate_batch(df, expected_schema)
        
        return df

    async def run_historical_sync(
        self, 
        integration: BaseIntegration, 
        dataset_id: str, 
        stream_name: str, 
        start_timestamp: str
    ) -> Dict[str, Any]:
        """
        The Pull Pipeline (Background Worker Server).
        Refactored to use short-lived DB sessions to prevent "Max Connections" errors on Supabase.
        """
        start_time = time.perf_counter()
        logger.info(f"🚀 [{self.tenant_id}] Starting historical sync | Source: {self.integration_name}")

        try:
            # 1. Set Initial State
            await self._update_dataset_status(dataset_id, DatasetStatus.PROCESSING)

            # 2. Contextual RAG schemas & PII config
            expected_schema = await integration.fetch_schema()
            stream_schema = expected_schema.get(stream_name.lower(), {})
            flat_schema = {f["name"]: f["type"] for f in stream_schema} if isinstance(stream_schema, list) else stream_schema
            pii_columns = ["email", "phone", "customer_email"]

            total_rows_processed = 0
            saved_paths: List[str] = []

            # 3. Memory-Safe Async Polling
            async for raw_batch in integration.sync_historical(stream_name, start_timestamp):
                if not raw_batch:
                    continue
                
                # Execute QA Compute Pipeline (Heavy CPU)
                df = await self._run_qa_pipeline(raw_batch, flat_schema, pii_columns)
                if df.height == 0:
                    continue

                # 4. Storage Layer: Hive-Partitioned Sink
                now = datetime.now(timezone.utc)
                partition_suffix = f"year={now.year}/month={now.month:02d}"
                table_id = f"sync/{self.integration_name}/{stream_name}/{partition_suffix}"
                
                # Discrete DB session for file-write metadata only
                with SessionLocal() as db:
                    file_path = storage_manager.write_dataframe(
                        db=db, df=df, tenant_id=self.tenant_id, 
                        dataset_id=table_id, format="parquet"
                    )
                
                total_rows_processed += df.height
                saved_paths.append(file_path)
                
                # Analytical Efficiency: Immediate RAM cleanup
                del df
                gc.collect()

            # 5. Finalize State & Telemetry
            duration = round(time.perf_counter() - start_time, 2)
            await self._finalize_sync_metadata(dataset_id, total_rows_processed, duration, saved_paths)
            
            # 6. Watchdog Telemetry
            with SessionLocal() as db:
                watchdog = WatchdogService(db_client=db)
                asyncio.create_task(
                    watchdog.inspect_pipeline(
                        tenant_id=self.tenant_id,
                        integration_id=self.integration_name,
                        latest_volume=total_rows_processed
                    )
                )

            return {"status": "success", "rows_processed": total_rows_processed}

        except Exception as e:
            logger.error(f"❌ Sync Failed for {dataset_id}: {str(e)}")
            await self._update_dataset_status(dataset_id, DatasetStatus.FAILED)
            raise e

    async def _update_dataset_status(self, dataset_id: str, status: DatasetStatus):
        """Short-lived transaction for state updates."""
        with SessionLocal() as db:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = status
                db.commit()

    async def _finalize_sync_metadata(self, dataset_id: str, total_rows: int, duration: float, paths: List[str]):
        """Consolidated metadata and billing update in a single DB transaction."""
        with SessionLocal() as db:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = DatasetStatus.READY
                dataset.file_path = f"sync/{self.integration_name}" # Root directory for partitioned dataset
                dataset.updated_at = datetime.now(timezone.utc)
                
                if total_rows > 0 and paths:
                    # Profile the last batch to update the schema in the UI
                    profile = storage_manager.convert_to_parquet_and_profile(db, self.tenant_id, paths[-1])
                    dataset.schema_metadata = {"columns": profile.get("columns", [])}
            
            # Organization Billing: 1.5MB per 10k rows (ZSTD compressed Parquet estimate)
            org = db.query(Organization).filter(Organization.id == self.tenant_id).first()
            if org and total_rows > 0:
                estimated_mb = (total_rows / 10000.0) * 1.5
                org.current_storage_mb = (org.current_storage_mb or 0.0) + estimated_mb
            
            db.commit()

# -----------------------------------------------------------------------------
# API Endpoints (The Push Pipeline - Cloudflare Webhook Receiver)
# -----------------------------------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@sync_router.post("/{integration_name}/webhook-batch")
async def ingest_webhook_batch(
    integration_name: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_internal_secret: str = Header(None)
):
    """
    Receives grouped batches from the Cloudflare Edge Worker.
    Runs on the Web API Server.
    """
    # Security by Design: Verify secret is correctly injected via Cloudflare -> Render
    if x_internal_secret != os.environ.get("INTERNAL_ROUTING_SECRET"):
        logger.critical(f"Security Alert: Unauthorized webhook attempt on {integration_name}")
        raise HTTPException(status_code=403, detail="Edge verification failed.")

    payload = await request.json()
    tenant_id = payload.get("tenant_id")
    events = payload.get("events", [])
    
    engine = SyncEngine(tenant_id, integration_name)
    
    # Contextual RAG: Mocked schemas for push pipeline
    expected_schema = {"id": "string", "amount": "double", "email": "string"}
    pii_columns = ["email"]
    
    try:
        raw_events = [event.get("payload", {}) for event in events]
        df = await engine._run_qa_pipeline(raw_events, expected_schema, pii_columns)
        
        if df.height > 0:
            # Vectorized live append
            partition = f"year={datetime.now(timezone.utc).year}/month={datetime.now(timezone.utc).month:02d}"
            table_id = f"sync/{integration_name}/live_webhooks/{partition}"
            
            storage_manager.write_dataframe(
                db=db, df=df, tenant_id=tenant_id, dataset_id=table_id, format="parquet"
            )
        
        return {"status": "success", "rows": df.height}
        
    except Exception as e:
        logger.error(f"Webhook ingestion failure: {str(e)}")
        raise HTTPException(status_code=500, detail="Compute engine ingestion anomaly.")