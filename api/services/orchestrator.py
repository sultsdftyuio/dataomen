# api/services/orchestrator.py

import logging
import time
import json
import polars as pl
from typing import Dict, Any, List, AsyncGenerator

from sqlalchemy.orm import Session

from api.services.query_planner import QueryPlanner, QueryPlan
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine, DatasetMetadata
from api.services.insight_orchestrator import InsightOrchestrator, InsightPayload
from api.services.diagnostic_service import DiagnosticService
from api.services.narrative_service import NarrativeService
from api.services.cache_manager import cache_manager

from models import Dataset, Agent

logger = logging.getLogger(__name__)


class AnalyticalOrchestrator:
    """
    The Grand Conductor of the Dataomen Intelligence Pipeline.

    Complete AI Analytics Execution Pipeline:

    0. Semantic Cache
    1. Query Planning
    2. SQL Generation
    3. Vectorized Compute Execution
    4. Mathematical Insight Engine
    5. Autonomous Root Cause Analysis
    6. Executive Narrative Synthesis
    7. Cache Commit
    """

    def __init__(
        self,
        planner: QueryPlanner,
        generator: NL2SQLGenerator,
        compute_engine: ComputeEngine,
        insight_engine: InsightOrchestrator,
        diagnostic_service: DiagnosticService,
        narrative_service: NarrativeService
    ):
        self.planner = planner
        self.generator = generator
        self.compute_engine = compute_engine
        self.insight_engine = insight_engine
        self.diagnostic_service = diagnostic_service
        self.narrative_service = narrative_service

    async def run_full_pipeline(
        self,
        db: Session,
        tenant_id: str,
        agent: Agent,
        prompt: str
    ) -> AsyncGenerator[str, None]:

        start_time = time.time()

        try:

            # ---------------------------------------
            # STAGE 0: Semantic Cache
            # ---------------------------------------

            yield self._packet("status", "Checking semantic cache...")

            cached = await cache_manager.get_cached_insight(
                tenant_id=tenant_id,
                dataset_id="multi_dataset",
                prompt=prompt
            )

            if cached:
                cached["execution_time_ms"] = round((time.time() - start_time) * 1000, 2)
                yield self._packet("cache_hit", cached)
                return

            # ---------------------------------------
            # STAGE 1: Query Planning
            # ---------------------------------------

            yield self._packet("status", "AI Lead Engineer is designing the query strategy...")

            full_schema = await self._build_schema_map(db, tenant_id)

            plan: QueryPlan = await self.planner.generate_plan(
                prompt=prompt,
                full_schema=full_schema,
                tenant_id=tenant_id
            )

            yield self._packet("plan", plan.model_dump())

            if not plan.is_achievable:
                yield self._packet("error", plan.missing_data_reason)
                return

            # ---------------------------------------
            # STAGE 2: Dataset Resolution
            # ---------------------------------------

            datasets = db.query(Dataset).filter(
                Dataset.id.in_(plan.primary_datasets),
                Dataset.tenant_id == tenant_id
            ).all()

            if not datasets:
                yield self._packet("error", "No datasets found for this query.")
                return

            dataset_metadata = [
                DatasetMetadata.from_model(d) for d in datasets
            ]

            # ---------------------------------------
            # STAGE 3: SQL Generation
            # ---------------------------------------

            yield self._packet(
                "status",
                f"Compiling optimized SQL across {len(dataset_metadata)} datasets..."
            )

            sql_query, chart_spec = await self.generator.generate_sql(
                plan=plan,
                full_schema=full_schema,
                datasets=dataset_metadata,
                tenant_id=tenant_id
            )

            yield self._packet("reasoning", "Optimized SQL compiled.")

            # ---------------------------------------
            # STAGE 4: Vectorized Compute Execution
            # ---------------------------------------

            yield self._packet("status", "Executing vectorized compute scan...")

            query_result = await self.compute_engine.execute_query(
                sql_query,
                dataset_metadata
            )

            if not query_result.data:
                yield self._packet("data", {
                    "type": "empty",
                    "message": "Query successful but no data matched the filters."
                })
                return

            df = pl.DataFrame(query_result.data)

            # ---------------------------------------
            # STAGE 5: Insight Gauntlet
            # ---------------------------------------

            yield self._packet(
                "status",
                "Running statistical insight engine (Z-Scores, trends, correlations)..."
            )

            insights: InsightPayload = self.insight_engine.analyze_dataframe(
                df,
                plan,
                tenant_id
            )

            yield self._packet("insights", insights.model_dump())

            # ---------------------------------------
            # STAGE 5.5: Autonomous Diagnostics
            # ---------------------------------------

            diagnostic_payload_dump = None

            if insights.anomalies:

                anomaly = insights.anomalies[0]

                yield self._packet(
                    "status",
                    f"Anomaly detected in '{anomaly.column}'. Investigating root cause..."
                )

                diagnostic_payload = await self.diagnostic_service.investigate_anomaly(
                    anomaly=anomaly,
                    datasets=dataset_metadata,
                    full_schema=full_schema,
                    tenant_id=tenant_id
                )

                if diagnostic_payload:
                    diagnostic_payload_dump = diagnostic_payload.model_dump()
                    yield self._packet("diagnostics", diagnostic_payload_dump)

            # ---------------------------------------
            # STAGE 6: Narrative Synthesis
            # ---------------------------------------

            yield self._packet("status", "Synthesizing executive summary...")

            narrative = await self.narrative_service.generate_executive_summary(
                payload=insights,
                plan=plan,
                chart_spec=chart_spec,
                tenant_id=tenant_id
            )

            yield self._packet("narrative", narrative.model_dump())

            # ---------------------------------------
            # FINALIZATION
            # ---------------------------------------

            execution_payload = {
                "type": "chart" if chart_spec else "table",
                "data": query_result.data,
                "sql_used": sql_query,
                "chart_spec": chart_spec,
                "row_count": query_result.row_count,
                "execution_time_ms": round((time.time() - start_time) * 1000, 2)
            }

            yield self._packet("data", execution_payload)

            # ---------------------------------------
            # CACHE RESULT
            # ---------------------------------------

            await cache_manager.set_cached_insight(
                tenant_id=tenant_id,
                dataset_id="multi_dataset",
                prompt=prompt,
                sql_query=sql_query,
                chart_spec=chart_spec,
                insight_payload=insights,
                narrative=narrative.model_dump()
            )

        except Exception as e:

            logger.error(f"[{tenant_id}] Pipeline Failure: {str(e)}")

            yield self._packet(
                "error",
                f"Pipeline orchestration error: {str(e)}"
            )

    async def _build_schema_map(
        self,
        db: Session,
        tenant_id: str
    ) -> Dict[str, Dict[str, str]]:
        """
        Build dataset schema map for the planner.
        """

        datasets = db.query(Dataset).filter(
            Dataset.tenant_id == tenant_id
        ).all()

        schema = {}

        for d in datasets:
            schema[d.id] = d.schema_definition

        return schema

    def _packet(self, p_type: str, content: Any) -> str:
        """Format SSE packet for streaming frontend."""
        return f"data: {json.dumps({'type': p_type, 'content': content})}\n\n"