// lib/seo/saas-integrations-2.tsx
import React from 'react';
import { Search } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Application Intelligence Blueprint" schema. 
 * Designed for RevOps, E-commerce, and Growth leaders who are bottlenecked 
 * by native SaaS reporting UIs. Focuses on API data extraction, domain-specific 
 * data handling (custom fields, nested JSON), and conversational acceleration.
 */
export type SEOPageData = {
  type: 'integration';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  dataExtractionArchitecture: {
    connectionProtocol: string;
    schemaMapping: string;
    syncFrequency: string;
  };
  domainSpecificCapabilities: {
    handlingQuirks: string[];
    aiAdvantage: string;
  };
  nativeUiBypass: {
    legacyLimitations: string[];
    arcliAcceleration: string[];
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

export const saasIntegrationsPart2: Record<string, SEOPageData> = {
  'google-analytics-ai-dashboard': {
    type: 'integration',
    title: 'Google Analytics 4 AI Dashboard | Arcli',
    description: 'Connect GA4 to Arcli and bypass the complex native UI. Use generative AI to UNNEST BigQuery events and analyze web traffic instantly.',
    h1: 'AI-Powered Google Analytics (GA4)',
    subtitle: 'Bypass the notoriously complex GA4 interface. Connect your BigQuery export to Arcli and ask for precise traffic and conversion metrics using plain English.',
    icon: <Search className="w-12 h-12 text-orange-500 mb-6" />,
    features: [
      'Conversational Event Analysis', 
      'Automated Funnel Drop-off Tracking', 
      'Cross-Platform Attribution Modeling',
      'Bypass GA4 UI Quotas and Sampling'
    ],
    dataExtractionArchitecture: {
      connectionProtocol: 'Direct integration with your GA4 BigQuery Export utilizing secure, scoped Google Cloud Service Accounts.',
      schemaMapping: 'Intelligent indexing of GA4\'s daily partition tables (`events_YYYYMMDD`) to ensure cost-controlled, targeted query execution.',
      syncFrequency: 'Relies on Google\'s native daily or streaming BigQuery export pipelines to ensure pristine data availability.'
    },
    domainSpecificCapabilities: {
      handlingQuirks: [
        'Natively authors the highly complex SQL required to `UNNEST` GA4\'s deeply nested `event_params` STRUCT arrays.',
        'Automates sessionization logic and cross-device user tracking mapping.',
        'Enforces strict `_TABLE_SUFFIX` partition filters to prevent accidental, costly full-table scans in BigQuery.'
      ],
      aiAdvantage: 'Arcli’s orchestration engine understands the specific schema design of GA4 natively, translating simple business questions directly into optimized BigQuery Standard SQL without hallucinating field names.'
    },
    nativeUiBypass: {
      legacyLimitations: [
        'The native GA4 UI is highly unintuitive, frequently burying critical operational reports behind complex, nested navigation menus.',
        'Strict API quotas and aggressive data sampling make standard reporting inaccurate for high-traffic enterprise sites.',
        'Attempting to join native GA4 session data with actual backend database revenue is nearly impossible within the Google UI.'
      ],
      arcliAcceleration: [
        'Queries the raw BigQuery export directly, guaranteeing 100% unsampled, mathematically accurate data.',
        'Eliminates the learning curve: if an operator can type a question, they can extract complex funnel analytics.',
        'Enables true cross-platform blending, allowing you to seamlessly join GA4 acquisition data with your production database.'
      ]
    },
    steps: [
      { name: '1. Connect BigQuery Export', text: 'Securely link your GA4 BigQuery project to Arcli via GCP IAM credentials.' },
      { name: '2. Semantic Event Mapping', text: 'Our engine parses your standard events (`page_view`, `session_start`) and custom events into a queryable semantic graph.' },
      { name: '3. Analyze Traffic', text: 'Ask "What is the conversion rate of blog readers to paid signups by device category?" to render instant trends.' }
    ],
    realExample: {
      query: "Show me the top 5 landing pages by total sessions over the last 30 days, and include their average engagement time.",
      sql: `WITH session_data AS (
  SELECT 
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS landing_page,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_time
  FROM ga4_events
  WHERE event_name = 'session_start'
    AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
)
SELECT 
  landing_page,
  COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(session_id AS STRING))) AS total_sessions,
  ROUND(AVG(engagement_time) / 1000, 2) AS avg_engagement_seconds
FROM session_data
WHERE landing_page IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC
LIMIT 5;`,
      output: "Ranked Data Table",
      insight: "The '/pricing' page drives the 2nd highest volume of sessions, but maintains the lowest average engagement time (12s), indicating a potential UX friction point."
    },
    useCases: [
      { title: 'Marketing Attribution', description: 'Determine exactly which organic content channels are driving high-intent users by utilizing conversational routing logic.' },
      { title: 'UX Optimization', description: 'Instantly generate multi-step funnel reports to pinpoint exactly where mobile users are abandoning the checkout flow.' }
    ],
    faqs: [
      { q: 'Does Arcli connect via the standard GA4 API or BigQuery?', a: 'To ensure the highest performance and to entirely bypass GA4 API data sampling and strict rate quotas, Arcli natively integrates with your GA4 BigQuery export.' },
      { q: 'Can I combine GA4 data with my internal production database?', a: 'Yes. If you pass a persistent User ID to GA4, Arcli seamlessly authors the complex SQL required to join your GA4 acquisition data with your internal Postgres or Snowflake database, enabling true Return on Ad Spend (ROAS) calculation.' }
    ],
    relatedSlugs: ['marketing-dashboard-template', 'natural-language-to-sql']
  }
};