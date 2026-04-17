// lib/seo/semantic-metric-governance.tsx

import { SEOPageData } from './index';

export const semanticMetricGovernanceData: SEOPageData = {
  type: 'guide',
  seo: {
    title: "Semantic Metric Governance for Reliable AI SQL | Arcli",
    description: "Eliminate Text-to-SQL hallucinations. Arcli's embedded semantic layer standardizes enterprise metrics, ensuring AI data agents always query governed definitions.",
    h1: "Semantic Metric Governance & LLM Hallucination Prevention",
    keywords: [
      "semantic layer", 
      "metric governance", 
      "preventing LLM hallucinations", 
      "text-to-sql accuracy", 
      "semantic routing", 
      "enterprise AI analytics"
    ],
    intent: 'guide',
    canonicalDomain: 'https://arcli.tech/platform/semantic-metric-governance'
  },
  
  hero: {
    badge: "Core Architecture: The Semantic Engine",
    title: "Stop LLM Hallucinations at the Source",
    subtitle: "Naive Text-to-SQL fails in production because LLMs don't understand your business logic. Arcli's semantic engine maps natural language to strictly governed metric definitions, guaranteeing 100% accurate, deterministic SQL generation.",
    trustSignals: [
      "Deterministic Abstract Syntax Tree (AST) Parsing",
      "Compatible with dbt & LookML frameworks",
      "Zero-shot semantic routing accuracy > 98%"
    ]
  },

  blocks: [
    {
      type: 'ContrarianBanner',
      statement: "Why 'Just plugging GPT-4 into your database' is a disaster.",
      subtext: "If you connect a raw LLM to your data warehouse and ask 'What is our revenue?', the AI will guess. It might sum the `amount` column, completely ignoring refunds, taxes, and voided transactions. Without a semantic layer enforcing business logic, AI analytics is a liability. Arcli separates the 'understanding' from the 'calculation'."
    },
    {
      type: 'InformationGain',
      uniqueInsight: "Naive LLM text-to-SQL fails because models guess table relationships and mathematical formulas. Arcli bypasses this entirely by compiling intents into an Abstract Syntax Tree (AST) that maps to explicitly governed YAML definitions, ensuring 100% deterministic mathematical accuracy.",
      structuralAdvantage: "Exposes a complete, deeply nested SQL query generated via Semantic DAG traversal, providing incontrovertible proof that the LLM acts only as a router, while the governance layer writes the math."
    },
    {
      type: 'ArchitectureDiagram',
      data: {
        title: "The Arcli Semantic Resolution Pipeline",
        steps: [
          {
            title: "User Intent Recognition",
            description: "Parses the user's natural language to identify requested entities, time bounds, and dimensional cuts."
          },
          {
            title: "Semantic Graph Traversal",
            description: "The engine maps the identified intent to the explicit YAML definition, retrieving the required base tables and join paths."
          },
          {
            title: "AST Query Compilation",
            description: "Arcli compiles the semantic logic into an Abstract Syntax Tree (AST), injecting predefined filters (e.g., `status = 'active'`) and resolving complex DAG dependencies."
          },
          {
            title: "Dialect-Specific SQL Execution",
            description: "Translates the AST into highly optimized SQL specific to your storage layer and executes it without hallucination."
          }
        ]
      }
    },
    {
      type: 'ComparisonMatrix',
      rows: [
        { 
          category: "Deterministic Accuracy", 
          arcliAdvantage: "100% (Math is hardcoded via Semantic DAG)", 
          legacy: "Variable (Hallucinates logic and joins)" 
        },
        { 
          category: "Time to Deploy", 
          arcliAdvantage: "Minutes (AI assisted YAML definitions)", 
          legacy: "Months (Heavy Data Engineering & dbt models)" 
        },
        { 
          category: "Handling Schema Changes", 
          arcliAdvantage: "Update one single Semantic YAML mapping", 
          legacy: "Requires rewriting rigid LookML views or reports" 
        }
      ]
    },
    {
      type: 'AnalyticsDashboard',
      data: {
        title: "Compiled Output: The Power of the Semantic DAG",
        description: "When a user asks 'Show me Net Margin by Product Category', the Arcli engine references the Semantic DAG to generate this nested, deterministic query.",
        dialect: "DuckDB SQL (Embedded Execution)",
        code: `-- Arcli Semantic Compiler Output
-- Request Intent: "Net Margin by Product Category for Q3 2025"
-- Resolved Semantic Metrics: [gross_revenue, cogs, refund_amount, net_margin]

WITH base_sales AS (
    -- Semantic Definition: Gross Revenue
    -- Governance Rule: Exclude failed and disputed charges
    SELECT 
        item_id,
        SUM(amount_cents) / 100.0 AS gross_revenue
    FROM tenant_99.raw_stripe_charges
    WHERE created_at >= '2025-07-01' AND created_at < '2025-10-01'
      AND status = 'succeeded'
      AND disputed IS FALSE
    GROUP BY 1
),
base_refunds AS (
    -- Semantic Definition: Refund Amount
    SELECT 
        item_id,
        SUM(amount_cents) / 100.0 AS refund_amount
    FROM tenant_99.raw_stripe_refunds
    WHERE created_at >= '2025-07-01' AND created_at < '2025-10-01'
    GROUP BY 1
),
base_costs AS (
    -- Semantic Definition: COGS (Cost of Goods Sold)
    SELECT 
        item_id,
        category AS product_category,
        (vendor_cost_usd + 0.30) AS cogs
    FROM tenant_99.product_catalog
),
semantic_join AS (
    -- Traversing the DAG to unify metrics
    SELECT 
        c.product_category,
        COALESCE(s.gross_revenue, 0) AS gross_revenue,
        COALESCE(r.refund_amount, 0) AS refund_amount,
        COALESCE(c.cogs, 0) AS total_cogs
    FROM base_sales s
    LEFT JOIN base_refunds r ON s.item_id = r.item_id
    LEFT JOIN base_costs c ON s.item_id = c.item_id
)
-- Final Semantic Calculation: Net Margin
-- Governance Formula: (Gross - Refunds - COGS) / (Gross - Refunds)
SELECT 
    product_category,
    SUM(gross_revenue) AS total_revenue,
    SUM(refund_amount) AS total_refunds,
    SUM(total_cogs) AS total_cogs,
    CASE 
        WHEN SUM(gross_revenue - refund_amount) = 0 THEN 0
        ELSE ROUND(
            (SUM(gross_revenue - refund_amount - total_cogs) / SUM(gross_revenue - refund_amount)) * 100, 
        2)
    END AS net_margin_percentage
FROM semantic_join
GROUP BY 1
ORDER BY net_margin_percentage DESC;`,
        businessOutcome: "Guarantees 100% financial accuracy. The governance layer acts as the impenetrable calculator, ensuring enterprise-grade trust in AI outputs."
      }
    },
    {
      type: 'SecurityGuardrails',
      items: [
        {
          title: "Metric CI/CD",
          description: "Changes to semantic definitions can be version-controlled and tested against staging data, ensuring no unverified math hits production."
        },
        {
          title: "Immutable Audit Logs",
          description: "Every time an AI agent resolves a semantic metric, the exact version of the definition used is hashed and logged."
        },
        {
          title: "Fallback Constraints",
          description: "If a question cannot be mapped to governed metrics, Arcli triggers a 'Graceful Refusal' rather than hallucinating a dangerous guess."
        }
      ]
    },
    {
      type: 'CTAGroup',
      primaryCTA: {
        text: "Read the Whitepaper",
        href: "/resources/hallucination-prevention"
      },
      secondaryCTA: {
        text: "Explore the Architecture",
        href: "#architecture"
      }
    }
  ],

  faqs: [
    {
      q: "Can Arcli connect to my existing dbt semantic layer?",
      a: "Yes. Arcli integrates seamlessly with dbt Core. We ingest your `metrics.yml` files and use them as the source of truth for our NLP-to-SQL compiler.",
      persona: "Data Engineer"
    },
    {
      q: "How does the system handle multi-tenant metrics in a SaaS environment?",
      a: "Arcli is designed for B2B SaaS. A single 'MRR' definition securely computes only the MRR for the requesting tenant via mandatory row-level security parameters injected automatically at the AST level.",
      persona: "CTO / Software Architect"
    },
    {
      q: "What happens if a user asks a fundamentally unanswerable question?",
      a: "The Semantic Router detects when requested dimensions are incompatible (e.g., 'Ad Spend by Employee Name'). Instead of writing a broken CROSS JOIN, the AI gracefully intervenes to explain why the query is invalid.",
      persona: "Data Analyst"
    }
  ]
};