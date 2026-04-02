"""
ARCLI.TECH - Intelligence Layer
Component: Omni-Graph Query Planner & Semantic Budget Governor
Strategy: Semantic Routing, Schema Pruning, Contextual RAG & Semantic Budgeting
"""

import logging
import json
import time
import asyncio
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_

# Arcli Core Infrastructure
from api.services.llm_client import LLMClient, llm_client as default_llm
from models import Dataset, Agent, SemanticMetric

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# DATA CONTRACTS (Phase 3: Omniscient Chat & Budgeting)
# -------------------------------------------------------------------------

class QueryPlan(BaseModel):
    """
    The Strategic Blueprint for the AI Data Copilot.
    Strictly typed for declarative orchestration and guaranteed JSON compliance.
    """
    intent_summary: str = Field(
        ..., 
        description="A precise, 1-sentence summary of the user's analytical goal."
    )
    execution_intent: str = Field(
        ..., 
        description="MUST BE EXACTLY ONE OF: 'ANALYTICAL' (SQL math/aggregations), 'DOCUMENT_RAG' (Text extraction), or 'HYBRID'."
    )
    
    # Phase 1: Omni-Graph Support
    target_dataset_ids: List[str] = Field(
        default_factory=list, 
        description="List of exact UUIDs of the structured datasets required to fulfill the intent."
    )
    document_ids: List[str] = Field(
        default_factory=list, 
        description="List of exact UUIDs of unstructured documents, if applicable."
    )
    
    # Phase 3: Semantic Query Layer
    context_filters: Dict[str, Any] = Field(
        default_factory=dict, 
        description="Global filters extracted from context (e.g., {'tier': 'Enterprise', 'date_range': 'last_30_days'})."
    )
    
    requested_governed_metrics: List[str] = Field(
        default_factory=list, 
        description="Names of Governed Metrics (e.g., 'True ROAS') mapped from the Semantic Catalog."
    )
    analytical_strategy: str = Field(
        ..., 
        description="Step-by-step logic the execution engines should follow. Emphasize vectorization and strict joins."
    )
    confidence_score: float = Field(
        ..., 
        description="0.0 to 1.0 confidence that the provided schema fully answers the query."
    )
    is_budget_exceeded: bool = Field(
        default=False, 
        description="Flag triggered if the required Omni-Graph join exceeds the Semantic Budget."
    )

# -------------------------------------------------------------------------
# THE INTELLIGENCE ORCHESTRATOR
# -------------------------------------------------------------------------

class QueryPlanner:
    """
    Phase 3: Semantic Router & Strategy Engine.
    
    Engineering Upgrades:
    1. Async Event-Loop Safety: Offloads blocking DB queries to threadpools.
    2. Zero-Trust Security: Enforces tenant_id isolation on all LLM-generated UUIDs.
    3. Token Efficiency: Minifies JSON schemas to drastically reduce prompt overhead.
    4. Safe SQL Hydration: Escapes context filters to prevent DuckDB injection.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or default_llm
        self.MAX_SCHEMA_TOKENS = 8000  # Token limit to prevent Context Window bloat

    async def plan_execution(
        self, 
        db: Session, 
        tenant_id: str, 
        agent: Agent, 
        natural_query: str,
        schema_context: Dict[str, Any]
    ) -> QueryPlan:
        """
        Analyzes a natural language question against authorized schemas.
        Generates a secure, performant routing strategy.
        """
        start_time = time.perf_counter()
        logger.info(f"🧠 [{tenant_id}] Planning Omni-Graph execution for agent '{agent.id}'")

        # 1. Semantic Budgeting (Token Efficiency)
        # Use separators=(',', ':') to strip whitespace and minimize token footprint
        schema_string = json.dumps(schema_context, separators=(',', ':'))
        
        # Heuristic token estimation (average English token is ~4 chars)
        estimated_tokens = len(schema_string) / 4.0 
        
        if estimated_tokens > self.MAX_SCHEMA_TOKENS:
            logger.warning(f"[{tenant_id}] Schema Context too large ({estimated_tokens:.0f} tokens). Enforcing strict pruning.")
            # Fallback to prevent LLM rejection
            schema_context = {"error": "Schema truncated due to context limits. Query against core tables only."}

        # 2. Extract Governed Metrics Safely (Offload sync DB I/O to thread)
        governed_metrics = await asyncio.to_thread(
            self._fetch_governed_metrics, db, tenant_id, agent.dataset_id
        )
        metrics_context = [{"name": m.metric_name, "description": m.description} for m in governed_metrics]

        # 3. LLM Execution via Structured RAG
        system_prompt = self._build_system_prompt(agent, schema_context, metrics_context)

        try:
            plan: QueryPlan = await self.llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=f"USER INTENT: {natural_query}\nGenerate the optimal execution QueryPlan.",
                response_model=QueryPlan,
                temperature=0.0 # Zero entropy for strict technical mapping
            )
            
            # Enforce multi-tenant dataset bounds securely
            if agent.dataset_id and str(agent.dataset_id) not in plan.target_dataset_ids:
                plan.target_dataset_ids.append(str(agent.dataset_id))
            
            # Budget enforcement logic based on planned complexity
            if len(plan.target_dataset_ids) > 3:
                plan.is_budget_exceeded = True
                plan.confidence_score *= 0.8
                logger.warning(f"[{tenant_id}] Omni-Graph join budget exceeded (>3 datasets). Confidence reduced.")

            duration = time.perf_counter() - start_time
            logger.info(f"✅ [{tenant_id}] Strategy planned in {duration:.3f}s | Intent: {plan.execution_intent} | Confidence: {plan.confidence_score:.2f}")
            
            return plan

        except Exception as e:
            logger.error(f"❌ [{tenant_id}] Query planning failed: {str(e)}", exc_info=True)
            # In production, we might want to raise an HTTPException here instead of failing silently,
            # but we preserve the fallback for architectural resilience.
            return self._generate_fallback_plan(agent)

    async def get_duckdb_execution_context(
        self, 
        db: Session, 
        tenant_id: str, 
        plan: QueryPlan
    ) -> str:
        """
        Translates the abstract QueryPlan into physical DuckDB instructions.
        Crucially enforces Tenant Isolation on LLM-requested datasets.
        """
        if not plan.target_dataset_ids:
            return "-- No structured datasets targeted for this query execution."

        # Offload DB I/O and enforce Zero-Trust Tenant Boundaries
        datasets = await asyncio.to_thread(
            self._fetch_authorized_datasets, db, tenant_id, plan.target_dataset_ids
        )
        
        if not datasets: 
            return "-- Datasets configuration missing or unauthorized."
        
        context_blocks = []
        for ds in datasets:
            parquet_path = f"read_parquet('{ds.file_path}/**/*.parquet')"
            cols = ds.schema_metadata.get("columns", []) if ds.schema_metadata else []
            col_desc = ", ".join([f"{c.get('name')} {c.get('type')}" for c in cols])
            table_alias = "".join(e for e in ds.name.lower() if e.isalnum())
            
            block = (
                f"-- Dataset: {ds.integration_name or ds.name}\n"
                f"-- Omni-Graph Alias: {table_alias}\n"
                f"-- Physical Source: {parquet_path}\n"
                f"-- Schema Bounds: {col_desc}"
            )
            context_blocks.append(block)
            
        # Append global context filters with strict SQL escaping
        if plan.context_filters:
            safe_filters = []
            for k, v in plan.context_filters.items():
                safe_k = "".join(c for c in str(k) if c.isalnum() or c == "_")
                # Escape single quotes to prevent DuckDB SQL Injection
                safe_v = str(v).replace("'", "''") 
                safe_filters.append(f"{safe_k} = '{safe_v}'")
                
            filter_str = " AND ".join(safe_filters)
            context_blocks.append(f"-- GLOBAL STATE FILTERS TO APPLY: {filter_str}")
        
        return "\n\n".join(context_blocks)

    # -------------------------------------------------------------------------
    # INTERNAL HELPERS (Data Access & Formatting)
    # -------------------------------------------------------------------------

    def _fetch_governed_metrics(self, db: Session, tenant_id: str, dataset_id: Optional[str]) -> List[SemanticMetric]:
        """Synchronous method to run inside threadpool."""
        return db.query(SemanticMetric).filter(
            SemanticMetric.tenant_id == tenant_id,
            or_(
                SemanticMetric.dataset_id == dataset_id,
                SemanticMetric.dataset_id.is_(None) # Global Omni-Metrics
            )
        ).all()

    def _fetch_authorized_datasets(self, db: Session, tenant_id: str, dataset_ids: List[str]) -> List[Dataset]:
        """
        Synchronous method to run inside threadpool.
        CRITICAL: Validates dataset_ids strictly against the tenant_id.
        """
        return db.query(Dataset).filter(
            Dataset.id.in_(dataset_ids),
            Dataset.tenant_id == tenant_id  # Secures against Cross-Tenant Data Mapping
        ).all()

    def _build_system_prompt(self, agent: Agent, schema_context: Dict[str, Any], metrics_context: List[Dict[str, str]]) -> str:
        """Constructs the strictly bounded prompt payload with minified JSON contexts."""
        return f"""
You are the Arcli Execution Orchestrator.
Your objective is to map a user's analytical intent to the exact physical tables and governed semantic metrics provided.
        
AGENT DOMAIN: 
{agent.role_description}
        
AUTHORIZED PHYSICAL SCHEMAS:
{json.dumps(schema_context, separators=(',', ':'))}

GOVERNED SEMANTIC METRICS (THE GOLDEN CATALOG):
{json.dumps(metrics_context, separators=(',', ':'))}

COMMANDMENTS:
1. CLASSIFICATION: 
   - 'ANALYTICAL': Math, revenue, time-series, or multi-source correlations.
   - 'DOCUMENT_RAG': Explanations, text synthesis.
2. GOLDEN METRICS OVER RAW SQL: If an intent matches a Semantic Metric (e.g., 'True ROAS'), list it in `requested_governed_metrics`. Do NOT attempt to rewrite the formula. The system will auto-inject it.
3. GLOBAL FILTERS: Extract overarching constraints (e.g., 'Only show US data') into `context_filters`.
4. OMNI-GRAPH AWARENESS: If the intent requires joining across multiple schemas provided, list all required dataset IDs.
5. BOUNDARY ENFORCEMENT: Never invent tables or columns. Drop confidence < 0.4 if the schema cannot fulfill the request.
"""

    def _generate_fallback_plan(self, agent: Agent) -> QueryPlan:
        """Graceful degradation to prevent orchestration loops."""
        return QueryPlan(
            intent_summary="Fallback execution triggered due to contextual evaluation failure.",
            execution_intent="ANALYTICAL",
            target_dataset_ids=[str(agent.dataset_id)] if agent.dataset_id else [],
            document_ids=[str(agent.document_id)] if agent.document_id else [],
            context_filters={},
            requested_governed_metrics=[],
            analytical_strategy="SELECT * FROM base_table LIMIT 100",
            confidence_score=0.1,
            is_budget_exceeded=False
        )

# Global Singleton Instantiation
query_planner = QueryPlanner()