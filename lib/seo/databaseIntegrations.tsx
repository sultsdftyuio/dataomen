// lib/seo/databaseIntegrations.tsx
import React from 'react';
import { Database, Server } from 'lucide-react';

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

export const databaseIntegrations: Record<string, SEOPageData> = {
  'postgresql-ai-analytics': {
    type: 'integration',
    title: 'PostgreSQL AI Analytics & Reporting | Arcli',
    description: 'Connect your PostgreSQL replica to Arcli. Leverage generative AI to query complex JSONB payloads and relational data with zero-latency DuckDB rendering.',
    h1: 'Native AI Intelligence for PostgreSQL',
    subtitle: 'Securely connect your Postgres read-replica and empower your team to query complex relational schemas and unstructured data using plain English.',
    icon: <Database className="w-12 h-12 text-indigo-500 mb-6" />,
    features: [
      'Direct Secure Read-Only Connections', 
      'Native JSONB Object Extraction', 
      'In-Browser DuckDB Visualization',
      'Automated Foreign Key Routing'
    ],
    technicalArchitecture: {
      connectionMethod: 'Direct URI Connection (postgres://) with Static IP Whitelisting.',
      computeModel: 'Hybrid: Aggregation pushed to Postgres; rendering handled by in-browser DuckDB (WebAssembly).',
      securityProtocol: 'Mandated Read-Only user roles. Application-level transaction wrappers actively drop all mutating commands (INSERT, DELETE, DROP).'
    },
    dialectCapabilities: {
      supportedNativeFeatures: [
        'Deep JSONB traversal and array unwrapping (->, ->>, @>)',
        'Recursive Common Table Expressions (CTEs)',
        'Advanced Window Functions for time-intelligence',
        'PostGIS geospatial query generation (optional)'
      ],
      aiOptimizations: 'Arcli’s semantic router is specifically trained on the PostgreSQL 12+ dialect, ensuring it prioritizes highly efficient indexing and native date-truncation functions over generic SQL translations.'
    },
    workflowTransformation: {
      beforeArcli: [
        'Extracting metrics from unstructured JSONB columns requires highly specialized SQL knowledge.',
        'Data must be modeled and flattened via ETL pipelines before traditional BI tools can ingest it.',
        'Dashboard caching layers introduce latency, resulting in stale operational data.'
      ],
      withArcli: [
        'The AI natively writes complex JSONB extraction operators based on user intent.',
        'Zero upfront modeling required; Arcli dynamically maps the schema directly from the replica.',
        'Zero-latency visual filtering powered by continuous WebAssembly execution.'
      ]
    },
    steps: [
      { name: '1. Network Authorization', text: 'Securely whitelist Arcli\'s static IP addresses within your VPC.' },
      { name: '2. Authenticate Replica', text: 'Provide a read-only connection string to your Postgres instance.' },
      { name: '3. Conversational Discovery', text: 'Generate analytical SQL and interactive visualizations via natural language.' }
    ],
    realExample: {
      query: "Show me the 30-day trailing revenue, broken down by the user's subscription tier stored inside the 'metadata' JSONB column.",
      sql: `SELECT 
  DATE_TRUNC('day', created_at) AS date,
  metadata->>'subscription_tier' AS tier,
  SUM(amount) AS total_revenue
FROM payments
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND status = 'succeeded'
GROUP BY 1, 2
ORDER BY 1 ASC;`,
      output: "Stacked Area Chart",
      insight: "Unstructured JSONB fields extracted natively, revealing real-time cohort revenue."
    },
    useCases: [
      { title: 'Production Telemetry Analysis', description: 'Analyze live feature adoption directly from your production replica without degrading application performance.' },
      { title: 'Operational Support', description: 'Instantly generate support dashboards to investigate user transactional histories without building custom admin panels.' }
    ],
    faqs: [
      { q: 'Do you support self-hosted Postgres instances?', a: 'Yes. Arcli supports any Postgres instance accessible via a secure connection string, including AWS RDS, Aurora, Supabase, Neon, and bare-metal deployments.' },
      { q: 'How does the system map foreign keys?', a: 'Upon connection, Arcli’s RAG engine scans your `information_schema`. It uses explicit foreign keys, as well as semantic column naming conventions (e.g., `user_id` matching `users.id`), to build a highly accurate relational graph.' }
    ],
    relatedSlugs: ['snowflake-ai-analytics', 'mysql-ai-analytics', 'natural-language-to-sql']
  },

  'mysql-ai-analytics': {
    type: 'integration',
    title: 'MySQL AI Analytics & Dashboard Builder | Arcli',
    description: 'Connect your MySQL database to Arcli. Leverage conversational AI to navigate highly normalized schemas and automate complex multi-table JOINs instantly.',
    h1: 'Relational Agility for MySQL',
    subtitle: 'Provide your organization with secure, conversational access to your MySQL instances. Automate complex JOINs without writing boilerplate SQL.',
    icon: <Database className="w-12 h-12 text-blue-400 mb-6" />,
    features: [
      'Direct Secure MySQL Connections', 
      'Automated Multi-Table JOINs', 
      'Zero Data Movement Architecture',
      'Real-Time Schema Synchronization'
    ],
    technicalArchitecture: {
      connectionMethod: 'Direct URI Connection (mysql://) protected by TLS encryption.',
      computeModel: 'Push-Down Compute: All heavy data crunching is executed on the MySQL server to minimize data egress.',
      securityProtocol: 'Strict Read-Only isolation. No raw data is permanently stored on Arcli servers.'
    },
    dialectCapabilities: {
      supportedNativeFeatures: [
        'Native MySQL Date and Time functions (MAKEDATE, DATE_ADD)',
        'Complex Multi-Table INNER and LEFT JOIN orchestrations',
        'GROUP_CONCAT aggregation for relational flattening'
      ],
      aiOptimizations: 'Trained explicitly on MySQL 8.0+ syntax, the AI intuitively navigates highly normalized relational environments, accurately inferring multi-hop JOIN paths.'
    },
    workflowTransformation: {
      beforeArcli: [
        'Analyzing highly normalized schemas requires engineers to write precise JOINs across 5+ tables.',
        'Data engineering teams dedicate excessive bandwidth to fulfilling basic operational data requests.',
        'Business operators frequently export raw data into local spreadsheets, creating compliance risks.'
      ],
      withArcli: [
        'Arcli autonomously orchestrates complex, multi-hop JOIN logic based on plain English queries.',
        'Empowers true self-serve analytics, bypassing the centralized engineering queue.',
        'Maintains data securely within the database while providing interactive visualizations in the browser.'
      ]
    },
    steps: [
      { name: '1. Establish Connection', text: 'Provide a read-only MySQL credential.' },
      { name: '2. Schema Synchronization', text: 'The Semantic Router indexes table structures, column types, and relational metadata.' },
      { name: '3. Natural Querying', text: 'Ask business questions to generate interactive charts natively.' }
    ],
    realExample: {
      query: "Show me the top 5 product categories by total sales volume this quarter, excluding refunded orders.",
      sql: `SELECT 
  c.category_name,
  SUM(oi.quantity * oi.unit_price) AS total_sales_volume
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
JOIN categories c ON p.category_id = c.id
WHERE o.created_at >= MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL QUARTER(CURDATE())-1 QUARTER
  AND o.status != 'refunded'
GROUP BY c.id
ORDER BY total_sales_volume DESC
LIMIT 5;`,
      output: "Horizontal Bar Chart",
      insight: "A complex 4-table relational JOIN orchestrated flawlessly via conversational intent."
    },
    useCases: [
      { title: 'Application Funnel Tracking', description: 'Evaluate live user progression and conversion drop-offs directly from your application database.' },
      { title: 'E-commerce Telemetry', description: 'Deploy automated tracking for inventory levels, fulfillment pipelines, and cart abandonment rates.' }
    ],
    faqs: [
      { q: 'Is this safe for high-traffic production environments?', a: 'We strictly mandate connecting Arcli to a MySQL read-replica to ensure analytical workloads do not consume compute resources required by your primary application.' },
      { q: 'Can the AI understand my legacy column names?', a: 'Yes. Arcli’s Semantic Governance layer allows you to alias cryptic columns (e.g., mapping `usr_stat_cd` to `User Status`), ensuring perfect translation from natural language.' }
    ],
    relatedSlugs: ['postgresql-ai-analytics', 'natural-language-to-sql']
  },

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