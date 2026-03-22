# api/services/insight_orchestrator.py

import logging
import json
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

import numpy as np
import polars as pl

# Infrastructure Imports
from api.services.query_planner import QueryPlan
from api.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Strict Data Contracts (The Mathematical & Narrative Grounding)
# -------------------------------------------------------------------------

class AnomalyInsight(BaseModel):
    column: str
    row_identifier: str
    value: float
    z_score: float
    is_positive: bool
    potential_drivers: List[str] = Field(default_factory=list, description="Linked correlated metrics")

class TrendInsight(BaseModel):
    column: str
    direction: str
    slope: float
    percentage_change: float
    volatility: float = Field(..., description="Stability of the trend (lower is more predictable)")

class StrategicAdvice(BaseModel):
    summary: str = Field(..., description="A 1-sentence executive summary.")
    root_cause_hypothesis: str = Field(..., description="The 'Why' based on drivers and correlations.")
    recommended_action: str = Field(..., description="The 'What next' (e.g., 'Check Germany marketing spend').")
    confidence_score: float = Field(..., description="Based on mathematical signal strength.")

class InsightPayload(BaseModel):
    """
    The Unified Insight Contract.
    Contains pure math for charts and AI-generated narrative for the user.
    """
    row_count: int
    intent_analyzed: str
    trends: List[TrendInsight] = Field(default_factory=list)
    anomalies: List[AnomalyInsight] = Field(default_factory=list)
    correlations: Dict[str, List[str]] = Field(default_factory=dict) # Metric -> Highly correlated peers
    summary_stats: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    primary_driver: Optional[str] = None
    
    # Phase 4: The Strategic Layer
    strategic_narrative: Optional[StrategicAdvice] = None

# -------------------------------------------------------------------------
# The Autonomous Insight Engine
# -------------------------------------------------------------------------

class InsightOrchestrator:
    """
    Phase 3 & 4: The Fully Autonomous Decision Engine.
    
    Methodology Adherence:
    ----------------------
    1. Modular Strategy: Uses dependency injection for LLM clients.
    2. Hybrid Performance: Computation relies entirely on Vectorized Polars/NumPy for C-level speed.
    3. Mathematical Precision: Temporal data anomaly detection utilizes Exponential Moving Averages (EMA) 
       and rolling std deviation rather than naive static averages, ensuring sensitivity to seasonality.
    """

    def __init__(self, llm_client: LLMClient = LLMClient()):
        self.llm_client = llm_client
        self.ANOMALY_Z_SCORE_THRESHOLD = 2.0 
        self.STRONG_CORRELATION_THRESHOLD = 0.7

    async def analyze_and_synthesize(self, df: pl.DataFrame, plan: QueryPlan, tenant_id: str) -> InsightPayload:
        """
        The Master GAUNTLET. 
        Calculates mathematical vectors first, then uses LLM to synthesize strategy.
        """
        logger.info(f"[{tenant_id}] Executing Full Insight gauntlet for intent: '{plan.intent}'")

        if df is None or df.is_empty():
            return InsightPayload(row_count=0, intent_analyzed=plan.intent)

        # 1. Feature Engineering (Auto-detecting numeric metrics vs identity keys)
        numeric_cols = [
            c for c in df.columns 
            if df.schema[c].is_numeric() 
            and not c.lower().endswith('_id') and c.lower() != 'id'
        ]
        
        # Identify Time Column for Trend/Seasonality Analysis
        time_col = self._detect_time_column(df)
        
        # 2. Vectorized Math Layer (Polars/NumPy)
        # We find correlations first to use them as "Drivers" for anomalies
        raw_corrs = self._find_correlations(df, numeric_cols)
        
        trends = self._calculate_trends(df, numeric_cols, time_col) if time_col else []
        anomalies = self._detect_anomalies(df, numeric_cols, time_col or df.columns[0], time_col)
        summary_stats = self._calculate_summary_stats(df, numeric_cols)

        # Determine the "Primary Driver" (Metric with the most significant percentage trend)
        primary_driver = max(trends, key=lambda x: abs(x.percentage_change)).column if trends else None

        # Link Drivers to Anomalies
        for anomaly in anomalies:
            anomaly.potential_drivers = raw_corrs.get(anomaly.column, [])

        # 3. Create the Base Mathematical Payload
        payload = InsightPayload(
            row_count=len(df),
            intent_analyzed=plan.intent,
            trends=trends,
            anomalies=anomalies,
            correlations=raw_corrs,
            summary_stats=summary_stats,
            primary_driver=primary_driver
        )

        # 4. Phase 4: Strategic Synthesis
        # Only invoke the AI summarization if there are statistically significant findings
        if trends or anomalies:
            payload.strategic_narrative = await self._generate_strategic_narrative(payload, tenant_id)

        return payload

    # ==========================================
    # STRATEGIC SYNTHESIS (LLM INTEGRATION)
    # ==========================================

    async def _generate_strategic_narrative(self, payload: InsightPayload, tenant_id: str) -> StrategicAdvice:
        """
        Uses Contextual RAG to turn vector math into strategy.
        Passes a pruned 'Mathematical Fact Sheet' to prevent token bloat and hallucination.
        """
        fact_sheet = {
            "intent": payload.intent_analyzed,
            "primary_driver": payload.primary_driver,
            "significant_trends": [t.model_dump() for t in payload.trends if abs(t.percentage_change) > 5],
            "top_anomalies": [a.model_dump() for a in payload.anomalies[:3]],
            "correlations": payload.correlations
        }

        system_prompt = """
        You are a Senior Strategic Business Analyst. Your job is to interpret deterministic mathematical data findings.
        You will be provided with a JSON 'fact sheet' of statistical trends, anomalies, and correlations.
        
        RULES:
        1. DO NOT HALLUCINATE. Only mention metrics explicitly present in the fact sheet.
        2. BE PRECISE. If an anomaly has a correlated driver, explicitly explain the linked relationship.
        3. BE ACTIONABLE. Recommend a logical, data-driven next step for a business leader.
        """

        user_prompt = f"Analyze these findings and provide strategic advice: {json.dumps(fact_sheet)}"

        try:
            advice = await self.llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=user_prompt,
                response_model=StrategicAdvice,
                temperature=0.0 # Strict deterministic analysis
            )
            return advice
        except Exception as e:
            logger.error(f"[{tenant_id}] Strategic synthesis failed: {e}")
            return StrategicAdvice(
                summary="Analysis complete but strategic summary failed to generate.",
                root_cause_hypothesis="Unknown correlation mapping.",
                recommended_action="Review raw statistical trends manually.",
                confidence_score=0.0
            )

    # ==========================================
    # MATHEMATICAL MODULES (POLARS/NUMPY)
    # ==========================================

    def _calculate_summary_stats(self, df: pl.DataFrame, cols: List[str]) -> Dict[str, Dict[str, float]]:
        """Vectorized aggregation for base statistics."""
        if not cols: return {}
        exprs = []
        for c in cols:
            exprs.extend([
                pl.col(c).mean().alias(f"{c}_avg"),
                pl.col(c).std().alias(f"{c}_std"),
                pl.col(c).max().alias(f"{c}_max")
            ])
        res = df.select(exprs).to_dicts()[0]
        
        return {
            c: {
                "avg": round(res[f"{c}_avg"] or 0, 2), 
                "volatility": round((res[f"{c}_std"] or 0) / (res[f"{c}_avg"] or 1), 3)
            } for c in cols
        }

    def _detect_anomalies(self, df: pl.DataFrame, cols: List[str], id_col: str, time_col: Optional[str]) -> List[AnomalyInsight]:
        """
        Detects statistical anomalies.
        Upgraded to use Exponential Moving Average (EMA) and rolling variance for temporal data 
        to ensure sensitivity to business seasonality, avoiding naive static averages.
        """
        anomalies = []
        
        if time_col and df.height >= 5:
            # Temporal Seasonality-Aware Logic
            df_sorted = df.sort(time_col)
            span = min(7, df_sorted.height - 1)
            alpha = 2 / (span + 1)
            
            for c in cols:
                # Calculate EMA and dynamic rolling standard deviation in Polars C-core
                df_c = df_sorted.select([
                    id_col, 
                    c,
                    pl.col(c).ewm_mean(alpha=alpha).alias("ema"),
                    pl.col(c).rolling_std(window_size=span).fill_null(strategy="backward").alias("rolling_std")
                ])
                
                # Dynamic Z-Score (Distance from Moving Average)
                z_expr = pl.when(pl.col("rolling_std") > 0) \
                           .then((pl.col(c) - pl.col("ema")) / pl.col("rolling_std")) \
                           .otherwise(0).alias("z")
                           
                outliers = df_c.with_columns(z_expr).filter(pl.col("z").abs() > self.ANOMALY_Z_SCORE_THRESHOLD)
                
                for row in outliers.to_dicts():
                    anomalies.append(AnomalyInsight(
                        column=c, 
                        row_identifier=str(row[id_col]), 
                        value=round(row[c], 2),
                        z_score=round(abs(row["z"]), 2), 
                        is_positive=row["z"] > 0
                    ))
        else:
            # Fallback for cross-sectional or small dataset logic (Static Distribution)
            for c in cols:
                mean, std = df[c].mean(), df[c].std()
                if not std or std == 0: continue
                
                z_scores = ((df[c] - mean) / std).fill_null(0)
                mask = z_scores.abs() > self.ANOMALY_Z_SCORE_THRESHOLD
                
                outliers = df.filter(mask).with_columns(z=z_scores.filter(mask))
                for row in outliers.to_dicts():
                    anomalies.append(AnomalyInsight(
                        column=c, 
                        row_identifier=str(row[id_col]), 
                        value=round(row[c], 2),
                        z_score=round(abs(row["z"]), 2), 
                        is_positive=row["z"] > 0
                    ))
                    
        return sorted(anomalies, key=lambda x: x.z_score, reverse=True)

    def _calculate_trends(self, df: pl.DataFrame, cols: List[str], time_col: str) -> List[TrendInsight]:
        """Calculates trajectory slopes using NumPy polynomial fitting (Linear Algebra)."""
        trends = []
        sorted_df = df.sort(time_col)
        for c in cols:
            y = sorted_df[c].drop_nulls().to_numpy()
            if len(y) < 3: continue
            
            # OLS Regression for vector slope
            slope, _ = np.polyfit(np.arange(len(y)), y, 1)
            pct = ((y[-1] - y[0]) / (y[0] or 1)) * 100
            
            trends.append(TrendInsight(
                column=c, 
                slope=slope, 
                percentage_change=round(pct, 2),
                direction="increasing" if slope > 0.05 else "decreasing" if slope < -0.05 else "flat",
                volatility=round(np.std(y) / (np.mean(y) or 1), 3)
            ))
        return trends

    def _find_correlations(self, df: pl.DataFrame, cols: List[str]) -> Dict[str, List[str]]:
        """Identifies highly correlated business metrics to establish root cause drivers."""
        if len(cols) < 2: return {}
        # Utilizing Polars native correlation matrix
        corr_matrix = df.select(cols).corr().to_dicts()
        mapping = {c: [] for c in cols}
        
        for i, col_a in enumerate(cols):
            for j, col_b in enumerate(cols):
                if i == j: continue
                coef = corr_matrix[i].get(col_b)
                if coef and abs(coef) >= self.STRONG_CORRELATION_THRESHOLD:
                    mapping[col_a].append(col_b)
        return mapping

    def _detect_time_column(self, df: pl.DataFrame) -> Optional[str]:
        """Auto-detects temporal axes for sorting and regression vectors."""
        temporal = [c for c in df.columns if df.schema[c] in [pl.Datetime, pl.Date, pl.Time]]
        if temporal: return temporal[0]
        
        # Heuristic fallback for uncast string dates
        for c in df.columns:
            if any(k in c.lower() for k in ["date", "month", "year", "time", "day"]):
                return c
        return None