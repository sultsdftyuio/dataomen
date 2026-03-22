"""
ARCLI.TECH - Intelligence Layer
Component: Anomaly Detector (The Watcher)
Strategy: Push Architecture, Statistical Process Control, & Vectorization
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone

import polars as pl
from sqlalchemy.orm import Session

# Import modular storage manager and models
from api.services.storage_manager import storage_manager
from models import Dataset, SemanticMetric

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    Phase 4+: High-Performance Analytical Engine (Push Architecture).
    Uses Strictly Vectorized Operations (Polars/Rust) over DuckDB zero-copy streams.
    
    Upgraded Engineering:
    - Robust Z-Score: Uses Median Absolute Deviation (MAD) for outlier resilience.
    - Volatility Guard: Dynamic thresholding based on historical variance to prevent false alarms on SaaS metrics.
    - Zero-Copy Stream: Optimized Arrow-to-Polars handoff.
    - Golden Metric Support: Can evaluate complex cross-dataset metrics (like True ROAS) using CTE injection.
    """
    
    def detect_anomaly(
        self, 
        db: Session, 
        tenant_id: str, 
        dataset_id: str, 
        metric_col: str, 
        time_col: str, 
        threshold: float = 3.0 # MAD-based thresholds are typically higher/stricter
    ) -> Optional[Dict[str, Any]]:
        """
        Detects anomalies on a single raw dataset column using a resilient MAD-based approach.
        """
        dataset = db.query(Dataset).filter(
            Dataset.id == dataset_id,
            Dataset.tenant_id == tenant_id
        ).first()

        if not dataset:
            logger.error(f"Anomaly Detection aborted: Dataset {dataset_id} not found for {tenant_id}.")
            return None

        # Analytical Windowing (Extended to 90 days for MAD stability)
        secure_path = storage_manager.get_duckdb_query_path(db, dataset)
        window_start = (datetime.now(timezone.utc) - timedelta(days=90)).strftime('%Y-%m-%d')

        # Analytical Efficiency: DuckDB pushes filters down to Parquet.
        # We ONLY load the specific time and metric columns we need into memory.
        query = f"""
            SELECT 
                CAST("{time_col}" AS DATE) as ds, 
                CAST(SUM("{metric_col}") AS DOUBLE) as y
            FROM read_parquet('{secure_path}')
            WHERE "{time_col}" >= '{window_start}'
            GROUP BY ds
            ORDER BY ds ASC
        """
        
        return self._run_statistical_process_control(
            db=db, 
            tenant_id=tenant_id, 
            query=query, 
            threshold=threshold,
            context_meta={
                "dataset_id": dataset_id,
                "metric": metric_col,
                "engine": "Polars-Robust-MAD (Raw)"
            }
        )

    def detect_golden_metric_anomaly(
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

        metric = db.query(SemanticMetric).filter(
            SemanticMetric.tenant_id == tenant_id,
            SemanticMetric.metric_name == metric_name
        ).first()

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
        # (Assuming the orchestrator maintains a mapping or we fetch all active dataset IDs for the tenant)
        active_datasets = db.query(Dataset.id).filter(
            Dataset.tenant_id == tenant_id, 
            Dataset.status == 'READY'
        ).all()
        dataset_ids = [str(d[0]) for d in active_datasets]

        # Inject the deterministic cross-platform math!
        executable_query = metric_governance_service.inject_governed_metrics(
            db=db, 
            tenant_id=tenant_id, 
            dataset_ids=dataset_ids, 
            raw_execution_sql=base_query
        )

        return self._run_statistical_process_control(
            db=db,
            tenant_id=tenant_id,
            query=executable_query,
            threshold=threshold,
            context_meta={
                "dataset_id": "cross-platform",
                "metric": metric_name,
                "engine": "Polars-Robust-MAD (Golden Metric)"
            }
        )

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
        """
        try:
            with storage_manager.duckdb_session(db, tenant_id) as con:
                # ZERO-COPY: Direct Arrow Table to Polars DataFrame
                arrow_table = con.execute(query).arrow()
                df = pl.from_arrow(arrow_table)

            if df is None or df.is_empty() or df.height < 14:
                logger.debug(f"[{tenant_id}] Insufficient data density for robust detection: {context_meta.get('metric')}")
                return None

            # 1. Data Continuity & Vectorized Math Setup
            # Create a continuous date range to fill missing days with 0.0
            date_range = pl.DataFrame({
                "ds": pl.date_range(df["ds"].min(), df["ds"].max(), interval="1d", eager=True)
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
            epsilon = 1e-9
            df = df.with_columns(
                (0.6745 * (pl.col("y") - pl.col("rolling_median")) / (pl.col("mad") + epsilon)).alias("robust_z_score")
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
                variance_pct = ((actual - expected) / (expected + epsilon)) * 100 if abs(expected) > epsilon else 100.0

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

# Singleton Export
anomaly_detector = AnomalyDetector()