import os
import logging
from typing import Optional
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

# Configure logging for the service
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# -------------------------------------------------------------------------
# 1. Type Safety & Structured Output
# -------------------------------------------------------------------------
class SQLResponse(BaseModel):
    """
    Forces the LLM to output a strict JSON structure.
    This guarantees we always receive an executable query and a human-readable 
    explanation without regex parsing or brittle string manipulation.
    """
    sql_query: str = Field(
        description="The highly optimized, executable DuckDB SQL query."
    )
    explanation: str = Field(
        description="A concise, 1-sentence explanation of the analytical logic used."
    )

# -------------------------------------------------------------------------
# 2. Orchestration & Service Layer
# -------------------------------------------------------------------------
class NL2SQLService:
    """
    Service responsible for converting Natural Language to DuckDB SQL.
    Uses gpt-5-nano for ultra-low-latency code generation.
    """
    def __init__(self, api_key: Optional[str] = None):
        # We use the Async client to prevent blocking the main event loop
        # ensuring high concurrency for multiple tenants on Vercel/Render.
        self.client = AsyncOpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
        self.model = "gpt-5-nano"

    async def generate_sql(
        self, 
        tenant_id: str, 
        user_question: str, 
        schema_context: str
    ) -> SQLResponse:
        """
        Generates tenant-isolated SQL using Contextual RAG schema fragments.
        
        Args:
            tenant_id (str): The authenticated user's tenant ID for data isolation.
            user_question (str): The natural language query from the user.
            schema_context (str): The strictly routed DDL/schema fragments relevant to the query.
            
        Returns:
            SQLResponse: A Pydantic model containing the 'sql_query' and 'explanation'.
        """
        
        # Security by Design: Injecting multi-tenant partition boundaries and
        # read-only restrictions directly into the foundational instructions.
        system_prompt = f"""
        You are a world-class Data Engineering AI. Your task is to translate user questions into highly optimized DuckDB SQL.
        
        CRITICAL INSTRUCTIONS:
        1. MULTI-TENANT SECURITY: You MUST scope ALL queries to the current tenant. 
           Always include `WHERE tenant_id = '{tenant_id}'` in every table reference.
        2. NO HALLUCINATIONS: Only use the tables, columns, and relationships provided in the SCHEMA CONTEXT.
        3. ANALYTICAL EFFICIENCY: Utilize DuckDB's vectorized functions (e.g., date truncation, array aggregations) for peak performance.
        4. READ-ONLY: NEVER generate INSERT, UPDATE, DELETE, ALTER, DROP, or PRAGMA statements. SELECT only.
        
        SCHEMA CONTEXT:
        {schema_context}
        """

        try:
            logger.info(f"Generating SQL for tenant: {tenant_id} | Question: {user_question}")
            
            # Using the beta parse method to enforce our Pydantic schema
            response = await self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_question}
                ],
                response_format=SQLResponse,
                # Mathematical precision: 0.0 temperature ensures deterministic, repeatable SQL
                temperature=0.0,
                max_tokens=1000
            )

            # The .parse() method automatically returns the validated Pydantic object
            parsed_result: SQLResponse = response.choices[0].message.parsed
            
            logger.info(f"Successfully generated SQL for tenant: {tenant_id}")
            return parsed_result

        except Exception as e:
            # Catching and wrapping exceptions to maintain a clean boundary 
            # for the caller route to handle HTTP 500s.
            logger.error(f"NL2SQL Generation failed via {self.model} for tenant {tenant_id}: {str(e)}")
            raise RuntimeError(f"Failed to generate SQL: {str(e)}")

# -------------------------------------------------------------------------
# 3. Dependency Injection Export
# -------------------------------------------------------------------------
# Expose a singleton instance for easy imports across your FastAPI/Flask routes
nl2sql_service = NL2SQLService()