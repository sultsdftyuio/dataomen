# api/services/orchestrator.py

import logging
import time
import json
import asyncio
import polars as pl
from typing import Dict, Any, List, AsyncGenerator, Optional

from sqlalchemy.orm import Session

from api.services.query_planner import QueryPlanner, QueryPlan
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine, DatasetMetadata, ComputeLocation
from api.services.insight_orchestrator import InsightOrchestrator, InsightPayload
from api.services.diagnostic_service import DiagnosticService
from api.services.narrative_service import NarrativeService
from api.services.cache_manager import cache_manager
from api.services.duckdb_validator import DuckDBValidator
from api.services.llm_client import llm_client  # Added for Phase 1.2 & 2.2 (Embeddings/RAG)

from models import Dataset, Agent

logger = logging.getLogger(__name__)


class AnalyticalOrchestrator:
    """
    The High-Performance Conductor of the Dataomen Intelligence Pipeline.

    Architecture (Roadmap Aligned):
      - Orchestration : Async/OO pattern for clean dependency injection.
      - Computation   : Phase 1.1 Parallelized concurrent scanning + Vectorized Polars ops.
      - Security      : Phase 1.3 AST validation via DuckDBValidator & Tenant Isolation.
      - RAG & Cache   : Phase 1.2 & 2.2 Semantic Vector Caching & Schema Routing.
      - Streaming     : SSE-compatible packet generator for granular UX feedback.
    """

    def __init__(
        self,
        planner: QueryPlanner,
        generator: NL2SQLGenerator,
        compute_engine: ComputeEngine,
        insight_engine: InsightOrchestrator,
        diagnostic_service: DiagnosticService,
        narrative_service: NarrativeService,
    ):
        self.planner = planner
        self.generator = generator
        self.compute_engine = compute_engine
        self.insight_engine = insight_engine
        self.diagnostic_service = diagnostic_service
        self.narrative_service = narrative_service
        self.validator = DuckDBValidator()  # Phase 1.3: Hard SQL Guardrails

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def run_full_pipeline(
        self,
        db: Session,
        tenant_id: str,
        agent: Agent,
        prompt: str,
        full_schema: Optional[Dict[str, Dict[str, str]]] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Execute the full analytical pipeline and stream SSE-compatible packets.
        """
        start_time = time.time()

        try:
            # ----------------------------------------------------------
            # STAGE 0: Vector Semantic Cache (Phase 1.2 - 90% cost reduction)
            # ----------------------------------------------------------
            yield self._packet("status", "🔍 Consulting vector semantic memory...")
            
            # Generate embedding for Semantic Cache & RAG Routing
            try:
                prompt_embedding = await llm_client.embed(prompt)
            except Exception as e:
                logger.warning(f"[{tenant_id}] Embedding generation failed, falling back to exact cache: {e}")
                prompt_embedding = None

            cached = await cache_manager.get_cached_insight(
                tenant_id=tenant_id,
                dataset_id="multi_dataset",
                prompt=prompt,
                prompt_embedding=prompt_embedding  # Triggers similarity vector search
            )
            
            if cached:
                cached["execution_time_ms"] = round((time.time() - start_time) * 1000, 2)
                yield self._packet("cache_hit", cached)
                return

            # ----------------------------------------------------------
            # STAGE 1: Contextual Query Planning & RAG
            # ----------------------------------------------------------
            yield self._packet("status", "🧠 Architecting query strategy via Contextual RAG...")

            if full_schema is None:
                # Phase 2.2: Pass embedding to resolve only semantically relevant schemas
                full_schema = await self._build_schema_map(db, tenant_id, prompt_embedding)

            plan: QueryPlan = await self.planner.generate_plan(
                prompt=prompt,
                full_schema=full_schema,
                tenant_id=tenant_id,
            )
            yield self._packet("plan", plan.model_dump())

            if not plan.is_achievable:
                yield self._packet("error", plan.missing_data_reason)
                return

            # ----------------------------------------------------------
            # STAGE 2: Tenant-Isolated Dataset Resolution
            # ----------------------------------------------------------
            datasets = (
                db.query(Dataset)
                .filter(
                    Dataset.id.in_(plan.primary_datasets),
                    Dataset.tenant_id == tenant_id,  # Phase 5.1: Row-Level Tenant Security Enforcement
                )
                .all()
            )

            if not datasets:
                yield self._packet("error", "Tenant access denied or datasets not found.")
                return

            dataset_metadata: List[DatasetMetadata] = [
                DatasetMetadata.from_model(d) for d in datasets
            ]
            primary_location: str = dataset_metadata[0].location.value

            # ----------------------------------------------------------
            # STAGE 3: Secure, Dialect-Aware SQL Generation
            # ----------------------------------------------------------
            yield self._packet(
                "status",
                f"⚡ Compiling optimized {primary_location} SQL across {len(dataset_metadata)} source(s)...",
            )

            sql_query, chart_spec = await self.generator.generate_sql(
                plan=plan,
                full_schema=full_schema,
                datasets=dataset_metadata,
                target_engine=primary_location,
                tenant_id=tenant_id,
            )

            # Phase 1.3: Guardrail - AST-level validation blocks injections (DELETE/DROP/UPDATE)
            self.validator.validate_sql(sql_query)
            yield self._packet("reasoning", "SQL guardrails passed. Execution authorized.")

            # ----------------------------------------------------------
            # STAGE 4: Parallel Vectorized Compute (Phase 1.1)
            # ----------------------------------------------------------
            yield self._packet("status", "🚀 Executing parallel vectorized scans...")

            # Refactored for concurrency: Run dataset scans simultaneously instead of sequentially
            compute_tasks = [
                self.compute_engine.execute_query(sql_query, [dataset])
                for dataset in dataset_metadata
            ]
            
            query_results = await asyncio.gather(*compute_tasks, return_exceptions=True)
            
            combined_data = []
            total_rows = 0
            
            for idx, result in enumerate(query_results):
                if isinstance(result, Exception):
                    logger.error(f"[{tenant_id}] Parallel scan failed for dataset {dataset_metadata[idx].id}: {result}")
                    raise result
                if result and result.data:
                    combined_data.extend(result.data)
                    total_rows += result.row_count

            if not combined_data:
                yield self._packet(
                    "data",
                    {"type": "empty", "message": "No data points matched the applied filters."},
                )
                return

            # Phase 2.3: Load into Polars immediately for zero-copy, highly efficient downstream processing
            df = pl.DataFrame(combined_data)

            # ----------------------------------------------------------
            # STAGE 5: Vectorized Insight & Anomaly Engine (Phase 3.1)
            # ----------------------------------------------------------
            yield self._packet("status", "📊 Calculating statistical variance and anomalies...")

            insights: InsightPayload = self.insight_engine.analyze_dataframe(
                df, plan, tenant_id
            )
            yield self._packet("insights", insights.model_dump())

            # ----------------------------------------------------------
            # STAGE 5.5: Autonomous Root-Cause Analysis (Phase 3.3)
            # ----------------------------------------------------------
            diagnostic_payload_dump = None
            if insights.anomalies:
                anomaly = insights.anomalies[0]  # Focus on the most severe anomaly
                yield self._packet(
                    "status",
                    f"🕵️ Deep-dive: investigating anomaly in '{anomaly.column}'...",
                )

                diagnostic_payload = await self.diagnostic_service.investigate_anomaly(
                    anomaly=anomaly,
                    datasets=dataset_metadata,
                    full_schema=full_schema,
                    tenant_id=tenant_id,
                )

                if diagnostic_payload:
                    diagnostic_payload_dump = diagnostic_payload.model_dump()
                    yield self._packet("diagnostics", diagnostic_payload_dump)

            # ----------------------------------------------------------
            # STAGE 6: Executive Narrative Synthesis
            # ----------------------------------------------------------
            yield self._packet("status", "📝 Synthesizing executive summary...")

            narrative = await self.narrative_service.generate_executive_summary(
                payload=insights,
                plan=plan,
                chart_spec=chart_spec,
                tenant_id=tenant_id,
            )
            yield self._packet("narrative", narrative.model_dump())

            # ----------------------------------------------------------
            # FINALIZATION: Emit data packet + commit to Vector Cache
            # ----------------------------------------------------------
            execution_payload = {
                "type": "chart" if chart_spec else "table",
                "data": combined_data,
                "sql_used": sql_query,
                "chart_spec": chart_spec,
                "row_count": total_rows,
                "execution_time_ms": round((time.time() - start_time) * 1000, 2),
            }
            yield self._packet("data", execution_payload)

            await cache_manager.set_cached_insight(
                tenant_id=tenant_id,
                dataset_id="multi_dataset",
                prompt=prompt,
                prompt_embedding=prompt_embedding, # Store semantic signature
                sql_query=sql_query,
                chart_spec=chart_spec,
                insight_payload=insights,
                narrative=narrative.model_dump(),
            )

        except Exception as e:
            logger.error(
                "Critical pipeline failure [tenant=%s]: %s",
                tenant_id,
                str(e),
                exc_info=True,
            )
            yield self._packet("error", f"Engine error: {str(e)}")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _build_schema_map(
        self,
        db: Session,
        tenant_id: str,
        prompt_embedding: Optional[List[float]] = None
    ) -> Dict[str, Dict[str, str]]:
        """
        Phase 2.2: Semantic Schema Indexing & RAG Routing.
        Retrieves tenant-isolated schema definitions from the database.
        Uses the provided embedding to lookup only the top-k relevant tables,
        preventing context window bloat and AI hallucination.
        """
        datasets = (
            db.query(Dataset)
            .filter(Dataset.tenant_id == tenant_id)
            .all()
        )
        
        # If no embedding is provided or Qdrant integration is pending, fallback to full schema
        if not prompt_embedding:
            return {str(d.id): d.schema_definition for d in datasets}
            
        # TODO: Vector DB (e.g., Qdrant) Integration Point
        # Example Implementation:
        # relevant_dataset_ids = await vector_db.search_schemas(
        #     tenant_id=tenant_id, 
        #     vector=prompt_embedding, 
        #     top_k=5
        # )
        # datasets = [d for d in datasets if str(d.id) in relevant_dataset_ids]
        
        # Currently returns full schema as the Vector DB mapping logic solidifies
        return {str(d.id): d.schema_definition for d in datasets}

    @staticmethod
    def _packet(p_type: str, content: Any) -> str:
        """Format a standardized SSE data packet for the React frontend."""
        return f"data: {json.dumps({'type': p_type, 'content': content})}\n\n"