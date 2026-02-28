import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from api.database import get_db
from models import Dataset
from api.services.nl2sql_generator import NL2SQLGenerator

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/datasets",
    tags=["Analytical Queries"]
)

# --- Request Schemas ---
class DashboardRequest(BaseModel):
    prompt: str = Field(..., description="The natural language analytical prompt from the user.")


@router.post("/{dataset_id}/dashboard", summary="Generate Dynamic Dashboard")
async def generate_dashboard(
    dataset_id: str,
    payload: DashboardRequest,
    db: Session = Depends(get_db)
) -> dict:
    """
    Takes natural language input, generates an entire contextual dashboard configuration, 
    and returns hydrated widget data.

    Follows the Hybrid Performance Paradigm by isolating the HTTP request layer 
    from the DuckDB/Pandas vectorized execution layer.
    """
    prompt = payload.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required and cannot be empty.")

    # 1. Security by Design: Tenant Isolation Check
    # In a fully authenticated environment, filter by the current user's tenant_id as well.
    # e.g., filter(Dataset.id == dataset_id, Dataset.tenant_id == current_tenant)
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    
    if not dataset:
        logger.warning(f"Unauthorized or invalid dataset access attempt for ID: {dataset_id}")
        raise HTTPException(status_code=404, detail="Dataset not found or access denied.")

    # 2. Dependency Injection: Initialize Modular Service
    generator = NL2SQLGenerator()
    
    # 3. Orchestrate Generation & Execution
    try:
        dashboard_data = await generator.execute_dashboard(dataset, prompt)
        return dashboard_data
        
    except ValueError as ve:
        # Catch explicit validation/security errors (like disallowed SQL keywords)
        logger.warning(f"Validation error during dashboard generation for dataset {dataset_id}: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
        
    except FileNotFoundError as fnfe:
        # Catch storage mapping errors
        logger.error(f"Storage module error for dataset {dataset_id}: {fnfe}")
        raise HTTPException(status_code=404, detail="Underlying analytical data not found.")
        
    except Exception as e:
        # Catch-all for LLM network failures or DuckDB execution crashes
        logger.error(f"Generative dashboard failure for dataset {dataset_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while generating the dashboard.")