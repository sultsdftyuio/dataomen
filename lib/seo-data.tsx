import React from 'react';
import { Database, Sparkles, BarChart3, Workflow } from 'lucide-react';

export interface SEOPageData {
  h1: string;
  title: string;
  description: string;
  type: 'solution' | 'comparison' | 'feature' | 'industry';
  subtitle: string;
  icon: React.ReactNode;
  faqs: Array<{ q: string; a: string }>;
  steps: Array<{ name: string; text: string }>;
  comparison?: {
    competitor: string;
    competitorFlaws: string[];
    arcliWins: string[];
  };
  useCases: Array<{ title: string; description: string }>;
  features: string[];
  relatedSlugs: string[];
}

export const seoPages: Record<string, SEOPageData> = {
  'ai-data-analysis': {
    h1: 'AI Data Analysis Platform',
    title: 'Best AI Data Analysis Platform | Arcli',
    description: 'Automate your data analysis with Arcli. Transform raw data into actionable insights using AI-driven vectorized computation and natural language to SQL generation.',
    type: 'solution',
    subtitle: 'Turn complex datasets into instant insights without writing a single line of SQL or Python.',
    icon: <Sparkles className="w-12 h-12 text-blue-500" />,
    faqs: [
      { 
        q: 'What is AI data analysis?', 
        a: 'AI data analysis leverages machine learning models to automatically parse, query, and visualize large datasets without manual coding, using semantic routing to guarantee accurate schema mapping.' 
      },
      { 
        q: 'Is my data secure?', 
        a: 'Yes. Arcli ensures multi-tenant security with strict row-level policies and zero-retention ephemeral processing for sensitive analytical workloads.' 
      }
    ],
    steps: [
      { name: 'Connect Data', text: 'Link your database, warehouse, or upload Parquet/CSV files securely.' },
      { name: 'Ask Questions', text: 'Type your question in plain English, and our RAG engine handles the schema context.' },
      { name: 'Get Insights', text: 'Receive DuckDB-powered charts, SQL queries, and insights instantly.' }
    ],
    useCases: [
      { title: 'Automated Reporting', description: 'Generate weekly performance metrics on autopilot via vectorized operations.' },
      { title: 'Anomaly Detection', description: 'Spot revenue drops using linear algebra-based variance tracking.' }
    ],
    features: [
      'Natural Language to SQL',
      'Automated Vectorization',
      'Multi-tenant Security',
      'Instant In-Browser Analytics (DuckDB)'
    ],
    relatedSlugs: ['sql-generator']
  },
  'sql-generator': {
    h1: 'AI SQL Generator',
    title: 'Text to SQL Generator | Arcli',
    description: 'Generate complex, optimized SQL queries from plain English. Support for DuckDB, PostgreSQL, Snowflake, and more.',
    type: 'feature',
    subtitle: 'Stop wrestling with complex JOINs. Let AI write highly-optimized SQL in milliseconds.',
    icon: <Database className="w-12 h-12 text-blue-500" />,
    faqs: [
      { 
        q: 'Which SQL dialects are supported?', 
        a: 'We support standard SQL, PostgreSQL, Snowflake, DuckDB, and BigQuery, dynamically formatting the syntax based on your connection.' 
      }
    ],
    steps: [
      { name: 'Provide Schema', text: 'Arcli automatically vectorizes and maps your database schema.' },
      { name: 'Prompt', text: 'Ask complex analytical questions like "Show me a 7-day EMA of revenue".' },
      { name: 'Execute', text: 'Review and execute the generated, highly-performant SQL directly.' }
    ],
    comparison: {
      competitor: 'Manual SQL Writing',
      competitorFlaws: [
        'Highly time-consuming for nested aggregations', 
        'Prone to syntax and logic errors', 
        'Hard to maintain complex queries across dialects'
      ],
      arcliWins: [
        'Instant, sub-second generation', 
        'Deeply context-aware via schema RAG routing', 
        'Optimized for columnar performance natively'
      ]
    },
    useCases: [
      { title: 'Ad-hoc Analysis', description: 'Quickly answer business questions without bottlenecking the data engineering team.' },
      { title: 'Query Optimization', description: 'Refactor slow queries into performant, vectorized operations.' }
    ],
    features: [
      'Schema-aware Generation',
      'Multi-dialect Support',
      'Performance Optimization Hints'
    ],
    relatedSlugs: ['ai-data-analysis']
  }
};