// lib/seo/guides-2.tsx

import { SEOPageData } from './index';

/**
 * V13 ENFORCED: SEO Guides Part 2
 * All dynamic data structures have been migrated into the strictly typed `blocks` array.
 * React Elements removed from state to guarantee Next.js JSON serialization.
 */
export const howToGuidesPart2: Record<string, SEOPageData> = {
  'how-to-build-sql-dashboard': {
    type: 'guide',
    seo: {
      title: 'How to Build an AI-Powered SQL Dashboard | Arcli',
      description: 'A step-by-step guide to connecting your database and building automated, real-time SQL dashboards without coding using Context-Aware Generative AI.',
      h1: 'Automating SQL Dashboard Construction',
      keywords: [
        'SQL Dashboard Builder', 
        'No Code SQL Dashboard', 
        'Automate Dashboard', 
        'Generative BI', 
        'Text to SQL Dashboard', 
        'Read-Only BI'
      ],
      intent: 'guide',
      canonicalDomain: 'https://arcli.tech/guides/how-to-build-sql-dashboard'
    },
    hero: {
      badge: 'Implementation Guide',
      title: 'Automating SQL Dashboard Construction',
      subtitle: 'Stop waiting weeks for data engineers to build semantic layers. Use Context-Aware AI to generate optimized SQL and interactive layouts dynamically from plain English.',
      icon: 'LayoutTemplate',
      primaryCTA: { text: 'Connect Your Database', href: '/register' },
      secondaryCTA: { text: 'View Live Example', href: '/sandbox/executive-dashboard' }
    },

    // STRICT BLOCK ARCHITECTURE (V13 Rule 4)
    blocks: [
      {
        type: 'ContrarianBanner',
        statement: 'Traditional dashboards force you to anticipate every business question in advance.',
        subtext: 'Deploying a legacy dashboard requires weeks of defining rigid semantic layers in LookML or dbt. Ad-hoc requests frequently fall outside these predefined filters, creating an endless backlog for your data team. AI-powered push-down compute changes this entirely.'
      },
      {
        type: 'InformationGain',
        uniqueInsight: 'Unlike traditional BI that relies on heavy server-side caching and pre-modeling, Arcli uses push-down compute mapped directly to live Information Schemas. This reduces initial setup time from 3 weeks to 3 minutes.',
        structuralAdvantage: 'Provides interactive conversational drill-downs natively, executing dialect-perfect queries against your read-replica without extracting a single row into our cloud.'
      },
      {
        type: 'UIBlock',
        payload: {
          type: 'ArchitectureDiagram',
          // Strict Nested Array Requirement (V13 Rule 2)
          dataMapping: {
            title: 'Legacy BI vs Arcli Push-Down Compute',
            steps: [
              {
                title: '1. The Zero-Copy Connection',
                description: 'Provide a read-only credential to your Postgres or Snowflake read-replica. Data stays securely in your VPC.'
              },
              {
                title: '2. Metadata Schema Mapping',
                description: 'Arcli dynamically scans your Information Schema to understand table relationships, never touching raw records.'
              },
              {
                title: '3. Intent Translation',
                description: 'Users type analytical requests in plain English. The AI generates Dialect-Aware production SQL.'
              },
              {
                title: '4. Push-Down Execution',
                description: 'The query executes on your compute. Arcli only receives the aggregated results to render React-Vega charts.'
              }
            ]
          }
        }
      },
      {
        type: 'ComparisonMatrix',
        // Strict Table Requirement (V13 Rule 3)
        rows: [
          { category: 'Time to First Insight', arcliAdvantage: 'Minutes (Zero-Modeling)', legacy: 'Weeks (Requires dbt/LookML setup)' },
          { category: 'Ad-hoc Flexibility', arcliAdvantage: 'Infinite (Conversational AI)', legacy: 'Rigid (Pre-defined filters only)' },
          { category: 'Data Exposure', arcliAdvantage: 'Zero (Push-Down Compute)', legacy: 'High (ETL to BI server)' }
        ]
      },
      {
        type: 'UIBlock',
        payload: {
          type: 'ProgressiveChart',
          // Strict Nested Payload Requirement (V13 Rule 2)
          dataMapping: {
            title: 'Live Cohort Retention Heatmap',
            visualizationType: 'heatmap',
            codeSnippet: {
              filename: 'cohort_retention.sql',
              language: 'sql',
              code: `WITH cohort_users AS (
    SELECT user_id, DATE_TRUNC('month', created_at) AS cohort_month
    FROM users
)
SELECT cohort_month,
       COUNT(DISTINCT user_id) as total_users
FROM cohort_users GROUP BY 1;`
            },
            governedOutputs: [
              { label: 'Month 1 Retention', value: '82.4%', status: 'optimal' },
              { label: 'Build Time', value: '4.2 Secs', status: 'optimal' }
            ]
          }
        }
      }
    ],

    faqs: [
      {
        q: 'Is it safe to connect Arcli directly to our production database?',
        a: 'While possible, we highly recommend connecting Arcli to a read-replica. We strictly enforce read-only connections at the credential level and apply intelligent LIMITs to prevent warehouse overload.',
        persona: 'Head of Data'
      }
    ],
    relatedSlugs: ['natural-language-to-sql']
  },

  'natural-language-to-sql': {
    type: 'guide',
    seo: {
      title: 'Natural Language to SQL | The Enterprise Implementation Guide',
      description: 'Learn the technical strategy behind deploying secure, hallucination-free Natural Language to SQL generation across massive enterprise data warehouses.',
      h1: 'Executing Flawless Natural Language to SQL',
      keywords: ['Natural Language to SQL', 'Text to SQL', 'AI SQL Generator'],
      intent: 'guide',
      canonicalDomain: 'https://arcli.tech/guides/natural-language-to-sql'
    },
    hero: {
      badge: 'Technical Architecture',
      title: 'Executing Flawless Natural Language to SQL',
      subtitle: 'Move beyond experimental AI chatbots. Discover how to deploy deterministic, mathematically precise Text-to-SQL generation across your enterprise data warehouse.',
      icon: 'TerminalSquare',
      primaryCTA: { text: 'Try the Sandbox', href: '/investigate' },
      secondaryCTA: { text: 'View Architecture Docs', href: '/docs/architecture' }
    },

    blocks: [
      {
        type: 'ContrarianBanner',
        statement: 'Standard off-the-shelf LLMs cannot be trusted to query enterprise databases.',
        subtext: 'If you connect a raw LLM to your database, it will hallucinate table names and generate syntactically incorrect SQL. True enterprise systems require Retrieval-Augmented Generation (RAG) and strict Metadata Grounding to ensure 100% mathematical accuracy.'
      },
      {
        type: 'InformationGain',
        uniqueInsight: 'Arcli utilizes a highly specialized Vector RAG routing mechanism to bypass LLM token limits on 1,000+ table databases. Before generating a query, the AI maps your prompt to semantic vectors, retrieving only the 3-4 highly relevant tables required for the JOIN.',
        structuralAdvantage: 'Decouples the linguistic parsing from the semantic execution, guaranteeing that generated SQL natively utilizes complex Dialect functions (e.g., Snowflake windowing, Postgres JSONB).'
      },
      {
        type: 'ComparisonMatrix',
        // Strict Table Requirement (V13 Rule 3)
        rows: [
          { category: 'Hallucination Risk', arcliAdvantage: 'Zero (Strict Metadata Grounding)', legacy: 'High (LLM guesses table names)' },
          { category: 'Dialect Precision', arcliAdvantage: 'Native Compiler (Snowflake/Postgres)', legacy: 'Generic ANSI SQL' },
          { category: 'Token Efficiency', arcliAdvantage: 'Vector RAG Table Isolation', legacy: 'Context Window Overflow' }
        ]
      },
      {
        type: 'SecurityGuardrails',
        // Strict Array Requirement (V13 Rule 3)
        items: [
          {
            title: 'Semantic Vectorization',
            description: 'Arcli generates vector embeddings for table names and schemas, creating a searchable blueprint without ever pulling raw records.'
          },
          {
            title: 'Schema-Only Inference',
            description: 'Your proprietary customer data is never sent to the LLM model. We operate entirely on column headers and table definitions.'
          }
        ]
      },
      {
        type: 'UIBlock',
        payload: {
          type: 'AnalyticsDashboard',
          // Strict Data Mapping (V13 Rule 1 & 2)
          dataMapping: {
            title: 'Generic LLM Output vs Arcli Compiled Output',
            description: 'Hover to see how Arcli corrects dialect-specific syntax (e.g. Snowflake DATEADD vs Postgres INTERVAL) and executes advanced window functions natively.',
            dialect: 'Snowflake SQL',
            code: `-- Question: Calculate the 7-day rolling average of total signups.

WITH daily_signups AS (
    SELECT DATE_TRUNC('day', created_at) AS signup_date,
           COUNT(user_id) AS total_users
    FROM production.users
    GROUP BY signup_date
)
SELECT signup_date, total_users,
       AVG(total_users) OVER (
           ORDER BY signup_date 
           ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
       ) AS rolling_7_day_avg
FROM daily_signups
ORDER BY signup_date DESC;`,
            businessOutcome: 'Replaces error-prone manual query writing by junior analysts with 100% verifiable, dialect-perfect machine-generated SQL.'
          }
        }
      }
    ],

    faqs: [
      {
        q: 'How do you guarantee the AI won’t hallucinate?',
        a: 'We utilize strict Metadata Grounding. Before generating a query, our semantic layer validates every requested table and column against your live Information Schema, preventing ghost queries.',
        persona: 'CTO'
      }
    ],
    relatedSlugs: ['how-to-build-sql-dashboard']
  }
};