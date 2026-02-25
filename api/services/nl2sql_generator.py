# api/services/nl2sql_generator.py
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from openai import OpenAI

# 1. Strict Output Schemas
class ChartConfig(BaseModel):
    """Instructs the frontend on exactly how to map the DuckDB data to Recharts."""
    type: str = Field(
        description="The type of chart. Allowed values: 'bar_chart', 'line_chart', 'pie_chart', 'single_value', 'table'"
    )
    x_axis: Optional[str] = Field(
        None, description="The exact column name to use for the X-axis (if applicable)."
    )
    y_axis: Optional[str] = Field(
        None, description="The exact column name to use for the Y-axis (if applicable)."
    )

class NL2SQLResponse(BaseModel):
    """The master JSON object the LLM is forced to return."""
    thought_process: str = Field(
        description="A brief, one-sentence explanation of the logic behind the SQL query."
    )
    sql_query: str = Field(
        description="The exact, read-only DuckDB SQL query. MUST use 'FROM dataset_table'."
    )
    chart_config: ChartConfig

# 2. The Service Class
class NL2SQLGenerator:
    """
    Orchestrates the translation of a user's natural language question into 
    executable DuckDB SQL and deterministic chart configurations using GPT-5 Nano.
    """
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)
        # Swapped to gpt-5-nano for maximum speed and cost-efficiency
        self.model = "gpt-5-nano"

    def _build_system_prompt(self, schema_context: List[Dict[str, Any]]) -> str:
        """Pure function to format the narrowed schema into the system prompt."""
        schema_str = "\n".join(
            [f"- {col['name']} ({col['type']}): {col['description']}" for col in schema_context]
        )

        return f"""
        You are a world-class Data Analyst and DuckDB SQL expert.
        Your job is to translate the user's question into a highly optimized, read-only SQL query.
        
        You will query a virtual table named exactly: `dataset_table`.
        
        Here are the ONLY columns available to you based on the user's dataset:
        {schema_str}
        
        RULES:
        1. NEVER hallucinate column names. Only use what is provided above.
        2. ALWAYS use `FROM dataset_table`.
        3. If calculating dates/times, assume standard ISO 8601 formatting.
        4. Do NOT use markdown formatting in your response. Return strictly the requested JSON structure.
        """

    def generate_payload(self, user_query: str, schema_context: List[Dict[str, Any]]) -> NL2SQLResponse:
        """
        Executes the prompt using OpenAI's Structured Outputs feature.
        """
        system_prompt = self._build_system_prompt(schema_context)

        completion = self.client.beta.chat.completions.parse(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_query}
            ],
            response_format=NL2SQLResponse,
            # Note: GPT-5 nano supports native structured parsing flawlessly
            temperature=0.0 
        )

        return completion.choices[0].message.parsed