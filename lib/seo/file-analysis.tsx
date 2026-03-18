import React from 'react';
import { FileSpreadsheet, TableProperties } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Search-Intent Machine" schema to capture high-intent users
 * frustrated by the limitations of traditional spreadsheet software.
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
  realExample?: {
    query: string;
    sql: string;
    output: string;
    insight: string;
  };
  painPoints?: {
    title: string;
    points: string[];
    solution: string;
  };
  useCases: { title: string; description: string }[];
  faqs: { q: string; a: string }[];
  comparison?: { 
    competitor: string; 
    arcliWins: string[]; 
    competitorFlaws: string[]; 
  };
  relatedSlugs: string[];
};

export const fileAnalysis: Record<string, SEOPageData> = {
  'analyze-csv-with-ai': {
    type: 'guide',
    title: 'Analyze Massive CSV Files with AI | Arcli Analytics',
    description: 'Upload massive CSV files up to 2GB and let our in-browser WebAssembly AI clean, normalize, and analyze your data instantly without crashing.',
    h1: 'Analyze Any CSV with AI Instantly',
    subtitle: 'Stop crashing your computer with massive data exports. Drop your multi-million row CSVs here. Our vectorized engine cleans the data, infers the schema, and builds interactive charts in milliseconds.',
    icon: <FileSpreadsheet className="w-12 h-12 text-amber-500 mb-6" />,
    features: [
      'In-Browser WebAssembly Execution (DuckDB)', 
      'Auto Schema & Data Type Detection', 
      'Handles 5M+ Row Files Instantly',
      'Zero-Retention Ephemeral Processing'
    ],
    painPoints: {
      title: 'Why Spreadsheets Fail at CSV Analysis',
      points: [
        'Excel and Google Sheets physically cannot open files larger than 1.04 million rows.',
        'Even at 100k rows, basic filtering and pivot tables cause the application to freeze or crash.',
        'Formatting dates and extracting text from messy string columns requires complex, brittle formulas.'
      ],
      solution: 'Arcli bypasses the spreadsheet UI entirely. We convert your CSV into a highly compressed, columnar Parquet format in-memory. You simply ask questions in English, and our AI writes optimized SQL to query millions of rows instantly via DuckDB.'
    },
    steps: [
      { name: '1. Drag and Drop', text: 'Upload files up to 2GB directly into your browser. Data is processed locally for maximum privacy and zero upload latency.' },
      { name: '2. AI Normalization', text: 'Our semantic engine automatically detects and normalizes messy dates, broken currency strings, and null values.' },
      { name: '3. Conversational Analysis', text: 'Ask complex analytical questions (e.g., "Show me a 7-day rolling average of sales") and get instantly visualized answers.' }
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
      insight: "IP 192.168.1.105 triggered 14,204 errors, indicating a potential bot scraping attempt on deprecated API endpoints."
    },
    comparison: {
      competitor: 'Python/Pandas (Jupyter Notebooks)',
      competitorFlaws: [
        'Requires writing boilerplate code just to load and clean a basic CSV.',
        'Setting up local environments and managing package dependencies is tedious.',
        'Sharing an interactive chart with a non-technical stakeholder is difficult.'
      ],
      arcliWins: [
        'Zero code required: Clean, join, and analyze using natural language.',
        'Operates entirely in the browser with zero local setup.',
        'Instantly publish and share secure dashboard links.'
      ]
    },
    useCases: [
      { title: 'Marketing Log Processing', description: 'Take massive raw event logs from Facebook or Google Ads and instantly generate blended ROAS tracking dashboards.' },
      { title: 'Financial Ledger Analysis', description: 'Process heavy financial exports from NetSuite or QuickBooks without the lag and freezing typical of traditional software.' }
    ],
    faqs: [
      { q: 'Is my uploaded file secure?', a: 'Yes. For standard file analysis, we utilize zero-retention ephemeral processing. Your raw CSV is processed entirely client-side using WebAssembly and is never stored persistently on our servers.' },
      { q: 'Can I export the cleaned data?', a: 'Absolutely. Once the AI has cleaned, filtered, or aggregated your data, you can export the exact result set back to CSV, highly-compressed Parquet, or push it directly to your connected data warehouse.' },
      { q: 'Can I join two different CSV files together?', a: 'Yes! Drop multiple CSV files into the same Arcli workspace. Our AI will infer the common keys (like User ID or Email) and allow you to ask questions that require cross-file JOINs.' }
    ],
    relatedSlugs: ['ai-excel-analysis', 'how-to-build-dashboard-from-csv']
  },

  'ai-excel-analysis': {
    type: 'guide',
    title: 'Analyze & Automate Excel Data with AI | Arcli',
    description: 'Stop fighting with broken VLOOKUPs and VBA macros. Upload your Excel files and use Arcli to analyze cross-sheet data and build automated dashboards.',
    h1: 'AI-Powered Excel Analysis',
    subtitle: 'Say goodbye to `#REF!` errors and frozen spreadsheets. Upload your .xlsx files and let our semantic AI build flawless cross-sheet relationships, complex formulas, and beautiful dashboards instantly.',
    icon: <TableProperties className="w-12 h-12 text-green-600 mb-6" />,
    features: [
      'Cross-Sheet Semantic Joins', 
      'Automated Formula Generation', 
      'Bypass VBA Macros with AI',
      'Instant Pivot Charting'
    ],
    painPoints: {
      title: 'The Hidden Cost of Excel Workbooks',
      points: [
        'Complex VLOOKUPs and INDEX/MATCH formulas break silently when someone inserts a new column.',
        'Heavy workbooks with multiple tabs take minutes to calculate every time a cell changes.',
        'Writing and maintaining VBA macros requires specialized, legacy knowledge.'
      ],
      solution: 'Arcli replaces brittle cell-reference logic with robust data engineering principles. We extract your sheets into relational tables. You ask questions in English, and we use precise, indestructible SQL to merge and analyze the data.'
    },
    steps: [
      { name: '1. Upload Workbook', text: 'Upload your multi-tab .xlsx file. Arcli instantly recognizes separate sheets as distinct, queryable tables.' },
      { name: '2. Semantic Mapping', text: 'The AI maps relationships between your sheets automatically (e.g., linking the "Orders" sheet to the "Customers" sheet).' },
      { name: '3. Conversational Pivots', text: 'Ask "Show me total revenue by Customer Region" and Arcli performs the complex JOINs and aggregations flawlessly.' }
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
      insight: "The Enterprise Sales department generated 64% of total revenue despite only accounting for 12% of the workforce."
    },
    comparison: {
      competitor: 'Excel Copilot / Native AI',
      competitorFlaws: [
        'Still bound by the underlying physical limitations of the Excel grid.',
        'Struggles with massive datasets spanning millions of rows.',
        'Generates brittle formulas that still break if the data structure changes.'
      ],
      arcliWins: [
        'Abstracts data into a high-performance database layer (DuckDB) for limitless scale.',
        'SQL-backed generation guarantees mathematical precision and auditability.',
        'Creates standalone, shareable dashboards decoupled from the messy raw data.'
      ]
    },
    useCases: [
      { title: 'HR & Headcount Planning', description: 'Safely analyze employee compensation files and demographic sheets to calculate gender pay gaps or department budgets without exposing individual rows.' },
      { title: 'Supply Chain Reconciliation', description: 'Quickly upload inventory counts and supplier manifests to instantly spot discrepancies without writing a single VLOOKUP.' }
    ],
    faqs: [
      { q: 'Does Arcli modify my original Excel file?', a: 'No. Arcli operates in a strict read-only analytical mode. We extract the data for analysis, leaving your original file completely untouched.' },
      { q: 'Can it handle files with messy headers or blank rows?', a: 'Yes. Our AI ingestion pipeline is designed to detect and skip formatting rows, instantly identifying the actual data headers to build a clean schema.' }
    ],
    relatedSlugs: ['analyze-csv-with-ai', 'how-to-analyze-sales-data']
  }
};