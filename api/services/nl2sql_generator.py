import os
import duckdb
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from pathlib import Path

from models import Dataset

logger = logging.getLogger(__name__)

STORAGE_DIR = Path("./storage")

# --- Structured Output Schemas ---
class WidgetLayout(BaseModel):
    w: int = Field(description="Width of widget on a 12-column grid (1-12)")
    h: int = Field(description="Height of widget (relative units, typically 2 to 4)")

class DashboardWidget(BaseModel):
    id: str
    type: str = Field(description="One of: kpi, bar_chart, line_chart, pie_chart, table")
    title: str
    sql: str = Field(description="DuckDB compatible SQL query to fetch data for this widget")
    xAxis: Optional[str] = Field(default=None, description="Column name for the X-axis")
    yAxis: Optional[List[str]] = Field(default=None, description="Column names for the Y-axis metrics")
    layout: WidgetLayout
    data: Optional[List[Dict[str, Any]]] = None

class DashboardConfig(BaseModel):
    title: str = Field(description="Title of the overall dashboard")
    widgets: List[DashboardWidget]


class NL2SQLGenerator:
    """
    Modular AI service responsible for translating natural language into 
    Generative Dashboard configurations.
    """
    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    async def generate_dashboard_config(
        self, 
        prompt: str, 
        schema_context: str
    ) -> DashboardConfig:
        """
        Uses OpenAI structured outputs to generate a multi-widget dashboard 
        configuration based on the user's analytical intent and the specific dataset schema.
        """
        system_prompt = f"""
        You are an expert Data Architect and UI Designer.
        Your task is to analyze the user's intent and generate a comprehensive 
        dashboard configuration JSON.
        
        The user has uploaded a dataset with the following schema:
        {schema_context}
        
        Rules for SQL Generation:
        - Strictly use DuckDB SQL syntax.
        - The table name is 'data_table'.
        - Ensure correct aggregations (e.g., SUM, AVG) and grouping.
        
        Rules for Dashboard Layout:
        - Provide 1-4 'kpi' cards for high-level metrics (layout.w: 3).
        - Provide 'line_chart' or 'bar_chart' for time-series / trends (layout.w: 6 or 12).
        - Provide 'table' or 'pie_chart' for categorical breakdown.
        - Grid is 12 columns wide. 'layout.w' indicates how many columns a widget spans.
        """
        
        try:
            response = await self.client.beta.chat.completions.parse(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                response_format=DashboardConfig,
                temperature=0.1
            )
            return response.choices[0].message.parsed
        except Exception as e:
            logger.error(f"Failed to generate dashboard config: {e}")
            raise

    async def execute_dashboard(
        self, 
        dataset: Dataset, 
        prompt: str
    ) -> dict:
        """
        Orchestrates generating the dashboard config and safely executing 
        the SQL for each widget directly against the Parquet file.
        """
        schema_context = dataset.schema_inferred or "No schema available."
        
        # 1. Generate the Config (LLM)
        dashboard_config = await self.generate_dashboard_config(prompt, schema_context)
        
        # 2. Connect to DuckDB & Mount Parquet Module
        file_path = STORAGE_DIR / str(dataset.tenant_id) / f"{dataset.id}.parquet"
        if not file_path.exists():
            raise FileNotFoundError(f"Parquet file not found at {file_path}")

        conn = duckdb.connect(database=':memory:')
        conn.execute(f"CREATE VIEW data_table AS SELECT * FROM read_parquet('{file_path}')")
        
        # 3. Vectorized execution for each widget
        for widget in dashboard_config.widgets:
            try:
                # Security boundary: Block destructive commands
                if any(kw in widget.sql.upper() for kw in ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER']):
                    raise ValueError("Disallowed SQL keyword detected. Read-only permitted.")
                
                # Computation Performance: Fetch DataFrame, convert cleanly
                df = conn.execute(widget.sql).fetchdf()
                
                # Replace NaNs/NaNs from Pandas to satisfy JSON standards
                df = df.fillna(0) 
                widget.data = df.to_dict(orient='records')
                
            except Exception as e:
                logger.error(f"Error executing SQL for widget {widget.id}: {e}")
                widget.data = [{"error": str(e)}]
        
        conn.close()
        # Return dict serialization of the Pydantic object
        return dashboard_config.model_dump()