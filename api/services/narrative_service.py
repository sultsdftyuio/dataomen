# api/services/narrative_service.py

import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

# Import our cross-service data contracts
from api.services.query_planner import QueryPlan
from api.services.insight_orchestrator import InsightPayload

# Import our Centralized LLM Client
from api.services.llm_client import llm_client

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Strict Data Contracts (The Output Format)
# -----------------------------------------------------------------------------

class NarrativeResponse(BaseModel):
    """
    Strict output schema for the frontend UI.
    Guarantees the dashboard always receives perfectly formatted text blocks.
    """
    executive_summary: str = Field(
        ..., 
        description="A punchy, one-sentence TL;DR summarizing the primary finding or answer to the user's intent."
    )
    key_insights: List[str] = Field(
        ..., 
        description="2-3 bullet points explaining the 'Why' using the statistical trends, correlations, or anomalies provided."
    )
    recommended_action: Optional[str] = Field(
        default=None, 
        description="A single, logical business recommendation based ONLY on the data provided."
    )

# -----------------------------------------------------------------------------
# Phase 3.2: The Executive Storyteller
# -----------------------------------------------------------------------------

class NarrativeService:
    """
    Phase 3.2: The Unified Insight Pipeline (Final Stage).
    
    Transforms pure mathematical payloads (from the InsightOrchestrator) 
    into concise, strategic business narratives.
    
    Engineering Excellence:
    - Zero Math Policy: The LLM does no calculations. It only translates pre-computed math.
    - Contextual Grounding: Uses the QueryPlan intent to frame the story.
    - Resilience: Implements exponential backoff for API reliability automatically via the llm_client.
    """
    
    # We no longer need __init__ to manage API keys or OpenAI clients directly.

    async def generate_executive_summary(
        self, 
        payload: InsightPayload, 
        plan: QueryPlan, 
        chart_spec: Optional[Dict[str, Any]], 
        tenant_id: str
    ) -> NarrativeResponse:
        """
        The final step in the pipeline. Generates the 'AI Analyst' text block.
        """
        logger.info(f"[{tenant_id}] Generating executive narrative for {payload.row_count} processed records.")

        # 1. Format the mathematical findings into absolute facts for the LLM
        facts = self._format_payload_into_facts(payload)
        
        # 2. Add visual context if a chart is being rendered
        visual_context = ""
        if chart_spec:
            chart_type = chart_spec.get("mark", "chart")
            visual_context = f"Note: The user is currently looking at a {chart_type} visualizing this data."

        # 3. Construct the prompt
        system_prompt = f"""You are an elite, highly analytical Chief Data Officer.
Your job is to translate raw statistical facts into a concise executive summary for a business user.

CRITICAL RULES:
1. NO CALCULATIONS: Do not attempt to calculate anything. Use ONLY the provided mathematical facts.
2. NO HALLUCINATIONS: Do not invent external market factors (e.g., do not blame "seasonality" or "economic downturns" unless explicitly proven by the data).
3. BE CONCISE: Executives are busy. Use punchy, professional language.
4. TIE TO INTENT: Ensure your narrative directly answers the original user intent.

{visual_context}
"""

        user_prompt = f"""
        ORIGINAL ANALYTICAL INTENT:
        "{plan.intent}"

        MATHEMATICAL FACTS (Pre-computed by the engine):
        {facts}
        """

        try:
            # Native Structured Outputs guarantee the Pydantic shape via centralized client
            result = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=user_prompt,
                response_model=NarrativeResponse,
                temperature=0.2 # Low temperature for analytical consistency, slight variance for natural tone
            )
            
            return result
            
        except Exception as e:
            logger.error(f"[{tenant_id}] Narrative generation failed: {str(e)}")
            # Graceful degradation: If the LLM fails, return a safe fallback using the raw intent
            return NarrativeResponse(
                executive_summary=f"Analysis completed for: {plan.intent}.",
                key_insights=["Mathematical processing finished successfully.", "Please refer to the raw data and visual charts for details."],
                recommended_action=None
            )

    # -------------------------------------------------------------------------
    # Internal Helpers
    # -------------------------------------------------------------------------

    def _format_payload_into_facts(self, payload: InsightPayload) -> str:
        """
        Translates the strict Pydantic payload into readable facts so the LLM 
        doesn't have to guess how to parse JSON arrays.
        """
        if payload.row_count == 0:
            return "The database query returned zero records. There is no data to analyze."

        lines = [f"Dataset Size: {payload.row_count} records analyzed."]

        if payload.anomalies:
            lines.append("\nDETECTED ANOMALIES (Z-Score > 2.0):")
            for a in payload.anomalies:
                direction = "SPIKE" if a.is_positive else "DROP"
                lines.append(f"- {direction} in '{a.column}': Value was {a.value} on {a.row_identifier} (Severity: {a.z_score} standard deviations from mean).")

        if payload.trends:
            lines.append("\nDIRECTIONAL TRENDS:")
            for t in payload.trends:
                lines.append(f"- '{t.column}' is {t.direction} (Total Change: {t.percentage_change:+.2f}%, Mathematical Slope: {t.slope}).")

        if payload.correlations:
            lines.append("\nSTATISTICAL CORRELATIONS:")
            for c in payload.correlations:
                lines.append(f"- '{c.metric_a}' and '{c.metric_b}' have a Pearson correlation of {c.pearson_coefficient} (Strong relationship).")

        if not payload.anomalies and not payload.trends and not payload.correlations:
            lines.append("\nNo significant mathematical anomalies, steep trends, or strong correlations were detected in this dataset.")

        return "\n".join(lines)

# Global Singleton
narrative_service = NarrativeService()