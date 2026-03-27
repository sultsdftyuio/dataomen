# api/services/insight_orchestrator.py

import logging
import json
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

import numpy as np
import polars as pl

# Infrastructure Imports
from api.services.query_planner import QueryPlan
from api.services.llm_client import LLMClient, llm_client as default_llm_client

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

class CustomerSegment(BaseModel):
    segment_name: str = Field(..., description="e.g., 'VIP', 'At-Risk', 'New'")
    customer_count: int
    average_ltv: float
    recommended_action: str = Field(..., description="Tactical action like 'Send Win-back Email'")

class VelocityAlert(BaseModel):
    product_identifier: str
    current_stock: float
    daily_burn_rate: float
    days_to_stockout: int
    urgency: str = Field(..., description="'High', 'Medium', 'Low'")

class StrategicAdvice(BaseModel):
    summary: str = Field(..., description="A 1-sentence executive summary.")
    root_cause_hypothesis: str = Field(..., description="The 'Why' based on drivers and correlations.")
    recommended_action: str = Field(..., description="The 'What next' addressing anomalies, VIPs, or stockouts.")
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
    correlations: Dict[str, List[str]] = Field(default_factory=dict)
    summary_stats: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    primary_driver: Optional[str] = None
    
    # Advanced Business Intelligence Layers
    customer_segments: Optional[List[CustomerSegment]] = Field(default=None)
    velocity_alerts: Optional[List[VelocityAlert]] = Field(default=None)
    
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
    1. Hybrid Performance: Computation relies entirely on Vectorized Polars/NumPy for C-level speed.
    2. Dynamic Context: Automatically triggers RFM or Velocity analysis based on schema heuristics.
    3. Contextual RAG: LLM only receives pre-calculated mathematical facts to prevent hallucination.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or default_llm_client
        self.ANOMALY_Z_SCORE_THRESHOLD = 2.0 
        self.STRONG_CORRELATION_THRESHOLD = 0.7

    async def analyze_and_synthesize(self, df: pl.DataFrame, plan: QueryPlan, tenant_id: str) -> InsightPayload:
        """
        The Master GAUNTLET. 
        Calculates mathematical vectors, runs business frameworks (RFM/Velocity), 
        then uses LLM to synthesize strategy.
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
        
        # Identify Temporal and Identity Columns
        time_col = self._detect_time_column(df)
        identity_col = self._detect_identity_column(df)
        
        # 2. Vectorized Math Layer (Polars/NumPy)
        raw_corrs = self._find_correlations(df, numeric_cols)
        trends = self._calculate_trends(df, numeric_cols, time_col) if time_col else []
        anomalies = self._detect_anomalies(df, numeric_cols, identity_col or df.columns[0], time_col)
        summary_stats = self._calculate_summary_stats(df, numeric_cols)

        # 3. Domain-Specific Business Logic (The Arcli Solutions)
        customer_segments = self._run_rfm_analysis(df, time_col, identity_col, numeric_cols)
        velocity_alerts = self._run_velocity_analysis(df, time_col, identity_col, numeric_cols)

        primary_driver = max(trends, key=lambda x: abs(x.percentage_change)).column if trends else None

        # Link Drivers to Anomalies
        for anomaly in anomalies:
            anomaly.potential_drivers = raw_corrs.get(anomaly.column, [])

        # 4. Create the Base Mathematical Payload
        payload = InsightPayload(
            row_count=len(df),
            intent_analyzed=plan.intent,
            trends=trends,
            anomalies=anomalies,
            correlations=raw_corrs,
            summary_stats=summary_stats,
            primary_driver=primary_driver,
            customer_segments=customer_segments,
            velocity_alerts=velocity_alerts
        )

        # 5. Phase 4: Strategic Synthesis
        if trends or anomalies or customer_segments or velocity_alerts:
            payload.strategic_narrative = await self._generate_strategic_narrative(payload, tenant_id)

        return payload

    # ==========================================
    # STRATEGIC SYNTHESIS (LLM INTEGRATION)
    # ==========================================

    async def _generate_strategic_narrative(self, payload: InsightPayload, tenant_id: str) -> StrategicAdvice:
        """
        Uses Contextual RAG to turn vector math into actionable strategy.
        """
        fact_sheet = {
            "intent": payload.intent_analyzed,
            "primary_driver": payload.primary_driver,
            "significant_trends": [t.model_dump() for t in payload.trends if abs(t.percentage_change) > 5],
            "top_anomalies": [a.model_dump() for a in payload.anomalies[:3]],
            "vip_and_churn_segments": [s.model_dump() for s in (payload.customer_segments or [])],
            "critical_stockouts": [v.model_dump() for v in (payload.velocity_alerts or []) if v.urgency == 'High']
        }

        system_prompt = """
        You are Arcli, an elite Strategic Business AI. Your job is to interpret deterministic mathematical data.
        You will be provided with a JSON 'fact sheet' containing trends, anomalies, VIP customer segments, and stockout risks.
        
        RULES:
        1. DO NOT HALLUCINATE. Only mention metrics explicitly present in the fact sheet.
        2. ADDRESS THE BUSINESS PAIN: If VIPs or At-Risk customers are present, tell the user exactly what to do (e.g. 'Send a win-back campaign to the 45 At-Risk customers').
        3. ADDRESS INVENTORY: If stockout risks are high, identify the specific product and advise immediate restock.
        4. BE ACTIONABLE. Recommend a logical, data-driven next step.
        """

        user_prompt = f"Analyze these findings and provide strategic advice: {json.dumps(fact_sheet)}"

        try:
            advice = await self.llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=user_prompt,
                response_model=StrategicAdvice,
                temperature=0.0
            )
            return advice
        except Exception as e:
            logger.error(f"[{tenant_id}] Strategic synthesis failed: {e}")
            return StrategicAdvice(
                summary="Analysis complete but strategic summary failed to generate.",
                root_cause_hypothesis="Insufficient or malformed data context.",
                recommended_action="Review raw statistical trends manually.",
                confidence_score=0.0
            )

    # ==========================================
    # DOMAIN SPECIFIC FRAMEWORKS
    # ==========================================

    def _run_rfm_analysis(self, df: pl.DataFrame, time_col: Optional[str], id_col: Optional[str], num_cols: List[str]) -> Optional[List[CustomerSegment]]:
        """
        Automatically solves: "I don't know who my best customers are."
        Executes Vectorized Recency, Frequency, Monetary (RFM) segmentation if customer data is detected.
        """
        if not time_col or not id_col or 'customer' not in id_col.lower():
            return None
            
        revenue_col = next((c for c in num_cols if any(k in c.lower() for k in ['amount', 'revenue', 'price', 'total'])), None)
        if not revenue_col:
            return None

        # Vectorized RFM calculation
        max_date = df[time_col].max()
        rfm = df.group_by(id_col).agg([
            (max_date - pl.col(time_col).max()).dt.total_days().alias('Recency'),
            pl.col(time_col).count().alias('Frequency'),
            pl.col(revenue_col).sum().alias('Monetary')
        ])

        # Simple heuristic segmentation using Quantiles for performance
        r_median = rfm['Recency'].median()
        f_median = rfm['Frequency'].median()
        
        vip_mask = (pl.col('Recency') <= r_median) & (pl.col('Frequency') > f_median)
        risk_mask = (pl.col('Recency') > r_median) & (pl.col('Frequency') > f_median)

        vips = rfm.filter(vip_mask)
        at_risk = rfm.filter(risk_mask)

        segments = []
        if len(vips) > 0:
            segments.append(CustomerSegment(
                segment_name="VIP",
                customer_count=len(vips),
                average_ltv=round(vips['Monetary'].mean(), 2),
                recommended_action="Invite to loyalty program; prioritize support routing."
            ))
        if len(at_risk) > 0:
            segments.append(CustomerSegment(
                segment_name="At-Risk (Churn Warning)",
                customer_count=len(at_risk),
                average_ltv=round(at_risk['Monetary'].mean(), 2),
                recommended_action="Deploy immediate automated win-back email campaign with incentive."
            ))

        return segments

    def _run_velocity_analysis(self, df: pl.DataFrame, time_col: Optional[str], id_col: Optional[str], num_cols: List[str]) -> Optional[List[VelocityAlert]]:
        """
        Automatically solves: "I keep running out of my best sellers."
        Calculates daily burn rate and stockout runway.
        """
        if not id_col or ('product' not in id_col.lower() and 'sku' not in id_col.lower()):
            return None
            
        qty_col = next((c for c in num_cols if any(k in c.lower() for k in ['qty', 'quantity', 'sold', 'sales'])), None)
        stock_col = next((c for c in num_cols if any(k in c.lower() for k in ['stock', 'inventory', 'on_hand'])), None)
        
        if not qty_col or not stock_col or not time_col:
            return None

        # Sort temporally to calculate burn rates correctly
        df_sorted = df.sort(time_col)
        
        # Calculate daily velocity (last 7 days average) via vectorization
        velocity = df_sorted.group_by(id_col).agg([
            pl.col(qty_col).tail(7).mean().alias('daily_burn'),
            pl.col(stock_col).last().alias('current_stock')
        ]).filter(pl.col('daily_burn') > 0)

        velocity = velocity.with_columns(
            (pl.col('current_stock') / pl.col('daily_burn')).cast(pl.Int32).alias('days_to_stockout')
        )

        alerts = []
        for row in velocity.filter(pl.col('days_to_stockout') <= 14).to_dicts():
            alerts.append(VelocityAlert(
                product_identifier=str(row[id_col]),
                current_stock=round(row['current_stock'], 2),
                daily_burn_rate=round(row['daily_burn'], 2),
                days_to_stockout=row['days_to_stockout'],
                urgency="High" if row['days_to_stockout'] <= 3 else "Medium"
            ))

        return sorted(alerts, key=lambda x: x.days_to_stockout)

    # ==========================================
    # MATHEMATICAL MODULES (POLARS/NUMPY)
    # ==========================================

    def _calculate_summary_stats(self, df: pl.DataFrame, cols: List[str]) -> Dict[str, Dict[str, float]]:
        if not cols: return {}
        exprs = []
        for c in cols:
            exprs.extend([
                pl.col(c).mean().alias(f"{c}_avg"),
                pl.col(c).std().alias(f"{c}_std")
            ])
        res = df.select(exprs).to_dicts()[0]
        
        return {
            c: {
                "avg": round(res[f"{c}_avg"] or 0, 2), 
                "volatility": round((res[f"{c}_std"] or 0) / (res[f"{c}_avg"] or 1), 3)
            } for c in cols
        }

    def _detect_anomalies(self, df: pl.DataFrame, cols: List[str], id_col: str, time_col: Optional[str]) -> List[AnomalyInsight]:
        anomalies = []
        if time_col and df.height >= 5:
            df_sorted = df.sort(time_col)
            span = min(7, df_sorted.height - 1)
            alpha = 2 / (span + 1)
            
            for c in cols:
                df_c = df_sorted.select([
                    id_col, 
                    c,
                    pl.col(c).ewm_mean(alpha=alpha).alias("ema"),
                    pl.col(c).rolling_std(window_size=span).fill_null(strategy="backward").alias("rolling_std")
                ])
                z_expr = pl.when(pl.col("rolling_std") > 0).then((pl.col(c) - pl.col("ema")) / pl.col("rolling_std")).otherwise(0).alias("z")
                outliers = df_c.with_columns(z_expr).filter(pl.col("z").abs() > self.ANOMALY_Z_SCORE_THRESHOLD)
                
                for row in outliers.to_dicts():
                    anomalies.append(AnomalyInsight(
                        column=c, row_identifier=str(row[id_col]), value=round(row[c], 2), z_score=round(abs(row["z"]), 2), is_positive=row["z"] > 0
                    ))
        else:
            for c in cols:
                mean, std = df[c].mean(), df[c].std()
                if not std or std == 0: continue
                z_scores = ((df[c] - mean) / std).fill_null(0)
                mask = z_scores.abs() > self.ANOMALY_Z_SCORE_THRESHOLD
                outliers = df.filter(mask).with_columns(z=z_scores.filter(mask))
                for row in outliers.to_dicts():
                    anomalies.append(AnomalyInsight(
                        column=c, row_identifier=str(row[id_col]), value=round(row[c], 2), z_score=round(abs(row["z"]), 2), is_positive=row["z"] > 0
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
        temporal = [c for c in df.columns if df.schema[c] in [pl.Datetime, pl.Date, pl.Time]]
        if temporal: return temporal[0]
        for c in df.columns:
            if any(k in c.lower() for k in ["date", "month", "year", "time", "day"]): return c
        return None

    def _detect_identity_column(self, df: pl.DataFrame) -> Optional[str]:
        for c in df.columns:
            if c.lower() == 'id' or c.lower().endswith('_id'): return c
        return None