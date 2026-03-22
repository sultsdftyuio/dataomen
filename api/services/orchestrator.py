import logging
import time
import json
import asyncio
import polars as pl

from typing import Dict, Any, List, AsyncGenerator, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.services.query_planner import QueryPlanner, QueryPlan
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine, DatasetMetadata
from api.services.insight_orchestrator import InsightOrchestrator, InsightPayload
from api.services.diagnostic_service import DiagnosticService
from api.services.narrative_service import NarrativeService
from api.services.cache_manager import cache_manager
from api.services.duckdb_validator import DuckDBValidator
from api.services.llm_client import llm_client
from api.services.semantic_router import SemanticRouter
from api.services.vector_service import vector_service

from models import Dataset

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# LLM Synthesis Contracts
# -----------------------------------------------------------------------------
class SynthesizedNarrative(BaseModel):
    executive_summary: str = Field(..., description="The synthesized text answer to the user's question.")


class AnalyticalOrchestrator:
    """
    DataOmen Analytical Intelligence Pipeline

    Responsibilities
    ----------------
    1. Semantic dataset routing (Contextual RAG)
    2. Hybrid Query planning (Intent Classification)
    3. Secure SQL generation / Qdrant Document Search
    4. Time-bounded Parallel compute execution (DuckDB + Vectors)
    5. Vectorized Insight extraction (Polars)
    6. Root cause diagnostics
    7. Executive narrative synthesis (Standard & Hybrid)
    8. Asynchronous Vector caching
    """

    def __init__(
        self,
        planner: QueryPlanner,
        generator: NL2SQLGenerator,
        compute_engine: ComputeEngine,
        insight_engine: InsightOrchestrator,
        diagnostic_service: DiagnosticService,
        narrative_service: NarrativeService,
        router: SemanticRouter
    ):
        self.planner = planner
        self.generator = generator
        self.compute_engine = compute_engine
        self.insight_engine = insight_engine
        self.diagnostic_service = diagnostic_service
        self.narrative_service = narrative_service
        self.router = router
        
        self.validator = DuckDBValidator()
        
        # Enterprise boundary: Prevent runaway analytical queries hanging the pipeline
        self.COMPUTE_TIMEOUT_SECONDS = 45.0

    # ------------------------------------------------------------
    # PUBLIC ENTRYPOINT
    # ------------------------------------------------------------

    async def run_full_pipeline(
        self,
        db: Session,
        tenant_id: str,
        prompt: str,
        context_id: Optional[str] = None
    ) -> AsyncGenerator[str, None]:

        start_time = time.time()

        try:
            yield self._packet("status", "🔍 Checking semantic memory...")

            # -------------------------------------------------------
            # STAGE 0 — Prompt Embedding via llm_client
            # -------------------------------------------------------
            prompt_embedding = None
            try:
                prompt_embedding = await llm_client.embed(prompt)
            except Exception as e:
                logger.warning(f"Embedding failure for tenant {tenant_id}: {e}")

            # -------------------------------------------------------
            # STAGE 1 — Vector Semantic Cache
            # -------------------------------------------------------
            cached = await cache_manager.get_cached_insight(
                tenant_id=tenant_id,
                dataset_id="multi_dataset",
                prompt=prompt,
                prompt_embedding=prompt_embedding
            )

            if cached:
                cached["execution_time_ms"] = round((time.time() - start_time) * 1000, 2)
                yield self._packet("cache_hit", cached)
                return

            # -------------------------------------------------------
            # STAGE 2 — Semantic Dataset Routing
            # -------------------------------------------------------
            yield self._packet("status", "🧠 Routing assets via semantic index...")

            routed_datasets = await self.router.route_datasets(
                db=db, tenant_id=tenant_id, prompt=prompt, embedding=prompt_embedding
            )

            dataset_meta = [DatasetMetadata.from_model(d) for d in routed_datasets] if routed_datasets else []
            full_schema = {str(d.id): d.schema_definition for d in routed_datasets} if routed_datasets else {}

            # -------------------------------------------------------
            # STAGE 3 — Query Planning & Intent Classification
            # -------------------------------------------------------
            yield self._packet("status", "🧠 Architecting query strategy...")

            plan: QueryPlan = await self.planner.generate_plan(
                prompt=prompt,
                full_schema=full_schema,
                tenant_id=tenant_id
            )

            yield self._packet("plan", plan.model_dump())

            intent = getattr(plan, "execution_intent", "ANALYTICAL")

            # -------------------------------------------------------
            # INTENT BRANCH 1: PURE DOCUMENT RAG
            # -------------------------------------------------------
            if intent == "DOCUMENT_RAG":
                yield self._packet("status", "📄 Analyzing unstructured documents...")
                document_ids = getattr(plan, "primary_document_ids", [])
                
                chunks = await vector_service.search_documents(
                    tenant_id=tenant_id,
                    document_ids=document_ids,
                    prompt_embedding=prompt_embedding,
                    top_k=5
                )

                if not chunks:
                    yield self._packet("error", "Could not find relevant text in the uploaded documents.")
                    return

                yield self._packet("status", "📝 Synthesizing document response...")
                system_prompt = "You are an AI assistant. Answer the user's question strictly using the provided document excerpts."
                content = f"QUESTION: {prompt}\n\nEXCERPTS:\n" + "\n\n".join(chunks)
                
                synthesis = await llm_client.generate_structured(system_prompt, content, SynthesizedNarrative)
                
                yield self._packet("narrative", {
                    "executive_summary": synthesis.executive_summary,
                    "key_takeaways": ["Sourced directly from uploaded documents."]
                })
                yield self._packet("data", {"type": "text", "execution_time_ms": round((time.time() - start_time) * 1000, 2)})
                return

            # -------------------------------------------------------
            # STRUCTURED SETUP (For ANALYTICAL & HYBRID)
            # -------------------------------------------------------
            if not dataset_meta:
                yield self._packet("error", "No structured datasets were relevant to this analytical query.")
                return

            if not getattr(plan, "is_achievable", True):
                yield self._packet("error", getattr(plan, "missing_data_reason", "Data unavailable."))
                return

            # Launch Document Search in the background if HYBRID
            rag_task = None
            if intent == "HYBRID" and getattr(plan, "primary_document_ids", []):
                yield self._packet("status", "🔄 Launching parallel Structured & Unstructured engines...")
                rag_task = asyncio.create_task(
                    vector_service.search_documents(
                        tenant_id=tenant_id, document_ids=plan.primary_document_ids,
                        prompt_embedding=prompt_embedding, top_k=5
                    )
                )

            # -------------------------------------------------------
            # STAGE 4 — SQL Generation & Security Validation
            # -------------------------------------------------------
            yield self._packet("status", f"⚡ Generating optimized SQL across {len(dataset_meta)} datasets...")

            target_engine = dataset_meta[0].location.value

            sql_query, chart_spec = await self.generator.generate_sql(
                plan=plan, full_schema=full_schema, datasets=dataset_meta,
                target_engine=target_engine, tenant_id=tenant_id
            )

            self.validator.validate_sql(sql_query)
            yield self._packet("sql", sql_query)

            # -------------------------------------------------------
            # STAGE 5 — Time-Bounded Parallel Compute Execution
            # -------------------------------------------------------
            yield self._packet("status", "🚀 Executing vectorized compute engine...")

            compute_tasks = [
                asyncio.wait_for(
                    self.compute_engine.execute_query_async(sql_query, dataset, tenant_id),
                    timeout=self.COMPUTE_TIMEOUT_SECONDS
                )
                for dataset in dataset_meta
            ]

            results = await asyncio.gather(*compute_tasks, return_exceptions=True)

            combined_data = []
            total_rows = 0

            for i, result in enumerate(results):
                if isinstance(result, asyncio.TimeoutError):
                    logger.error(f"Dataset compute timeout: {dataset_meta[i].dataset_id}")
                    raise Exception(f"Query execution timed out for {dataset_meta[i].dataset_id}")
                elif isinstance(result, Exception):
                    logger.error(f"Dataset compute failed: {dataset_meta[i].dataset_id} - {str(result)}")
                    raise result

                if result and result.data:
                    combined_data.extend(result.data)
                    total_rows += result.row_count

            if not combined_data:
                yield self._packet("data", {"type": "empty", "message": "No rows matched the query filters."})
                return

            # -------------------------------------------------------
            # STAGE 6 — Polars Vector Processing (High Performance)
            # -------------------------------------------------------
            yield self._packet("status", "📊 Extracting statistical insights...")

            df = pl.DataFrame(combined_data)

            insights: InsightPayload = self.insight_engine.analyze_dataframe(
                df, plan, tenant_id
            )

            yield self._packet("insights", insights.model_dump())

            # -------------------------------------------------------
            # STAGE 7 — Root Cause Diagnostics
            # -------------------------------------------------------
            diagnostic_dump = None
            if insights.anomalies:
                anomaly = insights.anomalies[0]
                yield self._packet("status", f"🕵️ Investigating anomaly in {anomaly.column}...")

                diagnostic = await self.diagnostic_service.investigate_anomaly(
                    anomaly=anomaly, datasets=dataset_meta, full_schema=full_schema, tenant_id=tenant_id
                )

                if diagnostic:
                    diagnostic_dump = diagnostic.model_dump()
                    yield self._packet("diagnostics", diagnostic_dump)

            # -------------------------------------------------------
            # STAGE 8 — Executive Narrative Generation
            # -------------------------------------------------------
            yield self._packet("status", "📝 Synthesizing executive narrative...")
            
            narrative_dump = {}

            if intent == "HYBRID" and rag_task:
                # Merge DuckDB mathematical insights with Qdrant text chunks
                rag_chunks = await rag_task
                data_summary = json.dumps(insights.model_dump())
                doc_context = "\n".join(rag_chunks)
                
                system_prompt = "You are an analytical AI. Answer the user's question by synthesizing BOTH the mathematical data insights and the document context provided."
                content = f"QUESTION: {prompt}\n\nDATA INSIGHTS:\n{data_summary}\n\nDOCUMENT EXCERPTS:\n{doc_context}"
                
                hybrid_res = await llm_client.generate_structured(system_prompt, content, SynthesizedNarrative)
                
                narrative_dump = {
                    "executive_summary": hybrid_res.executive_summary,
                    "key_takeaways": ["Derived from Hybrid Execution (Structured Math + Unstructured Documents)"]
                }
            else:
                # Standard analytical narrative
                narrative = await self.narrative_service.generate_executive_summary(
                    payload=insights, plan=plan, chart_spec=chart_spec, tenant_id=tenant_id
                )
                narrative_dump = narrative.model_dump()

            yield self._packet("narrative", narrative_dump)

            # -------------------------------------------------------
            # FINAL RESULT DELIVERY
            # -------------------------------------------------------
            execution_payload = {
                "type": "chart" if chart_spec else "table",
                "data": combined_data,
                "chart_spec": chart_spec,
                "sql_used": sql_query,
                "row_count": total_rows,
                "execution_time_ms": round((time.time() - start_time) * 1000, 2)
            }

            yield self._packet("data", execution_payload)

            # -------------------------------------------------------
            # ASYNC VECTOR CACHE WRITE (Safe Fire-and-Forget)
            # -------------------------------------------------------
            def _cache_error_handler(task: asyncio.Task):
                try:
                    task.result()
                except Exception as ex:
                    logger.error(f"Failed to write to vector cache [tenant={tenant_id}]: {ex}")

            cache_task = asyncio.create_task(
                cache_manager.set_cached_insight(
                    tenant_id=tenant_id,
                    dataset_id="multi_dataset",
                    prompt=prompt,
                    prompt_embedding=prompt_embedding,
                    sql_query=sql_query,
                    chart_spec=chart_spec,
                    insight_payload=insights,
                    narrative=narrative_dump
                )
            )
            cache_task.add_done_callback(_cache_error_handler)

        except Exception as e:
            logger.error(f"Pipeline failure [tenant={tenant_id}]: {str(e)}", exc_info=True)
            yield self._packet("error", "The analytical engine encountered an internal failure.")

    # ------------------------------------------------------------
    # PACKET FORMATTER (SSE Standard)
    # ------------------------------------------------------------
    @staticmethod
    def _packet(p_type: str, content: Any) -> str:
        """Serializes data for standard Server-Sent Events (SSE) stream output."""
        try:
            payload = json.dumps({"type": p_type, "content": content}, default=str)
            return f"data: {payload}\n\n"
        except Exception as e:
            logger.error(f"Serialization error in orchestrator: {str(e)}")
            return f"data: {json.dumps({'type': 'error', 'content': 'Data serialization error'})}\n\n"