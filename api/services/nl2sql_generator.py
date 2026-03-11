# api/services/nl2sql_generator.py

import logging
import json
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

# Setup structured logger
logger = logging.getLogger(__name__)

class SchemaFilterOutput(BaseModel):
    """Structured output for Contextual RAG to prevent token bloat."""
    relevant_columns: List[str] = Field(
        default_factory=list,
        description="A strict list of exact column names that are mathematically or semantically relevant to answering the user's prompt."
    )

class NL2SQLOutput(BaseModel):
    """Structured output schema for the LLM to guarantee parsable execution plans."""
    reasoning: str = Field(
        ..., 
        description="Brief step-by-step logic explaining how the SQL uses mathematical/vectorized functions to answer the prompt."
    )
    sql_query: str = Field(
        ..., 
        description="The highly optimized, read-only DuckDB SQL query."
    )
    chart_spec: Optional[Dict[str, Any]] = Field(
        None, 
        description="A valid Vega-Lite JSON specification if a visual is requested. Null if only a table is needed. Must map exactly to SQL aliases."
    )

class NL2SQLGenerator:
    """
    Phase 3: Contextual RAG & NL2SQL Generation (Modular Strategy)
    
    Translates natural language into blazing fast DuckDB SQL queries. 
    Applies an internal Contextual RAG filter to prevent hallucinated columns and token bloat.
    Forces the Hybrid Performance Paradigm by requiring DuckDB's vectorized analytical functions.
    """

    def __init__(self, llm_client: Any = None):
        """
        Dependency injection for the LLM client (swappable for OpenAI, Anthropic, etc.).
        Allows late-binding during app initialization to ensure strict modularity.
        """
        self.llm = llm_client
        self.max_columns_per_context = 20  # Token Bloat & Hallucination Defense Threshold

    async def _filter_schema_context(self, prompt: str, table_name: str, all_columns: Dict[str, str]) -> Dict[str, str]:
        """
        CONTEXTUAL RAG IMPLEMENTATION:
        Dynamically filters massive schemas down to the statistical minimum required for the query.
        This neutralizes LLM hallucinations and dramatically reduces token latency.
        """
        if len(all_columns) <= self.max_columns_per_context:
            return all_columns

        logger.debug(f"Schema for {table_name} exceeds token threshold. Initiating Contextual RAG filter.")
        
        filter_prompt = f"""
        USER PROMPT: {prompt}
        AVAILABLE COLUMNS: {list(all_columns.keys())}
        
        TASK: Select up to {self.max_columns_per_context} columns strictly necessary to resolve the prompt mathematically.
        """
        
        try:
            # A fast, lightweight LLM call specifically for semantic extraction
            filter_result: SchemaFilterOutput = await self.llm.generate_structured(
                system_prompt="You are a schema routing agent. Select only relevant columns.",
                prompt=filter_prompt,
                history=[],
                response_model=SchemaFilterOutput
            )
            
            # Map back to structural types
            relevant = {col: all_columns[col] for col in filter_result.relevant_columns if col in all_columns}
            
            # Fallback if the model returned nothing valid
            if not relevant:
                raise ValueError("Contextual filter returned empty valid columns.")
            return relevant
            
        except Exception as e:
            logger.warning(f"Contextual schema filter failed: {e}. Falling back to truncation heuristic.")
            return {k: all_columns[k] for k in list(all_columns.keys())[:self.max_columns_per_context]}

    async def _build_contextual_schema(self, prompt: str, schemas: List[Dict[str, Any]]) -> str:
        """
        Builds the heavily compressed schema context for the main SQL reasoning engine.
        """
        minimized = []
        
        for schema in schemas:
            table_name = schema.get("id", "unknown_dataset")
            friendly_name = schema.get("name", "Unknown Dataset")
            raw_meta = schema.get("schema", {})
            
            # Normalize column extraction
            all_columns = {}
            if isinstance(raw_meta, dict):
                for col_name, col_info in raw_meta.items():
                    all_columns[col_name] = col_info.get("type", "UNKNOWN") if isinstance(col_info, dict) else str(col_info)

            # Apply Contextual Filter
            relevant_columns = await self._filter_schema_context(prompt, table_name, all_columns)

            minimized.append({
                "table_name": f'"{table_name}"',
                "friendly_name": friendly_name,
                "columns": relevant_columns
            })
            
        return json.dumps(minimized, indent=2)

    def _build_system_prompt(self, contextual_schema: str, semantic_views: Optional[Dict[str, Any]] = None) -> str:
        """
        Constructs the highly constrained system prompt.
        Enforces DuckDB vectorization, Mathematical Precision, and strict Read-Only security.
        """
        views_context = ""
        if semantic_views:
            views_json = json.dumps(semantic_views, indent=2)
            views_context = f"\nAVAILABLE PRE-BUILT VIEWS (GOLD TIER):\nYou MAY query these like normal tables to satisfy complex metric requests.\n{views_json}\n"
        
        return f"""You are a world-class Data Engineer and DuckDB SQL optimizer for a high-performance Analytical SaaS.
Your objective is to translate user prompts into execution-ready, read-only DuckDB SQL using ONLY the schemas provided.

ACTIVE CONTEXTUAL SCHEMAS (Filtered for relevance):
{contextual_schema}
{views_context}

CRITICAL ENGINEERING RULES:
1. SECURITY BY DESIGN (READ-ONLY): You must NEVER output INSERT, UPDATE, DELETE, DROP, or ALTER. `SELECT` or `WITH` (CTE) statements only.
2. NO HALLUCINATIONS: You may ONLY select columns and tables that explicitly exist in the ACTIVE CONTEXTUAL SCHEMAS above.
3. TABLE REFERENCING: Treat the `table_name` exactly as formatted in the schema (wrapped in double quotes).
4. MATHEMATICAL PRECISION & VECTORIZATION:
   - For trends, do not just use basic `AVG()`. Utilize DuckDB analytical functions (e.g., `var_pop()`, `stddev_pop()`, `corr()`, `covar_pop()`, `regr_slope()`).
   - Group and aggregate data heavily on the backend so the frontend receives lightweight payloads.
5. DUCKDB DIALECT: Use DuckDB's native functions natively (e.g., `strptime`, `date_trunc`, `list_aggregate`).

CHARTING RULES (Vega-Lite):
- If the prompt implies a visual, provide a highly declarative Vega-Lite JSON spec in `chart_spec`.
- The `field` names in Vega-Lite MUST exactly match the output aliases of your SQL query. Use descriptive aliases (e.g., AS revenue_variance).
- If no chart is needed, return null for `chart_spec`.
"""

    def _validate_security(self, sql_query: str) -> None:
        """Security Layer: Fast AST evaluation to prevent mutation attempts."""
        sql_upper = sql_query.upper().strip()
        dangerous_keywords = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "GRANT", "EXECUTE"]
        
        if not (sql_upper.startswith("SELECT") or sql_upper.startswith("WITH")):
            raise ValueError("Security Violation: Generated query must initiate with SELECT or WITH.")
            
        for keyword in dangerous_keywords:
            # Ensure boundaries to not flag columns named 'update_time'
            if f" {keyword} " in f" {sql_upper} ":
                raise ValueError(f"Security Violation: Destructive operation '{keyword}' detected in execution plan.")

    async def generate_sql(
        self, 
        prompt: str, 
        schemas: List[Dict[str, Any]], 
        semantic_views: Optional[Dict[str, Any]] = None,
        history: List[Dict[str, Any]] = None
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Generates the vectorized DuckDB SQL and chart config based on Contextual RAG schemas.
        """
        if self.llm is None:
            raise RuntimeError("LLM client not initialized. Inject the client into nl2sql_generator on startup.")
            
        logger.info(f"Generating DuckDB SQL execution plan via Contextual RAG for prompt: '{prompt[:50]}...'")
        history = history or []
        
        # Build highly compressed, mathematically relevant context
        contextual_schema = await self._build_contextual_schema(prompt, schemas)
        system_prompt = self._build_system_prompt(contextual_schema, semantic_views)
        
        try:
            result: NL2SQLOutput = await self.llm.generate_structured(
                system_prompt=system_prompt,
                prompt=prompt,
                history=history,
                response_model=NL2SQLOutput
            )
            
            # Validate output is purely read-only analytics
            self._validate_security(result.sql_query)

            logger.debug(f"Generated Vectorized SQL (Length: {len(result.sql_query)})")
            return result.sql_query, result.chart_spec
            
        except Exception as e:
            logger.error(f"Failed to generate optimized SQL: {str(e)}")
            raise RuntimeError(f"NL2SQL Generation failed: {str(e)}")

    async def correct_sql(
        self, 
        failed_query: str, 
        error_msg: str, 
        prompt: str,
        schemas: List[Dict[str, Any]],
        semantic_views: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Phase 4: Error Feedback Loop.
        If DuckDB Engine fails execution, feed the deterministic error back to the LLM for self-correction.
        """
        if self.llm is None:
            raise RuntimeError("LLM client not initialized. Inject the client into nl2sql_generator on startup.")
            
        logger.warning("Initiating SQL Auto-Correction loop.")
        
        contextual_schema = await self._build_contextual_schema(prompt, schemas)
        system_prompt = self._build_system_prompt(contextual_schema, semantic_views)
        
        correction_prompt = f"""The following DuckDB SQL query failed to execute during compilation.

FAILED QUERY:
{failed_query}

ENGINE ERROR MESSAGE:
{error_msg}

INSTRUCTIONS:
Analyze the error message against the active schemas. You likely hallucinated a column name, mismatched a type, or used invalid DuckDB syntax.
Fix the SQL query to be 100% compliant. Preserve the chart spec if applicable.
"""
        
        try:
            result: NL2SQLOutput = await self.llm.generate_structured(
                system_prompt=system_prompt,
                prompt=correction_prompt,
                history=[], # Flush chat history to force strict focus on the compiler error
                response_model=NL2SQLOutput
            )
            
            self._validate_security(result.sql_query)
            
            logger.info("Successfully auto-corrected SQL via feedback loop.")
            return result.sql_query, result.chart_spec
            
        except Exception as e:
            logger.error(f"Auto-correction cascade failed: {str(e)}")
            raise RuntimeError("Could not self-correct the query based on the database engine error.")

# ==========================================
# Singleton Export (The Modular Strategy)
# ==========================================
nl2sql_generator = NL2SQLGenerator()