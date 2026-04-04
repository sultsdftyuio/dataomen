// lib/seo/semantic-metric-governance.tsx

export const semanticMetricGovernanceData = {
  path: "/platform/semantic-metric-governance",
  meta: {
    title: "Semantic Metric Governance & LLM Hallucination Prevention | Arcli",
    description: "Eliminate Text-to-SQL hallucinations. Arcli's embedded semantic layer standardizes enterprise metrics, ensuring AI data agents always query governed definitions, not raw, untyped tables.",
    keywords: [
      "semantic layer", 
      "metric governance", 
      "preventing LLM hallucinations", 
      "text-to-sql accuracy", 
      "semantic routing", 
      "enterprise AI analytics",
      "data standardization"
    ]
  },
  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "Core Architecture: The Semantic Engine",
        title: "Stop LLM Hallucinations at the Source",
        subtitle: "Naive Text-to-SQL fails in production because LLMs don't understand your business logic. Arcli's semantic engine maps natural language to strictly governed metric definitions, guaranteeing 100% accurate, deterministic SQL generation.",
        primaryCta: {
          label: "Read the Whitepaper",
          href: "/resources/hallucination-prevention"
        },
        secondaryCta: {
          label: "Explore the Architecture",
          href: "#architecture"
        },
        trustSignals: [
          "Deterministic Abstract Syntax Tree (AST) Parsing",
          "Compatible with dbt & LookML frameworks",
          "Zero-shot semantic routing accuracy > 98%"
        ]
      }
    },
    {
      type: "ContrarianBanner",
      payload: {
        heading: "Why 'Just plugging GPT-4 into your database' is a disaster.",
        argument: "If you connect a raw LLM to your data warehouse and ask 'What is our revenue?', the AI will guess. It might sum the `amount` column, completely ignoring refunds, taxes, and voided transactions. Without a semantic layer enforcing business logic, AI analytics is a liability, not an asset.",
        solution: "Arcli separates the 'understanding' from the 'calculation'. The AI interprets the user's intent, but the Semantic Layer dictates the exact mathematical formula used to execute it."
      }
    },
    {
      type: "ExecutiveSummary",
      payload: {
        heading: "Govern Once, Query Infinitely",
        businessOutcome: "By centralizing metric definitions, Arcli ensures that the CEO, the marketing team, and the automated anomaly watchdogs are all looking at the exact same numbers, calculated the exact same way. This eliminates board-level disputes over data validity.",
        pillars: [
          {
            title: "Single Source of Truth",
            description: "Define 'Active User' or 'Net Revenue' once in Arcli using YAML or our UI. Every AI agent across your tenant inherits this explicit definition automatically."
          },
          {
            title: "Schema Drift Resilience",
            description: "When upstream database schemas change, you only update the semantic mapping. The AI agents continue answering questions without requiring prompt re-engineering."
          },
          {
            title: "Role-Based Metric Access",
            description: "Restrict sensitive semantic metrics (e.g., 'Executive Payroll') to authorized roles while allowing company-wide access to 'Daily Active Users'."
          }
        ]
      }
    },
    {
      type: "Architecture",
      payload: {
        title: "The Arcli Semantic Resolution Pipeline",
        description: "How a plain English question is deterministically compiled into governed SQL.",
        components: [
          {
            name: "1. Intent Recognition Engine",
            description: "Parses the user's natural language to identify requested entities, time bounds, and dimensional cuts (e.g., 'Show me MRR for Enterprise customers in Q3')."
          },
          {
            name: "2. Semantic Graph Traversal",
            description: "The engine maps the identified intent ('MRR') to the explicit YAML definition in the Arcli Governance Layer, retrieving the required base tables and join paths."
          },
          {
            name: "3. AST Query Compilation",
            description: "Arcli compiles the semantic logic into an Abstract Syntax Tree (AST), injecting predefined filters (e.g., `status = 'active'`) and resolving complex DAG dependencies."
          },
          {
            name: "4. Dialect-Specific SQL Generation",
            description: "The AST is translated into highly optimized SQL specific to your storage layer (DuckDB, Snowflake, or PostgreSQL) and executed securely."
          }
        ]
      }
    },
    {
      type: "UseCases",
      payload: {
        title: "Solving Enterprise Ambiguity",
        scenarios: [
          {
            level: "Basic",
            title: "Standardizing 'Active User'",
            businessQuestion: "How many active users did we have last week?",
            description: "Ambiguity: Does 'active' mean logged in, or executed a core action? Semantic Layer Fix: Arcli is pre-configured so that 'Active User' strictly resolves to `events.type = 'core_action' AND events.timestamp > current_date - 7`."
          },
          {
            level: "Intermediate",
            title: "Cross-Metric Mathematical Operations",
            businessQuestion: "What is our LTV to CAC ratio by acquisition channel?",
            description: "The AI agent doesn't calculate this from scratch. It asks the Semantic Layer for the definition of 'LTV' and the definition of 'CAC', and then orchestrates a complex JOIN between the two pre-governed subqueries based on the 'channel' dimension."
          },
          {
            level: "Strategic",
            title: "Handling Synonyms and Aliasing",
            businessQuestion: "What's our churn rate for annual plans?",
            description: "A user asks for 'annual plans', but the database stores it as `interval = 'year'`. The semantic layer maps user-friendly synonyms to database-strict enumerations, ensuring the LLM never hallucinates a `WHERE plan_type = 'annual'` filter that returns zero rows."
          }
        ]
      }
    },
    {
      type: "StrategicQuery",
      payload: {
        title: "Compiled Output: The Power of the Semantic DAG",
        description: "When a user asks 'Show me Net Margin by Product Category', the Arcli engine references the Semantic DAG to generate this deeply nested, deterministic DuckDB query. The LLM did not write this math; the Semantic Layer strictly enforced it.",
        businessOutcome: "Guarantees 100% financial accuracy. The AI acts as the interface, but the governance layer acts as the impenetrable calculator, ensuring enterprise-grade trust.",
        language: "sql",
        code: `
-- Arcli Semantic Compiler Output
-- Request Intent: "Net Margin by Product Category for Q3 2025"
-- Resolved Semantic Metrics: [gross_revenue, cogs, refund_amount, net_margin]
-- Resolved Dimensions: [product_category]

WITH base_sales AS (
    -- Semantic Definition: Gross Revenue
    -- Source Table: tenant_99.raw_stripe_charges
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
    -- Source Table: tenant_99.raw_stripe_refunds
    SELECT 
        item_id,
        SUM(amount_cents) / 100.0 AS refund_amount
    FROM tenant_99.raw_stripe_refunds
    WHERE created_at >= '2025-07-01' AND created_at < '2025-10-01'
    GROUP BY 1
),
base_costs AS (
    -- Semantic Definition: COGS (Cost of Goods Sold)
    -- Governance Rule: Vendor cost + processing fee constant
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
ORDER BY net_margin_percentage DESC;
        `
      }
    },
    {
      type: "ComparisonMatrix",
      payload: {
        title: "Semantic Approaches: Arcli vs Alternatives",
        description: "How Arcli's embedded AI semantic layer compares to traditional and naive approaches.",
        columns: ["Feature", "Arcli Semantic Engine", "Naive LLM (ChatGPT / LangChain)", "Traditional BI (Looker)"],
        rows: [
          ["Deterministic Accuracy", "100% (Math is hardcoded)", "Variable (Prone to hallucination)", "100% (But rigid)"],
          ["Time to Deploy", "Minutes (AI assisted YAML generation)", "Minutes (But requires constant prompt fixing)", "Months (Requires heavy data engineering)"],
          ["Natural Language Interface", "Native & Context-Aware", "Native", "Bolted-on / Third-party"],
          ["Handling Schema Changes", "Update one YAML file", "Breakage across all prompts", "Requires rewriting LookML views"],
          ["Multi-Tenant Metric Scoping", "Native Row-Level Security", "Requires massive context injection", "Complex parameterized configurations"]
        ]
      }
    },
    {
      type: "SecurityGuardrails",
      payload: {
        title: "Governance & Version Control",
        description: "Treat your business metrics like production code.",
        features: [
          {
            title: "Metric CI/CD",
            description: "Changes to semantic definitions can be version-controlled. Test changes against staging data to ensure historical numbers don't unexpectedly shift before deploying to production AI agents."
          },
          {
            title: "Immutable Audit Logs",
            description: "Every time an AI agent resolves a semantic metric, the exact version of the definition used is hashed and logged, allowing full backward traceability of executive reports."
          },
          {
            title: "Fallback Constraints",
            description: "If a user asks a question that cannot be mapped to governed metrics, the Arcli engine triggers a 'Graceful Refusal' workflow rather than guessing, maintaining absolute data integrity."
          }
        ]
      }
    },
    {
      type: "FAQs",
      payload: {
        title: "Deep Dive: Metric Governance FAQs",
        faqs: [
          {
            question: "Do I have to write YAML to use Arcli?",
            answer: "No. While Arcli compiles down to standard YAML/JSON definitions for version control, we provide a UI-based 'Metric Builder' and an AI assistant that profiles your database to suggest metric definitions automatically."
          },
          {
            question: "Can Arcli connect to my existing dbt semantic layer?",
            answer: "Yes. Arcli integrates seamlessly with dbt Core. We ingest your `metrics.yml` files and use them as the source of truth for our NLP-to-SQL compiler, acting as the intelligent interface on top of your existing engineering work."
          },
          {
            question: "How does the system handle multi-tenant metrics in a SaaS environment?",
            answer: "Arcli is designed for B2B SaaS. Metric definitions are bound to the schema level, but execution is dynamically injected with Tenant IDs. A single 'MRR' definition securely computes only the MRR for the requesting tenant via mandatory row-level security."
          },
          {
            question: "What happens if a user asks a fundamentally unanswerable question?",
            answer: "The Semantic Router detects when requested dimensions are incompatible (e.g., asking for 'Ad Spend by Employee Name'). Instead of writing a broken CROSS JOIN, the AI intervenes, explaining the incompatibility based on the semantic graph."
          },
          {
            question: "How does the LLM know which metrics exist without a massive context window?",
            answer: "Arcli uses highly optimized vector search and metadata retrieval. We do not inject your entire schema into the LLM prompt. We use a multi-stage RAG (Retrieval-Augmented Generation) pipeline to fetch only the relevant semantic definitions needed for the user's specific query."
          }
        ]
      }
    }
  ]
};