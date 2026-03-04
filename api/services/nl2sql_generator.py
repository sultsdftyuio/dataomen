import os
import logging
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

class NL2SQLGenerator:
    """
    Contextual RAG Service: Converts Natural Language to highly optimized DuckDB SQL.
    Strictly isolated: does not know about the database ORM, only schemas and dataset URIs.
    """
    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning("NL2SQLGenerator: OPENAI_API_KEY is not set in the environment.")
            
        self.client = AsyncOpenAI(api_key=api_key)
        # Defaulting to gpt-4o for high SQL syntactical accuracy and reasoning
        self.model = "gpt-4o" 

    async def generate_sql(self, user_query: str, schema_info: str, file_uri: str) -> str:
        """
        Contextual RAG Implementation: Maps natural language directly to a DuckDB 
        read_parquet statement using only the injected schema metadata.
        """
        prompt = f"""
        You are a senior data engineer and a highly optimized DuckDB SQL generator.
        Generate a strictly valid DuckDB SQL query to answer the user's request.
        
        Dataset URI (Use this strictly in the FROM clause): {file_uri}
        
        Schema (Column Names and Types):
        {schema_info}
        
        User Request: {user_query}
        
        CRITICAL RULES:
        1. ONLY return the raw SQL query. Do not include any explanations or conversational text.
        2. DO NOT include markdown formatting (like ```sql or ```). Just the raw query.
        3. The query MUST read directly from the parquet file using: FROM read_parquet('{file_uri}')
        4. Use vector-friendly aggregations and mathematical precision (e.g., STDDEV, AVG, SUM, MEDIAN) where appropriate.
        5. If the request asks for a time series, order by the date column naturally.
        6. Always ensure column names are quoted if they contain spaces or special characters.
        """
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a backend microservice returning strict DuckDB SQL strings."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0, # Enforces logical precision over creativity
                max_tokens=500
            )
            
            sql = response.choices[0].message.content.strip()
            
            # Sanitization Layer: Strip markdown just in case the LLM disobeys the prompt instructions
            if sql.startswith("```sql"):
                sql = sql[6:]
            if sql.startswith("```"):
                sql = sql[3:]
            if sql.endswith("```"):
                sql = sql[:-3]
                
            return sql.strip()
            
        except Exception as e:
            logger.error(f"LLM SQL Generation failed: {e}")
            raise Exception(f"Failed to map natural language to SQL: {str(e)}")

# Singleton instance for clean Dependency Injection
nl2sql = NL2SQLGenerator()