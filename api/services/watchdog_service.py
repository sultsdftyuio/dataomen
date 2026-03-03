import logging
import duckdb
import pandas as pd
from typing import List, Dict, Any, Optional

from api.services.anomaly_detector import AnomalyDetector
from api.services.narrative_service import NarrativeService

logger = logging.getLogger(__name__)

class WatchdogService:
    """
    The Orchestration Engine (Backend):
    Executes scheduled background checks securely across tenants, prioritizing
    in-process analytical engines (DuckDB) and vectorized math (NumPy/Pandas).
    """
    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        self.anomaly_detector = AnomalyDetector()
        self.narrative_service = NarrativeService()

    def _get_time_series(
        self, 
        conn: duckdb.DuckDBPyConnection, 
        tenant_id: str, 
        file_path: str, 
        metric_col: str, 
        time_col: str,
        days_back: int = 30
    ) -> pd.DataFrame:
        """
        Analytical Efficiency: Do not load the whole Parquet file into Pandas.
        Extracts only the required time series for the anomaly detector.
        """
        query = f"""
            SELECT 
                {time_col}::DATE AS ds, 
                SUM({metric_col}) AS y 
            FROM read_parquet('{file_path}')
            WHERE tenant_id = ? 
              AND {time_col}::DATE >= current_date - INTERVAL {days_back} DAY
            GROUP BY 1
            ORDER BY 1 ASC
        """
        return conn.execute(query, [tenant_id]).df()

    def _get_categorical_columns(
        self, 
        conn: duckdb.DuckDBPyConnection, 
        file_path: str
    ) -> List[str]:
        """Identifies categorical (VARCHAR) dimensions dynamically from the Parquet schema."""
        schema_query = f"DESCRIBE SELECT * FROM read_parquet('{file_path}')"
        schema_df = conn.execute(schema_query).df()
        return schema_df[schema_df['column_type'] == 'VARCHAR']['column_name'].tolist()

    def get_top_variance_drivers(
        self,
        conn: duckdb.DuckDBPyConnection,
        tenant_id: str,
        file_path: str,
        metric_col: str,
        time_col: str,
        anomaly_date: str,
        comparison_date: str,
        top_n: int = 3
    ) -> List[Dict[str, Any]]:
        """
        The Variance Driver Algorithm (Contextual RAG):
        Calculates the delta between the anomaly day and comparison day across 
        all categorical dimensions entirely within DuckDB to prevent memory bloat.
        """
        categorical_cols = self._get_categorical_columns(conn, file_path)
        
        # Exclude internal/system columns if any exist (e.g., tenant_id, file_id)
        excluded_cols = {'tenant_id', 'id', 'uuid'}
        dimensions = [col for col in categorical_cols if col.lower() not in excluded_cols]
        
        drivers = []

        for category in dimensions:
            # Mathematical Precision: Compute exact deltas and percentage changes in SQL
            query = f"""
                WITH daily_aggregates AS (
                    SELECT 
                        {category} AS category_val,
                        SUM(CASE WHEN {time_col}::DATE = ? THEN {metric_col} ELSE 0 END) as anomaly_day_val,
                        SUM(CASE WHEN {time_col}::DATE = ? THEN {metric_col} ELSE 0 END) as comparison_day_val
                    FROM read_parquet('{file_path}')
                    WHERE tenant_id = ?
                      AND {time_col}::DATE IN (?, ?)
                    GROUP BY {category}
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
                WHERE (anomaly_day_val - comparison_day_val) != 0
                  AND category_val IS NOT NULL
                ORDER BY ABS(absolute_delta) DESC
                LIMIT {top_n};
            """
            
            # Fetch small result set to pandas
            results_df = conn.execute(
                query, 
                [anomaly_date, comparison_date, tenant_id, anomaly_date, comparison_date]
            ).df()
            
            drivers.extend(results_df.to_dict('records'))

        # Sort globally across all dimensions to find the absolute biggest drivers
        drivers.sort(key=lambda x: abs(x['absolute_delta']), reverse=True)
        
        return drivers[:top_n]

    def evaluate_agent_rule(
        self, 
        agent_id: str,
        tenant_id: str, 
        file_path: str, 
        metric_col: str, 
        time_col: str,
        sensitivity_threshold: float = 2.0
    ) -> Optional[Dict[str, Any]]:
        """
        The Golden Path Execution.
        Called by the Background RQ Worker. Returns Anomaly data if found, else None.
        """
        logger.info(f"Evaluating Agent {agent_id} for tenant {tenant_id}")
        
        # Security by Design: Fresh isolated connection per worker task
        conn = duckdb.connect(self.db_path)
        
        try:
            # 1. Fetch
            ts_df = self._get_time_series(conn, tenant_id, file_path, metric_col, time_col)
            
            if ts_df.empty or len(ts_df) < 7:
                logger.warning(f"Not enough data to evaluate agent {agent_id}.")
                return None
                
            # 2. Math (Vectorized anomaly check)
            # Ensure the df is sorted by date and set as index for the detector
            ts_df = ts_df.sort_values('ds').set_index('ds')
            
            anomaly_result = self.anomaly_detector.detect(
                ts_df, 
                column='y', 
                sensitivity=sensitivity_threshold
            )
            
            if not anomaly_result['is_anomaly']:
                # Fast, cheap exit if the math is normal
                logger.info(f"Agent {agent_id} check passed. No anomalies.")
                return None
                
            logger.info(f"Anomaly detected for Agent {agent_id}! Generating context...")
            
            # 3. Context (Variance Driver Algorithm)
            anomaly_date = anomaly_result['date']
            comparison_date = anomaly_result['comparison_date'] # Assumes your detector returns the baseline date (e.g., 7 days prior)
            
            top_drivers = self.get_top_variance_drivers(
                conn=conn,
                tenant_id=tenant_id,
                file_path=file_path,
                metric_col=metric_col,
                time_col=time_col,
                anomaly_date=anomaly_date,
                comparison_date=comparison_date
            )
            
            # 4. Reasoning (LLM RAG Diagnostic)
            delta_pct = anomaly_result.get('percentage_change', 0.0)
            diagnostic_summary = self.narrative_service.generate_anomaly_summary(
                metric=metric_col,
                delta_percentage=delta_pct,
                top_drivers=top_drivers
            )
            
            # 5. State (Package result to be saved to DB and sent to Notification Router)
            return {
                "agent_id": agent_id,
                "tenant_id": tenant_id,
                "date": anomaly_date,
                "metric": metric_col,
                "actual_value": anomaly_result['actual_value'],
                "expected_value": anomaly_result['expected_value'],
                "percentage_change": delta_pct,
                "top_variance_drivers": top_drivers,
                "diagnostic_summary": diagnostic_summary
            }
            
        except Exception as e:
            logger.error(f"Error evaluating agent {agent_id}: {str(e)}")
            raise
        finally:
            # Always close the local connection to free memory
            conn.close()