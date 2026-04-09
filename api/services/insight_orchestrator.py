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
    r_squared: float = Field(..., description="Statistical strength of the trend (0 to 1)")
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
    
    Methodology Adherence & Scalability Fixes:
    ------------------------------------------
    1. Memory Efficiency: Heavy operations pushed down to Polars LazyFrames (lf).
       Removed all O(N) `.to_dicts()` and `.to_numpy()` materializations.
    2. Vectorized Math: Trends use Polars native covariance/variance instead of numpy polyfit.
    3. Token Budgeting: LLM context size strictly controlled by limiting output arrays.
    4. Robust Heuristics: Improved RFM quantile segmentations and safe null handlings.
    """

    def __init__(
        self, 
        llm_client: Optional[LLMClient] = None,
        anomaly_z_threshold: float = 2.5,
        correlation_threshold: float = 0.7,
        max_rows_context: int = 10
    ):
        self.llm_client = llm_client or default_llm_client
        self.anomaly_z_score_threshold = anomaly_z_threshold 
        self.strong_correlation_threshold = correlation_threshold
        self.max_rows_context = max_rows_context

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
        
        # Performance: Sort once, execute lazily where possible
        lf = df.lazy()
        lf_sorted = lf.sort(time_col) if time_col else lf
        
        # 2. Vectorized Math Layer (Polars Native)
        raw_corrs = self._find_correlations(df, numeric_cols)
        trends = self._calculate_trends(lf_sorted, numeric_cols, time_col) if time_col else []
        anomalies = self._detect_anomalies(lf_sorted, numeric_cols, identity_col or df.columns[0], time_col)
        summary_stats = self._calculate_summary_stats(df, numeric_cols)

        # 3. Domain-Specific Business Logic
        customer_segments = self._run_rfm_analysis(lf, df, time_col, identity_col, numeric_cols)
        velocity_alerts = self._run_velocity_analysis(lf_sorted, time_col, identity_col, numeric_cols)

        # Primary Driver Selection (combining magnitude, statistical fit, and volatility)
        primary_driver = None
        if trends:
            primary_driver = max(
                trends, 
                key=lambda x: (abs(x.percentage_change) * x.r_squared) / (x.volatility or 1)
            ).column

        # Link Drivers to Anomalies
        for anomaly in anomalies:
            anomaly.potential_drivers = raw_corrs.get(anomaly.column, [])

        # 4. Create the Base Mathematical Payload
        payload = InsightPayload(
            row_count=df.height,
            intent_analyzed=plan.intent,
            trends=trends,
            anomalies=anomalies,
            correlations=raw_corrs,
            summary_stats=summary_stats,
            primary_driver=primary_driver,
            customer_segments=customer_segments,
            velocity_alerts=velocity_alerts
        )

        # 5. Phase 4: Strategic Synthesis (if meaningful data exists)
        if trends or anomalies or customer_segments or velocity_alerts:
            payload.strategic_narrative = await self._generate_strategic_narrative(payload, tenant_id)

        return payload

    # ==========================================
    # STRATEGIC SYNTHESIS (LLM INTEGRATION)
    # ==========================================

    async def _generate_strategic_narrative(self, payload: InsightPayload, tenant_id: str) -> StrategicAdvice:
        """
        Uses Contextual RAG to turn vector math into actionable strategy.
        Safeguards against token bloat via strict array truncation.
        """
        # Token Defense: Truncate fact sheet arrays
        fact_sheet = {
            "intent": payload.intent_analyzed,
            "primary_driver": payload.primary_driver,
            "significant_trends": [
                t.model_dump() for t in payload.trends if abs(t.percentage_change) > 5
            ][:self.max_rows_context],
            "top_anomalies": [a.model_dump() for a in payload.anomalies][:self.max_rows_context],
            "vip_and_churn_segments": [s.model_dump() for s in (payload.customer_segments or [])],
            "critical_stockouts": [
                v.model_dump() for v in (payload.velocity_alerts or []) if v.urgency == 'High'
            ][:self.max_rows_context]
        }

        system_prompt = """
        You are Arcli, an elite Strategic Business AI. Your job is to interpret deterministic mathematical data.
        You will be provided with a JSON 'fact sheet' containing trends, anomalies, VIP customer segments, and stockout risks.
        
        RULES:
        1. DO NOT HALLUCINATE. Only mention metrics explicitly present in the fact sheet.
        2. ADDRESS THE BUSINESS PAIN: If VIPs or At-Risk customers are present, recommend specific tactical actions.
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
                summary="Analysis complete but strategic summary encountered an error.",
                root_cause_hypothesis="Insufficient, blocked, or malformed data context.",
                recommended_action="Review the raw statistical trends manually.",
                confidence_score=0.0
            )

    # ==========================================
    # DOMAIN SPECIFIC FRAMEWORKS
    # ==========================================

    def _run_rfm_analysis(
        self, lf: pl.LazyFrame, df: pl.DataFrame, time_col: Optional[str], id_col: Optional[str], num_cols: List[str]
    ) -> Optional[List[CustomerSegment]]:
        """
        Executes Vectorized Recency, Frequency, Monetary (RFM) segmentation.
        """
        if not time_col or not id_col:
            return None
        
        # Safer heuristic for customer identification
        customer_indicators = ['customer', 'client', 'user', 'account', 'tenant', 'buyer']
        if not any(k in id_col.lower() for k in customer_indicators):
            return None
            
        revenue_col = next((c for c in num_cols if any(k in c.lower() for k in ['amount', 'revenue', 'price', 'total', 'spend'])), None)
        if not revenue_col:
            return None

        # Calculate max_date eagerly to pass as literal (prevents broadcast issues in lazy groupby)
        max_date = df.select(pl.col(time_col).max()).item()
        if not max_date:
            return None

        # Vectorized RFM calculation (Lazy pushdown)
        rfm_lf = lf.group_by(id_col).agg([
            (pl.lit(max_date) - pl.col(time_col).max()).dt.total_days().alias('Recency'),
            pl.col(time_col).count().alias('Frequency'),
            pl.col(revenue_col).sum().alias('Monetary')
        ])

        rfm = rfm_lf.collect()
        if rfm.is_empty():
            return None

        # Robust Quantile-based segmentation
        r_q33 = rfm.select(pl.col('Recency').quantile(0.33)).item() or 0
        f_q66 = rfm.select(pl.col('Frequency').quantile(0.66)).item() or 0
        m_q66 = rfm.select(pl.col('Monetary').quantile(0.66)).item() or 0
        
        vip_mask = (pl.col('Recency') <= r_q33) & (pl.col('Frequency') >= f_q66) & (pl.col('Monetary') >= m_q66)
        risk_mask = (pl.col('Recency') > r_q33) & (pl.col('Frequency') >= f_q66)

        vips = rfm.filter(vip_mask)
        at_risk = rfm.filter(risk_mask)

        segments = []
        if vips.height > 0:
            avg_ltv = vips.select(pl.col('Monetary').mean()).item()
            segments.append(CustomerSegment(
                segment_name="VIP",
                customer_count=vips.height,
                average_ltv=round(avg_ltv, 2) if avg_ltv else 0.0,
                recommended_action="Invite to loyalty program; prioritize support routing."
            ))
            
        if at_risk.height > 0:
            avg_ltv = at_risk.select(pl.col('Monetary').mean()).item()
            segments.append(CustomerSegment(
                segment_name="At-Risk (Churn Warning)",
                customer_count=at_risk.height,
                average_ltv=round(avg_ltv, 2) if avg_ltv else 0.0,
                recommended_action="Deploy immediate automated win-back email campaign with incentive."
            ))

        return segments

    def _run_velocity_analysis(
        self, lf_sorted: pl.LazyFrame, time_col: Optional[str], id_col: Optional[str], num_cols: List[str]
    ) -> Optional[List[VelocityAlert]]:
        """
        Calculates daily burn rate and stockout runway using lazy evaluation.
        """
        if not id_col:
            return None
            
        product_indicators = ['product', 'sku', 'item', 'variant']
        if not any(k in id_col.lower() for k in product_indicators):
            return None
            
        qty_col = next((c for c in num_cols if any(k in c.lower() for k in ['qty', 'quantity', 'sold', 'sales', 'units'])), None)
        stock_col = next((c for c in num_cols if any(k in c.lower() for k in ['stock', 'inventory', 'on_hand', 'available'])), None)
        
        if not qty_col or not stock_col or not time_col:
            return None

        # Lazy, vectorized velocity calculation
        alerts_df = (
            lf_sorted.group_by(id_col)
            .agg([
                pl.col(qty_col).tail(7).mean().alias('daily_burn'),
                pl.col(stock_col).last().alias('current_stock')
            ])
            .filter(pl.col('daily_burn') > 0)
            .with_columns(
                (pl.col('current_stock') / pl.col('daily_burn')).cast(pl.Int32).alias('days_to_stockout')
            )
            .filter(pl.col('days_to_stockout') <= 14)
            .sort('days_to_stockout')
            .limit(self.max_rows_context)
            .collect()
        )

        alerts = []
        for row in alerts_df.iter_rows(named=True):
            alerts.append(VelocityAlert(
                product_identifier=str(row[id_col]),
                current_stock=round(row['current_stock'], 2),
                daily_burn_rate=round(row['daily_burn'], 2),
                days_to_stockout=row['days_to_stockout'],
                urgency="High" if row['days_to_stockout'] <= 3 else "Medium"
            ))

        return alerts

    # ==========================================
    # MATHEMATICAL MODULES (POLARS/NUMPY)
    # ==========================================

    def _calculate_summary_stats(self, df: pl.DataFrame, cols: List[str]) -> Dict[str, Dict[str, float]]:
        """Eagerly compute summary stats using a single vectorized pass."""
        if not cols or df.is_empty(): 
            return {}
            
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

    def _detect_anomalies(
        self, lf_sorted: pl.LazyFrame, cols: List[str], id_col: str, time_col: Optional[str]
    ) -> List[AnomalyInsight]:
        """Detect outliers lazily, bounding memory utilization before materialization."""
        anomalies = []
        
        # Need height for logic bounding, easiest to collect count
        row_count = lf_sorted.select(pl.len()).collect().item()
        
        if time_col and row_count >= 5:
            span = min(7, row_count - 1)
            alpha = 2 / (span + 1)
            
            for c in cols:
                # Polars Native Rolling & EWM Math
                z_expr = (
                    pl.when(pl.col("rolling_std") > 0)
                    .then((pl.col(c) - pl.col("ema")) / pl.col("rolling_std"))
                    .otherwise(0)
                    .alias("z")
                )
                
                outliers_df = (
                    lf_sorted.select([
                        pl.col(id_col), 
                        pl.col(c),
                        pl.col(c).ewm_mean(alpha=alpha, ignore_nulls=True).alias("ema"),
                        pl.col(c).rolling_std(window_size=span).fill_null(strategy="forward").fill_null(0).alias("rolling_std")
                    ])
                    .with_columns(z_expr)
                    .filter(pl.col("z").abs() > self.anomaly_z_score_threshold)
                    .sort("z", descending=True)
                    .limit(self.max_rows_context)
                    .collect()
                )
                
                for row in outliers_df.iter_rows(named=True):
                    anomalies.append(AnomalyInsight(
                        column=c, 
                        row_identifier=str(row[id_col]), 
                        value=round(row[c], 2), 
                        z_score=round(abs(row["z"]), 2), 
                        is_positive=row["z"] > 0
                    ))
        else:
            # Fallback to standard standard-deviation thresholding
            for c in cols:
                # Using standard global mean/std
                z_expr = ((pl.col(c) - pl.col(c).mean()) / pl.col(c).std().fill_null(1)).fill_null(0)
                outliers_df = (
                    lf_sorted.select([pl.col(id_col), pl.col(c)])
                    .with_columns(z=z_expr)
                    .filter(pl.col("z").abs() > self.anomaly_z_score_threshold)
                    .sort("z", descending=True)
                    .limit(self.max_rows_context)
                    .collect()
                )
                
                for row in outliers_df.iter_rows(named=True):
                    anomalies.append(AnomalyInsight(
                        column=c, 
                        row_identifier=str(row[id_col]), 
                        value=round(row[c], 2), 
                        z_score=round(abs(row["z"]), 2), 
                        is_positive=row["z"] > 0
                    ))
                    
        return sorted(anomalies, key=lambda x: x.z_score, reverse=True)

    def _calculate_trends(self, lf_sorted: pl.LazyFrame, cols: List[str], time_col: str) -> List[TrendInsight]:
        """Calculates linear trends natively in Polars avoiding numpy memory arrays."""
        trends = []
        
        for c in cols:
            # Drop nulls and assign contiguous index for pure math calculation
            lf_trend = lf_sorted.select(pl.col(c)).drop_nulls().with_row_index("x")
            
            # Execute math directly inside the engine
            stats = lf_trend.select(
                slope=(pl.cov("x", c) / pl.var("x").fill_null(1.0)).fill_null(0.0),
                r_squared=(pl.corr("x", c) ** 2).fill_null(0.0),
                first_val=pl.col(c).first(),
                last_val=pl.col(c).last(),
                mean_val=pl.col(c).mean(),
                std_val=pl.col(c).std()
            ).collect()
            
            if stats.is_empty():
                continue
                
            row = stats.row(0, named=True)
            first_val = row["first_val"] or 0
            mean_val = row["mean_val"] or 0
            
            pct = ((row["last_val"] - first_val) / first_val * 100) if first_val != 0 else 0.0
            volatility = (row["std_val"] / mean_val) if mean_val != 0 else 0.0
            
            trends.append(TrendInsight(
                column=c, 
                slope=row["slope"], 
                percentage_change=round(pct, 2),
                r_squared=round(row["r_squared"], 3),
                direction="increasing" if row["slope"] > 0.05 else "decreasing" if row["slope"] < -0.05 else "flat",
                volatility=round(volatility, 3)
            ))
            
        return trends

    def _find_correlations(self, df: pl.DataFrame, cols: List[str]) -> Dict[str, List[str]]:
        """Safe extraction of correlation matrix."""
        if len(cols) < 2 or df.is_empty(): 
            return {}
            
        corr_df = df.select(cols).corr()
        mapping = {c: [] for c in cols}
        
        for i, col_a in enumerate(cols):
            for j, col_b in enumerate(cols):
                if i == j: 
                    continue
                # item() is the canonical Polars way to extract a specific cell
                coef = corr_df.item(i, j)
                if coef is not None and abs(coef) >= self.strong_correlation_threshold:
                    mapping[col_a].append(col_b)
                    
        return mapping

    def _detect_time_column(self, df: pl.DataFrame) -> Optional[str]:
        temporal = [c for c in df.columns if df.schema[c] in [pl.Datetime, pl.Date, pl.Time]]
        if temporal: 
            return temporal[0]
            
        time_heuristics = ["date", "month", "year", "time", "day", "timestamp", "created_at", "updated_at"]
        for c in df.columns:
            if any(k in c.lower() for k in time_heuristics): 
                return c
        return None

    def _detect_identity_column(self, df: pl.DataFrame) -> Optional[str]:
        id_heuristics = ['id', 'uuid', 'key', 'email', 'user', 'account', 'sku', 'product', 'customer', 'tenant']
        for c in df.columns:
            c_lower = c.lower()
            if c_lower == 'id' or c_lower.endswith('_id') or any(h == c_lower for h in id_heuristics): 
                return c
        return None