// lib/seo/database-integrations-1.tsx
import React from 'react';
import { Database } from 'lucide-react';

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

export const databaseIntegrationsPart1: Record<string, SEOPageData> = {
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
  }
};