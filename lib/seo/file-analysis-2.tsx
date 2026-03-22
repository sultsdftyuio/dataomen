// lib/seo/file-analysis-2.tsx
import React from 'react';
import { TableProperties } from 'lucide-react';

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

export const fileAnalysisPart2: Record<string, SEOPageData> = {
  'ai-excel-analysis': {
    type: 'guide',
    title: 'Analyze & Automate Excel Data with AI | Arcli',
    description: 'Transition from brittle VLOOKUPs to robust data engineering. Upload Excel workbooks and use Arcli to execute cross-sheet SQL analysis instantly.',
    h1: 'AI-Powered Excel Automation & Analysis',
    subtitle: 'Replace #REF! errors and frozen applications with robust AI data engineering. Upload .xlsx files to build flawless cross-sheet relationships and dashboards.',
    icon: <TableProperties className="w-12 h-12 text-green-600 mb-6" />,
    features: [
      'Cross-Sheet Semantic Joins', 
      'Automated Formula Generation', 
      'Bypass VBA Macros with AI',
      'Instant Pivot Charting'
    ],
    processingArchitecture: {
      ingestionMethod: 'Parses multi-tab .xlsx and .xls binaries directly, identifying individual sheets as distinct relational tables.',
      computeEngine: 'Abstracts grid-based data into a high-performance, vectorized relational database layer for immediate querying.',
      dataPrivacy: 'Operates in strict read-only analytical mode. Original workbook structures, styling, and underlying data remain permanently untouched.'
    },
    transformationCapabilities: {
      schemaInference: 'Intelligently skips title rows and formatting artifacts to identify true table headers and establish a clean relational schema.',
      dataCleansing: 'Replaces rigid cell-reference formulas with robust, declarative SQL logic that handles missing data points gracefully.',
      relationalMapping: 'Automatically evaluates distinct workbook tabs to construct a unified relational entity-relationship (ER) model.'
    },
    workflowUpgrade: {
      legacyBottleneck: [
        'Complex VLOOKUP and INDEX/MATCH cell formulas break silently if a single column is inserted or deleted by a collaborator.',
        'Workbooks containing multiple heavy tabs require significant CPU time to recalculate upon single-cell changes.',
        'Automating repetitive workflows requires maintaining Visual Basic for Applications (VBA), a highly specialized legacy language.'
      ],
      arcliAutomation: [
        'Replaces physical cell references with semantic column routing, ensuring logic never breaks when data shape changes.',
        'Executes heavy cross-sheet aggregations instantly using columnar SQL processing.',
        'Generates standalone, secure, and shareable visual dashboards completely decoupled from the messy raw workbook.'
      ]
    },
    steps: [
      { name: '1. Ingest Workbook', text: 'Upload your multi-tab .xlsx file. Arcli isolates individual sheets into distinct, high-performance tables.' },
      { name: '2. Semantic Linking', text: 'The AI maps the foreign-key relationships between your sheets automatically (e.g., linking Orders to Customers).' },
      { name: '3. Conversational Extraction', text: 'Request aggregated data natively (e.g., "Show total revenue by Customer Region") to trigger flawless SQL merges.' }
    ],
    realExample: {
      query: "Join the 'Sales_Data' sheet with the 'Employee_Directory' sheet to show total revenue generated per Department.",
      sql: `SELECT 
  e.Department,
  SUM(s.Revenue) AS Total_Department_Revenue
FROM read_excel('Q3_Report.xlsx', sheet='Sales_Data') s
JOIN read_excel('Q3_Report.xlsx', sheet='Employee_Directory') e 
  ON s.Employee_ID = e.Emp_ID
GROUP BY 1
ORDER BY 2 DESC;`,
      output: "Interactive Pie Chart & Summary Table",
      insight: "Cross-sheet JOIN executed seamlessly, revealing that Enterprise Sales generated 64% of total revenue."
    },
    useCases: [
      { title: 'HR & Headcount Planning', description: 'Safely analyze employee compensation files and demographic sheets to calculate organizational metrics without exposing individual row-level data.' },
      { title: 'Supply Chain Reconciliation', description: 'Quickly upload inventory counts and supplier manifests to instantly spot data discrepancies without authoring a single VLOOKUP.' }
    ],
    faqs: [
      { q: 'Does Arcli overwrite or modify my original Excel file?', a: 'No. Arcli operates utilizing a strict read-only extraction process. Data is temporarily loaded into our analytical engine for exploration, leaving your original .xlsx file completely untouched.' },
      { q: 'Can the AI handle workbooks with messy headers or blank spacing rows?', a: 'Yes. Our AI ingestion pipeline is specifically engineered to detect and bypass UI formatting rows, instantly identifying the actual data headers necessary to build a clean computational schema.' }
    ],
    relatedSlugs: ['analyze-csv-with-ai', 'how-to-analyze-sales-data']
  }
};