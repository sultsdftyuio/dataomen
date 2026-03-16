import logging
import time
import asyncio
from typing import Dict, Any, List, Optional, AsyncGenerator
import json

from api.services.query_planner import QueryPlanner, QueryPlan
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine, DatasetMetadata, ComputeLocation
from api.services.insight_orchestrator import InsightOrchestrator, InsightPayload
from api.services.diagnostic_service import DiagnosticService
from api.services.narrative_service import NarrativeService
from api.services.cache_manager import cache_manager

logger = logging.getLogger(__name__)

class AnalyticalOrchestrator:
    """
    The Grand Conductor of the Dataomen Intelligence Pipeline.
    
    Wires together the Planner, Generator, Engine, Insight gauntlet, and Diagnostic agent.
    Supports SSE (Server-Sent Events) style streaming for the Dashboard UI.
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
        prompt: str, 
        dataset: DatasetMetadata, 
        tenant_id: str,
        full_schema: Dict[str, Dict[str, str]]
    ) -> AsyncGenerator[str, None]:
        """
        Executes the entire 5-stage pipeline and yields status/data packets 
        compatible with the DashboardOrchestrator frontend.
        """
        start_time = time.time()

        try:
            # STAGE 0: Cache Check
            yield self._packet("status", "Checking semantic cache...")
            cached = await cache_manager.get_cached_insight(tenant_id, dataset.dataset_id, prompt)
            if cached:
                yield self._packet("cache_hit", {
                    **cached,
                    "execution_time_ms": round((time.time() - start_time) * 1000, 2)
                })
                return

            # STAGE 1: Logical Planning (The Lead Engineer)
            yield self._packet("status", "AI Lead Engineer is architecting the query plan...")
            plan: QueryPlan = await self.planner.generate_plan(prompt, full_schema, tenant_id)
            yield self._packet("plan", plan.model_dump())

            if not plan.is_achievable:
                yield self._packet("error", plan.missing_data_reason)
                return

            # STAGE 2: SQL Compilation (Dialect-Specific)
            yield self._packet("status", f"Compiling optimized SQL for {dataset.location.value}...")
            # Note: target_engine is derived from the dataset location
            sql_query, chart_spec = await self.generator.generate_sql(
                plan=plan,
                full_schema=full_schema,
                target_engine=dataset.location.value,
                tenant_id=tenant_id
            )
            yield self._packet("reasoning", f"Generated optimized {dataset.location.value} query.")

            # STAGE 3: Compute Execution
            yield self._packet("status", "Executing vectorized scan...")
            query_result = await self.compute_engine.execute_query(sql_query, dataset)
            
            # Convert QueryResult (which holds a Polars-compatible list of dicts)
            # back to a Polars DataFrame for the Insight Gauntlet
            import polars as pl
            df = pl.DataFrame(query_result.data)

            # STAGE 4: Mathematical Insight Gauntlet
            yield self._packet("status", "Running statistical gauntlet (Z-Scores & Trends)...")
            insights: InsightPayload = self.insight_engine.analyze_dataframe(df, plan, tenant_id)
            yield self._packet("insights", insights.model_dump())

            # STAGE 4.5: The Autonomous Diagnostic Agent
            diagnostic_payload_dump = None
            if insights.anomalies:
                yield self._packet("status", f"Anomaly detected in '{insights.anomalies[0].column}'. Investigating root cause...")
                
                diagnostic_payload = await self.diagnostic_service.investigate_anomaly(
                    anomaly=insights.anomalies[0], # Investigate the most severe anomaly
                    dataset=dataset,
                    full_schema=full_schema,
                    tenant_id=tenant_id
                )
                
                if diagnostic_payload:
                    diagnostic_payload_dump = diagnostic_payload.model_dump()
                    yield self._packet("diagnostics", diagnostic_payload_dump)

            # STAGE 5: Executive Narrative
            yield self._packet("status", "Synthesizing executive summary...")
            narrative = await self.narrative_service.generate_executive_summary(
                payload=insights,
                plan=plan,
                chart_spec=chart_spec,
                tenant_id=tenant_id
                # Note: In future upgrades to NarrativeService, you can pass diagnostic_payload here to weave it into the story!
            )
            yield self._packet("narrative", narrative.model_dump())

            # FINALIZATION: Build the ExecutionPayload for the UI
            execution_payload = {
                "type": "chart" if chart_spec else "table",
                "data": query_result.data,
                "sql_used": sql_query,
                "chart_spec": chart_spec,
                "row_count": query_result.row_count
            }
            yield self._packet("data", execution_payload)

            # STAGE 6: Commit to Cache
            # We construct the cache payload mapping to exactly what the frontend expects
            await cache_manager.set_cached_insight(
                tenant_id=tenant_id,
                dataset_id=dataset.dataset_id,
                prompt=prompt,
                sql_query=sql_query,
                chart_spec=chart_spec,
                insight_payload=insights,
                narrative=narrative.model_dump()
            )

        except Exception as e:
            logger.error(f"[{tenant_id}] Pipeline Orchestration Failure: {str(e)}")
            yield self._packet("error", f"Orchestration Error: {str(e)}")

    def _packet(self, p_type: str, content: Any) -> str:
        """Helper to format SSE packets."""
        return f"data: {json.dumps({'type': p_type, 'content': content})}\n\n"