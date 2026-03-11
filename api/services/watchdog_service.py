# api/services/watchdog_service.py

import logging
import duckdb
import polars as pl
import anyio
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session
from sqlalchemy import text

# Core Modular Orchestrators
from api.services.storage_manager import storage_manager
from api.services.anomaly_detector import AnomalyDetector
from api.services.narrative_service import NarrativeService
from models import Dataset

logger = logging.getLogger(__name__)

class WatchdogService:
    """
    Phase 8.3: The Orchestration Engine & Governance Watchdog.
    Layer 1: Evaluates scheduled business anomaly checks securely across tenants (DuckDB).
    Layer 2: Monitors data pipeline integrity using vectorized math (Polars/EMA).
    Layer 3: Monitors dataset staleness to catch silent serverless timeouts.
    """
    def __init__(
        self, 
        db_client: Session, 
        notification_service: Any = None, 
        audit_service: Any = None
    ):
        # Core Analytical Dependencies
        self.anomaly_detector = AnomalyDetector()
        self.narrative_service = NarrativeService()
        
        # Pipeline Governance Dependencies
        self.db = db_client
        self.notifications = notification_service
        self.audit_logger = audit_service
        
        # Mathematical Parameters for Pipeline Telemetry
        self.span = 7  # 7-day EMA smoothing for pipeline checks
        self.z_score_threshold = 2.5 # Alert if volume deviates by > 2.5 standard deviations

    # ==========================================
    # LAYER 1: BUSINESS METRIC GOVERNANCE (DuckDB & AI Agents)
    # ==========================================

    def _get_categorical_columns(self, conn: duckdb.DuckDBPyConnection, secure_path: str) -> List[str]:
        """Identifies categorical (VARCHAR) dimensions dynamically from the Parquet schema."""
        schema_query = f"DESCRIBE SELECT * FROM read_parquet('{secure_path}')"
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
        """
        dataset = self.db.query(Dataset).filter(
            Dataset.id == dataset_id,
            Dataset.tenant_id == tenant_id
        ).first()

        if not dataset:
            logger.error(f"Cannot calculate variance drivers: Dataset {dataset_id} not found.")
            return []

        secure_path = storage_manager.get_duckdb_query_path(self.db, dataset)

        with storage_manager.duckdb_session(self.db, tenant_id) as conn:
            categorical_cols = self._get_categorical_columns(conn, secure_path)
            
            excluded_cols = {'tenant_id', 'id', 'uuid', '_extracted_at', '_tenant_id', '_integration_name'}
            dimensions = [col for col in categorical_cols if col.lower() not in excluded_cols]
            
            drivers = []

            for category in dimensions:
                # Sanitize category name to prevent injection
                safe_category = "".join(c for c in category if c.isalnum() or c == '_')
                safe_time_col = "".join(c for c in time_col if c.isalnum() or c == '_')
                safe_metric_col = "".join(c for c in metric_col if c.isalnum() or c == '_')

                query = f"""
                    WITH daily_aggregates AS (
                        SELECT 
                            "{safe_category}" AS category_val,
                            SUM(CASE WHEN "{safe_time_col}"::DATE = ? THEN "{safe_metric_col}" ELSE 0 END) as anomaly_day_val,
                            SUM(CASE WHEN "{safe_time_col}"::DATE = ? THEN "{safe_metric_col}" ELSE 0 END) as comparison_day_val
                        FROM read_parquet('{secure_path}')
                        WHERE "{safe_time_col}"::DATE IN (?, ?)
                        GROUP BY 1
                    )
                    SELECT 
                        '{safe_category}' AS dimension,
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
                
                results = conn.execute(
                    query, 
                    [anomaly_date, comparison_date, anomaly_date, comparison_date]
                ).pl().to_dicts()
                
                drivers.extend(results)

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
        """Pulls raw ingestion telemetry logs securely via SQLAlchemy, offloaded to a thread."""
        if not self.db:
            return []

        target_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        def _query_db():
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

        try:
            # Prevents SQLAlchemy's synchronous networking from blocking the async FastAPI event loop
            return await anyio.to_thread.run_sync(_query_db)
        except Exception as e:
            logger.error(f"Watchdog telemetry read failed for {tenant_id}: {str(e)}")
            return []

    def _compute_anomalies_polars(self, history: List[Dict[str, Any]], latest_volume: int) -> Dict[str, Any]:
        """The Mathematical Core for Telemetry using Polars C++ EMA."""
        if len(history) < 3:
            return {"is_anomaly": False, "reason": "Establishing baseline..."}

        df = pl.DataFrame(history).filter(pl.col("status") == "success")
        
        if df.height < 3:
             return {"is_anomaly": False, "reason": "Insufficient history."}

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
            
            if self.notifications and hasattr(self.notifications, 'dispatch_alert'):
                await self.notifications.dispatch_alert(
                    tenant_id=tenant_id,
                    alert_type="SYNC_VOLUME_ANOMALY",
                    metadata={
                        "integration_id": integration_id,
                        "expected_ema": analysis["expected_volume_ema"],
                        "actual": latest_volume,
                        "z_score": analysis["z_score"]
                    }
                )
            return False
            
        return True

    # ==========================================
    # LAYER 3: STALENESS & TIMEOUT MONITORING
    # ==========================================

    async def detect_stale_datasets(self, max_hours: int = 24) -> int:
        """
        Phase 8.3: Scans the metadata catalog to identify "stuck" processing states
        (e.g., Render background worker died or serverless timeout) or datasets
        that missed their daily chronological sync schedule.
        """
        stale_threshold = datetime.now(timezone.utc) - timedelta(hours=max_hours)
        logger.info(f"Running Watchdog Staleness Audit (Threshold: >{max_hours}h)...")

        def _find_stale():
            stale_query = text("""
                SELECT id, tenant_id, name, status, updated_at 
                FROM datasets 
                WHERE (status = 'PROCESSING' AND updated_at < :stale_threshold)
                   OR (status = 'READY' AND updated_at < :stale_threshold)
            """)
            result = self.db.execute(stale_query, {"stale_threshold": stale_threshold}).fetchall()
            return [dict(row._mapping) for row in result]

        stale_datasets = await anyio.to_thread.run_sync(_find_stale)
        
        for dataset in stale_datasets:
            tenant_id = dataset["tenant_id"]
            dataset_name = dataset["name"]
            status = dataset["status"]
            
            alert_msg = f"Dataset '{dataset_name}' is stale. Status '{status}' since {dataset['updated_at']}."
            logger.error(f"[{tenant_id}] WATCHDOG ALERT: {alert_msg}")
            
            if self.audit_logger:
                await self.audit_logger.log_event(
                    tenant_id=tenant_id,
                    event_type="DATASET_STALENESS_DETECTED",
                    severity="HIGH",
                    details=alert_msg
                )
            
            if self.notifications and hasattr(self.notifications, 'dispatch_alert'):
                await self.notifications.dispatch_alert(
                    tenant_id=tenant_id,
                    alert_type="SYNC_STALENESS_ALERT",
                    metadata={"dataset_id": dataset["id"], "dataset_name": dataset_name}
                )
                
        return len(stale_datasets)