import logging
import json
import time
from typing import List, Dict, Any, Literal, Optional
from pydantic import BaseModel, Field

# Setup structured logger for workspace orchestration
logger = logging.getLogger(__name__)

class RouteDecision(BaseModel):
    """Structured output schema for the agentic routing decision."""
    reasoning: str = Field(
        ..., 
        description="Step-by-step logic for the chosen path."
    )
    route: Literal["GENERAL_CHAT", "ANALYTICAL_QUERY", "COMPLEX_COMPUTATION"] = Field(
        ..., 
        description="The target execution engine based on intent."
    )
    confidence_score: float = Field(
        ..., 
        ge=0.0, le=1.0, 
        description="Confidence level in this routing decision (0.0 to 1.0)."
    )
    required_datasets: List[str] = Field(
        default_factory=list, 
        description="Dataset IDs (UUIDs) strictly required for this interaction."
    )
    recommended_views: List[str] = Field(
        default_factory=list, 
        description="Names of pre-built Gold Tier views (e.g., 'vw_monthly_churn') to use."
    )

class SemanticRouter:
    """
    Phase 3+: Enterprise Agentic Orchestration & Semantic Routing
    
    The 'Central Nervous System' of DataOmen. Evaluates prompts against 
    tenant-specific metadata and routes to the optimal compute layer.
    
    Upgraded Engineering:
    - Confidence Thresholding: Prevents expensive execution of hallucinated routes.
    - Observability: High-precision latency tracking.
    - Smart Summarization: Token-safe entity routing (delegates deep schema mapping to NL2SQL).
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
        Dependency injection for modular orchestration.
        """
        self.llm = llm_client
        self.db = db_client
        self.nl2sql = nl2sql_service
        self.compute = compute_engine
        self.integration_registry = integration_registry or {}
        
        # Enterprise threshold: require high confidence to trigger heavy SQL/ML compute
        self.confidence_threshold = 0.75 

    # ---------------------------------------------------
    # CONTEXT FETCH (Security by Design)
    # ---------------------------------------------------

    async def _fetch_context(self, tenant_id: str, dataset_ids: List[str]) -> Dict[str, Any]:
        """
        Fetches dataset metadata with strict tenant isolation.
        Injects integration-specific semantic views.
        """
        if not dataset_ids:
            return {"raw_schemas": [], "semantic_views": {}}

        try:
            start_time = time.perf_counter()
            
            # Enforce tenant isolation at the query level
            response = (
                self.db.table("datasets")
                .select("id, name, description, schema_metadata, provider")
                .eq("tenant_id", tenant_id)
                .in_("id", dataset_ids)
                .execute()
            )

            datasets = response.data or []
            raw_schemas = []
            semantic_views = {}

            for ds in datasets:
                raw_schemas.append({
                    "id": ds["id"],
                    "name": ds["name"],
                    "description": ds.get("description", ""),
                    "schema_metadata": ds["schema_metadata"]
                })

                # Modular Integration Injection (e.g., Stripe, Shopify predefined metrics)
                provider = ds.get("provider")
                if provider and provider in self.integration_registry:
                    connector = self.integration_registry[provider]
                    semantic_views.update(connector.get_semantic_views())

            elapsed = (time.perf_counter() - start_time) * 1000
            logger.debug(f"[Context] Fetched {len(datasets)} datasets for {tenant_id} in {elapsed:.2f}ms")

            return {
                "raw_schemas": raw_schemas,
                "semantic_views": semantic_views
            }

        except Exception as e:
            logger.error(f"Context retrieval failure for Tenant {tenant_id}: {e}")
            return {"raw_schemas": [], "semantic_views": {}}

    # ---------------------------------------------------
    # TOKEN SAFE SUMMARY (Analytical Efficiency)
    # ---------------------------------------------------

    def _summarize_for_router(self, schemas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Entity-Level Summarization:
        The router doesn't need every column to pick a dataset; it needs intent matching.
        This prevents massive token bloat when users have 100+ column tables.
        """
        summary = []
        for ds in schemas:
            meta = ds.get("schema_metadata", {})
            columns_dict = meta.get("columns", meta) if isinstance(meta, dict) else {}
            
            # Extract high-level types to give the router context without exact mapping
            col_summary = [f"{k} ({v.get('type', 'Unknown')})" if isinstance(v, dict) else k for k, v in list(columns_dict.items())[:15]]
            if len(columns_dict) > 15:
                col_summary.append(f"... and {len(columns_dict) - 15} more columns")

            summary.append({
                "dataset_id": ds["id"],
                "friendly_name": ds["name"],
                "description": ds.get("description", "No description provided."),
                "core_columns_preview": col_summary
            })
        return summary

    # ---------------------------------------------------
    # ROUTER PROMPT (Persona Alignment)
    # ---------------------------------------------------

    def _build_routing_prompt(self, user_prompt: str, context: Dict[str, Any]) -> str:
        """
        Constructs the agentic routing prompt. 
        Forces rigorous confidence scoring.
        """
        summarized = self._summarize_for_router(context["raw_schemas"])
        views = list(context["semantic_views"].keys())

        return f"""
You are the primary intelligence router for DataOmen, an enterprise analytical SaaS.
Your task is to analyze the user's prompt and route it to the optimal execution engine.

ACTIVE WORKSPACE DATASETS:
{json.dumps(summarized, indent=2)}

GOLD TIER SEMANTIC VIEWS (HIGHLY PREFERRED):
{json.dumps(views, indent=2)}

USER PROMPT:
"{user_prompt}"

ROUTING LOGIC & CONSTRAINTS:
1. ANALYTICAL_QUERY: Select this if the user asks for filtering, aggregations, trends, counts, or charts.
   - REQUIREMENT: You MUST include the exact dataset_id in `required_datasets`.
   - PREFERENCE: Use Gold Tier views if they conceptually match.
2. COMPLEX_COMPUTATION: Select this ONLY for machine learning, anomaly detection, or forecasting.
3. GENERAL_CHAT: Select this for conversational interactions, greetings, or if the prompt is entirely unrelated to the active datasets.

Assign a `confidence_score` (0.0 to 1.0). If the user asks a data question but the required dataset is missing from the workspace, score it < 0.5 and route to GENERAL_CHAT.
"""

    def _validate_datasets(self, requested: List[str], context: Dict[str, Any]) -> List[str]:
        """
        Security Layer: Mathematically prevent the LLM from accessing unauthorized dataset IDs.
        """
        valid_ids = {s["id"] for s in context["raw_schemas"]}
        return [ds_id for ds_id in requested if ds_id in valid_ids]

    # ---------------------------------------------------
    # MAIN ORCHESTRATION
    # ---------------------------------------------------

    async def process_interaction(
        self,
        tenant_id: str,
        active_dataset_ids: List[str],
        chat_history: List[Dict[str, Any]],
        user_prompt: str
    ) -> Dict[str, Any]:
        """
        Main entry point. Orchestrates context, dynamic routing, and path delegation.
        """
        logger.info(f"[Orchestrator] Initiating cycle for Tenant: {tenant_id}")
        start_time = time.perf_counter()
        
        context = await self._fetch_context(tenant_id, active_dataset_ids)
        routing_prompt = self._build_routing_prompt(user_prompt, context)

        try:
            decision: RouteDecision = await self.llm.generate_structured(
                prompt=routing_prompt,
                history=chat_history,
                response_model=RouteDecision
            )
            logger.info(f"[Router] {decision.route} chosen with {decision.confidence_score*100:.1f}% confidence. Reasoning: {decision.reasoning}")
        except Exception as e:
            logger.error(f"[Router] Structural parse failure: {e}. Executing safety fallback.")
            decision = RouteDecision(
                reasoning="Safety fallback due to LLM parsing exception.",
                route="GENERAL_CHAT",
                confidence_score=0.0
            )

        # 1. Guardrail: Low Confidence Interception
        if decision.route in ["ANALYTICAL_QUERY", "COMPLEX_COMPUTATION"] and decision.confidence_score < self.confidence_threshold:
            logger.warning(f"[Guardrail] Execution blocked. Confidence {decision.confidence_score} below threshold {self.confidence_threshold}.")
            return {
                "type": "text",
                "message": "I'm not entirely sure which dataset contains the answer to that. Could you clarify your question or make sure the correct data source is active?"
            }

        # 2. Guardrail: Dataset Validation
        decision.required_datasets = self._validate_datasets(decision.required_datasets, context)
        if decision.route in ["ANALYTICAL_QUERY", "COMPLEX_COMPUTATION"] and not decision.required_datasets:
            logger.warning("[Guardrail] Analytical route selected but no valid datasets provided.")
            return {
                "type": "text",
                "message": "I understand what you're asking, but I don't see the required dataset in your current workspace to calculate it."
            }

        # 3. Path Delegation
        try:
            if decision.route == "ANALYTICAL_QUERY":
                result = await self._handle_analytical(tenant_id, decision, context, user_prompt, chat_history)
            elif decision.route == "COMPLEX_COMPUTATION":
                result = await self._handle_compute(tenant_id, decision, context, user_prompt)
            else:
                result = await self._handle_chat(user_prompt, chat_history)
                
        except Exception as e:
            logger.critical(f"[Orchestrator] Fatal execution error in {decision.route}: {str(e)}")
            result = {
                "type": "text",
                "message": "I encountered a system error while trying to process your request. Our engineering team has been notified."
            }

        total_elapsed = (time.perf_counter() - start_time) * 1000
        logger.info(f"[Orchestrator] Interaction completed in {total_elapsed:.2f}ms")
        
        return result

    # ---------------------------------------------------
    # DELEGATED HANDLERS (Hybrid Performance)
    # ---------------------------------------------------

    async def _handle_analytical(
        self,
        tenant_id: str,
        decision: RouteDecision,
        context: Dict[str, Any],
        prompt: str,
        history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Path: SQL Generation -> Vectorized Execution.
        """
        active_views = {
            k: context["semantic_views"][k]
            for k in decision.recommended_views
            if k in context["semantic_views"]
        }

        # Generate SQL via Contextual RAG
        sql, chart = await self.nl2sql.generate_sql(
            prompt=prompt,
            schemas=context["raw_schemas"],
            semantic_views=active_views,
            history=history
        )

        try:
            # Attempt Zero-Copy Execution
            result = await self.compute.execute_read_only(
                tenant_id=tenant_id,
                dataset_ids=decision.required_datasets,
                query=sql,
                injected_views=decision.recommended_views
            )
        except Exception as e:
            logger.warning(f"[Engine] DuckDB Compiler error: {e}. Initiating Phase 4 Auto-Correction.")
            
            # Phase 4: Error Feedback Loop
            sql, _ = await self.nl2sql.correct_sql(
                failed_query=sql,
                error_msg=str(e),
                prompt=prompt,
                schemas=context["raw_schemas"],
                semantic_views=active_views
            )

            # Second attempt
            result = await self.compute.execute_read_only(
                tenant_id=tenant_id,
                dataset_ids=decision.required_datasets,
                query=sql,
                injected_views=decision.recommended_views
            )

        return {
            "type": "chart" if chart else "table",
            "data": result,
            "chart_config": chart,
            "sql_used": sql,
            "message": "Data-driven insight generated successfully."
        }

    async def _handle_compute(
        self,
        tenant_id: str,
        decision: RouteDecision,
        context: Dict[str, Any],
        prompt: str
    ) -> Dict[str, Any]:
        """
        Path: Vectorized ML/Math Pipeline execution.
        """
        result = await self.compute.execute_ml_pipeline(
            tenant_id=tenant_id,
            dataset_ids=decision.required_datasets,
            prompt=prompt,
            schemas=context["raw_schemas"]
        )

        return {
            "type": "ml_result",
            "data": result,
            "message": "Complex analytical modeling applied."
        }

    async def _handle_chat(self, prompt: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Path: General conversational layer.
        """
        reply = await self.llm.generate_text(
            prompt=prompt,
            history=history
        )

        return {
            "type": "text",
            "message": reply
        }