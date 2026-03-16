# api/services/watchdog_service.py

import logging
import math
import duckdb
import polars as pl
import anyio
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field

# Core Modular Orchestrators
from api.services.storage_manager import storage_manager
from api.services.anomaly_detector import AnomalyDetector
from api.services.narrative_service import NarrativeService
from models import Dataset

logger = logging.getLogger(__name__)

# ==========================================
# STRICT DATA CONTRACTS (PYDANTIC)
# ==========================================

class VarianceDriverItem(BaseModel):
    dimension: str
    category_name: str
    anomaly_day_val: float
    comparison_day_val: float
    absolute_delta: float
    percentage_change: float
    contribution_to_variance_pct: float

class AgentDiagnosticResult(BaseModel):
    agent_id: str
    tenant_id: str
    dataset_id: str
    date: str
    metric: str
    actual_value: float
    expected_value: float
    variance_pct: float
    top_variance_drivers: List[VarianceDriverItem]
    diagnostic_summary: Dict[str, Any]

class TelemetryAnalysisResult(BaseModel):
    is_anomaly: bool
    expected_volume_ema: float
    actual_volume: int
    z_score: float
    applied_threshold: float
    volatility_index: float
    reason: str

# ==========================================
# THE WATCHDOG SERVICE
# ==========================================

class WatchdogService:
    """
    Phase 8.3: The Autonomous Orchestration Engine & Governance Watchdog.
    
    Layer 1: Evaluates scheduled business anomaly checks securely across tenants (DuckDB).
             Provides automated Root Cause Analysis (Variance Drivers).
    Layer 2: Monitors data pipeline integrity using Vectorized EMA and Adaptive Thresholds.
    Layer 3: Monitors dataset staleness to catch silent serverless timeouts and auto-heals.
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
        self.span = 7  # 7-day Exponential Moving Average
        self.base_z_score_threshold = 2.5 # Base threshold, adjusted dynamically by volatility
        
        # Staleness Thresholds
        self.STUCK_PROCESSING_HOURS = 6 
        self.STALE_READY_HOURS = 36 # 24h cycle + 12h grace period

    # ==========================================
    # INTERNAL UTILITIES
    # ==========================================

    def _sanitize_identifier(self, identifier: str) -> str:
        """Prevents SQL Injection in dynamic DuckDB column references."""
        return "".join(c for c in identifier if c.isalnum() or c == '_')

    def _get_categorical_columns(self, conn: duckdb.DuckDBPyConnection, secure_path: str) -> List[str]:
        """Dynamically identifies categorical (VARCHAR) dimensions from the Parquet schema."""
        schema_query = f"DESCRIBE SELECT * FROM read_parquet('{secure_path}')"
        try:
            schema_df = conn.execute(schema_query).pl()
            return schema_df.filter(pl.col("column_type") == "VARCHAR")["column_name"].to_list()
        except Exception as e:
            logger.error(f"Failed to extract schema for variance drivers: {e}")
            return []

    # ==========================================
    # LAYER 1: BUSINESS METRIC GOVERNANCE
    # ==========================================

    def get_top_variance_drivers(
        self,
        tenant_id: str,
        dataset_id: str,
        metric_col: str,
        time_col: str,
        anomaly_date: str,
        comparison_date: str,
        top_n: int = 3
    ) -> List[VarianceDriverItem]:
        """
        The Variance Driver Algorithm (Contextual RAG Prep):
        Scans all categorical dimensions to find EXACTLY which sub-segments 
        (e.g., specific Countries, Campaigns, or Customer Tiers) drove the anomaly.
        """
        dataset = self.db.query(Dataset).filter(
            Dataset.id == dataset_id,
            Dataset.tenant_id == tenant_id
        ).first()

        if not dataset:
            logger.error(f"[{tenant_id}] Cannot calculate variance drivers: Dataset not found.")
            return []

        secure_path = storage_manager.get_duckdb_query_path(self.db, dataset)

        with storage_manager.duckdb_session(self.db, tenant_id) as conn:
            categorical_cols = self._get_categorical_columns(conn, secure_path)
            
            # Filter out low-cardinality noise or technical IDs
            excluded_cols = {'tenant_id', 'id', 'uuid', '_extracted_at', '_tenant_id', '_integration_name'}
            dimensions = [col for col in categorical_cols if col.lower() not in excluded_cols and not col.lower().endswith('_id')]
            
            drivers: List[Dict[str, Any]] = []
            safe_time_col = self._sanitize_identifier(time_col)
            safe_metric_col = self._sanitize_identifier(metric_col)

            for category in dimensions:
                safe_category = self._sanitize_identifier(category)

                # Pushdown aggregation to DuckDB. We calculate both days in a single scan.
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
                        CAST(category_val AS VARCHAR) AS category_name,
                        CAST(anomaly_day_val AS DOUBLE) AS anomaly_day_val,
                        CAST(comparison_day_val AS DOUBLE) AS comparison_day_val,
                        CAST((anomaly_day_val - comparison_day_val) AS DOUBLE) AS absolute_delta,
                        CASE 
                            WHEN comparison_day_val = 0 THEN 0.0
                            ELSE CAST(((anomaly_day_val - comparison_day_val) / comparison_day_val) * 100 AS DOUBLE)
                        END AS percentage_change
                    FROM daily_aggregates
                    WHERE (anomaly_day_val - comparison_day_val) != 0
                      AND category_val IS NOT NULL
                    ORDER BY ABS(anomaly_day_val - comparison_day_val) DESC
                    LIMIT {top_n * 2}; -- Fetch extra to calculate global contribution accurately
                """
                
                try:
                    results = conn.execute(
                        query, 
                        [anomaly_date, comparison_date, anomaly_date, comparison_date]
                    ).pl().to_dicts()
                    drivers.extend(results)
                except Exception as e:
                    logger.warning(f"[{tenant_id}] Skipping dimension {category} for variance analysis: {e}")
                    continue

            # Sort all gathered drivers globally by absolute impact
            drivers.sort(key=lambda x: abs(x['absolute_delta']), reverse=True)
            top_drivers_raw = drivers[:top_n]
            
            # Calculate Contribution to Variance (%)
            total_absolute_variance = sum(abs(d['absolute_delta']) for d in top_drivers_raw)
            
            final_drivers = []
            for d in top_drivers_raw:
                contribution = (abs(d['absolute_delta']) / total_absolute_variance * 100) if total_absolute_variance > 0 else 0
                final_drivers.append(VarianceDriverItem(
                    dimension=d['dimension'],
                    category_name=d['category_name'],
                    anomaly_day_val=d['anomaly_day_val'],
                    comparison_day_val=d['comparison_day_val'],
                    absolute_delta=d['absolute_delta'],
                    percentage_change=d['percentage_change'],
                    contribution_to_variance_pct=round(contribution, 2)
                ))

            return final_drivers

    def evaluate_agent_rule(
        self, 
        agent_id: str,
        tenant_id: str, 
        dataset_id: str, 
        metric_col: str, 
        time_col: str,
        sensitivity_threshold: float = 2.0
    ) -> Optional[AgentDiagnosticResult]:
        """
        The Golden Path Execution for autonomous background agents.
        Returns full anomaly context + AI narrative if flagged, else None.
        """
        logger.info(f"[{tenant_id}] Evaluating Agent {agent_id} on metric '{metric_col}'")
        
        try:
            # 1. Math-First Detection (Vectorized/Polars via AnomalyDetector)
            anomaly_result = self.anomaly_detector.detect_anomaly(
                db=self.db,
                tenant_id=tenant_id,
                dataset_id=dataset_id,
                metric_col=metric_col,
                time_col=time_col,
                threshold=sensitivity_threshold
            )
            
            if not anomaly_result:
                return None  # All good, no anomaly
                
            logger.info(f"🚨 Anomaly detected for Agent {agent_id}! Generating contextual RAG payload...")
            
            # 2. Contextual RAG (Variance Driver Algorithm)
            anomaly_date = anomaly_result['date']
            dt_obj = datetime.strptime(anomaly_date, '%Y-%m-%d').replace(tzinfo=timezone.utc)
            comparison_date = (dt_obj - timedelta(days=7)).strftime('%Y-%m-%d') # Compare vs same day last week
            
            top_drivers = self.get_top_variance_drivers(
                tenant_id=tenant_id, dataset_id=dataset_id,
                metric_col=metric_col, time_col=time_col,
                anomaly_date=anomaly_date, comparison_date=comparison_date
            )
            
            # 3. AI Diagnostic Synthesis (The "Why")
            diagnostic_summary = self.narrative_service.generate_anomaly_summary(
                metric=metric_col,
                delta_percentage=anomaly_result['variance_pct'],
                top_drivers=[d.model_dump() for d in top_drivers]
            )
            
            return AgentDiagnosticResult(
                agent_id=agent_id,
                tenant_id=tenant_id,
                dataset_id=dataset_id,
                date=anomaly_date,
                metric=metric_col,
                actual_value=anomaly_result['actual_value'],
                expected_value=anomaly_result['expected_value'],
                variance_pct=anomaly_result['variance_pct'],
                top_variance_drivers=top_drivers,
                diagnostic_summary=diagnostic_summary
            )
            
        except Exception as e:
            logger.error(f"[{tenant_id}] Fatal error evaluating agent {agent_id}: {str(e)}")
            return None


    # ==========================================
    # LAYER 2: PIPELINE INTEGRITY GOVERNANCE
    # ==========================================

    async def _fetch_sync_history(self, tenant_id: str, integration_id: str, days: int = 30) -> List[Dict[str, Any]]:
        """Pulls raw ingestion telemetry logs securely via SQLAlchemy, offloaded to a thread."""
        if not self.db: return []
        target_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        def _query_db():
            query = text("""
                SELECT timestamp, rows_synced, status 
                FROM sync_logs 
                WHERE tenant_id = :tenant_id AND integration_id = :integration_id AND timestamp >= :target_date
                ORDER BY timestamp ASC
            """)
            result = self.db.execute(query, {
                "tenant_id": tenant_id, "integration_id": integration_id, "target_date": target_date
            }).fetchall()
            return [dict(row._mapping) for row in result]

        try:
            return await anyio.to_thread.run_sync(_query_db)
        except Exception as e:
            logger.error(f"[{tenant_id}] Watchdog telemetry read failed: {str(e)}")
            return []

    def _compute_anomalies_polars(self, history: List[Dict[str, Any]], latest_volume: int) -> TelemetryAnalysisResult:
        """
        The Mathematical Core for Telemetry using Polars C++ EMA and Adaptive Volatility.
        Adjusts the Z-score threshold automatically based on historical noise.
        """
        if len(history) < 3:
            return TelemetryAnalysisResult(
                is_anomaly=False, expected_volume_ema=latest_volume, actual_volume=latest_volume,
                z_score=0.0, applied_threshold=self.base_z_score_threshold, volatility_index=0.0,
                reason="Establishing baseline history..."
            )

        df = pl.DataFrame(history).filter(pl.col("status") == "success")
        if df.height < 3:
            return TelemetryAnalysisResult(
                is_anomaly=False, expected_volume_ema=latest_volume, actual_volume=latest_volume,
                z_score=0.0, applied_threshold=self.base_z_score_threshold, volatility_index=0.0,
                reason="Insufficient successful history."
            )

        # 1. Calculate Exponential Moving Average and Std Dev
        df = df.with_columns(
            ema=pl.col("rows_synced").ewm_mean(span=self.span, ignore_nulls=True),
            std_dev=pl.col("rows_synced").ewm_std(span=self.span, ignore_nulls=True)
        )

        last_row = df.row(-1, named=True)
        expected_ema = last_row["ema"]
        current_std_dev = last_row["std_dev"] if last_row["std_dev"] and last_row["std_dev"] > 0 else 1.0

        # 2. Adaptive Volatility Adjustment
        # Coefficient of Variation = StdDev / Mean. (How noisy is the sync volume?)
        volatility_index = current_std_dev / max(expected_ema, 1.0)
        
        # If volatility is high (>20%), relax the threshold to avoid alert fatigue.
        # If volatility is low (<5%), tighten the threshold because the sync is usually perfect.
        applied_threshold = self.base_z_score_threshold
        if volatility_index > 0.20:
            applied_threshold = 3.5  # Relaxed
        elif volatility_index < 0.05:
            applied_threshold = 2.0  # Tightened

        # 3. Z-Score calculation
        z_score = abs(latest_volume - expected_ema) / current_std_dev
        
        # We only alert on DROPS in volume, as spikes are usually just historical backfills
        is_anomaly = z_score > applied_threshold and latest_volume < expected_ema

        return TelemetryAnalysisResult(
            is_anomaly=bool(is_anomaly),
            expected_volume_ema=round(expected_ema, 2),
            actual_volume=latest_volume,
            z_score=round(z_score, 2),
            applied_threshold=round(applied_threshold, 2),
            volatility_index=round(volatility_index, 3),
            reason=f"Volume drop detected. Expected ~{int(expected_ema)}, got {latest_volume}." if is_anomaly else "Volume normal."
        )

    async def inspect_pipeline(self, tenant_id: str, integration_id: str, latest_volume: int) -> bool:
        """Main entry point for evaluating pipeline health post-sync."""
        logger.info(f"[{tenant_id}] Watchdog inspecting pipeline {integration_id}...")

        history = await self._fetch_sync_history(tenant_id, integration_id)
        analysis = self._compute_anomalies_polars(history, latest_volume)

        if analysis.is_anomaly:
            logger.warning(f"🚨 Pipeline Anomaly! Tenant: {tenant_id} | {analysis.reason}")
            
            if self.notifications and hasattr(self.notifications, 'dispatch_alert'):
                await self.notifications.dispatch_alert(
                    tenant_id=tenant_id,
                    alert_type="SYNC_VOLUME_ANOMALY",
                    metadata=analysis.model_dump()
                )
            return False
            
        return True


    # ==========================================
    # LAYER 3: STALENESS, TIMEOUTS & AUTO-HEALING
    # ==========================================

    async def detect_stale_datasets(self) -> int:
        """
        Scans the entire global catalog to identify:
        1. "Stuck" processing states (Render background worker died / OOM).
        2. "Stale" datasets that missed their daily sync schedule.
        
        Auto-heals stuck PROCESSING states by forcing them to FAILED so the UI unlocks.
        """
        now = datetime.now(timezone.utc)
        stuck_threshold = now - timedelta(hours=self.STUCK_PROCESSING_HOURS)
        stale_threshold = now - timedelta(hours=self.STALE_READY_HOURS)
        
        logger.info("Running Watchdog Global Staleness Audit...")

        def _audit_and_heal():
            stale_query = text("""
                SELECT id, tenant_id, name, status, updated_at 
                FROM datasets 
                WHERE (status = 'PROCESSING' AND updated_at < :stuck_threshold)
                   OR (status = 'READY' AND updated_at < :stale_threshold)
            """)
            result = self.db.execute(stale_query, {
                "stuck_threshold": stuck_threshold, 
                "stale_threshold": stale_threshold
            }).fetchall()
            
            stale_records = [dict(row._mapping) for row in result]
            healed_count = 0
            
            # Auto-Heal stuck PROCESSING states
            for record in stale_records:
                if record['status'] == 'PROCESSING':
                    heal_query = text("""
                        UPDATE datasets SET status = 'FAILED', error_message = 'Watchdog: Sync timed out.' 
                        WHERE id = :id AND status = 'PROCESSING'
                    """)
                    self.db.execute(heal_query, {"id": record['id']})
                    healed_count += 1
                    
            if healed_count > 0:
                self.db.commit()
                logger.info(f"Auto-healed {healed_count} stuck datasets to FAILED status.")
                
            return stale_records

        stale_datasets = await anyio.to_thread.run_sync(_audit_and_heal)
        
        for dataset in stale_datasets:
            tenant_id = dataset["tenant_id"]
            dataset_name = dataset["name"]
            status = dataset["status"]
            
            alert_msg = f"Dataset '{dataset_name}' is critically stale. Status '{status}' since {dataset['updated_at']}."
            logger.error(f"[{tenant_id}] WATCHDOG ALERT: {alert_msg}")
            
            if self.audit_logger:
                await self.audit_logger.log_event(
                    tenant_id=tenant_id,
                    event_type="DATASET_STALENESS_DETECTED",
                    severity="CRITICAL" if status == 'PROCESSING' else "HIGH",
                    details=alert_msg
                )
            
            if self.notifications and hasattr(self.notifications, 'dispatch_alert'):
                await self.notifications.dispatch_alert(
                    tenant_id=tenant_id,
                    alert_type="SYNC_STALENESS_ALERT",
                    metadata={"dataset_id": str(dataset["id"]), "dataset_name": dataset_name, "status": status}
                )
                
        return len(stale_datasets)