// lib/seo/persona-buyers-1.tsx

import { SEOPageData } from './index';

/**
 * SEO Persona Campaign: Chief Information Security Officer (CISO)
 * Target Audience: CISOs, VP of Security, Head of IT, Compliance Officers
 * Core Focus: Penetration testing, stateless compute, zero data exfiltration, auditability.
 */
export const cisoPersona: SEOPageData = {
  type: 'campaign',
  seo: {
    title: 'Secure AI Analytics | Zero Data Movement BI | Arcli',
    description: 'Deploy AI analytics without data exfiltration. Arcli is a stateless, read-only AI platform that generates SQL in your VPC without replicating sensitive data.',
    h1: 'Enterprise Security Meets AI Analytics',
    keywords: ['Secure AI data analysis', 'Read-only BI tool', 'VPC native AI analytics', 'Zero data movement BI', 'Enterprise AI security'],
    intent: 'campaign',
    canonicalDomain: 'https://arcli.tech/solutions/security-leaders'
  },
  hero: {
    badge: 'SECURITY & COMPLIANCE',
    title: 'Say "Yes" to AI. Keep your Data in your VPC.',
    subtitle: 'Business leaders want AI insights; you need to prevent data exfiltration. Arcli is the only stateless analytics orchestrator that generates native SQL without ever extracting your row-level data into a third-party cloud.',
    primaryCTA: { text: 'Download Security Architecture', href: '/security/whitepaper' },
    secondaryCTA: { text: 'View SOC2 Controls', href: '/compliance' }
  },

  // Maps to ExecutiveSummary in seo-blocks-3.tsx
  executiveSummary: [
    { value: 'Read-Only', label: 'Service Account Execution' },
    { value: 'Zero', label: 'Data Replicated' },
    { value: 'AES-256', label: 'Metadata Encryption' },
    { value: 'SOC2', label: 'Type II Audited' }
  ],

  // Maps to ContrarianBanner in seo-blocks-3.tsx
  contrarianBanner: {
    statement: "Copying your data into an AI vendor's vector database is a catastrophic security vulnerability.",
    subtext: "Traditional 'AI Analytics' platforms ingest, cache, and index your raw database rows. If they get breached, your data is compromised. Arcli operates fundamentally differently: we only ingest the schema. The data never leaves your infrastructure."
  },

  // Maps to SecurityGuardrails in seo-blocks-3.tsx
  securityGuardrails: [
    {
      title: 'Stateless Data Processing',
      description: 'Arcli does not store your query results. When the AI generates a SQL query, your data warehouse executes it, and Arcli only temporarily holds the aggregate JSON payload in memory to render the chart before immediately discarding it.'
    },
    {
      title: 'Architectural Immutability',
      description: 'We connect via strict Read-Only database credentials. It is programmatically impossible for the Arcli Orchestrator to execute INSERT, UPDATE, DELETE, or DROP table commands against your production systems.'
    },
    {
      title: 'Cryptographic Query Provenance',
      description: 'Every interaction is logged. Security teams have an immutable, searchable audit trail of exactly what the user asked, what SQL Arcli generated, and when it was executed against the database.'
    }
  ],

  // Maps to Features in standard blocks
  features: {
    title: 'Built for the Enterprise Trust Center',
    items: [
      {
        title: 'SSO & SAML 2.0 Integration',
        description: 'Native integration with Okta, Azure AD, and Google Workspace. Automatically enforce your corporate password, MFA, and session timeout policies.',
        icon: 'Lock'
      },
      {
        title: 'Native Row-Level Security (RLS)',
        description: 'Arcli inherits the RLS policies defined directly in your Postgres or Snowflake instances. The AI can never surface records the user isn\'t authorized to access.',
        icon: 'Shield'
      },
      {
        title: 'VPC-Native Deployment Options',
        description: 'For highly classified or regulated environments, deploy Arcli’s execution engine entirely within your own firewalled infrastructure.',
        icon: 'Server'
      }
    ]
  },

  faqs: [
    {
      q: 'Has Arcli undergone independent penetration testing?',
      a: 'Yes. We undergo rigorous, independent third-party penetration testing semi-annually. The full executive summary report is available under NDA in our Trust Center.',
      persona: 'VP of Security'
    },
    {
      q: 'What exactly does Arcli sync during onboarding?',
      a: 'We only sync database schema metadata. This includes table names, column names, data types, and explicit foreign key relationships. We NEVER ingest row-level data into our vector databases.',
      persona: 'Database Administrator'
    },
    {
      q: 'Does the AI train on my schema data?',
      a: 'Absolutely not. Arcli uses isolated LLM endpoints with strict zero-retention policies. Your schema metadata is used exclusively for retrieval-augmented generation (RAG) during your session and is never used to train foundational models.',
      persona: 'CISO'
    }
  ]
};

/**
 * SEO Persona Campaign: Data Engineer / Data Architect
 * Target Audience: Data Engineers, Analytics Engineers, Head of Data
 * Core Focus: Eliminating ad-hoc requests, bypassing semantic layers, dialect-specific SQL.
 */
export const dataEngineerPersona: SEOPageData = {
  type: 'campaign',
  seo: {
    title: 'AI SQL Generator & Semantic Layer Alternative | Arcli',
    description: 'Stop answering ad-hoc data requests in Slack. Arcli grounds AI in your raw schema to generate highly optimized, dialect-specific SQL, completely bypassing legacy BI semantic layers.',
    h1: 'The Semantic Layer is Dead.',
    keywords: ['AI SQL generator for data engineering', 'Semantic layer alternative', 'Automate ad-hoc data requests', 'Text to SQL enterprise', 'Bypass BI semantic layer'],
    intent: 'campaign',
    canonicalDomain: 'https://arcli.tech/solutions/data-engineering'
  },
  hero: {
    badge: 'DATA ENGINEERING INTELLIGENCE',
    title: 'Automate your Ad-Hoc Backlog.',
    subtitle: 'Data Engineers spend 40% of their week answering "quick questions" in Slack. Arcli connects directly to your warehouse, understands your raw schema, and lets stakeholders self-serve data instantly.',
    primaryCTA: { text: 'Start Free Trial', href: '/register' },
    secondaryCTA: { text: 'Read the Docs', href: '/docs' }
  },

  // Maps to Workflow in seo-blocks-1.tsx
  workflow: {
    title: 'Escape the Ad-Hoc Purgatory',
    steps: [
      {
        title: 'The Legacy BI Bottleneck',
        description: 'A stakeholder asks a question. You write the SQL in Snowflake, realize the BI semantic layer needs a new model, update dbt, deploy, build a dashboard, and send them a link 3 days later.',
        icon: 'AlertCircle'
      },
      {
        title: 'The Arcli Workflow',
        description: 'A stakeholder asks a question in plain English. Arcli reads the schema, generates dialect-perfect SQL, queries the database directly, and renders a chart in 3 seconds. You write zero code.',
        icon: 'Zap'
      }
    ]
  },

  contrarianBanner: {
    statement: "You shouldn't have to build a multi-million dollar semantic layer just so the marketing team can calculate CAC.",
    subtext: "Legacy BI forces you to perfectly model your data before anyone can query it. Arcli handles the chaos. Our AI is grounded in your raw, underlying metadata, enabling natural language querying directly against the warehouse without an intermediate modeling layer."
  },

  // Maps to StrategicQuery in seo-blocks-3.tsx
  strategicScenario: {
    title: 'Dialect-Perfect Unnesting & Aggregation',
    description: 'Generic Text-to-SQL tools fail because they write standard Postgres instead of warehouse-specific dialects. Arcli knows BigQuery. It natively utilizes `UNNEST`, `ARRAY_AGG`, and complex windowing functions without hallucinating syntax.',
    dialect: 'Google BigQuery',
    sql: `-- Generated by Arcli AI Orchestrator
SELECT
  e.event_name,
  COUNT(DISTINCT e.user_pseudo_id) as unique_users,
  ROUND(SUM(CAST(ep.value.int_value AS FLOAT64)) / 1000000, 2) AS total_revenue_millions
FROM 
  \`analytics_production.events_*\` e
CROSS JOIN 
  UNNEST(e.event_params) AS ep
WHERE 
  e.event_name IN ('in_app_purchase', 'subscription_renewal')
  AND ep.key = 'value'
  AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) 
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
GROUP BY 
  e.event_name
ORDER BY 
  total_revenue_millions DESC;`,
    businessOutcome: 'Generates a 30-day revenue cohort analysis from massively nested Google Analytics 4 event arrays in BigQuery, bypassing the need for a complex dbt unnesting model.'
  },

  executiveSummary: [
    { value: '100%', label: 'Dialect Accurate' },
    { value: '0', label: 'Models to Maintain' },
    { value: 'API', label: 'First Architecture' },
    { value: 'O(1)', label: 'Query Performance' }
  ],

  faqs: [
    {
      q: 'Do I have to rip out dbt to use Arcli?',
      a: 'No. Arcli sits perfectly on top of your existing dbt models. While you *can* query raw data, connecting Arcli to your pristine, dbt-transformed gold tier tables will yield the highest quality AI insights.',
      persona: 'Analytics Engineer'
    },
    {
      q: 'How does Arcli handle complex table joins that aren\'t explicitly defined?',
      a: 'During onboarding, Arcli uses a lightweight embedding process to analyze column names, types, and primary/foreign key relationships. The AI query planner uses this semantic graph to mathematically determine the safest join paths, heavily penalizing cartesian products.',
      persona: 'Data Architect'
    },
    {
      q: 'Can I inject custom business logic or metric definitions?',
      a: 'Yes. Through Arcli’s Metric Governance API, you can define core business logic (e.g., "Active User = Login within 30 days"). The AI orchestrator will strictly adhere to these definitions when generating SQL.',
      persona: 'Head of Data'
    }
  ]
};