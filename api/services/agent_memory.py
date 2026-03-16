# api/services/agent_memory.py

import logging
import json
import asyncio
from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel, Field

from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

# Import our centralized LLM client
from api.services.llm_client import llm_client

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
        description="A 1-2 sentence synthesis comparing the current anomaly to the recent historical baseline."
    )

# ---------------------------------------------------------
# Modular Service: Agent Memory
# ---------------------------------------------------------

class AgentMemoryService:
    """
    Phase 3: Stateful Memory & Baseline Awareness
    
    Provides temporal awareness to analytical agents. Queries the anomaly log 
    to retrieve recent incidents for a specific agent and uses the centralized 
    llm_client to evaluate baseline drift, preventing alert fatigue.
    """
    
    def __init__(self):
        # We no longer need to inject an llm_client here.
        # The service uses the global llm_client singleton.
        pass

    def _fetch_recent_history(self, db: Session, tenant_id: str, agent_name: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieves the last N anomalies detected by this specific agent.
        Enforces tenant isolation directly in the SQL layer.
        """
        try:
            # Assumes 'anomaly_logs' table exists from the analytics pipeline
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
            }).mappings().fetchall()
            
            return [{"timestamp": str(r["created_at"]), "previous_summary": r["summary"]} for r in results]
            
        except SQLAlchemyError as e:
            logger.error(f"Memory lookup failed for agent '{agent_name}' (Tenant: {tenant_id}): {e}")
            return []

    def _build_evaluation_prompts(self, metric: str, current_anomaly: Dict[str, Any], historical_context: List[Dict[str, Any]]) -> tuple[str, str]:
        """
        Constructs the split prompts for the centralized LLM client.
        """
        direction = current_anomaly.get("direction", "shift")
        variance = current_anomaly.get("variance_pct", "unknown")
        history_json = json.dumps(historical_context, indent=2) if historical_context else "No prior anomalies detected recently."
        
        system_prompt = (
            "You are the stateful memory module for an autonomous data analyst. "
            "Your task is to analyze mathematical anomalies against historical context "
            "to identify if patterns are novel or part of an ongoing issue."
        )

        user_prompt = f"""
        ANALYTICS CONTEXT:
        Metric: '{metric}'
        New Anomaly Detected: a {variance}% {direction}.
        
        RECENT ANOMALY HISTORY:
        {history_json}
        
        TASK:
        Compare the current anomaly against the history. Determine if this is a 
        'NEW_PATTERN', an 'ONGOING_ISSUE', or a 'RECOVERY_DETECTED'.
        """
        
        return system_prompt, user_prompt

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
        Compares the current mathematical anomaly against recent DB history using the centralized LLM.
        """
        logger.info(f"[Memory Agent] Evaluating temporal baseline for {agent_name} (Tenant: {tenant_id}).")
        
        # 1. Fetch History in background thread to preserve event loop performance
        history = await asyncio.to_thread(self._fetch_recent_history, db, tenant_id, agent_name)
        
        # 2. Short-Circuit: If no history exists, this is a new pattern
        if not history:
            logger.info(f"[Memory Agent] No history found. Flagging as NEW_PATTERN.")
            return TrendAnalysis(
                is_novel=True,
                trend_status="NEW_PATTERN",
                memory_context="This is the first time this specific anomaly has been detected recently."
            )

        # 3. Formulate Prompt & Generate Structured Output via Centralized Client
        system_prompt, user_prompt = self._build_evaluation_prompts(metric, current_anomaly, history)
        
        try:
            # Native structured output via the centralized llm_client singleton
            trend_analysis: TrendAnalysis = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=user_prompt,
                response_model=TrendAnalysis,
                temperature=0.0 # Deterministic trend categorization
            )
            
            logger.info(f"[Memory Agent] Trend identified: {trend_analysis.trend_status}. Novel: {trend_analysis.is_novel}")
            return trend_analysis
            
        except Exception as e:
            logger.error(f"[Memory Agent] Failed to synthesize trend: {e}")
            return TrendAnalysis(
                is_novel=True,
                trend_status="NEW_PATTERN",
                memory_context="An error occurred while analyzing historical trends. Defaulting to NEW_PATTERN alert."
            )

# ==========================================
# Singleton Export
# ==========================================
agent_memory = AgentMemoryService()