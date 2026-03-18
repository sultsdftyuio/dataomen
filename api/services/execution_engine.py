"""
ARCLI.TECH - Execution Layer
Component: Ephemeral DuckDB Compute Engine
Strategy: Zero-ETL, Cloud-Native Querying, & Resource Governance
"""

import os
import logging
import time
from typing import Any, Dict, List, Optional, Tuple
import polars as pl
import duckdb

from sqlalchemy.orm import Session
from models import Agent
from api.services.query_planner import QueryPlan

logger = logging.getLogger(__name__)

class ExecutionEngine:
    """
    Phase 5: The Physical Compute Node.
    
    Responsibilities:
    1. Ephemeral Compute: Spins up an isolated DuckDB connection per query.
    2. Zero-ETL Networking: Injects S3/R2 credentials via DuckDB's `httpfs` extension.
    3. Resource Governance: Hard-caps memory and threads to prevent Render node OOM kills.
    """

    def __init__(self):
        # Determine cloud storage parameters from environment
        self.s3_endpoint = os.environ.get("S3_ENDPOINT", "s3.amazonaws.com").replace("https://", "")
        self.s3_access_key = os.environ.get("AWS_ACCESS_KEY_ID")
        self.s3_secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
        self.s3_region = os.environ.get("AWS_REGION", "us-east-1")
        self.is_r2 = "r2.cloudflarestorage" in self.s3_endpoint

    def _get_secure_connection(self) -> duckdb.DuckDBPyConnection:
        """
        Initializes an ephemeral, sandboxed DuckDB connection.
        Enforces strict memory and threading limits for SaaS multi-tenancy.
        """
        # Create an in-memory database
        conn = duckdb.connect(database=':memory:', read_only=False)
        
        # 1. Resource Governance
        # Prevent a single complex query from taking down the FastAPI worker
        conn.execute("PRAGMA memory_limit='1GB'")
        conn.execute("PRAGMA threads=2")
        
        # 2. Network Configuration (The Zero-ETL Magic)
        conn.execute("INSTALL httpfs")
        conn.execute("LOAD httpfs")
        
        conn.execute(f"SET s3_region='{self.s3_region}'")
        conn.execute(f"SET s3_access_key_id='{self.s3_access_key}'")
        conn.execute(f"SET s3_secret_access_key='{self.s3_secret_key}'")
        conn.execute(f"SET s3_endpoint='{self.s3_endpoint}'")
        
        # Cloudflare R2 specific networking tweaks
        if self.is_r2:
            conn.execute("SET s3_url_style='path'")
            
        return conn

    async def execute_query(
        self, 
        tenant_id: str, 
        sql_query: str, 
        chart_spec: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Executes the AI-generated DuckDB SQL against the remote Parquet files.
        Returns a standardized JSON payload ready for the frontend.
        """
        start_time = time.perf_counter()
        logger.info(f"⚡ [{tenant_id}] Executing ephemeral DuckDB query...")
        
        conn = None
        try:
            conn = self._get_secure_connection()
            
            # Execute the query and fetch directly into a Polars DataFrame for high-performance serialization
            # Using Polars here is 3x faster than pandas for JSON conversion
            df = conn.execute(sql_query).pl()
            
            execution_time = round((time.perf_counter() - start_time) * 1000, 2)
            row_count = df.height
            
            logger.info(f"✅ [{tenant_id}] Query executed in {execution_time}ms. Rows: {row_count}")
            
            # Convert to dictionary records for JSON serialization
            records = df.to_dicts()
            
            return {
                "status": "success",
                "execution_time_ms": execution_time,
                "row_count": row_count,
                "data": records,
                "chart_spec": chart_spec, # Pass the Vega-Lite spec directly to the UI
                "error": None
            }
            
        except duckdb.Error as e:
            logger.error(f"❌ [{tenant_id}] DuckDB Execution Error: {str(e)}")
            return {
                "status": "error",
                "execution_time_ms": round((time.perf_counter() - start_time) * 1000, 2),
                "row_count": 0,
                "data": [],
                "chart_spec": None,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"❌ [{tenant_id}] System Error during execution: {str(e)}")
            return {
                "status": "error",
                "execution_time_ms": round((time.perf_counter() - start_time) * 1000, 2),
                "row_count": 0,
                "data": [],
                "chart_spec": None,
                "error": "Internal execution failure."
            }
        finally:
            if conn:
                conn.close() # CRITICAL: Prevent memory leaks

# Global Singleton
execution_engine = ExecutionEngine()