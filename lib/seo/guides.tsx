import React from 'react';
import { TrendingUp, FileText, LayoutTemplate } from 'lucide-react';

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

export const howToGuides: Record<string, SEOPageData> = {
  'how-to-analyze-sales-data': {
    type: 'guide',
    title: 'How to Analyze Sales Data with AI | Arcli',
    description: 'A step-by-step guide on analyzing sales data, pipeline velocity, and rep performance using high-performance AI and natural language.',
    h1: 'How to Analyze Sales Data Without Excel',
    subtitle: 'Learn how to automatically extract win rates, pipeline velocity, and forecasting metrics using vectorized AI operations.',
    icon: <TrendingUp className="w-12 h-12 text-green-500 mb-6" />,
    features: ['Vectorized Velocity Formulas', 'Automated Win/Loss Tracking', 'Linear Algebra Forecasting Models'],
    steps: [
      { name: 'Export or Connect', text: 'Connect your CRM securely or upload a CSV export. Data is processed in-memory for zero latency.' },
      { name: 'Ask for Velocity', text: 'Type: "Calculate our pipeline velocity by sales rep for Q3." The Semantic Router instantly maps your schema.' },
      { name: 'Generate Forecast', text: 'Ask the AI to project Q4 revenue based on historical win rates and open pipeline using precision EMA calculations.' }
    ],
    useCases: [
      { title: 'Sales Operations', description: 'Automate your weekly sales forecasting models without writing complex spreadsheet macros.' }
    ],
    faqs: [
      { q: 'What metrics should I track?', a: 'Focus on Win Rate, Average Deal Size, Sales Cycle Length, and Pipeline Velocity for maximum revenue predictability.' }
    ],
    relatedSlugs: ['analyze-salesforce-data', 'sales-dashboard-template']
  },

  'how-to-build-dashboard-from-csv': {
    type: 'guide',
    title: 'How to Build a Dashboard from a CSV File | Arcli',
    description: 'Learn how to instantly turn a static CSV or Excel file into a live, interactive business dashboard using AI-driven columnar execution.',
    h1: 'Turn Any CSV into a Dashboard in 60 Seconds',
    subtitle: 'Stop messing with pivot tables. Upload your CSV and let our ephemeral compute engine generate a full reporting suite.',
    icon: <FileText className="w-12 h-12 text-blue-400 mb-6" />,
    features: ['Instant Columnar Visualization', 'Auto-Pivot via AI', 'Secure Tenant-Isolated Links'],
    steps: [
      { name: 'Upload the File', text: 'Drag and drop your CSV into the secure Arcli interface. We utilize zero-retention processing.' },
      { name: 'Let AI Inspect', text: 'Our semantic engine reads the headers, detects anomalies, and determines the optimal chart types.' },
      { name: 'Publish', text: 'Click "Generate Dashboard" and share the secure, live-updating link with your team.' }
    ],
    useCases: [
      { title: 'Ad-Hoc Reporting', description: 'Quickly visualize survey results, financial exports, or massive marketing lists effortlessly.' }
    ],
    faqs: [
      { q: 'Is there a file size limit?', a: 'You can upload CSVs up to 1GB directly in the browser, processed via highly efficient Parquet formats under the hood.' }
    ],
    relatedSlugs: ['analyze-csv-with-ai', 'ai-dashboard-builder']
  },

  'how-to-build-sql-dashboard': {
    type: 'guide',
    title: 'How to Build a SQL Dashboard Without Coding | Arcli',
    description: 'Learn how to connect your SQL database and build an automated, live-updating dashboard using context-aware AI instead of writing code.',
    h1: 'How to Build a SQL Dashboard in Minutes',
    subtitle: 'Stop writing thousands of lines of SQL to update charts. Let AI generate highly-optimized queries and build the layout for you.',
    icon: <LayoutTemplate className="w-12 h-12 text-indigo-400 mb-6" />,
    features: ['Auto-Generated Optimized SQL', 'Live Database Syncing', 'Interactive Vectorized Filtering'],
    steps: [
      { name: 'Connect Database', text: 'Add your Postgres, MySQL, or Snowflake credentials via our secure, read-only integration layer.' },
      { name: 'Ask for Metrics', text: 'Type: "Create a dashboard showing Daily Active Users, MRR, and Churn Rate." The RAG engine handles the JOINs.' },
      { name: 'Pin to Board', text: 'The AI executes the optimized SQL. Click "Pin" to add the resulting charts to your live, multi-tenant dashboard.' }
    ],
    useCases: [
      { title: 'Engineering Metrics', description: 'Quickly spin up dashboards monitoring database health, query speeds, and error logs.' }
    ],
    faqs: [
      { q: 'Can I view the underlying SQL?', a: 'Yes. You can inspect, modify, and export the exact, highly-performant SQL queries generated by the AI to ensure mathematical precision.' }
    ],
    relatedSlugs: ['postgresql-ai-analytics', 'natural-language-to-sql']
  }
};