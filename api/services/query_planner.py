# api/services/query_planner.py

import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import json

from api.services.llm_client import llm_client
from models import Dataset, Agent, AgentKnowledge
from api.services.storage_manager import storage_manager

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Data Contracts for Orchestration
# -------------------------------------------------------------------------

class DatasetContext(BaseModel):
    dataset_id: str
    name: str
    relevant_columns: List[str]
    description: Optional[str]

class QueryPlan(BaseModel):
    """
    The Strategic Blueprint for the AI Data Copilot.
    Determines if we need a simple query or a multi-dataset join.
    """
    intent: str = Field(..., description="The user's core analytical goal.")
    requires_cross_dataset_join: bool = Field(default=False)
    primary_datasets: List[str] = Field(..., description="IDs of datasets required to answer.")
    join_keys: Dict[str, str] = Field(default_factory=dict, description="Inferred keys to link datasets (e.g., {'sales': 'user_id', 'marketing': 'customer_id'})")
    analytical_strategy: str = Field(..., description="Step-by-step logic the SQL generator should follow.")
    confidence_score: float

# -------------------------------------------------------------------------
# The Brain of Cross-Dataset Intelligence
# -------------------------------------------------------------------------

class QueryPlanner:
    """
    Phase 4: Semantic Router & Strategy Engine.
    
    Responsibilities:
    1. Semantic Discovery: Find relevant datasets using RAG over schemas.
    2. Multi-Dataset Logic: Detect when 'Sales' needs 'Marketing' data.
    3. Pruning: Prevent token bloat by sending only relevant schema fragments to the LLM.
    """

    async def plan_execution(self, db: Session, tenant_id: str, agent: Agent, natural_query: str) -> QueryPlan:
        """
        Turns a vague user question into a concrete Multi-Dataset execution plan.
        """
        logger.info(f"[{tenant_id}] Planning execution for: '{natural_query}'")

        # 1. Context Retrieval (Semantic Search over all Tenant Datasets)
        # We don't just use the Agent's primary dataset; we look for "Peers"
        available_datasets = db.query(Dataset).filter(Dataset.tenant_id == tenant_id).all()
        
        # 2. Schema Pruning (The "Hybrid" part)
        # We use the LLM to filter which datasets are actually needed based on the intent.
        context_payload = []
        for d in available_datasets:
            # We only send the top-level metadata to save tokens
            context_payload.append({
                "id": str(d.id),
                "name": d.name,
                "description": d.description,
                "columns": list(d.schema_metadata.keys()) if d.schema_metadata else []
            })

        system_prompt = f"""
        You are the Head of Data Strategy. Your goal is to plan an analytical query.
        You have access to multiple datasets for this tenant. 
        
        USER INTENT: {natural_query}
        AGENT ROLE: {agent.role_description}
        
        AVAILABLE DATASETS:
        {json.dumps(context_payload)}

        RULES:
        1. If the user asks about 'conversions' and 'spend', and they are in different datasets, mark 'requires_cross_dataset_join' as true.
        2. Identify common keys (like user_id, email, or date) that can link them.
        3. If only one dataset is needed, stay efficient.
        """

        try:
            plan = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=f"Create a QueryPlan for: {natural_query}",
                response_model=QueryPlan,
                temperature=0.0 # Deterministic planning
            )
            
            # Security Validation: Ensure the plan only references datasets the tenant owns
            valid_ids = {str(d.id) for d in available_datasets}
            plan.primary_datasets = [d_id for d_id in plan.primary_datasets if d_id in valid_ids]
            
            return plan

        except Exception as e:
            logger.error(f"[{tenant_id}] Query planning failed: {e}")
            # Fallback to the Agent's primary dataset
            return QueryPlan(
                intent=natural_query,
                primary_datasets=[str(agent.dataset_id)],
                analytical_strategy="Defaulting to primary dataset due to planning error.",
                confidence_score=0.5
            )

    async def get_schema_context(self, db: Session, dataset_ids: List[str]) -> str:
        """
        Generates a concise DDL/Schema representation for the SQL Generator.
        Only called AFTER the planner identifies the necessary datasets.
        """
        schema_fragments = []
        for d_id in dataset_ids:
            dataset = db.query(Dataset).filter(Dataset.id == d_id).first()
            if not dataset: continue
            
            cols = dataset.schema_metadata or {}
            col_desc = ", ".join([f"{name} ({dtype})" for name, dtype in cols.items()])
            schema_fragments.append(f"Table: {dataset.name}\nColumns: {col_desc}")
            
        return "\n\n".join(schema_fragments)

# Global Singleton
query_planner = QueryPlanner()