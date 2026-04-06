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

  // Maps to ExecutiveSummary in seo-blocks-3.tsx
  executiveSummary: [
    { value: 'Read-Only', label: 'IAM Execution' },
    { value: 'Zero', label: 'Data Replicated' },
    { value: 'AES-256', label: 'Metadata Encryption' },
    { value: 'SOC2', label: 'Type II Audited' }
  ],

  // Maps to ContrarianBanner in seo-blocks-3.tsx
  contrarianBanner: {
    statement: "Copying your production database into an AI vendor's cloud is a catastrophic vulnerability.",
    subtext: "Traditional 'AI Analytics' platforms ingest, cache, and index your raw database rows. If they get breached, your PII is compromised. Arcli operates on a fundamental Zero-Trust principle: we only ingest schema metadata. The actual data never leaves your infrastructure."
  },

  // Maps to SecurityGuardrails in seo-blocks-3.tsx
  securityGuardrails: [
    {
      title: 'Ephemeral Stateless Processing',
      description: 'Arcli does not persist query results. When the AI generates SQL, your warehouse executes it. Arcli temporarily holds the aggregate JSON payload in volatile memory to render the UI chart, purging it instantly when the session ends.'
    },
    {
      title: 'Architectural Immutability',
      description: 'We connect via strict Read-Only IAM roles or service accounts. It is programmatically impossible for the Arcli Orchestrator to execute INSERT, UPDATE, DELETE, or DROP table commands against your production systems.'
    },
    {
      title: 'Cryptographic Query Provenance',
      description: 'Every AI interaction is logged and hashed. Security operations teams have an immutable, searchable audit trail detailing exactly what the user asked, what SQL Arcli generated, and when it executed against the database.'
    }
  ],

  // Maps to Features in standard blocks
  features: {
    title: 'Built for the Enterprise Trust Center',
    items: [
      {
        title: 'SSO & SAML 2.0 Integration',
        description: 'Native integration with Okta, Azure AD, and Google Workspace. Automatically enforce your corporate password complexity, MFA requirements, and session timeout policies.',
        icon: 'Lock'
      },
      {
        title: 'Native Row-Level Security (RLS)',
        description: 'Arcli inherits the RLS policies defined directly in your Postgres or Snowflake instances. The AI can never surface records a user isn\'t explicitly authorized to access at the database level.',
        icon: 'Shield'
      },
      {
        title: 'VPC-Native Deployment Options',
        description: 'For highly classified or regulated environments (FedRAMP, HIPAA), deploy Arcli’s execution engine entirely within your own firewalled AWS, GCP, or Azure infrastructure.',
        icon: 'Server'
      }
    ]
  },

  // UI Hook for PLG demonstration
  interactiveDemoMap: {
    component: 'SecurityAuditLogViewer',
    defaultQuery: 'View cryptographic hash logs for recent Finance dataset queries.',
    visualizationType: 'data-grid'
  },

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
    },
    {
      q: 'Are my schema details used to train foundational AI models?',
      a: 'Absolutely not. Arcli uses isolated LLM endpoints with strict zero-retention policies. Your schema metadata is used exclusively for Retrieval-Augmented Generation (RAG) during your session and is explicitly opted out of any model training.',
      persona: 'CISO'
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
      'Snowflake text to sql AI',
      'BigQuery dialect AI generator',
      'Data engineering self serve analytics',
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

  // Maps to Workflow in seo-blocks-1.tsx
  workflow: {
    title: 'Escape Ad-Hoc Purgatory',
    steps: [
      {
        title: 'The Legacy BI Bottleneck',
        description: 'A stakeholder asks a question. You write the SQL, realize the BI tool needs a new semantic model, update dbt, wait for the CI/CD pipeline, build a dashboard, and send them a link 3 days later.',
        icon: 'AlertCircle'
      },
      {
        title: 'The Arcli Workflow',
        description: 'A stakeholder asks a question in plain English. Arcli’s execution engine reads the schema, generates dialect-perfect SQL, queries the database directly, and renders a chart in 3 seconds. You write zero code.',
        icon: 'Zap'
      }
    ]
  },

  contrarianBanner: {
    statement: "You shouldn't have to build a multi-million dollar semantic layer just so the marketing team can calculate CAC.",
    subtext: "Legacy BI forces you to perfectly model your data before anyone can query it. Arcli handles the chaos. Our AI is grounded in your underlying metadata, enabling natural language querying directly against the warehouse without an intermediate modeling layer bottleneck."
  },

  // Maps to StrategicQuery in seo-blocks-3.tsx
  strategicScenario: {
    title: 'Dialect-Perfect Unnesting & Windowing',
    description: 'Generic Text-to-SQL tools fail because they write standard ANSI SQL instead of warehouse-specific dialects. Arcli natively understands BigQuery. It perfectly utilizes `UNNEST`, `QUALIFY`, and complex windowing functions without hallucinating syntax or causing cartesian explosions.',
    dialect: 'Google BigQuery',
    sql: `-- Generated by Arcli Semantic Router & Query Planner
WITH user_cohorts AS (
  SELECT
    e.user_pseudo_id,
    e.event_name,
    CAST(ep.value.int_value AS FLOAT64) AS revenue,
    DATE(TIMESTAMP_MICROS(e.event_timestamp)) AS event_date
  FROM 
    \`analytics_production.events_*\` e
  CROSS JOIN 
    UNNEST(e.event_params) AS ep
  WHERE 
    e.event_name IN ('in_app_purchase', 'subscription_renewal')
    AND ep.key = 'value'
    AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) 
    AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
)
SELECT 
  event_name,
  COUNT(DISTINCT user_pseudo_id) AS unique_converting_users,
  ROUND(SUM(revenue) / 1000000, 2) AS total_revenue_millions
FROM 
  user_cohorts
GROUP BY 
  event_name
QUALIFY 
  ROW_NUMBER() OVER(ORDER BY total_revenue_millions DESC) <= 10;`,
    businessOutcome: 'Generates a 30-day revenue cohort analysis from massively nested Google Analytics 4 event arrays in BigQuery, utilizing QUALIFY clauses to bypass the need for a complex dbt unnesting model.'
  },

  executiveSummary: [
    { value: '100%', label: 'Dialect Accurate' },
    { value: '0', label: 'Models to Maintain' },
    { value: 'API', label: 'First Architecture' },
    { value: 'O(1)', label: 'Query Performance' }
  ],

  // UI Hook for PLG demonstration
  interactiveDemoMap: {
    component: 'OmniscientScratchpad',
    defaultQuery: 'Show me the revenue run-rate from GA4 data, unpacking the event_params array.',
    visualizationType: 'sql-editor'
  },

  faqs: [
    {
      q: 'Do I have to rip out dbt to use Arcli?',
      a: 'No. Arcli sits perfectly on top of your existing dbt models. While you *can* query raw data, connecting Arcli to your pristine, dbt-transformed gold tier tables (or dbt Semantic Layer) will yield the highest quality, instant AI insights.',
      persona: 'Analytics Engineer'
    },
    {
      q: 'How does Arcli handle complex table joins that aren\'t explicitly defined?',
      a: 'During onboarding, Arcli uses a lightweight embedding process to analyze column names, types, and primary/foreign key relationships. The AI Query Planner uses this mathematical semantic graph to determine the safest join paths, heavily penalizing cartesian products.',
      persona: 'Data Architect'
    },
    {
      q: 'Can I inject custom business logic or metric definitions?',
      a: 'Yes. Through Arcli’s Metric Governance layer, you can define core business logic once (e.g., "Active User = Login within 30 days"). The AI orchestrator will strictly adhere to these definitions when generating SQL, ensuring single-source-of-truth accuracy.',
      persona: 'Head of Data'
    }
  ]
};