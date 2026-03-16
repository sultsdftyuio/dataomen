import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import polars as pl

# Import our core analytical ecosystem
from api.services.query_planner import QueryPlan, QueryStep
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import ComputeEngine, DatasetMetadata
from api.services.insight_orchestrator import AnomalyInsight

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Strict Data Contracts
# -----------------------------------------------------------------------------

class DriverInsight(BaseModel):
    dimension: str = Field(..., description="The category column used to slice the data (e.g., 'region', 'product_tier').")
    category: str = Field(..., description="The specific value inside the dimension (e.g., 'North America', 'Enterprise').")
    absolute_change: float = Field(..., description="The raw numerical difference driving the anomaly.")
    contribution_percentage: float = Field(..., description="How much of the total anomaly this specific category is responsible for.")

class DiagnosticPayload(BaseModel):
    anomaly_analyzed: AnomalyInsight
    top_drivers: List[DriverInsight] = []
    diagnostic_sql: str

# -----------------------------------------------------------------------------
# The Diagnostic Agent
# -----------------------------------------------------------------------------

class DiagnosticService:
    """
    Phase 5: The Autonomous Root Cause Analyst.
    
    Adheres to the Hybrid Performance Paradigm:
    When an anomaly is detected, this service automatically isolates categorical 
    dimensions in the schema, writes a sub-query to group the metric by those dimensions,
    and uses vectorized Polars math to find the deterministic root causes (Top Drivers).
    """
    
    def __init__(self, generator: NL2SQLGenerator, compute: ComputeEngine):
        # Dependency Injection of our core analytical tools
        self.generator = generator
        self.compute = compute

    async def investigate_anomaly(
        self, 
        anomaly: AnomalyInsight, 
        dataset: DatasetMetadata, 
        full_schema: Dict[str, Dict[str, str]],
        tenant_id: str
    ) -> Optional[DiagnosticPayload]:
        """
        The core diagnostic loop. Slices the anomalous metric by dimensions to find 'WHY' it shifted.
        """
        logger.info(f"[{tenant_id}] Autonomous diagnostic deep-dive triggered for {anomaly.column} anomaly on {anomaly.row_identifier}.")

        # 1. Isolate Slicing Dimensions
        # We look for VARCHAR/Categorical columns in the schema to slice the data by.
        # We explicitly ignore ID columns to prevent meaningless groupings.
        dimensions = []
        for table, cols in full_schema.items():
            for col, dtype in cols.items():
                col_lower = col.lower()
                if dtype.upper() in ["VARCHAR", "STRING", "TEXT"] and not col_lower.endswith("id") and col_lower != "id":
                    dimensions.append(col)

        if not dimensions:
            logger.warning(f"[{tenant_id}] No categorical dimensions found to diagnose the {anomaly.column} anomaly.")
            return None

        # Take top 3-5 dimensions to prevent massive query explosion
        target_dimensions = dimensions[:4]
        dim_list_str = ", ".join(target_dimensions)
        
        # 2. Create a Programmatic Execution Plan
        # We bypass the LLM QueryPlanner here because we know EXACTLY what we need: a dimensional breakdown.
        diagnostic_plan = QueryPlan(
            intent=f"Root Cause Dimensional Breakdown for {anomaly.column} shift on {anomaly.row_identifier}",
            is_achievable=True,
            steps=[
                QueryStep(
                    step_number=1, 
                    operation="AGGREGATE", 
                    description=f"Group by dimensions ({dim_list_str}) and calculate the absolute variance/change of {anomaly.column} comparing {anomaly.row_identifier} to the previous period.", 
                    columns_involved=[anomaly.column] + target_dimensions
                )
            ],
            suggested_visualizations=["bar_chart"]
        )

        try:
            # 3. Compile Diagnostic SQL (Dialect Pushdown)
            sql_query, _ = await self.generator.generate_sql(
                plan=diagnostic_plan,
                full_schema=full_schema,
                target_engine=dataset.location.value,
                tenant_id=tenant_id
            )

            # 4. Execute Compute
            result = await self.compute.execute_query(sql_query, dataset)
            if not result.data or result.row_count == 0:
                return None

            # 5. Extract Top Drivers via Vectorized Math (Zero LLM Hallucination)
            df = pl.DataFrame(result.data)
            drivers = self._extract_top_drivers(df, target_dimensions, anomaly)

            return DiagnosticPayload(
                anomaly_analyzed=anomaly,
                top_drivers=drivers,
                diagnostic_sql=sql_query
            )

        except Exception as e:
            logger.error(f"[{tenant_id}] Diagnostic deep-dive failed: {str(e)}")
            return None

    # -------------------------------------------------------------------------
    # Internal Math Helpers
    # -------------------------------------------------------------------------

    def _extract_top_drivers(self, df: pl.DataFrame, dimensions: List[str], anomaly: AnomalyInsight) -> List[DriverInsight]:
        """
        Uses Polars to sort the dimensional groupings and find the mathematical drivers.
        """
        drivers = []
        
        # Find the column the LLM used for the variance/change calculation
        # E.g., 'absolute_change', 'variance', 'difference'
        change_col = next((c for c in df.columns if any(keyword in c.lower() for keyword in ['change', 'diff', 'var'])), None)
        
        # If the LLM didn't name it well, fallback to the first numeric column that isn't the metric itself
        if not change_col:
            numeric_cols = [c for c in df.columns if df[c].dtype in pl.NUMERIC_DTYPES and c != anomaly.column]
            if numeric_cols:
                change_col = numeric_cols[0]

        if not change_col:
            return drivers

        # Calculate total absolute variance to determine contribution percentages
        total_variance = df[change_col].abs().sum()

        # Sort to find the biggest movers
        top_rows = df.sort(change_col, descending=anomaly.is_positive).head(4).to_dicts()

        for row in top_rows:
            change_val = float(row.get(change_col, 0))
            
            # Find which specific dimension caused this row's movement
            dim_used = "Unknown"
            cat_used = "Unknown"
            
            for d in dimensions:
                if d in row and row[d] is not None:
                    dim_used = d
                    cat_used = str(row[d])
                    break # We found the primary dimension for this grouping

            contribution = (abs(change_val) / total_variance * 100) if total_variance > 0 else 0.0

            drivers.append(DriverInsight(
                dimension=dim_used,
                category=cat_used,
                absolute_change=round(change_val, 2),
                contribution_percentage=round(contribution, 2)
            ))

        return drivers