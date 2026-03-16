# api/services/semantic_router.py

import logging
import json
import time
import asyncio
import re
from typing import List, Dict, Any, Literal, Optional, Tuple, Union
from datetime import datetime

import polars as pl
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Core Modular Orchestrators & Services
from api.services.llm_client import llm_client
from api.services.query_planner import QueryPlanner, QueryPlan
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import compute_engine
from api.services.metric_governance import metric_governance_service
from api.services.insight_orchestrator import InsightOrchestrator, InsightPayload
from api.services.narrative_service import narrative_service
from api.services.cache_manager import cache_manager
from api.services.storage_manager import storage_manager

# Models & Database
from models import Dataset, QueryHistory, Organization
from api.database import SessionLocal

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Data Contracts (The Brain's Communication Protocols)
# -------------------------------------------------------------------------

class RouteDecision(BaseModel):
    """
    Structured output schema for the Master Router's intent recognition.
    Forces the AI to think through the execution path before committing.
    """
    reasoning: str = Field(
        ..., 
        description="Step-by-step logic explaining the chosen route and dataset selection."
    )
    route: Literal["GENERAL_CHAT", "ANALYTICAL_QUERY", "COMPLEX_COMPUTATION", "METRIC_DEFINITION"] = Field(
        ..., 
        description="The target engine. METRIC_DEFINITION is used for NL Data Modeling."
    )
    intent_summary: str = Field(
        ..., 
        description="A concise summary of what the user wants to achieve."
    )
    confidence_score: float = Field(
        ..., 
        ge=0.0, le=1.0, 
        description="Confidence in this routing decision."
    )
    required_dataset_ids: List[str] = Field(
        default_factory=list, 
        description="Dataset IDs (UUIDs) strictly required. Supports multiple for auto-joins."
    )
    cross_dataset_join_required: bool = Field(
        default=False, 
        description="True if the query requires combining data from multiple sources."
    )

class RouterExecutionPayload(BaseModel):
    """The unified response format for the frontend UI."""
    type: Literal["text", "chart", "table", "insight", "metric_confirmed"]
    message: str
    data: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = None
    chart_spec: Optional[Dict[str, Any]] = None
    sql_used: Optional[str] = None
    execution_time_ms: float = 0.0
    metadata: Dict[str, Any] = {}

# -------------------------------------------------------------------------
# Phase 10: The Master Intelligence Hub (Semantic Router V2)
# -------------------------------------------------------------------------

class SemanticRouter:
    """
    The Orchestration Brain of DataOmen.
    
    Features:
    - AI Data Copilot: Maintains conversational context and intent.
    - Natural Language Data Modeling: Routes to Metric Governance for definition.
    - Cross-Dataset Intelligence: Automatically detects and handles joins.
    - Governed Injection: Uses AST manipulation to inject verified metrics into SQL.
    - Performance Layer: Integrated caching and vectorized execution.
    """

    def __init__(self):
        # Instantiate sub-agents
        self.planner = QueryPlanner()
        self.generator = NL2SQLGenerator()
        self.insight_engine = InsightOrchestrator()
        
        # Configuration
        self.CONFIDENCE_THRESHOLD = 0.70
        self.MAX_CONTEXT_TURNS = 5

    # ==========================================
    # INTERNAL CONTEXT & SCHEMA UTILITIES
    # ==========================================

    async def _get_authorized_schemas(self, db: Session, tenant_id: str, dataset_ids: List[str]) -> Dict[str, Any]:
        """
        Fetches full metadata and schemas with strict tenant isolation.
        """
        datasets = db.query(Dataset).filter(
            Dataset.id.in_(dataset_ids),
            Dataset.tenant_id == tenant_id
        ).all()

        schema_context = {}
        for ds in datasets:
            # We use the dataset ID or Name as the logical table name
            table_key = f"dataset_{str(ds.id).replace('-', '_')}"
            schema_context[table_key] = ds.schema_metadata or {}
            
        return {
            "datasets": datasets,
            "schema_context": schema_context
        }

    def _summarize_catalog_for_routing(self, datasets: List[Dataset]) -> str:
        """
        Entity-Level Summarization: Prevents token bloat by giving the router 
        only high-level intent context. Deep schema is left for the NL2SQL stage.
        """
        catalog = []
        for ds in datasets:
            catalog.append({
                "id": str(ds.id),
                "name": ds.name,
                "description": ds.description or "No description.",
                "sample_columns": list((ds.schema_metadata or {}).keys())[:10]
            })
        return json.dumps(catalog, indent=2)

    # ==========================================
    # MAIN ORCHESTRATION CYCLE (The Copilot)
    # ==========================================

    async def process_copilot_request(
        self,
        db: Session,
        tenant_id: str,
        user_prompt: str,
        chat_history: List[Dict[str, str]],
        active_dataset_ids: List[str]
    ) -> RouterExecutionPayload:
        """
        Main entry point for the Conversational AI Copilot.
        Orchestrates Decision -> Planning -> Injection -> Execution -> Narrative.
        """
        t0 = time.perf_counter()
        logger.info(f"[{tenant_id}] Copilot processing request: '{user_prompt[:50]}...'")

        # 1. FETCH CATALOG CONTEXT
        # We fetch all active datasets to let the router choose the best source
        all_active_ds = db.query(Dataset).filter(
            Dataset.id.in_(active_dataset_ids),
            Dataset.tenant_id == tenant_id
        ).all()

        # 2. INTENT RECOGNITION (The Routing Decision)
        catalog_summary = self._summarize_catalog_for_routing(all_active_ds)
        
        system_routing_prompt = f"""
        You are the Master Intelligence Router for DataOmen. Analyze the conversation and user prompt.
        
        ACTIVE CATALOG:
        {catalog_summary}
        
        ROUTES:
        - ANALYTICAL_QUERY: Questions requiring data extraction, charts, or summaries.
        - COMPLEX_COMPUTATION: Forecasting, anomaly deep-dives, or advanced math.
        - METRIC_DEFINITION: When the user wants to define a new business term (e.g. "Define MAU as...").
        - GENERAL_CHAT: Greetings, platform help, or unrelated topics.
        
        If multiple datasets are needed to answer a single question (e.g. Sales + Marketing), 
        include both IDs and set cross_dataset_join_required to true.
        """

        try:
            decision: RouteDecision = await llm_client.generate_structured(
                system_prompt=system_routing_prompt,
                prompt=user_prompt,
                history=chat_history[-self.MAX_CONTEXT_TURNS:],
                response_model=RouteDecision
            )
            logger.info(f"[{tenant_id}] Router Decision: {decision.route} ({decision.confidence_score*100:.0f}%)")
        except Exception as e:
            logger.error(f"Routing logic failed: {e}")
            return RouterExecutionPayload(type="text", message="I'm sorry, I had trouble understanding that request. Could you rephrase?")

        # 3. GUARDRAILS & ROUTING DELEGATION
        if decision.confidence_score < self.CONFIDENCE_THRESHOLD:
            return RouterExecutionPayload(type="text", message="I understand you're asking about data, but I'm not sure which source to use. Could you clarify?")

        if decision.route == "METRIC_DEFINITION":
            return await self._handle_metric_modeling(db, tenant_id, user_prompt, decision)
        
        elif decision.route == "GENERAL_CHAT":
            return await self._handle_conversational_chat(user_prompt, chat_history)

        elif decision.route in ["ANALYTICAL_QUERY", "COMPLEX_COMPUTATION"]:
            return await self._handle_full_analytical_pipeline(
                db, tenant_id, user_prompt, chat_history, decision, t0
            )

        return RouterExecutionPayload(type="text", message="Route not yet implemented.")

    # ==========================================
    # DELEGATED HANDLERS
    # ==========================================

    async def _handle_full_analytical_pipeline(
        self, 
        db: Session, 
        tenant_id: str, 
        prompt: str, 
        history: List[Dict[str, str]], 
        decision: RouteDecision,
        start_time: float
    ) -> RouterExecutionPayload:
        """
        The Heavy-Duty Analytical Path.
        Planner -> NL2SQL -> Metric Injection -> Compute -> Insights -> Narrative.
        """
        # 1. SECURITY & CONTEXT FETCH
        auth_context = await self._get_authorized_schemas(db, tenant_id, decision.required_dataset_ids)
        schema_context = auth_context["schema_context"]
        datasets = auth_context["datasets"]

        if not datasets:
            return RouterExecutionPayload(type="text", message="I don't have access to the datasets required for that analysis.")

        # 2. CHECK GLOBAL CACHE (Prompt Hash)
        cached = await cache_manager.get_cached_insight(tenant_id, decision.required_dataset_ids[0], prompt)
        if cached:
            return RouterExecutionPayload(
                type="chart" if cached.get("chart_spec") else "table",
                message="Retrieved from cache.",
                **cached,
                execution_time_ms=round((time.perf_counter() - start_time) * 1000, 2)
            )

        # 3. GENERATE EXECUTION PLAN (The Lead Engineer)
        plan: QueryPlan = await self.planner.generate_plan(prompt, schema_context, tenant_id)
        if not plan.is_achievable:
            return RouterExecutionPayload(type="text", message=f"I can't calculate that yet. {plan.missing_data_reason}")

        # 4. NL2SQL GENERATION (Dialect-Specific)
        # Fetch verified metric catalog to provide "Verified Metric Views" context to the generator
        # (This is the 'Contextual RAG' filter mentioned in methodologies)
        metric_catalog = await metric_governance_service.get_semantic_catalog(db, tenant_id, decision.required_dataset_ids[0])
        
        sql_query, chart_spec = await self.generator.generate_sql(
            plan=plan,
            full_schema=schema_context,
            target_engine="duckdb",
            tenant_id=tenant_id,
            prompt=prompt,
            semantic_views=metric_catalog.semantic_dictionary,
            history=history
        )

        # 5. GOVERNED METRIC INJECTION (The Masterpiece)
        # We rewrite the SQL to inject the actual validated CTE definitions for any business terms used.
        governed_sql = metric_governance_service.inject_governed_metrics(
            db, tenant_id, decision.required_dataset_ids[0], sql_query
        )

        try:
            # 6. VECTORIZED EXECUTION (Compute Engine)
            # We use wait_for to enforce the SaaS API timeout limits
            results = await asyncio.wait_for(
                compute_engine.execute_read_only(
                    db=db,
                    tenant_id=tenant_id,
                    datasets=datasets,
                    query=governed_sql
                ),
                timeout=30.0
            )

            # 7. MATHEMATICAL INSIGHT GAUNTLET (Polars/Vectorized)
            df = pl.DataFrame(results)
            insight_payload: InsightPayload = self.insight_engine.analyze_dataframe(df, plan, tenant_id)

            # 8. EXECUTIVE NARRATIVE (The CDO Persona)
            narrative = await narrative_service.generate_executive_summary(
                payload=insight_payload,
                plan=plan,
                chart_spec=chart_spec,
                tenant_id=tenant_id
            )

            execution_time = round((time.perf_counter() - start_time) * 1000, 2)

            # 9. COMMIT TO CACHE
            await cache_manager.set_cached_insight(
                tenant_id=tenant_id,
                dataset_id=decision.required_dataset_ids[0],
                prompt=prompt,
                sql_query=governed_sql,
                chart_spec=chart_spec,
                insight_payload=insight_payload,
                narrative=narrative.model_dump()
            )

            return RouterExecutionPayload(
                type="chart" if chart_spec else "table",
                message=narrative.executive_summary,
                data=results,
                chart_spec=chart_spec,
                sql_used=governed_sql,
                execution_time_ms=execution_time,
                metadata={"insights": insight_payload.model_dump()}
            )

        except asyncio.TimeoutError:
            return RouterExecutionPayload(type="text", message="The query was too complex and timed out. Try asking for a smaller time range.")
        except Exception as e:
            logger.error(f"Analytical pipeline crash: {e}")
            return RouterExecutionPayload(type="text", message="I encountered an error while processing the data. My engineers have been notified.")

    async def _handle_metric_modeling(self, db: Session, tenant_id: str, prompt: str, decision: RouteDecision) -> RouterExecutionPayload:
        """
        Path 2: Natural Language Data Modeling.
        Extracts the metric name and definition, compiles it via MetricGovernance.
        """
        # Simple extraction logic (Could be improved with a structured LLM call)
        # Assuming prompt format: "Define [Metric Name] as [Definition]"
        match = re.search(r"define\s+[\"']?(.+?)[\"']?\s+as\s+(.+)", prompt, re.IGNORECASE)
        if not match:
            return RouterExecutionPayload(type="text", message="To define a metric, please use the format: 'Define [Name] as [Logic/Definition]'.")

        metric_name, definition = match.groups()
        dataset_id = decision.required_dataset_ids[0] if decision.required_dataset_ids else None
        
        if not dataset_id:
            return RouterExecutionPayload(type="text", message="I need to know which dataset this metric belongs to. Please specify.")

        from api.services.metric_governance import NLMetricRequest
        
        compilation = await metric_governance_service.compile_metric_from_nl(
            db, tenant_id, NLMetricRequest(metric_name=metric_name, description=definition, dataset_id=dataset_id)
        )

        if not compilation.is_valid:
            return RouterExecutionPayload(type="text", message=f"I couldn't compile that metric definition: {compilation.error_message}")

        # Save to the governed catalog
        await metric_governance_service.save_governed_metric(db, tenant_id, dataset_id, compilation, definition)

        return RouterExecutionPayload(
            type="metric_confirmed",
            message=f"✅ Metric '{metric_name}' is now governed and ready for use in any query.",
            data={"compiled_sql": compilation.compiled_sql}
        )

    async def _handle_conversational_chat(self, prompt: str, history: List[Dict[str, str]]) -> RouterExecutionPayload:
        """
        Path 3: General Chat / Contextual Guidance.
        """
        reply = await llm_client.generate(
            system_prompt="You are DataOmen Copilot, a helpful AI expert in analytics. Be concise and professional.",
            user_prompt=prompt,
            temperature=0.7 # Allow more personality in general chat
        )
        return RouterExecutionPayload(type="text", message=reply)

# Global Singleton
semantic_router = SemanticRouter()