import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import duckdb
import pandas as pd
import numpy as np

from api.auth import get_current_user as get_tenant
from api.database import get_db
from models import Dataset
from api.services.storage_manager import storage_manager
from api.services.nl2sql_generator import nl2sql

router = APIRouter(prefix="/query", tags=["Analytics"])
logger = logging.getLogger(__name__)

class QueryRequest(BaseModel):
    dataset_id: str
    natural_language_query: str

@router.post("/", response_model=Dict[str, Any], status_code=status.HTTP_200_OK)
async def execute_natural_language_query(
    request: QueryRequest,
    tenant_id: str = Depends(get_tenant),
    db: Session = Depends(get_db)
):
    """
    Orchestration Layer:
    1. Validates dataset ownership (Security by Design).
    2. Dynamically extracts Parquet schema from R2 via DuckDB without downloading data.
    3. Translates NL to SQL via LLM (Contextual RAG).
    4. Executes SQL analytically in-place on R2 and returns JSON results.
    """
    # 1. Security by Design: Strictly validate the dataset belongs to the requesting tenant
    dataset = db.query(Dataset).filter(
        Dataset.id == request.dataset_id,
        Dataset.tenant_id == tenant_id
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or unauthorized.")

    # 2. Analytical Efficiency: Setup In-Memory DuckDB + R2 HTTP Streaming
    conn = duckdb.connect(database=':memory:')
    
    try:
        storage_manager.configure_duckdb_connection(conn)

        # 3. Contextual RAG: Fetch Schema dynamically to prevent LLM token bloat
        # Using DESCRIBE efficiently reads just the metadata footer from the cloud Parquet file
        schema_query = f"DESCRIBE SELECT * FROM read_parquet('{dataset.storage_uri}') LIMIT 1"
        try:
            schema_df = conn.execute(schema_query).df()
            schema_str = schema_df[['column_name', 'column_type']].to_string(index=False)
        except Exception as e:
            logger.error(f"Failed to read schema from R2 for dataset {dataset.id}: {e}")
            raise HTTPException(status_code=500, detail="Could not retrieve schema from storage. The dataset may be corrupted or unavailable.")
        
        # 4. Generate SQL
        generated_sql = await nl2sql.generate_sql(
            user_query=request.natural_language_query,
            schema_info=schema_str,
            file_uri=dataset.storage_uri
        )
        logger.info(f"Generated SQL for Tenant {tenant_id}: {generated_sql}")
        
        # 5. Computation Layer: Execute Generated SQL
        try:
            result_df = conn.execute(generated_sql).df()
        except duckdb.Error as e:
            logger.error(f"DuckDB Execution Error: {e}\nSQL: {generated_sql}")
            raise HTTPException(status_code=400, detail=f"Generated SQL resulted in an error: {str(e)}")
        
        # 6. Vectorized Sanitization for JSON mapping
        # Convert NaN and Infinity to standard JSON nulls natively
        result_df = result_df.replace([np.inf, -np.inf], None)
        result_df = result_df.where(pd.notnull(result_df), None)
        
        return {
            "status": "success",
            "dataset_id": dataset.id,
            "generated_sql": generated_sql,
            "data": result_df.to_dict(orient="records")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query pipeline failed for tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during analytical execution: {str(e)}")
        
    finally:
        # Guarantee memory release back to the Render instance
        conn.close()