# api/services/nl2sql_generator.py

import logging
import json
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

# Setup structured logger
logger = logging.getLogger(__name__)

# Attempt to import semantic router for Contextual RAG. 
# We use a try-except to maintain the Modular Strategy if the file is being refactored.
try:
    from api.services.semantic_router import semantic_router
    HAS_SEMANTIC_ROUTER = True
except ImportError:
    HAS_SEMANTIC_ROUTER = False
    logger.warning("semantic_router not found. Falling back to heuristic schema minimization.")


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
    Phase 3: Contextual RAG & NL2SQL Generation
    
    Translates natural language into blazing fast DuckDB SQL queries. 
    Strictly constrained by Contextual RAG to prevent hallucinated columns and token bloat.
    Forces the Hybrid Performance Paradigm by requiring DuckDB's vectorized analytical functions.
    """

    def __init__(self, llm_client: Any = None):
        """
        Dependency injection for the LLM client (swappable for OpenAI, Anthropic, etc.)
        Defaults to None to allow late-binding during app initialization (Modular Strategy).
        """
        self.llm = llm_client
        self.max_columns_per_context = 20  # Token Bloat Defense Threshold

    async def _build_contextual_schema(self, prompt: str, schemas: List[Dict[str, Any]]) -> str:
        """
        CONTEXTUAL RAG IMPLEMENTATION:
        Instead of dumping massive schemas into the prompt, we filter down to only 
        the statistically relevant columns. This neutralizes LLM hallucinations.
        """
        minimized = []
        
        for schema in schemas:
            table_name = schema.get("id", "unknown_dataset")
            friendly_name = schema.get("name", "Unknown Dataset")
            raw_meta = schema.get("schema", {})
            
            # Extract raw column dictionaries
            all_columns = {}
            if isinstance(raw_meta, dict):
                for col_name, col_info in raw_meta.items():
                    if isinstance(col_info, dict):
                        all_columns[col_name] = col_info.get("type", "UNKNOWN")
                    else:
                        all_columns[col_name] = str(col_info)
            else:
                all_columns = raw_meta if isinstance(raw_meta, dict) else {}

            # Apply Semantic Routing / Contextual Filtering
            relevant_columns = {}
            if HAS_SEMANTIC_ROUTER and hasattr(semantic_router, 'get_relevant_columns_sync'):
                try:
                    # Ideal State: Vector-based semantic matching of user intent to column descriptions
                    top_cols = await semantic_router.get_relevant_columns(prompt, table_name, top_k=self.max_columns_per_context)
                    relevant_columns = {col: all_columns.get(col, "UNKNOWN") for col in top_cols if col in all_columns}
                except Exception as e:
                    logger.debug(f"Semantic routing failed, using fallback: {e}")
                    
            # Fallback: Truncate to max columns to prevent token context exhaustion
            if not relevant_columns:
                col_keys = list(all_columns.keys())[:self.max_columns_per_context]
                relevant_columns = {k: all_columns[k] for k in col_keys}

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
   - For trends, do not just use basic `AVG()`. Utilize DuckDB analytical functions (e.g., `var_pop()`, `stddev_pop()`, `corr()`, `covar_pop()`).
   - Group and aggregate data heavily on the backend so the frontend receives lightweight payloads.
5. DUCKDB DIALECT: Use DuckDB's native functions (e.g., `strptime`, `date_trunc`, `list_aggregate`).

CHARTING RULES (Vega-Lite):
- If the prompt implies a visual, provide a highly declarative Vega-Lite JSON spec in `chart_spec`.
- The `field` names in Vega-Lite MUST exactly match the output aliases of your SQL query. Use descriptive aliases (e.g., AS revenue_variance).
- If no chart is needed, return null for `chart_spec`.
"""

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
            # Enforce deterministic outputs for analytical precision (temperature=0 usually handled inside llm_client)
            result: NL2SQLOutput = await self.llm.generate_structured(
                system_prompt=system_prompt,
                prompt=prompt,
                history=history,
                response_model=NL2SQLOutput
            )
            
            # Security Sanity Check before returning
            sql_upper = result.sql_query.upper().strip()
            if not (sql_upper.startswith("SELECT") or sql_upper.startswith("WITH")):
                logger.warning(f"LLM generated non-SELECT statement. Attempting to force compliance.")
                raise ValueError("Security Violation: Generated query must initiate with SELECT or WITH.")

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
            
            logger.info("Successfully auto-corrected SQL via feedback loop.")
            return result.sql_query, result.chart_spec
            
        except Exception as e:
            logger.error(f"Auto-correction cascade failed: {str(e)}")
            raise RuntimeError("Could not self-correct the query based on the database engine error.")


# ==========================================
# Singleton Export (The Modular Strategy)
# ==========================================
# Export the configured instance to satisfy api/routes/query.py imports.
# During backend startup, inject your LLM client: `nl2sql_generator.llm = YourStructuredLLMClient()`
nl2sql_generator = NL2SQLGenerator()