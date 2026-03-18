"""
ARCLI.TECH - Intelligence Layer
Component: AI Query Planner (The Brain)
Strategy: Semantic Routing, Schema Pruning, & Contextual RAG
"""

import logging
import json
import time
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Core Infrastructure
from api.services.llm_client import llm_client
from models import Dataset, Agent

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
    analytical_strategy: str = Field(..., description="Step-by-step logic the downstream SQL generator should follow, optimizing for columnar reads.")
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
    4. Modular Execution: Logic extracted into pure functional helpers for testability.
    """

    async def plan_execution(self, db: Session, tenant_id: str, agent: Agent, natural_query: str) -> QueryPlan:
        """
        Analyzes a natural language question and outputs a mathematically precise execution plan.
        """
        start_time = time.perf_counter()
        logger.info(f"🧠 [{tenant_id}] Planning execution for: '{natural_query}'")

        # 1. Context Retrieval
        available_datasets = db.query(Dataset).filter(
            Dataset.tenant_id == tenant_id,
            Dataset.status == "READY"
        ).all()
        
        if not available_datasets:
            logger.warning(f"[{tenant_id}] No READY datasets found. Planner will fail gracefully.")
            return self._generate_fallback_plan(agent)

        # 2. Context Construction (Schema Pruning & Semantic Views)
        context_payload = self._build_context_payload(tenant_id, available_datasets)

        # 3. Prompt Generation
        system_prompt = self._build_system_prompt(agent, context_payload)

        # 4. LLM Execution (Function Calling)
        try:
            plan = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=f"USER QUESTION: {natural_query}\nGenerate the optimal QueryPlan.",
                response_model=QueryPlan,
                temperature=0.0 # Strict deterministic planning
            )
            
            # Security Gate: Ensure the LLM didn't hallucinate random dataset UUIDs
            valid_ids = {str(d.id) for d in available_datasets}
            plan.primary_dataset_ids = [d_id for d_id in plan.primary_dataset_ids if d_id in valid_ids]
            
            duration = round(time.perf_counter() - start_time, 3)
            logger.info(f"✅ [{tenant_id}] Plan generated in {duration}s (Confidence: {plan.confidence_score}). Cross-Join: {plan.requires_cross_dataset_join}")
            
            return plan

        except Exception as e:
            logger.error(f"❌ [{tenant_id}] Query planning failed: {str(e)}", exc_info=True)
            return self._generate_fallback_plan(agent)

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
            if not dataset: 
                continue
            
            # 1. Construct the literal Parquet path for DuckDB
            # Secure path formatting mapping to the analytical layer
            parquet_path = f"read_parquet('{dataset.file_path}/**/*.parquet')"
            
            # 2. Extract Columns
            cols = dataset.schema_metadata.get("columns", []) if dataset.schema_metadata else []
            col_desc = ", ".join([f"{c.get('name')} {c.get('type')}" for c in cols])
            
            context_fragments.append(f"-- Dataset: {dataset.integration_name} / {dataset.stream_name}\n"
                                     f"-- Path: {parquet_path}\n"
                                     f"-- Schema: {col_desc}")
            
        return "\n\n".join(context_fragments)

    # --- Private Helper Methods (Modularity & Token Efficiency) ---

    def _build_context_payload(self, tenant_id: str, datasets: List[Dataset]) -> List[Dict[str, Any]]:
        """
        Constructs a highly compressed JSON context window of schemas to avoid LLM token limits.
        Defers import of INTEGRATION_REGISTRY to prevent module initialization circular loops.
        """
        # Localized import prevents circular dependency: query_planner -> sync_engine -> watchdog -> narrative -> query_planner
        from api.services.sync_engine import INTEGRATION_REGISTRY
        
        payload = []
        for d in datasets:
            # 1. Token-Efficient Schema Pruning
            columns_meta = d.schema_metadata.get("columns", []) if d.schema_metadata else []
            col_strings = [f"{c.get('name')} ({c.get('type')})" for c in columns_meta]

            # 2. Dynamic Fetching of Contextual Views
            views = []
            if d.integration_name and d.integration_name in INTEGRATION_REGISTRY:
                try:
                    connector_class = INTEGRATION_REGISTRY[d.integration_name]
                    dummy_connector = connector_class(tenant_id=tenant_id, credentials={})
                    views_dict = dummy_connector.get_semantic_views()
                    views = list(views_dict.keys())
                except Exception as e:
                    logger.debug(f"Could not fetch semantic views for {d.integration_name}: {str(e)}")

            payload.append({
                "dataset_id": str(d.id),
                "integration": d.integration_name,
                "stream": d.stream_name,
                "description": d.description or f"Raw data from {d.integration_name}",
                "available_columns": col_strings[:60], # Hard cap to prevent context window overflow
                "pre_computed_views": views
            })
            
        return payload

    def _build_system_prompt(self, agent: Agent, context_payload: List[Dict[str, Any]]) -> str:
        """
        Constructs the strict directive payload for the strategy agent.
        """
        return f"""
        You are the Head of Data Strategy for a modern Zero-ETL analytical engine powered by DuckDB.
        Your goal is to map a user's natural language analytical request to the exact tables, views, and execution paths needed.
        
        AGENT ROLE & CONTEXT: 
        {agent.role_description}
        
        AVAILABLE DATASETS (PARQUET/DUCKDB TABLES):
        {json.dumps(context_payload, indent=2)}

        CRITICAL DIRECTIVES:
        1. CROSS-PLATFORM JOINS: If the request compares cross-domain metrics (e.g., "Marketing Spend vs Stripe Revenue", "CAC", "ROAS"), you MUST join the Marketing dataset with the Revenue dataset using standard date truncations.
        2. SEMANTIC VIEWS FIRST: If a dataset contains a 'pre_computed_views' entry that solves the user's intent, heavily recommend it to the downstream SQL generator over raw event tables.
        3. STRICT DECISIVENESS: Select ONLY the `primary_dataset_ids` strictly required. Exclude unrelated datasets.
        4. MATHEMATICAL PRECISION: If defining `analytical_strategy`, prefer vectorized operations, window functions, and proper handling of NULLs.
        5. QUERY VIABILITY: If the question fundamentally cannot be answered with the available columns, lower the `confidence_score` below 0.4.
        """

    def _generate_fallback_plan(self, agent: Agent) -> QueryPlan:
        """Provides a safe fallback to prevent cascading orchestration failures."""
        return QueryPlan(
            intent_summary="Fallback execution triggered due to contextual resolution error.",
            requires_cross_dataset_join=False,
            primary_dataset_ids=[str(agent.dataset_id)] if agent.dataset_id else [],
            recommended_semantic_views=[],
            analytical_strategy="SELECT * FROM primary_table LIMIT 100",
            confidence_score=0.1
        )