// lib/seo/text-to-sql.tsx
import React from 'react';
import { Database, Zap, Server, Cloud } from 'lucide-react';

/**
 * SEOPageData Interface
 * Standardized for the Arcli high-performance analytical stack.
 * Upgraded to a "Search-Intent Machine" schema with real-world code examples,
 * pain-point targeting, and deep technical FAQs.
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

export const textToSqlFeatures: Record<string, SEOPageData> = {
  // Broad / Mid-Tail Niche
  'natural-language-to-sql': {
    type: 'feature',
    title: 'Natural Language to SQL Generator | Arcli Analytics',
    description: 'Transform plain English into highly optimized, vectorized SQL queries. Arcli uses Context-Aware RAG to chat securely with your database without moving your data.',
    h1: 'Chat With Your Database Using Natural Language',
    subtitle: 'Type what you want to know in plain English. Our semantic engine writes the SQL, executes it via secure read-only connections, and visualizes the results instantly using in-browser DuckDB.',
    icon: <Database className="w-12 h-12 text-emerald-500 mb-6" />,
    features: [
      'Context-Aware Schema RAG (Zero Token Bloat)', 
      'Multi-Dialect Vectorized Support (Postgres, Snowflake, BigQuery)', 
      'Strict Multi-Tenant Read-Only Execution',
      'In-Browser Visualization via WebAssembly DuckDB'
    ],
    steps: [
      { name: '1. Index Schema Metadata', text: 'Arcli securely scans your database metadata fragments without touching underlying row-level data.' },
      { name: '2. Semantic Routing', text: 'Our intelligent routing engine injects only relevant schema context into the LLM prompt, preventing hallucinations.' },
      { name: '3. Dialect-Specific Generation', text: 'The AI generates precisely formatted SQL for your specific database dialect.' },
      { name: '4. Secure Execution & Charting', text: 'Results are returned as optimized Parquet files and instantly visualized.' }
    ],
    realExample: {
      query: "Show me monthly revenue growth for the last 12 months, split by subscription tier.",
      sql: `SELECT 
  date_trunc('month', created_at) AS month,
  tier,
  SUM(revenue) AS total_revenue
FROM subscriptions
WHERE created_at >= NOW() - INTERVAL '12 months'
GROUP BY 1, 2
ORDER BY 1 DESC;`,
      output: "Interactive React-Vega Time-Series Bar Chart",
      insight: "Enterprise tier revenue grew 18% MoM, outpacing Pro tier."
    },
    comparison: {
      competitor: 'Traditional BI Tools (Tableau, Looker)',
      competitorFlaws: [
        'Requires weeks of data modeling and ETL pipeline setup.',
        'Forces users to learn complex proprietary semantic layers (e.g., LookML).',
        'High latency for ad-hoc exploration.'
      ],
      arcliWins: [
        'Zero setup: Connect a read-only URL and ask questions instantly.',
        'No modeling required; RAG natively understands your existing schema.',
        'Instantaneous slicing via in-memory browser compute.'
      ]
    },
    useCases: [
      { title: 'Self-Serve Product Analytics', description: 'Empower Product Managers to query live application data, bypassing the BI queue.' },
      { title: 'Dynamic Client Reporting', description: 'Generate custom, ad-hoc reports for clients on the fly.' }
    ],
    faqs: [
      { q: 'Is it safe to connect production databases?', a: 'Yes. We strictly enforce read-only analytical connections. Our execution engine wraps all operations in transaction blocks that drop any query attempting to use INSERT, UPDATE, DELETE, or DROP commands.' },
      { q: 'How do you handle large datasets?', a: 'We process the heavy lifting at the database layer (vectorized aggregation), stream the compressed results via Parquet, and render them using WebAssembly-powered DuckDB in the browser, easily handling millions of returned rows without crashing your tab.' },
      { q: 'Does it support joins automatically?', a: 'Yes. Our semantic RAG engine indexes foreign keys and infers relationships based on column naming conventions, allowing the AI to construct flawless multi-table JOINs natively.' }
    ],
    relatedSlugs: ['postgresql-text-to-sql', 'snowflake-text-to-sql', 'ai-dashboard-builder']
  },

  // Hyper-Niche: Postgres Focus (High technical search intent)
  'postgresql-text-to-sql': {
    type: 'integration',
    title: 'PostgreSQL Text to SQL AI Generator | Arcli',
    description: 'Connect your Postgres database to Arcli. Convert natural language to optimized PostgreSQL queries instantly using AI and RAG schema awareness.',
    h1: 'AI-Powered Text to SQL for PostgreSQL',
    subtitle: 'Generate complex PostgreSQL queries, recursive CTEs, and JSONB extractions instantly just by typing your analytical questions in plain English.',
    icon: <Server className="w-12 h-12 text-blue-600 mb-6" />,
    features: [
      'Native Postgres Syntax & Dialect Formatting', 
      'Deep JSONB Field Extraction Support (->, ->>)', 
      'Automated Index Awareness',
      'Direct-to-DuckDB Zero-Latency Export'
    ],
    painPoints: {
      title: 'Why PostgreSQL Analytics is Hard',
      points: [
        'Writing and maintaining complex multi-table JOINs and recursive CTEs.',
        'Wrestling with exact syntax to unpack nested JSONB arrays and payloads.',
        'Query optimization on massive transactional datasets.',
        'Slow dashboard rendering times requiring heavy caching layers.'
      ],
      solution: 'Arcli bypasses these bottlenecks. We compile English directly into highly-optimized Postgres syntax, offload the execution to read-replicas, and stream the output to a local DuckDB instance for zero-latency charting.'
    },
    steps: [
      { name: 'Connect Postgres URL', text: 'Provide a read-only Postgres connection string. We map the schema instantly.' },
      { name: 'Ask Complex Questions', text: 'e.g., "Show me top users by JSONB event metrics..."' },
      { name: 'Execute and Analyze', text: 'Results are streamed directly into an in-browser DuckDB instance.' }
    ],
    realExample: {
      query: "Calculate the cart abandonment rate for the last 30 days by extracting the status from the event_payload JSONB column.",
      sql: `WITH cart_events AS (
  SELECT 
    user_id,
    event_payload->>'status' AS cart_status
  FROM user_events
  WHERE event_type = 'checkout' 
  AND created_at >= CURRENT_DATE - 30
)
SELECT 
  COUNT(CASE WHEN cart_status = 'abandoned' THEN 1 END) * 100.0 / COUNT(*) AS abandonment_rate
FROM cart_events;`,
      output: "Gauge Chart Indicator",
      insight: "Cart abandonment rate is currently 64.2%."
    },
    comparison: {
      competitor: 'Generic LLMs (ChatGPT/Claude)',
      competitorFlaws: [
        'Hallucinates non-existent Postgres table and column names.', 
        'Struggles heavily with correct JSONB extraction syntax.', 
        'Requires manual copy-pasting into DataGrip or pgAdmin.'
      ],
      arcliWins: [
        '100% Schema accuracy guaranteed via semantic routing RAG.', 
        'Flawless native JSONB, CTE, and Window Function generation.', 
        'Executes queries securely and charts results in one unified UI.'
      ]
    },
    useCases: [
      { title: 'SaaS App Analytics', description: 'Query your production Postgres read-replica directly to understand user behavior.' }
    ],
    faqs: [
      { q: 'Does Arcli support PostgreSQL JSONB queries?', a: 'Yes. Our Text-to-SQL engine is heavily optimized to unpack and query Postgres JSONB arrays and objects efficiently, utilizing the correct operators (->, ->>, @>) based on your schema.' },
      { q: 'Is it safe to connect production databases?', a: 'We highly recommend connecting Arcli to a read-replica, but our strict execution environment wraps everything in read-only transactions, ensuring absolute data safety.' },
      { q: 'How do you handle large datasets?', a: 'We utilize Postgres\'s native aggregation capabilities to crunch the numbers server-side, returning only the vectorized analytical results to the client.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'snowflake-text-to-sql']
  },

  // Hyper-Niche: Snowflake Focus (Enterprise search intent)
  'snowflake-text-to-sql': {
    type: 'integration',
    title: 'Snowflake Text to SQL & AI Analytics | Arcli',
    description: 'Transform your Snowflake data warehouse with AI. Generate highly efficient Snowflake SQL from English and build automated analytical dashboards.',
    h1: 'Natural Language AI for Snowflake Data Clouds',
    subtitle: 'Stop wasting warehouse compute credits on poorly optimized analytical queries. Arcli generates cost-efficient, highly-performant Snowflake SQL automatically.',
    icon: <Cloud className="w-12 h-12 text-sky-400 mb-6" />,
    features: [
      'Warehouse Compute & Cost Optimization', 
      'Columnar RAG Indexing for Massive Schemas', 
      'Native Snowflake Role-Based Access Control (RBAC)',
      'Time Travel Query Support'
    ],
    painPoints: {
      title: 'Why Snowflake Analytics is Expensive & Slow',
      points: [
        'Non-technical users writing unoptimized queries that consume massive warehouse credits.',
        'Data teams bottlenecked by constant ad-hoc BI requests from executives.',
        'Struggling to navigate schemas with thousands of tables across multiple databases.'
      ],
      solution: 'Arcli acts as an AI optimizer and orchestrator. It uses RAG to find the exact tables needed, writes highly explicit, cost-saving SQL (no SELECT *), and executes via scoped roles.'
    },
    steps: [
      { name: 'Secure Warehouse Linking', text: 'Securely authenticate Arcli using a scoped, read-only Snowflake role.' },
      { name: 'Mass Schema RAG Indexing', text: 'We index your massive warehouse schemas without moving your underlying petabyte-scale data.' },
      { name: 'Cost-Aware SQL Generation', text: 'The AI generates dialect-compliant Snowflake SQL, utilizing cost-saving techniques.' }
    ],
    realExample: {
      query: "What was the total compute cost for the 'MARKETING_WH' warehouse last week, grouped by day?",
      sql: `SELECT 
  DATE_TRUNC('DAY', START_TIME) AS usage_day,
  SUM(CREDITS_USED) AS total_credits
FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
WHERE WAREHOUSE_NAME = 'MARKETING_WH'
  AND START_TIME >= DATEADD(WEEK, -1, CURRENT_DATE())
GROUP BY 1
ORDER BY 1 ASC;`,
      output: "Line Chart View",
      insight: "Compute spiked by 300% on Thursday due to scheduled dbt runs."
    },
    comparison: {
      competitor: 'Standard SQL Editors',
      competitorFlaws: [
        'Requires deep knowledge of Snowflake specific functions (e.g., DATEADD, FLATTEN).',
        'No guardrails against expensive, unoptimized queries.',
        'Disconnected from visualization tools.'
      ],
      arcliWins: [
        'Generates highly explicit, cost-optimized SQL automatically.',
        'Connects Natural Language directly to visual outputs.',
        'Semantic routing handles the schema complexity for the user.'
      ]
    },
    useCases: [
      { title: 'Executive Data Democratization', description: 'Allow C-suite executives to query the entire Snowflake data lake securely via chat.' }
    ],
    faqs: [
      { q: 'How do you handle massive Snowflake schemas with thousands of tables?', a: 'We utilize advanced semantic routing. We generate embeddings for your tables, performing a vector search to pull only the metadata of the 3-5 relevant tables into the LLM context window.' },
      { q: 'Will this increase my Snowflake compute costs?', a: 'No, it optimizes them. Our engine writes explicit queries to avoid scanning unnecessary columns. By bringing results into browser-level DuckDB, subsequent slicing requires ZERO additional Snowflake compute credits.' },
      { q: 'Does it support joins automatically?', a: 'Yes. It maps your enterprise schema relationships to automatically join fact and dimension tables appropriately based on user intent.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'postgresql-text-to-sql']
  }
};