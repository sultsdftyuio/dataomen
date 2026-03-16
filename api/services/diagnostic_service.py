# api/services/diagnostic_service.py

import logging
import json
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import polars as pl

# Core Modular Ecosystem
from api.services.llm_client import llm_client
from api.services.query_planner import QueryPlan, QueryStep
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import compute_engine, ComputeEngine, DatasetMetadata
from api.services.insight_orchestrator import AnomalyInsight

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Strict Data Contracts
# -----------------------------------------------------------------------------

class DriverInsight(BaseModel):
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
    diagnostic_sql: str

# -----------------------------------------------------------------------------
# The Diagnostic Agent
# -----------------------------------------------------------------------------

class DiagnosticService:
    """
    Phase 5+: The Autonomous Root Cause Analyst.
    
    Adheres to the Hybrid Performance Paradigm:
    1. DETERMINISTIC: Uses Polars to group and sort dimensional drivers (Zero-Hallucination).
    2. SYNTHETIC: Uses llm_client to interpret mathematical findings into business logic.
    """
    
    def __init__(self, generator: Optional[NL2SQLGenerator] = None, compute: Optional[ComputeEngine] = None):
        # Fallback to singletons if not injected
        self.generator = generator or NL2SQLGenerator()
        self.compute = compute or compute_engine

    async def investigate_anomaly(
        self, 
        anomaly: AnomalyInsight, 
        dataset: DatasetMetadata, 
        full_schema: Dict[str, Dict[str, str]],
        tenant_id: str
    ) -> Optional[DiagnosticPayload]:
        """
        The core diagnostic loop. Slices the anomalous metric by dimensions,
        identifies mathematical drivers, and synthesizes the 'Why' via AI.
        """
        logger.info(f"[{tenant_id}] Deep-dive analysis triggered for {anomaly.column} on {anomaly.row_identifier}.")

        # 1. Isolate Slicing Dimensions (Schema Pruning)
        dimensions = []
        for _, cols in full_schema.items():
            for col, dtype in cols.items():
                col_lower = col.lower()
                # Target categorical strings, ignore technical IDs
                if str(dtype).upper() in ["VARCHAR", "STRING", "TEXT"] and not col_lower.endswith("id") and col_lower != "id":
                    dimensions.append(col)

        if not dimensions:
            logger.warning(f"[{tenant_id}] No dimensions found to diagnose {anomaly.column}.")
            return None

        # Focus context on top 4 dimensions to maximize signal-to-noise
        target_dimensions = dimensions[:4]
        
        # 2. Programmatic Execution Plan (Bypasses Planner for speed)
        diagnostic_plan = QueryPlan(
            intent=f"Root Cause Analysis for {anomaly.column} shift",
            is_achievable=True,
            steps=[
                QueryStep(
                    step_number=1, 
                    operation="AGGREGATE", 
                    description=f"Group by {target_dimensions} and calculate absolute change for {anomaly.column}.", 
                    columns_involved=[anomaly.column] + target_dimensions
                )
            ],
            suggested_visualizations=["bar_chart"]
        )

        try:
            # 3. Dialect-Specific SQL Generation
            sql_query, _ = await self.generator.generate_sql(
                plan=diagnostic_plan,
                full_schema=full_schema,
                target_engine=dataset.location.value,
                tenant_id=tenant_id
            )

            # 4. Vectorized Execution
            result = await self.compute.execute_read_only(
                db=None, 
                tenant_id=tenant_id, 
                datasets=[], # URIs resolved by engine
                query=sql_query
            )
            
            if not result:
                return None

            # 5. Extract Mathematical Drivers (Polars)
            df = pl.DataFrame(result)
            drivers = self._extract_top_drivers(df, target_dimensions, anomaly)

            # 6. AI Synthesis (The 'Why')
            # We only invoke the LLM if we have meaningful mathematical drivers to explain
            ai_diagnosis = None
            if drivers:
                ai_diagnosis = await self._synthesize_diagnosis(tenant_id, anomaly, drivers)

            return DiagnosticPayload(
                anomaly_analyzed=anomaly,
                top_drivers=drivers,
                ai_diagnosis=ai_diagnosis,
                diagnostic_sql=sql_query
            )

        except Exception as e:
            logger.error(f"[{tenant_id}] Diagnostic deep-dive crash: {str(e)}")
            return None

    # -------------------------------------------------------------------------
    # Internal Intelligence Modules
    # -------------------------------------------------------------------------

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
            "You are a Staff Principal Analyst. Your job is to interpret mathematical "
            "drivers behind a data anomaly and explain the 'Why' to stakeholders."
        )

        # Convert drivers to a lean JSON block for the prompt
        driver_context = [d.model_dump() for d in drivers]
        
        user_prompt = f"""
        ANOMALY DETECTED:
        - Metric: {anomaly.column}
        - Observed Shift: {anomaly.value} (Z-Score: {anomaly.z_score})
        - Direction: {'Spike' if anomaly.is_positive else 'Drop'}
        
        MATHEMATICAL DRIVERS (Calculated via Polars):
        {json.dumps(driver_context, indent=2)}
        
        TASK:
        Identify the primary culprit and provide a concise root-cause narrative.
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
        change_col = next((c for c in df.columns if any(k in c.lower() for k in ['change', 'diff', 'var', 'delta'])), None)
        if not change_col:
            # Fallback to first numeric column that isn't the primary metric
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

            contribution = (abs(change_val) / total_abs_variance * 100)
            
            drivers.append(DriverInsight(
                dimension=dim_name,
                category=cat_val,
                absolute_change=round(change_val, 2),
                contribution_percentage=round(contribution, 2)
            ))

        return drivers

# Global Singleton
diagnostic_service = DiagnosticService()