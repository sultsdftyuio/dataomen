// lib/seo/text-to-sql-2.tsx
import React from 'react';
import { Cloud } from 'lucide-react';

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

export const textToSqlFeaturesPart2: Record<string, SEOPageData> = {
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