# api/services/watchdog_service.py

import logging
import duckdb
import polars as pl
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session
from sqlalchemy import text

# Core Modular Orchestrators
from api.services.storage_manager import storage_manager
from api.services.notification_router import notification_router
from api.services.anomaly_detector import AnomalyDetector
from api.services.narrative_service import NarrativeService
from models import Dataset

logger = logging.getLogger(__name__)

class WatchdogService:
    """
    The Orchestration Engine (Backend) & Governance Watchdog:
    Layer 1: Evaluates scheduled business anomaly checks securely across tenants, 
             prioritizing in-process analytical engines (DuckDB).
    Layer 2: Monitors data pipeline integrity using vectorized math (Polars/EMA) 
             to detect silent sync failures.
    """
    def __init__(
        self, 
        db_client: Session, 
        notification_service: Any = notification_router
    ):
        # Core Analytical Dependencies
        self.anomaly_detector = AnomalyDetector()
        self.narrative_service = NarrativeService()
        
        # Pipeline Governance Dependencies
        self.db = db_client
        self.notifications = notification_service
        self.span = 7  # 7-day EMA smoothing for pipeline checks
        self.z_score_threshold = 2.5 # Alert if volume deviates by > 2.5 standard deviations

    # ==========================================
    # LAYER 1: BUSINESS METRIC GOVERNANCE (DuckDB)
    # ==========================================

    def _get_categorical_columns(self, conn: duckdb.DuckDBPyConnection, secure_path: str) -> List[str]:
        """Identifies categorical (VARCHAR) dimensions dynamically from the Parquet schema."""
        # Performance Upgrade: Vectorized discovery via Polars bypassing Pandas GIL
        schema_query = f"DESCRIBE SELECT * FROM read_parquet({secure_path})"
        schema_df = conn.execute(schema_query).pl()
        return schema_df.filter(pl.col("column_type") == "VARCHAR")["column_name"].to_list()

    def get_top_variance_drivers(
        self,
        tenant_id: str,
        dataset_id: str,
        metric_col: str,
        time_col: str,
        anomaly_date: str,
        comparison_date: str,
        top_n: int = 3
    ) -> List[Dict[str, Any]]:
        """
        The Variance Driver Algorithm (Contextual RAG):
        Calculates the delta between the anomaly day and comparison day.
        Optimized to minimize network overhead during multi-dimensional analysis.
        """
        dataset = self.db.query(Dataset).filter(
            Dataset.id == dataset_id,
            Dataset.tenant_id == tenant_id
        ).first()

        if not dataset:
            logger.error(f"Cannot calculate variance drivers: Dataset {dataset_id} not found.")
            return []

        secure_path = storage_manager.get_duckdb_query_path(self.db, dataset)

        # Security by Design: Managed isolated connection per worker task with S3 secrets loaded
        with storage_manager.duckdb_session(self.db, tenant_id) as conn:
            categorical_cols = self._get_categorical_columns(conn, secure_path)
            
            # Exclude internal/system columns
            excluded_cols = {'tenant_id', 'id', 'uuid', '_extracted_at', '_tenant_id', '_integration_name'}
            dimensions = [col for col in categorical_cols if col.lower() not in excluded_cols]
            
            drivers = []

            for category in dimensions:
                # Mathematical Precision: Compute exact deltas and percentage changes in SQL
                query = f"""
                    WITH daily_aggregates AS (
                        SELECT 
                            "{category}" AS category_val,
                            SUM(CASE WHEN "{time_col}"::DATE = ? THEN "{metric_col}" ELSE 0 END) as anomaly_day_val,
                            SUM(CASE WHEN "{time_col}"::DATE = ? THEN "{metric_col}" ELSE 0 END) as comparison_day_val
                        FROM read_parquet({secure_path})
                        WHERE "{time_col}"::DATE IN (?, ?)
                        GROUP BY 1
                    )
                    SELECT 
                        '{category}' AS dimension,
                        category_val AS category_name,
                        anomaly_day_val,
                        comparison_day_val,
                        (anomaly_day_val - comparison_day_val) AS absolute_delta,
                        CASE 
                            WHEN comparison_day_val = 0 THEN 0
                            ELSE ((anomaly_day_val - comparison_day_val) / comparison_day_val) * 100 
                        END AS percentage_change
                    FROM daily_aggregates
                    WHERE absolute_delta != 0
                      AND category_val IS NOT NULL
                    ORDER BY ABS(absolute_delta) DESC
                    LIMIT {top_n};
                """
                
                # Fetch results directly into Polars dicts to avoid memory spikes
                results = conn.execute(
                    query, 
                    [anomaly_date, comparison_date, anomaly_date, comparison_date]
                ).pl().to_dicts()
                
                drivers.extend(results)

            # Sort globally across all dimensions to find the absolute biggest drivers
            drivers.sort(key=lambda x: abs(x['absolute_delta']), reverse=True)
            return drivers[:top_n]

    def evaluate_agent_rule(
        self, 
        agent_id: str,
        tenant_id: str, 
        dataset_id: str, 
        metric_col: str, 
        time_col: str,
        sensitivity_threshold: float = 2.0
    ) -> Optional[Dict[str, Any]]:
        """
        The Golden Path Execution for autonomous background agents.
        Returns full anomaly context if flagged, else None.
        """
        logger.info(f"Evaluating Agent {agent_id} for tenant {tenant_id}")
        
        try:
            # 1. Math-First Detection (Vectorized/Polars)
            anomaly_result = self.anomaly_detector.detect_anomaly(
                db=self.db,
                tenant_id=tenant_id,
                dataset_id=dataset_id,
                metric_col=metric_col,
                time_col=time_col,
                threshold=sensitivity_threshold
            )
            
            if not anomaly_result:
                return None
                
            logger.info(f"Anomaly detected for Agent {agent_id}! Generating variance context...")
            
            # 2. Contextual RAG (Variance Driver Algorithm)
            # Ensure deterministic date arithmetic with timezones
            anomaly_date = anomaly_result['date']
            dt_obj = datetime.strptime(anomaly_date, '%Y-%m-%d').replace(tzinfo=timezone.utc)
            comparison_date = (dt_obj - timedelta(days=7)).strftime('%Y-%m-%d')
            
            top_drivers = self.get_top_variance_drivers(
                tenant_id=tenant_id,
                dataset_id=dataset_id,
                metric_col=metric_col,
                time_col=time_col,
                anomaly_date=anomaly_date,
                comparison_date=comparison_date
            )
            
            # 3. AI Diagnostic Synthesis
            diagnostic_summary = self.narrative_service.generate_anomaly_summary(
                metric=metric_col,
                delta_percentage=anomaly_result['variance_pct'],
                top_drivers=top_drivers
            )
            
            # 4. State Packaging
            return {
                "agent_id": agent_id,
                "tenant_id": tenant_id,
                "dataset_id": dataset_id,
                "date": anomaly_date,
                "metric": metric_col,
                "actual_value": anomaly_result['actual_value'],
                "expected_value": anomaly_result['expected_value'],
                "variance_pct": anomaly_result['variance_pct'],
                "top_variance_drivers": top_drivers,
                "diagnostic_summary": diagnostic_summary
            }
            
        except Exception as e:
            logger.error(f"Error evaluating agent {agent_id}: {str(e)}")
            raise


    # ==========================================
    # LAYER 2: PIPELINE INTEGRITY GOVERNANCE (Polars)
    # ==========================================

    async def _fetch_sync_history(self, tenant_id: str, integration_id: str, days: int = 30) -> List[Dict[str, Any]]:
        """Pulls raw ingestion telemetry logs securely via SQLAlchemy."""
        if not self.db:
            return []

        target_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        try:
            query = text("""
                SELECT timestamp, rows_synced, status 
                FROM sync_logs 
                WHERE tenant_id = :tenant_id 
                  AND integration_id = :integration_id 
                  AND timestamp >= :target_date
                ORDER BY timestamp ASC
            """)
            
            result = self.db.execute(query, {
                "tenant_id": tenant_id,
                "integration_id": integration_id,
                "target_date": target_date
            }).fetchall()
            
            return [dict(row._mapping) for row in result]
            
        except Exception as e:
            logger.error(f"Watchdog telemetry read failed for {tenant_id}: {str(e)}")
            return []

    def _compute_anomalies_polars(self, history: List[Dict[str, Any]], latest_volume: int) -> Dict[str, Any]:
        """The Mathematical Core for Telemetry using Polars EMA."""
        if len(history) < 3:
            return {"is_anomaly": False, "reason": "Establishing baseline..."}

        df = pl.DataFrame(history).filter(pl.col("status") == "success")
        
        if df.height < 3:
             return {"is_anomaly": False, "reason": "Insufficient history."}

        # Calculate EMA and Rolling StdDev natively in Rust (Polars)
        df = df.with_columns(
            ema=pl.col("rows_synced").ewm_mean(span=self.span, ignore_nulls=True),
            std_dev=pl.col("rows_synced").ewm_std(span=self.span, ignore_nulls=True)
        )

        last_row = df.row(-1, named=True)
        expected_ema = last_row["ema"]
        current_std_dev = last_row["std_dev"] if last_row["std_dev"] and last_row["std_dev"] > 0 else 1.0

        z_score = abs(latest_volume - expected_ema) / current_std_dev
        is_anomaly = z_score > self.z_score_threshold and latest_volume < expected_ema

        return {
            "is_anomaly": is_anomaly,
            "expected_volume_ema": round(expected_ema, 2),
            "actual_volume": latest_volume,
            "z_score": round(z_score, 2),
            "reason": f"Volume drop detected ({int(expected_ema)} expected, got {latest_volume})." if is_anomaly else "Normal"
        }

    async def inspect_pipeline(self, tenant_id: str, integration_id: str, latest_volume: int) -> bool:
        """Main entry point for evaluating pipeline health post-sync."""
        logger.info(f"Watchdog inspecting pipeline {integration_id}...")

        history = await self._fetch_sync_history(tenant_id, integration_id)
        analysis = self._compute_anomalies_polars(history, latest_volume)

        if analysis["is_anomaly"]:
            logger.warning(f"🚨 Pipeline Anomaly! Tenant: {tenant_id} | {analysis['reason']}")
            
            if self.notifications:
                alert_payload = {
                    "tenant_id": tenant_id,
                    "dataset_id": "system_pipeline", 
                    "metric": f"{integration_id} Sync Volume",
                    "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                    "top_variance_drivers": "[]",
                    "diagnostic_summary": f"CRITICAL: {analysis['reason']}",
                    "variance_pct": -100.0 
                }
                self.notifications.process_and_route(self.db, alert_payload, channels=["slack"])
            return False
            
        return True