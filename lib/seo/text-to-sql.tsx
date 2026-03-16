// lib/seo/text-to-sql.tsx
import React from 'react';
import { Database, Zap, Server, Cloud } from 'lucide-react';

/**
 * SEOPageData Interface
 * Standardized for the Arcli high-performance analytical stack.
 * Prioritizes semantic routing and multi-tenant security descriptions.
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
    title: 'Natural Language to SQL Generator | Arcli',
    description: 'Use our Text-to-SQL AI to chat with your database in plain English. Arcli generates optimized, vectorized SQL queries instantly.',
    h1: 'Chat With Your Database Using Natural Language',
    subtitle: 'Type what you want to know in plain English. We write the SQL, execute it via secure read-only connections, and visualize the results.',
    icon: <Database className="w-12 h-12 text-emerald-500 mb-6" />,
    features: ['Context-Aware Schema RAG', 'Multi-Dialect Vectorized Support', 'Secure Read-Only Execution'],
    steps: [
      { name: 'Index Schema', text: 'Arcli securely scans your database metadata fragments without touching row-level data to build a semantic map.' },
      { name: 'Semantic Routing', text: 'When you ask a question, our RAG engine injects only relevant schema context into the prompt, preventing token bloat.' },
      { name: 'SQL Execution', text: 'The AI generates dialect-specific SQL (Postgres, Snowflake, DuckDB) and runs it via tenant-isolated credentials.' }
    ],
    useCases: [
      { title: 'Self-Serve Analytics', description: 'Empower non-technical leads to query live data without bottlenecking the data engineering team.' }
    ],
    faqs: [
      { q: 'Will the AI accidentally delete my data?', a: 'No. Arcli strictly enforces read-only analytical connections. Our security-by-design architecture prevents any DROP or DELETE operations.' },
      { q: 'Can it handle complex JOINs?', a: 'Yes. By utilizing semantic RAG on your schema, the AI understands primary and foreign key relationships to generate flawless multi-table JOINs.' }
    ],
    relatedSlugs: ['postgresql-text-to-sql', 'snowflake-ai-analytics', 'chat-with-database']
  },

  // Hyper-Niche: Postgres Focus (High technical search intent)
  'postgresql-text-to-sql': {
    type: 'integration',
    title: 'PostgreSQL Text to SQL AI Generator | Arcli',
    description: 'Connect your Postgres database to Arcli. Convert natural language to optimized PostgreSQL queries instantly using AI and RAG schema awareness.',
    h1: 'AI-Powered Text to SQL for PostgreSQL',
    subtitle: 'Generate complex PostgreSQL queries, CTEs, and window functions instantly just by typing your analytical questions in plain English.',
    icon: <Server className="w-12 h-12 text-blue-600 mb-6" />,
    features: ['Postgres-Specific Syntax', 'JSONB Field Support', 'Automated Index Awareness'],
    steps: [
      { name: 'Connect Postgres URL', text: 'Provide a read-only Postgres connection string. We map the schema instantly.' },
      { name: 'Ask Complex Questions', text: 'e.g., "Show me top users by JSONB event metrics over the last 30 days."' },
      { name: 'Export to DuckDB', text: 'Queries are executed and results are loaded into an in-browser DuckDB instance for zero-latency charting.' }
    ],
    comparison: {
      competitor: 'Generic LLMs (ChatGPT/Claude)',
      competitorFlaws: ['Hallucinates Postgres table names', 'Struggles with JSONB extraction syntax', 'Requires manual copy-pasting'],
      arcliWins: ['100% Schema accurate via RAG', 'Native JSONB and CTE support', 'Executes and charts results in one UI']
    },
    useCases: [
      { title: 'SaaS App Analytics', description: 'Query your production Postgres replica directly to understand user behavior without writing custom dashboards.' }
    ],
    faqs: [
      { q: 'Does Arcli support PostgreSQL JSONB queries?', a: 'Yes, our Text-to-SQL engine is trained to unpack and query Postgres JSONB arrays and objects efficiently.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'ai-dashboard-builder']
  },

  // Hyper-Niche: Snowflake Focus (Enterprise search intent)
  'snowflake-ai-analytics': {
    type: 'integration',
    title: 'Snowflake Text to SQL & AI Analytics | Arcli',
    description: 'Transform your Snowflake data warehouse with AI. Generate Snowflake SQL from English and build automated analytical dashboards.',
    h1: 'Natural Language AI for Snowflake',
    subtitle: 'Stop wasting warehouse compute on poorly optimized queries. Arcli generates cost-efficient, performant Snowflake SQL automatically.',
    icon: <Cloud className="w-12 h-12 text-sky-400 mb-6" />,
    features: ['Warehouse Compute Optimization', 'Columnar RAG Indexing', 'Snowflake Role-Based Access'],
    steps: [
      { name: 'Connect Warehouse', text: 'Securely link Arcli using a read-only Snowflake role.' },
      { name: 'Semantic RAG Search', text: 'We index your massive schemas without moving your underlying columnar data.' },
      { name: 'Generate & Chart', text: 'Ask questions. We generate the Snowflake-compliant SQL and visualize the returned Parquet files instantly.' }
    ],
    useCases: [
      { title: 'Executive Data Democratization', description: 'Allow C-suite to query Snowflake data lakes securely via chat, bypassing the BI queue.' }
    ],
    faqs: [
      { q: 'How do you handle massive Snowflake schemas?', a: 'We utilize semantic routing. We only pass the metadata of relevant tables to the LLM context window, preventing token limits and hallucinations.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'ai-business-intelligence']
  }
};