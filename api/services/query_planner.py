"""
ARCLI.TECH - Intelligence Layer
Component: AI Query Planner (The Brain)
Strategy: Semantic Routing, Schema Pruning, Contextual RAG, Hybrid Intent Classification & Golden Metrics
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
    
    execution_intent: str = Field(
        ..., 
        description="MUST BE EXACTLY ONE OF: 'ANALYTICAL' (SQL math/aggregations), 'DOCUMENT_RAG' (PDF/Text summarization/search), or 'HYBRID' (Both structured math and unstructured text context)."
    )
    
    requires_cross_dataset_join: bool = Field(..., description="True if the question requires joining data across multiple structured datasets.")
    
    primary_dataset_ids: List[str] = Field(
        default_factory=list, 
        description="The exact UUIDs of the STRUCTURED Datasets required to answer this question. Leave empty if purely DOCUMENT_RAG."
    )
    
    primary_document_ids: List[str] = Field(
        default_factory=list,
        description="The exact UUIDs of the UNSTRUCTURED Documents (PDFs/Text) required. Leave empty if purely ANALYTICAL."
    )
    
    recommended_semantic_views: List[str] = Field(default_factory=list, description="Names of pre-computed views (e.g., 'vw_meta_ads_performance').")
    requested_governed_metrics: List[str] = Field(default_factory=list, description="Names of Governed Metrics (e.g., 'True ROAS') that perfectly match the user intent.")
    
    join_strategy: Optional[str] = Field(None, description="If joining structured data, specify the keys (e.g., 'ON shopify.customer_email = zendesk.email').")
    
    analytical_strategy: str = Field(
        ..., 
        description="Step-by-step logic the downstream execution engines should follow. If HYBRID, explain how to merge the SQL output with the Document RAG output."
    )
    
    confidence_score: float = Field(..., description="0.0 to 1.0 confidence that this question can be answered with the available data/documents.")


# -------------------------------------------------------------------------
# The Brain of Cross-Dataset & Hybrid Intelligence
# -------------------------------------------------------------------------

class QueryPlanner:
    """
    Phase 3 & 4: Hybrid Semantic Router & Strategy Engine.
    
    Engineering Upgrades:
    1. Intent Classification: Routes 'ANALYTICAL', 'DOCUMENT_RAG', or 'HYBRID' logic seamlessly.
    2. Schema Pruning: Formats nested Parquet metadata perfectly to save Token bloat.
    3. Contextual RAG: Injects both hardcoded SaaS views and Document vector metadata.
    4. Golden Metric Awareness: Defers complex math to the AST injector.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        """
        Adheres to Modular Strategy by accepting dependencies rather than 
        relying on global singletons.
        """
        self.llm_client = llm_client or default_llm

    async def plan_execution(self, db: Session, tenant_id: str, agent: Agent, natural_query: str) -> QueryPlan:
        """
        Analyzes a natural language question and outputs a mathematically precise execution plan
        across both Vector (Qdrant) and Relational (DuckDB) stores.
        """
        start_time = time.perf_counter()
        logger.info(f"🧠 [{tenant_id}] Planning execution for: '{natural_query}'")

        # 1. Context Retrieval (All Datasets & Documents)
        available_assets = db.query(Dataset).filter(
            Dataset.tenant_id == tenant_id,
            Dataset.status == "READY"
        ).all()
        
        if not available_assets:
            logger.warning(f"[{tenant_id}] No READY datasets or documents found. Planner will fail gracefully.")
            return self._generate_fallback_plan(agent)
            
        dataset_ids = [str(d.id) for d in available_assets]

        # 2. Context Retrieval (Semantic Catalog / Golden Metrics)
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

        # 3. Context Construction (Split Structured vs Unstructured)
        context_payload = self._build_context_payload(tenant_id, available_assets)

        # 4. Prompt Generation
        system_prompt = self._build_system_prompt(agent, context_payload, metrics_context)

        # 5. LLM Execution (Function Calling via Injected Client)
        try:
            plan = await self.llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=f"USER QUESTION: {natural_query}\nGenerate the optimal Hybrid QueryPlan.",
                response_model=QueryPlan,
                temperature=0.0 # Strict deterministic planning
            )
            
            # Security Gate: Ensure the LLM didn't hallucinate UUIDs or metrics
            valid_ids = {str(d.id) for d in available_assets}
            valid_metrics = {m["name"].lower() for m in metrics_context}
            
            plan.primary_dataset_ids = [d_id for d_id in plan.primary_dataset_ids if d_id in valid_ids]
            plan.primary_document_ids = [d_id for d_id in plan.primary_document_ids if d_id in valid_ids]
            plan.requested_governed_metrics = [m for m in plan.requested_governed_metrics if m.lower() in valid_metrics]
            
            duration = round(time.perf_counter() - start_time, 3)
            logger.info(f"✅ [{tenant_id}] Plan generated in {duration}s | Intent: {plan.execution_intent} | Confidence: {plan.confidence_score}")
            
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
            return "No valid structured datasets required for this query."

        context_fragments = []
        for d_id in plan.primary_dataset_ids:
            dataset = db.query(Dataset).filter(Dataset.id == d_id).first()
            if not dataset: 
                continue
            
            parquet_path = f"read_parquet('{dataset.file_path}/**/*.parquet')"
            cols = dataset.schema_metadata.get("columns", []) if dataset.schema_metadata else []
            col_desc = ", ".join([f"{c.get('name')} {c.get('type')}" for c in cols])
            table_alias = "".join(e for e in dataset.name.lower() if e.isalnum())
            
            context_fragments.append(
                f"-- Dataset: {dataset.integration_name or dataset.name}\n"
                f"-- Alias to use in FROM clause: {table_alias}\n"
                f"-- Physical Path: {parquet_path}\n"
                f"-- Schema: {col_desc}"
            )
            
        return "\n\n".join(context_fragments)

    # --- Private Helper Methods (Modularity & Token Efficiency) ---

    def _build_context_payload(self, tenant_id: str, assets: List[Dataset]) -> Dict[str, List[Dict[str, Any]]]:
        """
        Separates assets into Structured Analytics (DuckDB) and Unstructured Documents (Qdrant).
        """
        from api.services.sync_engine import INTEGRATION_REGISTRY
        
        structured = []
        unstructured = []
        
        for asset in assets:
            # Heuristic to separate unstructured documents (pushed to Qdrant) from structured datasets
            # Based on the URI scheme set by the Ingestion Pipeline
            is_unstructured = asset.file_path and asset.file_path.startswith("qdrant://")
            
            if is_unstructured:
                unstructured.append({
                    "document_id": str(asset.id),
                    "document_name": asset.name,
                    "description": asset.description or "Unstructured text document."
                })
            else:
                columns_meta = asset.schema_metadata.get("columns", []) if asset.schema_metadata else []
                col_strings = [f"{c.get('name')} ({c.get('type')})" for c in columns_meta]

                views = []
                if asset.integration_name and asset.integration_name in INTEGRATION_REGISTRY:
                    try:
                        connector_class = INTEGRATION_REGISTRY[asset.integration_name]
                        views = list(connector_class(tenant_id=tenant_id, credentials={}).get_semantic_views().keys())
                    except Exception:
                        pass

                structured.append({
                    "dataset_id": str(asset.id),
                    "integration": asset.integration_name,
                    "stream": asset.stream_name,
                    "description": asset.description or f"Raw structured data from {asset.integration_name}",
                    "available_columns": col_strings[:60], # Cap token bloat
                    "pre_computed_views": views
                })
            
        return {"structured_datasets": structured, "unstructured_documents": unstructured}

    def _build_system_prompt(self, agent: Agent, context_payload: Dict[str, Any], metrics_context: List[Dict[str, str]]) -> str:
        """
        Constructs the strict directive payload for the hybrid strategy agent.
        """
        return f"""
        You are the Head of AI Data Strategy for a modern analytical engine.
        Your goal is to classify a user's request and map it to the exact tables, views, metrics, or uploaded documents needed.
        
        AGENT ROLE & CONTEXT: 
        {agent.role_description}
        
        AVAILABLE CONTEXT ASSETS:
        {json.dumps(context_payload, indent=2)}

        GOVERNED SEMANTIC METRICS (THE GOLDEN CATALOG):
        {json.dumps(metrics_context, indent=2)}

        CRITICAL ROUTING DIRECTIVES:
        1. CLASSIFY THE INTENT: 
           - 'ANALYTICAL' -> Query asks for math, counts, revenue, or trends from `structured_datasets`.
           - 'DOCUMENT_RAG' -> Query asks to summarize, explain, or extract themes from `unstructured_documents`.
           - 'HYBRID' -> Query explicitly requires BOTH numbers from a database AND policy/context from a document.
           
        2. USE GOVERNED METRICS: If ANALYTICAL/HYBRID intent matches a metric in the Semantic Catalog (e.g., "ROAS"), include its name in `requested_governed_metrics`.
        
        3. STRICT DECISIVENESS: Select ONLY the UUIDs strictly required. Do not pull documents if the question is purely mathematical. Do not pull datasets if the question is purely about a PDF.
        
        4. QUERY VIABILITY: If the required documents or datasets simply do not exist in the available context, lower `confidence_score` below 0.4.
        """

    def _generate_fallback_plan(self, agent: Agent) -> QueryPlan:
        """Provides a safe fallback to prevent cascading orchestration failures."""
        return QueryPlan(
            intent_summary="Fallback execution triggered due to contextual resolution error.",
            execution_intent="ANALYTICAL",
            requires_cross_dataset_join=False,
            primary_dataset_ids=[str(agent.dataset_id)] if agent.dataset_id else [],
            primary_document_ids=[],
            recommended_semantic_views=[],
            requested_governed_metrics=[],
            analytical_strategy="SELECT * FROM primary_table LIMIT 100",
            confidence_score=0.1
        )