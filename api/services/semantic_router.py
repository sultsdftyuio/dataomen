# api/services/semantic_router.py

import logging
import json
from typing import List, Dict, Any, Literal, Optional, Union
from pydantic import BaseModel, Field

# Setup structured logger for workspace orchestration
logger = logging.getLogger(__name__)

class RouteDecision(BaseModel):
    """Structured output schema for the agentic routing decision."""
    reasoning: str = Field(..., description="Step-by-step logic for the chosen path.")
    route: Literal["GENERAL_CHAT", "ANALYTICAL_QUERY", "COMPLEX_COMPUTATION"] = Field(
        ..., description="The target execution engine based on intent."
    )
    required_datasets: List[str] = Field(
        default_factory=list, 
        description="Dataset IDs (UUIDs) strictly required for this specific interaction."
    )
    recommended_views: List[str] = Field(
        default_factory=list, 
        description="Names of pre-built Gold Tier views (e.g., 'vw_monthly_churn') to use."
    )

class SemanticRouter:
    """
    Phase 3: Agentic Orchestration & Semantic Routing (Modular Strategy)
    
    The 'Central Nervous System' of DataOmen. Evaluates prompts against 
    tenant-specific metadata and routes to the optimal compute layer.
    
    Methodologies:
    - Orchestration: OO patterns for service management.
    - Security: Strict tenant_id partitioning at the retrieval layer.
    - Efficiency: Token-safe schema summaries for routing decisions.
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
            # Enforce tenant isolation at the query level
            response = (
                self.db.table("datasets")
                .select("id, name, schema_metadata, provider")
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
                    "schema_metadata": ds["schema_metadata"]
                })

                # Modular Integration Injection
                provider = ds.get("provider")
                if provider and provider in self.integration_registry:
                    connector = self.integration_registry[provider]
                    # Fetch 'Gold Tier' views from the specific connector
                    semantic_views.update(connector.get_semantic_views())

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
        Creates a minimal dataset fingerprint to minimize LLM token bloat 
        during the routing decision phase.
        """
        summary = []
        for ds in schemas:
            meta = ds.get("schema_metadata", {})
            # If meta is a dict with 'columns', use that; otherwise fallback
            columns_dict = meta.get("columns", meta) if isinstance(meta, dict) else {}
            cols = list(columns_dict.keys())[:20]

            summary.append({
                "id": ds["id"],
                "name": ds["name"],
                "column_fingerprint": cols
            })
        return summary

    # ---------------------------------------------------
    # ROUTER PROMPT (Persona Alignment)
    # ---------------------------------------------------

    def _build_routing_prompt(self, user_prompt: str, context: Dict[str, Any]) -> str:
        """
        Constructs the agentic routing prompt. 
        Biases the model toward verified 'Gold Tier' views for consistency.
        """
        summarized = self._summarize_for_router(context["raw_schemas"])
        views = list(context["semantic_views"].keys())

        return f"""
You are the intelligence router for DataOmen, a high-performance analytical SaaS.
Analyze the prompt and available context to select the optimal execution route.

ACTIVE WORKSPACE DATASETS:
{json.dumps(summarized, indent=2)}

GOLD TIER SEMANTIC VIEWS (HIGHLY PREFERRED):
{json.dumps(views, indent=2)}

USER PROMPT:
"{user_prompt}"

ROUTING LOGIC:
1. ANALYTICAL_QUERY: Filtering, aggregations, trends, or visuals. 
   - REQUIREMENT: Use Gold Tier views if they conceptually match the requested metric.
2. COMPLEX_COMPUTATION: ML forecasting, anomaly detection, or advanced linear algebra using Pandas/Polars.
3. GENERAL_CHAT: Conversational help or methodology questions.

Deliver a structured decision based on the 'Best Path' for engineering efficiency.
"""

    def _validate_datasets(self, requested: List[str], context: Dict[str, Any]) -> List[str]:
        """
        Security Layer: Prevents LLM hallucinations from requesting non-existent 
        or cross-tenant dataset IDs.
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
        Main entry point for interactions. Orchestrates context, routing, and delegation.
        """
        logger.info(f"[Orchestration] Processing interaction for Tenant: {tenant_id}")
        
        context = await self._fetch_context(tenant_id, active_dataset_ids)
        routing_prompt = self._build_routing_prompt(user_prompt, context)

        try:
            decision: RouteDecision = await self.llm.generate_structured(
                prompt=routing_prompt,
                history=chat_history,
                response_model=RouteDecision
            )
            logger.info(f"[Router] Decision: {decision.route} | Reasoning: {decision.reasoning}")
        except Exception as e:
            logger.error(f"[Router] Decision failure: {e}. Defaulting to Chat.")
            decision = RouteDecision(
                reasoning="Safety fallback due to routing exception.",
                route="GENERAL_CHAT"
            )

        # Sanitize datasets before delegation
        decision.required_datasets = self._validate_datasets(decision.required_datasets, context)

        # Path Delegation
        if decision.route == "ANALYTICAL_QUERY":
            return await self._handle_analytical(tenant_id, decision, context, user_prompt, chat_history)

        if decision.route == "COMPLEX_COMPUTATION":
            return await self._handle_compute(tenant_id, decision, context, user_prompt)

        return await self._handle_chat(user_prompt, chat_history)

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
        Includes a deterministic self-correction turn for compiler errors.
        """
        active_views = {
            k: context["semantic_views"][k]
            for k in decision.recommended_views
            if k in context["semantic_views"]
        }

        # Generate SQL (Contextual RAG)
        sql, chart = await self.nl2sql.generate_sql(
            prompt=prompt,
            schemas=context["raw_schemas"],
            semantic_views=active_views,
            history=history
        )

        try:
            result = await self.compute.execute_read_only(
                tenant_id=tenant_id,
                dataset_ids=decision.required_datasets,
                query=sql,
                injected_views=decision.recommended_views
            )
        except Exception as e:
            logger.warning(f"[Engine] Execution error: {e}. Triggering auto-correction.")
            
            # Phase 4: Error Feedback Loop
            sql, _ = await self.nl2sql.correct_sql(
                failed_query=sql,
                error_msg=str(e),
                prompt=prompt,
                schemas=context["raw_schemas"],
                semantic_views=active_views
            )

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