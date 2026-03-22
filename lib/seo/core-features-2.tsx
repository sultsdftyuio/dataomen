// lib/seo/core-features-2.tsx
import React from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';

/**
 * CoreFeatures Schema - V2 "Business Outcome" Edition
 * This schema is specifically designed to hit 500+ lines of high-authority 
 * content while remaining accessible to non-technical executive buyers.
 */
export type SEOPageData = {
  type: 'feature';
  title: string;
  description: string;
  metaKeywords: string[];
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  businessValueMetrics: {
    label: string;
    value: string;
    description: string;
  }[];
  capabilities: {
    name: string;
    benefit: string;
    nonTechExplanation: string;
  }[];
  technicalGuardrails: {
    concern: string;
    arcliSolution: string;
  }[];
  onboardingExperience: {
    phase: string;
    userAction: string;
    aiResponse: string;
  }[];
  analyticalScenarios: {
    title: string;
    complexity: 'Basic' | 'Advanced' | 'Strategic';
    prompt: string;
    logicApplied: string;
    resultInsight: string;
    sqlSnippet?: string;
  }[];
  faqs: { q: string; a: string }[];
  relatedSlugs: string[];
};

export const coreFeaturesPart2: Record<string, SEOPageData> = {
  'ai-narrative-insights': {
    type: 'feature',
    title: 'Automated AI Narrative Reporting & Summaries | Arcli',
    description: 'Transform complex data charts into written executive summaries. Arcli uses generative AI to "read" your data and write the story behind the numbers.',
    metaKeywords: ['AI Reporting', 'Data Storytelling', 'Automated Summaries', 'Executive Narrative', 'Root Cause Analysis AI'],
    h1: 'The Story Behind Your Data',
    subtitle: 'Stop staring at complex charts wondering what changed. Arcli translates your metrics into plain-English executive summaries that anyone can understand.',
    icon: <FileText className="w-12 h-12 text-emerald-500 mb-6" />,
    businessValueMetrics: [
      { label: 'Reporting Overhead', value: '-80%', description: 'Reduces the time managers spend writing "Weekly Updates" from hours to seconds.' },
      { label: 'Data Literacy', value: 'High', description: 'Ensures even non-analytical team members understand exactly why a metric moved.' },
      { label: 'Actionable Insights', value: 'Direct', description: 'Move from "What happened?" to "What should we do?" instantly.' }
    ],
    capabilities: [
      { 
        name: 'Automated Written Summaries', 
        benefit: 'Clear communication.', 
        nonTechExplanation: 'Arcli looks at a chart and writes a paragraph explaining the most important takeaways.' 
      },
      { 
        name: 'Contextual Root Cause', 
        benefit: 'Solving problems faster.', 
        nonTechExplanation: 'If revenue is down, Arcli analyzes the data to tell you exactly which region or product caused the dip.' 
      },
      { 
        name: 'Cross-Department Translation', 
        benefit: 'Alignment.', 
        nonTechExplanation: 'Arcli can rewrite the same data insight for a technical engineer or a non-technical CEO.' 
      }
    ],
    technicalGuardrails: [
      { concern: 'Can I trust the written summary?', arcliSolution: 'Our "Source-Link" feature ensures every sentence in a narrative is hyperlinked to the specific data point that supports it.' },
      { concern: 'Will it miss small details?', arcliSolution: 'The Narrative engine is programmatically tuned to look for statistical significance. It focuses on the moves that actually matter to your business.' }
    ],
    onboardingExperience: [
      { phase: 'Analyze', userAction: 'Open a dashboard or query result.', aiResponse: 'The "Write Summary" button appears.' },
      { phase: 'Draft', userAction: 'Click "Summarize".', aiResponse: 'Arcli drafts a 3-bullet executive brief based on the chart trends.' },
      { phase: 'Publish', userAction: 'Share to Slack.', aiResponse: 'Your team gets the chart AND the explanation in one message.' }
    ],
    analyticalScenarios: [
      {
        title: 'Weekly Board Briefing',
        complexity: 'Strategic',
        prompt: 'Summarize our performance this week and highlight the top 3 drivers of growth.',
        logicApplied: 'Analyzes multiple KPI trends and performs a contribution analysis across segments.',
        resultInsight: 'Wrote a summary highlighting that "Referral Traffic" was the primary driver, allowing the team to double down on that channel.',
      }
    ],
    faqs: [
      { q: 'Can I change the tone of the summaries?', a: 'Yes. You can instruct Arcli to be "Direct and Technical" or "High-Level and Strategic" depending on who you are sharing with.' },
      { q: 'Does it support multiple languages?', a: 'Yes. Arcli can summarize your data in over 20 languages, making it perfect for global teams.' }
    ],
    relatedSlugs: ['ai-data-analysis', 'ai-business-intelligence']
  },

  'ai-excel-analysis': {
    type: 'feature',
    title: 'AI Spreadsheet Analysis & Massive Scale | Arcli',
    description: 'Break through the limits of traditional spreadsheets. Use Arcli to analyze, join, and clean millions of rows of Excel and CSV data via chat.',
    metaKeywords: ['AI Excel Analysis', 'Analyze CSV with AI', 'Excel Alternative', 'Big Data Spreadsheet', 'CSV Joiner AI'],
    h1: 'Spreadsheet Intelligence, Reimagined',
    subtitle: 'Upload your largest Excel or CSV files and analyze them without the lag. No VLOOKUPs, no broken macros—just conversation.',
    icon: <FileSpreadsheet className="w-12 h-12 text-green-600 mb-6" />,
    businessValueMetrics: [
      { label: 'Data Processing Limit', value: '10M+ Rows', description: 'Analyze datasets that would crash or freeze standard spreadsheet software.' },
      { label: 'Logical Accuracy', value: 'High', description: 'Replaces brittle, easily-broken cell formulas with robust, traceable SQL logic.' },
      { label: 'Privacy & Security', value: 'Local-First', description: 'Data is processed in your browser memory using WebAssembly; it never lives on our servers.' }
    ],
    capabilities: [
      { 
        name: 'Conversational File Joins', 
        benefit: 'Connect disparate data.', 
        nonTechExplanation: 'Want to compare your "Marketing Spend" file with your "Internal Sales" CSV? Just tell Arcli to "Join them by Email" and it’s done.' 
      },
      { 
        name: 'High-Performance WASM Engine', 
        benefit: 'Speed at Scale.', 
        nonTechExplanation: 'We use a specialized data engine (DuckDB) that runs directly in your browser, making 5-million-row files feel instant.' 
      },
      { 
        name: 'Automated Data Cleansing', 
        benefit: 'Better data quality.', 
        nonTechExplanation: 'Arcli automatically identifies duplicates, fixes broken zip codes, and standardizes date formats without manual editing.' 
      }
    ],
    technicalGuardrails: [
      { concern: 'Is my confidential file uploaded to a server?', arcliSolution: 'We prioritize "Local Compute." Your files are processed using WebAssembly (WASM) on your own machine. We don\'t store your raw row data unless you explicitly save it to a workspace.' },
      { concern: 'Will shifting columns break my reports?', arcliSolution: 'No. Unlike Excel, Arcli looks at "Column Names," not "Cell Locations." If you add a new column in the middle of your file, your analysis stays perfect.' }
    ],
    onboardingExperience: [
      { phase: 'Ingest', userAction: 'Drag and drop 3 separate CSV files.', aiResponse: 'Arcli indexes all files and shows you a combined relational map.' },
      { phase: 'Cross-Query', userAction: 'Type: "Which customers appear in all 3 files?"', aiResponse: 'The system performs a 3-way inner join and returns the list.' },
      { phase: 'Export', userAction: 'Click "Download Cleaned File".', aiResponse: 'Your data is returned to you in a perfectly formatted, filtered CSV.' }
    ],
    analyticalScenarios: [
      {
        title: 'Enterprise Inventory Reconciliation',
        complexity: 'Advanced',
        prompt: 'Compare our "Warehouse_Export.csv" with our "Shopify_Orders.csv" and show me items that were sold but are still in the warehouse.',
        logicApplied: 'Performs a complex "Left-Anti-Join" between two large disparate datasets.',
        resultInsight: 'Identified $14,000 worth of missing inventory that had been mislabeled in the warehouse system.',
      },
      {
        title: 'Massive Log Analysis',
        complexity: 'Strategic',
        prompt: 'Analyze this 2GB server log. Group by error type and show me the peak times for the "Timeout" error.',
        logicApplied: 'Uses DuckDB to scan a multi-gigabyte file without loading it into system memory, grouping by time buckets.',
        resultInsight: 'Isolated a recurring infrastructure spike at 3:00 AM every Tuesday.',
      }
    ],
    faqs: [
      { q: 'Does this replace Excel entirely?', a: 'Excel is great for data entry. Arcli is for "Data Discovery." Use Excel to collect your numbers, then upload them to Arcli to actually find the insights hidden inside them.' },
      { q: 'What file formats do you support?', a: 'We support .csv, .xlsx, .parquet, and .json files of almost any size.' }
    ],
    relatedSlugs: ['ai-data-analysis', 'analyze-csv-with-ai', 'how-to-build-dashboard-from-csv']
  }
};