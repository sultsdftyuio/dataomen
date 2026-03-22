// lib/seo/guides-2.tsx
import React from 'react';
import { LayoutTemplate } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Tactical Execution Blueprint" schema. 
 * Designed for high-intent users looking for concrete, step-by-step 
 * methodological solutions to specific analytical hurdles. Focuses on 
 * technical execution, strategy, and measurable business impact.
 */
export type SEOPageData = {
  type: 'feature' | 'integration' | 'comparison' | 'guide' | 'template';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  challengeContext: {
    traditionalMethod: string;
    bottlenecks: string[];
  };
  executionStrategy: {
    approach: string;
    technicalEnablers: string[];
  };
  businessImpact: {
    metricImprovements: string[];
    workflowOptimization: string;
  };
  steps: { name: string; text: string }[];
  realExample?: {
    query: string;
    sql: string;
    output: string;
    insight: string;
  };
  useCases: { title: string; description: string }[];
  faqs: { q: string; a: string }[];
  relatedSlugs: string[];
};

export const howToGuidesPart2: Record<string, SEOPageData> = {
  'how-to-build-sql-dashboard': {
    type: 'guide',
    title: 'How to Build a SQL Dashboard Without Coding | Arcli',
    description: 'A methodological guide to connecting your database and building automated, real-time SQL dashboards using Context-Aware Generative AI.',
    h1: 'Automating SQL Dashboard Construction',
    subtitle: 'Bypass boilerplate query writing and brittle semantic layers. Utilize Context-Aware RAG to generate optimized SQL and interactive layouts dynamically.',
    icon: <LayoutTemplate className="w-12 h-12 text-indigo-400 mb-6" />,
    features: [
      'Auto-Generated, Optimized SQL', 
      'Direct Database Read-Replica Syncing', 
      'Interactive Vectorized Cross-Filtering',
      'Context-Aware Schema Routing'
    ],
    challengeContext: {
      traditionalMethod: 'Centralized BI architectures where data engineers build rigid, predefined dashboard views based on anticipated business questions using proprietary modeling languages.',
      bottlenecks: [
        'Deploying a traditional dashboard requires weeks of defining semantic layers (e.g., LookML) and ETL pipelines.',
        'Ad-hoc stakeholder requests fall outside predefined dashboard filters, creating severe engineering ticket bottlenecks.',
        'Server-side caching layers introduce latency, resulting in dashboards that display stale, 24-hour-old data.'
      ]
    },
    executionStrategy: {
      approach: 'A zero-setup intelligence layer that dynamically maps replica schemas and utilizes generative AI to author and execute production-grade SQL upon natural language requests.',
      technicalEnablers: [
        'Context-Aware Semantic Routing',
        'Read-replica push-down compute',
        'React-Vega real-time rendering logic'
      ]
    },
    businessImpact: {
      metricImprovements: [
        'Drastic reduction in ad-hoc SQL ticket volume for data teams.',
        'Zero-latency data availability for operational stakeholders.'
      ],
      workflowOptimization: 'Achieves true self-serve analytics by translating operator intent into secure, production-grade SQL instantly, bypassing the central data queue.'
    },
    steps: [
      { name: '1. Replica Integration', text: 'Securely connect your Postgres, MySQL, BigQuery, or Snowflake read-replica via our read-only integration perimeter.' },
      { name: '2. Intent Translation', text: 'Command the engine (e.g., "Create a chart showing DAU against Server Error rates"). The RAG engine orchestrates the necessary JOINs.' },
      { name: '3. Layout Pinning', text: 'The AI executes the optimized SQL and returns a visual asset. Pin the asset to compile a live, multi-tenant workspace.' }
    ],
    realExample: {
      query: "Build a cohort retention matrix showing the percentage of users returning in months 1 through 6, grouped by the month they signed up.",
      sql: `WITH cohort_users AS (
  SELECT user_id, DATE_TRUNC('month', created_at) AS cohort_month
  FROM users
),
activity_months AS (
  SELECT user_id, DATE_TRUNC('month', event_date) AS activity_month
  FROM user_events
  GROUP BY 1, 2
)
SELECT 
  c.cohort_month,
  EXTRACT(MONTH FROM AGE(a.activity_month, c.cohort_month)) AS month_number,
  COUNT(DISTINCT c.user_id) AS active_users
FROM cohort_users c
JOIN activity_months a ON c.user_id = a.user_id
WHERE a.activity_month >= c.cohort_month
GROUP BY 1, 2
ORDER BY 1, 2;`,
      output: "Interactive Heatmap Matrix",
      insight: "Complex SQL generation executed flawlessly, revealing a critical Month-3 retention drop-off in the September cohort."
    },
    useCases: [
      { title: 'Product Analytics & Telemetry', description: 'Quickly deploy dashboards monitoring live feature adoption, funnel drop-off, and DAU/MAU ratios without utilizing data engineering bandwidth.' },
      { title: 'Operational Command Centers', description: 'Construct real-time screens tracking live inventory levels, support ticket queues, or microservice health metrics.' }
    ],
    faqs: [
      { q: 'Can engineers view and edit the underlying generated SQL?', a: 'Absolutely. Arcli provides full transparency. Engineers can inspect, modify, and export the exact SQL queries generated by the orchestration engine to verify mathematical precision.' },
      { q: 'Is it safe to connect Arcli directly to my database?', a: 'Yes. We enforce strict read-only analytical connections. Additionally, all AI-generated queries are wrapped in transaction blocks that proactively reject any mutating operations (INSERT, DROP) at the application layer.' }
    ],
    relatedSlugs: ['how-to-build-dashboard-from-csv', 'natural-language-to-sql']
  }
};