import React from 'react';
import { Database, Zap } from 'lucide-react';

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
    dataOmenWins: string[]; 
    competitorFlaws: string[]; 
  };
  relatedSlugs: string[];
};

export const textToSqlFeatures: Record<string, SEOPageData> = {
  'natural-language-to-sql': {
    type: 'feature',
    title: 'Natural Language to SQL Generator | DataOmen',
    description: 'Use our Text-to-SQL AI to chat with your database in plain English and generate optimized SQL instantly.',
    h1: 'Chat With Your Database Using Natural Language',
    subtitle: 'Type what you want to know in plain English. We write the SQL, execute it safely, and visualize the results.',
    icon: <Database className="w-12 h-12 text-emerald-500 mb-6" />,
    features: ['Context-Aware Generation', 'Multi-Dialect Support', 'Read-Only Execution'],
    steps: [
      { name: 'Index Schema', text: 'We securely scan your database schema and metadata without touching row-level data.' },
      { name: 'Semantic Routing', text: 'When you ask a question, we inject only the relevant schema fragments into the LLM.' },
      { name: 'SQL Execution', text: 'The AI generates Postgres/Snowflake dialect SQL and runs it via read-only credentials.' }
    ],
    useCases: [
      { title: 'Ad-Hoc Querying', description: 'Allow PMs and Sales leads to query user data without bothering data engineers.' }
    ],
    faqs: [
      { q: 'Will the AI accidentally delete my data?', a: 'No. DataOmen strictly enforces read-only connections. We literally cannot execute DROP or DELETE.' }
    ],
    relatedSlugs: ['text-to-sql', 'postgresql-ai-analytics']
  },

  'text-to-sql': {
    type: 'guide',
    title: 'Text to SQL AI Platform | DataOmen',
    description: 'Transform text to SQL automatically. Connect your warehouse and generate complex JOINs, aggregations, and window functions via AI.',
    h1: 'The Most Accurate Text-to-SQL AI',
    subtitle: 'Stop wrestling with complex SQL syntax. Generate enterprise-grade queries just by describing what you need.',
    icon: <Zap className="w-12 h-12 text-yellow-500 mb-6" />,
    features: ['Self-Correcting Queries', 'Query Explanation', '1-Click Export'],
    steps: [
      { name: 'Type your Request', text: 'e.g., "Show me the top 10 users by MRR who churned last month."' },
      { name: 'Review SQL', text: 'The engine shows you the generated SQL so you can verify the logic.' },
      { name: 'Visualize', text: 'Instantly convert the output table into a Bar, Line, or Scatter chart.' }
    ],
    useCases: [
      { title: 'Rapid Prototyping', description: 'Instantly generate complex JOINs to test data hypotheses on the fly.' }
    ],
    faqs: [
      { q: 'How is this different from ChatGPT?', a: 'General LLMs hallucinate table names. We use Contextual RAG to ensure absolute schema accuracy.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'chat-with-database']
  }
};