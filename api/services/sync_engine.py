# api/services/sync_engine.py

import os
import logging
import asyncio
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import polars as pl

from fastapi import APIRouter, HTTPException, Request, Header, Depends, BackgroundTasks

# Core dependencies
from api.database import SessionLocal
from models import Dataset, Organization # Assuming DatasetStatus is an Enum or String on Dataset
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
    Phases 6, 7 & 8: The Unified Orchestration Worker (Zero-ETL Engine).
    Handles both high-throughput Historical Syncs (pull) and Real-Time Webhooks (push).
    Enforces C++ Vectorization, Cryptographic PII Hashing, and strict DuckDB typing.
    """
    
    def __init__(self, tenant_id: str, integration_name: str):
        self.tenant_id = tenant_id
        self.integration_name = integration_name
        
        # Initialize the Hybrid Performance Pipeline components
        self.normalizer = PolarsNormalizer(tenant_id, integration_name)
        self.sanitizer = DataSanitizer(tenant_id, integration_name)
        self.validator = DuckDBValidator(tenant_id, integration_name)

    async def _run_qa_pipeline(self, raw_batch: List[Dict[str, Any]], expected_schema: Dict[str, Any], pii_columns: List[str]) -> pl.DataFrame:
        """
        The Core Compute Layer.
        Executes normalization, sanitization, and DuckDB validation strictly in-memory.
        """
        # 1. Computation Layer: JSON -> Polars DataFrame Vectorization
        df = self.normalizer.normalize_batch(raw_batch)
        
        if df.height == 0:
            return df
            
        # 2. Privacy & Schema Guardrails: PII Hashing & Type Coercion
        df = self.sanitizer.process_batch(df, pii_columns=pii_columns, expected_schema=expected_schema)
        
        # 3. Security Gatekeeper: In-Memory DuckDB Tenant & Type Validation
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
        The Pull Pipeline.
        Manages DB state, chunked ingestion, vectorization, and Hive-partitioned R2 storage.
        """
        start_time = time.perf_counter()
        logger.info(f"🚀 [{self.tenant_id}] Starting historical sync | Source: {self.integration_name} | Stream: {stream_name}")

        # Thread-Safe DB Lifecycle Management
        db = SessionLocal()
        watchdog = WatchdogService(db_client=db)

        try:
            # 1. Pipeline State: Update database to indicate sync is in progress
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.tenant_id == self.tenant_id).first()
            if dataset:
                dataset.status = "PROCESSING"
                db.commit()

            # Contextual RAG schemas & PII config (Mocked retrieval, should come from DB)
            expected_schema = await integration.fetch_schema()
            stream_schema = expected_schema.get(stream_name.lower(), {})
            # Transform schema graph format to simple Dict[col, type] for the validator
            flat_schema = {f["name"]: f["type"] for f in stream_schema} if isinstance(stream_schema, list) else stream_schema
            pii_columns = ["email", "phone", "customer_email"]

            total_rows_processed = 0
            batches_processed = 0
            saved_paths: List[str] = []

            # 2. Memory-Safe Async Polling (Using the Phase 1.1 updated method)
            async for raw_batch in integration.sync_historical(stream_name, start_timestamp):
                if not raw_batch:
                    continue
                
                # 3. Execute QA Compute Pipeline
                df = await self._run_qa_pipeline(raw_batch, flat_schema, pii_columns)
                
                if df.height == 0:
                    continue

                total_rows_processed += df.height
                batches_processed += 1

                # 4. Storage Layer: Hive-Partitioned Data Lake Sink
                now = datetime.now(timezone.utc)
                partition_suffix = f"year={now.year}/month={now.month:02d}"
                table_id = f"sync/{self.integration_name}/{stream_name}/{partition_suffix}"
                
                file_path = storage_manager.write_dataframe(
                    db=db,
                    df=df,
                    tenant_id=self.tenant_id,
                    dataset_id=table_id,
                    format="parquet"
                )
                
                saved_paths.append(file_path)
                logger.debug(f"[{self.tenant_id}] Synced batch {batches_processed} ({df.height} rows) -> {file_path}")

            # 5. Finalize State & Telemetry
            duration = round(time.perf_counter() - start_time, 2)
            logger.info(f"✅ [{self.tenant_id}] Sync Complete | {stream_name} | {total_rows_processed} rows in {duration}s")
            
            if dataset:
                dataset.status = "READY"
                dataset.file_path = f"sync/{self.integration_name}/{stream_name}" 
                dataset.updated_at = datetime.now(timezone.utc)
                
                if batches_processed > 0 and saved_paths:
                    profile = storage_manager.convert_to_parquet_and_profile(db, self.tenant_id, saved_paths[-1])
                    dataset.schema_metadata = {"columns": profile.get("columns", [])}
                
                db.commit()

            # --- SaaS Billing Integration ---
            org = db.query(Organization).filter(Organization.id == self.tenant_id).first()
            if org and total_rows_processed > 0:
                # Add buffer storage calculation for the billing engine (Assume roughly 1MB per 10k highly compressed Parquet rows)
                estimated_mb = (total_rows_processed / 10000.0) * 1.5
                org.current_storage_mb = (getattr(org, 'current_storage_mb', 0.0) or 0.0) + estimated_mb
                db.commit()
            
            # --- THE WATCHDOG INJECTION ---
            asyncio.create_task(
                watchdog.inspect_pipeline(
                    tenant_id=self.tenant_id,
                    integration_id=self.integration_name,
                    latest_volume=total_rows_processed
                )
            )
            
            return {
                "status": "success", "integration": self.integration_name, "stream": stream_name,
                "rows_processed": total_rows_processed, "duration_seconds": duration, "paths": saved_paths
            }

        except Exception as e:
            logger.error(f"❌ [{self.tenant_id}] Sync Failed | {stream_name} | Error: {str(e)}")
            if 'dataset' in locals() and dataset:
                dataset.status = "FAILED"
                db.commit()
            
            if hasattr(watchdog, 'notifications') and watchdog.notifications:
                asyncio.create_task(
                    watchdog.notifications.dispatch_alert(
                        tenant_id=self.tenant_id, alert_type="SYNC_ENGINE_HARD_CRASH",
                        metadata={"integration_id": self.integration_name, "error": str(e)}
                    )
                )
            raise e
        finally:
            db.close()

# -----------------------------------------------------------------------------
# API Endpoints (The Push Pipeline - Cloudflare Webhook Receiver)
# -----------------------------------------------------------------------------

def verify_internal_routing_secret(x_internal_secret: str = Header(None)):
    """Security Check: Ensures payload comes explicitly from our Cloudflare Edge Worker."""
    expected_secret = os.environ.get("INTERNAL_ROUTING_SECRET")
    if not expected_secret or x_internal_secret != expected_secret:
        logger.critical("Unauthorized Compute access. Invalid Cloudflare internal secret.")
        raise HTTPException(status_code=403, detail="Forbidden: Edge verification failed.")

@sync_router.post("/{integration_name}/webhook-batch")
async def ingest_webhook_batch(
    integration_name: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_internal_secret: str = Depends(verify_internal_routing_secret),
    x_trigger_agents: str = Header(None)
):
    """
    Receives grouped, homogenous batches directly from the Cloudflare Queue.
    Instantly processes them through the QA pipeline and appends to Parquet.
    """
    payload = await request.json()
    tenant_id = payload.get("tenant_id")
    events = payload.get("events", [])
    
    if not tenant_id or not events:
        raise HTTPException(status_code=400, detail="Missing tenant_id or events payload.")
        
    engine = SyncEngine(tenant_id, integration_name)
    
    # In a fully wired application, fetch schemas dynamically. Mocking for now.
    expected_schema = {"id": "string", "amount": "double", "email": "string"}
    pii_columns = ["email", "phone"]
    
    try:
        raw_events = [event.get("payload", {}) for event in events]
        df = await engine._run_qa_pipeline(raw_events, expected_schema, pii_columns)
        
        if df.height > 0:
            db = SessionLocal()
            try:
                # Append the micro-batch to the "live" partition
                partition = f"year={datetime.now(timezone.utc).year}/month={datetime.now(timezone.utc).month:02d}"
                table_id = f"sync/{integration_name}/live_webhooks/{partition}"
                
                storage_manager.write_dataframe(
                    db=db, df=df, tenant_id=tenant_id, dataset_id=table_id, format="parquet"
                )
            finally:
                db.close()
        
        # Phase 4: Event-Driven Agent Triggers
        if x_trigger_agents == "true":
            background_tasks.add_task(
                _notify_agents_of_fresh_data, 
                tenant_id=tenant_id, integration=integration_name, new_records_count=df.height
            )
            
        return {"status": "success", "rows_processed": df.height}
        
    except Exception as e:
        # Returning a 500 signals Cloudflare to route this batch to the R2 Dead Letter Queue
        logger.error(f"[{tenant_id}] Webhook ingestion crashed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def _notify_agents_of_fresh_data(tenant_id: str, integration: str, new_records_count: int):
    """Signals the Semantic Router / Agents to look for new insights."""
    logger.info(f"[{tenant_id}] AI Alert: {new_records_count} new {integration} records available.")
    # await agent_service.evaluate_new_data(tenant_id, integration)