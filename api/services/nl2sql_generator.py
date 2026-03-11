# api/services/nl2sql_generator.py

import logging
import json
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

# Setup structured logger
logger = logging.getLogger(__name__)

class NL2SQLOutput(BaseModel):
    """Structured output schema for the LLM to guarantee parsable execution plans."""
    reasoning: str = Field(
        ..., 
        description="Brief step-by-step logic explaining how the SQL and chart answer the prompt."
    )
    sql_query: str = Field(
        ..., 
        description="The highly optimized, read-only DuckDB SQL query."
    )
    chart_spec: Optional[Dict[str, Any]] = Field(
        None, 
        description="A valid Vega-Lite JSON specification if the user asked for a chart or visualization. Null if only a table is needed."
    )

class NL2SQLGenerator:
    """
    Phase 3: Contextual RAG & NL2SQL Generation
    
    Translates natural language into blazing fast DuckDB SQL queries. 
    Strictly constrained by the active schemas to prevent hallucinated columns.
    Generates declarative chart specifications (Vega-Lite) when visualizations are requested.
    """

    def __init__(self, llm_client: Any = None):
        """
        Dependency injection for the LLM client (swappable for OpenAI, Anthropic, etc.)
        Defaults to None to allow late-binding during app initialization (Modular Strategy).
        """
        self.llm = llm_client

    def _minimize_schema_payload(self, schemas: List[Dict[str, Any]]) -> str:
        """
        Contextual RAG Optimization:
        Reduces token bloat by stripping out deep statistical metadata from the schema payload,
        ensuring the LLM only receives table definitions (names, columns, types) to stay focused.
        """
        minimized = []
        for schema in schemas:
            table_def = {
                "table_name": f'"{schema.get("id")}"',
                "friendly_name": schema.get("name", "Unknown Dataset"),
                "columns": {}
            }
            
            raw_meta = schema.get("schema", {})
            if isinstance(raw_meta, dict):
                # Safely extract column mappings whether they are strings or dicts
                for col_name, col_info in raw_meta.items():
                    if isinstance(col_info, dict):
                        table_def["columns"][col_name] = col_info.get("type", "UNKNOWN")
                    else:
                        table_def["columns"][col_name] = str(col_info)
            else:
                table_def["columns"] = raw_meta
                
            minimized.append(table_def)
            
        return json.dumps(minimized, indent=2)

    def _build_system_prompt(self, schemas: List[Dict[str, Any]], semantic_views: Optional[Dict[str, Any]] = None) -> str:
        """
        Constructs the highly constrained system prompt for the LLM.
        Enforces DuckDB dialect, read-only security, and Contextual RAG limitations.
        Dynamically injects 'Gold Tier' semantic views if the router recommended them.
        """
        schema_context = self._minimize_schema_payload(schemas)
        
        views_context = ""
        if semantic_views:
            views_json = json.dumps(semantic_views, indent=2)
            views_context = f"\nAVAILABLE PRE-BUILT VIEWS (GOLD TIER):\nYou MAY query these like normal tables to satisfy complex metric requests.\n{views_json}\n"
        
        return f"""
        You are an expert Data Engineer and DuckDB SQL optimizer for a high-performance analytical SaaS.
        Your job is to translate user prompts into read-only DuckDB SQL queries based EXACTLY on the provided schemas.

        ACTIVE DATASET SCHEMAS:
        {schema_context}
        {views_context}

        CRITICAL RULES:
        1. NO HALLUCINATIONS: You may ONLY select columns and tables that explicitly exist in the schemas or views above.
        2. TABLE REFERENCING: Treat the dataset `id` as the table name. Wrap it in double quotes. 
           Example: SELECT * FROM "dataset_a1b2c3"
        3. DUCKDB DIALECT: Use DuckDB specific functions for date parsing (e.g., strptime, date_trunc), string manipulation, and aggregations.
        4. READ-ONLY STRICT: NEVER output INSERT, UPDATE, DELETE, DROP, or ALTER. SELECT statements only.
        5. VECTORIZED AGGREGATIONS: If the user asks for high-level metrics, use grouped aggregations (SUM, AVG, COUNT) 
           rather than returning raw rows to ensure frontend charting is fast.

        CHARTING RULES:
        If the user prompt implies or explicitly asks for a visualization (chart, graph, plot):
        - Output a valid `Vega-Lite` JSON configuration in the `chart_spec` field.
        - Ensure the fields in the Vega-Lite spec EXACTLY match the aliases in your SQL SELECT statement.
        - Use descriptive aliases in your SQL (e.g., `revenue` instead of `sum(amount)`).
        - If no chart is requested, return null for `chart_spec`.
        """

    async def generate_sql(
        self, 
        prompt: str, 
        schemas: List[Dict[str, Any]], 
        semantic_views: Optional[Dict[str, Any]] = None,
        history: List[Dict[str, Any]] = None
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Generates the SQL and optional chart config based on the user's prompt and active context.
        """
        if self.llm is None:
            raise RuntimeError("LLM client not initialized. Inject the client into nl2sql_generator on startup.")
            
        logger.info("Generating DuckDB SQL execution plan via Contextual RAG.")
        history = history or []
        
        system_prompt = self._build_system_prompt(schemas, semantic_views)
        
        try:
            result: NL2SQLOutput = await self.llm.generate_structured(
                system_prompt=system_prompt,
                prompt=prompt,
                history=history,
                response_model=NL2SQLOutput
            )
            
            logger.debug(f"Generated SQL: {result.sql_query}")
            return result.sql_query, result.chart_spec
            
        except Exception as e:
            logger.error(f"Failed to generate SQL: {str(e)}")
            raise RuntimeError(f"NL2SQL Generation failed: {str(e)}")

    async def correct_sql(
        self, 
        failed_query: str, 
        error_msg: str, 
        schemas: List[Dict[str, Any]],
        semantic_views: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Phase 4: Error Feedback Loop.
        If the Compute Engine fails to execute the query, feed the error back to the LLM for immediate self-correction.
        Maintains the view context to ensure the fix doesn't lose sight of the target views.
        """
        if self.llm is None:
            raise RuntimeError("LLM client not initialized. Inject the client into nl2sql_generator on startup.")
            
        logger.warning("Initiating SQL Auto-Correction loop.")
        
        system_prompt = self._build_system_prompt(schemas, semantic_views)
        
        correction_prompt = f"""
        The following DuckDB SQL query failed to execute.
        
        FAILED QUERY:
        {failed_query}
        
        ERROR MESSAGE RETURNED BY DUCKDB:
        {error_msg}
        
        Please analyze the error message against the active schemas/views, fix the syntax or column names, 
        and provide the corrected DuckDB SQL query. Keep the same chart specification if applicable.
        """
        
        try:
            result: NL2SQLOutput = await self.llm.generate_structured(
                system_prompt=system_prompt,
                prompt=correction_prompt,
                history=[], # Skip standard chat history to focus strictly on the error
                response_model=NL2SQLOutput
            )
            
            logger.info(f"Successfully auto-corrected SQL: {result.sql_query}")
            return result.sql_query, result.chart_spec
            
        except Exception as e:
            logger.error(f"Auto-correction failed: {str(e)}")
            raise RuntimeError("Could not self-correct the query based on the database error.")

# ==========================================
# Singleton Export (The Modular Strategy)
# ==========================================
# Export the configured instance to satisfy api/routes/query.py imports.
# During startup (e.g., in main.py), inject your client: `nl2sql_generator.llm = my_structured_llm_client`
nl2sql_generator = NL2SQLGenerator()