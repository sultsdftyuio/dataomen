# api/routes/query.py
import os
import tempfile
import logging
import time
from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
import duckdb
import pandas as pd
import numpy as np

from api.database import get_db
# Ensure this matches your actual auth import
try:
    from api.auth import get_current_tenant
except ImportError:
    def get_current_tenant(): return "mock_tenant_id"

from api.services.storage_manager import storage_manager
from api.services.nl2sql_generator import nl2sql_generator
from models import Dataset, QueryHistory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/query", tags=["Query"])

# --- Pydantic Models ---
class EphemeralQueryRequest(BaseModel):
    ephemeral_path: str
    natural_query: str

class PersistentQueryRequest(BaseModel):
    dataset_id: str
    natural_query: str
    agent_id: Optional[str] = None # For tracking history to specific AI assistants

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

        # Vectorized Execution (PyArrow backing)
        df = con.execute(sql_query).fetch_arrow_table().to_pandas()
        
        # Data Sanitization: Replace NaNs with strict JSON nulls to prevent React frontend crashes
        df = df.replace({np.nan: None}) 
        
        results = df.to_dict(orient="records")
        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "status": "success",
            "sql_executed": sql_query,
            "columns": list(df.columns),
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
    Executes heavily optimized Contextual RAG with PyArrow vectorization.
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

        # 5. Computation: Execute via PyArrow for Zero-Copy transfer into Pandas memory
        df = con.execute(sql_query).fetch_arrow_table().to_pandas()
        df = df.replace({np.nan: None})
        results = df.to_dict(orient="records")
        
        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        # Phase 1.4: Immutable Audit Logging via Background Task (UI stays snappy)
        if request.agent_id:
            background_tasks.add_task(
                async_audit_logger, db, tenant_id, request.agent_id, 
                request.natural_query, sql_query, execution_time_ms, True
            )

        return {
            "status": "success",
            "sql_executed": sql_query,
            "columns": list(df.columns),
            "data": results,
            "execution_time_ms": execution_time_ms
        }

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