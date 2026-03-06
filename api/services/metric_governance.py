# api/services/metric_governance.py
from typing import Dict, Optional
from pydantic import BaseModel

class MetricDefinition(BaseModel):
    name: str
    numerator: str
    denominator: str = "1"
    description: str

class SemanticMathRegistry:
    """
    Metric Governance Module: Defuses complex calculations by 
    abstracting them into algebraic numerator/denominator forms. 
    Keeps the LLM focused on routing/intent rather than math.
    """
    def __init__(self) -> None:
        self._metrics: Dict[str, MetricDefinition] = {}
        self._register_default_metrics()

    def _register_default_metrics(self) -> None:
        self.register(
            MetricDefinition(
                name="conversion_rate",
                numerator="SUM(CASE WHEN is_converted = TRUE THEN 1 ELSE 0 END)",
                denominator="COUNT(DISTINCT user_id)",
                description="Percentage of unique users who completed a conversion event."
            )
        )
        self.register(
            MetricDefinition(
                name="cac",
                numerator="SUM(marketing_spend)",
                denominator="SUM(CASE WHEN is_new_customer = TRUE THEN 1 ELSE 0 END)",
                description="Customer Acquisition Cost."
            )
        )

    def register(self, metric: MetricDefinition) -> None:
        self._metrics[metric.name.lower()] = metric

    def get_sql_expression(self, metric_name: str) -> Optional[str]:
        """Returns safe SQL expression avoiding division by zero."""
        metric = self._metrics.get(metric_name.lower())
        if not metric:
            return None
        return f"({metric.numerator} / NULLIF({metric.denominator}, 0)) AS {metric.name}"
        
    def get_all_context(self) -> str:
        """Returns string representation of metrics for Contextual RAG injection."""
        return "\n".join([f"- {m.name}: {m.description}" for m in self._metrics.values()])

# Singleton instance
metric_registry = SemanticMathRegistry()