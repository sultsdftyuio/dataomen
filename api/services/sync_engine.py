import os
import logging
import asyncio
import time
import gc
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Type

import polars as pl
from fastapi import APIRouter, HTTPException, Request, Header, Depends, BackgroundTasks, status
from sqlalchemy.orm import Session

# Core dependencies (Modular Infrastructure)
from api.database import get_db, SessionLocal
from models import Dataset, Organization, DatasetStatus
from api.auth import verify_tenant, TenantContext

from api.services.storage_manager import storage_manager
from api.services.json_normalizer import PolarsNormalizer
from api.services.data_sanitizer import DataSanitizer
from api.services.duckdb_validator import DuckDBValidator
from api.services.watchdog_service import WatchdogService
from api.services.credential_manager import CredentialManager

# Phase 3: SaaS Integration Connectors
from api.services.integrations.base_integration import BaseIntegration
from api.services.integrations.stripe_connector import StripeConnector
from api.services.integrations.salesforce_connector import SalesforceConnector
from api.services.integrations.shopify_connector import ShopifyConnector

logger = logging.getLogger(__name__)

# FastAPI Router for the Core Compute Webhook & Sync Receiver
sync_router = APIRouter(prefix="/api/ingest", tags=["Ingestion", "Sync"])

# -----------------------------------------------------------------------------
# Integration Registry (Modular Strategy)
# -----------------------------------------------------------------------------
INTEGRATION_REGISTRY: Dict[str, Type[BaseIntegration]] = {
    "stripe": StripeConnector,
    "salesforce": SalesforceConnector,
    "shopify": ShopifyConnector,
}

class SyncEngine:
    """
    The Unified Orchestration Worker (Zero-ETL Engine).
    
    Upgraded Engineering:
    - Integration Registry: Dynamically instantiates API connectors.
    - Secure Credential Injection: Vaults API keys via CredentialManager.
    - Schema Evolution Guard: Strictly casts Polars DataFrames to prevent Parquet chunk mismatches.
    - Async Chunking: Prevents RAM OOM on massive historical SaaS syncs.
    """
    
    def __init__(self, db_session: Optional[Session] = None):
        self.db_session = db_session

    async def _run_qa_pipeline(
        self, 
        tenant_id: str, 
        integration_name: str, 
        raw_batch: List[Dict[str, Any]], 
        expected_schema: Dict[str, Any], 
        pii_columns: List[str]
    ) -> pl.DataFrame:
        """
        The Execution Layer: Strictly in-memory computation.
        Uses Polars for C++ speed and DuckDB for schema enforcement.
        """
        normalizer = PolarsNormalizer(tenant_id, integration_name)
        sanitizer = DataSanitizer(tenant_id, integration_name)
        validator = DuckDBValidator(tenant_id, integration_name)

        # 1. Computation Layer: JSON -> Polars DataFrame Vectorization
        df = normalizer.normalize_batch(raw_batch)
        
        if df.height == 0:
            return df
            
        # 2. Privacy Guardrails: PII Hashing & Type Coercion
        df = sanitizer.process_batch(df, pii_columns=pii_columns, expected_schema=expected_schema)
        
        # 3. Security Gatekeeper: In-Memory DuckDB Validation
        validator.validate_batch(df, expected_schema)
        
        return df

    async def run_historical_sync(
        self, 
        tenant_id: str,
        integration_name: str, 
        dataset_id: str, 
        stream_name: str, 
        start_timestamp: str
    ) -> None:
        """
        The Pull Pipeline (Background Worker Server).
        Uses short-lived DB sessions to prevent Supabase connection pool exhaustion.
        """
        start_time = time.perf_counter()
        logger.info(f"🚀 [{tenant_id}] Starting historical sync | Source: {integration_name} | Stream: {stream_name}")

        try:
            # 1. Dynamically Load Connector & Secure Credentials
            if integration_name not in INTEGRATION_REGISTRY:
                raise ValueError(f"Unsupported integration requested: {integration_name}")
            
            with SessionLocal() as db:
                cred_manager = CredentialManager(db)
                api_keys = cred_manager.get_integration_credentials(tenant_id, integration_name)
                
            if not api_keys:
                raise PermissionError(f"Missing or expired credentials for {integration_name}")

            integration_class = INTEGRATION_REGISTRY[integration_name]
            integration = integration_class(tenant_id=tenant_id, credentials=api_keys) 

            # 2. Set Initial State
            await self._update_dataset_status(dataset_id, DatasetStatus.PROCESSING)

            # 3. Contextual RAG schemas & PII config
            expected_schema = await integration.fetch_schema()
            stream_schema = expected_schema.get(stream_name.lower(), {})
            flat_schema = {f["name"]: f["type"] for f in stream_schema} if isinstance(stream_schema, list) else stream_schema
            pii_columns = getattr(integration, "PII_COLUMNS", ["email", "phone", "customer_email"])

            total_rows_processed = 0
            saved_paths: List[str] = []

            # 4. Memory-Safe Async Polling (Yields chunked arrays from the SaaS API)
            async for raw_batch in integration.sync_historical(stream_name, start_timestamp):
                if not raw_batch:
                    continue
                
                # Execute QA Compute Pipeline (Heavy CPU)
                df = await self._run_qa_pipeline(
                    tenant_id=tenant_id, 
                    integration_name=integration_name,
                    raw_batch=raw_batch, 
                    expected_schema=flat_schema, 
                    pii_columns=pii_columns
                )
                
                if df.height == 0:
                    continue

                # 5. Storage Layer: Hive-Partitioned Sink
                now = datetime.now(timezone.utc)
                partition_suffix = f"year={now.year}/month={now.month:02d}"
                table_id = f"sync/{integration_name}/{stream_name}/{partition_suffix}"
                
                # Discrete DB session for file-write metadata only
                with SessionLocal() as db:
                    file_path = storage_manager.write_dataframe(
                        db=db, df=df, tenant_id=tenant_id, 
                        dataset_id=table_id, format="parquet"
                    )
                
                total_rows_processed += df.height
                saved_paths.append(file_path)
                
                # Analytical Efficiency: Immediate RAM cleanup for large syncs
                del df
                gc.collect()

            # 6. Finalize State & Telemetry
            duration = round(time.perf_counter() - start_time, 2)
            await self._finalize_sync_metadata(
                tenant_id, integration_name, dataset_id, total_rows_processed, duration, saved_paths
            )
            
            # 7. Watchdog Telemetry (Anomaly detection on row volumes)
            with SessionLocal() as db:
                watchdog = WatchdogService(db_client=db)
                asyncio.create_task(
                    watchdog.inspect_pipeline(
                        tenant_id=tenant_id,
                        integration_id=integration_name,
                        latest_volume=total_rows_processed
                    )
                )

            logger.info(f"✅ [{tenant_id}] Sync Complete | {total_rows_processed} rows in {duration}s")

        except Exception as e:
            logger.error(f"❌ [{tenant_id}] Sync Failed for {dataset_id}: {str(e)}")
            await self._update_dataset_status(dataset_id, DatasetStatus.FAILED)


    # --- Metadata Helpers ---

    async def _update_dataset_status(self, dataset_id: str, status: DatasetStatus):
        with SessionLocal() as db:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = status
                db.commit()

    async def _finalize_sync_metadata(
        self, tenant_id: str, integration_name: str, dataset_id: str, total_rows: int, duration: float, paths: List[str]
    ):
        with SessionLocal() as db:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = DatasetStatus.READY
                dataset.file_path = f"sync/{integration_name}" # Root directory for partitioned dataset
                dataset.updated_at = datetime.now(timezone.utc)
                
                if total_rows > 0 and paths:
                    profile = storage_manager.convert_to_parquet_and_profile(db, tenant_id, paths[-1])
                    dataset.schema_metadata = {"columns": profile.get("columns", [])}
            
            # Storage Metering Update
            org = db.query(Organization).filter(Organization.id == tenant_id).first()
            if org and total_rows > 0:
                estimated_mb = (total_rows / 10000.0) * 1.5
                org.current_storage_mb = (org.current_storage_mb or 0.0) + estimated_mb
            
            db.commit()


# -----------------------------------------------------------------------------
# Dependency Injection & Factory Methods
# -----------------------------------------------------------------------------

def get_sync_engine(db: Optional[Session] = None) -> SyncEngine:
    return SyncEngine(db_session=db)

# -----------------------------------------------------------------------------
# API Endpoints
# -----------------------------------------------------------------------------

@sync_router.post("/trigger/{dataset_id}")
async def trigger_historical_sync(
    dataset_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(verify_tenant)
):
    """
    The Frontend Trigger.
    Initiates an asynchronous historical data pull from a 3rd party SaaS.
    """
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id, 
        Dataset.tenant_id == tenant.tenant_id
    ).first()

    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")
        
    if not dataset.integration_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dataset is not linked to a SaaS integration.")

    engine = get_sync_engine(db)
    
    # 1. Update UI to show "Syncing..."
    dataset.status = DatasetStatus.PROCESSING
    db.commit()

    # 2. Hand off the heavy I/O polling to a background worker thread
    background_tasks.add_task(
        engine.run_historical_sync,
        tenant_id=tenant.tenant_id,
        integration_name=dataset.integration_name,
        dataset_id=dataset_id,
        stream_name=dataset.stream_name or "default",
        start_timestamp="2024-01-01T00:00:00Z" # In production, pull from last_sync_time
    )

    return {"status": "sync_queued", "message": f"Historical pull for {dataset.integration_name} initiated in background."}


@sync_router.post("/{integration_name}/webhook-batch")
async def ingest_webhook_batch(
    integration_name: str,
    request: Request,
    db: Session = Depends(get_db),
    x_internal_secret: str = Header(None)
):
    """
    The Push Pipeline.
    Receives grouped real-time batches from the Cloudflare Edge Worker.
    Dynamically maps incoming webhooks to the correct Polars schemas.
    """
    if x_internal_secret != os.environ.get("INTERNAL_ROUTING_SECRET"):
        logger.critical(f"Security Alert: Unauthorized webhook attempt on {integration_name}")
        raise HTTPException(status_code=403, detail="Edge verification failed.")

    payload = await request.json()
    tenant_id = payload.get("tenant_id")
    events = payload.get("events", [])
    stream_name = payload.get("stream_name", "default")
    
    if not tenant_id or not events:
        return {"status": "skipped", "message": "Empty payload."}
        
    if integration_name not in INTEGRATION_REGISTRY:
        raise HTTPException(status_code=400, detail="Invalid integration target.")
    
    engine = get_sync_engine(db)
    
    # Dynamic Contextual RAG Schema Loading
    integration_class = INTEGRATION_REGISTRY[integration_name]
    integration_instance = integration_class(tenant_id=tenant_id, credentials={})
    expected_schemas_map = await integration_instance.fetch_schema()
    
    stream_schema = expected_schemas_map.get(stream_name, {})
    flat_schema = {f["name"]: f["type"] for f in stream_schema} if isinstance(stream_schema, list) else stream_schema
    pii_columns = getattr(integration_instance, "PII_COLUMNS", ["email", "phone", "customer_email"])
    
    try:
        raw_events = [event.get("payload", {}) for event in events]
        df = await engine._run_qa_pipeline(
            tenant_id=tenant_id, 
            integration_name=integration_name,
            raw_batch=raw_events, 
            expected_schema=flat_schema, 
            pii_columns=pii_columns
        )
        
        if df.height > 0:
            partition = f"year={datetime.now(timezone.utc).year}/month={datetime.now(timezone.utc).month:02d}"
            table_id = f"sync/{integration_name}/live_webhooks/{partition}"
            
            storage_manager.write_dataframe(
                db=db, df=df, tenant_id=tenant_id, dataset_id=table_id, format="parquet"
            )
        
        return {"status": "success", "rows": df.height}
        
    except Exception as e:
        logger.error(f"Webhook ingestion failure for {integration_name}: {str(e)}")
        raise HTTPException(status_code=500, detail="Compute engine ingestion anomaly.")