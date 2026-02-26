import logging
import duckdb
import pandas as pd
from typing import List, Dict, Any

from api.services.anomaly_detector import AnomalyDetector
# Assuming you have an LLM utility, or you can use your existing Narrative Service
# from api.services.narrative_service import generate_cfo_summary

logger = logging.getLogger(__name__)

class WatchdogService:
    """
    Phase 4: The Proactive Watchdog Orchestrator
    Safely iterates through tenant datasets, executes read-only analytical queries,
    feeds data to the Math Engine, and triggers LLM alerts.
    """
    
    def __init__(self, db_path: str, anomaly_detector: AnomalyDetector):
        self.db_path = db_path
        self.detector = anomaly_detector

    def fetch_tenant_timeseries(self, tenant_id: str, dataset_name: str, date_column: str, target_column: str) -> pd.DataFrame:
        """
        Fetches the last 60 days of aggregated data for a specific metric.
        Enforces strict tenant isolation via S3/R2 pathing and read-only connections.
        """
        # Read-only connection to DuckDB ensures the watchdog cannot alter data
        with duckdb.connect(self.db_path, read_only=True) as conn:
            
            # IMPORTANT: We read directly from the tenant's isolated Parquet file in R2/S3
            # Replace 's3://your-bucket' with your actual storage prefix configured in Phase 1
            query = f"""
                SELECT {date_column}, SUM({target_column}) as {target_column}
                FROM read_parquet('s3://your-bucket/{tenant_id}/{dataset_name}.parquet')
                WHERE {date_column} >= current_date - INTERVAL 60 DAY
                GROUP BY {date_column}
                ORDER BY {date_column} ASC
            """
            try:
                df = conn.execute(query).df()
                return df
            except Exception as e:
                logger.error(f"Watchdog failed to fetch data for tenant {tenant_id}: {str(e)}")
                return pd.DataFrame()

    async def generate_alert_narrative(self, anomaly_data: Dict[str, Any], metric_name: str) -> str:
        """
        Translates mathematical variance into a natural language CFO executive alert.
        """
        variance_pct = anomaly_data['variance'] * 100
        direction = "spiked" if variance_pct > 0 else "dropped"
        
        prompt = (
            f"Act as a CFO. The metric '{metric_name}' just {direction} by "
            f"{abs(variance_pct):.1f}% compared to its expected seasonal baseline "
            f"(accounting for the day of the week). "
            f"Write a 2-sentence urgent but professional push notification alert to the CEO."
        )
        
        # Dispatch to your fast/cheap LLM (e.g., GPT-4o-mini or Claude 3 Haiku)
        # alert_text = await generate_cfo_summary(prompt)
        
        # Placeholder return until LLM is hooked up
        alert_text = f"[MOCK LLM] Alert: {metric_name} {direction} by {abs(variance_pct):.1f}%. Please review the dashboard immediately."
        return alert_text

    async def run_nightly_scan(self, active_tasks: List[Dict[str, str]]):
        """
        The main execution loop triggered by APScheduler.
        active_tasks is a list pulled from your PostgreSQL metadata DB containing what metrics to check.
        """
        logger.info("Starting nightly Watchdog scan...")
        
        for task in active_tasks:
            tenant_id = task['tenant_id']
            metric = task['target_col']
            date_col = task['date_col']
            
            # 1. Fetch Data
            df = self.fetch_tenant_timeseries(
                tenant_id=tenant_id,
                dataset_name=task['dataset_name'],
                date_column=date_col,
                target_column=metric
            )
            
            # Need at least 2 weeks of data to form a reliable baseline
            if df.empty or len(df) < 14: 
                continue
                
            # 2. Run Math Engine (The Muscle)
            anomalies = self.detector.detect_anomalies(df, target_column=metric, date_column=date_col)
            
            # 3. Process Anomalies & Dispatch
            for anomaly in anomalies:
                alert_text = await self.generate_alert_narrative(anomaly, metric_name=metric)
                
                # 4. Push Notification (e.g., Insert into a notifications table or send email)
                logger.warning(f"DISPATCHING ALERT -> Tenant: {tenant_id} | Message: {alert_text}")
                
        logger.info("Nightly Watchdog scan completed.")