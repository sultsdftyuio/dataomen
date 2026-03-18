"""
ARCLI.TECH - Intelligence Layer
Component: AI Query Planner (The Brain)
Strategy: Semantic Routing, Schema Pruning, & Contextual RAG
"""

import logging
import json
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Core Infrastructure
from api.services.llm_client import llm_client
from models import Dataset, Agent
from api.services.sync_engine import INTEGRATION_REGISTRY

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Data Contracts for Orchestration (Instructor/Pydantic Strictness)
# -------------------------------------------------------------------------

class QueryPlan(BaseModel):
    """
    The Strategic Blueprint for the AI Data Copilot.
    Guarantees the LLM returns a strictly typed JSON object via OpenAI function calling.
    """
    intent_summary: str = Field(..., description="A 1-sentence summary of the user's analytical goal.")
    requires_cross_dataset_join: bool = Field(..., description="True if the question requires joining data across multiple SaaS platforms.")
    primary_dataset_ids: List[str] = Field(..., description="The exact UUIDs of the Datasets required to answer this question.")
    recommended_semantic_views: List[str] = Field(default_factory=list, description="Names of pre-computed views (e.g., 'vw_meta_ads_performance') that should be used instead of raw tables.")
    join_strategy: Optional[str] = Field(None, description="If joining, specify the keys (e.g., 'ON shopify.customer_email = zendesk.email').")
    analytical_strategy: str = Field(..., description="Step-by-step logic the downstream SQL generator should follow.")
    confidence_score: float = Field(..., description="0.0 to 1.0 confidence that this question can be answered with the available data.")

# -------------------------------------------------------------------------
# The Brain of Cross-Dataset Intelligence
# -------------------------------------------------------------------------

class QueryPlanner:
    """
    Phase 4: Semantic Router & Strategy Engine.
    
    Engineering Upgrades:
    1. Schema Pruning: Formats nested Parquet metadata perfectly to save Token bloat.
    2. Contextual RAG: Injects hardcoded SaaS views to prevent LLM hallucination.
    3. DuckDB Dialect Prep: Configures the AI to think in high-performance analytical SQL.
    """

    async def plan_execution(self, db: Session, tenant_id: str, agent: Agent, natural_query: str) -> QueryPlan:
        """
        Analyzes a natural language question and outputs a mathematically precise execution plan.
        """
        start_time = logging.time.time() if hasattr(logging, 'time') else 0
        logger.info(f"🧠 [{tenant_id}] Planning execution for: '{natural_query}'")

        # 1. Context Retrieval (Fetch all synced Parquet datasets for this tenant)
        available_datasets = db.query(Dataset).filter(
            Dataset.tenant_id == tenant_id,
            Dataset.status == "READY"
        ).all()
        
        if not available_datasets:
            logger.warning(f"[{tenant_id}] No READY datasets found. Planner will fail gracefully.")

        # 2. Advanced Schema Pruning & Contextual RAG Injection
        context_payload = []
        semantic_views_available = {}

        for d in available_datasets:
            # Extract columns from the StorageManager's Parquet profile
            columns_meta = d.schema_metadata.get("columns", []) if d.schema_metadata else []
            col_strings = [f"{c.get('name')} ({c.get('type')})" for c in columns_meta]

            # Fetch Contextual RAG Views from the Connector Registry
            views = []
            if d.integration_name and d.integration_name in INTEGRATION_REGISTRY:
                try:
                    connector_class = INTEGRATION_REGISTRY[d.integration_name]
                    # Instantiate a lightweight dummy connector to extract the static views
                    dummy_connector = connector_class(tenant_id=tenant_id, credentials={})
                    views_dict = dummy_connector.get_semantic_views()
                    views = list(views_dict.keys())
                    semantic_views_available.update(views_dict)
                except Exception as e:
                    logger.debug(f"Could not fetch views for {d.integration_name}: {e}")

            context_payload.append({
                "dataset_id": str(d.id),
                "integration": d.integration_name,
                "stream": d.stream_name,
                "description": d.description or f"Raw data from {d.integration_name}",
                "available_columns": col_strings[:50], # Cap at 50 columns to protect LLM context window
                "pre_computed_views": views
            })

        # 3. Prompt Engineering (The "System" Directives)
        system_prompt = f"""
        You are the Head of Data Strategy for a modern Zero-ETL data warehouse running on DuckDB.
        Your goal is to map a user's natural language question to the exact tables and views needed to answer it.
        
        AGENT ROLE & CONTEXT: 
        {agent.role_description}
        
        AVAILABLE DATASETS (PARQUET TABLES):
        {json.dumps(context_payload, indent=2)}

        CRITICAL DIRECTIVES:
        1. CROSS-PLATFORM JOINS: If the user asks for "ROAS", "CAC", or compares "Spend vs Revenue", you MUST join the Marketing dataset (Google/Meta) with the Revenue dataset (Stripe/Shopify) using date truncations (e.g., month/day).
        2. SEMANTIC VIEWS FIRST: If a dataset has a 'pre_computed_view' that matches the intent (e.g., 'vw_google_ads_daily_cac'), instruct the SQL generator to use THAT view instead of the raw tables.
        3. BE DECISIVE: Select ONLY the primary_dataset_ids strictly required to answer the query. Do not pull in Zendesk data if they are asking about Shopify sales.
        4. IMPOSSIBLE QUERIES: If the question cannot be answered with the provided datasets, set confidence_score below 0.4.
        """

        try:
            # Execute the Instructor-patched OpenAI call
            # This guarantees the output perfectly matches our QueryPlan Pydantic model
            plan = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=f"USER QUESTION: {natural_query}\nGenerate the QueryPlan.",
                response_model=QueryPlan,
                temperature=0.0 # Strict deterministic planning
            )
            
            # Security Gate: Ensure the LLM didn't hallucinate random dataset UUIDs
            valid_ids = {str(d.id) for d in available_datasets}
            plan.primary_dataset_ids = [d_id for d_id in plan.primary_dataset_ids if d_id in valid_ids]
            
            logger.info(f"✅ [{tenant_id}] Plan generated (Confidence: {plan.confidence_score}). Cross-Join: {plan.requires_cross_dataset_join}")
            return plan

        except Exception as e:
            logger.error(f"❌ [{tenant_id}] Query planning failed: {e}", exc_info=True)
            # Fallback strategy to keep the app alive
            return QueryPlan(
                intent_summary="Fallback execution due to planning error.",
                requires_cross_dataset_join=False,
                primary_dataset_ids=[str(agent.dataset_id)] if agent.dataset_id else [],
                recommended_semantic_views=[],
                analytical_strategy="SELECT * FROM primary_table LIMIT 100",
                confidence_score=0.1
            )

    async def get_duckdb_execution_context(self, db: Session, plan: QueryPlan) -> str:
        """
        Phase 4.5: The SQL Generator Payload.
        Translates the abstract QueryPlan into literal DuckDB syntax instructions.
        """
        if not plan.primary_dataset_ids:
            return "No valid datasets found for this query."

        context_fragments = []
        
        for d_id in plan.primary_dataset_ids:
            dataset = db.query(Dataset).filter(Dataset.id == d_id).first()
            if not dataset: continue
            
            # 1. Construct the literal Parquet path for DuckDB
            # e.g., read_parquet('sync/stripe/charges/**/*.parquet')
            parquet_path = f"read_parquet('{dataset.file_path}/**/*.parquet')"
            
            # 2. Extract Columns
            cols = dataset.schema_metadata.get("columns", []) if dataset.schema_metadata else []
            col_desc = ", ".join([f"{c.get('name')} {c.get('type')}" for c in cols])