# api/routes/query.py
import os
import tempfile
import logging
import time
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import duckdb

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

# --- Security Validation ---
def security_validate_ephemeral_path(path: str):
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

# --- Routes ---
@router.post("/ephemeral")
async def execute_ephemeral_query(request: EphemeralQueryRequest) -> Dict[str, Any]:
    """
    Tier 1 Execution: Purely in-memory, zero persistent footprint.
    Uses AI to generate DuckDB SQL against an unauthenticated /tmp/ file.
    """
    try:
        security_validate_ephemeral_path(request.ephemeral_path)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    start_time = time.time()
    try:
        # 1. Inform the LLM of the exact literal string DuckDB needs to read the file
        table_name_for_duckdb = f"read_parquet('{request.ephemeral_path}')"

        # 2. Call Semantic Router (We pass None for schema as ephemeral relies on LLM inference/DuckDB auto-detect)
        sql_query = await nl2sql_generator.generate_sql(
            natural_query=request.natural_query, 
            table_name=table_name_for_duckdb,
            schema_metadata=None 
        )

        # 3. Connect and Execute purely in RAM
        con = duckdb.connect(':memory:')
        
        # 4. Vectorized execution and Pandas conversion
        df = con.execute(sql_query).df()
        
        # Data Sanitization: NaN values break JSON, replace with None (null)
        df = df.fillna("") 
        
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
        raise HTTPException(status_code=500, detail=f"Query execution failed: {str(e)}")


@router.post("/persistent")
async def execute_persistent_query(
    request: PersistentQueryRequest,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant)
) -> Dict[str, Any]:
    """
    Tier 2/3 Execution: Connects securely to Supabase Storage, Cloudflare R2, or BYOS.
    Executes heavily optimized Contextual RAG.
    """
    start_time = time.time()
    
    # 1. Fetch Jailed Dataset
    dataset = db.query(Dataset).filter(
        Dataset.id == request.dataset_id,
        Dataset.tenant_id == tenant_id
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or access denied.")

    sql_query = None
    try:
        # 2. Storage Orchestration: Calculate optimal Zero-Copy or S3 Query Path
        query_path = storage_manager.get_duckdb_query_path(db, dataset)
        
        # DuckDB expects read_parquet('s3://...') for remote paths
        table_name_for_duckdb = f"read_parquet('{query_path}')"

        # 3. AI Orchestration: Contextual RAG via Schema caching
        sql_query = await nl2sql_generator.generate_sql(
            natural_query=request.natural_query,
            table_name=table_name_for_duckdb,
            schema_metadata=dataset.schema_metadata
        )

        # 4. Engine Orchestration: Inject strict Tenant Credentials
        con = storage_manager.setup_duckdb_connection(db, tenant_id)

        # 5. Computation: Execute and Format
        df = con.execute(sql_query).df()
        df = df.fillna("")
        results = df.to_dict(orient="records")
        
        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        # Optional: Asynchronously log the telemetry
        if request.agent_id:
            log_entry = QueryHistory(
                tenant_id=tenant_id,
                agent_id=request.agent_id,
                natural_query=request.natural_query,
                generated_sql=sql_query,
                execution_time_ms=execution_time_ms,
                was_successful=True
            )
            db.add(log_entry)
            db.commit()

        return {
            "status": "success",
            "sql_executed": sql_query,
            "columns": list(df.columns),
            "data": results,
            "execution_time_ms": execution_time_ms
        }

    except Exception as e:
        logger.error(f"Persistent Query Execution failed for tenant {tenant_id}: {str(e)}")
        
        # Log failure for LLM fine-tuning later
        if request.agent_id and sql_query:
            db.add(QueryHistory(
                tenant_id=tenant_id,
                agent_id=request.agent_id,
                natural_query=request.natural_query,
                generated_sql=sql_query,
                was_successful=False,
                error_message=str(e)
            ))
            db.commit()
            
        raise HTTPException(status_code=500, detail=f"Database engine error: {str(e)}")