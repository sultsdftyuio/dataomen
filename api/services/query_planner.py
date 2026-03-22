"""
ARCLI.TECH - Intelligence Layer
Component: AI Query Planner (The Brain)
Strategy: Semantic Routing, Schema Pruning, Contextual RAG, & Golden Metrics Integration
"""

import logging
import json
import time
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_

# Core Infrastructure
from api.services.llm_client import LLMClient, llm_client as default_llm
from models import Dataset, Agent, SemanticMetric

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Data Contracts for Orchestration (Instructor/Pydantic Strictness)
# -------------------------------------------------------------------------

class QueryPlan(BaseModel):
    """
    The Strategic Blueprint for the AI Data Copilot.
    Guarantees the LLM returns a strictly typed JSON object via function calling.
    """
    intent_summary: str = Field(..., description="A 1-sentence summary of the user's analytical goal.")
    requires_cross_dataset_join: bool = Field(..., description="True if the question requires joining data across multiple SaaS platforms.")
    primary_dataset_ids: List[str] = Field(..., description="The exact UUIDs of the Datasets required to answer this question.")
    recommended_semantic_views: List[str] = Field(default_factory=list, description="Names of pre-computed views (e.g., 'vw_meta_ads_performance') that should be used instead of raw tables.")
    requested_governed_metrics: List[str] = Field(default_factory=list, description="Names of Governed Metrics (e.g., 'True ROAS') that perfectly match the user intent. The AST engine will auto-inject these.")
    join_strategy: Optional[str] = Field(None, description="If joining, specify the keys (e.g., 'ON shopify.customer_email = zendesk.email').")
    analytical_strategy: str = Field(..., description="Step-by-step logic the downstream SQL generator should follow, optimizing for columnar reads.")
    confidence_score: float = Field(..., description="0.0 to 1.0 confidence that this question can be answered with the available data.")


# -------------------------------------------------------------------------
# The Brain of Cross-Dataset Intelligence
# -------------------------------------------------------------------------

class QueryPlanner:
    """
    Phase 4: Semantic Router & Strategy Engine (Upgraded for Golden Metrics).
    
    Engineering Upgrades:
    1. Schema Pruning: Formats nested Parquet metadata perfectly to save Token bloat.
    2. Contextual RAG: Injects hardcoded SaaS views to prevent LLM hallucination.
    3. Golden Metric Awareness: Reads the Semantic Catalog so the AI defers complex math to the AST injector.
    4. DuckDB Dialect Prep: Configures the AI to think in high-performance analytical SQL.
    5. Dependency Injection: Uses injected LLM clients to prevent global state bleeding.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        """
        Adheres to Modular Strategy by accepting dependencies rather than 
        relying on global singletons.
        """
        self.llm_client = llm_client or default_llm

    async def plan_execution(self, db: Session, tenant_id: str, agent: Agent, natural_query: str) -> QueryPlan:
        """
        Analyzes a natural language question and outputs a mathematically precise execution plan.
        """
        start_time = time.perf_counter()
        logger.info(f"🧠 [{tenant_id}] Planning execution for: '{natural_query}'")

        # 1. Context Retrieval (Datasets)
        available_datasets = db.query(Dataset).filter(
            Dataset.tenant_id == tenant_id,
            Dataset.status == "READY"
        ).all()
        
        if not available_datasets:
            logger.warning(f"[{tenant_id}] No READY datasets found. Planner will fail gracefully.")
            return self._generate_fallback_plan(agent)
            
        dataset_ids = [str(d.id) for d in available_datasets]

        # 2. Context Retrieval (Semantic Catalog / Golden Metrics)
        # Fetch metrics specific to these datasets OR global metrics (dataset_id IS NULL)
        governed_metrics = db.query(SemanticMetric).filter(
            SemanticMetric.tenant_id == tenant_id,
            or_(
                SemanticMetric.dataset_id.in_(dataset_ids),
                SemanticMetric.dataset_id.is_(None)
            )
        ).all()

        metrics_context = [
            {"name": m.metric_name, "description": m.description} 
            for m in governed_metrics
        ]

        # 3. Context Construction (Schema Pruning & Semantic Views)
        context_payload = self._build_context_payload(tenant_id, available_datasets)

        # 4. Prompt Generation
        system_prompt = self._build_system_prompt(agent, context_payload, metrics_context)

        # 5. LLM Execution (Function Calling via Injected Client)
        try:
            plan = await self.llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=f"USER QUESTION: {natural_query}\nGenerate the optimal QueryPlan.",
                response_model=QueryPlan,
                temperature=0.0 # Strict deterministic planning
            )
            
            # Security Gate: Ensure the LLM didn't hallucinate random dataset UUIDs or metrics
            valid_ids = {str(d.id) for d in available_datasets}
            valid_metrics = {m["name"].lower() for m in metrics_context}
            
            plan.primary_dataset_ids = [d_id for d_id in plan.primary_dataset_ids if d_id in valid_ids]
            plan.requested_governed_metrics = [m for m in plan.requested_governed_metrics if m.lower() in valid_metrics]
            
            duration = round(time.perf_counter() - start_time, 3)
            logger.info(f"✅ [{tenant_id}] Plan generated in {duration}s (Confidence: {plan.confidence_score}). Metrics requested: {plan.requested_governed_metrics}")
            
            return plan

        except Exception as e:
            logger.error(f"❌ [{tenant_id}] Query planning failed: {str(e)}", exc_info=True)
            return self._generate_fallback_plan(agent)

    async def get_duckdb_execution_context(self, db: Session, plan: QueryPlan) -> str:
        """
        Phase 4.5: The SQL Generator Payload.
        Translates the abstract QueryPlan into literal DuckDB syntax instructions 
        for the final NL2SQL generation step.
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
            
            # 2. Extract Columns safely
            cols = dataset.schema_metadata.get("columns", []) if dataset.schema_metadata else []
            col_desc = ", ".join([f"{c.get('name')} {c.get('type')}" for c in cols])
            
            table_alias = "".join(e for e in dataset.name.lower() if e.isalnum())
            
            context_fragments.append(
                f"-- Dataset: {dataset.integration_name} / {dataset.stream_name}\n"
                f"-- Alias to use in FROM clause: {table_alias}\n"
                f"-- Physical Path: {parquet_path}\n"
                f"-- Schema: {col_desc}"
            )
            
        return "\n\n".join(context_fragments)

    # --- Private Helper Methods (Modularity & Token Efficiency) ---

    def _build_context_payload(self, tenant_id: str, datasets: List[Dataset]) -> List[Dict[str, Any]]:
        """
        Constructs a highly compressed JSON context window of schemas to avoid LLM token limits.
        """
        # Localized import prevents circular dependency loops in routing
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

    def _build_system_prompt(self, agent: Agent, context_payload: List[Dict[str, Any]], metrics_context: List[Dict[str, str]]) -> str:
        """
        Constructs the strict directive payload for the strategy agent, including Golden Metrics.
        """
        return f"""
        You are the Head of Data Strategy for a modern Zero-ETL analytical engine powered by DuckDB.
        Your goal is to map a user's natural language analytical request to the exact tables, views, and semantic metrics needed.
        
        AGENT ROLE & CONTEXT: 
        {agent.role_description}
        
        AVAILABLE DATASETS (PARQUET/DUCKDB TABLES):
        {json.dumps(context_payload, indent=2)}

        GOVERNED SEMANTIC METRICS (THE GOLDEN CATALOG):
        {json.dumps(metrics_context, indent=2)}

        CRITICAL DIRECTIVES:
        1. USE GOVERNED METRICS FIRST: If the user's intent matches a metric in the Semantic Catalog (e.g., "ROAS", "CAC"), you MUST include its name in `requested_governed_metrics`. DO NOT try to manually calculate it; the downstream engine will safely inject the AST.
        2. CROSS-PLATFORM JOINS: If the request compares cross-domain metrics, you MUST select all required `primary_dataset_ids` and set `requires_cross_dataset_join` to true.
        3. SEMANTIC VIEWS: If a dataset contains a 'pre_computed_views' entry that solves the intent, heavily recommend it.
        4. STRICT DECISIVENESS: Select ONLY the `primary_dataset_ids` strictly required. Exclude unrelated datasets.
        5. QUERY VIABILITY: If the question fundamentally cannot be answered with the available columns and metrics, lower the `confidence_score` below 0.4.
        """

    def _generate_fallback_plan(self, agent: Agent) -> QueryPlan:
        """Provides a safe fallback to prevent cascading orchestration failures."""
        return QueryPlan(
            intent_summary="Fallback execution triggered due to contextual resolution error.",
            requires_cross_dataset_join=False,
            primary_dataset_ids=[str(agent.dataset_id)] if agent.dataset_id else [],
            recommended_semantic_views=[],
            requested_governed_metrics=[],
            analytical_strategy="SELECT * FROM primary_table LIMIT 100",
            confidence_score=0.1
        )