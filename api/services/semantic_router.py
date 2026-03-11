# api/services/semantic_router.py

import logging
import json
from typing import List, Dict, Any, Literal, Optional
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
    recommended_views: List[str] = Field(
        default_factory=list,
        description="List of specific Gold Tier semantic view names (e.g., 'vw_stripe_mrr') best suited for this query."
    )

class SemanticRouter:
    """
    Phase 3: Agentic Orchestration & Semantic Routing
    
    Evaluates user prompts against active dataset metadata and routes them to the appropriate
    execution engine (NL2SQL, Python/Math ML, or General Chat). Uses Contextual RAG to inject
    pre-built 'Gold Layer' semantic views to prevent analytical hallucinations.
    """

    def __init__(
        self, 
        llm_client: Any, 
        db_client: Any, 
        nl2sql_service: Any, 
        compute_engine: Any,
        integration_registry: Optional[Dict[str, Any]] = None
    ):
        """
        Dependency injection of required clients and downstream modular services.
        :param integration_registry: Dictionary mapping providers to their connector classes (e.g., {'stripe': StripeIntegration})
        """
        self.llm = llm_client
        self.db = db_client
        self.nl2sql = nl2sql_service
        self.compute = compute_engine
        self.integration_registry = integration_registry or {}

    async def _fetch_contextual_schemas(self, tenant_id: str, dataset_ids: List[str]) -> Dict[str, Any]:
        """
        Retrieves lightweight profiles (metadata, schemas, min/max values) for active datasets.
        Dynamically cross-references the integration registry to inject 'Secret Sauce' semantic views.
        Enforces tenant isolation by validating tenant_id at the query level.
        """
        if not dataset_ids:
            return {"raw_schemas": [], "semantic_views": {}}
            
        try:
            # Supabase query mapped to tenant scope, fetching provider to map to integrations
            response = self.db.table("datasets") \
                .select("id, name, schema_metadata, provider") \
                .eq("tenant_id", tenant_id) \
                .in_("id", dataset_ids) \
                .execute()
                
            datasets = response.data if response.data else []
            
            raw_schemas = []
            semantic_views = {}
            
            for ds in datasets:
                raw_schemas.append({
                    "id": ds["id"],
                    "name": ds["name"],
                    "schema": ds["schema_metadata"]
                })
                
                # Dynamically inject pre-built DuckDB views if this dataset comes from a known SaaS integration
                provider = ds.get("provider")
                if provider and provider in self.integration_registry:
                    connector = self.integration_registry[provider]
                    views = connector.get_semantic_views()
                    semantic_views.update(views)
                    
            return {
                "raw_schemas": raw_schemas,
                "semantic_views": semantic_views
            }
            
        except Exception as e:
            logger.error(f"Failed to fetch schemas for tenant {tenant_id}: {str(e)}")
            return {"raw_schemas": [], "semantic_views": {}}

    def _summarize_schemas_for_routing(self, raw_schemas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        TOKEN BLOAT DEFENSE: 
        The router only needs to know what tables exist and their general structure to make a routing decision. 
        We strip out deeply nested types to save tokens and prevent LLM confusion.
        """
        summary = []
        for schema in raw_schemas:
            schema_dict = schema.get("schema", {})
            # Extract just the top-level column names, capping at 30 to prevent massive prompt injections
            sample_cols = list(schema_dict.keys())[:30] if isinstance(schema_dict, dict) else []
            summary.append({
                "id": schema["id"],
                "name": schema["name"],
                "columns_sample": sample_cols
            })
        return summary

    def _build_routing_prompt(self, user_prompt: str, context: Dict[str, Any]) -> str:
        """
        Constructs the Context-Constrained Prompt for the router.
        Heavily biases the LLM toward using 'Gold Tier' semantic views for analytical tasks.
        """
        # Inject the summarized schema, NOT the raw schema, to save tokens
        summarized_schemas = self._summarize_schemas_for_routing(context.get("raw_schemas", []))
        
        raw_schemas_json = json.dumps(summarized_schemas, indent=2) if summarized_schemas else "No active raw datasets."
        semantic_views_json = json.dumps(list(context.get("semantic_views", {}).keys()), indent=2) if context.get("semantic_views") else "No pre-built views available."
        
        return f"""
        You are the intelligent router for a high-performance analytical SaaS.
        Evaluate the user's prompt against the active dataset schemas and decide the execution route.
        
        ACTIVE DATASETS (Summarized):
        {raw_schemas_json}
        
        GOLD TIER SEMANTIC VIEWS (HIGHLY PREFERRED):
        These are pre-calculated, verified DuckDB views representing complex metrics (e.g., MRR, Revenue).
        If the user asks for a metric conceptually represented here, you MUST recommend the relevant view.
        Available Views: {semantic_views_json}
        
        USER PROMPT:
        "{user_prompt}"
        
        ROUTING RULES:
        1. ANALYTICAL_QUERY: Filtering, grouping, aggregations, basic stats, visualizations, or querying GOLD TIER views.
        2. COMPLEX_COMPUTATION: Advanced mathematics, ML, forecasting (e.g., EMA), or anomaly detection requiring Pandas/Polars.
        3. GENERAL_CHAT: Greetings, methodology questions, or general conversation not requiring data.
        
        If selecting ANALYTICAL_QUERY and a Gold Tier view matches the intent, include it in 'recommended_views'.
        """

    def _validate_requested_datasets(self, requested_ids: List[str], context: Dict[str, Any]) -> List[str]:
        """
        Security Layer: Prevents LLM hallucinations from attempting to query datasets 
        that either don't exist or belong to another tenant.
        """
        valid_ids = {schema["id"] for schema in context.get("raw_schemas", [])}
        return [ds_id for ds_id in requested_ids if ds_id in valid_ids]

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
        
        # 1. Load active context (Schemas and Pre-Built Semantic Views ONLY)
        context = await self._fetch_contextual_schemas(tenant_id, active_dataset_ids)
        routing_prompt = self._build_routing_prompt(user_prompt, context)
        
        # 2. Ask LLM to make a routing decision using Structured Outputs
        try:
            decision: RouteDecision = await self.llm.generate_structured(
                prompt=routing_prompt,
                history=chat_history,
                response_model=RouteDecision
            )
            logger.info(f"Router Decision: {decision.route} | Views: {decision.recommended_views} | Reason: {decision.reasoning}")
        except Exception as e:
            logger.error(f"Routing failed, falling back to general chat: {str(e)}")
            decision = RouteDecision(
                reasoning="Fallback triggered due to router exception.",
                route="GENERAL_CHAT",
                required_datasets=[],
                recommended_views=[]
            )

        # Pre-filter requested datasets to eliminate LLM hallucinations
        decision.required_datasets = self._validate_requested_datasets(decision.required_datasets, context)

        # 3. Orchestrate execution based on the chosen path
        if decision.route == "ANALYTICAL_QUERY":
            return await self._handle_analytical_query(tenant_id, decision, context, user_prompt, chat_history)
            
        elif decision.route == "COMPLEX_COMPUTATION":
            return await self._handle_complex_computation(tenant_id, decision, context, user_prompt)
            
        else:
            return await self._handle_general_chat(user_prompt, chat_history)

    async def _handle_analytical_query(
        self, 
        tenant_id: str, 
        decision: RouteDecision, 
        context: Dict[str, Any], 
        user_prompt: str,
        chat_history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Path B: Route to NL2SQL Generator and safely execute in DuckDB.
        Passes the full, uncompressed raw_schemas to the execution generator.
        """
        active_views = {k: context["semantic_views"][k] for k in decision.recommended_views if k in context["semantic_views"]}
        
        sql_query, chart_spec = await self.nl2sql.generate_sql(
            prompt=user_prompt, 
            schemas=context["raw_schemas"], 
            semantic_views=active_views,
            history=chat_history
        )
        
        try:
            execution_result = await self.compute.execute_read_only(
                tenant_id=tenant_id,
                dataset_ids=decision.required_datasets,
                query=sql_query,
                injected_views=decision.recommended_views  # Tells compute engine to map these CTEs
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
            
            corrected_query, _ = await self.nl2sql.correct_sql(
                failed_query=sql_query, 
                error_msg=str(e), 
                prompt=user_prompt,
                schemas=context["raw_schemas"],
                semantic_views=active_views # Essential: pass the views context to prevent self-correction failure
            )
            
            try:
                execution_result = await self.compute.execute_read_only(
                    tenant_id=tenant_id,
                    dataset_ids=decision.required_datasets,
                    query=corrected_query,
                    injected_views=decision.recommended_views
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
        context: Dict[str, Any], 
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
            schemas=context["raw_schemas"] # The compute engine needs full schema definition
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