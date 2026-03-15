# api/services/metric_governance.py

import re
import logging
from typing import Dict, List, Optional
from pydantic import BaseModel

# Import our SaaS connectors to dynamically pull their Gold Tier views
from api.services.integrations.stripe_connector import StripeConnector
from api.services.integrations.shopify_connector import ShopifyConnector
from api.services.integrations.salesforce_connector import SalesforceConnector

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
    
    Upgraded Engineering:
    - Inline Macro Injection: Safely expands `{metric}` tags in LLM-generated SQL into exact mathematical formulas.
    - Semantic View Aggregation: Dynamically pulls "Gold Tier" CTEs from SaaS connectors (Stripe, Shopify) 
      to provide the LLM with verified sub-queries for highly complex metrics like Win Rates or MRR.
    """

    # Registry of supported integrations for dynamic view loading
    CONNECTOR_REGISTRY = {
        "stripe": StripeConnector,
        "shopify": ShopifyConnector,
        "salesforce": SalesforceConnector
    }

    def __init__(self, tenant_id: str, db_session=None):
        self.tenant_id = tenant_id
        self.db = db_session
        self._inline_registry: Dict[str, GovernedMetric] = self._load_tenant_metrics()

    def _load_tenant_metrics(self) -> Dict[str, GovernedMetric]:
        """
        Loads the approved inline metric definitions for the workspace.
        In production, this queries the `public.governed_metrics` table using self.tenant_id
        so business users can define their own formulas in the UI.
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
            ),
            "gross_margin": GovernedMetric(
                name="gross_margin",
                friendly_name="Gross Margin Percentage",
                description="Standard gross margin percentage based on revenue and COGS.",
                sql_snippet="((SUM(revenue) - SUM(cogs)) * 100.0) / NULLIF(SUM(revenue), 0)",
                required_columns=["revenue", "cogs"]
            )
        }

    def get_semantic_views(self, integration_names: List[str]) -> Dict[str, str]:
        """
        Dynamically loads the "Gold Tier" SQL CTEs (Common Table Expressions) 
        from the active SaaS integrations. 
        
        This prevents the LLM from hallucinating complex multi-join logic for 
        things like Salesforce Pipeline Velocity or Stripe LTV.
        """
        aggregated_views = {}
        
        for integration in integration_names:
            integration_lower = integration.lower()
            if integration_lower in self.CONNECTOR_REGISTRY:
                try:
                    # Instantiate connector securely (mocking credentials just to get static views)
                    connector_class = self.CONNECTOR_REGISTRY[integration_lower]
                    connector_instance = connector_class(tenant_id=self.tenant_id, credentials={})
                    
                    # Merge views
                    views = connector_instance.get_semantic_views()
                    aggregated_views.update(views)
                except Exception as e:
                    logger.warning(f"[{self.tenant_id}] Failed to load semantic views for {integration}: {e}")
                    
        return aggregated_views

    def get_llm_prompt_context(self) -> str:
        """
        Generates a strict system prompt string to instruct the LLM on which 
        inline governed metrics are available for its Contextual RAG window.
        """
        if not self._inline_registry:
            return ""

        lines = ["\n### [STRICT INLINE METRIC GOVERNANCE] ###"]
        lines.append("You MUST use the following exact tags in your SELECT statements instead of writing manual calculations. DO NOT attempt to calculate these metrics yourself.")
        
        for name, metric in self._inline_registry.items():
            lines.append(f"- {{{name}}}: {metric.friendly_name}. {metric.description} (Requires columns: {', '.join(metric.required_columns)})")
        
        lines.append("\nExample Output Format:")
        lines.append("SELECT date_trunc('month', created_at) AS month, {mrr} AS total_mrr FROM stripe_subs GROUP BY 1;")
        lines.append("#########################################\n")
        
        return "\n".join(lines)

    def inject_governed_metrics(self, raw_sql: str) -> str:
        """
        Intercepts the LLM's raw SQL output and safely expands the macro tags 
        (e.g., `{mrr}`) into their highly optimized, mathematically precise DuckDB SQL equivalents.
        """
        if not raw_sql:
            return raw_sql
            
        expanded_sql = raw_sql

        # 1. Identify all tags in the format {metric_name} (Case insensitive)
        tags = set(re.findall(r'\{([a-zA-Z0-9_]+)\}', expanded_sql))
        
        # 2. Safely swap them
        for tag in tags:
            tag_lower = tag.lower()
            if tag_lower in self._inline_registry:
                metric = self._inline_registry[tag_lower]
                
                # Wrapping in parentheses ensures the order of operations 
                # is strictly preserved during injection
                safe_snippet = f"({metric.sql_snippet})"
                
                # Use regex sub to replace case-insensitively
                pattern = re.compile(rf'\{{{tag}\}}', re.IGNORECASE)
                expanded_sql = pattern.sub(safe_snippet, expanded_sql)
            else:
                logger.warning(f"[{self.tenant_id}] Governance Alert: LLM hallucinated an unregistered metric tag: {{{tag}}}")
                # We intentionally leave invalid tags in the string so the execution engine (DuckDB) 
                # hard-fails it with a syntax error. The Phase 4 Auto-Correction Loop will then catch
                # this error and force the LLM to fix it.

        if raw_sql != expanded_sql:
            logger.info(f"[{self.tenant_id}] Successfully applied mathematical governance to LLM payload.")
            logger.debug(f"Governed SQL: {expanded_sql}")
            
        return expanded_sql