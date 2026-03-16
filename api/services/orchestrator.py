import logging
import time
import json
import asyncio
import polars as pl

from typing import Dict, Any, List, AsyncGenerator, Optional

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

from models import Dataset

logger = logging.getLogger(__name__)


class AnalyticalOrchestrator:
    """
    DataOmen Analytical Intelligence Pipeline

    Responsibilities
    ----------------
    1. Semantic dataset routing
    2. Query planning
    3. SQL generation
    4. Parallel compute execution
    5. Insight extraction
    6. Root cause diagnostics
    7. Executive narrative synthesis
    8. Vector caching
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
            # STAGE 0 — Prompt Embedding
            # -------------------------------------------------------

            prompt_embedding = None

            try:
                prompt_embedding = await llm_client.embed(prompt)
            except Exception as e:
                logger.warning(f"Embedding failure: {e}")

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

                cached["execution_time_ms"] = round(
                    (time.time() - start_time) * 1000, 2
                )

                yield self._packet("cache_hit", cached)
                return

            # -------------------------------------------------------
            # STAGE 2 — Semantic Dataset Routing
            # -------------------------------------------------------

            yield self._packet("status", "🧠 Routing datasets via semantic index...")

            routed_datasets = await self.router.route_datasets(
                db=db,
                tenant_id=tenant_id,
                prompt=prompt,
                embedding=prompt_embedding
            )

            if not routed_datasets:

                yield self._packet(
                    "error",
                    "No datasets were relevant to this query."
                )
                return

            dataset_meta = [
                DatasetMetadata.from_model(d) for d in routed_datasets
            ]

            full_schema = {
                str(d.id): d.schema_definition for d in routed_datasets
            }

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

                yield self._packet(
                    "error",
                    plan.missing_data_reason
                )
                return

            # -------------------------------------------------------
            # STAGE 4 — SQL Generation
            # -------------------------------------------------------

            yield self._packet(
                "status",
                f"⚡ Generating optimized SQL across {len(dataset_meta)} datasets..."
            )

            target_engine = dataset_meta[0].location.value

            sql_query, chart_spec = await self.generator.generate_sql(
                plan=plan,
                full_schema=full_schema,
                datasets=dataset_meta,
                target_engine=target_engine,
                tenant_id=tenant_id
            )

            # SQL security validation
            self.validator.validate_sql(sql_query)

            yield self._packet("sql", sql_query)

            # -------------------------------------------------------
            # STAGE 5 — Parallel Compute Execution
            # -------------------------------------------------------

            yield self._packet("status", "🚀 Executing vectorized compute engine...")

            compute_tasks = [
                self.compute_engine.execute_query_async(
                    sql_query,
                    dataset,
                    tenant_id
                )
                for dataset in dataset_meta
            ]

            results = await asyncio.gather(
                *compute_tasks,
                return_exceptions=True
            )

            combined_data = []
            total_rows = 0

            for i, result in enumerate(results):

                if isinstance(result, Exception):

                    logger.error(
                        f"Dataset compute failed: {dataset_meta[i].dataset_id}"
                    )
                    raise result

                if result and result.data:

                    combined_data.extend(result.data)
                    total_rows += result.row_count

            if not combined_data:

                yield self._packet(
                    "data",
                    {
                        "type": "empty",
                        "message": "No rows matched the query filters."
                    }
                )
                return

            # -------------------------------------------------------
            # STAGE 6 — Polars Vector Processing
            # -------------------------------------------------------

            yield self._packet("status", "📊 Extracting statistical insights...")

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

            diagnostic_dump = None

            if insights.anomalies:

                anomaly = insights.anomalies[0]

                yield self._packet(
                    "status",
                    f"🕵️ Investigating anomaly in {anomaly.column}..."
                )

                diagnostic = await self.diagnostic_service.investigate_anomaly(
                    anomaly=anomaly,
                    datasets=dataset_meta,
                    full_schema=full_schema,
                    tenant_id=tenant_id
                )

                if diagnostic:

                    diagnostic_dump = diagnostic.model_dump()

                    yield self._packet(
                        "diagnostics",
                        diagnostic_dump
                    )

            # -------------------------------------------------------
            # STAGE 8 — Narrative Generation
            # -------------------------------------------------------

            yield self._packet("status", "📝 Synthesizing executive narrative...")

            narrative = await self.narrative_service.generate_executive_summary(
                payload=insights,
                plan=plan,
                chart_spec=chart_spec,
                tenant_id=tenant_id
            )

            yield self._packet(
                "narrative",
                narrative.model_dump()
            )

            # -------------------------------------------------------
            # FINAL RESULT
            # -------------------------------------------------------

            execution_payload = {

                "type": "chart" if chart_spec else "table",
                "data": combined_data,
                "chart_spec": chart_spec,
                "sql_used": sql_query,
                "row_count": total_rows,
                "execution_time_ms": round(
                    (time.time() - start_time) * 1000, 2
                )
            }

            yield self._packet("data", execution_payload)

            # -------------------------------------------------------
            # ASYNC VECTOR CACHE WRITE
            # -------------------------------------------------------

            asyncio.create_task(

                cache_manager.set_cached_insight(

                    tenant_id=tenant_id,
                    dataset_id="multi_dataset",
                    prompt=prompt,
                    prompt_embedding=prompt_embedding,
                    sql_query=sql_query,
                    chart_spec=chart_spec,
                    insight_payload=insights,
                    narrative=narrative.model_dump()
                )
            )

        except Exception as e:

            logger.error(
                "Pipeline failure [tenant=%s]: %s",
                tenant_id,
                str(e),
                exc_info=True
            )

            yield self._packet(
                "error",
                "The analytical engine encountered an internal failure."
            )

    # ------------------------------------------------------------
    # PACKET FORMATTER
    # ------------------------------------------------------------

    @staticmethod
    def _packet(p_type: str, content: Any) -> str:

        try:

            payload = json.dumps(
                {"type": p_type, "content": content},
                default=str
            )

            return f"data: {payload}\n\n"

        except Exception:

            return (
                "data: "
                + json.dumps(
                    {
                        "type": "error",
                        "content": "Serialization error"
                    }
                )
                + "\n\n"
            )