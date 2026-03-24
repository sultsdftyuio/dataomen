# api/services/orchestrator.py

import logging
import time
import json
import asyncio
import polars as pl

from typing import Dict, Any, List, AsyncGenerator, Optional
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

logger = logging.getLogger(__name__)

class AnalyticalOrchestrator:
    """
    DataOmen Analytical Intelligence Pipeline

    Methodology Adherence:
    ----------------------
    1. Modular Strategy: Services are injected, allowing easy swaps (e.g., DuckDB to ClickHouse).
    2. Hybrid Performance: Orchestration is OOP; computation uses stateless, vectorized Polars.
    3. Security by Design: Strict tenant isolation and SQL injection validation.
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
        llm_client: LLMClient = LLMClient() # Injected for better testability and modularity
    ):
        self.planner = planner
        self.generator = generator
        self.compute_engine = compute_engine
        self.insight_engine = insight_engine
        self.diagnostic_service = diagnostic_service
        self.narrative_service = narrative_service
        self.router = router
        self.llm_client = llm_client
        
        self.validator = DuckDBValidator()
        
        # Enterprise boundary: Prevent runaway analytical queries from hanging the pipeline
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
        """
        Executes the time-bounded, vectorized analytical pipeline.
        Yields standard Server-Sent Events (SSE) packets.
        """
        start_time = time.time()

        try:
            yield self._packet("status", "🔍 Checking semantic memory...")

            # -------------------------------------------------------
            # STAGE 0 — Prompt Embedding (Contextual Context)
            # -------------------------------------------------------
            prompt_embedding = None
            try:
                # Utilizing the LLM Client for embedding generation
                prompt_embedding = await self.llm_client.embed(prompt)
            except Exception as e:
                logger.warning(f"[{tenant_id}] Embedding failure, bypassing semantic cache: {e}")

            # -------------------------------------------------------
            # STAGE 1 — Vector Semantic Cache (Performance Layer)
            # -------------------------------------------------------
            # Checking cache BEFORE routing saves expensive LLM and Database calls
            cached = await cache_manager.get_cached_insight(
                tenant_id=tenant_id,
                dataset_id="multi_dataset",
                prompt=prompt
            )

            if cached:
                cached["execution_time_ms"] = round((time.time() - start_time) * 1000, 2)
                yield self._packet("cache_hit", cached)
                return

            # -------------------------------------------------------
            # STAGE 2 — Semantic Dataset Routing (Contextual RAG)
            # -------------------------------------------------------
            yield self._packet("status", "🧠 Routing datasets via semantic index...")

            routed_datasets = await self.router.route_datasets(
                db=db,
                tenant_id=tenant_id,
                prompt=prompt,
                embedding=prompt_embedding
            )

            if not routed_datasets:
                yield self._packet("error", "No relevant datasets were found for this query.")
                return

            dataset_meta = [DatasetMetadata.from_model(d) for d in routed_datasets]
            full_schema = {str(d.id): d.schema_definition for d in routed_datasets}

            # -------------------------------------------------------
            # STAGE 3 — Query Planning
            # -------------------------------------------------------
            yield self._packet("status", "🧠 Architecting query strategy...")

            plan: QueryPlan = await self.planner.generate_plan(
                prompt=prompt,
                full_schema=full_schema,
                tenant_id=tenant_id
            )

            yield self._packet("plan", plan.model_dump())

            if not plan.is_achievable:
                yield self._packet("error", plan.missing_data_reason)
                return

            # -------------------------------------------------------
            # STAGE 4 — Secure SQL Generation
            # -------------------------------------------------------
            yield self._packet("status", f"⚡ Generating optimized SQL across {len(dataset_meta)} datasets...")

            target_engine = dataset_meta[0].location.value

            sql_query, chart_spec = await self.generator.generate_sql(
                plan=plan,
                full_schema=full_schema,
                datasets=dataset_meta,
                target_engine=target_engine,
                tenant_id=tenant_id
            )

            # Strict Security: SQL injection and syntax validation
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

            # gather with return_exceptions ensures one failure doesn't silently kill the loop
            results = await asyncio.gather(*compute_tasks, return_exceptions=True)

            combined_data: List[Dict[str, Any]] = []
            total_rows = 0

            for i, result in enumerate(results):
                if isinstance(result, asyncio.TimeoutError):
                    logger.error(f"[{tenant_id}] Compute timeout for dataset: {dataset_meta[i].dataset_id}")
                    raise Exception(f"Query execution timed out for dataset {dataset_meta[i].dataset_id}")
                elif isinstance(result, Exception):
                    logger.error(f"[{tenant_id}] Compute failed for dataset: {dataset_meta[i].dataset_id} - {str(result)}")
                    raise result

                if result and result.data:
                    combined_data.extend(result.data)
                    total_rows += result.row_count

            if not combined_data:
                yield self._packet("data", {"type": "empty", "message": "No rows matched the query filters."})
                return

            # -------------------------------------------------------
            # STAGE 6 — Vectorized Insight Extraction (Polars)
            # -------------------------------------------------------
            yield self._packet("status", "📊 Extracting statistical insights...")

            # Zero-copy Polars ingestion for high-performance C-level operations
            df = pl.DataFrame(combined_data)

            insights: InsightPayload = self.insight_engine.analyze_dataframe(
                df,
                plan,
                tenant_id
            )

            yield self._packet("insights", insights.model_dump())

            # -------------------------------------------------------
            # STAGE 7 — Root Cause Diagnostics
            # -------------------------------------------------------
            if insights.anomalies:
                # Investigating the primary anomaly using linear algebra concepts in the engine
                anomaly = insights.anomalies[0]
                yield self._packet("status", f"🕵️ Investigating anomaly in {anomaly.column}...")

                diagnostic = await self.diagnostic_service.investigate_anomaly(
                    anomaly=anomaly,
                    datasets=dataset_meta,
                    full_schema=full_schema,
                    tenant_id=tenant_id
                )

                if diagnostic:
                    yield self._packet("diagnostics", diagnostic.model_dump())

            # -------------------------------------------------------
            # STAGE 8 — Executive Narrative Generation
            # -------------------------------------------------------
            yield self._packet("status", "📝 Synthesizing executive narrative...")

            narrative = await self.narrative_service.generate_executive_summary(
                payload=insights,
                plan=plan,
                chart_spec=chart_spec,
                tenant_id=tenant_id
            )

            yield self._packet("narrative", narrative.model_dump())

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
            # ASYNC VECTOR CACHE WRITE (Fire-and-Forget)
            # -------------------------------------------------------
            self._trigger_background_cache(
                tenant_id=tenant_id,
                prompt=prompt,
                sql_query=sql_query,
                chart_spec=chart_spec,
                insights=insights,
                narrative=narrative.model_dump()
            )

        except Exception as e:
            logger.error(f"[{tenant_id}] Pipeline failure: {str(e)}", exc_info=True)
            yield self._packet("error", "The analytical engine encountered an internal failure.")

    # ------------------------------------------------------------
    # UTILITY METHODS
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

    def _trigger_background_cache(
        self, 
        tenant_id: str, 
        prompt: str, 
        sql_query: str, 
        chart_spec: Optional[Dict[str, Any]], 
        insights: InsightPayload, 
        narrative: Dict[str, Any]
    ) -> None:
        """Safely executes the cache write in the background without blocking the request loop."""
        def _cache_error_handler(task: asyncio.Task):
            try:
                task.result()
            except Exception as ex:
                logger.error(f"[{tenant_id}] Failed to write to vector cache: {ex}")

        cache_task = asyncio.create_task(
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
        cache_task.add_done_callback(_cache_error_handler)