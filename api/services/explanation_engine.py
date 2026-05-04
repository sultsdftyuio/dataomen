import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from collections import Counter

logger = logging.getLogger(__name__)


class ExplanationEngine:
    def __init__(self, db_pool, ai_client=None):
        self.db = db_pool
        self.ai = ai_client  # GPT-5-nano client (optional but recommended)

    # =========================================================
    # MAIN ENTRY POINT
    # =========================================================
    async def generate_explanation(
        self,
        tenant_id: str,
        anomaly: Dict[str, Any],
        dimension: Optional[str] = None,
        dimension_value: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Full intelligence pipeline:
        anomaly → feedback → clustering → impact → AI reasoning
        """

        if not anomaly.get("is_anomaly"):
            return {
                "isAnomaly": False,
                "message": "✅ Metric is stable. No issues detected."
            }

        timestamp = datetime.utcnow()

        # 1. FETCH CONTEXTUAL FEEDBACK
        feedback = await self.fetch_contextual_feedback(
            tenant_id,
            timestamp,
            dimension,
            dimension_value
        )

        # 2. CLUSTER THEMES (multi-theme extraction)
        themes = self._extract_themes(feedback)

        # 3. IMPACT SCORING
        impact = self._calculate_impact(themes, len(feedback))

        # 4. TIME CORRELATION
        correlation = await self._detect_time_correlation(
            tenant_id,
            anomaly,
            timestamp
        )

        # 5. AI ROOT CAUSE (PRIMARY INTELLIGENCE)
        ai_result = await self._generate_ai_root_cause(
            anomaly,
            themes,
            impact,
            correlation
        )

        return {
            "isAnomaly": True,
            "summary": ai_result.get("summary"),
            "root_causes": ai_result.get("root_causes"),
            "recommendations": ai_result.get("recommendations"),

            # Structured data (for UI / charts)
            "themes": themes,
            "impact": impact,
            "correlation": correlation
        }

    # =========================================================
    # FEEDBACK FETCH
    # =========================================================
    async def fetch_contextual_feedback(
        self,
        tenant_id: str,
        anomaly_timestamp: datetime,
        dimension: Optional[str] = None,
        dimension_value: Optional[str] = None,
        hours_radius: int = 2,
        limit: int = 100
    ) -> List[Dict[str, Any]]:

        start = anomaly_timestamp - timedelta(hours=hours_radius)
        end = anomaly_timestamp + timedelta(hours=hours_radius)

        query = """
            SELECT 
                user_id,
                properties->>'reason' as reason,
                properties->>'feedback_text' as feedback_text
            FROM events
            WHERE tenant_id = $1
              AND event_name = 'feedback_submitted'
              AND timestamp BETWEEN $2 AND $3
        """

        params = [tenant_id, start, end]

        if dimension and dimension_value and dimension != "global":
            query += f" AND properties->>'{dimension}' = $4"
            params.append(dimension_value)

        query += f" LIMIT ${len(params) + 1}"
        params.append(limit)

        rows = await self.db.fetch_all(query, *params)

        return [
            {
                "user_id": r["user_id"],
                "reason": r["reason"],
                "text": r["feedback_text"]
            }
            for r in rows
        ]

    # =========================================================
    # MULTI-THEME EXTRACTION
    # =========================================================
    def _extract_themes(self, feedback: List[Dict]) -> List[Dict]:
        """
        Extract top clusters from feedback.
        """
        if not feedback:
            return []

        reasons = [f["reason"] or "unknown" for f in feedback]

        counter = Counter(reasons)
        total = len(feedback)

        themes = []
        for reason, count in counter.most_common(3):  # TOP 3 clusters
            themes.append({
                "theme": reason,
                "count": count,
                "percentage": round((count / total) * 100, 2)
            })

        return themes

    # =========================================================
    # IMPACT SCORING
    # =========================================================
    def _calculate_impact(self, themes: List[Dict], total_feedback: int) -> List[Dict]:
        """
        Converts themes into impact insights
        """
        impact = []

        for t in themes:
            impact.append({
                "theme": t["theme"],
                "affected_users_pct": t["percentage"],
                "severity": self._classify_severity(t["percentage"])
            })

        return impact

    def _classify_severity(self, pct: float) -> str:
        if pct > 50:
            return "critical"
        elif pct > 25:
            return "high"
        elif pct > 10:
            return "medium"
        return "low"

    # =========================================================
    # TIME CORRELATION
    # =========================================================
    async def _detect_time_correlation(
        self,
        tenant_id: str,
        anomaly: Dict,
        timestamp: datetime
    ) -> Dict[str, Any]:
        """
        Detects if anomaly aligns with deploys / spikes
        """

        try:
            # Example: check recent deploy events
            rows = await self.db.fetch_all("""
                SELECT timestamp, metadata->>'type' as type
                FROM events
                WHERE tenant_id = $1
                  AND event_name = 'system_event'
                  AND timestamp >= $2 - INTERVAL '2 hours'
                  AND timestamp <= $2
            """, tenant_id, timestamp)

            if not rows:
                return {"detected": False}

            return {
                "detected": True,
                "events": [
                    {
                        "type": r["type"],
                        "timestamp": r["timestamp"].isoformat()
                    }
                    for r in rows
                ]
            }

        except Exception:
            logger.warning("correlation_failed", exc_info=True)
            return {"detected": False}

    # =========================================================
    # AI ROOT CAUSE ENGINE (GPT-5-nano)
    # =========================================================
    async def _generate_ai_root_cause(
        self,
        anomaly: Dict,
        themes: List[Dict],
        impact: List[Dict],
        correlation: Dict
    ) -> Dict[str, Any]:

        # Fallback if no AI
        if not self.ai:
            return self._fallback_explanation(anomaly, themes)

        try:
            prompt = f"""
You are a product analytics AI.

Analyze this anomaly:

Metric: {anomaly.get("metric_name")}
Direction: {anomaly.get("direction")}
Deviation: {anomaly.get("deviation_pct")}%
Current: {anomaly.get("current_value")}
Baseline: {anomaly.get("baseline")}

Themes: {themes}
Impact: {impact}
Correlation: {correlation}

Return:
- summary (1 sentence)
- top 3 root causes
- actionable recommendations
"""

            response = await self.ai.generate(prompt)

            return response

        except Exception:
            logger.error("ai_explanation_failed", exc_info=True)
            return self._fallback_explanation(anomaly, themes)

    # =========================================================
    # SAFE FALLBACK (NO AI)
    # =========================================================
    def _fallback_explanation(self, anomaly: Dict, themes: List[Dict]) -> Dict[str, Any]:
        metric = anomaly.get("metric_name")
        direction = anomaly.get("direction")

        verb = "dropped" if direction == "drop" else "spiked"

        return {
            "summary": f"{metric} {verb} significantly.",
            "root_causes": [t["theme"] for t in themes],
            "recommendations": [
                "Investigate top user complaints",
                "Check recent deployments",
                "Review logs for errors"
            ]
        }