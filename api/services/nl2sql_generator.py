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

    def __init__(self, llm_client: Any):
        """
        Dependency injection for the LLM client (swappable for OpenAI, Anthropic, etc.)
        """
        self.llm = llm_client

    def _build_system_prompt(self, schemas: List[Dict[str, Any]]) -> str:
        """
        Constructs the highly constrained system prompt for the LLM.
        Enforces DuckDB dialect, read-only security, and Contextual RAG limitations.
        """
        schema_context = json.dumps(schemas, indent=2)
        
        return f"""
        You are an expert Data Engineer and DuckDB SQL optimizer for a high-performance analytical SaaS.
        Your job is to translate user prompts into read-only DuckDB SQL queries based EXACTLY on the provided schemas.

        ACTIVE DATASET SCHEMAS:
        {schema_context}

        CRITICAL RULES:
        1. NO HALLUCINATIONS: You may ONLY select columns that explicitly exist in the schemas above.
        2. TABLE REFERENCING: Treat the dataset `id` as the table name. Wrap it in double quotes. 
           Example: SELECT * FROM "dataset_a1b2c3"
        3. DUCKDB DIALECT: Use DuckDB specific functions for date parsing, string manipulation, and aggregations.
        4. READ-ONLY STRICT: NEVER output INSERT, UPDATE, DELETE, DROP, or ALTER. SELECT statements only.
        5. VECTORIZED AGGREGATIONS: If the user asks for high-level metrics, use grouped aggregations (SUM, AVG, COUNT) 
           rather than returning raw rows to ensure frontend charting is fast.

        CHARTING RULES:
        If the user prompt implies or explicitly asks for a visualization (chart, graph, plot):
        - Output a valid `Vega-Lite` JSON configuration in the `chart_spec` field.
        - Ensure the fields in the Vega-Lite spec EXACTLY match the aliases in your SQL SELECT statement.
        - If no chart is requested, return null for `chart_spec`.
        """

    async def generate_sql(
        self, 
        prompt: str, 
        schemas: List[Dict[str, Any]], 
        history: List[Dict[str, Any]]
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Generates the SQL and optional chart config based on the user's prompt and active context.
        """
        logger.info("Generating DuckDB SQL execution plan.")
        
        system_prompt = self._build_system_prompt(schemas)
        
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
        schemas: List[Dict[str, Any]]
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Phase 4: Error Feedback Loop.
        If the Compute Engine fails to execute the query (e.g., syntax error, column not found),
        this method feeds the error back to the LLM for immediate self-correction.
        """
        logger.warning("Initiating SQL Auto-Correction loop.")
        
        system_prompt = self._build_system_prompt(schemas)
        
        correction_prompt = f"""
        The following DuckDB SQL query failed to execute.
        
        FAILED QUERY:
        {failed_query}
        
        ERROR MESSAGE RETURNED BY DUCKDB:
        {error_msg}
        
        Please analyze the error message against the active schemas, fix the syntax or column names, 
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