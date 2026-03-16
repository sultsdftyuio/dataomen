import json
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field, ValidationError

# Use the modern standard async client
import openai
from openai import AsyncOpenAI 

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Strict Data Contracts (The Output Format)
# -------------------------------------------------------------------------

class QueryStep(BaseModel):
    step_number: int = Field(..., description="The sequential execution order, starting at 1.")
    operation: str = Field(..., description="Standardized operation: FILTER, AGGREGATE, JOIN, WINDOW, SORT, LIMIT, CALCULATION")
    description: str = Field(..., description="Explicit instruction for the SQL generator. e.g., 'Group by customer_id and sum the amount'")
    columns_involved: List[str] = Field(..., description="Exact column names required from the schema for this step.")

class QueryPlan(BaseModel):
    intent: str = Field(..., description="The overall analytical goal (e.g., 'Cohort Analysis', 'Time-Series Trend', 'Anomaly Investigation')")
    is_achievable: bool = Field(..., description="True if the provided schema contains the necessary data to answer the prompt.")
    missing_data_reason: Optional[str] = Field(default=None, description="If is_achievable is False, explain to the user exactly what data is missing.")
    steps: List[QueryStep] = Field(..., description="The ordered sequence of logical operations to achieve the intent.")
    suggested_visualizations: List[str] = Field(..., description="e.g., 'line_chart', 'bar_chart', 'scatter_plot', 'metric_card'")

# -------------------------------------------------------------------------
# The Planner Agent
# -------------------------------------------------------------------------

class QueryPlanner:
    """
    The 'Lead Engineer' Agent.
    
    Adheres to the Contextual RAG Methodology:
    Takes a natural language prompt and a strict schema subset, and outputs 
    a deterministic, multi-step logical plan for the NL2SQL generator to follow.
    """

    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.llm_client = AsyncOpenAI(api_key=api_key)
        self.model = model 

    async def generate_plan(self, user_prompt: str, schema_context: Dict[str, Dict[str, str]], tenant_id: str) -> QueryPlan:
        """
        Translates a business question into an actionable, step-by-step analytical plan.
        
        :param user_prompt: e.g., "Show me MRR churn for last month."
        :param schema_context: Dictionary mapping table names to their columns and DuckDB types.
        :param tenant_id: For audit logging and telemetry.
        """
        logger.info(f"[{tenant_id}] Generating multi-step query plan for prompt: '{user_prompt[:50]}...'")

        # Contextual RAG: We only inject the exact schemas authorized for this dataset
        formatted_schema = json.dumps(schema_context, indent=2)

        # Using XML-like tags (<schema_context>) prevents the LLM from confusing instructions with data
        system_prompt = f"""
        You are an elite Lead Data Engineer for an enterprise SaaS platform.
        Your job is to take a business user's request and map it to a logical execution plan based EXACTLY on the provided database schema.
        
        Rules:
        1. You must ONLY reference tables and columns that exist in the Schema Context.
        2. Break complex requests (like cohort retention or rolling averages) into multiple logical steps (e.g., Step 1: Filter date, Step 2: Calculate baseline, Step 3: Join and compare).
        3. If the user asks for a metric that is impossible to calculate given the schema, set 'is_achievable' to false and explain why.
        
        <schema_context>
        {formatted_schema}
        </schema_context>
        """

        try:
            # We enforce Strict Structured Outputs via the beta parse method.
            # This mathematically guarantees the LLM returns our exact Pydantic model.
            response = await self.llm_client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=QueryPlan, 
                temperature=0.0 # Zero temperature for maximum deterministic logical planning
            )

            # Extract the automatically validated Pydantic object
            plan = response.choices[0].message.parsed
            
            # Edge case handling if parsing is refused due to content filters
            if plan is None:
                raise ValueError("Model refused to generate a valid plan.")
            
            if not plan.is_achievable:
                logger.warning(f"[{tenant_id}] Unachievable query plan. Missing: {plan.missing_data_reason}")
                
            return plan

        except ValidationError as ve:
            # This should be exceedingly rare with beta.parse, but guarantees safety
            logger.error(f"[{tenant_id}] Query Planner Output Validation failed: {str(ve)}")
            raise ValueError("The AI generated a malformed execution plan.") from ve
            
        except openai.OpenAIError as oe:
            logger.error(f"[{tenant_id}] OpenAI API Error during planning: {str(oe)}")
            raise ValueError("Failed to communicate with the planning engine.") from oe

    def explain_plan_to_user(self, plan: QueryPlan) -> str:
        """
        Optional UX Helper: Converts the strict JSON plan back into a friendly
        status message for the frontend so the user knows what the AI is doing 
        while they wait for the SQL execution.
        """
        if not plan.is_achievable:
            return f"I can't answer that right now. {plan.missing_data_reason}"
            
        steps_desc = [f"{step.step_number}. {step.description}" for step in plan.steps]
        joined_steps = "\n".join(steps_desc)
        
        return f"I'm running a {plan.intent}. Here is my execution plan:\n{joined_steps}"