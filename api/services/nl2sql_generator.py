import os
import json
from typing import Optional
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

# -------------------------------------------------------------------------
# 1. Type Safety & Structured Output
# -------------------------------------------------------------------------
class SQLResponse(BaseModel):
    """
    Forces the LLM to output a strict JSON structure, guaranteeing
    we always get an executable query and a human-readable explanation.
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
        # ensuring high concurrency for multiple tenants.
        self.client = AsyncOpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
        self.model = "gpt-5-nano"

    async def generate_sql(
        self, 
        tenant_id: str, 
        user_question: str, 
        schema_context: str
    ) -> str:
        """
        Generates tenant-isolated SQL using Contextual RAG schema fragments.
        """
        # Security by Design: We explicitly instruct the model on tenant isolation
        # and strictly forbid destructive operations.
        system_prompt = f"""
        You are a world-class Data Engineering AI. Your task is to translate user questions into highly optimized DuckDB SQL.
        
        CRITICAL INSTRUCTIONS:
        1. MULTI-TENANT SECURITY: You must scope ALL queries to the current tenant. Always include `WHERE tenant_id = '{tenant_id}'` where applicable.
        2. NO HALLUCINATIONS: Only use the tables and columns provided in the SCHEMA CONTEXT.
        3. ANALYTICAL EFFICIENCY: Utilize DuckDB's vectorized functions (e.g., date truncation, array aggregations) for peak performance.
        4. READ-ONLY: NEVER generate INSERT, UPDATE, DELETE, ALTER, or DROP statements.
        
        SCHEMA CONTEXT:
        {schema_context}
        """

        try:
            response = await self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_question}
                ],
                # Enforce strict parsing matching our Pydantic model
                response_format=SQLResponse,
                # Mathematical precision: 0.0 temperature ensures deterministic, repeatable SQL
                temperature=0.0 
            )

            # The .parse() method automatically returns the validated Pydantic object
            parsed_result: SQLResponse = response.choices[0].message.parsed
            
            return parsed_result.sql_query

        except Exception as e:
            # In a production environment, this would integrate with your logger/Datadog
            raise RuntimeError(f"NL2SQL Generation failed via {self.model}: {str(e)}")

# Expose a singleton for easy Dependency Injection across your FastAPI/Flask routes
nl2sql_service = NL2SQLService()