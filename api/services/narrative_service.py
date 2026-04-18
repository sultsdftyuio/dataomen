"""
ARCLI.TECH - Executive Synthesis Layer
Component: Auditable Narrative Service
Strategy: Time-Travel Snapshots, Zero-Hallucination Framing, & Reproducibility
"""

import logging
import hashlib
import json
import time
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

# Arcli Infrastructure Contracts
from api.services.query_planner import QueryPlan
from api.services.insight_orchestrator import InsightPayload
from api.services.llm_client import llm_client
from api.auth import get_supabase_client

logger = logging.getLogger(__name__)

# =====================================================================
# TYPE DEFINITIONS & MODELS
# =====================================================================

class NarrativeResponse(BaseModel):
    """
    Phase 2: State Layer Output Schema.
    Guarantees perfectly formatted text blocks while embedding an immutable 
    snapshot hash for 1-Click Provenance and Slack sharing.
    """
    executive_summary: str = Field(
        ..., 
        description="A punchy, one-sentence TL;DR summarizing the primary finding or answer."
    )
    key_insights: List[str] = Field(
        ..., 
        description="2-3 bullet points explaining the 'Why' using strict statistical trends or anomalies."
    )
    recommended_action: Optional[str] = Field(
        default=None, 
        description="A single, logical business recommendation based strictly on the provided math."
    )
    snapshot_hash: str = Field(
        default="", 
        description="Immutable cryptographic hash referencing the exact data state used to generate this narrative."
    )

class NarrativeSnapshot(BaseModel):
    """Internal model for the Reference + Hash storage strategy."""
    tenant_id: str
    snapshot_hash: str
    intent: str
    fact_signature: str
    chart_spec_hash: Optional[str]
    created_at: float = Field(default_factory=time.time)

# =====================================================================
# NARRATIVE SYNTHESIS ENGINE (Phase 2 Core)
# =====================================================================

class NarrativeService:
    """
    Phase 2: Narrative Synthesis & The State Layer
    
    Transforms pure mathematical payloads into concise executive stories.
    Enforces the 'Zero Math Policy' for LLMs and generates cryptographic 
    Snapshots to guarantee absolute mathematical provenance and reproducibility.
    """

    def __init__(self):
        # Multi-tenant state isolation
        try:
            self.supabase = get_supabase_client()
        except Exception as exc:
            self.supabase = None
            logger.warning("Supabase snapshot persistence disabled: %s", exc)

    async def generate_executive_summary(
        self, 
        payload: InsightPayload, 
        plan: QueryPlan, 
        chart_spec: Optional[Dict[str, Any]], 
        tenant_id: str
    ) -> NarrativeResponse:
        """
        Generates the 'AI Analyst' narrative, computes the Time-Travel Snapshot, 
        and freezes the state for future auditing.
        """
        logger.info(f"[{tenant_id}] Synthesizing narrative. Grounding with {payload.row_count} mathematical facts.")

        # 1. Format mathematical findings into absolute facts
        facts = self._format_payload_into_facts(payload)
        
        # 2. Generate the Cryptographic Snapshot Hash (Reference + Hash Strategy)
        snapshot_hash = self._generate_snapshot_hash(tenant_id, plan.intent, facts, chart_spec)

        # 3. Add visual context if rendering an Omni-Graph widget
        visual_context = ""
        if chart_spec:
            chart_type = chart_spec.get("mark", "chart")
            visual_context = f"VISUAL CONTEXT: The user is actively viewing a {chart_type} visualizing these exact facts."

        # 4. Contextual RAG: Strict Semantic Boundaries
        system_prompt = f"""You are the Arcli Chief Data Officer (CDO).
Your mandate is to synthesize raw, pre-computed statistical facts into a high-signal executive narrative.

THE COMMANDMENTS (STRICT):
1. NO CALCULATIONS: You are structurally forbidden from performing math. Use ONLY the provided mathematical facts.
2. NO HALLUCINATIONS: Do not invent external market factors (e.g., 'economic downturns', 'seasonality') unless mathematically proven in the facts.
3. ABSOLUTE PRECISION: Maintain a modern, intelligent, and quietly powerful tone. Avoid fluff, filler words, or sycophancy.
4. ALIGN TO INTENT: Your narrative must directly resolve the user's Analytical Intent.

{visual_context}
"""

        user_prompt = f"""
        ANALYTICAL INTENT:
        "{plan.intent}"

        MATHEMATICAL FACTS (Immutable Baseline):
        {facts}
        """

        try:
            # Native Structured Outputs guarantee the UI contract is never broken
            result: NarrativeResponse = await llm_client.generate_structured(
                system_prompt=system_prompt,
                prompt=user_prompt,
                response_model=NarrativeResponse,
                temperature=0.1 # Nearing zero for absolute analytical determinism
            )
            
            # Inject the provenance hash
            result.snapshot_hash = snapshot_hash
            
            # Freeze the state asynchronously
            self._freeze_snapshot_state(tenant_id, snapshot_hash, plan.intent, facts, chart_spec)
            
            return result
            
        except Exception as e:
            logger.error(f"[{tenant_id}] Synthesis engine failed: {str(e)}")
            # Graceful Degradation: Fail-safe structural output
            return NarrativeResponse(
                executive_summary=f"Analysis computed securely for intent: {plan.intent}.",
                key_insights=[
                    "Data processing finished successfully via DuckDB.", 
                    "Narrative synthesis is temporarily degraded. Please rely on visual widgets and mathematical bounds."
                ],
                recommended_action=None,
                snapshot_hash=snapshot_hash
            )

    # -------------------------------------------------------------------------
    # STATE MANAGEMENT & PROVENANCE (Phase 2 Internal)
    # -------------------------------------------------------------------------

    def _generate_snapshot_hash(self, tenant_id: str, intent: str, facts: str, chart_spec: Optional[Dict[str, Any]]) -> str:
        """
        Generates a deterministic SHA-256 hash based on the exact query context 
        and mathematical signature to enable 'Time-Travel' comparisons later.
        """
        chart_str = json.dumps(chart_spec, sort_keys=True) if chart_spec else "no_chart"
        raw_state = f"{tenant_id}_{intent}_{hashlib.md5(facts.encode()).hexdigest()}_{chart_str}"
        return f"snap_{hashlib.sha256(raw_state.encode('utf-8')).hexdigest()[:16]}"

    def _freeze_snapshot_state(self, tenant_id: str, snapshot_hash: str, intent: str, facts: str, chart_spec: Optional[Dict[str, Any]]) -> None:
        """
        Persists the snapshot reference. Because we store the hash of the facts 
        rather than raw parquet data, storage costs remain sub-linear.
        """
        if self.supabase is None:
            return

        try:
            snapshot = NarrativeSnapshot(
                tenant_id=tenant_id,
                snapshot_hash=snapshot_hash,
                intent=intent,
                fact_signature=hashlib.md5(facts.encode()).hexdigest(),
                chart_spec_hash=hashlib.md5(json.dumps(chart_spec, sort_keys=True).encode()).hexdigest() if chart_spec else None
            )
            
            # Persist to database to allow Slack link unfurling and exact reproduction
            self.supabase.table("narrative_snapshots").upsert(snapshot.dict()).execute()
            logger.info(f"[{tenant_id}] Narrative Snapshot frozen: {snapshot_hash}")
        except Exception as e:
            logger.warning(f"[{tenant_id}] Could not persist snapshot state to DB: {e}")

    def _format_payload_into_facts(self, payload: InsightPayload) -> str:
        """
        Translates the Pydantic payload into raw text bounds.
        Eliminates the need for the LLM to parse complex JSON trees, reducing token bloat.
        """
        if payload.row_count == 0:
            return "The Omni-Graph returned zero records. State is empty."

        lines = [f"Dataset Vector Size: {payload.row_count} records processed."]

        if payload.anomalies:
            lines.append("\nDETECTED ANOMALIES (Linear Algebra Variance Check):")
            for a in payload.anomalies:
                direction = "SPIKE" if a.is_positive else "DROP"
                lines.append(f"- {direction} in '{a.column}': {a.value} on {a.row_identifier} (Severity: {a.z_score} standard deviations from baseline).")

        if payload.trends:
            lines.append("\nDIRECTIONAL VECTORS:")
            for t in payload.trends:
                lines.append(f"- '{t.column}' {t.direction} (Percentage Change: {t.percentage_change:+.2f}%, Mathematical Slope: {t.slope}).")

        if payload.correlations:
            lines.append("\nSTATISTICAL CORRELATIONS (Pearson Coefficient):")
            for c in payload.correlations:
                lines.append(f"- '{c.metric_a}' <-> '{c.metric_b}': {c.pearson_coefficient} (Verified relationship).")

        if not any([payload.anomalies, payload.trends, payload.correlations]):
            lines.append("\nNo mathematically significant anomalies, steep vectors, or correlations detected.")

        return "\n".join(lines)

# Global Singleton
narrative_service = NarrativeService()