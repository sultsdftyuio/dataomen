import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

import numpy as np
import polars as pl

# Import the QueryPlan to understand the context of the data
from api.services.query_planner import QueryPlan

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Strict Data Contracts for Insights
# -------------------------------------------------------------------------

class AnomalyInsight(BaseModel):
    column: str = Field(..., description="The metric containing the anomaly.")
    row_identifier: str = Field(..., description="The date or category where the anomaly occurred.")
    value: float = Field(..., description="The actual recorded value.")
    z_score: float = Field(..., description="How many standard deviations from the mean (magnitude).")
    is_positive: bool = Field(..., description="True if the anomaly is a spike, False if a drop.")

class TrendInsight(BaseModel):
    column: str
    direction: str = Field(..., description="'increasing', 'decreasing', or 'flat'")
    slope: float = Field(..., description="The mathematical trajectory over time.")
    percentage_change: float = Field(..., description="Percent difference between the first and last period.")

class CorrelationInsight(BaseModel):
    metric_a: str
    metric_b: str
    pearson_coefficient: float = Field(..., description="Value between -1.0 and 1.0 indicating correlation strength.")

class InsightPayload(BaseModel):
    """
    The structured mathematical analysis passed to the NarrativeService 
    to prevent AI hallucinations and ground the final text summary in pure math.
    """
    row_count: int
    intent_analyzed: str = Field(..., description="The original intent mapped from the QueryPlan.")
    trends: List[TrendInsight] = []
    anomalies: List[AnomalyInsight] = []
    correlations: List[CorrelationInsight] = []
    summary_stats: Dict[str, Dict[str, float]] = {}

# -------------------------------------------------------------------------
# The Quantitative Analyst Engine
# -------------------------------------------------------------------------

class InsightOrchestrator:
    """
    Phase 3: The Unified Insight Pipeline.
    
    Adheres to the Hybrid Performance Paradigm:
    - Uses fully vectorized Polars and NumPy operations for zero-overhead statistics.
    - Applies Mathematical Precision (Z-scores, Linear Regression, Pearson correlation).
    """

    def __init__(self):
        # 2-Sigma band represents ~95% confidence interval for standard distributions
        self.ANOMALY_Z_SCORE_THRESHOLD = 2.0 
        self.STRONG_CORRELATION_THRESHOLD = 0.7

    def analyze_dataframe(self, df: pl.DataFrame, plan: QueryPlan, tenant_id: str) -> InsightPayload:
        """
        The main gauntlet. Runs the dataset through rigorous statistical checks,
        guided by the Lead Engineer's QueryPlan.
        """
        logger.info(f"[{tenant_id}] Running mathematical insight orchestrator on {len(df)} rows for intent: '{plan.intent}'.")

        if df.is_empty():
            return InsightPayload(row_count=0, intent_analyzed=plan.intent)

        # 1. Identify Data Types (CRITICAL FIX: Ignore primary/foreign keys)
        # We don't want to run Z-scores on a 'customer_id'
        numeric_cols = [
            col for col in df.columns 
            if df[col].dtype in pl.NUMERIC_DTYPES 
            and not col.lower().endswith('_id') 
            and col.lower() != 'id'
        ]
        
        temporal_cols = [col for col in df.columns if df[col].dtype in pl.TEMPORAL_DTYPES]
        categorical_cols = [col for col in df.columns if df[col].dtype in [pl.Utf8, pl.Categorical]]

        # Fallback: If no datetime object, look for a string column that implies time
        time_col = temporal_cols[0] if temporal_cols else None
        if not time_col and categorical_cols:
            for col in categorical_cols:
                if any(time_word in col.lower() for time_word in ["date", "month", "year", "time", "day", "quarter", "week"]):
                    time_col = col
                    break

        # 2. Execute Vectorized Analytics
        # If the plan's intent is "Anomaly Investigation", we could theoretically adjust the Z-score threshold here
        trends = self._calculate_trends(df, numeric_cols, time_col) if time_col else []
        anomalies = self._detect_anomalies(df, numeric_cols, time_col or categorical_cols[0] if categorical_cols else None)
        
        # We only run correlations if there are multiple metrics to compare
        correlations = self._find_correlations(df, numeric_cols) if len(numeric_cols) > 1 else []
        
        summary_stats = self._calculate_summary_stats(df, numeric_cols)

        payload = InsightPayload(
            row_count=len(df),
            intent_analyzed=plan.intent,
            trends=trends,
            anomalies=anomalies,
            correlations=correlations,
            summary_stats=summary_stats
        )

        return payload

    # -------------------------------------------------------------------------
    # Mathematical Modules
    # -------------------------------------------------------------------------

    def _calculate_summary_stats(self, df: pl.DataFrame, numeric_cols: List[str]) -> Dict[str, Dict[str, float]]:
        """Vectorized aggregations for the baseline context."""
        stats = {}
        if not numeric_cols:
            return stats
            
        expressions = []
        for col in numeric_cols:
            expressions.extend([
                pl.col(col).mean().alias(f"{col}_mean"),
                pl.col(col).sum().alias(f"{col}_sum"),
                pl.col(col).max().alias(f"{col}_max"),
                pl.col(col).min().alias(f"{col}_min")
            ])
            
        result = df.select(expressions).to_dicts()[0]
        
        for col in numeric_cols:
            stats[col] = {
                "mean": round(result[f"{col}_mean"] or 0, 2),
                "total": round(result[f"{col}_sum"] or 0, 2),
                "high": round(result[f"{col}_max"] or 0, 2),
                "low": round(result[f"{col}_min"] or 0, 2)
            }
            
        return stats

    def _detect_anomalies(self, df: pl.DataFrame, numeric_cols: List[str], identifier_col: Optional[str]) -> List[AnomalyInsight]:
        """Uses Z-Score to find data points outside the 2-Sigma band."""
        anomalies = []
        if len(df) < 5 or not numeric_cols or not identifier_col:
            return anomalies

        for col in numeric_cols:
            z_score_expr = ((pl.col(col) - pl.col(col).mean()) / pl.col(col).std()).fill_null(0)
            
            outliers = df.with_columns(
                z_score=z_score_expr
            ).filter(
                pl.col("z_score").abs() > self.ANOMALY_Z_SCORE_THRESHOLD
            )

            for row in outliers.to_dicts():
                anomalies.append(AnomalyInsight(
                    column=col,
                    row_identifier=str(row[identifier_col]),
                    value=round(row[col], 2),
                    z_score=round(abs(row["z_score"]), 2),
                    is_positive=row["z_score"] > 0
                ))

        return sorted(anomalies, key=lambda x: x.z_score, reverse=True)

    def _calculate_trends(self, df: pl.DataFrame, numeric_cols: List[str], time_col: str) -> List[TrendInsight]:
        """Uses NumPy Linear Algebra (polyfit) to calculate the deterministic slope."""
        trends = []
        if len(df) < 3 or not numeric_cols: 
            return trends

        sorted_df = df.sort(time_col)

        for col in numeric_cols:
            # CRITICAL FIX: Drop nulls so np.polyfit doesn't crash
            clean_series = sorted_df.get_column(col).drop_nulls()
            
            if len(clean_series) < 3:
                continue

            y = clean_series.to_numpy()
            x = np.arange(len(y)) # Create an X axis matching the exact length of clean Y data
            
            if np.all(y == 0):
                continue

            first_val = y[0]
            last_val = y[-1]
            pct_change = ((last_val - first_val) / first_val * 100) if first_val != 0 else 0.0

            slope, _ = np.polyfit(x, y, 1)

            if slope > 0.05:
                direction = "increasing"
            elif slope < -0.05:
                direction = "decreasing"
            else:
                direction = "flat"

            trends.append(TrendInsight(
                column=col,
                direction=direction,
                slope=round(slope, 4),
                percentage_change=round(pct_change, 2)
            ))

        return trends

    def _find_correlations(self, df: pl.DataFrame, numeric_cols: List[str]) -> List[CorrelationInsight]:
        """Calculates Pearson correlation matrix to see if Metric A moves with Metric B."""
        correlations = []
        if len(numeric_cols) < 2 or len(df) < 5:
            return correlations

        corr_matrix = df.select(numeric_cols).corr()
        columns = corr_matrix.columns
        matrix_data = corr_matrix.to_dicts()

        for i in range(len(columns)):
            for j in range(i + 1, len(columns)):
                col_a = columns[i]
                col_b = columns[j]
                coef = matrix_data[i][col_b]
                
                if coef is None or np.isnan(coef):
                    continue
                    
                if abs(coef) >= self.STRONG_CORRELATION_THRESHOLD:
                    correlations.append(CorrelationInsight(
                        metric_a=col_a,
                        metric_b=col_b,
                        pearson_coefficient=round(coef, 3)
                    ))

        return sorted(correlations, key=lambda x: abs(x.pearson_coefficient), reverse=True)