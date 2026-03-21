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
from sqlalchemy import text

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
    metric_name: str = Field(..., description="The business name of the metric, e.g., 'Monthly Active Users'")
    description: str = Field(..., description="The plain English definition, e.g., 'Unique users with a session in the last 30 days'")
    dataset_id: str

class CompiledMetricResult(BaseModel):
    metric_name: str
    compiled_sql: str
    is_valid: bool
    error_message: Optional[str] = None
    ast_cost: int = 0

class MetricCatalogSummary(BaseModel):
    tenant_id: str
    dataset_id: str
    total_governed_metrics: int
    semantic_dictionary: Dict[str, str] # Maps Metric Name -> SQL snippet

# -------------------------------------------------------------------------
# Phase 9: The AI Semantic Layer & Metric Governance
# -------------------------------------------------------------------------

class MetricGovernanceService:
    """
    The Dynamic Semantic Layer.
    
    Allows business users to define complex metrics via Natural Language.
    Compiles NL to deterministic DuckDB SQL snippets, validates them via AST parsing,
    and injects them securely into downstream analytical queries.
    """

    def __init__(self):
        # SQL operations strictly forbidden in metric definitions
        # CRITICAL FIX: Changed exp.AlterTable to exp.Alter to match sqlglot >= 23.8.0 specs
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
        """
        logger.info(f"[{tenant_id}] Compiling semantic metric: '{request.metric_name}'")

        dataset = db.query(Dataset).filter(
            Dataset.id == request.dataset_id,
            Dataset.tenant_id == tenant_id
        ).first()

        if not dataset:
            raise ValueError(f"Dataset {request.dataset_id} not found or access denied.")

        # 1. Fetch physical schema for the LLM context
        secure_path = storage_manager.get_duckdb_query_path(db, dataset)
        try:
            with storage_manager.duckdb_session(db, tenant_id) as conn:
                schema_df = conn.execute(f"DESCRIBE SELECT * FROM read_parquet('{secure_path}') LIMIT 1").pl()
                schema_dict = {row["column_name"]: row["column_type"] for row in schema_df.to_dicts()}
        except Exception as e:
            logger.error(f"[{tenant_id}] Schema extraction failed: {e}")
            raise RuntimeError("Could not read dataset schema for compilation.")

        # 2. LLM Compilation (Zero-Shot SQL Generation)
        system_prompt = f"""
        You are a Staff Data Engineer building a Semantic Layer for DuckDB.
        Your job is to translate a business user's natural language metric definition into a valid, highly-optimized DuckDB SQL SELECT statement.
        
        DATASET SCHEMA:
        {json.dumps(schema_dict, indent=2)}
        
        RULES:
        1. Return ONLY valid DuckDB SQL. No markdown formatting, no explanation.
        2. The query must represent a single metric aggregation (e.g., COUNT, SUM, AVG).
        3. Do NOT include a GROUP BY clause. This SQL will be used as a standalone metric definition or injected into a CTE.
        4. Use CURRENT_DATE for relative time filtering if mentioned (e.g., "last 30 days").
        """

        user_prompt = f"""
        Metric Name: {request.metric_name}
        Definition: {request.description}
        
        Write the SQL SELECT statement that calculates this metric from a generic table named 'base_table'.
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
        dataset_id: str, 
        compilation: CompiledMetricResult,
        description: str
    ) -> Dict[str, Any]:
        """Saves the perfectly validated semantic metric to the database."""
        if not compilation.is_valid:
            raise ValueError(f"Cannot save invalid metric: {compilation.error_message}")
            
        try:
            new_metric = SemanticMetric(
                tenant_id=tenant_id,
                dataset_id=dataset_id,
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

    async def get_semantic_catalog(self, db: Session, tenant_id: str, dataset_id: str) -> MetricCatalogSummary:
        """
        Retrieves the semantic dictionary. This is passed to the QueryPlanner 
        (NL2SQLGenerator) so the AI knows EXACTLY how to calculate business logic.
        """
        metrics = db.query(SemanticMetric).filter(
            SemanticMetric.dataset_id == dataset_id,
            SemanticMetric.tenant_id == tenant_id
        ).all()
        
        dictionary = {m.metric_name: m.compiled_sql for m in metrics}
        
        return MetricCatalogSummary(
            tenant_id=tenant_id,
            dataset_id=dataset_id,
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
        dataset_id: str, 
        raw_execution_sql: str
    ) -> str:
        """
        The Masterpiece of the Semantic Layer.
        
        When a user asks "Show MAU by Country", the Query Planner generates a query referencing "MAU".
        Instead of relying on the LLM to get the math right, we use sqlglot to physically 
        inject the pre-approved, governed metric definition as a CTE into the execution path.
        """
        metrics = db.query(SemanticMetric).filter(
            SemanticMetric.dataset_id == dataset_id,
            SemanticMetric.tenant_id == tenant_id
        ).all()
        
        if not metrics:
            return raw_execution_sql

        try:
            # Parse the incoming query
            ast = sqlglot.parse_one(raw_execution_sql, read="duckdb")
            
            # Find all column references in the query
            referenced_columns = set()
            for column in ast.find_all(exp.Column):
                referenced_columns.add(column.name.lower())
                
            # Identify which governed metrics were actually requested
            injected_ctes = {}
            for metric in metrics:
                # If the metric name (e.g. 'mau') is used anywhere in the query
                if metric.metric_name.lower() in referenced_columns:
                    # Format the definition as a CTE block
                    safe_cte_name = f"governed_{metric.metric_name.replace(' ', '_').lower()}"
                    
                    # Transform the compiled metric (which queries 'base_table') to query our CTE chain
                    metric_ast = sqlglot.parse_one(metric.compiled_sql, read="duckdb")
                    for table in metric_ast.find_all(exp.Table):
                        if table.name == "base_table":
                            table.set("this", exp.to_identifier("raw_dataset_source"))
                            
                    injected_ctes[safe_cte_name] = metric_ast.sql(dialect="duckdb")

            # If no governed metrics were used, return the original
            if not injected_ctes:
                return raw_execution_sql

            # Re-write the AST to include the Governed CTEs
            # This ensures zero-latency performance because we are just formatting strings in Python, 
            # not making network calls to LLMs during execution.
            cte_sql_blocks = []
            for name, sql in injected_ctes.items():
                cte_sql_blocks.append(f"{name} AS ({sql})")
                
            cte_prefix = "WITH " + ",\n".join(cte_sql_blocks)
            
            # If the original query already had a WITH clause, we append to it. 
            # Otherwise, we prepend our new WITH clause.
            if "WITH" in raw_execution_sql.upper():
                final_sql = raw_execution_sql.replace("WITH ", cte_prefix + ",\n", 1)
            else:
                final_sql = f"{cte_prefix}\n{raw_execution_sql}"
                
            logger.info(f"[{tenant_id}] Injected {len(injected_ctes)} governed metrics into query execution.")
            return final_sql

        except Exception as e:
            logger.error(f"[{tenant_id}] Failed to inject governed metrics: {e}")
            # Graceful degradation: If AST manipulation fails, fall back to the raw LLM query
            return raw_execution_sql

# Global Singleton
metric_governance_service = MetricGovernanceService()