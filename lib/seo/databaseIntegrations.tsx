import React from 'react';
import { Database, Server } from 'lucide-react';

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

export const databaseIntegrations: Record<string, SEOPageData> = {
  'postgresql-ai-analytics': {
    type: 'integration',
    title: 'PostgreSQL AI Analytics & Reporting | Arcli',
    description: 'Connect your PostgreSQL database to unlock AI-driven insights, natural language querying, and instant visualizations.',
    h1: 'Supercharge PostgreSQL with AI Analytics',
    subtitle: 'Securely connect your Postgres instance and let your team query terabytes of data using plain English.',
    icon: <Database className="w-12 h-12 text-indigo-500 mb-6" />,
    features: ['Direct Secure Connection', 'Vectorized Execution', 'Role-Based Access Control'],
    steps: [
      { name: 'Whitelist IP', text: 'Whitelist our secure, static IP addresses in your firewall.' },
      { name: 'Provide Read-Only URL', text: 'Connect using a standard postgres:// connection string.' },
      { name: 'Query Data', text: 'Start using Natural Language to SQL immediately.' }
    ],
    useCases: [
      { title: 'Production Analytics', description: 'Query read-replicas of your production Postgres DB without impacting app performance.' }
    ],
    faqs: [
      { q: 'Do you support self-hosted Postgres?', a: 'Yes, as long as the database is accessible via a secure connection string or IP allowlist.' }
    ],
    relatedSlugs: ['snowflake-ai-analytics', 'mysql-ai-analytics']
  },

  'mysql-ai-analytics': {
    type: 'integration',
    title: 'MySQL AI Analytics & Dashboard | Arcli',
    description: 'Connect your MySQL database to Arcli. Generate instant dashboards and run natural language queries on your relational data.',
    h1: 'AI Analytics for MySQL Databases',
    subtitle: 'Give your team read-only, conversational access to your MySQL database without compromising security.',
    icon: <Database className="w-12 h-12 text-blue-400 mb-6" />,
    features: ['Direct Secure Connection', 'Optimized Query Generation', 'Zero Data Movement'],
    steps: [
      { name: 'Provide Credentials', text: 'Connect using a standard mysql:// read-only string.' },
      { name: 'Schema Sync', text: 'Our Semantic Router indexes your tables and foreign keys.' },
      { name: 'Start Querying', text: 'Type questions in English to generate real-time charts.' }
    ],
    useCases: [
      { title: 'Application Analytics', description: 'Analyze live user behavior and feature adoption directly from your production DB.' }
    ],
    faqs: [
      { q: 'Is this safe for production?', a: 'We strongly recommend connecting to a read-replica database to ensure zero performance impact on your live app.' }
    ],
    relatedSlugs: ['postgresql-ai-analytics', 'natural-language-to-sql']
  },

  'snowflake-ai-analytics': {
    type: 'integration',
    title: 'Snowflake AI Analytics Integration | Arcli',
    description: 'Deploy AI directly on top of your Snowflake data warehouse. Maximize your cloud compute with intelligent SQL generation.',
    h1: 'AI Analytics Native to Snowflake',
    subtitle: 'Leverage the power of your Snowflake warehouse with AI that writes hyper-optimized, push-down queries.',
    icon: <Server className="w-12 h-12 text-sky-500 mb-6" />,
    features: ['Push-Down Compute', 'Cost-Aware Querying', 'Native Snowflake Security'],
    steps: [
      { name: 'Create Role', text: 'Create a dedicated Arcli read-only role in Snowflake.' },
      { name: 'Connect Warehouse', text: 'Input your Account ID, Warehouse, and Database parameters.' },
      { name: 'Analyze at Scale', text: 'Let Arcli write the SQL while Snowflake handles the heavy compute lifting.' }
    ],
    useCases: [
      { title: 'Enterprise Data Lakes', description: 'Make petabytes of Snowflake data accessible to non-technical users.' }
    ],
    faqs: [
      { q: 'Does Arcli pull data out of Snowflake?', a: 'No. The heavy compute is pushed down into your Snowflake instance. We only retrieve the aggregated result sets.' }
    ],
    relatedSlugs: ['postgresql-ai-analytics', 'bigquery-ai-analytics']
  },

  'bigquery-ai-analytics': {
    type: 'integration',
    title: 'Google BigQuery AI Analytics | Arcli',
    description: 'Connect Arcli to Google BigQuery. Run AI-generated analytics on petabytes of data with zero data movement.',
    h1: 'Native AI for Google BigQuery',
    subtitle: 'Harness the massive compute power of BigQuery with an intuitive, conversational AI interface.',
    icon: <Server className="w-12 h-12 text-blue-600 mb-6" />,
    features: ['Push-Down Compute', 'GCP IAM Integration', 'Cost Control Guardrails'],
    steps: [
      { name: 'Authenticate', text: 'Connect securely using a Google Cloud Service Account.' },
      { name: 'Map Datasets', text: 'Select which BigQuery datasets you want to expose to the AI.' },
      { name: 'Query at Scale', text: 'Arcli writes the optimized SQL and pushes the heavy lifting to Google.' }
    ],
    useCases: [
      { title: 'Log Analysis', description: 'Parse through millions of server logs or event streams instantly using plain English.' }
    ],
    faqs: [
      { q: 'Will this cause my GCP bill to spike?', a: 'Arcli writes highly optimized SQL and supports query cost-estimation guardrails to prevent expensive accidental scans.' }
    ],
    relatedSlugs: ['snowflake-ai-analytics', 'google-analytics-ai-dashboard']
  }
};