// lib/seo/semantic-metric-governance.tsx

/**
 * V13 ENFORCED: Semantic Metric Governance Architecture
 * Upgraded to include strict Info Gain, Conversion Engine, and UI Mappings.
 * * FIXES APPLIED:
 * - Moved uiVisualizations from root into the blocks array as properly typed UIBlocks.
 * - Converted ComparisonMatrix rows from strings to strict object definitions.
 * - Updated SecurityGuardrails to use the 'items' array key.
 */
export const semanticMetricGovernanceData = {
  path: "/platform/semantic-metric-governance",
  type: "architecture-guide",

  // 💡 V13: INFORMATION GAIN SYSTEM
  informationGain: {
    uniqueInsight: "Naive LLM text-to-SQL fails because models guess table relationships and mathematical formulas. Arcli bypasses this entirely by compiling intents into an Abstract Syntax Tree (AST) that maps to explicitly governed YAML definitions, ensuring 100% deterministic mathematical accuracy.",
    structuralAdvantage: "Exposes a complete, deeply nested DuckDB SQL query generated via Semantic DAG traversal, providing incontrovertible proof that the LLM acts only as a router, while the governance layer writes the math."
  },

  // 🎯 V13: CONVERSION ENGINE
  conversionEngine: {
    primaryCTA: { text: "Read the Whitepaper", link: "/resources/hallucination-prevention" },
    secondaryCTA: { text: "Explore the Architecture", link: "#architecture" },
    contextualCTA: { text: "View our dbt Core Integration Docs", link: "/docs/integrations/dbt", placement: "mid-article" }
  },

  // 🧬 V13: STRUCTURED DATA LAYER
  schemaMarkup: {
    type: "TechArticle",
    payload: {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "headline": "Semantic Metric Governance & LLM Hallucination Prevention",
      "proficiencyLevel": "Expert",
      "keywords": "Semantic Layer, Metric Governance, LLM Hallucinations, Text-to-SQL, AST Parsing",
      "publisher": { "@type": "Organization", "name": "Arcli" }
    }
  },

  meta: {
    title: "Semantic Metric Governance & LLM Hallucination Prevention | Arcli",
    description: "Eliminate Text-to-SQL hallucinations. Arcli's embedded semantic layer standardizes enterprise metrics, ensuring AI data agents always query governed definitions.",
    keywords: [
      "semantic layer", 
      "metric governance", 
      "preventing LLM hallucinations", 
      "text-to-sql accuracy", 
      "semantic routing", 
      "enterprise AI analytics"
    ]
  },

  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "Core Architecture: The Semantic Engine",
        title: "Stop LLM Hallucinations at the Source",
        subtitle: "Naive Text-to-SQL fails in production because LLMs don't understand your business logic. Arcli's semantic engine maps natural language to strictly governed metric definitions, guaranteeing 100% accurate, deterministic SQL generation.",
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
        argument: "If you connect a raw LLM to your data warehouse and ask 'What is our revenue?', the AI will guess. It might sum the `amount` column, completely ignoring refunds, taxes, and voided transactions. Without a semantic layer enforcing business logic, AI analytics is a liability.",
        solution: "Arcli separates the 'understanding' from the 'calculation'. The AI interprets the user's intent, but the Semantic Layer dictates the exact mathematical formula used to execute it."
      }
    },
    {
      type: "ExecutiveSummary",
      payload: {
        heading: "Govern Once, Query Infinitely",
        businessOutcome: "By centralizing metric definitions, Arcli ensures that the CEO, the marketing team, and the automated anomaly watchdogs are all looking at the exact same numbers, calculated the exact same way.",
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
    
    // [FIXED] Moved root uiVisualizations here as properly mapped UIBlocks
    {
      type: "UIBlock",
      payload: {
        visualizationType: "ProcessStepper",
        dataMapping: {
          title: "Semantic Traversal",
          steps: [
            { title: "User Intent", description: "Recognize natural language input." },
            { title: "Graph Traversal", description: "Locate YAML definition." },
            { title: "AST Compilation", description: "Generate Abstract Syntax Tree." },
            { title: "Executable SQL", description: "Query the warehouse." }
          ]
        },
        interactionPurpose: "Allows Data Architects to visually trace the journey of a prompt.",
        intentServed: "Architectural Validation"
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
            description: "Parses the user's natural language to identify requested entities, time bounds, and dimensional cuts."
          },
          {
            name: "2. Semantic Graph Traversal",
            description: "The engine maps the identified intent ('MRR') to the explicit YAML definition, retrieving the required base tables and join paths."
          },
          {
            name: "3. AST Query Compilation",
            description: "Arcli compiles the semantic logic into an Abstract Syntax Tree (AST), injecting predefined filters (e.g., `status = 'active'`) and resolving complex DAG dependencies."
          },
          {
            name: "4. Dialect-Specific SQL Generation",
            description: "The AST is translated into highly optimized SQL specific to your storage layer (DuckDB, Snowflake, or PostgreSQL)."
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
            description: "The AI agent asks the Semantic Layer for the definition of 'LTV' and 'CAC', and then orchestrates a complex JOIN between the two pre-governed subqueries based on the 'channel' dimension."
          },
          {
            level: "Strategic",
            title: "Handling Synonyms and Aliasing",
            businessQuestion: "What's our churn rate for annual plans?",
            description: "The semantic layer maps user-friendly synonyms to database-strict enumerations, ensuring the LLM never hallucinates a `WHERE plan_type = 'annual'` filter that returns zero rows."
          }
        ]
      }
    },
    
    // [FIXED] Moved root uiVisualizations here as properly mapped UIBlocks
    {
      type: "UIBlock",
      payload: {
        visualizationType: "MetricsChart",
        dataMapping: {
          title: "SQL Generation Comparison",
          codeSnippet: {
            filename: "query_diff.sql",
            language: "sql",
            code: "-- Hallucinated LLM SQL\nSELECT SUM(amount) FROM sales;\n\n-- Arcli Semantic DAG SQL\nSELECT SUM(gross - refund) FROM governed_sales;"
          },
          governedOutputs: [
            { label: "Accuracy", value: "100%", status: "Governed" }
          ]
        },
        interactionPurpose: "Highlights the structural difference between a naive SELECT and a governed CTE.",
        intentServed: "Technical Execution Proof"
      }
    },

    {
      type: "StrategicQuery",
      payload: {
        title: "Compiled Output: The Power of the Semantic DAG",
        description: "When a user asks 'Show me Net Margin by Product Category', the Arcli engine references the Semantic DAG to generate this nested, deterministic query.",
        businessOutcome: "Guarantees 100% financial accuracy. The governance layer acts as the impenetrable calculator, ensuring enterprise-grade trust.",
        language: "sql",
        code: `
-- Arcli Semantic Compiler Output
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
ORDER BY net_margin_percentage DESC;
        `
      }
    },
    {
      type: "ComparisonBlock", // Maps to Matrix component
      payload: {
        title: "Semantic Approaches: Arcli vs Alternatives",
        description: "Evaluating the structural integrity of AI-generated queries.",
        visualizationType: "ComparisonTable",
        columns: ["Feature", "Arcli Semantic Engine", "Naive LLM (ChatGPT)", "Traditional BI (Looker)"],
        // [FIXED] Updated rows to strictly map to Matrix component object structure
        rows: [
          { category: "Deterministic Accuracy", arcliAdvantage: "100% (Math is hardcoded)", legacy: "Variable (Hallucinates)" },
          { category: "Time to Deploy", arcliAdvantage: "Minutes (AI assisted YAML)", legacy: "Months (Data engineering)" },
          { category: "Handling Schema Changes", arcliAdvantage: "Update one YAML file", legacy: "Requires rewriting LookML views" }
        ]
      }
    },
    {
      type: "SecurityGuardrails",
      payload: {
        title: "Governance & Version Control",
        description: "Treat your business metrics like production code.",
        // [FIXED] Changed "features" to "items"
        items: [
          {
            title: "Metric CI/CD",
            description: "Changes to semantic definitions can be version-controlled and tested against staging data."
          },
          {
            title: "Immutable Audit Logs",
            description: "Every time an AI agent resolves a semantic metric, the exact version of the definition used is hashed and logged."
          },
          {
            title: "Fallback Constraints",
            description: "If a question cannot be mapped to governed metrics, Arcli triggers a 'Graceful Refusal' rather than guessing."
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
            question: "Can Arcli connect to my existing dbt semantic layer?",
            answer: "Yes. Arcli integrates seamlessly with dbt Core. We ingest your `metrics.yml` files and use them as the source of truth for our NLP-to-SQL compiler."
          },
          {
            question: "How does the system handle multi-tenant metrics in a SaaS environment?",
            answer: "Arcli is designed for B2B SaaS. A single 'MRR' definition securely computes only the MRR for the requesting tenant via mandatory row-level security parameters injected at the AST level."
          },
          {
            question: "What happens if a user asks a fundamentally unanswerable question?",
            answer: "The Semantic Router detects when requested dimensions are incompatible (e.g., 'Ad Spend by Employee Name'). Instead of writing a broken CROSS JOIN, the AI gracefully intervenes."
          }
        ]
      }
    }
  ]
};