import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from api.database import get_db
from api.auth import get_current_user
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.semantic_router import SemanticRouter

# Configuration: Standardize logging for analytical tracing
logger = logging.getLogger("dataomen.query")

router = APIRouter()

class QueryRequest(BaseModel):
    prompt: str
    dataset_id: str

@router.post("/execute")
async def execute_query(
    request: QueryRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Computation (Execution): Converts natural language to SQL and executes it.
    The tenant_id from the Supabase JWT is strictly passed down to ensure
    that only data belonging to that specific user is accessed.
    """
    try:
        # Orchestration: Use Semantic Router to determine query intent and schema context
        router_service = SemanticRouter(db)
        context = await router_service.route_query(
            prompt=request.prompt, 
            dataset_id=request.dataset_id,
            tenant_id=user["tenant_id"]
        )

        if not context:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Dataset not found or access denied for this tenant."
            )

        # Execution: Generate and run SQL against DuckDB
        generator = NL2SQLGenerator(db)
        result = await generator.generate_and_execute(
            prompt=request.prompt,
            dataset_id=request.dataset_id,
            tenant_id=user["tenant_id"],
            schema_context=context
        )

        if not result:
            return {"error": "Query could not be generated for this prompt."}

        return result

    except Exception as e:
        logger.error(f"Query execution error for user {user['id']}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your analytical query."
        )