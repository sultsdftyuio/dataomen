import os
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import logging

from api.database import get_db
from models import Dataset
from api.services.semantic_router import SemanticRouter
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.duckdb_validator import DuckDBValidator # Assuming you have this from Phase 1

router = APIRouter(prefix="/api/v1/query", tags=["Query Engine"])
logger = logging.getLogger(__name__)

# 1. Strict Request/Response Models
class QueryRequest(BaseModel):
    dataset_id: str
    user_query: str
    tenant_id: str # Security First: Always enforce tenant boundaries

class QueryResponse(BaseModel):
    data: List[Dict[str, Any]]
    chart_config: Dict[str, Any]
    thought_process: str
    executed_sql: str

# 2. The Self-Healing Orchestrator Route
@router.post("/", response_model=QueryResponse)
def execute_natural_language_query(
    request: QueryRequest, 
    db: Session = Depends(get_db)
):
    # Step A: Security & Metadata Retrieval
    dataset = db.query(Dataset).filter(
        Dataset.id == request.dataset_id,
        Dataset.tenant_id == request.tenant_id
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or unauthorized.")

    # Initialize isolated services
    api_key = os.getenv("OPENAI_API_KEY")
    semantic_router = SemanticRouter(db_session=db, api_key=api_key)
    nl2sql = NL2SQLGenerator(api_key=api_key)
    duckdb_engine = DuckDBValidator() 

    # Step B: RAG - Narrow the universe of columns
    schema_context = semantic_router.retrieve_relevant_schema(
        dataset_id=str(dataset.id), 
        user_query=request.user_query, 
        top_k=10
    )

    # Step C: The Self-Healing Loop
    max_attempts = 3
    current_attempt = 1
    llm_query_prompt = request.user_query
    
    while current_attempt <= max_attempts:
        try:
            # 1. Generate strictly typed JSON from OpenAI
            payload = nl2sql.generate_payload(
                user_query=llm_query_prompt, 
                schema_context=schema_context
            )
            
            # 2. Execute against Parquet in Object Storage using DuckDB
            # We inject the actual S3/R2 path into the virtual table reference
            actual_sql = payload.sql_query.replace(
                "dataset_table", 
                f"read_parquet('{dataset.s3_key}')"
            )
            
            query_results = duckdb_engine.execute_query(actual_sql)
            
            # If we reach this line, DuckDB succeeded! Break the loop and return.
            return QueryResponse(
                data=query_results,
                chart_config=payload.chart_config.model_dump(),
                thought_process=payload.thought_process,
                executed_sql=payload.sql_query
            )
            
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"Attempt {current_attempt} failed. Error: {error_msg}")
            
            if current_attempt == max_attempts:
                # We tried our best. Fail gracefully.
                raise HTTPException(
                    status_code=400, 
                    detail="I couldn't generate a valid query for this request. Try rephrasing your question."
                )
            
            # Append the exact database error to the prompt to force the LLM to fix its mistake
            llm_query_prompt = f"""
            Original question: {request.user_query}
            
            Your previous SQL query failed with this error: {error_msg}
            
            Fix the SQL query so it executes successfully. Pay close attention to column names and data types.
            """
            current_attempt += 1