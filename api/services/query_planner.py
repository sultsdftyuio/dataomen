"""
ARCLI.TECH - Intelligence Layer
Component: AI Query Planner (The Brain)
Strategy: Semantic Routing, Strict 1-to-1 Schema Pruning, Contextual RAG & Golden Metrics
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
    Phase 3 Update: Strictly enforces 1-to-1 boundary. No cross-joins allowed.
    """
    intent_summary: str = Field(..., description="A 1-sentence summary of the user's analytical goal.")
    
    execution_intent: str = Field(
        ..., 
        description="MUST BE EXACTLY ONE OF: 'ANALYTICAL' (SQL math/aggregations), 'DOCUMENT_RAG' (PDF/Text summarization), or 'HYBRID'."
    )
    
    # Ripped out arrays. Single target identifiers only.
    dataset_id: Optional[str] = Field(None, description="The exact UUID of the structured dataset, if applicable.")
    document_id: Optional[str] = Field(None, description="The exact UUID of the unstructured document, if applicable.")
    
    recommended_semantic_views: List[str] = Field(default_factory=list, description="Names of pre-computed views (e.g., 'vw_meta_ads_performance').")
    requested_governed_metrics: List[str] = Field(default_factory=list, description="Names of Governed Metrics (e.g., 'True ROAS') that perfectly match the user intent.")
    
    analytical_strategy: str = Field(
        ..., 
        description="Step-by-step logic the downstream execution engines should follow against the singular schema."
    )
    
    confidence_score: float = Field(..., description="0.0 to 1.0 confidence that this question can be answered with the provided schema.")


# -------------------------------------------------------------------------
# The Brain of Isolated Intelligence
# -------------------------------------------------------------------------

class QueryPlanner:
    """
    Phase 3: Strict Semantic Router & Strategy Engine.
    
    Engineering Upgrades:
    1. 1-to-1 Constraint: Removed all cross-dataset hallucination risks.
    2. Zero-Fetch Context: Relies on the router to inject the authorized schema.
    3. Golden Metric Awareness: Defers complex math to the AST injector.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or default_llm

    async def plan_execution(
        self, 
        db: Session, 
        tenant_id: str, 
        agent: Agent, 
        natural_query: str,
        schema_context: Dict[str, Any] # Phase 3: The isolated schema injected by the router
    ) -> QueryPlan:
        """
        Analyzes a natural language question against a single, isolated schema 
        to output a mathematically precise execution plan.
        """
        start_time = time.perf_counter()
        logger.info(f"🧠 [{tenant_id}] Planning isolated execution for: '{natural_query}'")

        # 1. Context Retrieval (Semantic Catalog / Golden Metrics ONLY)
        # We no longer query for datasets, we use the injected schema!
        governed_metrics = db.query(SemanticMetric).filter(
            SemanticMetric.tenant_id == tenant_id,
            or_(
                SemanticMetric.dataset_id == agent.dataset_id,
                SemanticMetric.dataset_id.is_(None)
            )
        ).all()

        metrics_context = [
            {"name": m.metric_name, "description": m.description} 
            for m in governed_metrics
        ]

        # 2. Prompt Generation
        system_prompt = self._build_system_prompt(agent, schema_context, metrics_context)

        # 3. LLM Execution
        try:
            plan = await self.llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=f"USER QUESTION: {natural_query}\nGenerate the optimal strict QueryPlan.",
                response_model=QueryPlan,
                temperature=0.0 # Strict deterministic planning
            )
            
            # Re-enforce the 1-to-1 ID from the agent just in case the LLM hallucinates an ID
            if agent.dataset_id:
                plan.dataset_id = str(agent.dataset_id)
            if agent.document_id:
                plan.document_id = str(agent.document_id)
            
            duration = round(time.perf_counter() - start_time, 3)
            logger.info(f"✅ [{tenant_id}] Plan generated in {duration}s | Intent: {plan.execution_intent} | Confidence: {plan.confidence_score}")
            
            return plan

        except Exception as e:
            logger.error(f"❌ [{tenant_id}] Query planning failed: {str(e)}", exc_info=True)
            return self._generate_fallback_plan(agent)

    async def get_duckdb_execution_context(self, db: Session, plan: QueryPlan) -> str:
        """
        Translates the abstract QueryPlan into literal DuckDB syntax instructions
        for the single authorized dataset.
        """
        if not plan.dataset_id:
            return "No valid structured dataset required for this query."

        dataset = db.query(Dataset).filter(Dataset.id == plan.dataset_id).first()
        if not dataset: 
            return "Dataset configuration missing or unauthorized."
        
        parquet_path = f"read_parquet('{dataset.file_path}/**/*.parquet')"
        cols = dataset.schema_metadata.get("columns", []) if dataset.schema_metadata else []
        col_desc = ", ".join([f"{c.get('name')} {c.get('type')}" for c in cols])
        table_alias = "".join(e for e in dataset.name.lower() if e.isalnum())
        
        return (
            f"-- Dataset: {dataset.integration_name or dataset.name}\n"
            f"-- Alias to use in FROM clause: {table_alias}\n"
            f"-- Physical Path: {parquet_path}\n"
            f"-- Schema: {col_desc}"
        )

    # --- Private Helper Methods ---

    def _build_system_prompt(self, agent: Agent, schema_context: Dict[str, Any], metrics_context: List[Dict[str, str]]) -> str:
        """
        Constructs the strict directive payload bounded absolutely to one schema.
        """
        return f"""
        You are the Head of AI Data Strategy for a modern analytical engine.
        Your goal is to classify a user's request and map it to the exact tables, views, or metrics in the provided isolated schema context.
        
        AGENT ROLE & DIRECTIVES: 
        {agent.role_description}
        
        AUTHORIZED ISOLATED SCHEMA:
        {json.dumps(schema_context, indent=2)}

        GOVERNED SEMANTIC METRICS (THE GOLDEN CATALOG):
        {json.dumps(metrics_context, indent=2)}

        CRITICAL ROUTING DIRECTIVES:
        1. CLASSIFY THE INTENT: 
           - 'ANALYTICAL' -> Query asks for math, counts, revenue, or trends from the schema.
           - 'DOCUMENT_RAG' -> Query asks to summarize, explain, or extract themes.
           
        2. USE GOVERNED METRICS: If ANALYTICAL intent matches a metric in the Semantic Catalog (e.g., "ROAS"), include its name in `requested_governed_metrics`.
        
        3. STRICT DECISIVENESS: You are evaluating against ONE authorized schema. Do not invent columns or tables outside of what is provided.
        
        4. QUERY VIABILITY: If the schema does not contain the fields required to answer the question, lower `confidence_score` below 0.4.
        """

    def _generate_fallback_plan(self, agent: Agent) -> QueryPlan:
        """Provides a safe fallback to prevent cascading orchestration failures."""
        return QueryPlan(
            intent_summary="Fallback execution triggered due to contextual resolution error.",
            execution_intent="ANALYTICAL",
            dataset_id=str(agent.dataset_id) if agent.dataset_id else None,
            document_id=str(agent.document_id) if agent.document_id else None,
            recommended_semantic_views=[],
            requested_governed_metrics=[],
            analytical_strategy="SELECT * FROM primary_table LIMIT 100",
            confidence_score=0.1
        )