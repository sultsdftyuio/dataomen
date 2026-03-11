# api/services/diagnostic_service.py

import logging
import json
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class DiagnosticService:
    """
    Phase 1: Diagnostic RAG Pipeline
    
    Acts as an autonomous Data Analyst. When the mathematical AnomalyDetector flags an issue, 
    this service steps in to find the *why*. It uses Contextual RAG to generate an exploratory 
    SQL query, executes it against DuckDB, and synthesizes a human-readable root-cause summary.
    """
    def __init__(self, llm_client: Any = None, db_client: Any = None, compute_engine: Any = None, nl2sql_service: Any = None):
        """
        Dependency Injection. We allow late-binding (setting these after initialization) 
        to avoid circular dependencies during app startup (The Modular Strategy).
        """
        self.llm = llm_client
        self.db = db_client
        self.compute = compute_engine
        self.nl2sql = nl2sql_service

    async def _fetch_schema(self, tenant_id: str, dataset_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves the exact schema for Contextual RAG to prevent the LLM from hallucinating columns.
        Enforces tenant isolation at the query level.
        """
        try:
            # Using Supabase client to fetch metadata securely
            response = self.db.table("datasets") \
                .select("id, name, schema_metadata") \
                .eq("tenant_id", tenant_id) \
                .eq("id", dataset_id) \
                .single() \
                .execute()
            
            if not response.data:
                return None
            
            return {
                "id": response.data["id"],
                "name": response.data["name"],
                "schema": response.data["schema_metadata"]
            }
        except Exception as e:
            logger.error(f"Failed to fetch schema for diagnostics (Tenant: {tenant_id}): {e}")
            return None

    async def analyze(self, tenant_id: str, dataset_id: str, metric: str, anomaly_context: Dict[str, Any]) -> str:
        """
        The core orchestration loop for diagnostic reasoning.
        Returns a concise, human-readable summary of what caused the anomaly.
        """
        logger.info(f"[Diagnostic Agent] Initiating root-cause analysis for {metric} (Tenant: {tenant_id}).")
        
        direction = anomaly_context.get('direction', 'an unexpected shift')
        fallback_msg = f"Alert: A sudden {direction} was detected in your {metric} metric. Log in to your dashboard to investigate."

        # Safety Check: Ensure the modular clients are injected
        if not all([self.llm, self.db, self.compute, self.nl2sql]):
            logger.warning("DiagnosticService dependencies missing. Bypassing deep analysis.")
            return fallback_msg

        # 1. Fetch schema context
        schema = await self._fetch_schema(tenant_id, dataset_id)
        if not schema:
            return fallback_msg

        # 2. Formulate the dynamic investigation prompt
        # We instruct the LLM to write SQL that groups by dimensions to find the driver of the anomaly.
        investigation_prompt = f"""
        The metric '{metric}' has experienced a sudden {direction}. 
        Generate a DuckDB SQL query to find the top contributing factors or dimensions (e.g., categories, regions, status) 
        that caused this {direction} recently. Group by categorical columns and order by variance.
        """

        # 3. Generate SQL via the existing NL2SQL Generator (Contextual RAG)
        try:
            sql_query, _ = await self.nl2sql.generate_sql(
                prompt=investigation_prompt,
                schemas=[schema],
                history=[]
            )
            logger.debug(f"[Diagnostic Agent] Generated investigative SQL:\n{sql_query}")
        except Exception as e:
            logger.error(f"Diagnostic Agent failed to generate SQL: {e}")
            return fallback_msg

        # 4. Execute the SQL against the DuckDB Compute Engine
        try:
            execution_result = await self.compute.execute_read_only(
                tenant_id=tenant_id,
                dataset_ids=[dataset_id],
                query=sql_query
            )
        except Exception as e:
            logger.error(f"Diagnostic Agent failed to execute DuckDB SQL: {e}")
            return fallback_msg

        # 5. Synthesize the final human-readable insight
        synthesis_prompt = f"""
        You are a senior Data Analyst reporting directly to a stakeholder.
        An anomaly was mathematically detected: '{metric}' showed a {direction}.
        
        We ran an internal diagnostic query and got these top results:
        {json.dumps(execution_result, default=str)[:2500]} 
        
        Write a concise, 2-3 sentence root-cause summary explaining what drove this anomaly based ONLY on the data provided above. 
        Be direct, analytical, and professional. Do NOT mention the SQL query itself or the fact that you are an AI.
        """

        try:
            summary = await self.llm.generate_text(
                prompt=synthesis_prompt,
                history=[]
            )
            logger.info("[Diagnostic Agent] Root-cause synthesis complete.")
            return summary
            
        except Exception as e:
            logger.error(f"Diagnostic Agent failed to synthesize final summary: {e}")
            return fallback_msg

# ==========================================
# Singleton Export (The Modular Strategy)
# ==========================================
# Export the instance. Inject the active DB, Compute, and LLM clients during app startup:
# diagnostic_service.llm = my_llm_client
# diagnostic_service.db = supabase_client
# etc.
diagnostic_service = DiagnosticService()