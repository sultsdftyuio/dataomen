// lib/seo/persona-buyers-1.tsx

import { SEOPageData } from './index';

/**
 * SEO Persona Campaign: Chief Information Security Officer (CISO)
 * Target Audience: CISOs, VP of Security, Head of IT, Compliance Officers
 * Core Focus: Zero-Trust, Penetration testing, stateless compute, zero data exfiltration, IAM/RBAC.
 */
export const cisoPersona: SEOPageData = {
  type: 'campaign',
  seo: {
    title: 'Secure AI Analytics | Zero-Trust Data Movement | Arcli',
    description: 'Deploy AI analytics without data exfiltration. Arcli is a stateless, read-only AI orchestrator that generates native SQL in your VPC without replicating sensitive data.',
    h1: 'Enterprise Security Meets AI Analytics',
    keywords: [
      'Secure AI data analysis', 
      'Read-only BI tool', 
      'VPC native AI analytics', 
      'Zero data movement BI', 
      'Enterprise AI security',
      'Zero-Trust AI architecture',
      'Stateless compute data analytics',
      'IAM role assumption BI',
      'SOC2 Type II AI reporting',
      'Data exfiltration prevention AI'
    ],
    intent: 'campaign',
    canonicalDomain: 'https://arcli.tech/solutions/security-leaders'
  },
  hero: {
    badge: 'SECURITY & COMPLIANCE',
    title: 'Say "Yes" to AI. Keep Your Data in Your VPC.',
    subtitle: 'The board wants AI insights; you need to prevent data exfiltration. Arcli is the only stateless analytics orchestrator that generates native SQL without ever extracting your row-level data into a third-party vector database.',
    primaryCTA: { text: 'Download Security Architecture', href: '/security/whitepaper' },
    secondaryCTA: { text: 'View SOC2 Controls', href: '/compliance' }
  },

  // STRICT BLOCK ARCHITECTURE (V13 Rule 4)
  blocks: [
    {
      type: 'ContrarianBanner',
      statement: "Copying your production database into an AI vendor's cloud is a catastrophic vulnerability.",
      subtext: "Traditional 'AI Analytics' platforms ingest, cache, and index your raw database rows. If they get breached, your PII is compromised. Arcli operates on a fundamental Zero-Trust principle: we only ingest schema metadata. The actual data never leaves your infrastructure."
    },
    {
      type: 'InformationGain',
      uniqueInsight: "Arcli operates entirely via Ephemeral Stateless Processing. The engine generates the SQL intent, pushes it to your data warehouse via heavily restricted IAM read-only roles, and temporarily holds the aggregate payload in volatile memory just long enough to render the UI chart.",
      structuralAdvantage: "Provides total Architectural Immutability. It is programmatically impossible for the Arcli Orchestrator to execute INSERT, UPDATE, DELETE, or DROP table commands against your production systems."
    },
    {
      type: 'ComparisonMatrix',
      // Strict Table Requirement (V13 Rule 3)
      rows: [
        { category: 'Data Replicated', arcliAdvantage: '0MB (Stateless Compute)', legacy: 'High (ETL into Vector DB)' },
        { category: 'Execution Privileges', arcliAdvantage: 'Strict Read-Only IAM', legacy: 'Over-permissioned service accounts' },
        { category: 'Query Provenance', arcliAdvantage: 'Cryptographic Hashing Log', legacy: 'Opaque Blackbox' }
      ]
    },
    {
      type: 'SecurityGuardrails',
      // Strict Array Requirement (V13 Rule 3)
      items: [
        {
          title: 'SSO & SAML 2.0 Integration',
          description: 'Native integration with Okta, Azure AD, and Google Workspace. Automatically enforce your corporate password complexity, MFA requirements, and session timeout policies.'
        },
        {
          title: 'Native Row-Level Security (RLS)',
          description: 'Arcli inherits the RLS policies defined directly in your Postgres or Snowflake instances. The AI can never surface records a user isn\'t explicitly authorized to access.'
        },
        {
          title: 'VPC-Native Deployment Options',
          description: 'For highly classified or regulated environments (FedRAMP, HIPAA), deploy Arcli’s execution engine entirely within your own firewalled AWS, GCP, or Azure infrastructure.'
        }
      ]
    },
    {
      type: 'UIBlock',
      payload: {
        type: 'AnalyticsDashboard',
        // Strict Data Mapping (V13 Rule 1 & 2)
        dataMapping: {
          title: 'Cryptographic Query Provenance',
          description: 'Every AI interaction is logged and hashed. Security operations teams have an immutable, searchable audit trail detailing exactly what the user asked, what SQL Arcli generated, and when it executed.',
          dialect: 'Audit Log (JSONB)',
          code: `{
  "timestamp": "2026-04-09T13:00:00Z",
  "actor_id": "usr_okta_a8f9b2c3",
  "intent": "View recent Finance dataset queries",
  "generated_sql_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "execution_status": "SUCCESS",
  "data_exfiltrated_bytes": 0
}`,
          businessOutcome: 'Provides compliance teams with absolute, cryptographically verifiable proof of Zero-Data Exfiltration during routine SOC2 and HIPAA audits.'
        }
      }
    }
  ],

  faqs: [
    {
      q: 'Has Arcli undergone independent penetration testing?',
      a: 'Yes. We undergo rigorous, independent third-party penetration testing semi-annually. The full executive summary report is available under NDA via our Trust Center.',
      persona: 'VP of Security'
    },
    {
      q: 'What exactly does Arcli sync during onboarding?',
      a: 'We only sync database schema metadata. This includes table names, column names, data types, and explicit foreign key relationships. We NEVER ingest row-level PII or PHI into our systems.',
      persona: 'Database Administrator'
    }
  ]
};

/**
 * SEO Persona Campaign: Data Engineer / Data Architect
 * Target Audience: Data Engineers, Analytics Engineers, Head of Data
 * Core Focus: Eliminating ad-hoc requests, bypassing semantic layers, dialect-specific SQL, dbt integration.
 */
export const dataEngineerPersona: SEOPageData = {
  type: 'campaign',
  seo: {
    title: 'AI SQL Generator | Automate Ad-Hoc Analytics | Arcli',
    description: 'Stop answering ad-hoc data requests in Slack. Arcli grounds AI in your raw schema to generate highly optimized, dialect-specific SQL without hallucinating syntax.',
    h1: 'The Ad-Hoc Analytics Killer.',
    keywords: [
      'AI SQL generator for data engineering', 
      'Semantic layer alternative', 
      'Automate ad-hoc data requests', 
      'Text to SQL enterprise', 
      'Bypass BI semantic layer',
      'dbt AI integration',
      'BigQuery dialect AI generator',
      'AI query planner data warehouse'
    ],
    intent: 'campaign',
    canonicalDomain: 'https://arcli.tech/solutions/data-engineering'
  },
  hero: {
    badge: 'DATA ENGINEERING INTELLIGENCE',
    title: 'Automate Your Ad-Hoc Backlog.',
    subtitle: 'Data Engineers spend 40% of their week answering "quick questions" in Slack. Arcli connects directly to your warehouse, understands your dbt models, and lets stakeholders self-serve data instantly with dialect-perfect SQL.',
    primaryCTA: { text: 'Start Free Trial', href: '/register' },
    secondaryCTA: { text: 'Read the Docs', href: '/docs' }
  },

  blocks: [
    {
      type: 'ContrarianBanner',
      statement: "You shouldn't have to build a multi-million dollar semantic layer just so the marketing team can calculate CAC.",
      subtext: "Legacy BI forces you to perfectly model your data before anyone can query it. Arcli handles the chaos. Our AI is grounded in your underlying metadata, enabling natural language querying directly against the warehouse without an intermediate modeling layer bottleneck."
    },
    {
      type: 'InformationGain',
      uniqueInsight: "Generic Text-to-SQL tools fail because they write standard ANSI SQL. Arcli’s AI Query Planner natively understands dialect-specific nuances. It perfectly utilizes UNNEST, QUALIFY, and complex windowing functions without hallucinating syntax or causing cartesian explosions.",
      structuralAdvantage: "By executing natively against your raw or lightly transformed dbt models, Arcli bypasses the traditional BI semantic modeling phase entirely, turning days of ticket resolution into seconds of autonomous generation."
    },
    {
      type: 'UIBlock',
      payload: {
        type: 'ArchitectureDiagram',
        // Strict Data Mapping & Nested Array Requirement (V13 Rule 1 & 2)
        dataMapping: {
          title: 'Escape Ad-Hoc Purgatory',
          steps: [
            {
              title: '1. The Legacy BI Bottleneck',
              description: 'A stakeholder asks a question. You write the SQL, realize the BI tool needs a new model, update dbt, wait for CI/CD, build a dashboard, and send them a link 3 days later.'
            },
            {
              title: '2. Semantic Graph Ingestion',
              description: 'Instead, Arcli connects to your database and generates a lightweight embedding of your column types and foreign keys.'
            },
            {
              title: '3. The Arcli Workflow',
              description: 'A stakeholder asks a question in English. Arcli reads the schema, generates dialect-perfect SQL, and executes it directly on your compute. You write zero code.'
            }
          ]
        }
      }
    },
    {
      type: 'ComparisonMatrix',
      // Strict Table Requirement (V13 Rule 3)
      rows: [
        { category: 'Dialect Accuracy', arcliAdvantage: '100% Native Compilation', legacy: 'Generic ANSI (Syntax Errors)' },
        { category: 'Models to Maintain', arcliAdvantage: '0 (Dynamic Execution)', legacy: 'High (Rigid LookML/dbt layers)' },
        { category: 'Time to Insight', arcliAdvantage: 'Seconds (Self-Serve AI)', legacy: 'Days (Engineering Jira Ticket)' }
      ]
    },
    {
      type: 'UIBlock',
      payload: {
        type: 'AnalyticsDashboard',
        // Strict Data Mapping (V13 Rule 1 & 2)
        dataMapping: {
          title: 'Dialect-Perfect Unnesting & Windowing',
          description: 'Arcli writes BigQuery SQL the way a Senior Data Engineer would.',
          dialect: 'Google BigQuery',
          code: `-- Generated by Arcli Semantic Router & Query Planner
WITH user_cohorts AS (
  SELECT
    e.user_pseudo_id,
    e.event_name,
    CAST(ep.value.int_value AS FLOAT64) AS revenue,
    DATE(TIMESTAMP_MICROS(e.event_timestamp)) AS event_date
  FROM \`analytics_production.events_*\` e
  CROSS JOIN UNNEST(e.event_params) AS ep
  WHERE e.event_name IN ('in_app_purchase', 'subscription_renewal')
    AND ep.key = 'value'
    AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) 
    AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
)
SELECT event_name,
  COUNT(DISTINCT user_pseudo_id) AS unique_converting_users,
  ROUND(SUM(revenue) / 1000000, 2) AS total_revenue_millions
FROM user_cohorts
GROUP BY event_name
QUALIFY ROW_NUMBER() OVER(ORDER BY total_revenue_millions DESC) <= 10;`,
          businessOutcome: 'Generates a 30-day revenue cohort analysis from massively nested Google Analytics 4 event arrays, utilizing QUALIFY clauses to bypass the need for an expensive dbt unnesting model.'
        }
      }
    }
  ],

  faqs: [
    {
      q: 'Do I have to rip out dbt to use Arcli?',
      a: 'No. Arcli sits perfectly on top of your existing dbt models. While you *can* query raw data, connecting Arcli to your pristine, dbt-transformed gold tier tables will yield the highest quality, instant AI insights.',
      persona: 'Analytics Engineer'
    },
    {
      q: 'How does Arcli handle complex table joins that aren\'t explicitly defined?',
      a: 'During onboarding, Arcli uses a lightweight embedding process to analyze column names, types, and primary/foreign key relationships. The AI Query Planner uses this mathematical semantic graph to determine the safest join paths, heavily penalizing cartesian products.',
      persona: 'Data Architect'
    }
  ]
};