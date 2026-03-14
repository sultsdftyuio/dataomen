import polars as pl
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

# Import modular storage manager and models
from api.services.storage_manager import storage_manager
from models import Dataset

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    Phase 2+: High-Performance Analytical Engine.
    Uses Strictly Vectorized Operations (Polars/Rust) over DuckDB zero-copy streams.
    
    Upgraded Engineering:
    - Robust Z-Score: Uses Median Absolute Deviation (MAD) for outlier resilience.
    - Volatility Guard: Dynamic thresholding based on historical variance.
    - Zero-Copy Stream: Optimized Arrow-to-Polars handoff.
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
        Detects anomalies using a resilient MAD-based approach to handle 
        volatile SaaS metrics without false positives.
        """
        # 1. Strict Tenant Access Validation & Path Resolution
        dataset = db.query(Dataset).filter(
            Dataset.id == dataset_id,
            Dataset.tenant_id == tenant_id
        ).first()

        if not dataset:
            logger.error(f"Anomaly Detection aborted: Dataset {dataset_id} not found for {tenant_id}.")
            return None

        # 2. Analytical Windowing (Extended to 90 days for MAD stability)
        secure_path = storage_manager.get_duckdb_query_path(db, dataset)
        window_start = (datetime.now(timezone.utc) - timedelta(days=90)).strftime('%Y-%m-%d')

        try:
            # 3. Analytical Efficiency: DuckDB pushes filters down to Parquet.
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
            
            with storage_manager.duckdb_session(db, tenant_id) as con:
                # ZERO-COPY: Direct Arrow Table to Polars DataFrame
                arrow_table = con.execute(query).arrow()
                df = pl.from_arrow(arrow_table)

            if df is None or df.is_empty() or df.height < 14:
                logger.debug(f"Insufficient data density for robust detection: {dataset_id}")
                return None

            # 4. Data Continuity & Vectorized Math Setup
            # Create a continuous date range to fill missing days with 0.0
            date_range = pl.DataFrame({
                "ds": pl.date_range(df["ds"].min(), df["ds"].max(), "1d", eager=True)
            })
            
            # Left join to fill missing dates, replacing nulls with 0.0
            df = date_range.join(df, on="ds", how="left").with_columns(
                pl.col("y").fill_null(0.0)
            )

            # 5. Robust Statistics: Rolling Median & MAD
            # Median is resilient to existing anomalies; EMA/StdDev are not.
            # MAD = median(|x - median(x)|)
            df = df.with_columns([
                pl.col("y").shift(1).rolling_median(window_size=14, min_periods=7).alias("rolling_median"),
            ])
            
            # Calculate Absolute Deviation from the Median
            df = df.with_columns(
                (pl.col("y").shift(1) - pl.col("rolling_median")).abs().alias("abs_dev")
            )
            
            # Compute Rolling MAD
            df = df.with_columns(
                pl.col("abs_dev").rolling_median(window_size=14, min_periods=7).alias("mad")
            )

            # 6. Robust Z-Score Calculation
            # 0.6745 is the consistency constant to make MAD comparable to StdDev for normal distributions.
            epsilon = 1e-9
            df = df.with_columns(
                (0.6745 * (pl.col("y") - pl.col("rolling_median")) / (pl.col("mad") + epsilon)).alias("robust_z_score")
            )

            # 7. Evaluate the most recent day (Today/Yesterday)
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
                    "dataset_id": dataset_id,
                    "date": date_str,
                    "metric": metric_col,
                    "actual_value": float(actual),
                    "expected_value": float(expected),
                    "z_score": float(z_score),
                    "direction": "spike" if z_score > 0 else "drop",
                    "variance_pct": float(variance_pct),
                    "engine": "Polars-Robust-MAD"
                }
            
            # Math says everything is normal. Exit cheaply.
            return None

        except Exception as e:
            logger.error(f"Analytical pipeline failure [{dataset_id}]: {str(e)}")
            return None