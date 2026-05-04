import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from collections import Counter

logger = logging.getLogger(__name__)

class HybridExplanationEngine:
    """
    The Ultimate Root Cause Engine.
    Combines quantitative metric topology with qualitative user feedback
    and system events, synthesized by an AI reasoning layer.
    """

    # Hardcoded topology (can be moved to a graph DB like Neo4j later)
    METRIC_TOPOLOGY = {
        "conversion_rate": ["page_load_time", "checkout_errors", "cart_abandons", "api_latency"],
        "mrr": ["cancellations", "downgrades", "failed_payments"],
        "active_users": ["login_errors", "session_timeouts", "crash_rate"]
    }

    NOISE_THRESHOLD = 15.0

    def __init__(self, db_pool: Any, ai_client: Optional[Any] = None):
        self.db = db_pool
        self.ai = ai_client

    @staticmethod
    def calculate_severity(deviation_pct: float) -> str:
        """Deterministically ranks severity based on absolute deviation."""
        abs_dev = abs(deviation_pct)
        if abs_dev >= 40.0: return "critical"
        if abs_dev >= 20.0: return "high"
        if abs_dev >= 10.0: return "medium"
        return "low"

    # =========================================================
    # 1. MAIN PIPELINE (THE ORCHESTRATOR)
    # =========================================================
    async def analyze_root_cause(
        self,
        tenant_id: str,
        target_metric: str,
        anomaly: Dict[str, Any],
        timestamp: datetime
    ) -> Dict[str, Any]:
        
        if not anomaly.get("is_anomaly"):
            return {"status": "healthy", "message": "No deviations detected."}

        deviation_pct = anomaly.get("deviation_pct", 0.0)
        severity = self.calculate_severity(deviation_pct)

        # Step A: Gather Quantitative Signals (The Math)
        correlations = await self._fetch_metric_correlations(
            tenant_id, target_metric, timestamp.date()
        )
        ranked_metrics = self._rank_by_topology(target_metric, correlations)
        
        # Identify primary correlation for DB indexing
        primary_correlation = ranked_metrics[0]["metric"] if ranked_metrics else None

        # Step B: Gather Qualitative Signals (The Users)
        feedback = await self._fetch_contextual_feedback(tenant_id, timestamp)
        user_themes = self._extract_feedback_themes(feedback)

        # Step C: Gather System Context (The Infrastructure)
        system_events = await self._detect_system_events(tenant_id, timestamp)

        # Step D: AI Synthesis (The Brain)
        insight = await self._synthesize_intelligence(
            target_metric=target_metric,
            anomaly=anomaly,
            ranked_metrics=ranked_metrics,
            user_themes=user_themes,
            system_events=system_events
        )

        # Step E: Persist to Database (Close the loop with new SQL schema)
        await self._persist_intelligence(
            tenant_id=tenant_id,
            target_metric=target_metric,
            date=timestamp.date(),
            severity=severity,
            explanation=insight.get("summary"),
            primary_correlation=primary_correlation
        )

        return {
            "target_metric": target_metric,
            "timestamp": timestamp.isoformat(),
            "severity": severity,
            "summary": insight.get("summary"),
            "primary_root_cause": insight.get("primary_cause"),
            "actionable_steps": insight.get("recommendations"),
            
            # Raw Evidence (Useful for UI tooltips or deep-dives)
            "evidence": {
                "correlated_metrics": ranked_metrics[:3],
                "user_complaint_themes": user_themes,
                "recent_deployments": system_events
            }
        }

    # =========================================================
    # 2. QUANTITATIVE LAYER (Metrics & Topology)
    # =========================================================
    async def _fetch_metric_correlations(self, tenant_id: str, target_metric: str, target_date: datetime.date) -> List[Dict]:
        query = """
            SELECT metric_name, deviation_percentage
            FROM anomaly_detector_logs
            WHERE tenant_id = $1 AND date = $2
              AND metric_name != $3 AND ABS(deviation_percentage) >= $4
        """
        rows = await self.db.fetch_all(
            query, tenant_id, target_date, target_metric, self.NOISE_THRESHOLD
        )
        return [{"metric": r["metric_name"], "deviation": r["deviation_percentage"]} for r in rows]

    def _rank_by_topology(self, target_metric: str, correlations: List[Dict]) -> List[Dict]:
        known_deps = self.METRIC_TOPOLOGY.get(target_metric, [])
        for c in correlations:
            boost = 1.5 if c["metric"] in known_deps else 1.0
            c["impact_score"] = abs(c["deviation"]) * boost
            c["is_known_dependency"] = c["metric"] in known_deps
        
        return sorted(correlations, key=lambda x: x["impact_score"], reverse=True)

    # =========================================================
    # 3. QUALITATIVE LAYER (User Sentiment)
    # =========================================================
    async def _fetch_contextual_feedback(self, tenant_id: str, timestamp: datetime) -> List[Dict]:
        query = """
            SELECT properties->>'reason' as reason
            FROM events
            WHERE tenant_id = $1 AND event_name = 'feedback_submitted'
              AND timestamp BETWEEN $2 AND $3
        """
        start, end = timestamp - timedelta(hours=2), timestamp + timedelta(hours=2)
        return await self.db.fetch_all(query, tenant_id, start, end)

    def _extract_feedback_themes(self, feedback: List[Dict]) -> List[Dict]:
        if not feedback: return []
        reasons = [f["reason"] or "uncategorized" for f in feedback]
        total = len(reasons)
        return [
            {"theme": reason, "affected_users_pct": round((count / total) * 100, 1)}
            for reason, count in Counter(reasons).most_common(3)
        ]

    # =========================================================
    # 4. SYSTEM CONTEXT (Deployments & Outages)
    # =========================================================
    async def _detect_system_events(self, tenant_id: str, timestamp: datetime) -> List[Dict]:
        query = """
            SELECT metadata->>'type' as type, timestamp
            FROM events
            WHERE tenant_id = $1 AND event_name = 'system_deploy'
              AND timestamp BETWEEN $2 AND $3
        """
        start, end = timestamp - timedelta(hours=4), timestamp # Look back 4 hours
        rows = await self.db.fetch_all(query, tenant_id, start, end)
        return [{"type": r["type"], "time": r["timestamp"].isoformat()} for r in rows]

    # =========================================================
    # 5. AI SYNTHESIS & PERSISTENCE LAYER
    # =========================================================
    async def _synthesize_intelligence(self, target_metric: str, anomaly: Dict, ranked_metrics: List[Dict], user_themes: List[Dict], system_events: List[Dict]) -> Dict:
        # Fallback if AI is unavailable or fails
        fallback_insight = {
            "summary": f"The {target_metric} deviated by {anomaly.get('deviation_pct', 0)}%. Manual review required.",
            "primary_cause": ranked_metrics[0]["metric"] if ranked_metrics else "Unknown",
            "recommendations": ["Review correlated metrics and recent deploys manually."]
        }

        if not self.ai:
            return fallback_insight

        prompt = f"""
        You are a Staff-Level Site Reliability & Product Analytics Expert.
        Diagnose the root cause of this anomaly using the following multi-dimensional evidence:

        [THE ANOMALY]
        Metric: {target_metric} | Shift: {anomaly.get("deviation_pct")}% {anomaly.get("direction")}

        [SYSTEM METRICS (Quantitative)]
        Top Correlated Deviations: {ranked_metrics[:3]}

        [USER SENTIMENT (Qualitative)]
        Top Complaint Themes (last 2 hours): {user_themes}

        [INFRASTRUCTURE EVENTS]
        Recent Deployments/Incidents: {system_events}

        Synthesize this evidence into a JSON response:
        - "summary": A 1-sentence executive summary of what happened.
        - "primary_cause": The single most likely root cause, connecting the metrics to the user experience.
        - "recommendations": An array of 3 actionable, specific steps to resolve this.
        """
        
        try:
            return await self.ai.generate_json(prompt)
        except Exception as e:
            logger.error(f"AI Synthesis failed: {e}")
            return fallback_insight

    async def _persist_intelligence(self, tenant_id: str, target_metric: str, date: datetime.date, severity: str, explanation: str, primary_correlation: Optional[str]):
        """Updates the existing anomaly record with the newly generated intelligence."""
        query = """
            UPDATE anomaly_detector_logs
            SET severity = $1, 
                explanation = $2, 
                primary_correlation_metric = $3
            WHERE tenant_id = $4 
              AND metric_name = $5 
              AND date = $6
        """
        try:
            await self.db.execute(
                query, severity, explanation, primary_correlation, tenant_id, target_metric, date
            )
        except Exception as e:
            logger.error(f"Failed to persist intelligence for {tenant_id}:{target_metric}: {e}")