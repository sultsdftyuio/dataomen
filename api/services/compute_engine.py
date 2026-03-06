# api/services/compute_engine.py
import duckdb
import polars as pl
import logging
import uuid
import re
from typing import Dict, Any

logger = logging.getLogger(__name__)

class ComputeRouter:
    """
    Defends the main API thread against 'Noisy Neighbors' by scoring query complexity.
    """
    HEAVY_KEYWORDS = {
        "JOIN": 1,
        "GROUP BY": 1,
        "WINDOW": 2,
        "OVER": 2,
        "PARTITION BY": 2,
        "CUBE": 3,
        "ROLLUP": 3,
        "CROSS JOIN": 5
    }
    
    COMPLEXITY_THRESHOLD = 5

    @classmethod
    def analyze_complexity(cls, sql: str) -> int:
        score = 0
        sql_upper = sql.upper()
        for kw, weight in cls.HEAVY_KEYWORDS.items():
            score += len(re.findall(rf"\b{kw}\b", sql_upper)) * weight
        return score

    @classmethod
    def requires_background_worker(cls, sql: str) -> bool:
        return cls.analyze_complexity(sql) >= cls.COMPLEXITY_THRESHOLD


class ExecutionEngine:
    """
    The hybrid performance execution layer. 
    DuckDB -> Apache Arrow (Zero-Copy memory transfer) -> Polars (Vectorized computation).
    """
    def __init__(self, db_path: str = ":memory:") -> None:
        self.db_path = db_path

    def execute_sync(self, sql: str) -> pl.DataFrame:
        """Executes a lightweight query synchronously, highly vectorized."""
        logger.info(f"Executing sync query: {sql[:100]}...")
        try:
            with duckdb.connect(self.db_path) as conn:
                # Zero-copy memory transfer layer via Apache Arrow
                arrow_table = conn.execute(sql).arrow()
                # Wrap in Polars for downstream diagnostic math
                df = pl.from_arrow(arrow_table)
                return df
        except Exception as e:
            logger.error(f"Execution Error: {str(e)}")
            raise e

    async def dispatch_async(self, sql: str, tenant_id: str) -> Dict[str, str]:
        """
        Dispatches a heavy query to an ephemeral Render background worker.
        """
        job_id = str(uuid.uuid4())
        logger.info(f"Dispatched heavy query to background worker. Job ID: {job_id}, Tenant: {tenant_id}")
        
        # Real-world implementation: Push payload to Celery/Redis queue or triggering Render job API
        # e.g., redis.rpush(f"tenant:{tenant_id}:jobs", json.dumps({"sql": sql}))
        
        return {
            "status": "processing",
            "job_id": job_id,
            "message": "Query routed to diagnostic compute tier due to dataset complexity."
        }

# Singleton instance
execution_engine = ExecutionEngine()