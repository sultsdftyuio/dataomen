# api/routes/query.py

import os
import tempfile
import logging
import time
import uuid
import asyncio
from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

import duckdb
import polars as pl

from api.database import get_db

# Auth / SaaS Identity
from api.auth import verify_tenant, TenantContext
from models import Dataset, QueryHistory, Organization

# Core Services
from api.services.nl2sql_generator import nl2sql_generator
from api.services.compute_engine import compute_engine, ComputeRouter
from api.services.metric_governance import MetricGovernanceService
from api.services.ab_testing import ab_tester
from api.services.narrative_service import narrative_service
# --- ADD THIS AROUND LINE 26 (With other Core Services imports) ---
from api.services.cache_manager import cache_manager
from api.services.insight_orchestrator import InsightPayload # Required for the cache payload

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/query", tags=["Query"])

# ------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------

MAX_ROWS = 1000
QUERY_TIMEOUT = 30

FORBIDDEN_SQL = {
    "DROP", "DELETE", "ALTER",
    "INSERT", "UPDATE",
    "ATTACH", "DETACH", "CREATE"
}

# ------------------------------------------------------------
# REQUEST MODELS
# ------------------------------------------------------------

class EphemeralQueryRequest(BaseModel):
    ephemeral_path: str
    natural_query: str


class ABTestConfig(BaseModel):
    metric_col: str
    group_col: str
    control: str
    treatment: str


class PredictiveConfig(BaseModel):
    metric_col: str
    time_col: str


class PersistentQueryRequest(BaseModel):
    dataset_id: str
    natural_query: str
    agent_id: Optional[str] = None
    ab_test_config: Optional[ABTestConfig] = None
    predictive_config: Optional[PredictiveConfig] = None


# ------------------------------------------------------------
# SECURITY UTILITIES
# ------------------------------------------------------------

def validate_sql(query: str):
    """Prevent dangerous SQL operations."""
    upper = query.upper()

    for keyword in FORBIDDEN_SQL:
        if keyword in upper:
            raise HTTPException(
                status_code=400,
                detail=f"Unsafe SQL operation detected: {keyword}"
            )


def enforce_result_limit(query: str) -> str:
    """Prevent massive results."""
    if "limit" not in query.lower():
        query += f" LIMIT {MAX_ROWS}"
    return query


def validate_ephemeral_path(path: str) -> str:
    """Prevent directory traversal."""
    temp_dir = tempfile.gettempdir()
    absolute_path = os.path.abspath(path)

    if not absolute_path.startswith(os.path.abspath(temp_dir)):
        logger.warning(f"SECURITY ALERT: Path traversal attempt: {path}")
        raise HTTPException(status_code=403, detail="Invalid path")

    if not os.path.exists(absolute_path):
        raise HTTPException(status_code=404, detail="Ephemeral file expired")

    return absolute_path


# ------------------------------------------------------------
# BACKGROUND AUDIT LOGGER
# ------------------------------------------------------------

def async_audit_logger(
    db: Session,
    tenant_id: str,
    agent_id: Optional[str],
    query: str,
    sql: str,
    duration: float,
    success: bool,
    error: Optional[str] = None
):

    try:

        log_entry = QueryHistory(
            tenant_id=tenant_id,
            agent_id=uuid.UUID(agent_id) if agent_id else None,
            natural_query=query,
            generated_sql=sql,
            execution_time_ms=duration,
            was_successful=success,
            error_message=error
        )

        db.add(log_entry)
        db.commit()

    except Exception as e:
        logger.error(f"Audit logging failed: {e}")


# ------------------------------------------------------------
# DATASET MOUNTER
# ------------------------------------------------------------

def mount_dataset(con: duckdb.DuckDBPyConnection, file_path: str, view_name: str):

    ext = file_path.split(".")[-1].lower()

    try:

        if ext in ["csv", "tsv"]:
            con.execute(
                f"CREATE VIEW {view_name} AS SELECT * FROM read_csv_auto('{file_path}', sample_size=-1)"
            )

        elif ext in ["json", "jsonl", "ndjson"]:
            con.execute(
                f"CREATE VIEW {view_name} AS SELECT * FROM read_json_auto('{file_path}')"
            )

        elif ext in ["xlsx", "xls"]:

            df = pl.read_excel(file_path)
            con.register(f"{view_name}_arrow", df.to_arrow())

            con.execute(
                f"CREATE VIEW {view_name} AS SELECT * FROM {view_name}_arrow"
            )

        else:

            con.execute(
                f"CREATE VIEW {view_name} AS SELECT * FROM read_parquet('{file_path}')"
            )

    except Exception as e:

        raise RuntimeError(f"Dataset mount failure: {e}")


# ------------------------------------------------------------
# EPHEMERAL QUERY
# ------------------------------------------------------------

@router.post("/ephemeral")
async def execute_ephemeral_query(
    request: EphemeralQueryRequest,
    tenant: TenantContext = Depends(verify_tenant)
) -> Dict[str, Any]:

    safe_path = validate_ephemeral_path(request.ephemeral_path)

    start_time = time.time()
    con = duckdb.connect(":memory:")

    try:

        view_name = "ephemeral_data"

        mount_dataset(con, safe_path, view_name)

        metadata = con.execute(f"DESCRIBE {view_name}").pl()

        schema = {
            row["column_name"]: row["column_type"]
            for row in metadata.to_dicts()
        }

        schemas = [{
            "id": view_name,
            "name": "Ephemeral Upload",
            "schema": schema
        }]

        sql_query, chart_spec = await nl2sql_generator.generate_sql(
            prompt=request.natural_query,
            schemas=schemas
        )

        validate_sql(sql_query)
        sql_query = enforce_result_limit(sql_query)

        governance = MetricGovernanceService(tenant_id=tenant.tenant_id)
        sql_query = governance.inject_governed_metrics(sql_query)

        def run_query():
            arrow = con.execute(sql_query).arrow()
            df = pl.from_arrow(arrow)
            return df.columns, df.to_dicts()

        columns, results = await asyncio.wait_for(
            asyncio.to_thread(run_query),
            timeout=QUERY_TIMEOUT
        )

        # Narrative Insight
        narrative = await narrative_service.generate_insight(
            user_query=request.natural_query,
            sql_used=sql_query,
            data=results
        )

        return {
            "status": "success",
            "execution_mode": "sync",
            "sql_executed": sql_query,
            "chart_spec": chart_spec,
            "narrative": narrative,
            "columns": columns,
            "data": results,
            "execution_time_ms": round((time.time() - start_time) * 1000, 2)
        }

    finally:
        con.close()


# ------------------------------------------------------------
# PERSISTENT QUERY
# ------------------------------------------------------------

@router.post("/persistent")
async def execute_persistent_query(

    request: PersistentQueryRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(verify_tenant)

):

    start_time = time.time()

    org = db.query(Organization).filter(
        Organization.id == tenant.tenant_id
    ).first()

    if not org:
        raise HTTPException(404, "Organization not found")

    if org.current_month_queries >= org.monthly_query_limit:
        raise HTTPException(
            status_code=402,
            detail="Monthly query limit exceeded"
        )

    dataset = db.query(Dataset).filter(
        Dataset.id == request.dataset_id,
        Dataset.tenant_id == tenant.tenant_id
    ).first()

    if not dataset:
        raise HTTPException(404, "Dataset not found")
    # --- ADD THIS BLOCK (Around Line 236) ---
    # 1. Check Cache First
    cached_result = await cache_manager.get_cached_insight(
        tenant_id=tenant.tenant_id, 
        dataset_id=request.dataset_id, 
        prompt=request.natural_query
    )
    if cached_result:
        logger.info(f"[{tenant.tenant_id}] Serving '{request.natural_query}' from Redis Cache.")
        return cached_result
    # ----------------------------------------

    sql_query = None

    try:

        schemas = [{
            "id": str(dataset.id),
            "name": dataset.name,
            "schema": dataset.schema_metadata or {}
        }]

        sql_query, chart_spec = await nl2sql_generator.generate_sql(
            prompt=request.natural_query,
            schemas=schemas
        )

        validate_sql(sql_query)
        sql_query = enforce_result_limit(sql_query)

        governance = MetricGovernanceService(
            tenant_id=tenant.tenant_id,
            db_session=db
        )

        sql_query = governance.inject_governed_metrics(sql_query)

        if ComputeRouter.requires_background_worker(sql_query):

            return {
                "status": "processing",
                "execution_mode": "async",
                "job_id": str(uuid.uuid4()),
                "message": "Query routed to background worker"
            }

        try:

            results = await asyncio.wait_for(

                compute_engine.execute_read_only(
                    db=db,
                    tenant_id=tenant.tenant_id,
                    datasets=[dataset],
                    query=sql_query
                ),

                timeout=QUERY_TIMEOUT
            )

        except Exception as compute_error:

            sql_query, chart_spec = await nl2sql_generator.correct_sql(

                failed_query=sql_query,
                error_msg=str(compute_error),
                prompt=request.natural_query,
                schemas=schemas
            )

            validate_sql(sql_query)
            sql_query = enforce_result_limit(sql_query)

            results = await compute_engine.execute_read_only(

                db=db,
                tenant_id=tenant.tenant_id,
                datasets=[dataset],
                query=sql_query
            )

        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        org.current_month_queries += 1
        db.commit()

        if request.agent_id:

            background_tasks.add_task(

                async_audit_logger,
                db,
                tenant.tenant_id,
                request.agent_id,
                request.natural_query,
                sql_query,
                execution_time_ms,
                True
            )

        narrative = await narrative_service.generate_insight(
            user_query=request.natural_query,
            sql_used=sql_query,
            data=results
        )

        response = {

            "status": "success",
            "execution_mode": "sync",
            "sql_executed": sql_query,
            "chart_spec": chart_spec,
            "narrative": narrative,
            "columns": list(results[0].keys()) if results else [],
            "data": results,
            "execution_time_ms": execution_time_ms
        }
        dummy_insight = InsightPayload(row_count=len(results), intent_analyzed=request.natural_query)
        
        await cache_manager.set_cached_insight(
            tenant_id=tenant.tenant_id,
            dataset_id=request.dataset_id,
            prompt=request.natural_query,
            sql_query=sql_query,
            chart_spec=chart_spec,
            insight_payload=dummy_insight, 
            narrative=narrative
        )

        if request.ab_test_config and results:

            df = pl.DataFrame(results)

            response["diagnostic_insights"] = await asyncio.to_thread(

                ab_tester.analyze_experiment,
                df,
                request.ab_test_config.metric_col,
                request.ab_test_config.group_col,
                request.ab_test_config.control,
                request.ab_test_config.treatment
            )

        if request.predictive_config:

            response["predictive_insights"] = await compute_engine.execute_ml_pipeline(

                db=db,
                tenant_id=tenant.tenant_id,
                dataset=dataset,
                metric_col=request.predictive_config.metric_col,
                time_col=request.predictive_config.time_col
            )

        return response

    except Exception as e:

        logger.error(f"[{tenant.tenant_id}] Query failed: {e}")

        raise HTTPException(500, f"Query engine error: {e}")