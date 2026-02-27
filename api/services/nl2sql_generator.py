import os
import duckdb
from typing import List, Dict, Any
from pydantic import BaseModel
from openai import AsyncOpenAI
from sqlalchemy.orm import Session
from pathlib import Path

from models import Dataset

STORAGE_DIR = Path("./storage")

class QueryResult(BaseModel):
    """Type-safe return schema for Interaction (Frontend) consumption."""
    sql_executed: str
    data: List[Dict[str, Any]]

class NL2SQLGenerator:
    """
    Service converting natural language into precise analytical DuckDB queries.
    Uses Contextual RAG to prevent hallucination and Read-Only connections for security.
    """
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        # Assumes OPENAI_API_KEY is available in the environment variables
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def _get_schema_fragment(self, parquet_path: str) -> str:
        """
        Extracts strictly the schema types to prevent LLM token bloat.
        Contextual RAG: We only need column names and types, not the data itself.
        """
        with duckdb.connect() as conn:
            # Describe returns column_name, column_type, null, key, default, extra
            schema_df = conn.execute(f"DESCRIBE SELECT * FROM '{parquet_path}'").df()
            return schema_df[['column_name', 'column_type']].to_string(index=False)

    async def generate_and_execute(self, dataset_id: str, natural_query: str) -> QueryResult:
        """
        Orchestrates LLM query generation and DuckDB in-memory execution.
        """
        # 1. Security by Design: Verify tenant owns the requested dataset
        dataset = self.db.query(Dataset).filter(
            Dataset.id == dataset_id,
            Dataset.tenant_id == self.tenant_id
        ).first()
        
        if not dataset:
            raise ValueError("Dataset not found or access denied.")

        parquet_path = STORAGE_DIR / self.tenant_id / f"{dataset.id}.parquet"
        if not parquet_path.exists():
            raise FileNotFoundError("Underlying data file is missing or corrupted.")

        # 2. Contextual RAG Injection
        schema_context = self._get_schema_fragment(str(parquet_path))

        system_prompt = f"""You are an elite, highly precise DuckDB SQL Data Analyst.
        Write a strictly compliant SQL query to answer the user's question based on the exact schema provided below.
        
        RULES:
        1. The data is located at the file path: '{parquet_path}'
        2. You MUST wrap the file path in single quotes in your FROM clause (e.g., FROM '{parquet_path}').
        3. Do NOT invent columns. Only use the columns listed in the schema.
        4. Respond ONLY with the raw SQL code. No markdown formatting, no backticks, no explanations.
        
        SCHEMA:
        {schema_context}
        """

        # 3. Request LLM Inference
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini", # Opting for high-speed, cost-effective reasoning
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": natural_query}
            ],
            temperature=0.0 # Mathematical Precision: 0.0 prevents creative SQL syntax
        )

        generated_sql = response.choices[0].message.content.strip()
        # Fallback strip in case the LLM disobeys the "no markdown" rule
        generated_sql = generated_sql.replace("```sql", "").replace("```", "").strip()

        # 4. Computation (Execution)
        try:
            # Multi-tenant Security: 'read_only': True explicitly blocks DROP/DELETE/INSERT commands
            with duckdb.connect(config={'read_only': True}) as conn:
                # Execute and instantly dump to a Pandas DataFrame (vectorized memory)
                result_df = conn.execute(generated_sql).df()
                
                # Vectorization over loops: Convert DataFrame to standard dicts for JSON serialization
                data = result_df.to_dict(orient="records")
                
                return QueryResult(sql_executed=generated_sql, data=data)
                
        except duckdb.Error as e:
            raise RuntimeError(f"Generated SQL execution failed: {e}\nSQL Executed: {generated_sql}")
        except Exception as e:
            raise RuntimeError(f"Unexpected computation error: {e}")