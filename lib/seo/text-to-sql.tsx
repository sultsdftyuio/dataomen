import React from 'react';
import { Database, Zap } from 'lucide-react';

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
      { q: 'Will the AI accidentally delete my data?', a: 'No. Arcli strictly enforces read-only analytical connections. Our security-by-design architecture prevents any DROP or DELETE operations.' }
    ],
    relatedSlugs: ['text-to-sql', 'postgresql-ai-analytics']
  },

  'text-to-sql': {
    type: 'guide',
    title: 'Text to SQL AI Platform | Arcli',
    description: 'Transform text to SQL automatically. Connect your warehouse to Arcli and generate complex JOINs and window functions via vectorized AI.',
    h1: 'The Most Accurate Text-to-SQL AI',
    subtitle: 'Stop wrestling with complex SQL syntax. Generate enterprise-grade queries just by describing your analytical needs.',
    icon: <Zap className="w-12 h-12 text-yellow-500 mb-6" />,
    features: ['Self-Correcting Query Engine', 'Step-by-Step Logic Explanation', 'Vectorized Performance Optimization'],
    steps: [
      { name: 'Describe Logic', text: 'e.g., "Calculate a 7-day moving average of revenue by region." Arcli handles the window functions.' },
      { name: 'Review Logic', text: 'The engine explains the generated SQL in plain English so you can verify the mathematical precision.' },
      { name: 'Visualize Results', text: 'Instantly transform the output into DuckDB-powered interactive charts or export to Parquet.' }
    ],
    useCases: [
      { title: 'Rapid Hypotheses Testing', description: 'Instantly generate complex analytical JOINs to test data hypotheses on the fly without writing code.' }
    ],
    faqs: [
      { q: 'How is this different from generic LLMs?', a: 'Generic LLMs often hallucinate table names. Arcli uses Semantic Governance and RAG to ensure 100% schema accuracy.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'chat-with-database']
  }
};