// lib/seo/text-to-sql.tsx
import React from 'react';
import { Database, Zap, Server, Cloud } from 'lucide-react';

/**
 * SemanticOrchestration Schema
 * Specifically engineered for Text-to-SQL intent.
 * Focuses on the "Orchestration" layer—the bridge between Natural Language 
 * and high-performance, dialect-specific SQL execution.
 */
export type SEOPageData = {
  type: 'feature' | 'integration';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  nlpOrchestration: {
    intentParsing: string;
    contextAwareRAG: string;
    securityPerimeter: string;
  };
  dialectPrecision: {
    specializedOperators: string[];
    optimizationStrategy: string;
  };
  interfaceFriction: {
    traditionalBottleneck: string;
    theArcliSolution: string;
    architecturalImpact: string[];
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

export const textToSqlFeatures: Record<string, SEOPageData> = {
  'natural-language-to-sql': {
    type: 'feature',
    title: 'Natural Language to SQL Generator | Arcli Analytics',
    description: 'Convert plain English into highly optimized, vectorized SQL. Evaluate how Arcli utilizes Context-Aware RAG to bridge the gap between business intent and database logic.',
    h1: 'The Semantic Bridge: Natural Language to SQL',
    subtitle: 'Transform conversational intent into production-grade SQL. Our orchestration engine maps schema metadata fragments to ensure zero-hallucination query generation.',
    icon: <Database className="w-12 h-12 text-emerald-500 mb-6" />,
    features: [
      'Context-Aware Schema RAG', 
      'Multi-Dialect Vectorized Support', 
      'Multi-Tenant Read-Only Execution',
      'WASM-Powered In-Browser Visualization'
    ],
    nlpOrchestration: {
      intentParsing: 'Utilizes high-dimensional semantic routing to deconstruct complex business questions into logical query components.',
      contextAwareRAG: 'Injects relevant schema fragments (tables, columns, types) dynamically, preventing LLM token bloat and maintaining strict privacy.',
      securityPerimeter: 'All generated SQL is passed through a validation layer and executed within a strictly read-only transactional block.'
    },
    dialectPrecision: {
      specializedOperators: [
        'Automatic CTE (Common Table Expression) construction',
        'Complex Window Function generation for time-series analysis',
        'Cross-table relational mapping via foreign-key inference'
      ],
      optimizationStrategy: 'Prioritizes push-down compute, ensuring heavy aggregations are performed by the database engine while rendering is handled by local DuckDB.'
    },
    interfaceFriction: {
      traditionalBottleneck: 'The "Technical Translation Debt": Business users waiting days for analysts to translate English questions into SQL code.',
      theArcliSolution: 'A zero-setup semantic layer that enables instant, conversational data exploration directly against the read-replica.',
      architecturalImpact: [
        'Eliminates the centralized data request queue.',
        'Ensures mathematical consistency across different business departments.',
        'Reduces computational waste by generating highly targeted, non-expansive SQL.'
      ]
    },
    steps: [
      { name: '1. Metadata Indexing', text: 'Securely scan database headers to create a semantic map without touching row-level data.' },
      { name: '2. Semantic Routing', text: 'The orchestrator identifies the 3-5 tables required for your specific question.' },
      { name: '3. Dialect Formatting', text: 'The AI generates precise SQL tailored for Postgres, Snowflake, or BigQuery.' }
    ],
    realExample: {
      query: "Show me monthly revenue growth for the last 12 months, split by subscription tier.",
      sql: `SELECT 
  DATE_TRUNC('month', created_at) AS month,
  tier,
  SUM(revenue) AS total_revenue
FROM subscriptions
WHERE created_at >= NOW() - INTERVAL '12 months'
GROUP BY 1, 2
ORDER BY 1 DESC;`,
      output: "Interactive Time-Series Chart",
      insight: "Revenue growth trends visualized instantly via automated window-function generation."
    },
    useCases: [
      { title: 'Self-Serve Product Analytics', description: 'Enable product leads to query application telemetry without utilizing engineering resources.' },
      { title: 'Ad-Hoc Strategic Reporting', description: 'Generate custom board-level metrics in real-time during strategic meetings.' }
    ],
    faqs: [
      { q: 'How do you prevent SQL hallucinations?', a: 'By utilizing Context-Aware RAG. We do not ask the LLM to guess your schema; we provide it with exact, metadata-verified table and column fragments before generation.' },
      { q: 'Is it safe for production environments?', a: 'Yes. We enforce read-only connections and utilize transaction-level guardrails that reject any non-SELECT commands at the application layer.' }
    ],
    relatedSlugs: ['postgresql-text-to-sql', 'snowflake-text-to-sql', 'ai-dashboard-builder']
  },

  'postgresql-text-to-sql': {
    type: 'integration',
    title: 'PostgreSQL Text to SQL AI Generator | Arcli',
    description: 'Generate optimized PostgreSQL queries from natural language. Evaluate how Arcli handles native JSONB extraction and recursive CTEs with semantic precision.',
    h1: 'Precision Text-to-SQL for PostgreSQL',
    subtitle: 'Bypass manual SQL authoring. Generate complex PostgreSQL queries, deep JSONB extractions, and recursive CTEs using conversational English.',
    icon: <Server className="w-12 h-12 text-blue-600 mb-6" />,
    features: [
      'Native Postgres Syntax Formatting', 
      'Deep JSONB Field Extraction (->, ->>)', 
      'Automated Index Awareness',
      'DuckDB Result Export'
    ],
    nlpOrchestration: {
      intentParsing: 'Deconstructs natural language into Postgres-specific analytical patterns.',
      contextAwareRAG: 'Focuses on Postgres-specific types, including JSONB schemas and partitioned table metadata.',
      securityPerimeter: 'Strictly read-only execution with mandatory IP whitelisting for all Postgres read-replicas.'
    },
    dialectPrecision: {
      specializedOperators: [
        'Unpacking nested JSONB objects and arrays',
        'Generating recursive CTEs for hierarchical data',
        'Utilizing Postgres-specific date truncation and interval logic'
      ],
      optimizationStrategy: 'Leverages Postgres’s native aggregation engine for high-performance result set generation.'
    },
    interfaceFriction: {
      traditionalBottleneck: 'The complexity of writing and debugging multi-layered JSONB and relational queries in Standard SQL.',
      theArcliSolution: 'Direct-to-Postgres orchestration that understands the nuances of the 12+ dialect, including custom JSONB operators.',
      architecturalImpact: [
        'Sub-second turnaround for complex schema exploration.',
        'Reduced load on production databases through optimized query planning.',
        'Zero-code access to unstructured database payloads.'
      ]
    },
    steps: [
      { name: '1. Connect Replica', text: 'Provide a secure, read-only connection string to your Postgres instance.' },
      { name: '2. Converse with Data', text: 'Request logic (e.g., "Analyze cart status from the JSON payload").' },
      { name: '3. Stream Results', text: 'Results are streamed to the browser-level DuckDB engine for instant charting.' }
    ],
    realExample: {
      query: "Calculate the cart abandonment rate by extracting the status from the event_payload JSONB column.",
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
      insight: "Unstructured JSONB payloads analyzed natively without manual flattening or ETL."
    },
    useCases: [
      { title: 'SaaS Production Monitoring', description: 'Analyze live feature usage and transactional health directly from your database replica.' }
    ],
    faqs: [
      { q: 'Does Arcli support native Postgres JSONB operators?', a: 'Yes. Our engine is specifically trained to utilize the correct Postgres operators (->, ->>, @>) based on your column metadata.' },
      { q: 'How do you handle massive datasets?', a: 'We push the heavy math to the Postgres engine and only stream the final aggregated results (via Parquet) to the client for visualization.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'snowflake-text-to-sql']
  },

  'snowflake-text-to-sql': {
    type: 'integration',
    title: 'Snowflake Text to SQL & AI Analytics | Arcli',
    description: 'Optimize your Snowflake data cloud with generative AI. Evaluate how Arcli generates cost-efficient, performant Snowflake SQL from conversational intent.',
    h1: 'Cost-Aware Text-to-SQL for Snowflake',
    subtitle: 'Minimize Snowflake compute credits. Transform natural language into highly explicit, cost-optimized SQL queries using enterprise-grade RAG.',
    icon: <Cloud className="w-12 h-12 text-sky-400 mb-6" />,
    features: [
      'Warehouse Cost Optimization', 
      'Massive Schema Vectorized RAG', 
      'Native Snowflake RBAC Integration',
      'Time Travel Query Support'
    ],
    nlpOrchestration: {
      intentParsing: 'Maps conversational requests to the specific analytical functions of the Snowflake Data Cloud.',
      contextAwareRAG: 'Utilizes high-dimensional embeddings to navigate enterprise schemas containing thousands of tables across multiple databases.',
      securityPerimeter: 'Inherits native Snowflake Role-Based Access Control (RBAC) and scoped warehouse permissions.'
    },
    dialectPrecision: {
      specializedOperators: [
        'Native Snowflake Date functions (DATEADD, DATEDIFF)',
        'Efficient FLATTEN logic for Snowflake semi-structured data',
        'Cost-aware column selection to minimize credit consumption'
      ],
      optimizationStrategy: 'Aggressively avoids non-targeted queries (SELECT *), generating explicit, warehouse-friendly SQL orchestration.'
    },
    interfaceFriction: {
      traditionalBottleneck: 'The high cost of "Technical Debt" queries: Business users writing unoptimized SQL that burns through Snowflake credits.',
      theArcliSolution: 'An AI-orchestrator that authors precise, cost-efficient queries while providing a conversational layer for non-technical leaders.',
      architecturalImpact: [
        'Significant reduction in Snowflake warehouse credit consumption.',
        'Unified semantic governance across petabyte-scale data lakes.',
        'Immediate visual feedback without additional data movement.'
      ]
    },
    steps: [
      { name: '1. Scoped Integration', text: 'Authenticate Arcli using a read-only, warehouse-scoped Snowflake role.' },
      { name: '2. Semantic Indexing', text: 'Arcli indexes your warehouse metadata without moving any underlying row-level data.' },
      { name: '3. Cost-Aware Querying', text: 'Generate dialect-perfect Snowflake SQL designed for maximum compute efficiency.' }
    ],
    realExample: {
      query: "What was the compute cost for the 'MARKETING_WH' warehouse last week, grouped by day?",
      sql: `SELECT 
  DATE_TRUNC('DAY', START_TIME) AS usage_day,
  SUM(CREDITS_USED) AS total_credits
FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
WHERE WAREHOUSE_NAME = 'MARKETING_WH'
  AND START_TIME >= DATEADD(WEEK, -1, CURRENT_DATE())
GROUP BY 1
ORDER BY 1 ASC;`,
      output: "Warehouse Metering Chart",
      insight: "Compute trends identified natively using Snowflake’s account usage metadata."
    },
    useCases: [
      { title: 'Executive Data Democratization', description: 'Empower enterprise leadership to query the Snowflake data lake securely via natural language chat.' }
    ],
    faqs: [
      { q: 'How does Arcli handle schemas with 1,000+ tables?', a: 'We use Vector Routing. We store embeddings of your table metadata; when you ask a question, we perform a vector search to inject only the relevant table context into the LLM prompt.' },
      { q: 'Will this help reduce my Snowflake bill?', a: 'Yes. By generating highly explicit SQL that only scans necessary columns and utilizes partition filters, Arcli minimizes the I/O and compute credits required for each query.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'postgresql-text-to-sql']
  }
};