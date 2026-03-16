import logging
import json
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

import numpy as np
import polars as pl

# Infrastructure Imports
from api.services.query_planner import QueryPlan
from api.services.llm_client import llm_client

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
    potential_drivers: List[str] = [] # Linked correlated metrics

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
    trends: List[TrendInsight] = []
    anomalies: List[AnomalyInsight] = []
    correlations: Dict[str, List[str]] = {} # Metric -> Highly correlated peers
    summary_stats: Dict[str, Dict[str, float]] = {}
    primary_driver: Optional[str] = None
    
    # Phase 4: The Strategic Layer
    strategic_narrative: Optional[StrategicAdvice] = None

# -------------------------------------------------------------------------
# The Autonomous Insight Engine
# -------------------------------------------------------------------------

class InsightOrchestrator:
    """
    Phase 3 & 4: The Fully Autonomous Decision Engine.
    
    Adheres to the Hybrid Performance Paradigm:
    1. Computation: Vectorized Polars/NumPy (Deterministic Truth).
    2. Synthesis: LLM-based Strategic Narrative (Contextual Intelligence).
    """

    def __init__(self):
        self.ANOMALY_Z_SCORE_THRESHOLD = 2.0 
        self.STRONG_CORRELATION_THRESHOLD = 0.7

    async def analyze_and_synthesize(self, df: pl.DataFrame, plan: QueryPlan, tenant_id: str) -> InsightPayload:
        """
        The Master GAUNTLET. 
        Calculates math first, then uses LLM to synthesize strategy.
        """
        logger.info(f"[{tenant_id}] Executing Full Insight gauntlet for intent: '{plan.intent}'")

        if df.is_empty():
            return InsightPayload(row_count=0, intent_analyzed=plan.intent)

        # 1. Feature Engineering (Auto-detecting metrics vs keys)
        numeric_cols = [
            c for c in df.columns 
            if df[c].dtype in pl.NUMERIC_DTYPES 
            and not c.lower().endswith('_id') and c.lower() != 'id'
        ]
        
        # 2. Vectorized Math Layer (Polars/NumPy)
        # We find correlations first to use them as "Drivers" for anomalies
        raw_corrs = self._find_correlations(df, numeric_cols)
        
        # Identify Time Column for Trend Analysis
        time_col = self._detect_time_column(df)
        
        trends = self._calculate_trends(df, numeric_cols, time_col) if time_col else []
        anomalies = self._detect_anomalies(df, numeric_cols, time_col or df.columns[0])
        summary_stats = self._calculate_summary_stats(df, numeric_cols)

        # Determine the "Primary Driver" (Metric with most significant trend)
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

        # 4. Phase 4: Strategic Synthesis (The "LLM File Thing")
        # We ONLY do this if there are significant findings to report
        if trends or anomalies:
            payload.strategic_narrative = await self._generate_strategic_narrative(payload, tenant_id)

        return payload

    # ==========================================
    # STRATEGIC SYNTHESIS (LLM INTEGRATION)
    # ==========================================

    async def _generate_strategic_narrative(self, payload: InsightPayload, tenant_id: str) -> StrategicAdvice:
        """
        Uses Contextual RAG to turn math into strategy.
        Passes the minimal 'Mathematical Fact Sheet' to the LLM.
        """
        # Prune the payload for the LLM context to prevent token bloat
        fact_sheet = {
            "intent": payload.intent_analyzed,
            "primary_driver": payload.primary_driver,
            "significant_trends": [t.dict() for t in payload.trends if abs(t.percentage_change) > 5],
            "top_anomalies": [a.dict() for a in payload.anomalies[:3]],
            "correlations": payload.correlations
        }

        system_prompt = """
        You are a Senior Strategic Business Analyst. Your job is to interpret mathematical data findings.
        You will be provided with a JSON 'fact sheet' of statistical trends, anomalies, and correlations.
        
        RULES:
        1. DO NOT HALLUCINATE. Only mention metrics present in the fact sheet.
        2. Be specific. If an anomaly has a driver, explain the relationship.
        3. Be actionable. Recommend a logical next step for a business owner.
        """

        user_prompt = f"Analyze these findings and provide strategic advice: {json.dumps(fact_sheet)}"

        try:
            # Using the centralized llm_client to guarantee structured output
            advice = await llm_client.generate_structured(
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
                root_cause_hypothesis="Unknown",
                recommended_action="Review raw trends manually.",
                confidence_score=0.0
            )

    # ==========================================
    # MATHEMATICAL MODULES (POLARS/NUMPY)
    # ==========================================

    def _calculate_summary_stats(self, df: pl.DataFrame, cols: List[str]) -> Dict[str, Dict[str, float]]:
        if not cols: return {}
        exprs = []
        for c in cols:
            exprs.extend([
                pl.col(c).mean().alias(f"{c}_avg"),
                pl.col(c).std().alias(f"{c}_std"),
                pl.col(c).max().alias(f"{c}_max")
            ])
        res = df.select(exprs).to_dicts()[0]
        return {c: {"avg": round(res[f"{c}_avg"] or 0, 2), "volatility": round((res[f"{c}_std"] or 0) / (res[f"{c}_avg"] or 1), 3)} for c in cols}

    def _detect_anomalies(self, df: pl.DataFrame, cols: List[str], id_col: str) -> List[AnomalyInsight]:
        anomalies = []
        for c in cols:
            mean, std = df[c].mean(), df[c].std()
            if not std: continue
            # Vectorized Z-Score calculation
            z_scores = ((df[c] - mean) / std).fill_null(0)
            mask = z_scores.abs() > self.ANOMALY_Z_SCORE_THRESHOLD
            
            outliers = df.filter(mask).with_columns(z=z_scores.filter(mask))
            for row in outliers.to_dicts():
                anomalies.append(AnomalyInsight(
                    column=c, row_identifier=str(row[id_col]), value=round(row[c], 2),
                    z_score=round(abs(row["z"]), 2), is_positive=row["z"] > 0
                ))
        return sorted(anomalies, key=lambda x: x.z_score, reverse=True)

    def _calculate_trends(self, df: pl.DataFrame, cols: List[str], time_col: str) -> List[TrendInsight]:
        trends = []
        sorted_df = df.sort(time_col)
        for c in cols:
            y = sorted_df[c].drop_nulls().to_numpy()
            if len(y) < 3: continue
            slope, _ = np.polyfit(np.arange(len(y)), y, 1)
            pct = ((y[-1] - y[0]) / (y[0] or 1)) * 100
            trends.append(TrendInsight(
                column=c, slope=slope, percentage_change=round(pct, 2),
                direction="increasing" if slope > 0.05 else "decreasing" if slope < -0.05 else "flat",
                volatility=round(np.std(y) / (np.mean(y) or 1), 3)
            ))
        return trends

    def _find_correlations(self, df: pl.DataFrame, cols: List[str]) -> Dict[str, List[str]]:
        if len(cols) < 2: return {}
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
        temporal = [c for c in df.columns if df[c].dtype in pl.TEMPORAL_DTYPES]
        if temporal: return temporal[0]
        # Look for time keywords in string columns
        for c in df.columns:
            if any(k in c.lower() for k in ["date", "month", "year", "time", "day"]):
                return c
        return None