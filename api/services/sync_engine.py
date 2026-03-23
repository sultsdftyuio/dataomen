"""
ARCLI.TECH - Zero-ETL Orchestration Module
Component: SyncEngine (The Conductor)
Strategy: Hybrid Performance Paradigm, Strict Memory Governance, & DataFast "Instant Value"

Changelog (v3 - Indie Hacker Edition):
- DASHBOARDS: Auto-seeds connector-level semantic views (MRR, Churn, etc.) instantly on connection.
- SECURITY: Dynamically injects DataSanitizer into connectors to enforce Edge-level PII masking.
- ROBUSTNESS: Enhanced webhook batch processing with dynamic schema mapping caching.
- ARCH: Maintains OOM-safe Polars batching and DuckDB strict schema validation.
"""

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

# Core Infrastructure
from api.database import get_db, SessionLocal
from models import Dataset, Organization, DatasetStatus, SemanticMetric
from api.auth import verify_tenant, TenantContext

# Modular Services
from api.services.storage_manager import storage_manager
from api.services.json_normalizer import PolarsNormalizer
from api.services.data_sanitizer import DataSanitizer
from api.services.duckdb_validator import DuckDBValidator
from api.services.watchdog_service import WatchdogService
from api.services.credential_manager import CredentialManager
from api.services.llm_client import llm_client 

# --- Integration Registry Imports ---
from api.services.integrations.base_integration import BaseIntegration

# SaaS & CRM
from api.services.integrations.stripe_connector import StripeConnector
from api.services.integrations.salesforce_connector import SalesforceConnector
from api.services.integrations.shopify_connector import ShopifyConnector
from api.services.integrations.hubspot_connector import HubSpotConnector
from api.services.integrations.zendesk_connector import ZendeskConnector

# Cloud Data Warehouses
from api.services.integrations.snowflake_connector import SnowflakeConnector
from api.services.integrations.redshift_connector import RedshiftConnector
from api.services.integrations.bigquery_connector import BigQueryConnector

# Performance Marketing
from api.services.integrations.google_ads_connector import GoogleAdsConnector
from api.services.integrations.meta_ads_connector import MetaAdsConnector

logger = logging.getLogger(__name__)

# FastAPI Router for the Core Compute Webhook & Sync Receiver
sync_router = APIRouter(prefix="/api/ingest", tags=["Ingestion", "Sync"])

# -----------------------------------------------------------------------------
# Integration Registry (The Dispatcher)
# -----------------------------------------------------------------------------
INTEGRATION_REGISTRY: Dict[str, Type[BaseIntegration]] = {
    # Financial & E-commerce
    "stripe": StripeConnector,
    "shopify": ShopifyConnector,
    
    # CRM & Operations
    "salesforce": SalesforceConnector,
    "hubspot": HubSpotConnector,
    "zendesk": ZendeskConnector,
    
    # Performance Marketing (Marketing Mix Modeling)
    "google_ads": GoogleAdsConnector,
    "meta_ads": MetaAdsConnector,
    
    # Enterprise Data Warehouses
    "snowflake": SnowflakeConnector,
    "redshift": RedshiftConnector,
    "bigquery": BigQueryConnector,
}

class SyncEngine:
    """
    The Unified Orchestration Worker (Zero-ETL Engine).
    
    Upgraded Engineering:
    - Dynamic Instantiation: Pluggable API connectors.
    - Secure Credential Injection: Vaults API keys via CredentialManager.
    - Schema Evolution Guard: Validates against DuckDB contracts before Parquet writes.
    - Async Chunking: Yields Polars DataFrames sequentially to prevent RAM OOM.
    - Instant Dashboards: Automatically writes cross-platform formulas (True ROAS) and
      connector-native views (Stripe MRR/Churn) instantly to the RAG database.
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
        Note: PII masking may have already occurred at the connector level,
        but we pass it through the sanitizer here for defense-in-depth on generic webhooks.
        """
        normalizer = PolarsNormalizer(tenant_id, integration_name)
        sanitizer = DataSanitizer(tenant_id, integration_name)
        validator = DuckDBValidator(tenant_id, integration_name)

        # 1. Computation Layer: JSON -> Polars DataFrame Vectorization
        df = normalizer.normalize_batch(raw_batch)
        
        if df.height == 0:
            return df
            
        # 2. Privacy Guardrails: PII Cryptographic Hashing (Defense-in-depth)
        df = sanitizer.process_batch(df, pii_columns=pii_columns, expected_schema=expected_schema)
        
        # 3. Security Gatekeeper: In-Memory DuckDB Validation
        # Raises an exception if the dataframe violates the connector's schema contract
        validator.validate_batch(df, expected_schema)
        
        return df

    def seed_connector_views(self, tenant_id: str, integration: BaseIntegration) -> None:
        """
        Phase 2: "Starter Pack" Auto-Seeding.
        Extracts pre-built SQL views (MRR, Churn, Signups) from the connected integration 
        and registers them into the Semantic RAG layer so the founder has an instant dashboard.
        """
        try:
            views = integration.get_semantic_views()
            if not views:
                return

            with SessionLocal() as db:
                for view_name, sql in views.items():
                    # Check if view already exists to prevent duplicate seeding
                    exists = db.query(SemanticMetric).filter(
                        SemanticMetric.tenant_id == tenant_id,
                        SemanticMetric.metric_name == view_name
                    ).first()

                    if not exists:
                        metric = SemanticMetric(
                            tenant_id=tenant_id,
                            dataset_id=None,  # Global metric view spanning multiple tables
                            metric_name=view_name,
                            description=f"Auto-generated semantic dashboard view for {integration.config.integration_name.capitalize()}",
                            compiled_sql=sql.strip(),
                            created_at=datetime.utcnow()
                        )
                        db.add(metric)
                db.commit()
                logger.info(f"[{tenant_id}] 📊 Auto-seeded {len(views)} starter-pack metrics for {integration.config.integration_name}.")
        except Exception as e:
            logger.error(f"[{tenant_id}] Failed to seed connector views for {integration.config.integration_name}: {e}")

    def seed_golden_metrics(self, tenant_id: str) -> None:
        """
        Phase 2: Backend - Auto-Seeding Cross-Platform "Golden Metrics".
        When a user connects both Revenue (Stripe/Shopify) and Spend (Meta/Google),
        this module automatically writes deterministic "True ROAS".
        """
        try:
            with SessionLocal() as db:
                # 1. Check if the "True ROAS" golden metric is already seeded
                existing_roas = db.query(SemanticMetric).filter(
                    SemanticMetric.tenant_id == tenant_id,
                    SemanticMetric.metric_name == "True ROAS"
                ).first()

                if existing_roas:
                    return # Already seeded

                # 2. Check for the existence of required multi-platform datasets
                datasets = db.query(Dataset).filter(Dataset.tenant_id == tenant_id).all()
                
                revenue_sources = [d for d in datasets if d.integration_name in ['stripe', 'shopify']]
                spend_sources = [d for d in datasets if d.integration_name in ['meta_ads', 'google_ads']]

                if not revenue_sources or not spend_sources:
                    return # Missing prerequisites to calculate True ROAS

                # Pick primary sources for the initial cross-join template
                rev_ds = revenue_sources[0]
                spend_ds = spend_sources[0]

                # Convert names to alphanumeric for safe CTE/Table AST aliasing in metric_governance
                rev_table_name = "".join(e for e in rev_ds.name.lower() if e.isalnum())
                spend_table_name = "".join(e for e in spend_ds.name.lower() if e.isalnum())

                # Schema normalization mappings
                rev_col = "amount" if rev_ds.integration_name == "stripe" else "total_price"
                rev_date = "created" if rev_ds.integration_name == "stripe" else "created_at"
                spend_col = "spend"
                spend_date = "date"

                # 3. Construct deterministic, optimized DuckDB SQL for the Metric Injector
                compiled_sql = f"""
                SELECT
                    SUM(rev.{rev_col}) / NULLIF(SUM(spend.{spend_col}), 0) AS true_roas
                FROM {rev_table_name} AS rev
                FULL OUTER JOIN {spend_table_name} AS spend
                    ON date_trunc('day', CAST(rev.{rev_date} AS TIMESTAMP)) = date_trunc('day', CAST(spend.{spend_date} AS TIMESTAMP))
                """

                # 4. Save to Semantic Catalog (Global Metric -> dataset_id = None)
                golden_metric = SemanticMetric(
                    tenant_id=tenant_id,
                    dataset_id=None,
                    metric_name="True ROAS",
                    description="Out-of-the-box cross-platform Return on Ad Spend (Actual Cash Revenue / Total Platform Spend)",
                    compiled_sql=compiled_sql.strip(),
                    created_at=datetime.utcnow()
                )

                db.add(golden_metric)
                db.commit()
                
                logger.info(f"[{tenant_id}] 🌟 Golden Metric 'True ROAS' automatically seeded across {rev_ds.integration_name} and {spend_ds.integration_name}!")
                
        except Exception as e:
            logger.error(f"[{tenant_id}] Failed to seed Golden Metrics: {e}")
            # Non-fatal error, do not crash the sync pipeline

    async def run_historical_sync(
        self, 
        tenant_id: str,
        integration_name: str, 
        dataset_id: str, 
        stream_name: str, 
        start_timestamp: Optional[str] = None
    ) -> None:
        """
        The Pull Pipeline.
        Designed to be executed by Celery or FastAPI BackgroundTasks.
        Uses short-lived DB sessions to prevent Supabase connection pool exhaustion during massive syncs.
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
                
                # Fetch Checkpoint for Incremental Syncs if not provided
                if not start_timestamp:
                    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
                    if dataset and dataset.schema_metadata:
                        start_timestamp = dataset.schema_metadata.get("last_sync_time", "2024-01-01T00:00:00Z")
                    else:
                        start_timestamp = "2024-01-01T00:00:00Z"
                
            if not api_keys:
                raise PermissionError(f"Missing or expired credentials for {integration_name}")

            integration_class = INTEGRATION_REGISTRY[integration_name]
            
            # Instantiation & DataSanitizer Injection (Crucial for Edge Security)
            integration = integration_class(tenant_id=tenant_id, credentials=api_keys) 
            integration.data_sanitizer = DataSanitizer(tenant_id, integration_name)

            # 2. Set Initial State
            await self._update_dataset_status(dataset_id, DatasetStatus.PROCESSING)

            # 3. Contextual RAG schemas & PII config
            expected_schema_map = await integration.fetch_schema()
            stream_schema = expected_schema_map.get(stream_name.lower(), {})
            
            # Normalize schema map for DuckDB validator
            flat_schema = {f["name"]: f["type"] for f in stream_schema} if isinstance(stream_schema, list) else stream_schema
            pii_columns = getattr(integration, "PII_COLUMNS", ["email", "phone", "customer_email", "receipt_email"])

            total_rows_processed = 0
            saved_paths: List[str] = []

            # Auto-seed the dashboard views (MRR, Churn, etc) for this integration
            self.seed_connector_views(tenant_id, integration)

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

                # 5. Storage Layer: Hive-Partitioned Parquet Sink
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
            
            # 7. Check and Auto-Seed Cross-Platform "Golden Metrics"
            self.seed_golden_metrics(tenant_id)

            # 8. Watchdog Telemetry (Anomaly detection on row volumes)
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
            logger.error(f"❌ [{tenant_id}] Sync Failed for {dataset_id}: {str(e)}", exc_info=True)
            await self._update_dataset_status(dataset_id, DatasetStatus.FAILED, error_msg=str(e))


    # --- Metadata Helpers ---

    async def _update_dataset_status(self, dataset_id: str, status: DatasetStatus, error_msg: Optional[str] = None):
        with SessionLocal() as db:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = status
                if error_msg:
                    dataset.schema_metadata = {**(dataset.schema_metadata or {}), "last_error": error_msg}
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
                
                # Update schema context for AI Agents
                if total_rows > 0 and paths:
                    profile = storage_manager.convert_to_parquet_and_profile(db, tenant_id, paths[-1])
                    current_meta = dataset.schema_metadata or {}
                    dataset.schema_metadata = {
                        **current_meta,
                        "columns": profile.get("columns", []),
                        "last_sync_time": datetime.now(timezone.utc).isoformat(),
                        "total_rows_synced": (current_meta.get("total_rows_synced", 0) + total_rows)
                    }
            
            # Storage Metering Update (For Billing)
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
    Note: In heavy production environments, this can also trigger a Celery task.
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
        stream_name=dataset.stream_name or "default"
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
    
    # Dynamic Contextual RAG Schema Loading (Initialize without credentials just to fetch schema)
    integration_class = INTEGRATION_REGISTRY[integration_name]
    integration_instance = integration_class(tenant_id=tenant_id, credentials={})
    expected_schemas_map = await integration_instance.fetch_schema()
    
    stream_schema = expected_schemas_map.get(stream_name, {})
    flat_schema = {f["name"]: f["type"] for f in stream_schema} if isinstance(stream_schema, list) else stream_schema
    pii_columns = getattr(integration_instance, "PII_COLUMNS", ["email", "phone", "customer_email", "receipt_email"])
    
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
            now = datetime.now(timezone.utc)
            partition = f"year={now.year}/month={now.month:02d}"
            table_id = f"sync/{integration_name}/live_webhooks/{partition}"
            
            storage_manager.write_dataframe(
                db=db, df=df, tenant_id=tenant_id, dataset_id=table_id, format="parquet"
            )
            
            # Seed golden metrics silently on webhook ingestion too if applicable thresholds are hit
            engine.seed_golden_metrics(tenant_id)
        
        return {"status": "success", "rows": df.height}
        
    except Exception as e:
        logger.error(f"Webhook ingestion failure for {integration_name}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Compute engine ingestion anomaly.")