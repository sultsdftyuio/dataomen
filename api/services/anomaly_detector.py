"""
ARCLI.TECH - Intelligence Layer
Component: Anomaly Detector (The Watcher)
Strategy: Push Architecture, Statistical Process Control, Vectorization & AI Synthesis
"""

import logging
import re
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone

import polars as pl
from sqlalchemy.orm import Session

# Arcli Core Infrastructure
from api.services.storage_manager import storage_manager
from api.services.llm_client import LLMClient, llm_client as default_llm
from models import Dataset, SemanticMetric

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    Phase 4+: High-Performance Analytical Engine (Push Architecture).
    Uses Strictly Vectorized Operations (Polars/Rust) over DuckDB zero-copy streams.
    
    Engineering Upgrades:
    1. Async Threading: Offloads DuckDB/Polars execution to prevent ASGI loop blocking.
    2. Strict Sanitization: Eliminates SQL injection on dynamic column names.
    3. Temporal Anchoring: Pads missing days up to *today* to catch abrupt data halts.
    4. AI Synthesis: Leverages LLM Client to generate human-readable contextual insights.
    """
    
    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or default_llm
        self.MAD_CONSISTENCY_CONSTANT = 0.6745
        self.EPSILON = 1e-5 # Stable epsilon for financial/metric variance division

    async def detect_anomaly(
        self, 
        db: Session, 
        tenant_id: str, 
        dataset_id: str, 
        metric_col: str, 
        time_col: str, 
        threshold: float = 3.0
    ) -> Optional[Dict[str, Any]]:
        """
        Detects anomalies on a single raw dataset column using a resilient MAD-based approach.
        """
        dataset = await asyncio.to_thread(self._fetch_dataset, db, tenant_id, dataset_id)

        if not dataset:
            logger.error(f"Anomaly Detection aborted: Dataset {dataset_id} not found for {tenant_id}.")
            return None

        # 1. Strict Security: Sanitize Column Names to prevent DuckDB SQL Injection
        safe_metric = re.sub(r'[^a-zA-Z0-9_]', '', metric_col)
        safe_time = re.sub(r'[^a-zA-Z0-9_]', '', time_col)
        
        if not safe_metric or not safe_time:
            raise ValueError(f"[{tenant_id}] Invalid column names provided for anomaly detection.")

        # Analytical Windowing (Extended to 90 days for MAD stability)
        secure_path = storage_manager.get_duckdb_query_path(db, dataset)
        window_start = (datetime.now(timezone.utc) - timedelta(days=90)).strftime('%Y-%m-%d')

        # 2. Analytical Efficiency: DuckDB pushes filters down to Parquet.
        # We ONLY load the specific time and metric columns we need into memory.
        query = f"""
            SELECT 
                CAST("{safe_time}" AS DATE) as ds, 
                CAST(SUM("{safe_metric}") AS DOUBLE) as y
            FROM read_parquet('{secure_path}')
            WHERE "{safe_time}" >= '{window_start}'
            GROUP BY ds
            ORDER BY ds ASC
        """
        
        return await self._execute_and_analyze(
            db=db, 
            tenant_id=tenant_id, 
            query=query, 
            threshold=threshold,
            context_meta={
                "dataset_id": dataset_id,
                "metric": safe_metric,
                "engine": "Polars-Robust-MAD (Raw)"
            }
        )

    async def detect_golden_metric_anomaly(
        self,
        db: Session,
        tenant_id: str,
        metric_name: str,
        threshold: float = 3.0
    ) -> Optional[Dict[str, Any]]:
        """
        The Pinnacle of the Push Architecture.
        Evaluates cross-platform Golden Metrics (like 'True ROAS') for statistical anomalies
        by leveraging the Semantic Layer's AST Injector.
        """
        from api.services.metric_governance import metric_governance_service

        metric = await asyncio.to_thread(self._fetch_semantic_metric, db, tenant_id, metric_name)

        if not metric:
            logger.warning(f"[{tenant_id}] Golden Metric '{metric_name}' not found for anomaly detection.")
            return None

        window_start = (datetime.now(timezone.utc) - timedelta(days=90)).strftime('%Y-%m-%d')

        # We construct a base execution query that asks for the Golden Metric grouped by day.
        # The AST Injector will intercept "governed_{metric_name}" and dynamically inject the cross-platform CTEs.
        safe_metric_alias = f"governed_{metric.metric_name.replace(' ', '_').lower()}"
        
        base_query = f"""
            SELECT 
                CAST(ds AS DATE) as ds,
                CAST({safe_metric_alias} AS DOUBLE) as y
            FROM {safe_metric_alias}
            WHERE ds >= '{window_start}'
            ORDER BY ds ASC
        """

        # We must supply the relevant dataset IDs for the cross-join to resolve physical paths.
        active_datasets = await asyncio.to_thread(self._fetch_active_dataset_ids, db, tenant_id)
        
        # Inject the deterministic cross-platform math!
        executable_query = await asyncio.to_thread(
            metric_governance_service.inject_governed_metrics,
            db, tenant_id, active_datasets, base_query
        )

        return await self._execute_and_analyze(
            db=db,
            tenant_id=tenant_id,
            query=executable_query,
            threshold=threshold,
            context_meta={
                "dataset_id": "cross-platform-ast",
                "metric": metric_name,
                "engine": "Polars-Robust-MAD (Golden Metric)"
            }
        )

    # -------------------------------------------------------------------------
    # CORE EXECUTION & ANALYSIS
    # -------------------------------------------------------------------------

    async def _execute_and_analyze(
        self, 
        db: Session, 
        tenant_id: str, 
        query: str, 
        threshold: float,
        context_meta: Dict[str, str]
    ) -> Optional[Dict[str, Any]]:
        """
        Orchestrates the blocking math in a threadpool and layers AI synthesis on top.
        """
        # 1. Run Heavy Math off the main event loop
        result = await asyncio.to_thread(
            self._run_statistical_process_control, db, tenant_id, query, threshold, context_meta
        )

        if not result:
            return None

        # 2. AI Synthesis: Generate Contextual Narrative for the Anomaly
        try:
            insight_prompt = (
                f"You are a SaaS data analyst. We detected a statistical anomaly for metric '{result['metric']}'.\n"
                f"Date: {result['date']}\n"
                f"Direction: {result['direction']} ({result['variance_pct']:.1f}% variance from expected median).\n"
                f"Actual: {result['actual_value']:.2f} | Expected: {result['expected_value']:.2f}.\n"
                "Provide a single, professional sentence summarizing this shift. Do not recommend next steps, just state the factual significance."
            )
            
            ai_summary = await self.llm_client.generate_text(
                system_prompt="You are the Arcli Analytical Watcher. Be concise, precise, and highly technical.",
                prompt=insight_prompt,
                temperature=0.2
            )
            result["ai_insight"] = ai_summary.strip()
            
        except Exception as e:
            logger.warning(f"[{tenant_id}] AI Synthesis failed for anomaly: {str(e)}")
            result["ai_insight"] = "Statistical anomaly detected in data stream. Manual verification required."

        return result

    def _run_statistical_process_control(
        self, 
        db: Session, 
        tenant_id: str, 
        query: str, 
        threshold: float,
        context_meta: Dict[str, str]
    ) -> Optional[Dict[str, Any]]:
        """
        The Vectorized Core. Executes the DuckDB query, loads Arrow into Polars, 
        and calculates the Exponential Moving Average / Median Absolute Deviation (MAD).
        Runs synchronously inside a threadpool.
        """
        try:
            with storage_manager.duckdb_session(db, tenant_id) as con:
                # ZERO-COPY: Direct Arrow Table to Polars DataFrame
                arrow_table = con.execute(query).arrow()
                df = pl.from_arrow(arrow_table)

            if df is None or df.is_empty() or df.height < 14:
                logger.debug(f"[{tenant_id}] Insufficient data density for robust detection: {context_meta.get('metric')}")
                return None

            # 1. Temporal Anchoring: Ensure continuity up to TODAY, not just last data point
            today = datetime.now(timezone.utc).date()
            start_date = df["ds"].min()
            
            # Create a continuous date range to fill missing days with 0.0
            date_range = pl.DataFrame({
                "ds": pl.date_range(start_date, today, interval="1d", eager=True)
            })
            
            # Left join to fill missing dates, replacing nulls with 0.0
            df = date_range.join(df, on="ds", how="left").with_columns(
                pl.col("y").fill_null(0.0)
            )

            # 2. Robust Statistics: Rolling Median & MAD
            # Median is resilient to existing anomalies; EMA/StdDev are not.
            # MAD = median(|x - median(x)|)
            df = df.with_columns(
                pl.col("y").shift(1).rolling_median(window_size=14, min_periods=7).alias("rolling_median")
            )
            
            # Calculate Absolute Deviation from the Median
            df = df.with_columns(
                (pl.col("y").shift(1) - pl.col("rolling_median")).abs().alias("abs_dev")
            )
            
            # Compute Rolling MAD
            df = df.with_columns(
                pl.col("abs_dev").rolling_median(window_size=14, min_periods=7).alias("mad")
            )

            # 3. Robust Z-Score Calculation
            # 0.6745 is the consistency constant to make MAD comparable to StdDev for normal distributions.
            df = df.with_columns(
                (self.MAD_CONSISTENCY_CONSTANT * (pl.col("y") - pl.col("rolling_median")) / (pl.col("mad") + self.EPSILON)).alias("robust_z_score")
            )

            # 4. Evaluate the most recent day (Today/Yesterday)
            latest = df.tail(1).to_dicts()[0]
            z_score = latest.get('robust_z_score')
            
            # Ensure calculations completed successfully
            if z_score is None:
                return None
                
            is_anomalous = abs(z_score) > threshold

            if is_anomalous:
                actual = latest['y']
                expected = latest['rolling_median']
                
                # Prevent division by zero on variance calculation
                variance_pct = ((actual - expected) / (expected + self.EPSILON)) * 100 if abs(expected) > self.EPSILON else 100.0

                # Date serialization safety
                ds_val = latest['ds']
                date_str = ds_val.strftime('%Y-%m-%d') if hasattr(ds_val, 'strftime') else str(ds_val)

                return {
                    "tenant_id": tenant_id,
                    "dataset_id": context_meta.get("dataset_id"),
                    "date": date_str,
                    "metric": context_meta.get("metric"),
                    "actual_value": float(actual),
                    "expected_value": float(expected),
                    "z_score": float(z_score),
                    "direction": "spike" if z_score > 0 else "drop",
                    "variance_pct": float(variance_pct),
                    "engine": context_meta.get("engine")
                }
            
            # Math says everything is normal. Exit cheaply.
            return None

        except Exception as e:
            logger.error(f"[{tenant_id}] Analytical pipeline failure for {context_meta.get('metric')}: {str(e)}", exc_info=True)
            return None

    # -------------------------------------------------------------------------
    # DB HELPERS (For safe async thread execution)
    # -------------------------------------------------------------------------
    
    def _fetch_dataset(self, db: Session, tenant_id: str, dataset_id: str) -> Optional[Dataset]:
        """Synchronous fetch to be run in a thread."""
        return db.query(Dataset).filter(
            Dataset.id == dataset_id, 
            Dataset.tenant_id == tenant_id
        ).first()

    def _fetch_semantic_metric(self, db: Session, tenant_id: str, metric_name: str) -> Optional[SemanticMetric]:
        """Synchronous fetch to be run in a thread."""
        return db.query(SemanticMetric).filter(
            SemanticMetric.tenant_id == tenant_id, 
            SemanticMetric.metric_name == metric_name
        ).first()

    def _fetch_active_dataset_ids(self, db: Session, tenant_id: str) -> list[str]:
        """Synchronous fetch to be run in a thread."""
        records = db.query(Dataset.id).filter(
            Dataset.tenant_id == tenant_id, 
            Dataset.status == 'READY'
        ).all()
        return [str(r[0]) for r in records]


# Global Singleton Export
anomaly_detector = AnomalyDetector()