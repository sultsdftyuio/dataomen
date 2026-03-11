# api/services/metric_governance.py

import re
import logging
from typing import Dict, List, Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Type Definitions
# -----------------------------------------------------------------------------
class GovernedMetric(BaseModel):
    name: str
    friendly_name: str
    description: str
    sql_snippet: str
    required_columns: List[str] = []

# -----------------------------------------------------------------------------
# Core Governance Service
# -----------------------------------------------------------------------------
class MetricGovernanceService:
    """
    The Single Source of Truth for Enterprise Metrics.
    Prevents LLM hallucination and "Metric Drift" by injecting strictly controlled 
    mathematical definitions into analytical queries before DuckDB execution.
    """

    def __init__(self, tenant_id: str, db_session=None):
        self.tenant_id = tenant_id
        self.db = db_session
        self._registry: Dict[str, GovernedMetric] = self._load_tenant_metrics()

    def _load_tenant_metrics(self) -> Dict[str, GovernedMetric]:
        """
        Loads the approved metric definitions for the workspace.
        In production, this queries the `public.governed_metrics` table using self.tenant_id.
        For this blueprint, we instantiate the standard SaaS metrics framework.
        """
        return {
            "mrr": GovernedMetric(
                name="mrr",
                friendly_name="Monthly Recurring Revenue",
                description="Standardized MRR calculation. Excludes taxes, one-off setups, and refunded amounts.",
                sql_snippet="COALESCE(SUM(amount) FILTER (WHERE status = 'active' AND type = 'subscription'), 0)",
                required_columns=["amount", "status", "type"]
            ),
            "churn_rate": GovernedMetric(
                name="churn_rate",
                friendly_name="Customer Churn Rate",
                description="Percentage of canceled subscriptions relative to total active cohort.",
                sql_snippet="(COUNT(CASE WHEN status = 'canceled' THEN 1 END) * 100.0) / NULLIF(COUNT(*), 0)",
                required_columns=["status"]
            ),
            "arpu": GovernedMetric(
                name="arpu",
                friendly_name="Average Revenue Per User",
                description="Total recurring revenue divided by the number of unique active customers.",
                sql_snippet="SUM(amount) / NULLIF(COUNT(DISTINCT customer_id), 0)",
                required_columns=["amount", "customer_id"]
            )
        }

    def get_llm_prompt_context(self) -> str:
        """
        Generates a strict system prompt string to instruct the LLM on which 
        governed metrics are available for its Contextual RAG window.
        """
        if not self._registry:
            return ""

        lines = ["\n### [STRICT METRIC GOVERNANCE] ###"]
        lines.append("You MUST use the following exact tags in your SELECT statements instead of writing manual calculations. DO NOT attempt to calculate these metrics yourself.")
        
        for name, metric in self._registry.items():
            lines.append(f"- {{{name}}}: {metric.friendly_name}. {metric.description} (Requires columns: {', '.join(metric.required_columns)})")
        
        lines.append("\nExample Output Format:")
        lines.append("SELECT date_trunc('month', created_at) AS month, {mrr} AS total_mrr FROM stripe_subs GROUP BY 1;")
        lines.append("##################################\n")
        
        return "\n".join(lines)

    def inject_governed_metrics(self, raw_sql: str) -> str:
        """
        Intercepts the LLM's raw SQL output and safely expands the macro tags 
        into their highly optimized, mathematically precise DuckDB SQL equivalents.
        """
        expanded_sql = raw_sql

        # 1. Identify all tags in the format {metric_name}
        tags = re.findall(r'\{([a-zA-Z0-9_]+)\}', expanded_sql)
        
        # 2. Safely swap them
        for tag in tags:
            tag_lower = tag.lower()
            if tag_lower in self._registry:
                metric = self._registry[tag_lower]
                # Wrapping in parentheses ensures the order of operations 
                # is strictly preserved during injection
                expanded_sql = expanded_sql.replace(f"{{{tag}}}", f"({metric.sql_snippet})")
            else:
                logger.warning(f"[{self.tenant_id}] Governance Alert: LLM hallucinated an unregistered metric tag: {{{tag}}}")
                # We leave invalid tags in the string so the execution engine (DuckDB) 
                # hard-fails it with a syntax error, rather than silently computing bad data.

        if raw_sql != expanded_sql:
            logger.info(f"[{self.tenant_id}] Successfully applied mathematical governance to LLM payload.")
            logger.debug(f"Governed SQL: {expanded_sql}")
            
        return expanded_sql