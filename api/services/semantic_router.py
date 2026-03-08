import logging
import json
from typing import List, Dict, Any, Literal
from pydantic import BaseModel, Field

# Setup structured logger
logger = logging.getLogger(__name__)

class RouteDecision(BaseModel):
    """Structured output schema for the LLM routing decision."""
    reasoning: str = Field(
        ..., 
        description="Step-by-step reasoning for the routing decision based on the user's request."
    )
    route: Literal["GENERAL_CHAT", "ANALYTICAL_QUERY", "COMPLEX_COMPUTATION"] = Field(
        ..., 
        description="The selected execution route based on the user's prompt and active context."
    )
    required_datasets: List[str] = Field(
        default_factory=list,
        description="List of dataset IDs needed to fulfill the request, derived from the active context."
    )

class SemanticRouter:
    """
    Phase 3: Agentic Orchestration & Semantic Routing
    
    Evaluates user prompts against active dataset metadata and routes them to the appropriate
    execution engine (NL2SQL, Python/Math ML, or General Chat). Uses Contextual RAG to prevent
    hallucinations by strictly passing schema definitions, not raw Parquet data.
    """

    def __init__(self, llm_client: Any, db_client: Any, nl2sql_service: Any, compute_engine: Any):
        """
        Dependency injection of required clients and downstream modular services.
        """
        self.llm = llm_client
        self.db = db_client
        self.nl2sql = nl2sql_service
        self.compute = compute_engine

    async def _fetch_contextual_schemas(self, tenant_id: str, dataset_ids: List[str]) -> List[Dict[str, Any]]:
        """
        Retrieves lightweight profiles (metadata, schemas, min/max values) for active datasets.
        Enforces tenant isolation by validating tenant_id at the query level.
        """
        if not dataset_ids:
            return []
            
        try:
            # Supabase query mapped to tenant scope
            response = self.db.table("datasets") \
                .select("id, name, schema_metadata") \
                .eq("tenant_id", tenant_id) \
                .in_("id", dataset_ids) \
                .execute()
                
            return response.data if response.data else []
        except Exception as e:
            logger.error(f"Failed to fetch schemas for tenant {tenant_id}: {str(e)}")
            return []

    def _build_routing_prompt(self, user_prompt: str, schemas: List[Dict[str, Any]]) -> str:
        """
        Constructs the Context-Constrained Prompt for the router.
        """
        schema_context = json.dumps(schemas, indent=2) if schemas else "No active datasets in context."
        
        return f"""
        You are the intelligent router for a high-performance analytical SaaS.
        Evaluate the user's prompt against the active dataset schemas and decide the execution route.
        
        ACTIVE DATASET SCHEMAS:
        {schema_context}
        
        USER PROMPT:
        "{user_prompt}"
        
        ROUTING RULES:
        1. ANALYTICAL_QUERY: Filtering, grouping, aggregations, basic stats, or visualizations.
        2. COMPLEX_COMPUTATION: Advanced mathematics, ML, forecasting (e.g., EMA), or anomaly detection.
        3. GENERAL_CHAT: Greetings, methodology questions, or general conversation.
        """

    async def process_interaction(
        self, 
        tenant_id: str, 
        active_dataset_ids: List[str], 
        chat_history: List[Dict[str, Any]], 
        user_prompt: str
    ) -> Dict[str, Any]:
        """
        Main entry point for the Unified Workspace interaction layer.
        """
        logger.info(f"[Tenant: {tenant_id}] Processing interaction | Initiating semantic route.")
        
        # 1. Load active context (Schemas only, NO raw data)
        schemas = await self._fetch_contextual_schemas(tenant_id, active_dataset_ids)
        routing_prompt = self._build_routing_prompt(user_prompt, schemas)
        
        # 2. Ask LLM to make a routing decision using Structured Outputs
        try:
            decision: RouteDecision = await self.llm.generate_structured(
                prompt=routing_prompt,
                history=chat_history,
                response_model=RouteDecision
            )
            logger.info(f"Router Decision: {decision.route} | Reason: {decision.reasoning}")
        except Exception as e:
            logger.error(f"Routing failed, falling back to general chat: {str(e)}")
            decision = RouteDecision(
                reasoning="Fallback triggered due to router exception.",
                route="GENERAL_CHAT",
                required_datasets=[]
            )

        # 3. Orchestrate execution based on the chosen path
        if decision.route == "ANALYTICAL_QUERY":
            return await self._handle_analytical_query(tenant_id, decision, schemas, user_prompt, chat_history)
            
        elif decision.route == "COMPLEX_COMPUTATION":
            return await self._handle_complex_computation(tenant_id, decision, schemas, user_prompt)
            
        else:
            return await self._handle_general_chat(user_prompt, chat_history)

    async def _handle_analytical_query(
        self, 
        tenant_id: str, 
        decision: RouteDecision, 
        schemas: List[Dict[str, Any]], 
        user_prompt: str,
        chat_history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Path B: Route to NL2SQL Generator and safely execute in DuckDB.
        Includes an automatic Error Feedback Loop.
        """
        sql_query, chart_spec = await self.nl2sql.generate_sql(
            prompt=user_prompt, 
            schemas=schemas, 
            history=chat_history
        )
        
        try:
            execution_result = await self.compute.execute_read_only(
                tenant_id=tenant_id,
                dataset_ids=decision.required_datasets,
                query=sql_query
            )
            
            return {
                "type": "chart" if chart_spec else "table",
                "data": execution_result,
                "chart_config": chart_spec,
                "sql_used": sql_query,
                "message": "Data processed successfully."
            }
            
        except Exception as e:
            # Error Feedback Loop: The LLM hallucinated or wrote bad SQL. Catch it and auto-correct.
            logger.warning(f"DuckDB execution failed. Entering auto-correction loop. Error: {str(e)}")
            corrected_query, _ = await self.nl2sql.correct_sql(sql_query, str(e), schemas)
            
            try:
                execution_result = await self.compute.execute_read_only(
                    tenant_id=tenant_id,
                    dataset_ids=decision.required_datasets,
                    query=corrected_query
                )
                
                return {
                    "type": "table",
                    "data": execution_result,
                    "sql_used": corrected_query,
                    "message": "I encountered an error but managed to self-correct the query."
                }
            except Exception as nested_error:
                logger.error(f"Auto-correction failed: {str(nested_error)}")
                return {
                    "type": "error",
                    "data": None,
                    "message": "I couldn't process the data due to a complex query error. Please refine your request."
                }

    async def _handle_complex_computation(
        self, 
        tenant_id: str, 
        decision: RouteDecision, 
        schemas: List[Dict[str, Any]], 
        user_prompt: str
    ) -> Dict[str, Any]:
        """
        Path C: Math/ML Code execution. 
        Delegates to the compute engine for vectorized Pandas/Polars execution.
        """
        result = await self.compute.execute_ml_pipeline(
            tenant_id=tenant_id,
            dataset_ids=decision.required_datasets,
            prompt=user_prompt,
            schemas=schemas
        )
        return {
            "type": "ml_result",
            "data": result,
            "message": "Applied complex analytical modeling to your data."
        }

    async def _handle_general_chat(
        self, 
        user_prompt: str, 
        chat_history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Path A: Standard conversational response.
        """
        reply = await self.llm.generate_text(
            prompt=user_prompt,
            history=chat_history
        )
        return {
            "type": "text",
            "data": None,
            "message": reply
        }