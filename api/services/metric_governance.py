# api/services/metric_governance.py

import logging
import json
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime

import sqlglot
from sqlglot import exp
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text, or_

# Import our infrastructure modules
from api.database import SessionLocal
from models import Dataset, SemanticMetric # Assuming SemanticMetric is our SQLAlchemy model
from api.services.storage_manager import storage_manager

# Assuming an internal LLM wrapper is available for the compiler
from api.services.llm_client import llm_client 

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Data Contracts (Pydantic)
# -------------------------------------------------------------------------

class NLMetricRequest(BaseModel):
    metric_name: str = Field(..., description="The business name of the metric, e.g., 'True ROAS'")
    description: str = Field(..., description="The plain English definition, e.g., 'Total Stripe Revenue divided by Total Meta Ad Spend'")
    dataset_id: Optional[str] = Field(None, description="Single dataset ID for local metrics")
    dataset_ids: Optional[List[str]] = Field(None, description="List of dataset IDs for cross-dataset global metrics")

class CompiledMetricResult(BaseModel):
    metric_name: str
    compiled_sql: str
    is_valid: bool
    error_message: Optional[str] = None
    ast_cost: int = 0

class MetricCatalogSummary(BaseModel):
    tenant_id: str
    dataset_ids: List[str]
    total_governed_metrics: int
    semantic_dictionary: Dict[str, str] # Maps Metric Name -> SQL snippet

# -------------------------------------------------------------------------
# Phase 9: The AI Semantic Layer & Metric Governance
# -------------------------------------------------------------------------

class MetricGovernanceService:
    """
    The Dynamic Semantic Layer (Upgraded for Multi-Dataset "Golden Metrics").
    
    Allows business users to define complex metrics via Natural Language.
    Compiles NL to deterministic DuckDB SQL snippets, validates them via AST parsing,
    and injects them securely into downstream analytical queries. Supports cross-platform 
    joins natively (e.g., True ROAS across Stripe and Meta).
    """

    def __init__(self):
        # SQL operations strictly forbidden in metric definitions
        self.FORBIDDEN_OPERATIONS = (
            exp.Drop, exp.Delete, exp.Insert, exp.Update, 
            exp.Alter, exp.Command, exp.Commit
        )

    # ==========================================
    # STAGE 1: COMPILATION (NL -> SQL)
    # ==========================================

    async def compile_metric_from_nl(
        self, 
        db: Session, 
        tenant_id: str, 
        request: NLMetricRequest
    ) -> CompiledMetricResult:
        """
        Takes a plain English definition and compiles it into a reusable SQL expression.
        Uses schema-awareness to ensure the generated SQL maps to physical columns.
        Handles both Single-Dataset and Cross-Dataset (Global) metrics.
        """
        logger.info(f"[{tenant_id}] Compiling semantic metric: '{request.metric_name}'")

        # Support backward compatibility or explicit multi-dataset targeting
        target_dataset_ids = request.dataset_ids if request.dataset_ids else ([request.dataset_id] if request.dataset_id else [])
        
        if not target_dataset_ids:
            raise ValueError("Must provide either dataset_id or dataset_ids")

        datasets = db.query(Dataset).filter(
            Dataset.id.in_(target_dataset_ids),
            Dataset.tenant_id == tenant_id
        ).all()

        if not datasets:
            raise ValueError("Datasets not found or access denied.")

        schema_dict = {}

        # 1. Fetch physical schemas for the LLM context
        try:
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                for ds in datasets:
                    secure_path = storage_manager.get_duckdb_query_path(db, ds)
                    schema_df = conn.execute(f"DESCRIBE SELECT * FROM read_parquet('{secure_path}') LIMIT 1").pl()
                    
                    # Clean the dataset name to alphanumeric for safe SQL table aliasing
                    clean_name = "".join(e for e in ds.name.lower() if e.isalnum())
                    schema_dict[clean_name] = {row["column_name"]: row["column_type"] for row in schema_df.to_dicts()}
        except Exception as e:
            logger.error(f"[{tenant_id}] Schema extraction failed: {e}")
            raise RuntimeError("Could not read dataset schema for compilation.")

        # If it's a single dataset, format for simple querying. If multi, expose all schemas.
        if len(datasets) == 1:
            schema_context = json.dumps(list(schema_dict.values())[0], indent=2)
            table_instructions = "a generic table named 'base_table'"
        else:
            schema_context = json.dumps(schema_dict, indent=2)
            table_instructions = "the specific tables provided in the schema, utilizing date-based JOINs (e.g., ON date_trunc('day', tableA.created_at) = date_trunc('day', tableB.created_at)) as necessary"

        # 2. LLM Compilation (Zero-Shot SQL Generation)
        system_prompt = f"""
        You are a Staff Data Engineer building a Semantic Layer for DuckDB.
        Your job is to translate a business user's natural language metric definition into a valid, highly-optimized DuckDB SQL SELECT statement.
        
        DATASET SCHEMA(S):
        {schema_context}
        
        RULES:
        1. Return ONLY valid DuckDB SQL. No markdown formatting, no explanation.
        2. The query must represent a single metric aggregation (e.g., COUNT, SUM, AVG) or a ratio of aggregations (e.g., True ROAS).
        3. Do NOT include a GROUP BY clause in the final projection. This SQL will be used as a standalone metric definition or injected into a CTE.
        4. Use CURRENT_DATE for relative time filtering if mentioned (e.g., "last 30 days").
        """

        user_prompt = f"""
        Metric Name: {request.metric_name}
        Definition: {request.description}
        
        Write the SQL SELECT statement that calculates this metric from {table_instructions}.
        """

        try:
            raw_sql = await llm_client.generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.0 # Deterministic compilation
            )
            raw_sql = raw_sql.replace("```sql", "").replace("```", "").strip()
        except Exception as e:
            return CompiledMetricResult(
                metric_name=request.metric_name, compiled_sql="", is_valid=False,
                error_message=f"LLM Compilation Failed: {str(e)}"
            )

        # 3. AST Validation & Security Check
        return self._validate_and_sanitize_ast(request.metric_name, raw_sql)

    def _validate_and_sanitize_ast(self, metric_name: str, raw_sql: str) -> CompiledMetricResult:
        """
        Uses sqlglot to parse the generated SQL into an Abstract Syntax Tree.
        Ensures no destructive operations exist and reformats the SQL for consistency.
        """
        try:
            # Parse using DuckDB dialect
            ast = sqlglot.parse_one(raw_sql, read="duckdb")
            
            # Security: Check for forbidden DDL/DML operations
            for node in ast.walk():
                if isinstance(node, self.FORBIDDEN_OPERATIONS):
                    return CompiledMetricResult(
                        metric_name=metric_name, compiled_sql=raw_sql, is_valid=False,
                        error_message="SECURITY ALERT: Destructive SQL operation detected in compiled metric."
                    )
                    
            # Complexity Check (AST Cost)
            ast_cost = len(list(ast.walk()))
            if ast_cost > 100:
                logger.warning(f"Metric '{metric_name}' compiled to a highly complex AST (Cost: {ast_cost}).")

            # Standardize and format the SQL
            standardized_sql = ast.sql(dialect="duckdb", pretty=True)
            
            return CompiledMetricResult(
                metric_name=metric_name,
                compiled_sql=standardized_sql,
                is_valid=True,
                ast_cost=ast_cost
            )

        except sqlglot.errors.ParseError as e:
            return CompiledMetricResult(
                metric_name=metric_name, compiled_sql=raw_sql, is_valid=False,
                error_message=f"Syntax Error in compiled SQL: {str(e)}"
            )

    # ==========================================
    # STAGE 2: STORAGE & CATALOG MANAGEMENT
    # ==========================================

    async def save_governed_metric(
        self, 
        db: Session, 
        tenant_id: str, 
        compilation: CompiledMetricResult,
        description: str,
        dataset_id: Optional[str] = None # None implies it is a global cross-dataset metric
    ) -> Dict[str, Any]:
        """Saves the perfectly validated semantic metric to the database."""
        if not compilation.is_valid:
            raise ValueError(f"Cannot save invalid metric: {compilation.error_message}")
            
        try:
            new_metric = SemanticMetric(
                tenant_id=tenant_id,
                dataset_id=dataset_id, # Nullable for cross-dataset Golden Metrics
                metric_name=compilation.metric_name,
                description=description,
                compiled_sql=compilation.compiled_sql,
                created_at=datetime.utcnow()
            )
            db.add(new_metric)
            db.commit()
            db.refresh(new_metric)
            
            logger.info(f"[{tenant_id}] Successfully saved governed metric: {compilation.metric_name}")
            return {"status": "success", "metric_id": str(new_metric.id)}
            
        except Exception as e:
            db.rollback()
            logger.error(f"[{tenant_id}] Failed to save metric to DB: {e}")
            raise RuntimeError("Database error while saving semantic metric.")

    async def get_semantic_catalog(self, db: Session, tenant_id: str, dataset_ids: List[str]) -> MetricCatalogSummary:
        """
        Retrieves the semantic dictionary for specific datasets + Global Metrics. 
        This is passed to the QueryPlanner so the AI knows EXACTLY how to calculate business logic.
        """
        metrics = db.query(SemanticMetric).filter(
            SemanticMetric.tenant_id == tenant_id,
            or_(
                SemanticMetric.dataset_id.in_(dataset_ids),
                SemanticMetric.dataset_id.is_(None)
            )
        ).all()
        
        dictionary = {m.metric_name: m.compiled_sql for m in metrics}
        
        return MetricCatalogSummary(
            tenant_id=tenant_id,
            dataset_ids=dataset_ids,
            total_governed_metrics=len(metrics),
            semantic_dictionary=dictionary
        )

    # ==========================================
    # STAGE 3: EXECUTION (Zero-Latency Injection)
    # ==========================================

    def inject_governed_metrics(
        self, 
        db: Session, 
        tenant_id: str, 
        dataset_ids: List[str], 
        raw_execution_sql: str
    ) -> str:
        """
        The Masterpiece of the Semantic Layer.
        
        When a user asks "Show True ROAS by Country", the Query Planner generates a query referencing "True ROAS".
        Instead of relying on the LLM to get the math and cross-dataset joins right, we use sqlglot to physically 
        inject the pre-approved, governed metric definition (which safely maps cross-dataset paths) as a CTE.
        """
        
        # 1. Fetch relevant datasets and their physical paths for cross-dataset metric mapping
        datasets = db.query(Dataset).filter(
            Dataset.id.in_(dataset_ids),
            Dataset.tenant_id == tenant_id
        ).all()
        
        if not datasets:
            return raw_execution_sql

        # Map alphanumeric names (e.g. 'stripepayments') -> S3/R2 Parquet Path
        dataset_paths = {
            "".join(e for e in ds.name.lower() if e.isalnum()): storage_manager.get_duckdb_query_path(db, ds)
            for ds in datasets
        }

        # 2. Fetch governing metrics (both specific to datasets and Global)
        metrics = db.query(SemanticMetric).filter(
            SemanticMetric.tenant_id == tenant_id,
            or_(
                SemanticMetric.dataset_id.in_(dataset_ids),
                SemanticMetric.dataset_id.is_(None) # Global metrics like "True ROAS"
            )
        ).all()
        
        if not metrics:
            return raw_execution_sql

        try:
            # Parse the incoming LLM-generated execution query
            ast = sqlglot.parse_one(raw_execution_sql, read="duckdb")
            
            # Find all column references requested by the LLM
            referenced_columns = set()
            for column in ast.find_all(exp.Column):
                referenced_columns.add(column.name.lower())
                
            # Identify which governed metrics were actually requested
            injected_ctes = {}
            for metric in metrics:
                if metric.metric_name.lower() in referenced_columns:
                    safe_cte_name = f"governed_{metric.metric_name.replace(' ', '_').lower()}"
                    
                    metric_ast = sqlglot.parse_one(metric.compiled_sql, read="duckdb")
                    
                    # Transform the compiled metric AST to reference live parquet paths
                    for table in metric_ast.find_all(exp.Table):
                        table_name_clean = "".join(e for e in table.name.lower() if e.isalnum())
                        
                        # Handle Local Metrics -> maps to the standard injected raw source
                        if table.name == "base_table":
                            table.set("this", exp.to_identifier("raw_dataset_source"))
                            
                        # Handle Global Cross-Dataset Metrics -> maps directly to DuckDB read_parquet functions
                        elif table_name_clean in dataset_paths:
                            parquet_path = dataset_paths[table_name_clean]
                            # Construct an anonymous function node for read_parquet('s3://...')
                            func = exp.Anonymous(this="read_parquet", expressions=[exp.Literal.string(parquet_path)])
                            
                            # Safely replace the table reference while retaining SQL aliases (e.g. `read_parquet(...) AS meta`)
                            if table.alias:
                                aliased = exp.alias_(func, table.alias)
                                table.replace(aliased)
                            else:
                                table.replace(func)
                            
                    injected_ctes[safe_cte_name] = metric_ast.sql(dialect="duckdb")

            # If no governed metrics were used, return the original untouched query
            if not injected_ctes:
                return raw_execution_sql

            # Re-write the AST to include the Governed CTEs
            # This ensures zero-latency performance via Python string manipulation, 
            # bypassing network/LLM calls during the actual execution phase.
            cte_sql_blocks = []
            for name, sql in injected_ctes.items():
                cte_sql_blocks.append(f"{name} AS ({sql})")
                
            cte_prefix = "WITH " + ",\n".join(cte_sql_blocks)
            
            if "WITH" in raw_execution_sql.upper():
                final_sql = raw_execution_sql.replace("WITH ", cte_prefix + ",\n", 1)
            else:
                final_sql = f"{cte_prefix}\n{raw_execution_sql}"
                
            logger.info(f"[{tenant_id}] Injected {len(injected_ctes)} governed metrics (Global & Local) into query execution.")
            return final_sql

        except Exception as e:
            logger.error(f"[{tenant_id}] Failed to inject governed metrics: {e}")
            # Graceful degradation: Fall back to raw LLM query if AST modification fails
            return raw_execution_sql

# Global Singleton
metric_governance_service = MetricGovernanceService()