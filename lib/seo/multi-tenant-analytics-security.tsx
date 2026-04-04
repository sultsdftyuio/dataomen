// lib/seo/multi-tenant-analytics-security.tsx

export const multiTenantAnalyticsSecurityData = {
  path: "/architecture/multi-tenant-security",
  meta: {
    title: "Multi-Tenant Analytics Security & Row-Level Security (RLS) | Arcli",
    description: "Embed AI analytics with zero risk of cross-tenant data leakage. Arcli enforces strict Row-Level Security, ephemeral query isolation, and immutable audit logging at the engine level.",
    keywords: [
      "multi-tenant analytics", 
      "embedded BI security", 
      "Row-Level Security", 
      "RLS data architecture", 
      "cross-tenant data leakage", 
      "SaaS analytics infrastructure",
      "tenant isolation AI"
    ]
  },
  blocks: [
    {
      type: "Hero",
      payload: {
        badge: "Enterprise Architecture & Trust",
        title: "Zero-Trust Multi-Tenant Analytics",
        subtitle: "The greatest risk of embedded AI is an LLM hallucinating a query that exposes Tenant A's data to Tenant B. Arcli's execution engine physically prevents this by enforcing cryptographic Row-Level Security before any SQL reaches the database.",
        primaryCta: {
          label: "Read the Security Whitepaper",
          href: "/resources/security-architecture"
        },
        secondaryCta: {
          label: "View RLS Implementation",
          href: "#strategic-query"
        },
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
        businessOutcome: "Building multi-tenant BI from scratch requires 6-12 months of dedicated data engineering just to ensure data boundaries are safe. Arcli provides a pre-certified, mathematically secure multi-tenant perimeter out-of-the-box, accelerating time-to-market while satisfying enterprise infosec audits.",
        pillars: [
          {
            title: "Absolute Tenant Isolation",
            description: "Whether you use a shared-schema (pool) or isolated-schema (silo) database architecture, Arcli dynamically scopes all queries to the authenticated user's JWT claims."
          },
          {
            title: "Immutable Auditability",
            description: "Every query executed by an AI agent is hashed, timestamped, and stored in the `audit_logger`, proving to your compliance teams exactly who accessed what data and when."
          },
          {
            title: "Zero-Data Retention",
            description: "Arcli pushes compute to your warehouse or executes in memory via DuckDB. We do not store your customers' raw PII in our application state, minimizing your third-party attack surface."
          }
        ]
      }
    },
    {
      type: "Architecture",
      payload: {
        title: "The Secure Execution Pipeline",
        description: "How Arcli's `tenant_security_provider` guarantees isolation from Natural Language to Database Compute.",
        components: [
          {
            name: "1. JWT & Claim Validation",
            description: "User requests an insight. Arcli validates the secure JWT, extracting the `tenant_id` and Role-Based Access Control (RBAC) permissions from the session."
          },
          {
            name: "2. LLM Intent Generation (Untrusted)",
            description: "The AI agent generates a raw SQL projection based on the semantic layer. At this stage, the SQL is considered untrusted and potentially malicious."
          },
          {
            name: "3. AST Parsing & Boundary Injection",
            description: "Arcli parses the untrusted SQL into an Abstract Syntax Tree. The `query_planner` forcefully injects `WHERE tenant_id = X` into every base table scan. It strictly rejects any UNIONs or subqueries attempting to bypass this constraint."
          },
          {
            name: "4. RLS-Enforced Execution",
            description: "The sanitized, bounded query is executed against the database using a restricted database role that inherently enforces PostgreSQL/Snowflake Row-Level Security policies."
          }
        ]
      }
    },
    {
      type: "UseCases",
      payload: {
        title: "Multi-Tenant Security Scenarios",
        scenarios: [
          {
            level: "Basic",
            title: "Pooled Database Isolation",
            businessQuestion: "How do we securely embed analytics when all our SaaS customers live in a single PostgreSQL database?",
            description: "Arcli connects to your pooled database. When Customer A asks a question, Arcli's execution engine intercepts the request and cryptographically binds `tenant_id = 'A'` to the query path, ensuring they cannot aggregate Customer B's revenue data."
          },
          {
            level: "Intermediate",
            title: "Intra-Tenant Role-Based Access (RBAC)",
            businessQuestion: "Can we restrict what certain users see within the SAME tenant?",
            description: "Yes. The semantic layer supports RBAC. A 'Manager' asking for 'Employee Salaries' will have the query executed, while a 'Contractor' asking the same question will hit a Graceful Refusal rule, logging the unauthorized access attempt in the audit logger."
          },
          {
            level: "Strategic",
            title: "Ephemeral DuckDB Sandboxing",
            businessQuestion: "How do we prevent complex AI analytical queries from consuming all our production database resources?",
            description: "Arcli prevents 'noisy neighbor' resource exhaustion. Instead of running heavy window functions on your primary read-replica, Arcli spins up a completely isolated, ephemeral DuckDB instance, copies only that specific tenant's data chunk, runs the compute, and instantly destroys the sandbox."
          }
        ]
      }
    },
    {
      type: "StrategicQuery",
      payload: {
        title: "Defense in Depth: AST Injection + PostgreSQL RLS",
        description: "Arcli doesn't just rely on our application code. We integrate directly with your database's native Row-Level Security capabilities. This shows how Arcli configures the connection state before executing the AI-generated query.",
        businessOutcome: "Provides a double-layered security model. Even if the application logic were somehow compromised, the database engine itself physically rejects the query, ensuring zero chance of a PR disaster stemming from leaked customer data.",
        language: "sql",
        code: `
-- Step 1: Native Database Security (One-time setup by Arcli)
-- Enable Row Level Security on the shared table
ALTER TABLE enterprise_schema.fact_transactions ENABLE ROW LEVEL SECURITY;

-- Create the strict multi-tenant policy
CREATE POLICY tenant_isolation_policy ON enterprise_schema.fact_transactions
    USING (tenant_id = current_setting('arcli.current_tenant_id')::UUID);

-- ====================================================================

-- Step 2: Per-Query Execution (Handled by Arcli Execution Engine)
-- When User from Tenant 'A8F9' asks: "Show me my top 5 customers"

BEGIN;
-- Arcli automatically sets the local transaction variable based on the verified JWT
-- This cannot be modified by the AI model.
SET LOCAL arcli.current_tenant_id = 'a8f9b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c';

-- The AI Agent generated the underlying SELECT, but Arcli's AST Compiler 
-- verifies and executes it within the bounded transaction block.
SELECT 
    customer_email,
    SUM(amount_usd) as total_ltv
FROM enterprise_schema.fact_transactions
-- The RLS policy automatically appends "WHERE tenant_id = 'A8F9...'" to this execution path
GROUP BY 1
ORDER BY total_ltv DESC
LIMIT 5;

COMMIT;
        `
      }
    },
    {
      type: "SecurityGuardrails",
      payload: {
        title: "The Arcli Audit & Compliance Engine",
        description: "Meeting SOC2, HIPAA, and GDPR requirements requires more than just blocking bad queries. It requires proving what happened.",
        features: [
          {
            title: "Query Hash Manifests",
            description: "Every SQL statement generated by the AI is cryptographically hashed. If a user questions a metric, your engineering team can trace the exact semantic logic used to generate it at that specific millisecond in time."
          },
          {
            title: "PII & Data Masking",
            description: "Dynamically mask columns like `email` or `social_security_number` based on the user's RBAC profile. The AI agent can calculate aggregates over PII without ever exposing the raw strings in the UI."
          },
          {
            title: "Anomaly Rate Limiting",
            description: "If an embedded tenant suddenly generates 500x their normal query volume (indicating a potential scraping attack or compromised account), Arcli's watchdog automatically suspends their query execution path."
          }
        ]
      }
    },
    {
      type: "ComparisonMatrix",
      payload: {
        title: "Multi-Tenant Architecture Comparison",
        description: "How Arcli mitigates the risks associated with building SaaS analytics internally.",
        columns: ["Security Vector", "Arcli (Embedded AI)", "DIY Built-in-House", "Traditional BI Embed (Looker)"],
        rows: [
          ["Cross-Tenant Leak Prevention", "AST Injection + Native RLS", "Manual WHERE clause appending (High Risk)", "Parameterized filters (Prone to misconfiguration)"],
          ["AI Prompt Injection Defense", "Semantic Layer Separation", "Vulnerable to prompt engineering", "N/A (No AI Native layer)"],
          ["Compute Isolation", "Ephemeral Sandboxing (DuckDB)", "Shared DB resources (Noisy Neighbor risk)", "Shared BI compute cluster"],
          ["Auditability", "Immutable Query Hashing", "Basic application logs", "Proprietary internal logs"]
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
            answer: "Arcli uses advanced connection pooling (via PgBouncer/Supavisor logic) but ensures that context parameters (like `SET LOCAL current_tenant_id`) are applied transactionally. This guarantees connections returned to the pool are thoroughly sanitized and state-cleared before the next tenant uses them."
          },
          {
            question: "Is Arcli SOC 2 Type II compliant?",
            answer: "Yes. Arcli adheres to strict compliance frameworks. Our infrastructure is continuously monitored for configuration drift, and our multi-tenant boundary logic undergoes regular third-party penetration testing."
          },
          {
            question: "What if our architecture uses siloed databases (one database per tenant) rather than a pooled schema?",
            answer: "Arcli supports both. In a siloed architecture, the `tenant_security_provider` dynamically routes the query to the specific database connection string assigned to that tenant's JWT, ensuring physical database separation."
          },
          {
            question: "Can an AI agent run a DELETE or UPDATE command if tricked by a user?",
            answer: "Absolutely not. Arcli enforces a strict Read-Only execution environment. The database user assigned to Arcli is stripped of all DML (Data Manipulation) and DDL (Data Definition) privileges. Even if the AI generates a `DROP TABLE` command, the database engine will reject it."
          }
        ]
      }
    }
  ]
};