# api/services/diagnostic_service.py

import logging
import json
import asyncio
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import polars as pl

from sqlalchemy.orm import Session

# Core Modular Ecosystem
from api.services.llm_client import llm_client
from api.services.compute_engine import compute_engine, ComputeEngine, DatasetMetadata
from api.services.insight_orchestrator import AnomalyInsight

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Strict Data Contracts (The Agent's Output Shapes)
# -----------------------------------------------------------------------------

class DiagnosticQueryPlan(BaseModel):
    """Structured AI output for generating parallel slice-and-dice queries."""
    queries: List[str] = Field(
        ...,
        description="A list of 2-3 DuckDB SQL queries that GROUP BY different dimensions to find the root cause."
    )
    reasoning: str = Field(
        ...,
        description="Explanation of why these specific dimensions were chosen for investigation."
    )

class DriverInsight(BaseModel):
    """Deterministic mathematical calculation of what drove the anomaly."""
    dimension: str = Field(..., description="The category column used to slice the data (e.g., 'region').")
    category: str = Field(..., description="The specific value inside the dimension (e.g., 'North America').")
    absolute_change: float = Field(..., description="The raw numerical difference driving the anomaly.")
    contribution_percentage: float = Field(..., description="How much of the total anomaly this specific category is responsible for.")

class AIDiagnosis(BaseModel):
    """Structured AI interpretation of mathematical drivers."""
    primary_culprit: str = Field(..., description="The specific segment or dimension primarily responsible for the shift.")
    root_cause_narrative: str = Field(..., description="A 2-sentence executive explanation of the driver impact.")
    impact_assessment: str = Field(..., description="Evaluation of whether this shift is isolated or systematic.")

class DiagnosticPayload(BaseModel):
    """The complete diagnostic brief returned to the Orchestrator or Agent."""
    anomaly_analyzed: AnomalyInsight
    top_drivers: List[DriverInsight] = []
    ai_diagnosis: Optional[AIDiagnosis] = None
    diagnostic_queries: List[str] = []

# -----------------------------------------------------------------------------
# The Autonomous Diagnostic Agent
# -----------------------------------------------------------------------------

class DiagnosticService:
    """
    Phase 3.3: The Autonomous Root Cause Analyst.
    
    Adheres to the Hybrid Performance Paradigm:
    1. AGENTIC: Autonomously formulates parallel slice-and-dice queries.
    2. DETERMINISTIC: Uses Polars to group and sort dimensional drivers (Zero-Hallucination math).
    3. SYNTHETIC: Uses llm_client to interpret mathematical findings into business logic.
    """
    
    def __init__(self, compute: Optional[ComputeEngine] = None):
        # Fallback to singleton if not injected
        self.compute = compute or compute_engine

    async def investigate_anomaly(
        self, 
        anomaly: AnomalyInsight, 
        datasets: List[DatasetMetadata], 
        full_schema: Dict[str, Dict[str, str]],
        tenant_id: str,
        db: Optional[Session] = None
    ) -> Optional[DiagnosticPayload]:
        """
        The core diagnostic loop.
        """
        logger.info(f"[{tenant_id}] 🕵️ Deep-dive analysis triggered for '{anomaly.column}'.")

        # 1. AI Formulates the Investigation Plan
        query_plan = await self._generate_investigation_queries(anomaly, datasets, full_schema)
        
        if not query_plan or not query_plan.queries:
            logger.warning(f"[{tenant_id}] Diagnostic Agent failed to generate a valid drill-down plan.")
            return None

        # 2. Parallel Vectorized Execution (Phase 1.1)
        logger.info(f"[{tenant_id}] Executing {len(query_plan.queries)} parallel drill-down queries...")
        
        execution_tasks = []
        for sql in query_plan.queries:
            task = self.compute.execute_read_only(
                db=db, 
                tenant_id=tenant_id, 
                datasets=datasets, 
                query=sql,
                bypass_cache=True # Real-time investigation ignores cache
            )
            execution_tasks.append(task)

        raw_results = await asyncio.gather(*execution_tasks, return_exceptions=True)

        # 3. Extract Mathematical Drivers (Polars Deterministic Math)
        all_drivers: List[DriverInsight] = []
        
        for idx, result in enumerate(raw_results):
            if isinstance(result, Exception):
                logger.error(f"[{tenant_id}] Drill-down query {idx} failed: {result}")
                continue
                
            if result:
                df = pl.DataFrame(result)
                # Extract dimensions from schema to help Polars find the categorical columns
                dimensions = self._get_categorical_columns(full_schema)
                query_drivers = self._extract_top_drivers(df, dimensions, anomaly)
                all_drivers.extend(query_drivers)

        if not all_drivers:
            logger.warning(f"[{tenant_id}] No mathematical drivers could be extracted from drill-downs.")
            return None

        # Sort and take the top 5 absolute drivers across all parallel queries
        all_drivers.sort(key=lambda x: x.contribution_percentage, reverse=True)
        top_drivers = all_drivers[:5]

        # 4. AI Synthesis (The 'Why')
        ai_diagnosis = await self._synthesize_diagnosis(tenant_id, anomaly, top_drivers)

        return DiagnosticPayload(
            anomaly_analyzed=anomaly,
            top_drivers=top_drivers,
            ai_diagnosis=ai_diagnosis,
            diagnostic_queries=query_plan.queries
        )

    # -------------------------------------------------------------------------
    # Internal Intelligence Modules
    # -------------------------------------------------------------------------

    async def _generate_investigation_queries(
        self, 
        anomaly: AnomalyInsight, 
        datasets: List[DatasetMetadata], 
        schema: Dict[str, Dict[str, str]]
    ) -> Optional[DiagnosticQueryPlan]:
        """Calls the LLM to write 2-3 dimensional slice-and-dice DuckDB queries."""
        
        dataset_ids = [d.id for d in datasets]
        schema_dump = json.dumps({str(d_id): schema.get(str(d_id), {}) for d_id in dataset_ids}, indent=2)
        
        # Determine target dialect safely; ORM Dataset objects may not expose `location`.
        dialect = "duckdb"
        if datasets:
            location = getattr(datasets[0], "location", None)
            dialect = getattr(location, "value", "duckdb") if location is not None else "duckdb"

        system_prompt = f"""
        You are an autonomous Senior Data Analyst. An anomaly was detected in a dataset.
        Write 2 to 3 {dialect} SQL queries to "slice and dice" the data on the anomaly date to find the root cause.
        
        Rules:
        1. Query ONLY the datasets provided. Format table names as "dataset_uuid" (e.g., "123e4567-e89b-12d3").
        2. GROUP BY categorical dimensions (e.g., region, channel, category, status).
        3. Create a column named "absolute_change" or "variance" representing the metric's change.
        4. ORDER BY the variance descending.
        """

        user_prompt = f"""
        SCHEMA:
        {schema_dump}

        ANOMALY METRIC: {anomaly.column}
        DIRECTION: {'Spike' if anomaly.is_positive else 'Drop'}
        
        Write the SQL queries required to isolate WHICH specific categories drove this shift.
        """

        try:
            return await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=user_prompt,
                response_model=DiagnosticQueryPlan,
                temperature=0.1
            )
        except Exception as e:
            logger.error(f"Failed to generate diagnostic queries: {e}")
            return None

    async def _synthesize_diagnosis(
        self, 
        tenant_id: str, 
        anomaly: AnomalyInsight, 
        drivers: List[DriverInsight]
    ) -> Optional[AIDiagnosis]:
        """
        Contextual RAG: Bridges the gap between raw math and business meaning.
        Uses the centralized llm_client for structured interpretation.
        """
        system_prompt = (
            "You are an Elite Business Data Translator. Your job is to interpret mathematical "
            "drivers behind a data anomaly and explain the 'Why' to stakeholders."
        )

        driver_context = [d.model_dump() for d in drivers]
        
        user_prompt = f"""
        ANOMALY DETECTED:
        - Metric: {anomaly.column}
        - Observed Shift: {anomaly.value}
        - Direction: {'Spike' if anomaly.is_positive else 'Drop'}
        
        MATHEMATICAL DRIVERS (Calculated via Vector Engine):
        {json.dumps(driver_context, indent=2)}
        
        TASK:
        Identify the primary culprit and provide a concise, executive root-cause narrative. 
        Do not mention SQL, databases, or generic terms—speak purely to the business dimensions.
        """

        try:
            return await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=user_prompt,
                response_model=AIDiagnosis,
                temperature=0.1 # High precision reasoning
            )
        except Exception as e:
            logger.warning(f"[{tenant_id}] AI Diagnosis synthesis failed: {e}")
            return None

    def _extract_top_drivers(self, df: pl.DataFrame, dimensions: List[str], anomaly: AnomalyInsight) -> List[DriverInsight]:
        """Deterministic grouping logic using Polars."""
        drivers = []
        
        # Heuristically find the variance/delta column generated by the SQL
        change_col = next((c for c in df.columns if any(k in c.lower() for k in ['change', 'diff', 'var', 'delta', 'absolute'])), None)
        if not change_col:
            numeric_cols = [c for c in df.columns if df[c].dtype in pl.NUMERIC_DTYPES and c != anomaly.column]
            change_col = numeric_cols[0] if numeric_cols else None

        if not change_col:
            return drivers

        total_abs_variance = df[change_col].abs().sum()
        if total_abs_variance == 0:
            return drivers

        # Sort by impact (descending for spikes, ascending for drops)
        top_rows = df.sort(change_col, descending=anomaly.is_positive).head(3).to_dicts()

        for row in top_rows:
            change_val = float(row.get(change_col, 0))
            
            # Find the active dimension for this row
            dim_name, cat_val = "unknown", "unknown"
            for d in dimensions:
                if d in row and row[d] is not None:
                    dim_name, cat_val = d, str(row[d])
                    break
            
            # Skip if we couldn't identify the dimension being grouped
            if dim_name == "unknown":
                continue

            contribution = (abs(change_val) / total_abs_variance * 100)
            
            drivers.append(DriverInsight(
                dimension=dim_name,
                category=cat_val,
                absolute_change=round(change_val, 2),
                contribution_percentage=round(contribution, 2)
            ))

        return drivers

    def _get_categorical_columns(self, full_schema: Dict[str, Dict[str, str]]) -> List[str]:
        """Utility to extract string/categorical columns to aid Polars parsing."""
        dimensions = []
        for _, cols in full_schema.items():
            for col, dtype in cols.items():
                col_lower = col.lower()
                if str(dtype).upper() in ["VARCHAR", "STRING", "TEXT"] and not col_lower.endswith("id") and col_lower != "id":
                    dimensions.append(col)
        return dimensions

# Global Singleton
diagnostic_service = DiagnosticService()