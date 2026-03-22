// lib/seo/database-integrations-2.tsx
import React from 'react';
import { Server } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Integration Blueprint" schema. 
 * Designed specifically for Data Engineers and DevOps professionals. 
 * Focuses on connection protocols, dialect-specific capabilities, and security.
 */
export type SEOPageData = {
  type: 'integration';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  technicalArchitecture: {
    connectionMethod: string;
    computeModel: string;
    securityProtocol: string;
  };
  dialectCapabilities: {
    supportedNativeFeatures: string[];
    aiOptimizations: string;
  };
  workflowTransformation: {
    beforeArcli: string[];
    withArcli: string[];
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

export const databaseIntegrationsPart2: Record<string, SEOPageData> = {
  'snowflake-ai-analytics': {
    type: 'integration',
    title: 'Snowflake AI Analytics & SQL Generator | Arcli',
    description: 'Deploy generative AI on your Snowflake data cloud. Evaluate how Arcli\'s Context-Aware RAG ensures cost-efficient, push-down compute across massive enterprise schemas.',
    h1: 'Generative AI Designed for Snowflake Economics',
    subtitle: 'Maximize your cloud compute ROI. Arcli generates highly optimized, cost-aware Snowflake SQL from plain English, utilizing dynamic push-down compute.',
    icon: <Server className="w-12 h-12 text-sky-500 mb-6" />,
    features: [
      'Cost-Aware Push-Down Compute', 
      'Semantic RAG for 1000+ Table Schemas', 
      'Native Snowflake RBAC Security',
      'Vectorized Embedded Search'
    ],
    technicalArchitecture: {
      connectionMethod: 'Secure authentication via Snowflake Account Locator and specific Warehouse targeting.',
      computeModel: 'Extreme Push-Down: Arcli acts as a highly optimized query orchestrator, leveraging Snowflake’s native elastic compute for all aggregations.',
      securityProtocol: 'Inherits your native Snowflake Role-Based Access Control (RBAC). Arcli can only query what its designated role is permitted to see.'
    },
    dialectCapabilities: {
      supportedNativeFeatures: [
        'Time Travel and Zero-Copy Clone querying',
        'Native Snowflake JSON parsing (FLATTEN, PARSE_JSON)',
        'Highly specific Snowflake date functions (DATEADD, DATEDIFF)'
      ],
      aiOptimizations: 'Arcli’s engine is programmed for cost-efficiency. It aggressively avoids "SELECT *" patterns, utilizing explicit column declarations to minimize Snowflake compute credits and scanning costs.'
    },
    workflowTransformation: {
      beforeArcli: [
        'Visual BI tools frequently generate unoptimized queries that consume excessive Snowflake warehouse credits.',
        'Passing enterprise schemas (thousands of tables) into standard LLMs results in token exhaustion and hallucinations.',
        'Extracting massive data sets into external visualization layers incurs high data egress fees.'
      ],
      withArcli: [
        'Cost-aware SQL generation ensures minimum necessary bytes are scanned per query.',
        'Context-Aware Vector RAG dynamically injects only the metadata of the 3-5 relevant tables required for the query.',
        'Zero-Data Movement ensures data stays within Snowflake; only aggregated visual metadata is returned to the client.'
      ]
    },
    steps: [
      { name: '1. Scoped Role Creation', text: 'Configure a dedicated, read-only Arcli role within Snowflake.' },
      { name: '2. Connect Environment', text: 'Input your Account Locator, target Warehouse, and Database.' },
      { name: '3. Optimized Execution', text: 'Generate explicit, dialect-perfect SQL using conversational commands.' }
    ],
    realExample: {
      query: "Analyze our cloud cost table. Show me the total credits used by warehouse name over the last 7 days, excluding the 'ADMIN_WH'.",
      sql: `SELECT 
  WAREHOUSE_NAME,
  DATE_TRUNC('DAY', START_TIME) AS usage_date,
  SUM(CREDITS_USED) AS total_credits
FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
WHERE START_TIME >= DATEADD(DAY, -7, CURRENT_DATE())
  AND WAREHOUSE_NAME != 'ADMIN_WH'
GROUP BY 1, 2
ORDER BY 2 DESC, 3 DESC;`,
      output: "Multi-Series Line Chart",
      insight: "Compute anomalies identified seamlessly using explicit, cost-efficient querying."
    },
    useCases: [
      { title: 'Executive Data Access', description: 'Enable enterprise leaders to query petabyte-scale data clouds securely via chat, bypassing engineering bottlenecks.' },
      { title: 'Financial Operations (FinOps)', description: 'Deploy instant dashboards tracking Snowflake credit consumption and cross-departmental chargebacks.' }
    ],
    faqs: [
      { q: 'How does Arcli handle schemas with thousands of tables?', a: 'We employ High-Dimensional Vector Routing. Rather than passing your entire schema to an LLM, we generate embeddings for your tables. A semantic search pulls only the strictly necessary table metadata for any given query, preventing token bloat.' },
      { q: 'Does Arcli integrate with our existing dbt models?', a: 'Yes. Arcli reads your `schema.yml` files, seamlessly inheriting the descriptions and relationships modeled by your data engineering team in dbt.' }
    ],
    relatedSlugs: ['postgresql-ai-analytics', 'bigquery-ai-analytics', 'natural-language-to-sql']
  },

  'bigquery-ai-analytics': {
    type: 'integration',
    title: 'Google BigQuery AI Analytics & Dashboards | Arcli',
    description: 'Connect Arcli to Google BigQuery. Leverage an AI engine specifically trained to UNNEST complex structs, optimize partition scanning, and control query costs.',
    h1: 'Structural AI Intelligence for BigQuery',
    subtitle: 'Harness BigQuery’s massive scale with an AI that natively unwraps nested arrays and enforces strict partition scanning guardrails.',
    icon: <Server className="w-12 h-12 text-blue-600 mb-6" />,
    features: [
      'Native ARRAY and STRUCT Unnesting', 
      'GCP IAM Service Account Integration', 
      'Cost Control & Partition Guardrails',
      'Push-Down Columnar Compute'
    ],
    technicalArchitecture: {
      connectionMethod: 'Secure authentication via scoped Google Cloud IAM Service Account JSON keys.',
      computeModel: 'BigQuery API Push-Down: Arcli utilizes the native BigQuery REST API to execute complex workloads on GCP architecture.',
      securityProtocol: 'Enforces strict adherence to GCP IAM permissions. Supports VPC Service Controls for enterprise perimeters.'
    },
    dialectCapabilities: {
      supportedNativeFeatures: [
        'Advanced UNNEST capabilities for REPEATED and STRUCT fields',
        'Partition and Clustering filter enforcement (_TABLE_SUFFIX, _PARTITIONTIME)',
        'Native BigQuery ML model invocation via SQL'
      ],
      aiOptimizations: 'Arcli’s query planner is optimized for GCP billing economics. It is programmatically forced to utilize partition keys and explicit column selection, strictly minimizing the bytes scanned per execution.'
    },
    workflowTransformation: {
      beforeArcli: [
        'Exports from GA4 or Firebase utilize deeply nested ARRAY structures that are exceptionally difficult to unwrap manually.',
        'Accidental queries scanning unpartitioned petabyte tables can generate severe cloud billing spikes.',
        'Connecting massive datasets to legacy visualization tools results in heavy latency and slow dashboard load times.'
      ],
      withArcli: [
        'The generative engine seamlessly authors the necessary UNNEST logic based on standard conversational requests.',
        'Mandated partition filters guarantee maximum cost-control before a query is ever executed.',
        'Sub-second visual rendering is achieved by pushing the heavy math to BigQuery and rendering only the aggregated output via WebAssembly.'
      ]
    },
    steps: [
      { name: '1. IAM Authentication', text: 'Connect utilizing a secure Google Cloud Service Account credential.' },
      { name: '2. Dataset Targeting', text: 'Specify which BigQuery datasets and materialized views are exposed to the AI router.' },
      { name: '3. Orchestrated Compute', text: 'Arcli authors the complex nested SQL and pushes the processing layer to Google.' }
    ],
    realExample: {
      query: "Analyze our GA4 export. Show me the total purchases and revenue, grouped by device category for the last 30 days.",
      sql: `SELECT 
  device.category AS device_category,
  COUNT(*) AS total_purchases,
  SUM((SELECT value.double_value FROM UNNEST(event_params) WHERE key = 'value')) AS total_revenue
FROM \`my-gcp-project.analytics_123456.events_*\`
WHERE event_name = 'purchase'
  AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
GROUP BY 1
ORDER BY 3 DESC;`,
      output: "Donut Chart & Metric Scorecard",
      insight: "Nested GA4 event parameters unpacked flawlessly while adhering to strict _TABLE_SUFFIX partition constraints."
    },
    useCases: [
      { title: 'GA4 / Firebase Telemetry', description: 'Parse complex Google Analytics 4 event streams to extract precise conversion funnels without navigating the rigid GA4 UI.' },
      { title: 'Petabyte Log Aggregation', description: 'Execute semantic searches across millions of server logs or event streams utilizing natural language parameters.' }
    ],
    faqs: [
      { q: 'How does Arcli prevent accidental full-table scans?', a: 'Arcli’s semantic layer is structurally mandated to identify partitioned tables. If a partition exists, the AI is forced to inject a date or boundary filter into the WHERE clause, ensuring runaway billing events do not occur.' },
      { q: 'Is my BigQuery data stored by Arcli?', a: 'No. Your raw data remains securely within your Google Cloud perimeter. Arcli acts purely as a stateless orchestration engine, generating the SQL and retrieving only the lightweight result set.' }
    ],
    relatedSlugs: ['snowflake-ai-analytics', 'google-analytics-ai-dashboard', 'natural-language-to-sql']
  }
};