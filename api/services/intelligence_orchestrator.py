import logging
from typing import List, Dict
from api.database import get_db_connection
from api.services.anomaly_detector import AnomalyDetector
from api.services.explanation_engine import ExplanationEngine # Use the Engine built previously
from api.services.alert_engine import AlertEngine

logger = logging.getLogger(__name__)

class IntelligenceOrchestrator:
    """
    The unified entry point for Phase 3. 
    Handles multi-metric detection, correlation mapping, and insight generation.
    """

    @classmethod
    def scan_all_metrics(cls, tenant_id: str, target_date: str) -> None:
        """
        Runs the full intelligence pipeline for a given tenant and date.
        """
        logger.info(f"Initiating full intelligence scan for tenant {tenant_id} on {target_date}.")

        # 1. Fetch all distinct metrics for the tenant
        active_metrics = cls._get_active_metrics(tenant_id, target_date)
        if not active_metrics:
            logger.info("No active metrics found. Scan aborted.")
            return

        anomalies_detected = []

        # 2. Run standard detection across all metrics
        for metric in active_metrics:
            # Assumes AnomalyDetector handles its own deterministic idempotency
            is_anomaly = AnomalyDetector.detect_and_log(tenant_id, metric, target_date)
            if is_anomaly:
                anomalies_detected.append(metric)

        if not anomalies_detected:
            logger.info("No anomalies detected across any metrics. Scan complete.")
            return

        # 3. Enrich anomalies with correlations and human-readable insights
        enriched_anomalies = []
        for anomalous_metric in anomalies_detected:
            
            # Fetch correlations (From Phase 2 Engine)
            analysis = ExplanationEngine.analyze_root_cause(
                tenant_id=tenant_id, 
                target_metric=anomalous_metric, 
                target_date=target_date
            )
            
            # Generate Insights
            insight = ExplanationEngine.generate_insight(
                target_metric=anomalous_metric,
                target_deviation=analysis["target_deviation"],
                correlations=analysis["correlations"]
            )
            
            # 4. Update the Anomaly Log with Intelligence Data
            cls._update_anomaly_log_with_insights(
                tenant_id, anomalous_metric, target_date, insight
            )
            
            enriched_anomalies.append({
                "metric": anomalous_metric,
                "severity": insight["severity"],
                "explanation": insight["explanation"]
            })

        # 5. Route to Alerting (Filtering out low severity to prevent spam)
        cls._route_to_alerts(tenant_id, enriched_anomalies)
        
        logger.info(f"Intelligence scan complete. Processed {len(enriched_anomalies)} anomalies.")

    @staticmethod
    def _get_active_metrics(tenant_id: str, target_date: str) -> List[str]:
        """Fetches metrics that actually have data on the target date to avoid empty queries."""
        query = """
            SELECT DISTINCT metric_name 
            FROM metric_values 
            WHERE tenant_id = %s AND date = %s::date AND segment_key = 'overall'
        """
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (tenant_id, target_date))
                return [row[0] for row in cur.fetchall()]

    @staticmethod
    def _update_anomaly_log_with_insights(tenant_id: str, metric: str, target_date: str, insight: Dict) -> None:
        """Idempotently updates the log with calculated severity and explanation."""
        query = """
            UPDATE anomaly_detector_logs
            SET severity = %s, explanation = %s, primary_correlation_metric = %s
            WHERE tenant_id = %s AND metric_name = %s AND date = %s::date
        """
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (
                    insight["severity"], 
                    insight["explanation"], 
                    insight.get("primary_correlation"),
                    tenant_id, 
                    metric, 
                    target_date
                ))
            conn.commit()

    @staticmethod
    def _route_to_alerts(tenant_id: str, anomalies: List[Dict]) -> None:
        """Filters noise and routes high-severity issues to the Alert Engine."""
        # Only alert on Medium, High, or Critical. Drop Low to prevent spam.
        actionable_anomalies = [a for a in anomalies if a["severity"] in ["medium", "high", "critical"]]
        
        if not actionable_anomalies:
            return
            
        # Example interface to the Alert Engine
        AlertEngine.trigger_daily_summary(tenant_id, actionable_anomalies)