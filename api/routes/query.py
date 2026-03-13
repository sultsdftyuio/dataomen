# api/routes/query.py

import os
import tempfile
import logging
import time
import uuid
import asyncio
from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, status
from sqlalchemy.orm import Session
import duckdb
import polars as pl  # Strictly vectorized Polars for high-performance transit

from api.database import get_db

# Core Security & SaaS Identity
from api.auth import verify_tenant, TenantContext
from models import Dataset, QueryHistory, Organization

# Phase 3/4 Modular Services (The Orchestration Layer)
from api.services.storage_manager import storage_manager
from api.services.nl2sql_generator import nl2sql_generator
from api.services.compute_engine import compute_engine, ComputeRouter

# Phase 2 Legacy/Diagnostic Modules
from api.services.metric_governance import MetricGovernanceService  # CRITICAL FIX
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
    Offloads Postgres commits to a background thread to keep the Vercel HTTP response instantaneous.
    """
    try:
        log_entry = QueryHistory(
            tenant_id=tenant_id,
            agent_id=uuid.UUID(agent_id) if isinstance(agent_id, str) and agent_id else None,
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

# --- Dynamic Data Mounter (The Hybrid Performance Paradigm) ---
def mount_dataset_to_duckdb(con: duckdb.DuckDBPyConnection, file_path: str, view_name: str) -> None:
    """
    Maps the optimal vectorized reading strategy based on file format for Ephemeral storage.
    Persistent storage is handled entirely by the `compute_engine`.
    """
    base_path = file_path.split('?')[0]
    ext = base_path.lower().split('.')[-1] if '.' in base_path else 'parquet'
    
    try:
        if ext in ['csv', 'tsv', 'txt']:
            con.execute(f"CREATE VIEW {view_name} AS SELECT * FROM read_csv_auto('{file_path}', sample_size=-1)")
        elif ext in ['json', 'ndjson', 'jsonl']:
            con.execute(f"CREATE VIEW {view_name} AS SELECT * FROM read_json_auto('{file_path}')")
        elif ext in ['xlsx', 'xls', 'ods']:
            df = pl.read_excel(file_path)
            arrow_table = df.to_arrow()
            con.register(f"{view_name}_arrow_temp", arrow_table)
            con.execute(f"CREATE VIEW {view_name} AS SELECT * FROM {view_name}_arrow_temp")
        else:
            con.execute(f"CREATE VIEW {view_name} AS SELECT * FROM read_parquet('{file_path}')")
            
    except Exception as e:
        logger.error(f"Failed to mount dataset format '{ext}' at '{file_path}': {str(e)}")
        raise RuntimeError(f"Could not parse file format natively. Detail: {str(e)}")

# --- Routes ---
@router.post("/ephemeral")
async def execute_ephemeral_query(
    request: EphemeralQueryRequest,
    tenant: TenantContext = Depends(verify_tenant) # Require auth even for ephemeral
) -> Dict[str, Any]:
    """
    Tier 1 Execution: Purely in-memory, zero persistent footprint.
    Uses Ephemeral View mapping to execute against Vercel /tmp/.
    """
    try:
        safe_path = security_validate_ephemeral_path(request.ephemeral_path)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    start_time = time.time()
    
    try:
        view_name = "ephemeral_data"
        con = duckdb.connect(':memory:')
        
        # 1. Mount the file
        mount_dataset_to_duckdb(con, safe_path, view_name)

        # 2. Extract schema dynamically to support Contextual RAG
        metadata = con.execute(f"DESCRIBE SELECT * FROM {view_name};").pl()
        col_dict = {row["column_name"]: row["column_type"] for row in metadata.to_dicts()}
        
        schemas = [{
            "id": view_name,
            "name": "Ephemeral Upload",
            "schema": col_dict
        }]

        # 3. Phase 3: NL2SQL Generation
        sql_query, chart_spec = await nl2sql_generator.generate_sql(
            prompt=request.natural_query, 
            schemas=schemas
        )

        # 4. Phase 2.1: Semantic Math Resolution (Tenant-specific Metric Injection)
        governance_service = MetricGovernanceService(tenant_id=tenant.tenant_id)
        sql_query = governance_service.inject_governed_metrics(sql_query)

        # 5. Vectorized Execution (Offloaded to thread to prevent blocking the async event loop)
        def _execute_duckdb(connection, query_string):
            arrow_table = connection.execute(query_string).arrow()
            df = pl.from_arrow(arrow_table)
            return df.columns, df.to_dicts()

        columns, results = await asyncio.to_thread(_execute_duckdb, con, sql_query)
        
        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "status": "success",
            "execution_mode": "sync",
            "sql_executed": sql_query,
            "chart_spec": chart_spec,
            "columns": columns,
            "data": results,
            "execution_time_ms": execution_time_ms
        }

    except Exception as e:
        logger.error(f"[{tenant.tenant_id}] Ephemeral Query Execution failed: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Query computation failed: {str(e)}")
    finally:
        if 'con' in locals(): con.close()


@router.post("/persistent")
async def execute_persistent_query(
    request: PersistentQueryRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(verify_tenant) # SECURITY: Guaranteed Tenant ID
) -> Dict[str, Any]:
    """
    Tier 2/3 Execution: Connects securely to persistent storage via ComputeEngine.
    Enforces Contextual RAG, Metric Governance, and the Phase 4 Auto-Correction Loop.
    """
    start_time = time.time()
    
    # 1. SaaS Billing Guardrail: Query Metering
    org = db.query(Organization).filter(Organization.id == tenant.tenant_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")
        
    if org.current_month_queries >= org.monthly_query_limit:
        logger.warning(f"[{tenant.tenant_id}] Blocked query execution. Monthly limit reached.")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, 
            detail=f"Monthly query limit exceeded ({org.monthly_query_limit} queries). Please upgrade your plan."
        )

    # 2. STRICT Physical Jailing
    dataset = db.query(Dataset).filter(
        Dataset.id == request.dataset_id,
        Dataset.tenant_id == tenant.tenant_id
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or access denied.")

    sql_query = None
    try:
        # 3. AI Orchestration: Contextual RAG
        schemas = [{
            "id": str(dataset.id),
            "name": dataset.name,
            "schema": dataset.schema_metadata or {}
        }]
        
        sql_query, chart_spec = await nl2sql_generator.generate_sql(
            prompt=request.natural_query,
            schemas=schemas
        )

        # Phase 2.1: Semantic Math Resolution (Tenant-specific Metric Injection)
        governance_service = MetricGovernanceService(tenant_id=tenant.tenant_id, db_session=db)
        sql_query = governance_service.inject_governed_metrics(sql_query)

        # Phase 2.2: Compute Router ("Noisy Neighbor" Defense)
        if ComputeRouter.requires_background_worker(sql_query):
            job_id = str(uuid.uuid4())
            return {
                "status": "processing",
                "execution_mode": "async",
                "job_id": job_id,
                "message": "Query complexity exceeded sync thresholds. Routed to asynchronous diagnostic tier."
            }

        # 4. Computation Layer: Vectorized Execution with Auto-Correction Loop
        try:
            results = await compute_engine.execute_read_only(
                db=db,
                tenant_id=tenant.tenant_id,
                datasets=[dataset],
                query=sql_query
            )
        except Exception as compute_error:
            # Error Feedback Loop: If DuckDB rejects the SQL, let the LLM fix it
            logger.warning(f"[{tenant.tenant_id}] Compute failed, attempting auto-correction: {str(compute_error)}")
            
            sql_query, chart_spec = await nl2sql_generator.correct_sql(
                failed_query=sql_query,
                error_msg=str(compute_error),
                prompt=request.natural_query,
                schemas=schemas
            )
            
            # Phase 2.1 Retry: MUST inject metrics again in case the LLM used macro tags in the fix!
            sql_query = governance_service.inject_governed_metrics(sql_query)

            # Retry Execution
            results = await compute_engine.execute_read_only(
                db=db,
                tenant_id=tenant.tenant_id,
                datasets=[dataset],
                query=sql_query
            )

        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        # 5. Usage Metering & Auditing (Success)
        org.current_month_queries += 1
        db.commit()

        # Phase 1.4: Immutable Audit Logging via Background Task
        if request.agent_id:
            background_tasks.add_task(
                async_audit_logger, db, tenant.tenant_id, request.agent_id, 
                request.natural_query, sql_query, execution_time_ms, True
            )

        response_data = {
            "status": "success",
            "execution_mode": "sync",
            "sql_executed": sql_query,
            "chart_spec": chart_spec,
            "columns": list(results[0].keys()) if results else [],
            "data": results,
            "execution_time_ms": execution_time_ms
        }

        # Phase 2.4: Automated Diagnostic Intelligence (A/B Testing)
        if request.ab_test_config and results:
            def _run_ab_test(data, config):
                df = pl.DataFrame(data) 
                return ab_tester.analyze_experiment(
                    df=df,
                    metric_col=config.metric_col,
                    group_col=config.group_col,
                    control_val=config.control,
                    treatment_val=config.treatment
                )
            # Offload heavy math analysis to prevent blocking the event loop
            diagnostic_insights = await asyncio.to_thread(_run_ab_test, results, request.ab_test_config)
            response_data["diagnostic_insights"] = diagnostic_insights

        return response_data

    except Exception as e:
        execution_time_ms = round((time.time() - start_time) * 1000, 2)
        logger.error(f"[{tenant.tenant_id}] Persistent Query failed: {str(e)}")
        
        # Log failure for LLM fine-tuning via Background Task
        if request.agent_id and sql_query:
            background_tasks.add_task(
                async_audit_logger, db, tenant.tenant_id, request.agent_id, 
                request.natural_query, sql_query, execution_time_ms, False, str(e)
            )
            
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database engine error: {str(e)}")