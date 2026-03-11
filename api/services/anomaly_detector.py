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
    Phase 2: Mathematical Background Worker
    Uses strictly vectorized operations (Polars/Rust) over DuckDB zero-copy streams.
    Upgraded to use Exponential Moving Averages (EMA) to account for seasonality and volatility.
    """
    
    def detect_anomaly(
        self, 
        db: Session, 
        tenant_id: str, 
        dataset_id: str, 
        metric_col: str, 
        time_col: str, 
        threshold: float = 2.0
    ) -> Optional[Dict[str, Any]]:
        """
        High-performance, vectorized anomaly detection.
        Returns anomaly details if found, otherwise returns None.
        """
        # 1. Strict Tenant Access Validation & Path Resolution
        dataset = db.query(Dataset).filter(
            Dataset.id == dataset_id,
            Dataset.tenant_id == tenant_id
        ).first()

        if not dataset:
            logger.error(f"Anomaly Detection aborted: Dataset {dataset_id} not found for {tenant_id}.")
            return None

        # 2. Get the dynamically routed, secure R2/S3 path
        secure_path = storage_manager.get_duckdb_query_path(db, dataset)
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d')

        try:
            # 3. Analytical Efficiency: DuckDB pushes filters down to the Parquet file.
            # We ONLY load the specific time and metric columns we need into memory.
            query = f"""
                SELECT 
                    CAST("{time_col}" AS DATE) as ds, 
                    CAST(SUM("{metric_col}") AS DOUBLE) as y
                FROM read_parquet('{secure_path}')
                WHERE "{time_col}" >= '{thirty_days_ago}'
                GROUP BY ds
                ORDER BY ds ASC
            """
            
            # Use scoped session for secure credentials and memory management
            with storage_manager.duckdb_session(db, tenant_id) as con:
                # ZERO-COPY UPGRADE: Fetch Arrow and load instantly to Polars
                arrow_table = con.execute(query).arrow()
                df = pl.from_arrow(arrow_table)

            if df is None or df.is_empty() or df.height < 7:
                logger.debug(f"Not enough data to detect anomalies for dataset {dataset_id}")
                return None

            # 4. Data Sanitization & Vectorized Math Setup
            # Create a continuous date range to fill missing days with 0.0
            min_date = df["ds"].min()
            max_date = df["ds"].max()
            
            date_range = pl.DataFrame({
                "ds": pl.date_range(
                    start=min_date, 
                    end=max_date, 
                    interval="1d", 
                    eager=True
                )
            })
            
            # Left join to fill missing dates, replacing nulls with 0.0
            df = date_range.join(df, on="ds", how="left").with_columns(
                pl.col("y").fill_null(0.0)
            )

            # 5. Exponential Moving Average (EMA) & Std Dev for Seasonality
            # Shift by 1 so today's data doesn't skew its own baseline evaluation.
            # Using ewm_mean/ewm_std provides mathematical precision over simple rolling averages.
            df = df.with_columns([
                pl.col("y").shift(1).ewm_mean(span=7, min_periods=3, ignore_nulls=True).alias("ema_mean"),
                pl.col("y").shift(1).ewm_std(span=7, min_periods=3, ignore_nulls=True).alias("ema_std")
            ])

            # Fill NaN/Null std dev with a small epsilon to avoid division by zero
            epsilon = 1e-9
            df = df.with_columns(
                pl.col("ema_std").fill_nan(epsilon).fill_null(epsilon).replace(0.0, epsilon)
            )

            # 6. Z-Score Calculation (Vectorized natively in Rust/C++)
            # Z = (Value - Mean) / StdDev
            df = df.with_columns(
                ((pl.col("y") - pl.col("ema_mean")) / pl.col("ema_std")).alias("z_score")
            )

            # 7. Evaluate the most recent day (Today/Yesterday)
            latest_data = df.tail(1).to_dicts()[0]
            
            # We must verify we actually calculated a z-score (min_periods might have skipped it)
            if latest_data.get('z_score') is None:
                return None
                
            is_anomalous = abs(latest_data['z_score']) > threshold

            if is_anomalous:
                z_score = latest_data['z_score']
                direction = "spike" if z_score > 0 else "drop"
                expected = latest_data['ema_mean']
                actual = latest_data['y']
                
                # Prevent division by zero on variance calculation
                variance_pct = ((actual - expected) / expected) * 100 if abs(expected) > epsilon else 100.0

                # Safely parse the date object
                ds_val = latest_data['ds']
                date_str = ds_val.strftime('%Y-%m-%d') if hasattr(ds_val, 'strftime') else str(ds_val)

                return {
                    "tenant_id": tenant_id,
                    "dataset_id": dataset_id,
                    "date": date_str,
                    "metric": metric_col,
                    "actual_value": float(actual),
                    "expected_value": float(expected),
                    "z_score": float(z_score),
                    "direction": direction,
                    "variance_pct": float(variance_pct)
                }
            
            # Math says everything is normal. Exit cheaply.
            return None

        except Exception as e:
            logger.error(f"Anomaly detection math pipeline failed for dataset {dataset_id}: {str(e)}")
            return None