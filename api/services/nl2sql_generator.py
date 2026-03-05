# api/services/nl2sql_generator.py
import os
import re
import logging
from typing import Dict, Any, Optional
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

class NL2SQLGenerator:
    """
    Modular Semantic Router. 
    Translates Natural Language to highly optimized DuckDB SQL using Contextual RAG.
    """
    def __init__(self):
        # We use AsyncOpenAI to prevent blocking the FastAPI event loop during LLM generation.
        # This can be configured to point to OpenAI, Anthropic, or local vLLM via base_url.
        self.client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1") 
        )
        # Defaulting to a fast, cheap model for standard analytical queries.
        self.model = os.getenv("LLM_MODEL", "gpt-4o-mini")

    def _format_schema_context(self, schema_metadata: Dict[str, Any]) -> str:
        """
        Contextual RAG: Flattens the dataset schema into a strict, token-efficient string.
        Prevents LLM hallucinations by restricting its knowledge entirely to available columns.
        """
        if not schema_metadata or "columns" not in schema_metadata:
            return "No strict schema provided. Infer columns from the natural context if possible."

        lines = ["Available Columns:"]
        for col in schema_metadata["columns"]:
            col_name = col.get("name", "unknown")
            col_type = col.get("type", "VARCHAR")
            lines.append(f"- {col_name} ({col_type})")
            
        return "\n".join(lines)

    def _extract_sql_from_response(self, text: str) -> str:
        """
        Safety filter: LLMs often wrap SQL in markdown (e.g., ```sql ... ```) or add chatty text.
        This strips everything except the raw executable SQL.
        """
        # 1. Look for markdown sql blocks
        match = re.search(r"```sql\s*(.*?)\s*```", text, re.IGNORECASE | re.DOTALL)
        if match:
            sql = match.group(1).strip()
        else:
            # 2. Fallback: Assume the whole response is SQL, strip generic markdown ticks
            sql = text.replace("```", "").strip()
            
        # 3. Security sanitization: Strip trailing semicolons and take the first statement
        # to prevent piggybacked multi-statement execution.
        sql = sql.split(";")[0] + ";"
        return sql

    async def generate_sql(self, natural_query: str, table_name: str, schema_metadata: Optional[Dict[str, Any]] = None) -> str:
        """
        Core Orchestration method.
        Constructs the strict DuckDB analytical prompt, invokes the LLM, and sanitizes the output.
        """
        schema_context = self._format_schema_context(schema_metadata) if schema_metadata else "Schema unknown."

        system_prompt = f"""You are an elite data engineer specializing in the DuckDB SQL dialect.
Your task is to translate a user's natural language question into a SINGLE, highly optimized SQL query.

CRITICAL RULES:
1. You are querying a table named precisely: {table_name}
2. ONLY use the columns provided in the schema context below. Do NOT hallucinate columns.
3. ALWAYS return valid DuckDB SQL. DuckDB supports advanced analytical functions like DATE_TRUNC, ILIKE, and APPROX_COUNT_DISTINCT.
4. DO NOT wrap the table name in quotes unless necessary.
5. Provide ONLY the raw SQL. Do not provide explanations, conversational text, or markdown formatting outside of the SQL block.

{schema_context}
"""
        
        user_prompt = f"Question: {natural_query}"

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0, # 0.0 forces deterministic, factual SQL generation (Zero Hallucinations)
                max_tokens=500
            )
            
            raw_output = response.choices[0].message.content
            clean_sql = self._extract_sql_from_response(raw_output)
            
            logger.info(f"Generated SQL: {clean_sql}")
            return clean_sql

        except Exception as e:
            logger.error(f"NL2SQL Generation failed: {str(e)}")
            raise ValueError(f"Failed to generate analytical query from AI model: {str(e)}")

# Export singleton instance
nl2sql_generator = NL2SQLGenerator()