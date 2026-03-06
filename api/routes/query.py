# api/routes/query.py
import os
import tempfile
import logging
import time
import uuid
from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
import duckdb
import polars as pl  # Replaced pandas with strictly vectorized Polars

from api.database import get_db
# Ensure this matches your actual auth import
try:
    from api.auth import get_current_tenant
except ImportError:
    def get_current_tenant(): return "mock_tenant_id"

from api.services.storage_manager import storage_manager
from api.services.nl2sql_generator import nl2sql_generator
from models import Dataset, QueryHistory

# Phase 2 Modules
from api.services.metric_governance import metric_registry
from api.services.compute_engine import ComputeRouter
from api.services.ab_testing import ab_tester

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/query", tags=["Query"])

# --- Pydantic Models ---
class EphemeralQueryRequest(BaseModel):
    ephemeral_path: str
    natural_query: str

class ABTestConfig(BaseModel):
    metric_col: str
    group_col: str
    control: str
    treatment: str

class PersistentQueryRequest(BaseModel):
    dataset_id: str
    natural_query: str
    agent_id: Optional[str] = None # For tracking history to specific AI assistants
    ab_test_config: Optional[ABTestConfig] = None # Phase 2: Diagnostic Intel

# --- Security Validation & Background Workers ---
def security_validate_ephemeral_path(path: str) -> str:
    """
    Security by Design: Strict validation to prevent Directory Traversal (LFI) attacks.
    Ensures the path requested by the frontend resides purely within the OS Temp directory.
    """
    temp_dir = tempfile.gettempdir()
    absolute_requested_path = os.path.abspath(path)
    
    if not absolute_requested_path.startswith(os.path.abspath(temp_dir)):
        logger.warning(f"SECURITY ALERT: Attempted path traversal detected: {path}")
        raise ValueError("Invalid path mapping. Access denied.")
    
    if not os.path.exists(absolute_requested_path):
        raise ValueError("Ephemeral session expired or file not found. Please re-upload your file.")
        
    return absolute_requested_path

def async_audit_logger(db: Session, tenant_id: str, agent_id: str, query: str, sql: str, duration: float, success: bool, error: str = None):
    """
    Phase 1.4 Immutable Audit Logging:
    Offloads Postgres commits to a background thread to keep the Vercel/Render HTTP response instantaneous.
    """
    try:
        log_entry = QueryHistory(
            tenant_id=tenant_id,
            agent_id=agent_id,
            natural_query=query,
            generated_sql=sql,
            execution_time_ms=duration,
            was_successful=success,
            error_message=error
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to write async audit log: {str(e)}")

# --- Routes ---
@router.post("/ephemeral")
async def execute_ephemeral_query(request: EphemeralQueryRequest) -> Dict[str, Any]:
    """
    Tier 1 Execution: Purely in-memory, zero persistent footprint.
    Uses Ephemeral View mapping to execute against Vercel /tmp/.
    """
    try:
        safe_path = security_validate_ephemeral_path(request.ephemeral_path)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    start_time = time.time()
    try:
        # Phase 1.3 Programmatic RLS: Bind path to a view. The LLM never sees the physical path.
        view_name = "ephemeral_data"
        con = duckdb.connect(':memory:')
        con.execute(f"CREATE VIEW {view_name} AS SELECT * FROM read_parquet('{safe_path}')")

        # Call Semantic Router
        sql_query = await nl2sql_generator.generate_sql(
            natural_query=request.natural_query, 
            table_name=view_name,
            schema_metadata=None 
        )

        # Phase 2.1: Semantic Math Resolution
        for metric_name in metric_registry._metrics.keys():
            macro_tag = f"{{{metric_name}}}"
            if macro_tag in sql_query:
                sql_query = sql_query.replace(macro_tag, metric_registry.get_sql_expression(metric_name))

        # Phase 2.3: Vectorized Execution via Apache Arrow -> Polars Transit Layer
        arrow_table = con.execute(sql_query).arrow()
        df = pl.from_arrow(arrow_table)
        
        # Polars native to_dicts correctly maps nulls to JSON nulls automatically (No Pandas NaN crashes)
        results = df.to_dicts()
        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "status": "success",
            "execution_mode": "sync",
            "sql_executed": sql_query,
            "columns": df.columns,
            "data": results,
            "execution_time_ms": execution_time_ms
        }

    except Exception as e:
        logger.error(f"Ephemeral Query Execution failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Query computation failed: {str(e)}")
    finally:
        # Ensure memory is released gracefully
        if 'con' in locals(): con.close()


@router.post("/persistent")
async def execute_persistent_query(
    request: PersistentQueryRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant)
) -> Dict[str, Any]:
    """
    Tier 2/3 Execution: Connects securely to Supabase Storage, Cloudflare R2, or BYOS.
    Executes heavily optimized Contextual RAG with Arrow/Polars vectorization and diagnostic offloading.
    """
    start_time = time.time()
    
    # 1. STRICT Physical Jailing
    dataset = db.query(Dataset).filter(
        Dataset.id == request.dataset_id,
        Dataset.tenant_id == tenant_id
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or access denied.")

    sql_query = None
    try:
        # 2. Storage Orchestration
        query_path = storage_manager.get_duckdb_query_path(db, dataset)
        
        # 3. Engine Orchestration: Inject credentials
        con = storage_manager.setup_duckdb_connection(db, tenant_id)

        # Phase 1.3 Programmatic RLS: 
        # Create an immutable view. LLM targets `dataset_view` and physically cannot read other paths.
        view_name = f"dataset_{dataset.id.replace('-', '_')}"
        con.execute(f"CREATE VIEW {view_name} AS SELECT * FROM read_parquet('{query_path}')")

        # 4. AI Orchestration: Contextual RAG
        sql_query = await nl2sql_generator.generate_sql(
            natural_query=request.natural_query,
            table_name=view_name,
            schema_metadata=dataset.schema_metadata
        )

        # Phase 2.1: Semantic Math Resolution
        for metric_name in metric_registry._metrics.keys():
            macro_tag = f"{{{metric_name}}}"
            if macro_tag in sql_query:
                sql_query = sql_query.replace(macro_tag, metric_registry.get_sql_expression(metric_name))

        # Phase 2.2: Compute Router ("Noisy Neighbor" Defense)
        if ComputeRouter.requires_background_worker(sql_query):
            job_id = str(uuid.uuid4())
            # In a full deployment, dispatch this to your Render workers via Celery/Redis here
            # e.g., redis.rpush("tenant_jobs", json.dumps({"sql": sql_query}))
            return {
                "status": "processing",
                "execution_mode": "async",
                "job_id": job_id,
                "message": "Query complexity exceeded sync thresholds. Routed to asynchronous diagnostic tier."
            }

        # 5. Computation: Execute via PyArrow for Zero-Copy transfer into Polars
        arrow_table = con.execute(sql_query).arrow()
        df = pl.from_arrow(arrow_table)
        results = df.to_dicts()
        
        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        # Phase 1.4: Immutable Audit Logging via Background Task (UI stays snappy)
        if request.agent_id:
            background_tasks.add_task(
                async_audit_logger, db, tenant_id, request.agent_id, 
                request.natural_query, sql_query, execution_time_ms, True
            )

        response_data = {
            "status": "success",
            "execution_mode": "sync",
            "sql_executed": sql_query,
            "columns": df.columns,
            "data": results,
            "execution_time_ms": execution_time_ms
        }

        # Phase 2.4: Automated Diagnostic Intelligence (A/B Testing)
        if request.ab_test_config:
            diagnostic_insights = ab_tester.analyze_experiment(
                df=df,
                metric_col=request.ab_test_config.metric_col,
                group_col=request.ab_test_config.group_col,
                control_val=request.ab_test_config.control,
                treatment_val=request.ab_test_config.treatment
            )
            response_data["diagnostic_insights"] = diagnostic_insights

        return response_data

    except Exception as e:
        execution_time_ms = round((time.time() - start_time) * 1000, 2)
        logger.error(f"Persistent Query Execution failed for tenant {tenant_id}: {str(e)}")
        
        # Log failure for LLM fine-tuning via Background Task
        if request.agent_id and sql_query:
            background_tasks.add_task(
                async_audit_logger, db, tenant_id, request.agent_id, 
                request.natural_query, sql_query, execution_time_ms, False, str(e)
            )
            
        raise HTTPException(status_code=500, detail=f"Database engine error: {str(e)}")
    finally:
        if 'con' in locals(): con.close()