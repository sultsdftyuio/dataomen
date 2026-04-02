# api/services/orchestrator.py

import logging
import time
import json
import asyncio
import polars as pl
from typing import Dict, Any, List, AsyncGenerator, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Core Modular Services
from api.services.query_planner import QueryPlanner, QueryPlan
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine, DatasetMetadata
from api.services.insight_orchestrator import InsightOrchestrator, InsightPayload
from api.services.diagnostic_service import DiagnosticService
from api.services.narrative_service import NarrativeService
from api.services.semantic_router import SemanticRouter
from api.services.duckdb_validator import DuckDBValidator

# Infrastructure Singletons
from api.services.cache_manager import cache_manager
from api.services.llm_client import LLMClient

# Database Models
from models import Agent, Dataset

logger = logging.getLogger(__name__)

# =====================================================================
# DATA CONTRACTS (Explainable AI Traces)
# =====================================================================

class TechnicalTrace(BaseModel):
    """
    Phase 6: Explainable AI Audit Log.
    Provides deep technical observability into the execution state without 
    cluttering the executive UI.
    """
    stage: str
    execution_time_ms: float
    status: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    error_context: Optional[str] = None

# =====================================================================
# THE MASTER ORCHESTRATOR
# =====================================================================

class AnalyticalOrchestrator:
    """
    Phase 6: Master Orchestrator-First Architecture.
    
    Replaces fully autonomous, unpredictable swarms with deterministic workflows.
    Implements Partial Success graceful degradation, Semantic Budgeting, 
    and Dual-Layer Audit Logging.
    """

    def __init__(
        self,
        planner: QueryPlanner,
        generator: NL2SQLGenerator,
        compute_engine: ComputeEngine,
        insight_engine: InsightOrchestrator,
        diagnostic_service: DiagnosticService,
        narrative_service: NarrativeService,
        router: SemanticRouter,
        llm_client: Optional[LLMClient] = None
    ):
        self.planner = planner
        self.generator = generator
        self.compute_engine = compute_engine
        self.insight_engine = insight_engine
        self.diagnostic_service = diagnostic_service
        self.narrative_service = narrative_service
        self.router = router
        self.llm_client = llm_client or LLMClient()
        self.validator = DuckDBValidator()
        
        # Enterprise boundary: Hard timeout for physical compute to prevent node starvation
        self.COMPUTE_TIMEOUT_SECONDS = 30.0

    # ------------------------------------------------------------
    # PUBLIC ENTRYPOINT (The Main Event Loop)
    # ------------------------------------------------------------

    async def run_full_pipeline(
        self,
        db: Session,
        tenant_id: str,
        prompt: str,
        agent_id: Optional[str] = None,
        active_dataset_ids: Optional[List[str]] = None,
        active_document_ids: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Executes the time-bounded, deterministic pipeline yielding SSE packets.
        Enforces Partial Success and Semantic Budgeting throughout execution.
        """
        start_time = time.time()
        traces: List[TechnicalTrace] = []

        def _trace(stage: str, start: float, status: str = "success", meta: dict = None, err: str = None) -> str:
            """Helper to emit standard technical traces downstream."""
            ms = round((time.time() - start) * 1000, 2)
            trace = TechnicalTrace(
                stage=stage, 
                execution_time_ms=ms, 
                status=status, 
                metadata=meta or {}, 
                error_context=err
            )
            traces.append(trace)
            return self._packet("technical_trace", trace.model_dump())

        try:
            yield self._packet("status", "🔍 Securing tenant execution boundaries...")
            stage_start = time.time()

            # -------------------------------------------------------
            # STAGE 0: Identity & Boundary Validation
            # -------------------------------------------------------
            persona_instructions = None
            allowed_datasets = set(active_dataset_ids or [])

            if agent_id and agent_id != "default-router":
                agent = db.query(Agent).filter(Agent.id == agent_id, Agent.tenant_id == tenant_id).first()
                if agent:
                    persona_instructions = agent.role_description
                    if agent.dataset_ids:
                        allowed_datasets.update(agent.dataset_ids)

            if not allowed_datasets:
                yield self._packet("error", "Security Exception: No data sources authorized in current memory boundary.")
                return

            yield _trace("Boundary Validation", stage_start, meta={"authorized_sources": len(allowed_datasets)})

            # -------------------------------------------------------
            # STAGE 1: Progressive Hydration (Cache Hit Check)
            # -------------------------------------------------------
            stage_start = time.time()
            
            prompt_embedding = None
            try:
                context_prompt = f"{history[-1]['content']} | {prompt}" if history else prompt
                prompt_embedding = await self.llm_client.embed(context_prompt)
            except Exception as e:
                logger.warning(f"[{tenant_id}] Embedding fault, bypassing semantic cache: {e}")

            cached = await cache_manager.get_cached_insight(tenant_id, "multi_dataset", prompt)
            
            if cached:
                cached["execution_time_ms"] = round((time.time() - start_time) * 1000, 2)
                yield _trace("Cache Retrieval", stage_start, meta={"cache_hit": True})
                yield self._packet("cache_hit", cached)
                return

            # -------------------------------------------------------
            # STAGE 2: Omni-Graph Contextual Routing
            # -------------------------------------------------------
            yield self._packet("status", "🧠 Semantic Routing: Mapping intent to secure partitions...")
            stage_start = time.time()

            routed_datasets = await self.router.route_datasets(
                db=db, 
                tenant_id=tenant_id, 
                prompt=prompt, 
                embedding=prompt_embedding, 
                allowed_dataset_ids=list(allowed_datasets)
            )

            if not routed_datasets:
                yield self._packet("error", "Intent mismatch: Request could not be mathematically grounded in available data.")
                return

            dataset_meta = [DatasetMetadata.from_model(d) for d in routed_datasets]
            full_schema = {str(d.id): d.schema_definition for d in routed_datasets}
            
            yield _trace("Semantic Routing", stage_start, meta={"datasets_routed": len(routed_datasets)})

            # -------------------------------------------------------
            # STAGE 3: Semantic Budgeting & Query Planning
            # -------------------------------------------------------
            yield self._packet("status", "⚡ Architecting vectorized execution strategy...")
            stage_start = time.time()

            plan: QueryPlan = await self.planner.generate_plan(
                prompt=prompt, 
                full_schema=full_schema, 
                tenant_id=tenant_id, 
                history=history
            )

            if not plan.is_achievable:
                yield self._packet("error", plan.missing_data_reason)
                return

            yield self._packet("plan", plan.model_dump())
            yield _trace("Query Planning", stage_start, meta={"confidence": plan.confidence_score})

            # -------------------------------------------------------
            # STAGE 4: Secure AST Compilation
            # -------------------------------------------------------
            stage_start = time.time()
            target_engine = dataset_meta[0].location.value

            sql_query, chart_spec = await self.generator.generate_sql(
                plan=plan, 
                full_schema=full_schema, 
                datasets=dataset_meta, 
                target_engine=target_engine, 
                tenant_id=tenant_id
            )

            self.validator.validate_sql(sql_query) # Security boundary
            yield self._packet("sql", sql_query)
            yield _trace("SQL Compilation", stage_start)

            # -------------------------------------------------------
            # STAGE 5: THE FAIL-SAFE (Partial Success Compute)
            # -------------------------------------------------------
            yield self._packet("status", f"🚀 Executing distributed query across {len(dataset_meta)} boundary datasets...")
            stage_start = time.time()

            compute_tasks = [
                asyncio.wait_for(
                    self.compute_engine.execute_query_async(sql_query, dataset, tenant_id),
                    timeout=self.COMPUTE_TIMEOUT_SECONDS
                )
                for dataset in dataset_meta
            ]

            results = await asyncio.gather(*compute_tasks, return_exceptions=True)

            combined_data: List[Dict[str, Any]] = []
            total_rows = 0
            degraded_sources = []

            for i, result in enumerate(results):
                ds_name = dataset_meta[i].integration_name or dataset_meta[i].dataset_id
                
                if isinstance(result, Exception):
                    # Phase 6 Graceful Degradation Strategy
                    logger.warning(f"[{tenant_id}] Partial Success Fallback: Node {ds_name} failed. Error: {str(result)}")
                    degraded_sources.append(ds_name)
                    yield _trace(f"Compute: {ds_name}", stage_start, status="failed", err=str(result))
                elif result and result.data:
                    combined_data.extend(result.data)
                    total_rows += result.row_count
                    yield _trace(f"Compute: {ds_name}", stage_start, meta={"rows": result.row_count})

            if not combined_data:
                yield self._packet("error", "Execution failed: No mathematical bounds returned from any authorized source.")
                return

            if degraded_sources:
                yield self._packet("warning", f"Partial Success: Omni-Graph could not resolve context from {', '.join(degraded_sources)}. Results may be incomplete.")

            # -------------------------------------------------------
            # STAGE 6: Vectorized Insight Extraction (Polars)
            # -------------------------------------------------------
            yield self._packet("status", "📊 Extracting statistical signals...")
            stage_start = time.time()

            # Zero-copy Polars ingestion
            df = pl.DataFrame(combined_data)
            insights: InsightPayload = await self.insight_engine.analyze_and_synthesize(df, plan, tenant_id)
            
            yield self._packet("insights", insights.model_dump())
            yield _trace("Vectorized Math", stage_start, meta={"anomalies_detected": len(insights.anomalies)})

            # -------------------------------------------------------
            # STAGE 7: Root Cause Diagnostics (Optional Branch)
            # -------------------------------------------------------
            if insights.anomalies:
                anomaly = insights.anomalies[0]
                yield self._packet("status", f"🕵️ Investigating sub-layer anomaly in {anomaly.column}...")

                diagnostic = await self.diagnostic_service.investigate_anomaly(
                    anomaly=anomaly,
                    datasets=dataset_meta,
                    full_schema=full_schema,
                    tenant_id=tenant_id
                )

                if diagnostic:
                    yield self._packet("diagnostics", diagnostic.model_dump())

            # -------------------------------------------------------
            # STAGE 8: Narrative Synthesis (Time-Travel Hash)
            # -------------------------------------------------------
            yield self._packet("status", "📝 Generating reproducible executive summary...")
            stage_start = time.time()

            narrative = await self.narrative_service.generate_executive_summary(
                payload=insights, 
                plan=plan, 
                chart_spec=chart_spec, 
                tenant_id=tenant_id,
                system_prompt=persona_instructions
            )

            yield self._packet("narrative", narrative.model_dump())
            # Safely get the snapshot hash if the narrative service provides it
            snap_hash = getattr(narrative, 'snapshot_hash', 'un-hashed')
            yield _trace("Narrative Synthesis", stage_start, meta={"snapshot_hash": snap_hash})

            # -------------------------------------------------------
            # STAGE 9: Delivery & Asynchronous Cache Commit
            # -------------------------------------------------------
            execution_payload = {
                "type": "chart" if chart_spec else "table",
                "data": combined_data,
                "chart_spec": chart_spec,
                "sql_used": sql_query,
                "row_count": total_rows,
                "execution_time_ms": round((time.time() - start_time) * 1000, 2),
                "is_partial_success": len(degraded_sources) > 0,
                "degraded_sources": degraded_sources
            }

            yield self._packet("data", execution_payload)

            self._trigger_background_cache(
                tenant_id, prompt, sql_query, chart_spec, insights, narrative.model_dump()
            )

        except Exception as e:
            logger.error(f"[{tenant_id}] Master Orchestrator Fault: {str(e)}", exc_info=True)
            yield self._packet("error", "The analytical engine encountered a critical structural fault. Rolling back execution state.")

    # ------------------------------------------------------------
    # UTILITY METHODS
    # ------------------------------------------------------------
    
    @staticmethod
    def _packet(p_type: str, content: Any) -> str:
        """Serializes exact structural state payloads for the React UI hooks."""
        try:
            payload = json.dumps({"type": p_type, "content": content}, default=str)
            return f"data: {payload}\n\n"
        except Exception as e:
            logger.error(f"Serialization fault: {str(e)}")
            return f"data: {json.dumps({'type': 'error', 'content': 'JSON state serialization failure'})}\n\n"

    def _trigger_background_cache(
        self, tenant_id: str, prompt: str, sql_query: str, 
        chart_spec: Optional[Dict[str, Any]], insights: InsightPayload, narrative: Dict[str, Any]
    ) -> None:
        """Asynchronous execution bounds for cache hydration, preventing API request starvation."""
        def _err_handler(task: asyncio.Task):
            try: 
                task.result()
            except Exception as ex: 
                logger.warning(f"[{tenant_id}] Background Cache Hydration missed: {ex}")

        task = asyncio.create_task(
            cache_manager.set_cached_insight(
                tenant_id=tenant_id, 
                dataset_id="multi_dataset", 
                prompt=prompt, 
                sql_query=sql_query, 
                chart_spec=chart_spec, 
                insight_payload=insights, 
                narrative=narrative
            )
        )
        task.add_done_callback(_err_handler)