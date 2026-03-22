// lib/seo/file-analysis-1.tsx
import React from 'react';
import { FileSpreadsheet } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Data Transformation Blueprint" schema. 
 * Designed specifically for users hitting hardware or software limits 
 * with massive files. Focuses on WebAssembly compute, data privacy, 
 * and automated data cleansing.
 */
export type SEOPageData = {
  type: 'feature' | 'integration' | 'comparison' | 'guide' | 'template';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  processingArchitecture: {
    ingestionMethod: string;
    computeEngine: string;
    dataPrivacy: string;
  };
  transformationCapabilities: {
    schemaInference: string;
    dataCleansing: string;
    relationalMapping: string;
  };
  workflowUpgrade: {
    legacyBottleneck: string[];
    arcliAutomation: string[];
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

export const fileAnalysisPart1: Record<string, SEOPageData> = {
  'analyze-csv-with-ai': {
    type: 'guide',
    title: 'Analyze Massive CSV Files with AI | Arcli Analytics',
    description: 'Upload massive CSV files up to 2GB. Evaluate how our in-browser WebAssembly AI cleans, normalizes, and analyzes your data instantly without crashing.',
    h1: 'High-Performance AI CSV Analysis',
    subtitle: 'Bypass traditional spreadsheet limits. Drop your multi-million row CSVs into Arcli. Our vectorized engine infers the schema and builds interactive charts in milliseconds.',
    icon: <FileSpreadsheet className="w-12 h-12 text-amber-500 mb-6" />,
    features: [
      'In-Browser WebAssembly Execution (DuckDB)', 
      'Auto Schema & Data Type Detection', 
      'Handles 5M+ Row Files Instantly',
      'Zero-Retention Ephemeral Processing'
    ],
    processingArchitecture: {
      ingestionMethod: 'Direct browser-based drag-and-drop supporting highly compressed chunked processing up to 2GB payloads.',
      computeEngine: 'Executes analytical workloads locally using WebAssembly (WASM) and an embedded columnar database (DuckDB).',
      dataPrivacy: 'Strict Zero-Retention policy. Files are processed ephemerally in volatile memory and are never persistently stored on Arcli servers.'
    },
    transformationCapabilities: {
      schemaInference: 'Automatically detects file delimiters, header rows, and deeply infers column data types (Integer, Varchar, Boolean, Timestamp).',
      dataCleansing: 'Generates robust SQL to seamlessly handle null coalescing, timestamp normalization, and currency string extraction.',
      relationalMapping: 'Supports multi-file uploads, dynamically mapping common keys (e.g., `user_id`) to orchestrate complex cross-CSV JOINs.'
    },
    workflowUpgrade: {
      legacyBottleneck: [
        'Standard spreadsheet applications physically cannot open files exceeding 1.04 million rows.',
        'Analyzing 100k+ rows typically causes UI freezing during basic pivot table recalculations.',
        'Transitioning to Python/Pandas requires tedious local environment setup and package management.'
      ],
      arcliAutomation: [
        'Converts flat CSVs into highly compressed, columnar Parquet formats entirely in-memory.',
        'Bypasses UI limitations by orchestrating millions of rows via optimized, natural language-driven SQL.',
        'Generates highly interactive, shareable React-Vega dashboards instantly without writing a single line of code.'
      ]
    },
    steps: [
      { name: '1. Secure Upload', text: 'Drag files directly into the browser. Data remains local for maximum privacy and zero network latency.' },
      { name: '2. AI Normalization', text: 'The semantic engine detects and formats messy dates, broken strings, and empty cells automatically.' },
      { name: '3. Conversational Analytics', text: 'Query the massive dataset naturally (e.g., "Show me a 7-day rolling average of sales") to generate charts instantly.' }
    ],
    realExample: {
      query: "Look at this 1.5GB server log CSV. Find the top 5 IP addresses with the most 404 error codes over the last 48 hours.",
      sql: `-- Executed instantly via in-browser WebAssembly
SELECT 
  client_ip, 
  COUNT(*) as error_count
FROM read_csv_auto('server_logs_export.csv')
WHERE status_code = 404
  AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 5;`,
      output: "Ranked Data Table",
      insight: "Identified a severe anomaly: IP 192.168.1.105 triggered 14,204 errors, indicating a potential automated scraping attempt."
    },
    useCases: [
      { title: 'Marketing Log Processing', description: 'Ingest massive raw event exports from Meta or Google Ads to instantly generate blended ROAS tracking models.' },
      { title: 'Financial Ledger Aggregation', description: 'Process heavy financial transaction exports from NetSuite or SAP without the memory crashes typical of standard grid software.' }
    ],
    faqs: [
      { q: 'Is my uploaded file secure?', a: 'Yes. For standard file analysis, Arcli utilizes zero-retention ephemeral processing. Your raw CSV is processed locally within your browser\'s sandbox via WebAssembly and is never saved.' },
      { q: 'Can I export the cleaned data?', a: 'Absolutely. Once the AI has cleaned, filtered, or aggregated your dataset, you can export the refined result set as a CSV, highly-compressed Parquet file, or push it to an integrated warehouse.' },
      { q: 'Can I join two different CSV files together?', a: 'Yes. Drop multiple CSV files into the same workspace. Arcli\'s semantic engine will infer common relational keys, allowing you to execute natural language queries that require cross-file JOIN logic.' }
    ],
    relatedSlugs: ['ai-excel-analysis', 'how-to-build-dashboard-from-csv']
  }
};