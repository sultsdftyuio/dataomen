// lib/seo/text-to-sql-1.tsx
import React from 'react';
import { Database, Server } from 'lucide-react';

/**
 * SemanticOrchestration Schema v2.0
 * Upgraded to the "Category Leader Blueprint" schema.
 * Designed for Engineering Leaders, Data Architects, and RevOps seeking
 * to understand the exact mechanics of how Arcli translates Natural Language
 * into deterministic, hallucination-free SQL across various dialects.
 * * Features enhanced scannability, direct competitor positioning, 
 * trust-building guardrails, and explicit proof points.
 * * For architecture reviews, contact: support@arcli.tech
 */
export interface SEOPageData {
  type: 'feature' | 'integration';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  extractionLifecycle: {
    phase1: { name: string; description: string };
    phase2: { name: string; description: string };
    phase3: { name: string; description: string };
  };
  domainSpecificCapabilities: {
    handlingQuirks: string[];
    aiAdvantage: string;
  };
  bypassingNativeLimits: {
    legacyLimitations: string[];
    arcliAcceleration: string[];
  };
  analyticalScenarios: {
    level: 'Basic' | 'Intermediate' | 'Advanced' | 'Strategic';
    title: string;
    description: string;
    exampleQuery: string;
    exampleSql: string;
    businessOutcome: string;
  }[];
  businessValueAndROI: {
    metric: string;
    impact: string;
    timeframe: string;
  }[];
  faqs: {
    persona: 'CEO' | 'Data Engineer' | 'CISO' | 'RevOps' | 'Product Manager';
    q: string;
    a: string;
  }[];
  relatedSlugs: string[];
  
  // --- Category Leader Upgrades ---
  comparisons?: {
    competitor: string;
    weakness: string;
    arcliAdvantage: string;
  }[];
  useCases?: {
    industry: string;
    title: string;
    description: string;
  }[];
  guardrails?: string[];
  uxFeatures?: {
    title: string;
    description: string;
  }[];
  proofPoints?: {
    metric: string;
    value: string;
    context: string;
  }[];
}

export const textToSqlFeaturesPart1: Record<string, SEOPageData> = {
  'natural-language-to-sql': {
    type: 'feature',
    title: 'Natural Language to SQL Generator | AI SQL Tool | Arcli Analytics',
    description: 'Convert plain English into highly optimized, hallucination-free SQL. Evaluate how Arcli utilizes a Schema-Grounded Generation Engine to bridge business intent and database logic.',
    h1: 'The Semantic Bridge: Convert English to SQL Instantly',
    subtitle: 'Transform conversational intent into production-grade SQL. Our deterministic orchestrator maps your exact schema metadata to ensure zero-hallucination query generation.',
    icon: <Database className="w-12 h-12 text-emerald-500 mb-6" />,
    features: [
      'Schema-Grounded Generation Engine', 
      'Deterministic SQL Compiler', 
      'Multi-Tenant Read-Only Execution',
      'WASM-Powered In-Browser Visualization',
      'Zero-Hallucination Guarantee'
    ],
    proofPoints: [
      {
        metric: 'Data Team Bandwidth',
        value: '80% Reduction',
        context: 'in ad-hoc SQL ticket volume within the first month.'
      },
      {
        metric: 'Query Generation',
        value: 'Sub-Second',
        context: 'compilation of complex joins and window functions.'
      },
      {
        metric: 'Accuracy',
        value: '100% Grounded',
        context: 'SQL forced against actual schema metadata, eliminating AI guessing.'
      }
    ],
    extractionLifecycle: {
      phase1: {
        name: 'Automated Metadata Indexing',
        description: 'Arcli securely scans database headers—never row-level data. We create a highly optimized semantic map of your tables, columns, and foreign keys.'
      },
      phase2: {
        name: 'Semantic Query Orchestrator',
        description: 'The router identifies only the 3-5 specific tables required for a query. This prevents token bloat and guarantees the LLM uses exact column names.'
      },
      phase3: {
        name: 'Dialect-Specific Compilation',
        description: 'The AI generates mathematically rigorous SQL tailored for your underlying engine (Postgres, Snowflake). Heavy aggregations are pushed down to where the data lives.'
      }
    },
    domainSpecificCapabilities: {
      handlingQuirks: [
        'Automatically infers complex JOIN logic from the indexed metadata graph.',
        'Generates advanced Window Functions and CTEs for cohort analytics.',
        'Seamlessly manages dialect-specific date truncation and data type casting.'
      ],
      aiAdvantage: 'By strictly bounding the LLM with your exact schema definitions via our Semantic Governance layer, Arcli fundamentally eliminates the "hallucination problem" that plagues generic AI SQL generators.'
    },
    bypassingNativeLimits: {
      legacyLimitations: [
        'Technical Translation Debt: Business users waiting weeks for analysts to translate English into SQL.',
        'Generic AI Tooling: Standard chatbots hallucinate incorrect column names and cannot query live databases.',
        'Heavy Semantic Layers: Traditional BI requires massive upfront LookML modeling before exploration.'
      ],
      arcliAcceleration: [
        'Zero-setup semantic layer enabling instant exploration directly against your read-replica.',
        'Eliminates the centralized request queue. Product and RevOps self-serve complex analytics.',
        'Mathematical consistency guaranteed by utilizing governed metric definitions during SQL generation.'
      ]
    },
    comparisons: [
      {
        competitor: 'ChatGPT for SQL',
        weakness: 'Hallucinates schema details, guesses relationships, and cannot execute against live databases securely.',
        arcliAdvantage: 'Schema-Grounded Generation Engine with read-only database execution and zero hallucination guarantee.'
      },
      {
        competitor: 'Tableau & Legacy BI',
        weakness: 'Requires massive upfront semantic modeling (like LookML) and rigid, pre-built dashboards.',
        arcliAdvantage: 'Ad-hoc, conversational querying with no heavy modeling required. Ask anything, instantly.'
      },
      {
        competitor: 'Self-Hosted LLMs',
        weakness: 'Requires dedicated MLOps engineers to maintain context windows, routing logic, and visualization UI.',
        arcliAdvantage: 'Turnkey SaaS orchestration with built-in visualization, caching, and multi-tenant security.'
      }
    ],
    useCases: [
      {
        industry: 'SaaS Metrics',
        title: 'Text to SQL for SaaS Analytics',
        description: 'Instantly calculate NRR, Churn Rate, and Active Users without writing complex date-interval logic or cohort matrices.'
      },
      {
        industry: 'E-Commerce',
        title: 'Text to SQL for E-Commerce',
        description: 'Analyze cart abandonment, LTV by acquisition channel, and inventory turnover using plain English.'
      },
      {
        industry: 'Product Management',
        title: 'Text to SQL for Product Analytics',
        description: 'Unnest JSON event payloads to track feature adoption funnels without waiting on data engineers for ETL pipelines.'
      }
    ],
    guardrails: [
      'Clarification Prompts: Ambiguous queries automatically trigger an interactive clarification flow instead of guessing.',
      'Destructive Execution Block: Regex validation and read-only enforcement strictly block UPDATE, DROP, and DELETE commands.',
      'Explainable Errors: Schema mismatches return human-readable explanations, guiding users to the correct terminology.'
    ],
    uxFeatures: [
      {
        title: 'Streaming Results',
        description: 'Watch your data visualize in real-time as the in-browser DuckDB engine processes the payload.'
      },
      {
        title: 'Explainable AI Logic',
        description: 'View the exact mapping between your English prompt and the generated SQL statement. Full transparency.'
      },
      {
        title: 'Live Editable SQL',
        description: 'Engineers can open the hood, tweak the generated code manually, and re-run for ultimate precision.'
      }
    ],
    analyticalScenarios: [
      {
        level: 'Basic',
        title: 'Time-Series Aggregation',
        description: 'Translate a simple business request for trend data into correct date-math SQL.',
        exampleQuery: "Show me our total revenue grouped by month for the last 12 months.",
        exampleSql: `SELECT 
  DATE_TRUNC('month', created_at) AS revenue_month,
  SUM(amount) AS total_revenue
FROM transactions
WHERE status = 'completed' 
  AND created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
GROUP BY 1
ORDER BY 1 ASC;`,
        businessOutcome: 'Instantly visualizes historical trends without requiring the user to understand DATE_TRUNC or interval logic.'
      },
      {
        level: 'Intermediate',
        title: 'Cross-Table Relational Mapping',
        description: 'The LLM automatically infers how to join disparate tables based on the Semantic Router context.',
        exampleQuery: "What is the average order value (AOV) broken down by the customer's acquisition channel?",
        exampleSql: `SELECT 
  u.utm_source AS acquisition_channel,
  AVG(o.total_price) AS average_order_value,
  COUNT(o.id) AS total_orders
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.status = 'paid'
GROUP BY 1
HAVING COUNT(o.id) > 10
ORDER BY 2 DESC;`,
        businessOutcome: 'Allows marketing to query transactional tables without needing to understand entity-relationship diagrams.'
      },
      {
        level: 'Advanced',
        title: 'Cohort Retention via CTEs',
        description: 'Generates multi-step logic to calculate complex retention matrices.',
        exampleQuery: "Show me the 3-month retention rate for users who signed up in Q1 2024.",
        exampleSql: `WITH Q1_Users AS (
  SELECT id AS user_id, created_at AS signup_date
  FROM users
  WHERE created_at >= '2024-01-01' AND created_at < '2024-04-01'
),
Active_Months AS (
  SELECT 
    q.user_id,
    DATE_PART('month', AGE(e.event_date, q.signup_date)) as month_index
  FROM user_events e
  JOIN Q1_Users q ON e.user_id = q.user_id
  WHERE e.event_type = 'login' 
    AND DATE_PART('month', AGE(e.event_date, q.signup_date)) <= 3
  GROUP BY 1, 2
)
SELECT 
  month_index,
  COUNT(DISTINCT user_id) * 100.0 / (SELECT COUNT(*) FROM Q1_Users) AS retention_rate
FROM Active_Months
GROUP BY 1
ORDER BY 1 ASC;`,
        businessOutcome: 'Executes highly advanced product analytics instantly, bypassing the need for dedicated data engineering bandwidth.'
      },
      {
        level: 'Strategic',
        title: 'Anomaly Detection via Window Functions',
        description: 'Utilize statistical variance to find outliers in business performance automatically.',
        exampleQuery: "Which sales regions experienced a drop in revenue greater than 20% compared to their 4-week rolling average?",
        exampleSql: `WITH Weekly_Revenue AS (
  SELECT 
    region,
    DATE_TRUNC('week', created_at) AS week,
    SUM(revenue) AS current_revenue
  FROM sales
  GROUP BY 1, 2
),
Rolling_Avg AS (
  SELECT 
    region,
    week,
    current_revenue,
    AVG(current_revenue) OVER (PARTITION BY region ORDER BY week ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING) AS four_week_avg
  FROM Weekly_Revenue
)
SELECT 
  region,
  current_revenue,
  four_week_avg,
  ROUND(((current_revenue - four_week_avg) / NULLIF(four_week_avg, 0)) * 100, 2) AS variance_pct
FROM Rolling_Avg
WHERE week = DATE_TRUNC('week', CURRENT_DATE)
  AND ((current_revenue - four_week_avg) / NULLIF(four_week_avg, 0)) < -0.20;`,
        businessOutcome: 'Proactively alerts executive leadership to localized revenue failures before they impact global forecasts.'
      }
    ],
    businessValueAndROI: [
      {
        metric: 'Analyst Bandwidth Saved',
        impact: 'Reduce ad-hoc SQL ticket requests by up to 80%, allowing data teams to focus on core pipeline architecture.',
        timeframe: 'First 30 Days'
      },
      {
        metric: 'Time-to-Insight',
        impact: 'Decrease the time it takes a business user to answer a new data question from 4 days to 4 seconds.',
        timeframe: 'Immediate (Day 1)'
      },
      {
        metric: 'Compute Efficiency',
        impact: 'By pushing logic down to the database and returning only aggregated Parquet results, cloud egress costs are minimized.',
        timeframe: 'Ongoing'
      }
    ],
    faqs: [
      {
        persona: 'Data Engineer',
        q: 'How does the Schema-Grounded Generation Engine prevent hallucinations?',
        a: 'Instead of passing your entire database schema (which causes token bloat), Arcli uses vector search to inject only the 3-5 relevant tables into the LLM context. We force it to use your exact columns.'
      },
      {
        persona: 'CISO',
        q: 'Does Arcli send our actual database row data to OpenAI or Anthropic?',
        a: 'No. The LLM only sees metadata (table names, data types). Execution happens locally against your read-replica. Your sensitive row-level data never leaves your environment.'
      },
      {
        persona: 'CEO',
        q: 'Can a non-technical user break our production database?',
        a: 'No. We enforce a Read-Only Guarantee. All connections utilize read-only credentials, and our orchestrator programmatically strips out any destructive commands before execution.'
      },
      {
        persona: 'Data Engineer',
        q: 'What happens if a user asks a highly ambiguous question?',
        a: 'Arcli is designed to fail gracefully. Our clarification guardrails will pause and ask the user to specify their intent, rather than guessing and returning an incorrect result.'
      },
      {
        persona: 'RevOps',
        q: 'Does it understand our specific business acronyms (like MRR or MQL)?',
        a: 'Yes. Through Semantic Metric Governance, you define what "MRR" means in SQL once. When a user asks about it, the LLM is forced to use your predefined logic block.'
      }
    ],
    relatedSlugs: ['postgresql-text-to-sql', 'snowflake-text-to-sql', 'ai-dashboard-builder']
  },

  'postgresql-text-to-sql': {
    type: 'integration',
    title: 'PostgreSQL AI Text to SQL Generator | Arcli Analytics',
    description: 'Generate optimized PostgreSQL queries from natural language. Evaluate how Arcli handles native JSONB extraction, recursive CTEs, and array parsing with semantic precision.',
    h1: 'Precision Text-to-SQL for PostgreSQL',
    subtitle: 'Bypass manual SQL authoring. Generate complex PostgreSQL queries, deep JSONB extractions, and multi-level aggregations using plain conversational English.',
    icon: <Server className="w-12 h-12 text-blue-600 mb-6" />,
    features: [
      'Native Postgres Syntax Formatting', 
      'Deep JSONB Field Extraction (->, ->>)', 
      'Automated Index Awareness',
      'DuckDB Result Export',
      'WASM-Powered Visualization'
    ],
    proofPoints: [
      {
        metric: 'JSONB Unnesting',
        value: 'Instant',
        context: 'AI automatically infers payload structures without requiring manual schema flattening.'
      },
      {
        metric: 'Data Engineering Bandwidth',
        value: 'Saved',
        context: 'Eliminate 100% of manual SQL requests related to parsing product telemetry logs.'
      }
    ],
    extractionLifecycle: {
      phase1: {
        name: 'The Secure Connection',
        description: 'Provide a secure, read-only connection string. Arcli maps the schema metadata instantly without initiating heavy data syncs.'
      },
      phase2: {
        name: 'Dialect-Specific RAG',
        description: 'The Semantic Router understands PostgreSQL types. It maps complex JSONB schemas, UUIDs, and ARRAY types directly into contextual memory.'
      },
      phase3: {
        name: 'Conversational Push-Down Compute',
        description: 'By compiling plain English into highly optimized Postgres SQL, heavy computational math is pushed to the database for lightning-fast execution.'
      }
    },
    domainSpecificCapabilities: {
      handlingQuirks: [
        'Natively authors the precise syntax required for unpacking nested JSONB objects and arrays (->, ->>, @>).',
        'Generates complex recursive CTEs (WITH RECURSIVE) for querying hierarchical or tree-structured data.',
        'Utilizes Postgres-specific date truncation (DATE_TRUNC) and explicit type casting (::timestamp, ::numeric).'
      ],
      aiAdvantage: 'The AI is specifically trained on the PostgreSQL 12+ dialect. It writes the exact, optimized query that a senior DBA would write, not generic SQL-92.'
    },
    bypassingNativeLimits: {
      legacyLimitations: [
        'Writing and debugging multi-layered JSONB extractions is notoriously difficult and error-prone.',
        'Exporting raw database tables to standard BI tools often breaks when encountering Postgres array types.',
        'Business users are blocked from querying production read-replicas without engineering intervention.'
      ],
      arcliAcceleration: [
        'Instantly converts "Show me users with dark-mode enabled" into perfect JSONB query logic.',
        'Sub-second turnaround for exploring complex schema structures, bypassing rigid drag-and-drop BI limitations.',
        'Enables Zero-Code access to unstructured database payloads for live telemetry querying.'
      ]
    },
    comparisons: [
      {
        competitor: 'Generic SQL Generators',
        weakness: 'Fails on PostgreSQL specific types like JSONB, PostGIS, and UUIDs, causing syntax errors.',
        arcliAdvantage: 'Dialect-aware compilation ensures queries run flawlessly on your specific Postgres version.'
      },
      {
        competitor: 'Metabase / Looker',
        weakness: 'Requires data engineers to build flattened views before JSONB data can be explored in the UI.',
        arcliAdvantage: 'Explore nested JSONB arrays conversationally on day one, zero ETL pipelines required.'
      }
    ],
    useCases: [
      {
        industry: 'Application Telemetry',
        title: 'Querying JSONB Logs',
        description: 'Product Managers can instantly filter and group by properties buried deep inside unstructured event_payload columns.'
      },
      {
        industry: 'Logistics & Ops',
        title: 'PostGIS Spatial Analytics',
        description: 'Use natural language to trigger complex ST_Distance and ST_DWithin geospatial bounding queries.'
      }
    ],
    guardrails: [
      'Strict Type Casting: Automatically casts strings to ::uuid or ::numeric to prevent Postgres execution failures.',
      'Partition Pruning Enforcement: Automatically includes indexed timestamp boundaries to prevent accidental full-table scans.'
    ],
    uxFeatures: [
      {
        title: 'Data Type Transparency',
        description: 'Hover over results to see the exact Postgres data type (varchar, int8, timestampz) returned.'
      },
      {
        title: 'One-Click Parquet Export',
        description: 'Export complex array or JSON result sets natively into columnar Parquet files for downstream analysis.'
      }
    ],
    analyticalScenarios: [
      {
        level: 'Basic',
        title: 'JSONB Payload Extraction',
        description: 'Easily extract and aggregate values buried deep within unstructured JSONB columns.',
        exampleQuery: "Calculate the cart abandonment rate by extracting the status from the event_payload JSONB column.",
        exampleSql: `WITH cart_events AS (
  SELECT 
    user_id,
    event_payload->>'status' AS cart_status
  FROM user_events
  WHERE event_type = 'checkout' 
    AND created_at >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT 
  COUNT(CASE WHEN cart_status = 'abandoned' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS abandonment_rate_pct
FROM cart_events;`,
        businessOutcome: 'Unlocks insights hidden in unstructured telemetry without building fragile, scheduled JSON-flattening pipelines.'
      },
      {
        level: 'Intermediate',
        title: 'Array Intersection Filtering',
        description: 'Query users based on whether their array of tags contains specific values.',
        exampleQuery: "Show me total revenue from users who have the 'enterprise' and 'priority_support' tags in their features array.",
        exampleSql: `SELECT 
  COUNT(u.id) AS total_enterprise_users,
  SUM(p.amount) AS total_revenue
FROM users u
JOIN payments p ON u.id = p.user_id
WHERE u.feature_tags @> ARRAY['enterprise', 'priority_support']::varchar[]
  AND p.status = 'successful';`,
        businessOutcome: 'Allows Customer Success teams to instantly segment high-value users based on complex array configurations.'
      },
      {
        level: 'Advanced',
        title: 'Recursive Hierarchical Queries',
        description: 'Navigate complex parent-child relationships (like management chains or nested comments).',
        exampleQuery: "Show me the total number of employees reporting up to the VP of Sales, including all nested direct reports.",
        exampleSql: `WITH RECURSIVE employee_hierarchy AS (
  -- Base case: Find the VP of Sales
  SELECT id, name, manager_id, 1 AS level
  FROM employees
  WHERE title = 'VP of Sales'
  
  UNION ALL
  
  -- Recursive step: Find employees reporting to anyone in the hierarchy
  SELECT e.id, e.name, e.manager_id, eh.level + 1
  FROM employees e
  INNER JOIN employee_hierarchy eh ON e.manager_id = eh.id
)
SELECT 
  COUNT(*) - 1 AS total_subordinates
FROM employee_hierarchy;`,
        businessOutcome: 'Resolves complex organizational or product hierarchy questions instantly, a task nearly impossible in spreadsheets.'
      },
      {
        level: 'Strategic',
        title: 'Geospatial Distance Calculation (PostGIS)',
        description: 'If utilizing PostGIS, execute complex geographical bounding queries via natural language.',
        exampleQuery: "Find all active delivery drivers within a 5-kilometer radius of our main warehouse in Chicago.",
        exampleSql: `SELECT 
  d.driver_name,
  d.status,
  ST_Distance(
    d.current_location::geography, 
    ST_MakePoint(-87.6298, 41.8781)::geography
  ) / 1000 AS distance_km
FROM drivers d
WHERE d.status = 'active'
  AND ST_DWithin(
    d.current_location::geography, 
    ST_MakePoint(-87.6298, 41.8781)::geography, 
    5000
  )
ORDER BY distance_km ASC;`,
        businessOutcome: 'Enables hyper-local operational intelligence without requiring the ops team to learn PostGIS spatial functions.'
      }
    ],
    businessValueAndROI: [
      {
        metric: 'ETL Pipeline Reduction',
        impact: 'Eliminate the need to build scheduled dbt models just to unnest JSON for basic product analytics.',
        timeframe: 'Immediate (Day 1)'
      },
      {
        metric: 'Query Performance',
        impact: 'Heavy aggregations execute natively on your Postgres engine rather than crashing client-side BI tools.',
        timeframe: 'Ongoing'
      },
      {
        metric: 'Product Analytics Agility',
        impact: 'Reduce the time required to analyze a new JSON event payload from days to seconds.',
        timeframe: 'First 30 Days'
      }
    ],
    faqs: [
      {
        persona: 'Data Engineer',
        q: 'Does Arcli support native Postgres JSONB operators?',
        a: 'Yes. Our semantic engine uses dialect-specific RAG to output the correct Postgres operators (->, ->>, @>) based on detected jsonb metadata.'
      },
      {
        persona: 'CISO',
        q: 'How do you ensure Arcli doesn\'t execute destructive commands on our database?',
        a: 'Connections must use read-only users. Furthermore, our Orchestrator runs regex validations on all generated SQL to reject INSERT, UPDATE, DELETE, DROP, or ALTER statements.'
      },
      {
        persona: 'Data Engineer',
        q: 'How do you handle massive Postgres tables with hundreds of millions of rows?',
        a: 'Arcli utilizes a "Push-Down Compute" architecture. The heavy GROUP BY happens on your Postgres replica. We only retrieve the aggregated result set (e.g., 50 rows) over the wire.'
      },
      {
        persona: 'Product Manager',
        q: 'Can I use this to track exactly how users are clicking through a new feature?',
        a: 'Absolutely. If your application logs unstructured JSONB events to Postgres, just ask: "Show me the funnel from clicking \'New Project\' to \'Save\' for yesterday."'
      },
      {
        persona: 'Data Engineer',
        q: 'Does Arcli understand our partitioned tables?',
        a: 'Yes. During metadata ingestion, the Semantic Router maps partitions. The generated SQL includes necessary date filters (created_at >=) to ensure Postgres prunes partitions efficiently.'
      }
    ],
    relatedSlugs: ['natural-language-to-sql', 'snowflake-text-to-sql', 'data-blending-guide']
  }
};