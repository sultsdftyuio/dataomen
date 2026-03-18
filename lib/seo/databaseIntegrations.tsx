// lib/seo/databaseIntegrations.tsx
import React from 'react';
import { Database, Server } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Search-Intent Machine" schema to capture high-intent users
 * looking to bypass traditional BI bottlenecks on specific data warehouses.
 */
export type SEOPageData = {
  type: 'feature' | 'integration' | 'comparison' | 'guide' | 'template';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  steps: { name: string; text: string }[];
  realExample?: {
    query: string;
    sql: string;
    output: string;
    insight: string;
  };
  painPoints?: {
    title: string;
    points: string[];
    solution: string;
  };
  useCases: { title: string; description: string }[];
  faqs: { q: string; a: string }[];
  comparison?: { 
    competitor: string; 
    arcliWins: string[]; 
    competitorFlaws: string[]; 
  };
  relatedSlugs: string[];
};

export const databaseIntegrations: Record<string, SEOPageData> = {
  'postgresql-ai-analytics': {
    type: 'integration',
    title: 'PostgreSQL AI Analytics & Reporting | Arcli',
    description: 'Connect your PostgreSQL database to Arcli. Bypass traditional BI and unlock AI-driven insights, deep JSONB querying, and instant visualizations.',
    h1: 'Supercharge PostgreSQL with AI Analytics',
    subtitle: 'Securely connect your Postgres replica and let your team query terabytes of relational data using plain English, powered by semantic schema RAG.',
    icon: <Database className="w-12 h-12 text-indigo-500 mb-6" />,
    features: [
      'Direct Secure Read-Only Connections', 
      'Native JSONB & CTE Support', 
      'In-Browser DuckDB Result Visualization',
      'Automated Foreign Key Mapping'
    ],
    painPoints: {
      title: 'Why PostgreSQL Reporting is Usually a Nightmare',
      points: [
        'Setting up traditional BI tools (like Tableau or Metabase) requires weeks of building semantic models and ETL pipelines.',
        'Extracting metrics from complex JSONB columns or deeply nested relationships requires highly specialized SQL knowledge.',
        'Caching layers in standard dashboards mean your "live" data is actually 12 to 24 hours old.'
      ],
      solution: 'Arcli connects directly to your Postgres replica and reads the schema metadata. You ask questions in English, and we generate highly optimized native Postgres SQL. Results are streamed to your browser via DuckDB for instantaneous, zero-cache filtering.'
    },
    steps: [
      { name: '1. Whitelist IP', text: 'Whitelist Arcli\'s secure, static IP addresses in your VPC or firewall settings.' },
      { name: '2. Provide Read-Only URL', text: 'Connect using a standard postgres:// connection string with a read-only user.' },
      { name: '3. Query Live Data', text: 'Start using Natural Language to instantly generate charts and complex queries.' }
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
      insight: "Enterprise tier revenue has maintained steady growth, while the Pro tier spiked sharply following the latest feature release on the 15th."
    },
    comparison: {
      competitor: 'Traditional BI (Tableau / Metabase)',
      competitorFlaws: [
        'Requires an entire data engineering team to maintain the semantic layer.',
        'Terrible native support for unpacking unstructured JSONB payloads.',
        'Slow, clunky interfaces for ad-hoc business user exploration.'
      ],
      arcliWins: [
        'Zero setup time: connect the URL and start asking questions immediately.',
        'AI natively understands and writes the exact operators for Postgres JSONB extraction.',
        'Sub-second filtering enabled by in-browser WebAssembly compute.'
      ]
    },
    useCases: [
      { title: 'SaaS Production Analytics', description: 'Query read-replicas of your production Postgres DB to understand live feature adoption without impacting app performance.' },
      { title: 'Internal Tooling', description: 'Instantly spin up customer support dashboards to investigate user payment histories without building custom admin panels.' }
    ],
    faqs: [
      { q: 'Do you support self-hosted Postgres instances?', a: 'Yes, as long as the database is accessible via a secure connection string or our static IP allowlist. We support AWS RDS, Aurora, Supabase, Neon, and bare-metal setups.' },
      { q: 'Can Arcli accidentally delete or drop my tables?', a: 'Absolutely not. In addition to requiring a read-only user, our execution engine wraps all queries in a transaction block that actively rejects any INSERT, UPDATE, DELETE, or DROP commands.' }
    ],
    relatedSlugs: ['snowflake-ai-analytics', 'mysql-ai-analytics', 'natural-language-to-sql']
  },

  'mysql-ai-analytics': {
    type: 'integration',
    title: 'MySQL AI Analytics & Dashboard Builder | Arcli',
    description: 'Connect your MySQL database to Arcli. Generate instant dashboards and run complex natural language queries on your relational tables without writing SQL.',
    h1: 'AI Analytics for MySQL Databases',
    subtitle: 'Give your entire team secure, conversational access to your MySQL database without writing a single line of boilerplate SQL or configuring brittle data models.',
    icon: <Database className="w-12 h-12 text-blue-400 mb-6" />,
    features: [
      'Direct Secure MySQL Connections', 
      'Automated Multi-Table JOINs', 
      'Zero Data Movement Architecture',
      'Real-time Schema Syncing'
    ],
    painPoints: {
      title: 'The Bottleneck of MySQL Ad-Hoc Requests',
      points: [
        'Writing MySQL queries that require JOINs across 5+ normalized tables is tedious and highly prone to error.',
        'Engineers spend 20% of their week answering basic "How many users did X today?" questions for the product team.',
        'Exporting MySQL tables to Excel for analysis leads to massive security and compliance risks.'
      ],
      solution: 'Arcli acts as an autonomous data analyst. Our semantic engine indexes your MySQL relationships. When a product manager asks a question, Arcli safely writes the complex JOINs, executes the query, and visualizes it—freeing up your engineering team.'
    },
    steps: [
      { name: '1. Provide Credentials', text: 'Connect using a standard mysql:// read-only string.' },
      { name: '2. Schema Syncing', text: 'Our Semantic Router instantly indexes your tables, column types, and foreign key relationships.' },
      { name: '3. Start Querying', text: 'Type questions in plain English to generate real-time, interactive Vega charts.' }
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
      insight: "The 'Electronics' category dominates sales volume, but 'Home Goods' is surprisingly driving the second highest revenue this quarter."
    },
    comparison: {
      competitor: 'Standard SQL Clients (DBeaver / DataGrip)',
      competitorFlaws: [
        'Built exclusively for engineers; unusable by business stakeholders.',
        'Requires manual writing of every JOIN and aggregation.',
        'Visualization capabilities are usually limited to basic, non-interactive grids.'
      ],
      arcliWins: [
        'Conversational interface built for non-technical users.',
        'AI dynamically generates complex JOIN paths based on schema mapping.',
        'Beautiful, highly interactive dashboards out of the box.'
      ]
    },
    useCases: [
      { title: 'Live Application Analytics', description: 'Analyze live user behavior and funnel conversion rates directly from your production MySQL replica.' },
      { title: 'E-commerce Reporting', description: 'Instantly build dashboards tracking inventory levels, shipping times, and cart abandonment.' }
    ],
    faqs: [
      { q: 'Is this safe for a production environment?', a: 'We strongly mandate connecting Arcli to a read-replica database to ensure zero analytical query loads impact your live application\'s performance.' },
      { q: 'How does it understand my cryptic column names?', a: 'You can provide semantic descriptions directly in Arcli (e.g., mapping "usr_stat_cd" to "User Status"). Our RAG engine uses these definitions to translate natural language perfectly.' }
    ],
    relatedSlugs: ['postgresql-ai-analytics', 'natural-language-to-sql']
  },

  'snowflake-ai-analytics': {
    type: 'integration',
    title: 'Snowflake AI Analytics & SQL Generator | Arcli',
    description: 'Deploy AI directly on top of your Snowflake data warehouse. Maximize your cloud compute with intelligent, cost-aware SQL generation and natural language dashboards.',
    h1: 'Native AI Analytics for Snowflake Data Clouds',
    subtitle: 'Stop wasting warehouse compute credits on poorly optimized analytical queries. Arcli generates cost-efficient, performant Snowflake SQL from plain English automatically.',
    icon: <Server className="w-12 h-12 text-sky-500 mb-6" />,
    features: [
      'Cost-Aware Push-Down Compute', 
      'Semantic RAG for 1000+ Table Schemas', 
      'Native Snowflake RBAC Security',
      'Zero-Copy Clone & Time Travel Querying'
    ],
    painPoints: {
      title: 'Why Snowflake BI Gets Too Expensive',
      points: [
        'Non-technical users using drag-and-drop BI tools often generate massive, unoptimized "SELECT *" queries that burn through compute credits.',
        'Navigating enterprise schemas with thousands of tables and views causes LLMs to hallucinate or hit token limits instantly.',
        'Pulling large datasets out of Snowflake into external BI tools incurs heavy data egress fees.'
      ],
      solution: 'Arcli solves the Snowflake scale problem. We use Vector RAG to selectively inject only the metadata of the 3-5 necessary tables into the AI prompt. The AI then writes highly explicit, column-specific SQL (push-down compute), saving you massive amounts of credits.'
    },
    steps: [
      { name: '1. Create Read-Only Role', text: 'Create a dedicated, scoped Arcli read-only role in your Snowflake instance.' },
      { name: '2. Connect Warehouse', text: 'Input your Account Locator, Warehouse, and Database parameters.' },
      { name: '3. Analyze at Scale', text: 'Let Arcli write the optimized SQL while Snowflake handles the heavy compute lifting securely.' }
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
      insight: "The 'DATA_SCIENCE_WH' consumed 450 credits on Tuesday, indicating a massive model training run that needs review."
    },
    comparison: {
      competitor: 'Snowflake Snowsight (Native UI)',
      competitorFlaws: [
        'Requires deep knowledge of Snowflake-specific SQL syntax and functions.',
        'Dashboards are highly static and difficult to share externally.',
        'No conversational interface for rapid ad-hoc data discovery.'
      ],
      arcliWins: [
        'Conversational interface translates English directly into Snowflake SQL.',
        'Renders results into highly interactive, shareable React-Vega dashboards.',
        'Maintains state across chat turns for iterative, deep-dive data exploration.'
      ]
    },
    useCases: [
      { title: 'Executive Data Democratization', description: 'Allow C-Suite executives to query petabytes of Snowflake data lakes securely via chat, bypassing the BI queue.' },
      { title: 'Financial Operations (FinOps)', description: 'Instantly build dashboards tracking Snowflake credit consumption and cost allocation across different departments.' }
    ],
    faqs: [
      { q: 'Does Arcli pull my raw data out of Snowflake?', a: 'No. The heavy aggregation compute is pushed down into your Snowflake warehouse. We only retrieve the highly compressed, final aggregated result sets (via Parquet) for in-browser visualization.' },
      { q: 'How do you handle massive enterprise schemas?', a: 'We utilize advanced semantic routing. Instead of cramming your entire schema into an LLM, we generate embeddings for your tables. When a question is asked, we perform a vector search to pull only the relevant table metadata, preventing token bloat.' }
    ],
    relatedSlugs: ['postgresql-ai-analytics', 'bigquery-ai-analytics', 'natural-language-to-sql']
  },

  'bigquery-ai-analytics': {
    type: 'integration',
    title: 'Google BigQuery AI Analytics & Dashboards | Arcli',
    description: 'Connect Arcli to Google BigQuery. Run AI-generated analytics on petabytes of data, easily unpack arrays, and build instant dashboards with zero data movement.',
    h1: 'Native AI Intelligence for Google BigQuery',
    subtitle: 'Harness the massive compute power of BigQuery with an intuitive conversational AI that natively understands how to UNNEST arrays and optimize partition scanning.',
    icon: <Server className="w-12 h-12 text-blue-600 mb-6" />,
    features: [
      'Native ARRAY and STRUCT Unnesting', 
      'GCP IAM Service Account Integration', 
      'Cost Control & Partition Guardrails',
      'Push-Down Columnar Compute'
    ],
    painPoints: {
      title: 'The Headache of BigQuery Data Structures',
      points: [
        'Google Analytics 4 (GA4) and Firebase exports to BigQuery use deeply nested RECORD and ARRAY structures that are incredibly difficult for standard analysts to UNNEST.',
        'Accidental queries that scan non-partitioned petabyte tables can result in surprise $1,000+ cloud bills instantly.',
        'Connecting BigQuery to Looker Studio results in horribly slow, cached dashboards.'
      ],
      solution: 'Arcli is purpose-built for BigQuery. Our AI is explicitly trained on BigQuery Standard SQL, seamlessly writing the UNNEST logic for complex structs. Furthermore, our query planner enforces partition filters to guarantee cost-control before execution.'
    },
    steps: [
      { name: '1. Authenticate with GCP', text: 'Connect securely using a scoped Google Cloud Service Account JSON key.' },
      { name: '2. Map Datasets', text: 'Select which BigQuery datasets and materialized views you want to expose to the AI engine.' },
      { name: '3. Query at Scale', text: 'Arcli writes the complex SQL and pushes the heavy lifting to Google\'s infrastructure.' }
    ],
    realExample: {
      query: "Analyze our GA4 BigQuery export. Show me the total number of 'purchase' events and total revenue, grouped by the device category.",
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
      insight: "Mobile devices drove 65% of total purchases, but Desktop users had a 40% higher Average Order Value (AOV)."
    },
    comparison: {
      competitor: 'Looker Studio (Native GCP Integration)',
      competitorFlaws: [
        'Notoriously slow rendering times, especially when joining massive datasets.',
        'Requires complex, manual data blending to achieve simple cross-table metrics.',
        'UI feels incredibly dated and lacks modern interactive charting capabilities.'
      ],
      arcliWins: [
        'Zero-latency charting. BigQuery crunches the data, Arcli renders it instantly via WebAssembly.',
        'AI completely automates the cross-table JOINs and data blending.',
        'Modern, high-performance Vega visualizations.'
      ]
    },
    useCases: [
      { title: 'GA4 / Firebase Analytics', description: 'Easily parse through complex, nested Google Analytics 4 event streams to extract precise conversion funnels without fighting the GA4 UI.' },
      { title: 'Massive Log Analysis', description: 'Search and aggregate across millions of server logs or telemetry data streams instantly using plain English parameters.' }
    ],
    faqs: [
      { q: 'Will this cause my GCP bill to spike with accidental full scans?', a: 'No. Arcli\'s semantic engine is heavily optimized for BigQuery cost-control. The AI is instructed to always utilize partition keys (like _TABLE_SUFFIX) and explicit column selection to absolutely minimize the bytes scanned per query.' },
      { q: 'Does Arcli store my BigQuery data?', a: 'No. We utilize a zero-data-movement architecture. Your data remains securely in Google Cloud. Arcli only orchestrates the SQL and retrieves the final, aggregated rows to render the visual charts.' }
    ],
    relatedSlugs: ['snowflake-ai-analytics', 'google-analytics-ai-dashboard', 'natural-language-to-sql']
  }
};