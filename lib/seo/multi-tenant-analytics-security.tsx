// lib/seo/multi-tenant-analytics-security.tsx

/**
 * V13 ENFORCED: Multi-Tenant Security Architecture
 * Upgraded to include strict Info Gain, Conversion Engine, and UI Mappings.
 */
export const multiTenantAnalyticsSecurityData = {
  path: "/architecture/multi-tenant-security",
  type: "architecture-guide",
  
  // 💡 V13: INFORMATION GAIN SYSTEM
  informationGain: {
    uniqueInsight: "Telling an LLM 'only query tenant X' is a critical vulnerability. Arcli uniquely solves this by stripping the LLM of security duties, injecting bounds deterministically via AST (Abstract Syntax Tree) parsing before execution.",
    structuralAdvantage: "Provides a side-by-side Technical Diff of Native RLS Execution vs Application-Layer filtering, serving as direct proof for Infosec teams."
  },

  // 🎯 V13: CONVERSION ENGINE
  conversionEngine: {
    primaryCTA: { text: "Read the Security Whitepaper", link: "/resources/security-architecture" },
    secondaryCTA: { text: "View RLS Implementation", link: "#strategic-query" },
    contextualCTA: { text: "Book an Infosec Review", link: "/contact/security", placement: "mid-article" }
  },

  // 🧱 V13: UI VISUALIZATION ENGINE
  uiVisualizations: [
    {
      type: "mermaid-architecture",
      dataMapping: "JWT Authentication -> AI Intent -> AST Parser (Tenant Injection) -> DB Execution",
      interactionPurpose: "Allows CISOs to visually verify the physical separation between untrusted AI intents and the trusted execution layer.",
      intentServed: "Security Validation & Trust"
    },
    {
      type: "sql-diff-viewer",
      dataMapping: "Unbounded AI Generated SQL vs AST-Bounded Executed SQL",
      interactionPurpose: "Highlights the forced `tenant_id` injection in a red/green code diff.",
      intentServed: "Technical Execution Proof"
    }
  ],

  // 🧬 V13: STRUCTURED DATA LAYER
  schemaMarkup: {
    type: "TechArticle",
    payload: {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "headline": "Zero-Trust Multi-Tenant Analytics & Row-Level Security",
      "proficiencyLevel": "Expert",
      "keywords": "Row-Level Security, Multi-Tenant SaaS, AST Injection, LLM Security",
      "publisher": { "@type": "Organization", "name": "Arcli" }
    }
  },

  meta: {
    title: "Multi-Tenant Analytics Security & Row-Level Security (RLS) | Arcli",
    description: "Embed AI analytics with zero risk of cross-tenant data leakage. Arcli enforces strict Row-Level Security, ephemeral query isolation, and immutable audit logging.",
    keywords: [
      "multi-tenant analytics", 
      "embedded BI security", 
      "Row-Level Security", 
      "RLS data architecture", 
      "cross-tenant data leakage"
    ]
  },

  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "Enterprise Architecture & Trust",
        title: "Zero-Trust Multi-Tenant Analytics",
        subtitle: "The greatest risk of embedded AI is an LLM hallucinating a query that exposes Tenant A's data to Tenant B. Arcli physically prevents this by enforcing cryptographic Row-Level Security before any SQL reaches the database.",
        trustSignals: [
          "SOC 2 Type II Compliant",
          "Mandatory AST-Level Tenant Injection",
          "Ephemeral Execution Contexts"
        ]
      }
    },
    {
      type: "ContrarianBanner",
      payload: {
        heading: "Why 'Prompt Engineering' is not a security strategy.",
        argument: "Telling an LLM, 'Only query data where tenant_id = 123' is a catastrophic security vulnerability. AI models are probabilistic and vulnerable to prompt injection; they can easily drop WHERE clauses.",
        solution: "Arcli removes the LLM from the security perimeter entirely. The AI generates the intent, but the Arcli Query Compiler forcefully injects the Tenant ID into the Abstract Syntax Tree (AST) at the execution layer. The database physically rejects out-of-bound access."
      }
    },
    {
      type: "ExecutiveSummary",
      payload: {
        heading: "De-Risking Embedded Analytics for SaaS",
        businessOutcome: "Building multi-tenant BI from scratch requires 6-12 months of dedicated data engineering. Arcli provides a pre-certified, mathematically secure perimeter out-of-the-box, accelerating time-to-market while satisfying enterprise infosec audits.",
        pillars: [
          {
            title: "Absolute Tenant Isolation",
            description: "Whether you use a shared-schema (pool) or isolated-schema (silo) architecture, Arcli dynamically scopes all queries to the authenticated user's JWT claims."
          },
          {
            title: "Immutable Auditability",
            description: "Every query executed is hashed, timestamped, and stored in the `audit_logger`, proving exactly who accessed what data and when."
          },
          {
            title: "Zero-Data Retention",
            description: "Arcli pushes compute to your warehouse or executes in memory via DuckDB. We do not store your customers' raw PII in our application state."
          }
        ]
      }
    },
    {
      type: "Architecture",
      payload: {
        title: "The Secure Execution Pipeline",
        description: "How Arcli's `tenant_security_provider` guarantees isolation.",
        components: [
          {
            name: "1. JWT & Claim Validation",
            description: "Arcli validates the secure JWT, extracting the `tenant_id` and RBAC permissions."
          },
          {
            name: "2. LLM Intent Generation (Untrusted)",
            description: "The AI agent generates a raw SQL projection. At this stage, the SQL is considered untrusted."
          },
          {
            name: "3. AST Parsing & Boundary Injection",
            description: "Arcli parses the untrusted SQL into an Abstract Syntax Tree. The `query_planner` forcefully injects `WHERE tenant_id = X`. It strictly rejects UNIONs or subqueries bypassing this."
          },
          {
            name: "4. RLS-Enforced Execution",
            description: "Executed using a restricted database role that inherently enforces native PostgreSQL/Snowflake Row-Level Security."
          }
        ]
      }
    },
    {
      type: "StrategicQuery",
      payload: {
        title: "Defense in Depth: AST Injection + PostgreSQL RLS",
        description: "We integrate directly with your database's native Row-Level Security capabilities.",
        businessOutcome: "Even if the application logic were somehow compromised, the database engine itself physically rejects the query, ensuring zero chance of a PR disaster.",
        language: "sql",
        code: `
-- Step 1: Native Database Security (One-time setup)
ALTER TABLE enterprise_schema.fact_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON enterprise_schema.fact_transactions
    USING (tenant_id = current_setting('arcli.current_tenant_id')::UUID);

-- ====================================================================

-- Step 2: Per-Query Execution (Handled by Arcli Execution Engine)
BEGIN;

-- Arcli automatically sets the local transaction variable from the verified JWT
SET LOCAL arcli.current_tenant_id = 'a8f9b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c';

-- The AST Compiler verifies and executes within the bounded block
SELECT customer_email, SUM(amount_usd) as total_ltv
FROM enterprise_schema.fact_transactions
GROUP BY 1 ORDER BY total_ltv DESC LIMIT 5;

COMMIT;
        `
      }
    },
    {
      type: "ComparisonMatrix",
      payload: {
        title: "Multi-Tenant Architecture Comparison",
        columns: ["Security Vector", "Arcli (Embedded AI)", "DIY Built-in-House", "Traditional BI Embed (Looker)"],
        rows: [
          ["Cross-Tenant Leak", "AST Injection + Native RLS", "Manual WHERE appending", "Parameterized filters"],
          ["Prompt Injection Defense", "Semantic Layer Separation", "Vulnerable", "N/A (No AI Native layer)"],
          ["Compute Isolation", "Ephemeral Sandboxing (DuckDB)", "Shared DB resources", "Shared BI cluster"]
        ]
      }
    },
    {
      type: "FAQs",
      payload: {
        title: "CISO & Architect FAQs",
        faqs: [
          {
            question: "How does Arcli handle connection pooling in a multi-tenant environment?",
            answer: "Arcli uses advanced connection pooling but ensures that context parameters (like `SET LOCAL current_tenant_id`) are applied transactionally. This guarantees state-cleared connections."
          },
          {
            question: "Can an AI agent run a DELETE or UPDATE command?",
            answer: "Absolutely not. Arcli enforces a strict Read-Only environment stripped of all DML and DDL privileges. Even if the AI generates a `DROP TABLE` command, the database engine will reject it."
          }
        ]
      }
    }
  ]
};