# api/services/anomaly_detector.py

import pandas as pd
import numpy as np
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

# Import modular storage manager and models
from api.services.storage_manager import storage_manager
from models import Dataset

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    Phase 2: Mathematical Background Worker
    Uses strictly vectorized operations (Pandas/NumPy) over DuckDB zero-copy streams.
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
        thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).strftime('%Y-%m-%d')

        try:
            # 3. Analytical Efficiency: DuckDB pushes filters down to the Parquet file.
            # We ONLY load the specific time and metric columns we need into memory.
            query = f"""
                SELECT 
                    CAST("{time_col}" AS DATE) as ds, 
                    SUM("{metric_col}") as y
                FROM read_parquet({secure_path})
                WHERE "{time_col}" >= '{thirty_days_ago}'
                GROUP BY ds
                ORDER BY ds ASC
            """
            
            # Use scoped session for secure credentials and memory management
            with storage_manager.duckdb_session(db, tenant_id) as con:
                df = con.execute(query).df()

            if df.empty or len(df) < 7:
                logger.debug(f"Not enough data to detect anomalies for {dataset_id}")
                return None

            # 4. Data Sanitization & Math Setup
            # Ensure chronological order and fill missing days with 0 (Vectorized)
            df['ds'] = pd.to_datetime(df['ds'])
            df = df.set_index('ds').asfreq('D', fill_value=0.0).reset_index()

            # 5. Vectorized Math: Calculate a 7-day rolling mean and standard deviation
            # We shift(1) so today's data doesn't skew its own baseline
            rolling_window = df['y'].shift(1).rolling(window=7, min_periods=3)
            
            df['rolling_mean'] = rolling_window.mean()
            df['rolling_std'] = rolling_window.std()

            # Fill NaN std dev with a small number to avoid division by zero
            df['rolling_std'] = df['rolling_std'].fillna(1e-9)
            df['rolling_std'] = np.where(df['rolling_std'] == 0, 1e-9, df['rolling_std'])

            # 6. Z-Score Calculation (Vectorized)
            # Z = (Value - Mean) / StdDev
            df['z_score'] = (df['y'] - df['rolling_mean']) / df['rolling_std']

            # 7. Evaluate the most recent day (Today/Yesterday)
            latest_data = df.iloc[-1]
            
            is_anomalous = abs(latest_data['z_score']) > threshold

            if is_anomalous:
                direction = "spike" if latest_data['z_score'] > 0 else "drop"
                variance_pct = ((latest_data['y'] - latest_data['rolling_mean']) / latest_data['rolling_mean']) * 100

                return {
                    "tenant_id": tenant_id,
                    "dataset_id": dataset_id,
                    "date": latest_data['ds'].strftime('%Y-%m-%d'),
                    "metric": metric_col,
                    "actual_value": float(latest_data['y']),
                    "expected_value": float(latest_data['rolling_mean']),
                    "z_score": float(latest_data['z_score']),
                    "direction": direction,
                    "variance_pct": float(variance_pct)
                }
            
            # Math says everything is normal. Exit cheaply.
            return None

        except Exception as e:
            logger.error(f"Anomaly detection math pipeline failed for {dataset_id}: {str(e)}")
            return None