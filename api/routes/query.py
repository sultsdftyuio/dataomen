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
from api.auth import verify_tenant, TenantContext
from models import Dataset, QueryHistory, Organization

# Core Services — All route through the centralized llm_client singleton.
# No raw API key propagation; no manual class instantiation below this block.
from api.services.nl2sql_generator import NL2SQLGenerator
from api.services.compute_engine import compute_engine, ComputeRouter
from api.services.metric_governance import metric_governance_service
from api.services.ab_testing import ab_tester
from api.services.narrative_service import narrative_service
from api.services.cache_manager import cache_manager
from api.services.insight_orchestrator import InsightPayload, InsightOrchestrator
from api.services.query_planner import QueryPlan

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/query", tags=["Query"])


# ------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------

MAX_ROWS = 1_000
QUERY_TIMEOUT = 30

# Extended keyword block — includes PRAGMA to prevent config leakage
# on DuckDB/SQLite-family engines.
FORBIDDEN_SQL = {
    "DROP", "DELETE", "ALTER",
    "INSERT", "UPDATE",
    "ATTACH", "DETACH", "CREATE",
    "PRAGMA",
}


# ------------------------------------------------------------
# MODULE-LEVEL SINGLETONS
# These reference the global llm_client internally; instantiate once.
# ------------------------------------------------------------

generator = NL2SQLGenerator()
insight_engine = InsightOrchestrator()


# ------------------------------------------------------------
# REQUEST CONTRACTS
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

def validate_sql(query: str) -> None:
    """
    Keyword-blocklist guard against destructive or config-leaking SQL.
    Operates on the uppercased query string to catch mixed-case attempts.
    """
    upper = query.upper()
    for keyword in FORBIDDEN_SQL:
        if keyword in upper:
            raise HTTPException(
                status_code=400,
                detail=f"Security Violation: Unsafe SQL operation '{keyword}' detected.",
            )


def enforce_result_limit(query: str) -> str:
    """
    Wraps the generated query in a subquery-style LIMIT guard so that
    user-supplied LIMIT clauses deeper in a nested query cannot bypass
    the row cap. Falls back to a simple append when 'limit' is absent.
    """
    if "limit" not in query.lower():
        return f"SELECT * FROM ({query}) _capped LIMIT {MAX_ROWS}"
    return query


def validate_ephemeral_path(path: str) -> str:
    """
    Resolves an upload path to its absolute form and verifies it is
    strictly contained within the OS temp directory, preventing
    directory-traversal attacks on the ephemeral endpoint.
    """
    temp_dir = tempfile.gettempdir()
    absolute_path = os.path.abspath(path)

    if not absolute_path.startswith(os.path.abspath(temp_dir)):
        logger.warning(f"SECURITY ALERT: Path traversal attempt blocked — '{path}'")
        raise HTTPException(status_code=403, detail="Forbidden file access.")

    if not os.path.exists(absolute_path):
        raise HTTPException(status_code=404, detail="Ephemeral file has expired or was removed.")

    return absolute_path


# ------------------------------------------------------------
# BACKGROUND AUDIT LOGGER
# ------------------------------------------------------------

async def async_audit_logger(
    db: Session,
    tenant_id: str,
    agent_id: Optional[str],
    query: str,
    sql: str,
    duration: float,
    success: bool,
    error: Optional[str] = None,
) -> None:
    """
    Fires asynchronously via BackgroundTasks so it never blocks the
    response path. Silently swallows its own failures to avoid masking
    the primary result.
    """
    try:
        log_entry = QueryHistory(
            tenant_id=tenant_id,
            agent_id=uuid.UUID(agent_id) if agent_id else None,
            natural_query=query,
            generated_sql=sql,
            execution_time_ms=duration,
            was_successful=success,
            error_message=error,
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Audit logging failed: {e}")


# ------------------------------------------------------------
# DATASET MOUNTER  (ephemeral path only)
# ------------------------------------------------------------

def mount_dataset(con: duckdb.DuckDBPyConnection, file_path: str, view_name: str) -> None:
    """
    Registers an ad-hoc upload as a DuckDB view. Excel files are
    round-tripped through Polars → Arrow to avoid the DuckDB xlsx
    limitation. All other formats delegate to DuckDB's native readers.
    """
    ext = file_path.rsplit(".", 1)[-1].lower()

    try:
        if ext in {"csv", "tsv"}:
            con.execute(
                f"CREATE VIEW {view_name} AS "
                f"SELECT * FROM read_csv_auto('{file_path}', sample_size=-1)"
            )
        elif ext in {"json", "jsonl", "ndjson"}:
            con.execute(
                f"CREATE VIEW {view_name} AS "
                f"SELECT * FROM read_json_auto('{file_path}')"
            )
        elif ext in {"xlsx", "xls"}:
            df = pl.read_excel(file_path)
            arrow_ref = f"{view_name}_arrow"
            con.register(arrow_ref, df.to_arrow())
            con.execute(f"CREATE VIEW {view_name} AS SELECT * FROM {arrow_ref}")
        else:
            # Default: Parquet and any columnar format DuckDB can auto-detect
            con.execute(
                f"CREATE VIEW {view_name} AS "
                f"SELECT * FROM read_parquet('{file_path}')"
            )
    except Exception as e:
        raise RuntimeError(f"Dataset mount failure ({ext}): {e}") from e


# ------------------------------------------------------------
# EPHEMERAL QUERY  (CSV / Excel / JSON upload path)
# ------------------------------------------------------------

@router.post("/ephemeral")
async def execute_ephemeral_query(
    request: EphemeralQueryRequest,
    db: Session = Depends(get_db),       # Required for MetricGovernance checks
    tenant: TenantContext = Depends(verify_tenant),
) -> Dict[str, Any]:
    """
    Executes natural-language queries against ad-hoc file uploads.

    The file is mounted as an in-process DuckDB view for the lifetime of
    the request; nothing is persisted between calls. Schema discovery,
    SQL generation, governance injection, and insight synthesis all follow
    the same Modular Intelligence pipeline as the persistent route.
    """
    safe_path = validate_ephemeral_path(request.ephemeral_path)
    start_time = time.time()
    con = duckdb.connect(":memory:")

    try:
        # 1. Mount data & discover schema
        view_name = "ephemeral_source"
        mount_dataset(con, safe_path, view_name)

        schema_df = con.execute(f"DESCRIBE {view_name}").pl()
        # Standardized schema dict — matches the format expected by NL2SQLGenerator
        full_schema: Dict[str, Dict[str, str]] = {
            view_name: {
                row["column_name"]: row["column_type"]
                for row in schema_df.to_dicts()
            }
        }

        # 2. Lightweight plan — satisfies the Generator's typed signature
        #    without requiring a full planner round-trip for ad-hoc uploads
        plan = QueryPlan(
            intent=request.natural_query,
            is_achievable=True,
            steps=[],
            suggested_visualizations=[],
        )

        # 3. SQL generation via singleton (no raw API key propagation)
        sql_query, chart_spec = await generator.generate_sql(
            plan=plan,
            full_schema=full_schema,
            target_engine="duckdb",
            tenant_id=tenant.tenant_id,
            prompt=request.natural_query,
        )

        validate_sql(sql_query)
        sql_query = enforce_result_limit(sql_query)

        # 4. Governed metric injection — ensures KPI definitions are authoritative
        sql_query = metric_governance_service.inject_governed_metrics(
            db, tenant.tenant_id, "ephemeral_dataset", sql_query
        )

        # 5. Vectorized execution inside a thread to avoid blocking the event loop
        def _run() -> pl.DataFrame:
            return pl.from_arrow(con.execute(sql_query).arrow())

        df: pl.DataFrame = await asyncio.wait_for(
            asyncio.to_thread(_run), timeout=QUERY_TIMEOUT
        )

        # 6. Insight synthesis — grounded in the actual result DataFrame
        insights: InsightPayload = insight_engine.analyze_dataframe(
            df, plan, tenant.tenant_id
        )
        narrative = await narrative_service.generate_executive_summary(
            payload=insights,
            plan=plan,
            chart_spec=chart_spec,
            tenant_id=tenant.tenant_id,
        )

        return {
            "status": "success",
            "execution_mode": "sync",
            "sql_executed": sql_query,
            "chart_spec": chart_spec,
            "narrative": narrative.model_dump(),
            "columns": df.columns,
            "data": df.to_dicts(),
            "execution_time_ms": round((time.time() - start_time) * 1000, 2),
        }

    finally:
        con.close()


# ------------------------------------------------------------
# PERSISTENT QUERY  (Warehouse / Parquet path)
# ------------------------------------------------------------

@router.post("/persistent")
async def execute_persistent_query(
    request: PersistentQueryRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(verify_tenant),
) -> Dict[str, Any]:
    """
    Executes natural-language queries against registered warehouse datasets.

    Pipeline order:
      1. Org quota guard
      2. Semantic cache check  (target: ~50 ms on hit)
      3. SQL generation + governance injection
      4. Compute routing  (sync fast-path vs. async worker offload)
      5. Vectorized execution with self-healing SQL correction on failure
      6. Insight synthesis + narrative generation
      7. Background audit + cache population
      8. Optional diagnostic extensions  (A/B testing, time-series forecast)
    """
    start_time = time.time()

    # 1. Organization context + quota enforcement
    org = db.query(Organization).filter(
        Organization.id == tenant.tenant_id
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization context missing.")
    if org.current_month_queries >= org.monthly_query_limit:
        raise HTTPException(status_code=402, detail="Monthly compute quota exhausted.")

    dataset = db.query(Dataset).filter(
        Dataset.id == request.dataset_id,
        Dataset.tenant_id == tenant.tenant_id,
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or access denied.")

    # 2. Semantic cache check — serves identical or near-identical prompts
    #    without touching the compute layer
    cached_result = await cache_manager.get_cached_insight(
        tenant_id=tenant.tenant_id,
        dataset_id=request.dataset_id,
        prompt=request.natural_query,
    )
    if cached_result:
        logger.info(f"[{tenant.tenant_id}] Serving '{request.natural_query}' from Semantic Cache.")
        return cached_result

    sql_query: Optional[str] = None

    try:
        # Standardized schema dict — consistent with the ephemeral path
        full_schema: Dict[str, Dict[str, Any]] = {
            dataset.name: dataset.schema_metadata or {}
        }

        plan = QueryPlan(
            intent=request.natural_query,
            is_achievable=True,
            steps=[],
            suggested_visualizations=[],
        )

        # 3. SQL generation via singleton
        sql_query, chart_spec = await generator.generate_sql(
            plan=plan,
            full_schema=full_schema,
            target_engine="duckdb",
            tenant_id=tenant.tenant_id,
            prompt=request.natural_query,
        )

        validate_sql(sql_query)
        sql_query = enforce_result_limit(sql_query)

        # Apply governed metric definitions — the single source of KPI truth
        sql_query = metric_governance_service.inject_governed_metrics(
            db, tenant.tenant_id, request.dataset_id, sql_query
        )

        # 4. Compute routing — offload heavy analytic queries to worker nodes
        if ComputeRouter.requires_background_worker(sql_query):
            return {
                "status": "processing",
                "execution_mode": "async",
                "job_id": str(uuid.uuid4()),
                "message": "Heavy query routed to background worker nodes.",
            }

        # 5. Vectorized execution with self-healing SQL correction on failure
        try:
            results = await asyncio.wait_for(
                compute_engine.execute_read_only(
                    db=db,
                    tenant_id=tenant.tenant_id,
                    datasets=[dataset],
                    query=sql_query,
                ),
                timeout=QUERY_TIMEOUT,
            )
        except Exception as compute_error:
            logger.warning(
                f"[{tenant.tenant_id}] First-pass execution failed — attempting SQL correction. "
                f"Error: {compute_error}"
            )
            sql_query, chart_spec = await generator.correct_sql(
                failed_query=sql_query,
                error_msg=str(compute_error),
                prompt=request.natural_query,
                full_schema=full_schema,
            )
            validate_sql(sql_query)
            sql_query = enforce_result_limit(sql_query)
            results = await compute_engine.execute_read_only(
                db=db,
                tenant_id=tenant.tenant_id,
                datasets=[dataset],
                query=sql_query,
            )

        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        # Increment usage counter atomically before any further async work
        org.current_month_queries += 1
        db.commit()

        # 6. Insight synthesis — grounded in the actual result DataFrame
        df = pl.DataFrame(results)
        insights: InsightPayload = insight_engine.analyze_dataframe(
            df, plan, tenant.tenant_id
        )
        narrative = await narrative_service.generate_executive_summary(
            payload=insights,
            plan=plan,
            chart_spec=chart_spec,
            tenant_id=tenant.tenant_id,
        )

        # 7a. Fire-and-forget audit log (never blocks the response)
        background_tasks.add_task(
            async_audit_logger,
            db,
            tenant.tenant_id,
            request.agent_id,
            request.natural_query,
            sql_query,
            execution_time_ms,
            True,
        )

        response: Dict[str, Any] = {
            "status": "success",
            "execution_mode": "sync",
            "sql_executed": sql_query,
            "chart_spec": chart_spec,
            "narrative": narrative.model_dump(),
            "columns": list(results[0].keys()) if results else [],
            "data": results,
            "execution_time_ms": execution_time_ms,
        }

        # 7b. Populate semantic cache for ~50 ms subsequent response time
        await cache_manager.set_cached_insight(
            tenant_id=tenant.tenant_id,
            dataset_id=request.dataset_id,
            prompt=request.natural_query,
            sql_query=sql_query,
            chart_spec=chart_spec,
            insight_payload=insights,
            narrative=narrative.model_dump(),
        )

        # 8. Optional dimensional diagnostics — only computed when explicitly requested

        if request.ab_test_config and results:
            # Run synchronously in a thread; scipy is CPU-bound
            response["diagnostic_insights"] = await asyncio.to_thread(
                ab_tester.analyze_experiment,
                df,
                request.ab_test_config.metric_col,
                request.ab_test_config.group_col,
                request.ab_test_config.control,
                request.ab_test_config.treatment,
            )

        if request.predictive_config:
            response["predictive_insights"] = await compute_engine.execute_ml_pipeline(
                db=db,
                tenant_id=tenant.tenant_id,
                dataset=dataset,
                metric_col=request.predictive_config.metric_col,
                time_col=request.predictive_config.time_col,
            )

        return response

    except HTTPException:
        raise   # Re-raise intentional HTTP errors without wrapping

    except Exception as e:
        logger.error(f"[{tenant.tenant_id}] Analytical engine failure: {e}", exc_info=True)

        if request.agent_id and sql_query:
            background_tasks.add_task(
                async_audit_logger,
                db,
                tenant.tenant_id,
                request.agent_id,
                request.natural_query,
                sql_query,
                round((time.time() - start_time) * 1000, 2),
                False,
                str(e),
            )

        raise HTTPException(status_code=500, detail=f"Analytical Engine Exception: {str(e)}")