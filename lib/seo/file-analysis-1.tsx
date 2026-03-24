// lib/seo/file-analysis-1.tsx
import React from 'react';
import { FileSpreadsheet, FileJson, TableProperties, Database, Terminal, ShieldAlert } from 'lucide-react';

/**
 * SEOPageData Interface - Data Transformation Blueprint
 * Upgraded to focus on high-volume Search Intents, Emotional Pain Elimination, 
 * and explicit Tool Replacement strategies.
 */
export type SEOPageData = {
  type: 'guide';
  title: string;
  description: string;
  metaKeywords: string[];
  seoIntents: string[]; // High-volume actual search queries
  h1: string; // Aggressive, pattern-interrupt headline
  subtitle: string;
  icon: React.ReactElement;
  replaces: string[]; // Explicitly call out what we kill
  
  coreDifferentiator: {
    title: string;
    points: string[];
  };

  businessValueMetrics: {
    label: string;
    value: string;
    description: string;
  }[];

  capabilities: {
    name: string;
    benefit: string;
    executiveExplanation: string;
  }[];

  trustAndSecurity: {
    principle: string;
    howWeDeliver: string;
  }[];

  painElimination: {
    headline: string;
    before: string[];
    after: string[];
  };

  stepByStepGuide: {
    step: number;
    title: string;
    detail: string;
  }[];

  commonMistakes: string[];

  onboardingExperience: {
    phase: string;
    userAction: string;
    outcome: string;
  };

  analyticalScenarios: {
    title: string;
    complexity: 'Basic' | 'Advanced' | 'Strategic';
    businessQuestion: string;
    businessOutcome: string;
    sqlSnippet?: string;
  }[];

  faqs: { q: string; a: string }[];
  relatedSlugs: string[];
};

export const fileAnalysisPart1: Record<string, SEOPageData> = {
  'analyze-csv-with-ai': {
    type: 'guide',
    title: 'Analyze Massive CSV Files with AI | Arcli Analytics',
    description: 'Upload massive CSV files up to 2GB directly in your browser. Our AI cleans, joins, and analyzes your data instantly without freezing your computer or uploading raw data.',
    metaKeywords: ['Analyze CSV with AI', 'Massive CSV Editor', 'AI Data Cleansing', 'CSV Dashboard', 'Local Data Analysis'],
    seoIntents: [
      'how to analyze large csv files',
      'csv too big for excel',
      'open large csv without crashing',
      'open 2gb csv',
      'best csv viewer'
    ],
    h1: 'Your CSV Is Too Big for Excel. Analyze It Anyway.',
    subtitle: 'Stop fighting spreadsheet limits. Drop your multi-million row CSVs into Arcli. Our platform infers the structure and builds interactive charts in milliseconds—without moving your data to the cloud.',
    icon: <FileSpreadsheet className="w-12 h-12 text-amber-500 mb-6" />,
    replaces: [
      'Excel for large datasets',
      'Manual CSV merging and VLOOKUPs',
      'Python scripts for one-off data cleaning',
      'Expensive cloud data warehouses for simple questions'
    ],
    coreDifferentiator: {
      title: 'Nothing Leaves Your Machine',
      points: [
        'Zero cloud uploads required',
        'Powered by in-browser WebAssembly (WASM)',
        'Zero data leakage risk for sensitive records'
      ]
    },
    businessValueMetrics: [
      { 
        label: 'Processing Limit', 
        value: '10M+ Rows', 
        description: 'Analyze massive datasets that would instantly freeze or crash standard desktop spreadsheet software.' 
      },
      { 
        label: 'Time to Insight', 
        value: 'Seconds', 
        description: 'Stop wasting hours manually filtering, copying, and pasting data between multiple CSV files.' 
      },
      { 
        label: 'Data Privacy', 
        value: 'Absolute', 
        description: 'Files are processed directly in your web browser\'s memory. Your raw rows are never uploaded.' 
      }
    ],
    capabilities: [
      {
        name: 'Instant Data Recognition',
        benefit: 'Skip the formatting phase.',
        executiveExplanation: 'The platform automatically identifies messy dates, broken text strings, and empty cells. It standardizes the data behind the scenes so you can ask questions immediately.'
      },
      {
        name: 'Conversational File Merging',
        benefit: 'Combine different reports effortlessly.',
        executiveExplanation: 'Need to combine a marketing CSV with a sales CSV? Just drop them both in and ask the AI to compare them. It handles the complex merging logic automatically.'
      },
      {
        name: 'Automated Insight Generation',
        benefit: 'No pivot tables required.',
        executiveExplanation: 'Instead of clicking through complex menus to build a chart, simply type what you want to see. The AI selects the right visualization and renders it instantly.'
      }
    ],
    trustAndSecurity: [
      {
        principle: 'Local-First Execution',
        howWeDeliver: 'When you drop a file into Arcli, it stays on your computer. We use an advanced browser-based engine to crunch the numbers locally, ensuring highly sensitive data never traverses the internet.'
      },
      {
        principle: 'Ephemeral Memory State',
        howWeDeliver: 'Once you close your browser tab, your uploaded files vanish. We maintain a strict zero-retention policy for local file uploads, meaning no residual data is left behind.'
      },
      {
        principle: 'Schema-Only AI Inference',
        howWeDeliver: 'To translate your English question into a chart, we only send the column names (e.g., "Revenue", "Date") to our AI securely. Your actual financial or customer records are explicitly blocked.'
      }
    ],
    painElimination: {
      headline: 'What This Replaces: The CSV Nightmare',
      before: [
        'Opening a 2-million row export freezes your computer and completely crashes your spreadsheet application.',
        'Merging two different reports requires writing brittle VLOOKUPs that break if a single column is moved.',
        'Sharing findings means emailing massive, unsecure 50MB file attachments across the company.'
      ],
      after: [
        'You drop multi-gigabyte files into the browser and start analyzing them in 3 seconds flat.',
        'You merge datasets effortlessly by asking plain-English questions, completely eliminating manual formula errors.',
        'You share insights via secure, lightweight dashboard links while the raw data remains safely on your machine.'
      ]
    },
    stepByStepGuide: [
      { step: 1, title: 'Upload Your CSV', detail: 'Drag and drop your massive file directly into the browser window.' },
      { step: 2, title: 'Ask Your Question', detail: 'Type what you want to see in plain English, like "Group revenue by region."' },
      { step: 3, title: 'Refine Results', detail: 'Chat with the AI to filter outliers or change the chart type instantly.' },
      { step: 4, title: 'Export Insights', detail: 'Download the cleaned, summarized subset of your data to share with your team.' }
    ],
    commonMistakes: [
      'Trying to open a 500MB+ CSV in Excel and waiting 20 minutes for it to crash.',
      'Writing a custom Python script just to filter out blank rows.',
      'Uploading highly confidential customer lists to random third-party cloud formatting tools.'
    ],
    onboardingExperience: {
      phase: '1. Ingest',
      userAction: 'Drag and drop your massive CSV file directly into the browser window.',
      outcome: 'The system reads the headers, understands the context, and is ready for questions in under 3 seconds.'
    },
    analyticalScenarios: [
      {
        title: 'Single-File Aggregation',
        complexity: 'Basic',
        businessQuestion: 'Clean up this raw Salesforce export. Remove any rows with missing emails and group our total pipeline value by industry.',
        businessOutcome: 'Transforms a messy 50,000-row raw data dump into a clean, highly actionable summary table in seconds, completely bypassing the need to write complex pivot tables.',
        sqlSnippet: `SELECT industry, SUM(pipeline_value) AS total_value FROM read_csv_auto('salesforce_export.csv') WHERE email IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;`
      },
      {
        title: 'Cross-System Reconciliation',
        complexity: 'Advanced',
        businessQuestion: 'Compare our "Warehouse_Export.csv" with our "Shopify_Orders.csv". Show me items that Shopify says were sold, but are still sitting in the warehouse file.',
        businessOutcome: 'Catch inventory mistakes before they cost you money. Protects the company\'s bottom line and prevents severe customer satisfaction issues caused by out-of-sync systems.',
        sqlSnippet: `SELECT s.item_sku, s.order_date FROM read_csv_auto('shopify.csv') s LEFT JOIN read_csv_auto('warehouse.csv') w ON s.item_sku = w.sku WHERE w.status = 'In Stock' AND s.status = 'Fulfilled';`
      },
      {
        title: 'Server Log Anomaly Detection',
        complexity: 'Strategic',
        businessQuestion: 'Analyze this 1.5GB application log. Group by error code and show me the exact time the 502 Gateway errors peaked.',
        businessOutcome: 'Provides Engineering and DevOps leaders a way to instantly search and categorize massive, unstructured text files during a live incident without uploading sensitive logs to a third-party cloud.',
      }
    ],
    faqs: [
      { q: 'Is my highly confidential CSV uploaded to your servers?', a: 'No. File processing happens purely on your local machine using a secure browser sandbox. The only data that hits our AI router is the prompt you type and the column headers—never the raw rows.' },
      { q: 'What happens if my CSV file is larger than 1GB?', a: 'Because the platform runs a specialized columnar engine locally inside your browser, it can seamlessly process multi-gigabyte files that would instantly crash traditional desktop software.' },
      { q: 'Can I save the results back to a file?', a: 'Absolutely. Once you have filtered the data down to the exact insight you need, you can export the clean, summarized result set as a new CSV to share with your team.' },
      { q: 'Does it automatically detect data types?', a: 'Yes. The engine intelligently scans your uploaded files and automatically assigns the correct formats (dates, currencies, integers), saving you the hassle of manually formatting columns.' },
      { q: 'Can I join a downloaded CSV file with my live cloud database?', a: 'Yes. The platform supports hybrid queries. You can upload a static CSV target list and dynamically join it against your live Snowflake or Postgres database.' }
    ],
    relatedSlugs: ['excel-ai-analyzer', 'json-data-analysis-ai', 'how-to-build-dashboard-from-csv']
  },

  'excel-ai-analyzer': {
    type: 'guide',
    title: 'Excel AI Analyzer: Replace Brittle Formulas | Arcli',
    description: 'Stop wrestling with broken VLOOKUPs and complex macros. Upload your Excel files and use Arcli to generate robust, mathematically verified insights via conversation.',
    metaKeywords: ['Excel AI Analyzer', 'VLOOKUP Alternative', 'AI Spreadsheet', 'Excel Data Analysis', 'Automate Excel Reports'],
    seoIntents: [
      'excel vlookup alternative',
      'excel crashing large file',
      'how to merge excel files',
      'ai for excel data',
      'automate excel reporting'
    ],
    h1: 'Stop Fighting Excel. Analyze Your Data Instead.',
    subtitle: 'Transform how your team handles Excel data. Replace fragile cell references and crashing macros with robust, AI-driven conversational analytics that anyone can use.',
    icon: <TableProperties className="w-12 h-12 text-green-600 mb-6" />,
    replaces: [
      'Broken VLOOKUP and XLOOKUP chains',
      'Fragile, undocumented VBA macros',
      'Manual weekly pivot-table consolidation',
      'Copy-pasting data between tabs'
    ],
    coreDifferentiator: {
      title: 'Zero Uploads, 100% Secure',
      points: [
        'Unpacks .xlsx files directly in-browser',
        'No risk of leaking proprietary financial models',
        'Original source files remain completely untouched'
      ]
    },
    businessValueMetrics: [
      { 
        label: 'Accuracy Guarantee', 
        value: 'High', 
        description: 'Eliminates the "hidden cell error" that plagues manual spreadsheets, ensuring board-level reporting is always mathematically sound.' 
      },
      { 
        label: 'Skill Barrier', 
        value: 'Removed', 
        description: 'Empowers junior staff to perform senior-level data analysis without needing to learn complex Excel formulas or VBA scripting.' 
      },
      { 
        label: 'Report Generation', 
        value: '10x Faster', 
        description: 'Converts a multi-hour weekly Excel consolidation task into a 5-second conversational request.' 
      }
    ],
    capabilities: [
      {
        name: 'Resilient Logic Generation',
        benefit: 'Reports that never break.',
        executiveExplanation: 'Traditional spreadsheets break if someone accidentally deletes or moves a column. Our AI references explicit column names, meaning your reports work perfectly even if the file format shifts next month.'
      },
      {
        name: 'Automated Financial Modeling',
        benefit: 'Complex math, simplified.',
        executiveExplanation: 'Ask the AI to calculate year-over-year growth, trailing averages, or cohort retention. It natively authors the complex math required, replacing dozens of fragile Excel tabs.'
      },
      {
        name: 'Visual Presentation Ready',
        benefit: 'Boardroom quality instantly.',
        executiveExplanation: 'Skip the clunky Excel charting menus. The platform automatically selects the most effective visual representation for your data, rendering clean, modern charts instantly.'
      }
    ],
    trustAndSecurity: [
      {
        principle: 'Private Browser Processing',
        howWeDeliver: 'Your sensitive financial models and employee rosters never leave your machine. Excel files are unpacked and analyzed locally inside your browser\'s secure memory layer.'
      },
      {
        principle: 'Mathematical Transparency',
        howWeDeliver: 'We don’t use "black box" AI to guess numbers. The AI acts as a translator, writing deterministic SQL code that you can inspect and verify at any time.'
      },
      {
        principle: 'Format Preservation',
        howWeDeliver: 'We never alter your original file. The system reads the data, performs the requested analysis, and outputs the results independently, leaving your source of truth untouched.'
      }
    ],
    painElimination: {
      headline: 'What This Replaces: Spreadsheet Chaos',
      before: [
        'Finance teams spend days manually consolidating weekly expense reports from 15 different regional Excel files.',
        'A single mistyped formula in a hidden cell cascades through the entire workbook, corrupting executive reports.',
        'Updating a recurring monthly dashboard requires a tedious, 20-step manual copy-paste process.'
      ],
      after: [
        'You drop all 15 files in and ask "Summarize expenses by region" to consolidate the data instantly.',
        'Logic is governed by transparent, verifiable code rather than fragile, hidden cell references.',
        'Recurring reports are generated conversationally in seconds, ensuring decisions are based on the latest data.'
      ]
    },
    stepByStepGuide: [
      { step: 1, title: 'Upload Your Workbooks', detail: 'Drop one or multiple .xlsx files into your secure browser workspace.' },
      { step: 2, title: 'Ask Questions', detail: 'Use natural language to ask for comparisons, trends, or specific data points.' },
      { step: 3, title: 'Review Visuals', detail: 'Instantly view automatically generated charts that highlight key insights.' },
      { step: 4, title: 'Export Clean Data', detail: 'Download the calculated, error-free results back to a fresh Excel file.' }
    ],
    commonMistakes: [
      'Trusting undocumented macros built by someone who left the company 3 years ago.',
      'Emailing "Q3_Report_Final_v14_ACTUAL.xlsx" back and forth across the executive team.',
      'Spending hours fixing broken cell references because one column was added in the middle of a sheet.'
    ],
    onboardingExperience: {
      phase: '2. Question',
      userAction: 'Type: "Compare Q1 and Q2 marketing spend, and highlight any categories that grew by more than 20%."',
      outcome: 'The AI parses the Excel sheets, calculates the variance, and visualizes the specific outliers immediately.'
    },
    analyticalScenarios: [
      {
        title: 'Weekly Pipeline Consolidation',
        complexity: 'Basic',
        businessQuestion: 'Group our active sales pipeline by representative, and calculate the average probability of closing for each.',
        businessOutcome: 'Replaces a manual, weekly pivot-table exercise for the Sales Manager. Keeps the team aligned on realistic revenue projections without wrestling with spreadsheet formatting.',
        sqlSnippet: `SELECT rep_name, SUM(deal_value) as total_pipeline, AVG(probability_percent) as avg_likelihood FROM read_excel('pipeline.xlsx') WHERE status = 'Open' GROUP BY 1 ORDER BY 2 DESC;`
      },
      {
        title: 'Profit Margin Outlier Detection',
        complexity: 'Advanced',
        businessQuestion: 'Analyze our raw transactions file. Show me any products where the production cost increased but the retail price remained the same over the last 6 months.',
        businessOutcome: 'Automatically flags creeping margin erosion. Protects profitability by highlighting specific SKUs that require immediate repricing interventions, an insight often buried deep in massive ledgers.',
      },
      {
        title: 'HR Headcount & Compensation',
        complexity: 'Strategic',
        businessQuestion: 'Based on this employee roster, calculate the fully-loaded compensation cost per department, including a projected 4% merit increase for next year.',
        businessOutcome: 'Enables rapid, secure scenario planning for executive leadership during budget season, keeping highly sensitive salary data strictly local to the user\'s machine.',
      }
    ],
    faqs: [
      { q: 'Does this replace Microsoft Excel?', a: 'No. Excel remains the gold standard for manual data entry and bespoke grid modeling. Arcli is built to take over when you need to rapidly discover insights, merge files, or build visual dashboards from your Excel data.' },
      { q: 'Can it handle files with multiple tabs (sheets)?', a: 'Yes. When you upload an `.xlsx` file, the platform automatically detects the individual sheets and treats them as related data tables, allowing you to seamlessly query across tabs.' },
      { q: 'What happens if my columns move around next month?', a: 'Your analysis will still work. Because our system relies on semantic column names rather than rigid cell locations (like A1:B10), you can upload a newly formatted file and the AI will adapt instantly.' },
      { q: 'Is it safe to upload confidential financial files?', a: 'Yes. We utilize Local-First processing. Your file is read and analyzed directly by your browser. We never transmit or store your raw financial rows on our external servers.' }
    ],
    relatedSlugs: ['analyze-csv-with-ai', 'json-data-analysis-ai']
  },

  'json-data-analysis-ai': {
    type: 'guide',
    title: 'Analyze Complex JSON Exports with AI | Arcli',
    description: 'Stop writing custom Python scripts to parse JSON files. Upload nested application logs or API exports and let Arcli flatten and analyze them conversationally.',
    metaKeywords: ['JSON Data Analysis', 'Parse JSON AI', 'Analyze API Exports', 'Log File Analytics', 'Flatten JSON'],
    seoIntents: [
      'how to parse json file',
      'analyze json logs',
      'json to table',
      'extract data from nested json',
      'query json data'
    ],
    h1: 'Stop Writing Scripts Just to Read JSON.',
    subtitle: 'Extracting business value from nested JSON exports usually requires an engineer. Arcli automatically unwraps, flattens, and analyzes deep API payloads so business users can find answers immediately.',
    icon: <FileJson className="w-12 h-12 text-blue-500 mb-6" />,
    replaces: [
      'Custom Python parsing and flattening scripts',
      'Waiting on DevOps for simple log extraction',
      'Complex jq terminal commands',
      'Paying cloud providers per-GB to ingest raw logs'
    ],
    coreDifferentiator: {
      title: 'WASM-Powered Local Parsing',
      points: [
        'Instant JSON flattening done locally in-browser',
        'Zero cloud log ingestion fees',
        'PII embedded in logs stays entirely on your machine'
      ]
    },
    businessValueMetrics: [
      { 
        label: 'Engineering Time', 
        value: 'Saved', 
        description: 'Eliminates the need to write and maintain custom Python scripts just to extract a single metric from a JSON log.' 
      },
      { 
        label: 'Data Readiness', 
        value: 'Instant', 
        description: 'Transforms unstructured developer payloads into clean, tabular business reports in milliseconds.' 
      },
      { 
        label: 'Cross-Functional Speed', 
        value: 'Maximized', 
        description: 'Customer Success and Product teams can self-serve their own investigations into application logs without waiting for DevOps.' 
      }
    ],
    capabilities: [
      {
        name: 'Automated JSON Unnesting',
        benefit: 'Makes complex data readable.',
        executiveExplanation: 'Developer files often contain "data within data." Our engine automatically detects these nested layers and flattens them out into clear, standard columns so they can be easily queried.'
      },
      {
        name: 'Conversational Key Extraction',
        benefit: 'Find exactly what you need.',
        executiveExplanation: 'Simply ask the AI to "Find all the users who have the feature flag turned on." It dynamically searches through the JSON structure to extract that specific data point.'
      },
      {
        name: 'Seamless Blending',
        benefit: 'Connect the dots.',
        executiveExplanation: 'Upload an unstructured JSON file (like a Stripe export) and drop in a standard CSV (like your CRM data). The platform can seamlessly join the unstructured data with your clean tables.'
      }
    ],
    trustAndSecurity: [
      {
        principle: 'No Third-Party Log Ingestion',
        howWeDeliver: 'Unlike cloud logging tools that charge by the gigabyte to ingest and store your application data, Arcli processes your uploaded JSON files locally and ephemerally, completely free of ingestion fees.'
      },
      {
        principle: 'Strict PII Protection',
        howWeDeliver: 'By processing files in the browser’s local memory, sensitive customer data (PII) embedded deep within JSON payloads is never exposed to external networks.'
      },
      {
        principle: 'Deterministic Parsing',
        howWeDeliver: 'We do not use LLMs to "guess" the contents of your JSON. We use a deterministic, highly optimized local database engine to physically parse the file, ensuring 100% data fidelity.'
      }
    ],
    painElimination: {
      headline: 'What This Replaces: The Engineering Bottleneck',
      before: [
        'Customer Support receives an error log from a user, but it’s in JSON format and completely unreadable to them.',
        'Product managers must wait for a developer to write a script to extract feature usage statistics from a raw API dump.',
        'Combining webhook payloads with marketing data takes days of manual data wrangling and formatting.'
      ],
      after: [
        'Support drops the JSON file in and asks "What error code did this user hit?", getting an answer instantly.',
        'Product managers self-serve their own usage metrics, accelerating feature iteration and roadmap planning.',
        'Disparate file formats (JSON, Excel, CSV) are joined effortlessly via plain English commands.'
      ]
    },
    stepByStepGuide: [
      { step: 1, title: 'Upload Payload', detail: 'Drop your .json or .ndjson export into the interface.' },
      { step: 2, title: 'Extract Keys', detail: 'Ask the AI to extract specific nested data points (e.g., "Pull out the billing address object").' },
      { step: 3, title: 'Flatten Structure', detail: 'The engine automatically unwraps nested arrays into a clean, flat table.' },
      { step: 4, title: 'Export as CSV', detail: 'Download the now-readable, tabular dataset for further analysis.' }
    ],
    commonMistakes: [
      'Writing a one-off Python script just to pull a single metric out of a log file.',
      'Paying massive cloud ingestion fees to third-party tools just to read an API dump.',
      'Manually trying to unnest complex JSON data inside VS Code or Notepad++.'
    ],
    onboardingExperience: {
      phase: '3. Act',
      userAction: 'Review the generated visual chart tracking the specific JSON event parameters over time.',
      outcome: 'A completely unstructured data dump is transformed into a boardroom-ready presentation in seconds.'
    },
    analyticalScenarios: [
      {
        title: 'Stripe Webhook Analysis',
        complexity: 'Basic',
        businessQuestion: 'Extract the "amount" and "currency" from this Stripe JSON export, and show me the total revenue grouped by the "customer_email".',
        businessOutcome: 'Allows finance and operations teams to quickly audit and summarize raw payment gateway exports without needing a developer to build a specialized integration first.',
        sqlSnippet: `SELECT json_extract_string(payload, '$.data.object.customer_email') as email, SUM(CAST(json_extract_string(payload, '$.data.object.amount') AS INTEGER))/100 as total_revenue FROM read_json_auto('stripe_events.json') GROUP BY 1 ORDER BY 2 DESC;`
      },
      {
        title: 'Application Error Triage',
        complexity: 'Advanced',
        businessQuestion: 'Analyze this server log. Extract the "device_os" and the "latency_ms" from the nested metadata. Show me the average latency for iOS users versus Android users.',
        businessOutcome: 'Provides product leadership with immediate visibility into technical degradation. Proves whether a recent performance issue is isolated to a specific operating system, accelerating the engineering fix.',
      },
      {
        title: 'Feature Flag Telemetry',
        complexity: 'Strategic',
        businessQuestion: 'Cross-reference this JSON log of active feature flags with our primary CRM export. Show me the total pipeline value of all customers currently testing the new Beta feature.',
        businessOutcome: 'Bridges the gap between raw engineering telemetry and bottom-line business value. Proves the financial impact of a new product release instantly.',
      }
    ],
    faqs: [
      { q: 'What kind of JSON files can I upload?', a: 'You can upload NDJSON (Newline Delimited JSON), standard JSON arrays, or deeply nested JSON objects. The engine will automatically detect the structure and unpack it.' },
      { q: 'Do I need to know how to write JSON paths?', a: 'No. You simply ask for the data in plain English (e.g., "Extract the user\'s location"). The AI translates your request into the exact JSON-path syntax required to pull the data.' },
      { q: 'Is it safe to upload logs containing customer data?', a: 'Yes. Because the file is processed locally within your web browser using WebAssembly, the raw logs are never uploaded to our servers or exposed to the internet.' },
      { q: 'Can I combine JSON data with standard Excel files?', a: 'Yes. You can upload a JSON file and an Excel file into the same workspace. The AI will seamlessly map the keys and allow you to query across both file types conversationally.' }
    ],
    relatedSlugs: ['analyze-csv-with-ai', 'excel-ai-analyzer']
  }
};