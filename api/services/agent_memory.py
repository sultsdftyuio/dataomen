# api/services/agent_memory.py

import logging
import json
from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel, Field

from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# Type Safety & Structured Outputs
# ---------------------------------------------------------

class TrendAnalysis(BaseModel):
    """Structured output schema to force the LLM into deterministic state evaluation."""
    is_novel: bool = Field(
        ..., 
        description="True if this anomaly is entirely new. False if it is a continuation of a recent trend."
    )
    trend_status: Literal["NEW_PATTERN", "ONGOING_ISSUE", "RECOVERY_DETECTED", "VOLATILITY"] = Field(
        ..., 
        description="Categorization of the temporal pattern."
    )
    memory_context: str = Field(
        ..., 
        description="A 1-2 sentence synthesis comparing the current anomaly to the recent historical baseline. e.g., 'This is the 3rd consecutive drop in 48 hours, indicating an ongoing issue rather than an isolated spike.'"
    )

# ---------------------------------------------------------
# Modular Service: Agent Memory
# ---------------------------------------------------------

class AgentMemoryService:
    """
    Phase 3: Stateful Memory & Baseline Awareness
    
    Provides temporal awareness to analytical agents. Queries the anomaly log 
    to retrieve recent incidents for a specific agent and uses an LLM to evaluate 
    baseline drift, preventing alert fatigue from redundant notifications.
    """
    
    def __init__(self, llm_client: Any = None):
        """
        Dependency Injection for the structured LLM client.
        Allows late-binding to avoid circular imports during app startup.
        """
        self.llm = llm_client

    def _fetch_recent_history(self, db: Session, tenant_id: str, agent_name: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieves the last N anomalies detected by this specific agent.
        Enforces tenant isolation directly in the SQL layer.
        """
        try:
            # Assumes 'anomaly_logs' table created during Phase 2
            query = text("""
                SELECT created_at, summary
                FROM anomaly_logs
                WHERE tenant_id = :tenant_id 
                  AND agent_name = :agent_name
                ORDER BY created_at DESC
                LIMIT :limit
            """)
            
            results = db.execute(query, {
                "tenant_id": tenant_id,
                "agent_name": agent_name,
                "limit": limit
            }).fetchall()
            
            # Format history for the LLM context window
            return [{"timestamp": str(r.created_at), "previous_summary": r.summary} for r in results]
            
        except SQLAlchemyError as e:
            logger.error(f"Memory lookup failed for agent '{agent_name}' (Tenant: {tenant_id}): {e}")
            return []

    def _build_evaluation_prompt(self, metric: str, current_anomaly: Dict[str, Any], historical_context: List[Dict[str, Any]]) -> str:
        """
        Constructs the Contextual RAG prompt for temporal trend evaluation.
        Limits token bloat by only passing the summarized history.
        """
        direction = current_anomaly.get("direction", "shift")
        variance = current_anomaly.get("variance_pct", "unknown")
        
        history_json = json.dumps(historical_context, indent=2) if historical_context else "No prior anomalies detected recently."
        
        return f"""
        You are the stateful memory module for an autonomous data agent analyzing '{metric}'.
        A new mathematical anomaly was just detected: a {variance}% {direction}.
        
        RECENT ANOMALY HISTORY FOR THIS AGENT:
        {history_json}
        
        CURRENT ANOMALY CONTEXT:
        Direction: {direction}
        Variance: {variance}%
        
        TASK:
        Analyze the current anomaly against the historical context. 
        Determine if this is a completely new issue, a continuation of a deteriorating trend (Ongoing Issue), 
        or a sign that the metric is returning to normal (Recovery). 
        """

    async def evaluate_trend(
        self, 
        db: Session, 
        tenant_id: str, 
        agent_name: str, 
        metric: str, 
        current_anomaly: Dict[str, Any]
    ) -> TrendAnalysis:
        """
        Main orchestration method for the memory layer. 
        Compares the current mathematical anomaly against recent DB history.
        """
        logger.info(f"[Memory Agent] Evaluating temporal baseline for {agent_name} (Tenant: {tenant_id}).")
        
        # 1. Fetch History
        history = self._fetch_recent_history(db, tenant_id, agent_name)
        
        # 2. Short-Circuit: If no history exists, this is definitively a new pattern
        if not history:
            logger.info(f"[Memory Agent] No history found. Flagging as NEW_PATTERN.")
            return TrendAnalysis(
                is_novel=True,
                trend_status="NEW_PATTERN",
                memory_context="This is the first time this specific anomaly has been detected recently."
            )

        # Safety Check: Ensure LLM is injected
        if not self.llm:
            logger.warning("[Memory Agent] LLM client missing. Defaulting to basic memory context.")
            return TrendAnalysis(
                is_novel=False,
                trend_status="VOLATILITY",
                memory_context="Multiple anomalies detected recently, but deep trend analysis is currently unavailable."
            )

        # 3. Formulate Prompt & Generate Structured Output
        prompt = self._build_evaluation_prompt(metric, current_anomaly, history)
        
        try:
            trend_analysis: TrendAnalysis = await self.llm.generate_structured(
                prompt=prompt,
                history=[],
                response_model=TrendAnalysis
            )
            
            logger.info(f"[Memory Agent] Trend identified: {trend_analysis.trend_status}. Novel: {trend_analysis.is_novel}")
            return trend_analysis
            
        except Exception as e:
            logger.error(f"[Memory Agent] Failed to synthesize trend: {e}")
            return TrendAnalysis(
                is_novel=True,
                trend_status="NEW_PATTERN",
                memory_context="An error occurred while analyzing historical trends. Treat this as a standard alert."
            )

# ==========================================
# Singleton Export
# ==========================================
# Export the instance. Inject the active LLM client during app startup:
# agent_memory.llm = my_structured_llm_client
agent_memory = AgentMemoryService()