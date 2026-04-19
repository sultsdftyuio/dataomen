# api/services/orchestrator.py

import logging
import time
import json
import asyncio
import hashlib
import polars as pl
from types import SimpleNamespace
from typing import Dict, Any, List, AsyncGenerator, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Core Modular Services
from api.services.query_planner import QueryPlanner, QueryPlan
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine
from api.services.insight_orchestrator import InsightOrchestrator, InsightPayload
from api.services.diagnostic_service import DiagnosticService
from api.services.narrative_service import NarrativeService
from api.services.semantic_router import SemanticRouter
from api.services.duckdb_validator import DuckDBValidator

# Infrastructure Singletons
from api.services.cache_manager import cache_manager
from api.services.llm_client import LLMClient
from api.services.vector_service import vector_service

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
        self.background_tasks: set[asyncio.Task] = set()
        
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
            agent = None
            allowed_datasets = set(active_dataset_ids or [])
            allowed_documents = set(active_document_ids or [])

            if agent_id and agent_id != "default-router":
                agent = db.query(Agent).filter(Agent.id == agent_id, Agent.tenant_id == tenant_id).first()
                if agent:
                    persona_instructions = agent.role_description
                    if agent.dataset_id:
                        allowed_datasets.add(str(agent.dataset_id))
                    if agent.document_id:
                        allowed_documents.add(str(agent.document_id))

            if not allowed_datasets and not allowed_documents:
                yield self._packet("error", "Security Exception: No data sources authorized in current memory boundary.")
                return

            boundary_cache_id = self._build_boundary_cache_id(allowed_datasets, allowed_documents)
            yield _trace(
                "Boundary Validation",
                stage_start,
                meta={
                    "authorized_datasets": len(allowed_datasets),
                    "authorized_documents": len(allowed_documents),
                    "boundary_cache_id": boundary_cache_id,
                },
            )

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

            cached = await cache_manager.get_cached_insight(tenant_id, boundary_cache_id, prompt)
            
            if cached:
                cached["execution_time_ms"] = round((time.time() - start_time) * 1000, 2)
                yield _trace("Cache Retrieval", stage_start, meta={"cache_hit": True})
                yield self._packet("cache_hit", cached)
                return

            if not allowed_datasets and allowed_documents:
                yield self._packet("status", "🔎 Searching document vectors inside your secure boundary...")
                doc_stage_start = time.time()

                if prompt_embedding is None:
                    try:
                        prompt_embedding = await self.llm_client.embed(prompt)
                    except Exception as e:
                        logger.warning(f"[{tenant_id}] Document embedding failed: {e}")

                if prompt_embedding is None:
                    yield self._packet("error", "Document retrieval engine is unavailable right now.")
                    return

                chunks = await vector_service.search_documents(
                    tenant_id=tenant_id,
                    document_ids=sorted(allowed_documents),
                    prompt_embedding=prompt_embedding,
                    top_k=8,
                )

                if not chunks:
                    yield self._packet("error", "No relevant document context was found for this request.")
                    return

                system_prompt = (
                    persona_instructions
                    or "You are a precise document analyst. Answer only from provided evidence chunks."
                )
                rag_context = "\n\n".join(chunks)
                rag_prompt = (
                    f"User Question: {prompt}\n\n"
                    f"Retrieved Evidence:\n{rag_context}\n\n"
                    "Return a concise, grounded answer. If evidence is insufficient, say so clearly."
                )

                answer_parts: List[str] = []
                async for chunk in self.llm_client.stream_text(
                    system_prompt=system_prompt,
                    prompt=rag_prompt,
                    history=history,
                    temperature=0.0,
                ):
                    answer_parts.append(chunk)
                    yield self._packet("narrative_chunk", chunk)

                yield _trace(
                    "Document RAG",
                    doc_stage_start,
                    meta={
                        "documents_scanned": len(allowed_documents),
                        "chunks_used": len(chunks),
                    },
                )
                yield self._packet(
                    "data",
                    {
                        "type": "document_rag",
                        "answer": "".join(answer_parts).strip(),
                        "documents_scanned": len(allowed_documents),
                        "chunks_used": len(chunks),
                        "execution_time_ms": round((time.time() - start_time) * 1000, 2),
                    },
                )
                return

            # -------------------------------------------------------
            # STAGE 2: Omni-Graph Contextual Routing
            # -------------------------------------------------------
            yield self._packet("status", "🧠 Semantic Routing: Mapping intent to secure partitions...")
            stage_start = time.time()

            route_decision, routing_trace = await self.router.route_query(
                prompt=prompt,
                tenant_id=tenant_id,
            )

            routed_datasets, routing_trace = await self.router.route_datasets(
                db=db,
                trace=routing_trace,
                decision=route_decision,
                embedding=prompt_embedding,
                allowed_dataset_ids=list(allowed_datasets),
            )

            if not routed_datasets:
                yield self._packet("error", "Intent mismatch: Request could not be mathematically grounded in available data.")
                return

            full_schema = {str(d.id): (d.schema_metadata or {}) for d in routed_datasets}
            
            yield _trace("Semantic Routing", stage_start, meta={"datasets_routed": len(routed_datasets)})

            # -------------------------------------------------------
            # STAGE 3: Semantic Budgeting & Query Planning
            # -------------------------------------------------------
            yield self._packet("status", "⚡ Architecting vectorized execution strategy...")
            stage_start = time.time()

            planner_agent = agent or SimpleNamespace(
                id="default-router",
                role_description=persona_instructions or "Data Assistant",
                dataset_id=routed_datasets[0].id if routed_datasets else None,
                document_id=None,
            )

            plan: QueryPlan = await self.planner.plan_execution(
                db=db,
                tenant_id=tenant_id,
                agent=planner_agent,
                natural_query=prompt,
                schema_hints=full_schema,
            )

            if plan.confidence_score < 0.4:
                yield self._packet(
                    "error",
                    "I do not have enough trusted data in the active memory boundary to answer that confidently.",
                )
                return

            yield self._packet("plan", plan.model_dump())
            yield _trace("Query Planning", stage_start, meta={"confidence": plan.confidence_score})

            # -------------------------------------------------------
            # STAGE 4: Secure AST Compilation
            # -------------------------------------------------------
            stage_start = time.time()
            execution_context = await self.planner.get_duckdb_execution_context(
                db=db,
                tenant_id=tenant_id,
                plan=plan,
            )

            sql_query, chart_spec, _compilation_trace = await self.generator.generate_sql(
                plan=plan,
                execution_context=execution_context,
                target_engine="duckdb",
                tenant_id=tenant_id,
                agent=agent,
                history=history,
                schema_context=full_schema,
            )

            self.validator.validate_sql(sql_query) # Security boundary
            yield self._packet("sql", sql_query)
            yield _trace("SQL Compilation", stage_start)

            # -------------------------------------------------------
            # STAGE 5: THE FAIL-SAFE (Partial Success Compute)
            # -------------------------------------------------------
            yield self._packet("status", f"🚀 Executing query across {len(routed_datasets)} authorized datasets...")
            stage_start = time.time()

            try:
                combined_data = await asyncio.wait_for(
                    self.compute_engine.execute_read_only(
                        db=db,
                        tenant_id=tenant_id,
                        datasets=routed_datasets,
                        query=sql_query,
                    ),
                    timeout=self.COMPUTE_TIMEOUT_SECONDS,
                )
            except Exception as compute_error:
                yield _trace("Compute", stage_start, status="failed", err=str(compute_error))
                yield self._packet("error", f"Execution failed: {compute_error}")
                return

            total_rows = len(combined_data)
            degraded_sources: List[str] = []
            yield _trace("Compute", stage_start, meta={"rows": total_rows})

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

                diagnostic_schema: Dict[str, Dict[str, str]] = {}
                for routed_dataset in routed_datasets:
                    metadata = routed_dataset.schema_metadata or {}
                    cols = metadata.get("columns", metadata)
                    if isinstance(cols, dict):
                        normalized_cols: Dict[str, str] = {}
                        for col_name, col_meta in cols.items():
                            if isinstance(col_meta, dict):
                                normalized_cols[col_name] = str(col_meta.get("type") or col_meta.get("dtype") or "TEXT")
                            else:
                                normalized_cols[col_name] = str(col_meta)
                        diagnostic_schema[str(routed_dataset.id)] = normalized_cols

                try:
                    diagnostic = await self.diagnostic_service.investigate_anomaly(
                        anomaly=anomaly,
                        datasets=routed_datasets,
                        full_schema=diagnostic_schema,
                        tenant_id=tenant_id,
                        db=db,
                    )
                    if diagnostic:
                        yield self._packet("diagnostics", diagnostic.model_dump())
                except Exception as diagnostic_error:
                    logger.warning(f"[{tenant_id}] Diagnostic branch degraded safely: {diagnostic_error}")

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
                tenant_id,
                boundary_cache_id,
                prompt,
                sql_query,
                chart_spec,
                insights,
                narrative.model_dump(),
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

    @staticmethod
    def _build_boundary_cache_id(allowed_datasets: set, allowed_documents: set) -> str:
        """Builds a deterministic cache namespace from active secure memory boundaries."""
        dataset_part = ",".join(sorted(str(dataset_id) for dataset_id in allowed_datasets if dataset_id))
        document_part = ",".join(sorted(str(document_id) for document_id in allowed_documents if document_id))
        boundary_signature = f"datasets:{dataset_part}|documents:{document_part}"
        digest = hashlib.sha256(boundary_signature.encode("utf-8")).hexdigest()
        return f"boundary_{digest[:32]}"

    def _trigger_background_cache(
        self,
        tenant_id: str,
        boundary_cache_id: str,
        prompt: str,
        sql_query: str,
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
                dataset_id=boundary_cache_id,
                prompt=prompt, 
                sql_query=sql_query, 
                chart_spec=chart_spec, 
                insight_payload=insights, 
                narrative=narrative
            )
        )
        self.background_tasks.add(task)
        task.add_done_callback(self.background_tasks.discard)
        task.add_done_callback(_err_handler)