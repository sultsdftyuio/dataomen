# api/services/semantic_router.py

import logging
import json
import time
import asyncio
import re
from typing import List, Dict, Any, Literal, Optional, Union
from datetime import datetime

import polars as pl
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Core Modular Orchestrators & Services
from api.services.llm_client import LLMClient, llm_client as default_llm
from api.services.query_planner import QueryPlanner, QueryPlan
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import compute_engine as default_compute
from api.services.insight_orchestrator import InsightOrchestrator, InsightPayload

# Singletons (Imported for DI defaults)
from api.services.metric_governance import metric_governance_service as default_metric
from api.services.narrative_service import narrative_service as default_narrative
from api.services.cache_manager import cache_manager as default_cache

# Models & Database
from models import Dataset
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
    destination: Literal["CONVERSATIONAL", "ANALYTICAL", "COMPLEX_COMPUTATION", "METRIC_DEFINITION"] = Field(
        ..., 
        description="The target engine. CONVERSATIONAL for general chat, ANALYTICAL for data requests."
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
    """The unified response format for the frontend UI (Legacy Execution Path)."""
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
    
    Methodology Adherence:
    ----------------------
    1. Modular Strategy: Uses strict Dependency Injection (DI) to prevent shared-state bleeding.
    2. Security by Design: Accepts tenant_id to isolate contextual RAG and cache memory per workspace.
    3. Contextual RAG: Identifies only the necessary schema fragments to prevent downstream token bloat.
    """

    def __init__(
        self,
        tenant_id: Optional[str] = None,
        llm_client: Optional[LLMClient] = None,
        planner: Optional[QueryPlanner] = None,
        generator: Optional[NL2SQLGenerator] = None,
        insight_engine: Optional[InsightOrchestrator] = None,
        compute_engine: Optional[Any] = None,
        metric_governance_service: Optional[Any] = None,
        narrative_service: Optional[Any] = None,
        cache_manager: Optional[Any] = None
    ):
        self.tenant_id = tenant_id
        
        # Dependency Injection: Instantiate locally or map to defaults if not provided
        self.llm_client = llm_client or default_llm
        self.planner = planner or QueryPlanner()
        self.generator = generator or NL2SQLGenerator()
        
        # Inject the LLM client into the insight engine to respect the modular stack
        self.insight_engine = insight_engine or InsightOrchestrator(llm_client=self.llm_client)
        
        # External Singleton Services
        self.compute_engine = compute_engine or default_compute
        self.metric_governance_service = metric_governance_service or default_metric
        self.narrative_service = narrative_service or default_narrative
        self.cache_manager = cache_manager or default_cache
        
        # Configuration
        self.CONFIDENCE_THRESHOLD = 0.70
        self.MAX_CONTEXT_TURNS = 5

    # ==========================================
    # CORE ROUTING CAPABILITIES (New Modular Flow)
    # ==========================================

    async def route_query(self, prompt: str) -> RouteDecision:
        """
        Fast-Path Intent Routing.
        Used directly by the `/orchestrate` endpoint to split Conversational vs Analytical flows
        without needing database access or deep schema loading.
        """
        system_prompt = """
        You are the Master Intelligence Router for DataOmen. Analyze the user prompt.
        Determine the intent and route to the appropriate engine.
        
        ROUTES (destination):
        - ANALYTICAL: Questions requiring data extraction, charts, numbers, or summaries from a database.
        - COMPLEX_COMPUTATION: Forecasting, anomaly deep-dives, or advanced math.
        - METRIC_DEFINITION: When the user wants to define a new business term (e.g. "Define MAU as...").
        - CONVERSATIONAL: General chat, greetings, platform help, or unrelated topics.
        """
        
        try:
            return await self.llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=prompt,
                response_model=RouteDecision,
                temperature=0.0
            )
        except Exception as e:
            tenant_tag = f"[{self.tenant_id}] " if self.tenant_id else ""
            logger.error(f"{tenant_tag}Fast-path routing failed: {e}")
            # Safe Fallback to Conversational if routing crashes
            return RouteDecision(
                reasoning="Fallback due to routing error.",
                destination="CONVERSATIONAL",
                intent_summary="Unknown",
                confidence_score=0.0
            )

    async def route_datasets(
        self, db: Session, tenant_id: str, prompt: str, embedding: Optional[List[float]] = None
    ) -> List[Dataset]:
        """
        Contextual RAG Dataset Discovery.
        Used by the AnalyticalOrchestrator to find relevant tables and prevent schema bloat.
        """
        datasets = db.query(Dataset).filter(Dataset.tenant_id == tenant_id).all()
        if not datasets:
            return []
            
        catalog_summary = self._summarize_catalog_for_routing(datasets)
        
        system_prompt = f"""
        You are an Enterprise Data Architect. Analyze the prompt and select the datasets needed to answer it.
        
        ACTIVE CATALOG:
        {catalog_summary}
        
        Respond with the UUIDs of the datasets strictly necessary. Support auto-joins if multiple are needed.
        """
        
        class DatasetSelection(BaseModel):
            required_dataset_ids: List[str] = Field(description="UUIDs of required datasets")
            
        try:
            selection = await self.llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=prompt,
                response_model=DatasetSelection,
                temperature=0.0
            )
            
            selected_ids = selection.required_dataset_ids
            if not selected_ids:
                return datasets # Fallback: Provide all if AI was unsure but didn't error
                
            return [d for d in datasets if str(d.id) in selected_ids]
            
        except Exception as e:
            logger.warning(f"[{tenant_id}] Dataset discovery failed, falling back to all active datasets: {e}")
            return datasets

    # ==========================================
    # INTERNAL CONTEXT & SCHEMA UTILITIES
    # ==========================================

    async def _get_authorized_schemas(self, db: Session, tenant_id: str, dataset_ids: List[str]) -> Dict[str, Any]:
        """Fetches full metadata and schemas with strict tenant isolation."""
        datasets = db.query(Dataset).filter(
            Dataset.id.in_(dataset_ids),
            Dataset.tenant_id == tenant_id
        ).all()

        schema_context = {}
        for ds in datasets:
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
    # LEGACY ORCHESTRATION CYCLE (Fallback Support)
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
        Legacy execution path. Highly recommended to use `AnalyticalOrchestrator` directly instead.
        """
        t0 = time.perf_counter()
        logger.info(f"[{tenant_id}] Copilot processing request via legacy router: '{user_prompt[:50]}...'")

        all_active_ds = db.query(Dataset).filter(
            Dataset.id.in_(active_dataset_ids),
            Dataset.tenant_id == tenant_id
        ).all()

        catalog_summary = self._summarize_catalog_for_routing(all_active_ds)
        
        system_routing_prompt = f"""
        You are the Master Intelligence Router for DataOmen. Analyze the conversation and user prompt.
        
        ACTIVE CATALOG:
        {catalog_summary}
        
        ROUTES (destination):
        - ANALYTICAL: Questions requiring data extraction, charts, or summaries.
        - COMPLEX_COMPUTATION: Forecasting, anomaly deep-dives, or advanced math.
        - METRIC_DEFINITION: When the user wants to define a new business term.
        - CONVERSATIONAL: Greetings, platform help, or unrelated topics.
        """

        try:
            decision: RouteDecision = await self.llm_client.generate_structured(
                system_prompt=system_routing_prompt,
                prompt=user_prompt,
                history=chat_history[-self.MAX_CONTEXT_TURNS:],
                response_model=RouteDecision
            )
        except Exception as e:
            logger.error(f"Routing logic failed: {e}")
            return RouterExecutionPayload(type="text", message="I'm sorry, I had trouble understanding that request. Could you rephrase?")

        if decision.confidence_score < self.CONFIDENCE_THRESHOLD:
            return RouterExecutionPayload(type="text", message="I understand you're asking about data, but I'm not sure which source to use. Could you clarify?")

        if decision.destination == "METRIC_DEFINITION":
            return await self._handle_metric_modeling(db, tenant_id, user_prompt, decision)
        
        elif decision.destination == "CONVERSATIONAL":
            return await self._handle_conversational_chat(user_prompt, chat_history)

        elif decision.destination in ["ANALYTICAL", "COMPLEX_COMPUTATION"]:
            return await self._handle_full_analytical_pipeline(
                db, tenant_id, user_prompt, chat_history, decision, t0
            )

        return RouterExecutionPayload(type="text", message="Route not yet implemented.")

    # ==========================================
    # DELEGATED HANDLERS (Legacy Support)
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
        """The Heavy-Duty Analytical Path (Legacy Single-File Execution)."""
        auth_context = await self._get_authorized_schemas(db, tenant_id, decision.required_dataset_ids)
        schema_context = auth_context["schema_context"]
        datasets = auth_context["datasets"]

        if not datasets:
            return RouterExecutionPayload(type="text", message="I don't have access to the datasets required for that analysis.")

        cached = await self.cache_manager.get_cached_insight(tenant_id, decision.required_dataset_ids[0], prompt)
        if cached:
            return RouterExecutionPayload(
                type="chart" if cached.get("chart_spec") else "table",
                message="Retrieved from cache.",
                **cached,
                execution_time_ms=round((time.perf_counter() - start_time) * 1000, 2)
            )

        plan: QueryPlan = await self.planner.generate_plan(prompt, schema_context, tenant_id)
        if not plan.is_achievable:
            return RouterExecutionPayload(type="text", message=f"I can't calculate that yet. {plan.missing_data_reason}")

        metric_catalog = await self.metric_governance_service.get_semantic_catalog(db, tenant_id, decision.required_dataset_ids[0])
        
        sql_query, chart_spec = await self.generator.generate_sql(
            plan=plan,
            full_schema=schema_context,
            target_engine="duckdb",
            tenant_id=tenant_id,
            prompt=prompt,
            semantic_views=metric_catalog.semantic_dictionary,
            history=history
        )

        governed_sql = self.metric_governance_service.inject_governed_metrics(
            db, tenant_id, decision.required_dataset_ids[0], sql_query
        )

        try:
            results = await asyncio.wait_for(
                self.compute_engine.execute_read_only(
                    db=db,
                    tenant_id=tenant_id,
                    datasets=datasets,
                    query=governed_sql
                ),
                timeout=30.0
            )

            df = pl.DataFrame(results)
            insight_payload: InsightPayload = self.insight_engine.analyze_dataframe(df, plan, tenant_id)

            narrative = await self.narrative_service.generate_executive_summary(
                payload=insight_payload,
                plan=plan,
                chart_spec=chart_spec,
                tenant_id=tenant_id
            )

            execution_time = round((time.perf_counter() - start_time) * 1000, 2)

            await self.cache_manager.set_cached_insight(
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
        """Path 2: Natural Language Data Modeling."""
        match = re.search(r"define\s+[\"']?(.+?)[\"']?\s+as\s+(.+)", prompt, re.IGNORECASE)
        if not match:
            return RouterExecutionPayload(type="text", message="To define a metric, please use the format: 'Define [Name] as [Logic/Definition]'.")

        metric_name, definition = match.groups()
        dataset_id = decision.required_dataset_ids[0] if decision.required_dataset_ids else None
        
        if not dataset_id:
            return RouterExecutionPayload(type="text", message="I need to know which dataset this metric belongs to. Please specify.")

        from api.services.metric_governance import NLMetricRequest
        
        compilation = await self.metric_governance_service.compile_metric_from_nl(
            db, tenant_id, NLMetricRequest(metric_name=metric_name, description=definition, dataset_id=dataset_id)
        )

        if not compilation.is_valid:
            return RouterExecutionPayload(type="text", message=f"I couldn't compile that metric definition: {compilation.error_message}")

        await self.metric_governance_service.save_governed_metric(db, tenant_id, dataset_id, compilation, definition)

        return RouterExecutionPayload(
            type="metric_confirmed",
            message=f"✅ Metric '{metric_name}' is now governed and ready for use in any query.",
            data={"compiled_sql": compilation.compiled_sql}
        )

    async def _handle_conversational_chat(self, prompt: str, history: List[Dict[str, str]]) -> RouterExecutionPayload:
        """Path 3: General Chat / Contextual Guidance."""
        reply = await self.llm_client.generate(
            system_prompt="You are DataOmen Copilot, a helpful AI expert in analytics. Be concise and professional.",
            user_prompt=prompt,
            temperature=0.7
        )
        return RouterExecutionPayload(type="text", message=reply)

# Note: The global `semantic_router = SemanticRouter()` export has been strictly removed to 
# prevent cross-tenant memory leakage. Always instantiate via `SemanticRouter(tenant_id=...)`.