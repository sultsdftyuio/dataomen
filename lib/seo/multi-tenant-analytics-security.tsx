// lib/seo/multi-tenant-analytics-security.tsx

import { SEOPageData } from './index';

/**
 * V13 ENFORCED: Multi-Tenant Security Architecture
 * Upgraded to strict UI Block Protocol to guarantee static build compatibility.
 */
export const multiTenantAnalyticsSecurityData: SEOPageData = {
  type: 'guide',
  seo: {
    title: 'Multi-Tenant Analytics Security & RLS Guide | Arcli',
    description: 'Embed AI analytics with zero risk of cross-tenant data leakage. Arcli enforces strict Row-Level Security, ephemeral query isolation, and immutable audit logging.',
    h1: 'Zero-Trust Multi-Tenant Analytics & Row-Level Security',
    keywords: [
      'multi-tenant analytics', 
      'embedded BI security', 
      'Row-Level Security', 
      'RLS data architecture', 
      'cross-tenant data leakage',
      'AST Injection', 
      'LLM Security'
    ],
    intent: 'guide',
    canonicalDomain: 'https://arcli.tech/architecture/multi-tenant-security'
  },
  hero: {
    badge: 'Enterprise Architecture & Trust',
    title: 'Zero-Trust Multi-Tenant Analytics',
    subtitle: "The greatest risk of embedded AI is an LLM hallucinating a query that exposes Tenant A's data to Tenant B. Arcli physically prevents this by enforcing cryptographic Row-Level Security before any SQL reaches the database.",
    primaryCTA: { text: 'Read the Security Whitepaper', href: '/resources/security-architecture' },
    secondaryCTA: { text: 'Book an Infosec Review', href: '/contact/security' }
  },

  // STRICT BLOCK ARCHITECTURE (V13 Rule 4)
  blocks: [
    {
      type: 'ContrarianBanner',
      statement: "Why 'Prompt Engineering' is not a security strategy.",
      subtext: "Telling an LLM, 'Only query data where tenant_id = 123' is a catastrophic security vulnerability. AI models are probabilistic and vulnerable to prompt injection; they can easily drop WHERE clauses. Arcli removes the LLM from the security perimeter entirely."
    },
    {
      type: 'InformationGain',
      uniqueInsight: "Arcli uniquely solves multi-tenant security by stripping the LLM of filtering duties. We generate the intent via AI, but inject bounds deterministically via AST (Abstract Syntax Tree) parsing at the execution layer.",
      structuralAdvantage: "Provides a mathematical guarantee of tenant isolation, serving as direct, verifiable proof for Infosec teams during enterprise vendor review."
    },
    {
      type: 'SecurityGuardrails',
      // Strict Array Requirement (V13 Rule 3)
      items: [
        {
          title: 'Absolute Tenant Isolation',
          description: "Whether you use a shared-schema (pool) or isolated-schema (silo) architecture, Arcli dynamically scopes all queries to the authenticated user's JWT claims."
        },
        {
          title: 'Immutable Auditability',
          description: "Every query executed is hashed, timestamped, and stored in the audit_logger, proving exactly who accessed what data and when."
        },
        {
          title: 'Zero-Data Retention',
          description: "Arcli pushes compute to your warehouse or executes in memory via DuckDB. We do not store your customers' raw PII in our application state."
        }
      ]
    },
    {
      type: 'UIBlock',
      payload: {
        type: 'ArchitectureDiagram',
        // Strict Data Mapping & Nested Array Requirement (V13 Rule 1 & 2)
        dataMapping: {
          title: 'The Secure Execution Pipeline',
          steps: [
            { 
              title: '1. JWT & Claim Validation', 
              description: 'Arcli validates the secure JWT, extracting the tenant_id and RBAC permissions.' 
            },
            { 
              title: '2. LLM Intent Generation (Untrusted)', 
              description: 'The AI agent generates a raw SQL projection. At this stage, the SQL is considered untrusted.' 
            },
            { 
              title: '3. AST Parsing & Boundary Injection', 
              description: 'Arcli parses the untrusted SQL into an Abstract Syntax Tree. The engine forcefully injects WHERE tenant_id = X and blocks subqueries.' 
            },
            { 
              title: '4. RLS-Enforced Execution', 
              description: 'Executed using a restricted database role that inherently enforces native PostgreSQL/Snowflake Row-Level Security.' 
            }
          ]
        }
      }
    },
    {
      type: 'ComparisonMatrix',
      // Strict Table Requirement (V13 Rule 3)
      rows: [
        { category: 'Cross-Tenant Leak Defense', arcliAdvantage: 'AST Injection + Native RLS', legacy: 'Manual WHERE Appending / Vulnerable' },
        { category: 'Prompt Injection Risk', arcliAdvantage: 'Zero (Semantic Layer Air-gapped)', legacy: 'High (LLM handles logic and security)' },
        { category: 'Compute Isolation', arcliAdvantage: 'Ephemeral Sandboxing (DuckDB)', legacy: 'Shared Database Resources' }
      ]
    },
    {
      type: 'UIBlock',
      payload: {
        type: 'AnalyticsDashboard',
        // Strict Data Mapping (V13 Rule 1 & 2)
        dataMapping: {
          title: 'Defense in Depth: AST Injection + Native PostgreSQL RLS',
          description: 'We integrate directly with your database\'s native Row-Level Security capabilities. Even if the application layer was bypassed, the DB physically rejects the query.',
          dialect: 'PostgreSQL (RLS)',
          code: `-- Step 1: Native Database Security (One-time setup)
ALTER TABLE enterprise_schema.fact_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON enterprise_schema.fact_transactions
    USING (tenant_id = current_setting('arcli.current_tenant_id')::UUID);

-- ====================================================================

-- Step 2: Per-Query Execution (Handled automatically by Arcli Execution Engine)
BEGIN;

-- Arcli securely sets the local transaction variable from the verified JWT
SET LOCAL arcli.current_tenant_id = 'a8f9b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c';

-- The AST Compiler verifies and executes within the bounded block
SELECT customer_email, SUM(amount_usd) as total_ltv
FROM enterprise_schema.fact_transactions
GROUP BY 1 ORDER BY total_ltv DESC LIMIT 5;

COMMIT;`,
          businessOutcome: 'Provides 100% mathematical certainty against cross-tenant data leakage, passing the most stringent CISO vendor security reviews.'
        }
      }
    }
  ],

  faqs: [
    {
      q: 'How does Arcli handle connection pooling in a multi-tenant environment?',
      a: 'Arcli uses advanced connection pooling but ensures that context parameters (like `SET LOCAL current_tenant_id`) are applied transactionally on a per-query basis. This guarantees state-cleared connections without sacrificing speed.',
      persona: 'Data Architect'
    },
    {
      q: 'Can an AI agent run a DELETE or UPDATE command by mistake?',
      a: 'Absolutely not. Arcli enforces a strict Read-Only environment stripped of all DML and DDL privileges at the credential level. Even if the AI hallucinated a `DROP TABLE` command, the database engine will immediately reject it.',
      persona: 'Chief Information Security Officer (CISO)'
    }
  ]
};